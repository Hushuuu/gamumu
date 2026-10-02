import {
  DEFAULT_RUMMIKUB_SETTINGS,
  getRummikubBoardTilePoints,
  getRummikubRackTilePoints,
  isRummikubFace,
  isRummikubSettings,
  isValidRummikubMeld,
  RUMMIKUB_COLORS,
  RUMMIKUB_PRIVATE_EVENT,
  RUMMIKUB_TILE_COUNT,
} from '../../../../shared/games/rummikub'
import type {
  RummikubBoardTile,
  RummikubColor,
  RummikubFace,
  RummikubMeld,
  RummikubSettings,
  RummikubTile,
  RummikubView,
} from '../../../../shared/games/rummikub'
import type { GameActionResult, GameModule, GameRoomContext } from '../types'
import type { StoredRummikub } from './types'

const HAND_SIZE = 14
const MAX_MELD_COUNT = Math.floor(RUMMIKUB_TILE_COUNT / 3)

type UnidentifiedTile =
  | { kind: 'number'; color: RummikubColor; value: number }
  | { kind: 'joker' }

type BoardParseResult =
  | { ok: true; melds: RummikubMeld[]; tileIds: Set<number> }
  | { ok: false; code: string; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function actionError(code: string, message: string, changed = false): GameActionResult {
  return { ok: false, changed, code, message }
}

function currentSettings(room: GameRoomContext): RummikubSettings {
  return isRummikubSettings(room.gameSettings)
    ? room.gameSettings
    : DEFAULT_RUMMIKUB_SETTINGS
}

function setTurnDeadline(game: StoredRummikub, now: number): void {
  if (game.turnTimeSeconds === undefined || game.turnTimeSeconds === null) {
    game.turnDeadlineAt = null
    return
  }

  if (!isRummikubSettings({ turnTimeSeconds: game.turnTimeSeconds })) {
    throw new Error('Stored Rummikub turn time is invalid.')
  }
  game.turnDeadlineAt = now + game.turnTimeSeconds * 1000
}

function randomIndex(maxExclusive: number): number {
  const range = 0x1_0000_0000
  const limit = Math.floor(range / maxExclusive) * maxExclusive
  const value = new Uint32Array(1)
  do {
    crypto.getRandomValues(value)
  } while (value[0]! >= limit)
  return value[0]! % maxExclusive
}

function shuffle<T>(values: T[]): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const otherIndex = randomIndex(index + 1)
    ;[values[index], values[otherIndex]] = [values[otherIndex]!, values[index]!]
  }
}

function createTiles(): Record<string, RummikubTile> {
  const unidentifiedTiles: UnidentifiedTile[] = []
  for (const color of RUMMIKUB_COLORS) {
    for (let value = 1; value <= 13; value += 1) {
      unidentifiedTiles.push(
        { kind: 'number', color, value },
        { kind: 'number', color, value },
      )
    }
  }
  unidentifiedTiles.push({ kind: 'joker' }, { kind: 'joker' })
  shuffle(unidentifiedTiles)

  const tiles: Record<string, RummikubTile> = {}
  unidentifiedTiles.forEach((tile, id) => {
    tiles[String(id)] = tile.kind === 'number'
      ? { id, kind: 'number', color: tile.color, value: tile.value }
      : { id, kind: 'joker' }
  })
  return tiles
}

function getHand(game: StoredRummikub, playerId: string): number[] {
  const hand = game.hands[playerId]
  if (!hand) {
    throw new Error(`Rummikub hand is missing for player ${playerId}.`)
  }
  return hand
}

function getTile(game: StoredRummikub, tileId: number): RummikubTile {
  const tile = game.tiles[String(tileId)]
  if (!tile) {
    throw new Error(`Rummikub tile ${tileId} is missing from the deck.`)
  }
  return tile
}

function collectTableTileIds(melds: readonly RummikubMeld[]): Set<number> {
  return new Set(melds.flatMap((meld) => meld.tiles.map((tile) => tile.id)))
}

