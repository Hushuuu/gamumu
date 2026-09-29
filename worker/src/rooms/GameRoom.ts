import { DurableObject } from 'cloudflare:workers'
import { isRecord, ROOM_CAPACITY, type RoomSnapshot, type ServerMessage } from '../../../shared/protocol'
import { advanceWordGuess, revealWordGuess, startWordGuess, submitWordGuess } from '../games/word-guess'
import type { Env } from '../env'
import { hashSessionToken } from '../security'
import type { StoredPlayer, StoredRoom } from './types'

const ROOM_STORAGE_KEY = 'room'
const ROOM_IDLE_TTL_MS = 6 * 60 * 60 * 1000
const MAX_MESSAGE_LENGTH = 2_048
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/

interface SocketAttachment {
  playerId: string | null
}

export class GameRoom extends DurableObject<Env> {
  private room: StoredRoom | null = null
  private readonly initialized: Promise<void>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.initialized = this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get<StoredRoom>(ROOM_STORAGE_KEY)) ?? null
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

    const attachment = this.readAttachment(ws)
    if (!attachment) {
      ws.close(1011, 'Invalid connection state')
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
      case 'start_game':
        await this.handleStartGame(ws, player)
        return
      case 'submit_answer':
        await this.handleSubmitAnswer(ws, player, payload.answer)
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

    const game = this.room.game
    if (this.room.status === 'playing' && game && game.roundEndsAt <= now) {
      if (game.phase === 'guessing') {
        revealWordGuess(this.room, now)
      } else {
        advanceWordGuess(this.room, now)
      }
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
      code,
      hostId: player.id,
      status: 'waiting',
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
    return jsonResponse({ ok: true }, 201)
  }

  private async openWebSocket(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return jsonResponse({ code: 'WEBSOCKET_REQUIRED', message: '此路徑需要 WebSocket 連線。' }, 426)
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ playerId: null } satisfies SocketAttachment)
    this.send(server, { type: 'auth_required' })

    return new Response(null, { status: 101, webSocket: client })
  }

  private async authenticate(ws: WebSocket, token: string): Promise<void> {
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

    ws.serializeAttachment({ playerId: player.id } satisfies SocketAttachment)
    player.online = true
    await this.persist()
    this.send(ws, { type: 'authenticated', playerId: player.id })
    this.broadcastState()
  }

  private async handleStartGame(ws: WebSocket, player: StoredPlayer): Promise<void> {
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

    if (this.room.players.length < 2) {
      this.send(ws, { type: 'action_error', code: 'NEED_TWO_PLAYERS', message: '至少需要兩位玩家才能開始。' })
      return
    }

    startWordGuess(this.room, Date.now())
    await this.persist()
    this.broadcastState()
  }

  private async handleSubmitAnswer(ws: WebSocket, player: StoredPlayer, value: unknown): Promise<void> {
    if (typeof value !== 'string' || value.trim().length === 0 || Array.from(value).length > 80) {
      this.send(ws, { type: 'action_error', code: 'INVALID_ANSWER', message: '答案請填 1 到 80 個字元。' })
      return
    }

    if (!this.room) {
      return
    }

    const result = submitWordGuess(this.room, player.id, value, Date.now())
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

    this.send(ws, { type: 'guess_result', correct: result.correct })
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

    const game = this.room.game
    if (
      this.room.status === 'playing' &&
      game?.phase === 'guessing' &&
      game.answeredPlayerIds.length >= this.room.players.length
    ) {
      revealWordGuess(this.room, Date.now())
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
      await this.persist()
      this.broadcastState()
    }
  }

  private async persist(): Promise<void> {
    if (!this.room) {
      return
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
    if (
      this.room.status === 'playing' &&
      this.room.game &&
      this.room.game.roundEndsAt > now
    ) {
      deadlines.push(this.room.game.roundEndsAt)
    }
    await this.ctx.storage.setAlarm(Math.min(...deadlines))
  }

  private toSnapshot(room: StoredRoom): RoomSnapshot {
    const game = room.game
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      capacity: ROOM_CAPACITY,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score,
        online: player.online,
        answered: game?.answeredPlayerIds.includes(player.id) ?? false,
        correct: game?.correctPlayerIds.includes(player.id) ?? false,
      })),
      game: game
        ? {
            round: game.round,
            totalRounds: game.totalRounds,
            phase: game.phase,
            hint: game.hint,
            answer: game.phase === 'reveal' ? game.answer : null,
            roundEndsAt: room.status === 'finished' ? null : game.roundEndsAt,
          }
        : null,
    }
  }

  private broadcastState(): void {
    if (!this.room) {
      return
    }
    this.broadcast({ type: 'state', state: this.toSnapshot(this.room) })
  }

  private broadcast(message: ServerMessage): void {
    const serialized = JSON.stringify(message)
    const activePlayerIds = new Set(this.room?.players.map((player) => player.id) ?? [])

    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.readAttachment(ws)?.playerId
      if (
        ws.readyState === WebSocket.OPEN &&
        playerId !== null &&
        playerId !== undefined &&
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

    return { playerId: value.playerId }
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
      score: 0,
      tokenHash: body.tokenHash,
      online: false,
    }
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
