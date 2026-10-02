import { DurableObject } from 'cloudflare:workers'
import { AVATARS, isAvatarId, type AvatarId } from '../../../shared/avatars'
import {
  DEFAULT_GAME_ID,
  getGameOption,
  getPlayerRange,
  getWerewolfRoleCounts,
  isGameId,
  isWerewolfRoleId,
  isWerewolfSettings,
  ROOM_CAPACITY,
  type WerewolfRoleId,
} from '../../../shared/games'
import {
  isRecord,
  type RoomSnapshot,
  type ServerMessage,
} from '../../../shared/protocol'
import type { Env } from '../env'
import { getGameModule } from '../games/registry'
import {
  hashSessionToken,
  parseBetaCodes,
  readWebSocketBetaToken,
  verifyBetaSessionToken,
} from '../security'
import type { LegacyStoredRoom, PreviousStoredRoom, StoredPlayer, StoredRoom } from './types'

const ROOM_STORAGE_KEY = 'room'
const ROOM_IDLE_TTL_MS = 6 * 60 * 60 * 1000
const MAX_MESSAGE_LENGTH = 2_048
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/

interface SocketAttachment {
  playerId: string | null
  betaToken: string
}

type VersionedStoredRoom = Omit<StoredRoom, 'schemaVersion' | 'gameSelectionConfirmed'> & {
  schemaVersion: number
  gameSelectionConfirmed?: boolean
}

export class GameRoom extends DurableObject<Env> {
  private room: StoredRoom | null = null
  private readonly initialized: Promise<void>
  private readonly devRoleSelectionEnabled: boolean
  private readonly betaCodes: string | undefined
  private readonly betaSessionSecret: string | undefined

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.devRoleSelectionEnabled = env.ENABLE_DEV_ROLE_SELECTION === 'true'
    this.betaCodes = env.BETA_CODES
    this.betaSessionSecret = env.BETA_SESSION_SECRET?.trim()
    this.initialized = this.ctx.blockConcurrencyWhile(async () => {
      const storedRoom = await this.ctx.storage.get<
        VersionedStoredRoom | LegacyStoredRoom
      >(ROOM_STORAGE_KEY)
      if (!storedRoom) {
        return
      }

      if ('schemaVersion' in storedRoom) {
        if (storedRoom.schemaVersion === 3) {
          if (typeof storedRoom.gameSelectionConfirmed !== 'boolean') {
            throw new Error('Stored room is missing game selection confirmation state.')
          }
          this.room = {
            ...storedRoom,
            schemaVersion: 3,
            gameSelectionConfirmed: storedRoom.gameSelectionConfirmed,
          }
          return
        }
        if (storedRoom.schemaVersion === 2) {
          const previousRoom: PreviousStoredRoom = { ...storedRoom, schemaVersion: 2 }
          this.room = migratePreviousRoom(previousRoom)
          await this.ctx.storage.put(ROOM_STORAGE_KEY, this.room)
          return
        }
        throw new Error(`Unsupported room storage schema: ${storedRoom.schemaVersion}`)
      }

      this.room = migrateLegacyRoom(storedRoom)
      await this.ctx.storage.put(ROOM_STORAGE_KEY, this.room)
    })
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialized
    const { pathname } = new URL(request.url)

    if (pathname === '/internal/create' && request.method === 'POST') {
      return this.createRoom(request)
    }

    if (pathname === '/internal/join' && request.method === 'POST') {
      return this.joinRoom(request)
    }

    if (pathname.endsWith('/ws') && request.method === 'GET') {
      return this.openWebSocket(request)
    }