function parseBoard(game: StoredRummikub, payload: Record<string, unknown>): BoardParseResult {
  const rawMelds = payload.melds
  const rawJokers = payload.jokers
  if (
    !Array.isArray(rawMelds) ||
    rawMelds.length === 0 ||
    rawMelds.length > MAX_MELD_COUNT ||
    !Array.isArray(rawJokers) ||
    rawJokers.length > 2
  ) {
    return {
      ok: false,
      code: 'INVALID_BOARD',
      message: '桌面牌組格式不正確，請重新整理牌面後再試。',
    }
  }

  const jokerAssignments = new Map<number, RummikubFace>()
  for (const rawJoker of rawJokers) {
    if (
      !isRecord(rawJoker) ||
      typeof rawJoker.tileId !== 'number' ||
      !Number.isInteger(rawJoker.tileId) ||
      rawJoker.tileId < 0 ||
      rawJoker.tileId >= RUMMIKUB_TILE_COUNT ||
      !isRummikubFace(rawJoker.representedAs) ||
      jokerAssignments.has(rawJoker.tileId)
    ) {
      return {
        ok: false,
        code: 'INVALID_JOKER_ASSIGNMENT',
        message: 'Joker 的代表牌設定不正確。',
      }
    }

    if (getTile(game, rawJoker.tileId).kind !== 'joker') {
      return {
        ok: false,
        code: 'INVALID_JOKER_ASSIGNMENT',
        message: '只有 Joker 才能設定代表牌。',
      }
    }

    jokerAssignments.set(rawJoker.tileId, rawJoker.representedAs)
  }

  const melds: RummikubMeld[] = []
  const tileIds = new Set<number>()
  const usedJokerIds = new Set<number>()
  let totalTiles = 0

  for (const rawMeld of rawMelds) {
    if (!Array.isArray(rawMeld) || rawMeld.length < 3 || rawMeld.length > 13) {
      return {
        ok: false,
        code: 'INVALID_MELD',
        message: '每組牌至少要有 3 張，且不可超過 13 張。',
      }
    }

    const tiles: RummikubBoardTile[] = []
    for (const rawTileId of rawMeld) {
      if (
        typeof rawTileId !== 'number' ||
        !Number.isInteger(rawTileId) ||
        rawTileId < 0 ||
        rawTileId >= RUMMIKUB_TILE_COUNT ||
        tileIds.has(rawTileId)
      ) {
        return {
          ok: false,
          code: 'DUPLICATE_OR_INVALID_TILE',
          message: '牌面包含重複或無效的牌，請重新整理後再試。',
        }
      }

      const tile = getTile(game, rawTileId)
      if (tile.kind === 'joker') {
        const representedAs = jokerAssignments.get(rawTileId)
        if (!representedAs) {
          return {
            ok: false,
            code: 'INVALID_JOKER_ASSIGNMENT',
            message: '請為桌面上的每張 Joker 指定代表牌。',
          }
        }
        tiles.push({ ...tile, representedAs })
        usedJokerIds.add(rawTileId)
      } else {
        if (jokerAssignments.has(rawTileId)) {
          return {
            ok: false,
            code: 'INVALID_JOKER_ASSIGNMENT',
            message: '只有 Joker 才能設定代表牌。',
          }
        }
        tiles.push(tile)
      }
      tileIds.add(rawTileId)
      totalTiles += 1
      if (totalTiles > RUMMIKUB_TILE_COUNT) {
        return {
          ok: false,
          code: 'INVALID_BOARD',
          message: '桌面上的牌數超過牌組總數。',
        }
      }
    }

    if (!isValidRummikubMeld(tiles)) {
      return {
        ok: false,
        code: 'INVALID_MELD',
        message: '每組牌必須是 3–4 張同數不同色，或 3–13 張同色連號。',
      }
    }
    melds.push({ tiles })
  }

  if (usedJokerIds.size !== jokerAssignments.size) {
    return {
      ok: false,
      code: 'INVALID_JOKER_ASSIGNMENT',
      message: 'Joker 代表牌設定與桌面上的牌不一致。',
    }
  }

  return { ok: true, melds, tileIds }
}

function sameFace(left: RummikubFace, right: RummikubFace): boolean {
  return left.color === right.color && left.value === right.value
}

function sameMeld(left: RummikubMeld, right: RummikubMeld): boolean {
  if (left.tiles.length !== right.tiles.length) {
    return false
  }

  return left.tiles.every((leftTile) => {
    const rightTile = right.tiles.find((tile) => tile.id === leftTile.id)
    if (!rightTile || rightTile.kind !== leftTile.kind) {
      return false
    }
    return leftTile.kind === 'number' ||
      (rightTile.kind === 'joker' && sameFace(leftTile.representedAs, rightTile.representedAs))
  })
}

function preservesOriginalMelds(
  originalMelds: readonly RummikubMeld[],
  submittedMelds: readonly RummikubMeld[],
): boolean {
  const originalTileIds = collectTableTileIds(originalMelds)
  const unmatchedMelds = [...submittedMelds]

  for (const originalMeld of originalMelds) {
    const matchingIndex = unmatchedMelds.findIndex((meld) => sameMeld(originalMeld, meld))
    if (matchingIndex < 0) {
      return false
    }
    unmatchedMelds.splice(matchingIndex, 1)
  }

  return unmatchedMelds.every((meld) => {
    return meld.tiles.every((tile) => !originalTileIds.has(tile.id))
  })
}

function preservesJokerAssignments(
  game: StoredRummikub,
  originalMelds: readonly RummikubMeld[],
  submittedMelds: readonly RummikubMeld[],
  usedHandTileIds: ReadonlySet<number>,
): boolean {
  const submittedTiles = new Map(
    submittedMelds.flatMap((meld) => meld.tiles.map((tile) => [tile.id, tile] as const)),
  )
  const reservedReplacementIds = new Set<number>()

  for (const meld of originalMelds) {
    for (const tile of meld.tiles) {
      if (tile.kind !== 'joker') {
        continue
      }

      const submittedTile = submittedTiles.get(tile.id)
      if (!submittedTile || submittedTile.kind !== 'joker') {
        return false
      }
      const remainsInOriginalMeld = submittedMelds.some((submittedMeld) => {
        const submittedJoker = submittedMeld.tiles.find((candidate) => candidate.id === tile.id)
        return (
          submittedJoker?.kind === 'joker' &&
          sameFace(tile.representedAs, submittedJoker.representedAs) &&
          meld.tiles.every((originalTile) => {
            return submittedMeld.tiles.some((candidate) => candidate.id === originalTile.id)
          })
        )
      })
      if (remainsInOriginalMeld) {
        continue
      }

      const replacementId = [...usedHandTileIds].find((tileId) => {
        if (reservedReplacementIds.has(tileId)) {
          return false
        }
        const replacement = getTile(game, tileId)
        return (
          replacement.kind === 'number' &&
          sameFace(
            { color: replacement.color, value: replacement.value },
            tile.representedAs,
          )
        )
      })
      if (replacementId === undefined) {
        return false
      }
      reservedReplacementIds.add(replacementId)
    }
  }

  return true
}

function scoreRack(game: StoredRummikub, playerId: string): number {
  return getHand(game, playerId).reduce((total, tileId) => {
    return total + getRummikubRackTilePoints(getTile(game, tileId))
  }, 0)
}

function settleGame(
  room: GameRoomContext,
  game: StoredRummikub,
  winnerId: string | null,
  endReason: StoredRummikub['endReason'],
  awardScores: boolean,
): void {
  const roundScores: Record<string, number> = {}
  if (winnerId !== null && awardScores) {
    const remainingPoints = new Map(
      room.players.map((player) => [player.id, scoreRack(game, player.id)]),
    )
    const winnerPoints = room.players.reduce((total, player) => {
      return player.id === winnerId ? total : total + (remainingPoints.get(player.id) ?? 0)
    }, 0)

    for (const player of room.players) {
      const points = player.id === winnerId
        ? winnerPoints
        : -(remainingPoints.get(player.id) ?? 0)
      player.score += points
      roundScores[player.id] = points
    }
  }

  game.currentPlayerId = null
  game.turnDeadlineAt = null
  game.winnerId = winnerId
  game.endReason = endReason
  game.roundScores = roundScores
  room.status = 'finished'
}