    return new Response('Not found', { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.initialized
    const attachment = this.readAttachment(ws)
    if (!attachment) {
      ws.close(1011, 'Invalid connection state')
      return
    }

    const betaSessionExpiresAt = await verifyBetaSessionToken(
      attachment.betaToken,
      this.betaSessionSecret,
      parseBetaCodes(this.betaCodes),
    )
    if (!betaSessionExpiresAt) {
      this.send(ws, {
        type: 'auth_error',
        code: 'BETA_ACCESS_REQUIRED',
        message: '封測驗證已失效，請重新輸入封測碼。',
      })
      ws.close(4401, 'Beta access expired')
      return
    }

    if (!this.room) {
      this.send(ws, { type: 'auth_error', code: 'ROOM_NOT_FOUND', message: '房間不存在或已結束。' })
      ws.close(4404, 'Room not found')
      return
    }

    const text = typeof message === 'string' ? message : new TextDecoder().decode(message)
    if (text.length > MAX_MESSAGE_LENGTH) {
      this.send(ws, { type: 'action_error', code: 'MESSAGE_TOO_LARGE', message: '訊息太長，請重新操作。' })
      ws.close(1009, 'Message too large')
      return
    }

    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      this.send(ws, { type: 'action_error', code: 'INVALID_MESSAGE', message: '無法讀取訊息，請重新操作。' })
      return
    }

    if (!isRecord(payload) || typeof payload.type !== 'string') {
      this.send(ws, { type: 'action_error', code: 'INVALID_MESSAGE', message: '訊息格式不正確。' })
      return
    }

    if (attachment.playerId === null) {
      if (payload.type !== 'authenticate' || typeof payload.token !== 'string') {
        this.send(ws, { type: 'auth_error', code: 'AUTH_REQUIRED', message: '請重新加入房間。' })
        ws.close(4401, 'Authentication required')
        return
      }

      await this.authenticate(ws, payload.token)
      return
    }

    if (payload.type === 'authenticate') {
      this.send(ws, { type: 'action_error', code: 'ALREADY_AUTHENTICATED', message: '連線已驗證。' })
      return
    }

    const player = this.room.players.find((candidate) => candidate.id === attachment.playerId)
    if (!player) {
      this.send(ws, { type: 'auth_error', code: 'PLAYER_NOT_FOUND', message: '你已不在這個房間，請重新加入。' })
      ws.close(4401, 'Player not found')
      return
    }

    switch (payload.type) {
      case 'set_ready':
        await this.handleSetReady(ws, player, payload.ready)
        return
      case 'select_avatar':
        await this.handleSelectAvatar(ws, player, payload.avatarId)
        return
      case 'select_game':
        await this.handleSelectGame(ws, player, payload.gameId)
        return
      case 'configure_game':
        await this.handleConfigureGame(ws, player, payload.gameId, payload.settings)
        return
      case 'kick_player':
        await this.handleKickPlayer(ws, player, payload.playerId)
        return
      case 'start_game':
        await this.handleStartGame(ws, player, payload.devRoleId)
        return
      case 'game_action':
        await this.handleGameAction(ws, player, payload.gameId, payload.action, payload.payload)
        return
      case 'submit_answer':
        await this.handleGameAction(
          ws,
          player,
          this.room.selectedGameId,
          'submit_answer',
          { answer: payload.answer },
          true,
        )
        return
      case 'finish_game':
        await this.handleGameAction(ws, player, this.room.selectedGameId, 'finish_game', {}, true)
        return
      case 'abort_game':
        await this.handleAbortGame(ws, player)
        return
      case 'prepare_next_game':
        await this.handlePrepareNextGame(ws, player)
        return
      case 'leave_room':
        await this.handleLeaveRoom(ws, player)
        return
      default:
        this.send(ws, { type: 'action_error', code: 'UNKNOWN_ACTION', message: '不支援這個操作。' })
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    await this.markPlayerOffline(ws)
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('Game room WebSocket error', error)
    await this.markPlayerOffline(ws)
    ws.close(1011, 'Connection error')
  }

  async alarm(): Promise<void> {
    await this.initialized
    if (!this.room) {
      return
    }

    const now = Date.now()
    if (now >= this.room.updatedAt + ROOM_IDLE_TTL_MS) {
      this.broadcast({ type: 'room_expired' })
      for (const ws of this.ctx.getWebSockets()) {
        ws.close(4404, 'Room expired')
      }
      this.room = null
      await this.ctx.storage.delete(ROOM_STORAGE_KEY)
      await this.ctx.storage.deleteAlarm()
      return
    }

    const gameModule = getGameModule(this.room.selectedGameId)
    if (this.room.status === 'playing' && gameModule.handleAlarm(this.room, now)) {
      await this.persist()
      this.broadcastState()
      return
    }

    await this.scheduleAlarm()
  }

  private async createRoom(request: Request): Promise<Response> {
    if (this.room) {
      return jsonResponse({ code: 'ROOM_EXISTS', message: '房間代碼已使用。' }, 409)
    }

    const body = await readJsonObject(request)
    if (!body) {
      return jsonResponse({ code: 'INVALID_BODY', message: '請求內容必須是 JSON 物件。' }, 400)
    }

    const code = typeof body.code === 'string' ? body.code.toUpperCase() : ''
    const name = normalizePlayerName(body.name)
    const player = this.createStoredPlayer(body)
    if (!ROOM_CODE_PATTERN.test(code) || !name || !player) {
      return jsonResponse({ code: 'INVALID_ROOM', message: '房間資料不正確。' }, 400)
    }

    const now = Date.now()
    this.room = {
      schemaVersion: 3,
      code,
      hostId: player.id,
      status: 'waiting',
      selectedGameId: DEFAULT_GAME_ID,
      gameSelectionConfirmed: false,
      gameSettings: getGameModule(DEFAULT_GAME_ID).defaultSettings(),
      players: [{ ...player, name }],
      game: null,
      createdAt: now,
      updatedAt: now,
    }
    await this.persist()
    return jsonResponse({ ok: true }, 201)
  }

  private async joinRoom(request: Request): Promise<Response> {
    if (!this.room) {
      return jsonResponse({ code: 'ROOM_NOT_FOUND', message: '找不到這個房間，請確認房間代碼。' }, 404)
    }

    const body = await readJsonObject(request)
    if (!body) {
      return jsonResponse({ code: 'INVALID_BODY', message: '請求內容必須是 JSON 物件。' }, 400)
    }

    const name = normalizePlayerName(body.name)
    const player = this.createStoredPlayer(body)
    if (!name || !player) {
      return jsonResponse({ code: 'INVALID_PLAYER', message: '玩家資料不正確。' }, 400)
    }

    if (this.room.status !== 'waiting') {
      return jsonResponse({ code: 'GAME_STARTED', message: '遊戲已開始，暫時無法加入。' }, 409)
    }

    if (this.room.players.length >= ROOM_CAPACITY) {
      return jsonResponse({ code: 'ROOM_FULL', message: '房間已滿，請加入其他房間。' }, 409)
    }

    this.room.players.push({ ...player, name })
    await this.persist()
    this.broadcastState()
    return jsonResponse({ ok: true }, 201)
  }

  private async openWebSocket(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return jsonResponse({ code: 'WEBSOCKET_REQUIRED', message: '此路徑需要 WebSocket 連線。' }, 426)
    }

    const betaToken = readWebSocketBetaToken(request)
    const betaSessionExpiresAt = betaToken
      ? await verifyBetaSessionToken(
        betaToken,
        this.betaSessionSecret,
        parseBetaCodes(this.betaCodes),
      )
      : null
    if (!betaSessionExpiresAt || !betaToken) {
      return jsonResponse(
        { code: 'BETA_ACCESS_REQUIRED', message: '封測驗證已失效，請重新輸入封測碼。' },
        401,
      )
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ playerId: null, betaToken } satisfies SocketAttachment)
    this.send(server, { type: 'auth_required' })

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': 'gamumu-beta' },
    })
  }

  private async handleSetReady(ws: WebSocket, player: StoredPlayer, value: unknown): Promise<void> {
    if (typeof value !== 'boolean') {
      this.send(ws, { type: 'action_error', code: 'INVALID_READY_STATE', message: '準備狀態不正確。' })
      return
    }

    if (!this.room || this.room.status !== 'waiting') {
      this.send(ws, { type: 'action_error', code: 'ROOM_NOT_WAITING', message: '目前無法更改準備狀態。' })
      return
    }

    if (player.ready === value) {
      return
    }

    player.ready = value
    await this.persist()
    this.broadcastState()
  }

  private async handleSelectAvatar(ws: WebSocket, player: StoredPlayer, value: unknown): Promise<void> {
    if (!isAvatarId(value)) {
      this.send(ws, { type: 'action_error', code: 'INVALID_AVATAR', message: '找不到這個頭像。' })
      return
    }

    if (player.avatarId === value) {
      return
    }

    player.avatarId = value
    await this.persist()
    this.broadcastState()
  }

  private async handleSelectGame(ws: WebSocket, player: StoredPlayer, value: unknown): Promise<void> {
    if (!isGameId(value)) {
      this.send(ws, { type: 'action_error', code: 'INVALID_GAME', message: '找不到這個遊戲。' })
      return
    }

    if (!this.room || this.room.status !== 'waiting') {
      this.send(ws, { type: 'action_error', code: 'ROOM_NOT_WAITING', message: '遊戲開始後不能更換遊戲。' })
      return
    }

    if (player.id !== this.room.hostId) {
      this.send(ws, { type: 'action_error', code: 'HOST_ONLY', message: '只有房主可以選擇遊戲。' })
      return
    }

    const selectionChanged = this.room.selectedGameId !== value
    if (!selectionChanged && this.room.gameSelectionConfirmed) {
      return
    }

    if (selectionChanged) {
      this.room.selectedGameId = value
      this.room.gameSettings = getGameModule(value).defaultSettings()
      for (const roomPlayer of this.room.players) {
        roomPlayer.ready = false
      }
    }
    this.room.gameSelectionConfirmed = true
    await this.persist()
    this.broadcastState()
  }

  private async handleConfigureGame(
    ws: WebSocket,
    player: StoredPlayer,
    gameIdValue: unknown,
    settingsValue: unknown,
  ): Promise<void> {
    if (!this.room) {
      return
    }

    if (player.id !== this.room.hostId) {
      this.send(ws, { type: 'action_error', code: 'HOST_ONLY', message: '只有房主可以設定遊戲。' })
      return
    }

    if (this.room.status !== 'waiting') {
      this.send(ws, { type: 'action_error', code: 'ROOM_NOT_WAITING', message: '遊戲開始後不能修改設定。' })
      return
    }

    if (!isGameId(gameIdValue) || gameIdValue !== this.room.selectedGameId || !isRecord(settingsValue)) {
      this.send(ws, { type: 'action_error', code: 'INVALID_GAME_SETTINGS', message: '遊戲設定格式不正確。' })
      return
    }

    const result = getGameModule(gameIdValue).configure(this.room, player.id, settingsValue)
    if (!result.ok) {
      this.send(ws, { type: 'action_error', code: result.code, message: result.message })
      return
    }

    if (result.changed) {
      for (const roomPlayer of this.room.players) {
        roomPlayer.ready = false
      }
      await this.persist()
      this.broadcastState()
    }
  }

  private async handleKickPlayer(ws: WebSocket, player: StoredPlayer, value: unknown): Promise<void> {
    if (!this.room) {
      return
    }

    if (player.id !== this.room.hostId) {
      this.send(ws, { type: 'action_error', code: 'HOST_ONLY', message: '只有房主可以移除玩家。' })
      return
    }

    if (this.room.status !== 'waiting') {
      this.send(ws, { type: 'action_error', code: 'ROOM_NOT_WAITING', message: '遊戲開始後不能移除玩家。' })
      return
    }

    if (typeof value !== 'string' || value.length === 0) {
      this.send(ws, { type: 'action_error', code: 'INVALID_PLAYER', message: '玩家資料不正確。' })
      return
    }

    if (value === player.id) {
      this.send(ws, { type: 'action_error', code: 'CANNOT_KICK_SELF', message: '房主不能移除自己。' })
      return
    }

    const target = this.room.players.find((candidate) => candidate.id === value)
    if (!target) {
      this.send(ws, { type: 'action_error', code: 'PLAYER_NOT_FOUND', message: '找不到這位玩家。' })
      return
    }

    this.room.players = this.room.players.filter((candidate) => candidate.id !== target.id)
    await this.persist()

    for (const connection of this.ctx.getWebSockets()) {
      if (this.readAttachment(connection)?.playerId === target.id) {
        this.send(connection, { type: 'kicked', message: '房主已將你移出房間。' })
        connection.close(4403, 'Removed by host')
      }
    }

    this.broadcastState()
  }

  private async authenticate(ws: WebSocket, token: string): Promise<void> {
    const attachment = this.readAttachment(ws)
    if (!attachment) {
      ws.close(1011, 'Invalid connection state')
      return
    }

    if (!this.room || !/^[a-f0-9]{64}$/.test(token)) {
      this.send(ws, { type: 'auth_error', code: 'INVALID_TOKEN', message: '房間連線憑證無效，請重新加入。' })
      ws.close(4401, 'Invalid token')
      return
    }

    const tokenHash = await hashSessionToken(token)
    const player = this.room.players.find((candidate) => candidate.tokenHash === tokenHash)
    if (!player) {
      this.send(ws, { type: 'auth_error', code: 'INVALID_TOKEN', message: '房間連線憑證無效，請重新加入。' })
      ws.close(4401, 'Invalid token')
      return
    }

    for (const existing of this.ctx.getWebSockets()) {
      if (existing !== ws && this.readAttachment(existing)?.playerId === player.id) {
        existing.close(4001, 'Session replaced')
      }
    }

    ws.serializeAttachment({ playerId: player.id, betaToken: attachment.betaToken } satisfies SocketAttachment)
    player.online = true
    await this.persist()
    this.send(ws, { type: 'authenticated', playerId: player.id })
    this.broadcastState()
    const privateState = getGameModule(this.room.selectedGameId).privateState(this.room, player.id)
    if (privateState) {
      this.send(ws, {
        type: 'game_event',
        gameId: this.room.selectedGameId,
        event: privateState.name,
        payload: privateState.payload,
      })
    }
  }

  private async handleStartGame(
    ws: WebSocket,
    player: StoredPlayer,
    devRoleId: unknown,
  ): Promise<void> {
    if (!this.room) {
      return
    }

    if (player.id !== this.room.hostId) {
      this.send(ws, { type: 'action_error', code: 'HOST_ONLY', message: '只有房主可以開始遊戲。' })
      return
    }

    if (this.room.status !== 'waiting') {
      this.send(ws, { type: 'action_error', code: 'GAME_ALREADY_STARTED', message: '遊戲已經開始。' })
      return
    }

    if (!this.room.gameSelectionConfirmed) {
      this.send(ws, {
        type: 'action_error',
        code: 'GAME_NOT_SELECTED',
        message: '請先選擇本局遊戲。',
      })
      return
    }

    const gameOption = getGameOption(this.room.selectedGameId)
    const playerRange = getPlayerRange(this.room.selectedGameId, this.room.gameSettings)
    if (this.room.players.length < playerRange.min) {
      this.send(ws, {
        type: 'action_error',
        code: 'NOT_ENOUGH_PLAYERS',
        message: `${gameOption.name}至少需要 ${playerRange.min} 位玩家才能開始。`,
      })
      return
    }

    if (this.room.players.length > playerRange.max) {
      this.send(ws, {
        type: 'action_error',
        code: 'TOO_MANY_PLAYERS',
        message: `${gameOption.name}最多允許 ${playerRange.max} 位玩家參加。`,
      })
      return
    }

    if (!this.room.players.every((roomPlayer) => roomPlayer.online && roomPlayer.ready)) {
      this.send(ws, {
        type: 'action_error',
        code: 'ALL_PLAYERS_NOT_READY',
        message: '所有玩家都必須在線且準備好後才能開始。',
      })
      return
    }

    let devWerewolfRole: WerewolfRoleId | undefined
    if (devRoleId !== undefined) {
      if (!this.devRoleSelectionEnabled) {
        this.send(ws, {
          type: 'action_error',
          code: 'DEV_ROLE_SELECTION_DISABLED',
          message: '自選角色只在開發測試 Worker 開放，請使用 npm run worker:dev。',
        })
        return
      }

      if (
        this.room.selectedGameId !== 'werewolf' ||
        !isWerewolfRoleId(devRoleId) ||
        !isWerewolfSettings(this.room.gameSettings)
      ) {
        this.send(ws, {
          type: 'action_error',
          code: 'INVALID_DEV_ROLE',
          message: '所選角色不屬於目前的狼人殺劇本。',
        })
        return
      }

      const roleCounts = getWerewolfRoleCounts(
        this.room.gameSettings.scriptId,
        this.room.players.length,
      )
      if (!roleCounts || roleCounts[devRoleId] === 0) {
        this.send(ws, {
          type: 'action_error',
          code: 'INVALID_DEV_ROLE',
          message: '此劇本或目前人數沒有配置所選角色。',
        })
        return
      }

      devWerewolfRole = devRoleId
    }

    this.room.roundStartScores = Object.fromEntries(
      this.room.players.map((roomPlayer) => [roomPlayer.id, roomPlayer.score]),
    )
    getGameModule(this.room.selectedGameId).start(
      this.room,
      Date.now(),
      devWerewolfRole === undefined ? undefined : { devWerewolfRole },
    )
    await this.persist()
    this.broadcastState()
  }

  private async handleAbortGame(ws: WebSocket, player: StoredPlayer): Promise<void> {
    if (!this.room) {
      return
    }

    if (player.id !== this.room.hostId) {
      this.send(ws, { type: 'action_error', code: 'HOST_ONLY', message: '只有房主可以提前結束遊戲。' })
      return
    }

    if (this.room.status !== 'playing' || !this.room.game) {
      this.send(ws, {
        type: 'action_error',
        code: 'GAME_NOT_IN_PROGRESS',
        message: '目前沒有進行中的遊戲。',
      })
      return
    }

    const roundStartScores = this.room.roundStartScores
    if (
      !roundStartScores ||
      this.room.players.some((roomPlayer) => !Number.isFinite(roundStartScores[roomPlayer.id]))
    ) {
      this.send(ws, {
        type: 'action_error',
        code: 'ROUND_SCORE_SNAPSHOT_MISSING',
        message: '本局開始於功能更新前，無法安全回復分數；請先完成本局。',
      })
      return
    }

    for (const roomPlayer of this.room.players) {
      roomPlayer.score = roundStartScores[roomPlayer.id]!
      roomPlayer.ready = false
    }
    this.room.status = 'waiting'
    this.room.game = null
    this.room.gameSelectionConfirmed = false
    delete this.room.roundStartScores

    await this.persist()
    this.broadcastState()
    this.broadcast({ type: 'game_aborted' }, player.id)
  }

  private async handleGameAction(
    ws: WebSocket,
    player: StoredPlayer,
    gameIdValue: unknown,
    actionValue: unknown,
    payloadValue: unknown,
    isLegacyAction = false,
  ): Promise<void> {
    if (!this.room) {
      return
    }

    if (
      !isGameId(gameIdValue) ||
      typeof actionValue !== 'string' ||
      actionValue.length === 0 ||
      actionValue.length > 80 ||
      !isRecord(payloadValue)
    ) {
      this.send(ws, {
        type: 'action_error',
        code: 'INVALID_GAME_ACTION',
        message: '遊戲操作格式不正確。',
      })
      return
    }

    if (gameIdValue !== this.room.selectedGameId) {
      this.send(ws, {
        type: 'action_error',
        code: 'GAME_NOT_SELECTED',
        message: '這個操作不屬於目前選擇的遊戲。',
      })
      return
    }

    if (this.room.status !== 'playing') {
      this.send(ws, { type: 'action_error', code: 'GAME_NOT_STARTED', message: '遊戲尚未開始。' })
      return
    }

    const result = getGameModule(gameIdValue).handleAction(
      this.room,
      player.id,
      actionValue,
      payloadValue,
      Date.now(),
    )
    if (result.changed) {
      await this.persist()
      this.broadcastState()
    }

    if (!result.ok) {
      this.send(ws, {
        type: 'action_error',
        code: result.code,
        message: result.message,
      })
      return
    }

    if (result.event) {
      if (isLegacyAction && result.event.legacyMessage) {
        this.send(ws, result.event.legacyMessage)
      } else if (!isLegacyAction && result.event.audience === 'room') {
        this.broadcast({
          type: 'game_event',
          gameId: gameIdValue,
          event: result.event.name,
          payload: result.event.payload,
        }, player.id)
      } else if (!isLegacyAction) {
        this.send(ws, {
          type: 'game_event',
          gameId: gameIdValue,
          event: result.event.name,
          payload: result.event.payload,
        })
      }
    }
  }

  private async handlePrepareNextGame(ws: WebSocket, player: StoredPlayer): Promise<void> {
    if (!this.room) {
      return
    }

    if (player.id !== this.room.hostId) {
      this.send(ws, { type: 'action_error', code: 'HOST_ONLY', message: '只有房主可以準備下一局。' })
      return
    }

    if (this.room.status !== 'finished') {
      this.send(ws, { type: 'action_error', code: 'GAME_NOT_FINISHED', message: '目前沒有已結束的遊戲。' })
      return
    }

    this.room.status = 'waiting'
    this.room.game = null
    for (const roomPlayer of this.room.players) {
      roomPlayer.ready = false
    }
    await this.persist()
    this.broadcastState()
  }

  private async handleLeaveRoom(ws: WebSocket, player: StoredPlayer): Promise<void> {
    if (!this.room) {
      return
    }

    this.room.players = this.room.players.filter((candidate) => candidate.id !== player.id)
    if (this.room.players.length === 0) {
      this.send(ws, { type: 'left_room' })
      for (const connection of this.ctx.getWebSockets()) {
        if (connection !== ws) {
          connection.close(4004, 'Room closed')
        }
      }
      this.room = null
      await this.ctx.storage.delete(ROOM_STORAGE_KEY)
      await this.ctx.storage.deleteAlarm()
      ws.close(1000, 'Left room')
      return
    }

    if (this.room.hostId === player.id) {
      this.room.hostId = this.room.players[0]!.id
    }

    if (this.room.status === 'playing') {
      getGameModule(this.room.selectedGameId).onPlayerLeave(this.room, player.id, Date.now())
    }

    await this.persist()
    this.send(ws, { type: 'left_room' })
    this.broadcastState()
    ws.close(1000, 'Left room')
  }

  private async markPlayerOffline(ws: WebSocket): Promise<void> {
    await this.initialized
    if (!this.room) {
      return
    }

    const playerId = this.readAttachment(ws)?.playerId
    if (!playerId) {
      return
    }

    const player = this.room.players.find((candidate) => candidate.id === playerId)
    if (!player) {
      return
    }

    const stillOnline = this.ctx.getWebSockets().some((connection) => {
      return (
        connection !== ws &&
        connection.readyState === WebSocket.OPEN &&
        this.readAttachment(connection)?.playerId === playerId
      )
    })

    if (player.online !== stillOnline) {
      player.online = stillOnline
      if (!stillOnline && this.room.status === 'waiting') {
        player.ready = false
      }
      await this.persist()
      this.broadcastState()
    } else if (!stillOnline && this.room.status === 'waiting' && player.ready) {
      player.ready = false
      await this.persist()
      this.broadcastState()
    }
  }

  private async persist(): Promise<void> {
    if (!this.room) {
      return
    }

    if (this.room.status !== 'playing') {
      delete this.room.roundStartScores
    }
    this.room.updatedAt = Date.now()
    await this.ctx.storage.put(ROOM_STORAGE_KEY, this.room)
    await this.scheduleAlarm()
  }

  private async scheduleAlarm(): Promise<void> {
    if (!this.room) {
      await this.ctx.storage.deleteAlarm()
      return
    }

    const now = Date.now()
    const deadlines = [this.room.updatedAt + ROOM_IDLE_TTL_MS]
    const gameDeadline = getGameModule(this.room.selectedGameId).nextAlarmAt(this.room)
    if (this.room.status === 'playing' && gameDeadline !== null) {
      // Keep due game alarms scheduled across unrelated room writes.
      deadlines.push(Math.max(gameDeadline, now + 1))
    }
    await this.ctx.storage.setAlarm(Math.min(...deadlines))
  }

  private toSnapshot(room: StoredRoom): RoomSnapshot {
    const gameModule = getGameModule(room.selectedGameId)
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      capacity: ROOM_CAPACITY,
      selectedGameId: room.selectedGameId,
      gameSelectionConfirmed: room.gameSelectionConfirmed,
      gameSettings: gameModule.publicSettings(room),
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        avatarId: player.avatarId,
        score: player.score,
        online: player.online,
        ready: player.ready,
        ...gameModule.playerFlags(room, player.id),
      })),
      game: gameModule.toView(room),
    }
  }

  private broadcastState(): void {
    if (!this.room) {
      return
    }
    this.broadcast({ type: 'state', state: this.toSnapshot(this.room) })
    this.pushPrivateStates(this.room)
  }

  private pushPrivateStates(room: StoredRoom): void {
    const gameModule = getGameModule(room.selectedGameId)
    if (!gameModule.pushPrivateState) {
      return
    }

    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.readAttachment(ws)?.playerId
      if (!playerId || ws.readyState !== WebSocket.OPEN) {
        continue
      }

      const privateState = gameModule.privateState(room, playerId)
      if (privateState) {
        this.send(ws, {
          type: 'game_event',
          gameId: room.selectedGameId,
          event: privateState.name,
          payload: privateState.payload,
        })
      }
    }
  }

  private broadcast(message: ServerMessage, excludedPlayerId?: string): void {
    const serialized = JSON.stringify(message)
    const activePlayerIds = new Set(this.room?.players.map((player) => player.id) ?? [])

    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.readAttachment(ws)?.playerId
      if (
        ws.readyState === WebSocket.OPEN &&
        playerId !== null &&
        playerId !== undefined &&
        playerId !== excludedPlayerId &&
        activePlayerIds.has(playerId)
      ) {
        ws.send(serialized)
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  private readAttachment(ws: WebSocket): SocketAttachment | null {
    const value: unknown = ws.deserializeAttachment()
    if (!isRecord(value)) {
      return null
    }

    if (value.playerId !== null && typeof value.playerId !== 'string') {
      return null
    }
    if (typeof value.betaToken !== 'string' || value.betaToken.length === 0) {
      return null
    }

    return { playerId: value.playerId, betaToken: value.betaToken }
  }

  private createStoredPlayer(body: Record<string, unknown>): StoredPlayer | null {
    if (
      typeof body.playerId !== 'string' ||
      body.playerId.length === 0 ||
      body.playerId.length > 80 ||
      typeof body.tokenHash !== 'string' ||
      !TOKEN_HASH_PATTERN.test(body.tokenHash)
    ) {
      return null
    }

    return {
      id: body.playerId,
      name: '',
      avatarId: randomAvatarId(),
      score: 0,
      tokenHash: body.tokenHash,
      online: false,
      ready: false,
    }
  }
}

function randomAvatarId(): AvatarId {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
  return AVATARS[value % AVATARS.length]!.id
}

function migrateLegacyRoom(room: LegacyStoredRoom): StoredRoom {
  return {
    schemaVersion: 3,
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    selectedGameId: DEFAULT_GAME_ID,
    gameSelectionConfirmed: false,
    gameSettings: getGameModule(DEFAULT_GAME_ID).defaultSettings(),
    players: room.players.map((player, index) => ({
      ...player,
      avatarId: AVATARS[index % AVATARS.length]!.id,
      ready: false,
    })),
    game: room.game ? { gameId: 'word-guess', ...room.game } : null,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  }
}

function migratePreviousRoom(room: PreviousStoredRoom): StoredRoom {
  return {
    ...room,
    schemaVersion: 3,
    gameSelectionConfirmed: room.selectedGameId !== DEFAULT_GAME_ID,
  }
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function normalizePlayerName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const name = value.trim().replace(/\s+/g, ' ')
  const length = Array.from(name).length
  return length >= 1 && length <= 20 ? name : null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