function selectBlockedWinner(room: GameRoomContext, game: StoredRummikub): string {
  const orderIndex = new Map(game.turnOrder.map((playerId, index) => [playerId, index]))
  return [...room.players].sort((left, right) => {
    const scoreDifference = scoreRack(game, left.id) - scoreRack(game, right.id)
    return scoreDifference || (orderIndex.get(left.id) ?? 0) - (orderIndex.get(right.id) ?? 0)
  })[0]!.id
}

function advanceTurn(room: GameRoomContext, game: StoredRummikub, now: number): void {
  const activeOrder = game.turnOrder.filter((playerId) => {
    return room.players.some((player) => player.id === playerId)
  })
  const currentIndex = activeOrder.indexOf(game.currentPlayerId ?? '')
  if (currentIndex < 0 || activeOrder.length === 0) {
    throw new Error('Rummikub current player is not in the active turn order.')
  }

  game.currentPlayerId = activeOrder[(currentIndex + 1) % activeOrder.length]!
  game.turnNumber += 1
  setTurnDeadline(game, now)
}

function playTurn(
  room: GameRoomContext,
  playerId: string,
  game: StoredRummikub,
  payload: Record<string, unknown>,
  now: number,
): GameActionResult {
  const parsedBoard = parseBoard(game, payload)
  if (!parsedBoard.ok) {
    return actionError(parsedBoard.code, parsedBoard.message)
  }

  const hand = getHand(game, playerId)
  const handTileIds = new Set(hand)
  const originalTableTileIds = collectTableTileIds(game.table)
  for (const originalTileId of originalTableTileIds) {
    if (!parsedBoard.tileIds.has(originalTileId)) {
      return actionError(
        'TABLE_TILE_MISSING',
        '回合結束時，桌面原有的每張牌都必須留在合法組合中。',
      )
    }
  }

  const usedHandTileIds = new Set<number>()
  for (const tileId of parsedBoard.tileIds) {
    if (originalTableTileIds.has(tileId)) {
      continue
    }
    if (!handTileIds.has(tileId)) {
      return actionError('TILE_NOT_AVAILABLE', '你只能使用桌面上的牌或自己牌架上的牌。')
    }
    usedHandTileIds.add(tileId)
  }

  if (usedHandTileIds.size === 0) {
    return actionError('MUST_PLAY_TILE', '每回合至少要打出一張自己牌架上的牌。')
  }

  const hasOpened = game.openedPlayerIds.includes(playerId)
  if (!hasOpened) {
    if (!preservesOriginalMelds(game.table, parsedBoard.melds)) {
      return actionError(
        'INITIAL_MELD_ONLY',
        '完成 30 分登錄前，只能使用自己牌架上的牌建立新組合。',
      )
    }

    const newMelds = parsedBoard.melds.filter((meld) => {
      return meld.tiles.every((tile) => !originalTableTileIds.has(tile.id))
    })
    const openingPoints = newMelds
      .flatMap((meld) => meld.tiles)
      .reduce((total, tile) => total + getRummikubBoardTilePoints(tile), 0)
    if (openingPoints < 30) {
      return actionError(
        'INITIAL_MELD_TOO_LOW',
        '第一次登錄必須只用自己的牌，且一次出牌總值至少 30 分。',
      )
    }
  } else if (!preservesJokerAssignments(game, game.table, parsedBoard.melds, usedHandTileIds)) {
    return actionError(
      'JOKER_MUST_BE_REPLACED',
      '換回桌面上的 Joker 時，必須用該 Joker 原本代表的實體牌替換，並在同一回合出掉 Joker。',
    )
  }

  game.table = parsedBoard.melds
  game.hands[playerId] = hand.filter((tileId) => !usedHandTileIds.has(tileId))
  if (!hasOpened) {
    game.openedPlayerIds.push(playerId)
  }
  game.consecutivePasses = 0

  if (game.hands[playerId]!.length === 0) {
    settleGame(room, game, playerId, 'played-out', true)
  } else {
    advanceTurn(room, game, now)
  }

  return { ok: true, changed: true }
}

function drawTile(
  room: GameRoomContext,
  playerId: string,
  game: StoredRummikub,
  now: number,
): GameActionResult {
  const tileId = game.drawPile.pop()
  if (tileId === undefined) {
    return actionError('DRAW_PILE_EMPTY', '牌堆已經抽完，請結束回合。')
  }

  getHand(game, playerId).push(tileId)
  game.consecutivePasses = 0
  advanceTurn(room, game, now)
  return { ok: true, changed: true }
}

function passTurn(
  room: GameRoomContext,
  game: StoredRummikub,
  now: number,
): GameActionResult {
  if (game.drawPile.length > 0) {
    return actionError('DRAW_AVAILABLE', '牌堆還有牌，選擇不出牌時必須抽一張。')
  }

  game.consecutivePasses += 1
  if (game.consecutivePasses >= room.players.length) {
    settleGame(room, game, selectBlockedWinner(room, game), 'blocked', true)
  } else {
    advanceTurn(room, game, now)
  }
  return { ok: true, changed: true }
}

function timeoutTurn(room: GameRoomContext, game: StoredRummikub, now: number): boolean {
  if (game.turnDeadlineAt == null || game.turnDeadlineAt > now) {
    return false
  }

  const playerId = game.currentPlayerId
  if (!playerId || !room.players.some((player) => player.id === playerId)) {
    throw new Error('Rummikub timed-out turn has no active player.')
  }

  const result = game.drawPile.length > 0
    ? drawTile(room, playerId, game, now)
    : passTurn(room, game, now)
  if (!result.ok) {
    throw new Error(`Unable to end timed-out Rummikub turn: ${result.code}.`)
  }
  if (!result.changed) {
    throw new Error('Timed-out Rummikub turn did not change the game state.')
  }
  return true
}

function startRummikub(room: GameRoomContext, now: number): void {
  if (room.players.length < 2 || room.players.length > 4) {
    throw new Error('Rummikub requires between 2 and 4 players.')
  }

  const settings = currentSettings(room)
  const tiles = createTiles()
  const deckOrder = Array.from({ length: RUMMIKUB_TILE_COUNT }, (_value, id) => id)
  const playerIds = room.players.map((player) => player.id)
  const hands: Record<string, number[]> = {}

  playerIds.forEach((playerId, index) => {
    hands[playerId] = deckOrder.slice(index * HAND_SIZE, (index + 1) * HAND_SIZE)
  })

  const startingIndex = randomIndex(playerIds.length)
  const turnOrder = [
    ...playerIds.slice(startingIndex),
    ...playerIds.slice(0, startingIndex),
  ]

  room.status = 'playing'
  room.game = {
    gameId: 'rummikub',
    tiles,
    drawPile: deckOrder.slice(playerIds.length * HAND_SIZE),
    hands,
    table: [],
    turnOrder,
    currentPlayerId: turnOrder[0]!,
    turnTimeSeconds: settings.turnTimeSeconds,
    turnDeadlineAt: settings.turnTimeSeconds === null
      ? null
      : now + settings.turnTimeSeconds * 1000,
    turnNumber: 1,
    openedPlayerIds: [],
    consecutivePasses: 0,
    winnerId: null,
    endReason: null,
    roundScores: {},
  }
}

function handleRummikubAction(
  room: GameRoomContext,
  playerId: string,
  action: string,
  payload: Record<string, unknown>,
  now: number,
): GameActionResult {
  const game = room.game
  if (room.status !== 'playing' || game?.gameId !== 'rummikub') {
    return actionError('GAME_NOT_STARTED', '拉密遊戲尚未開始。')
  }

  if (!room.players.some((player) => player.id === playerId)) {
    return actionError('PLAYER_NOT_FOUND', '你已不在這個房間。')
  }

  if (game.turnDeadlineAt != null && game.turnDeadlineAt <= now) {
    const willDraw = game.drawPile.length > 0
    if (timeoutTurn(room, game, now)) {
      return actionError(
        'TURN_TIMED_OUT',
        willDraw
          ? '思考時間已結束，未提交的桌面編輯已還原並自動抽牌。'
          : '思考時間已結束，牌堆已空，本回合已自動跳過。',
        true,
      )
    }
  }

  if (!['play_turn', 'draw_tile', 'pass_turn'].includes(action)) {
    return actionError('UNKNOWN_GAME_ACTION', '拉密不支援這個操作。')
  }

  if (game.currentPlayerId !== playerId) {
    return actionError('NOT_YOUR_TURN', '還沒輪到你行動。')
  }

  switch (action) {
    case 'play_turn':
      return playTurn(room, playerId, game, payload, now)
    case 'draw_tile':
      return drawTile(room, playerId, game, now)
    case 'pass_turn':
      return passTurn(room, game, now)
    default:
      return actionError('UNKNOWN_GAME_ACTION', '拉密不支援這個操作。')
  }
}

export const rummikubGame: GameModule = {
  id: 'rummikub',
  pushPrivateState: true,
  defaultSettings: () => ({ ...DEFAULT_RUMMIKUB_SETTINGS }),
  configure(room, _playerId, settings) {
    if (!isRummikubSettings(settings)) {
      return {
        ok: false,
        changed: false,
        code: 'INVALID_GAME_SETTINGS',
        message: '每回合思考時間需為 15–300 秒，或選擇不限時。',
      }
    }

    const current = currentSettings(room)
    if (current.turnTimeSeconds === settings.turnTimeSeconds) {
      return { ok: true, changed: false }
    }

    room.gameSettings = { ...settings }
    return { ok: true, changed: true }
  },
  publicSettings: (room) => ({ ...currentSettings(room) }),
  privateState(room, playerId) {
    const game = room.game
    if (
      game?.gameId !== 'rummikub' ||
      !room.players.some((player) => player.id === playerId) ||
      !game.hands[playerId]
    ) {
      return null
    }

    return {
      name: RUMMIKUB_PRIVATE_EVENT,
      payload: {
        hand: getHand(game, playerId).map((tileId) => getTile(game, tileId)),
      },
    }
  },
  start(room, now) {
    startRummikub(room, now)
  },
  handleAction: handleRummikubAction,
  nextAlarmAt(room) {
    const game = room.game
    return room.status === 'playing' && game?.gameId === 'rummikub'
      ? game.turnDeadlineAt ?? null
      : null
  },
  handleAlarm(room, now) {
    const game = room.game
    if (room.status !== 'playing' || game?.gameId !== 'rummikub') {
      return false
    }
    return timeoutTurn(room, game, now)
  },
  onPlayerLeave(room, _playerId, _now) {
    const game = room.game
    if (room.status !== 'playing' || game?.gameId !== 'rummikub') {
      return false
    }

    settleGame(room, game, null, 'player-left', false)
    return true
  },
  playerFlags: (_room, _playerId) => ({ answered: false, correct: false }),
  toView(room): RummikubView | null {
    const game = room.game
    if (game?.gameId !== 'rummikub') {
      return null
    }

    return {
      gameId: 'rummikub',
      table: game.table,
      players: room.players.map((player) => ({
        id: player.id,
        tileCount: getHand(game, player.id).length,
        hasOpened: game.openedPlayerIds.includes(player.id),
      })),
      currentPlayerId: game.currentPlayerId,
      turnDeadlineAt: game.turnDeadlineAt ?? null,
      turnNumber: game.turnNumber,
      drawPileCount: game.drawPile.length,
      consecutivePasses: game.consecutivePasses,
      winnerId: game.winnerId,
      endReason: game.endReason,
      roundScores: game.roundScores,
    }
  },
}
