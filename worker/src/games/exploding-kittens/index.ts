import {
  DEFAULT_EXPLODING_KITTENS_SETTINGS,
  EXPLODING_KITTENS_PRIVATE_EVENT,
  isExplodingKittensSettings,
  type ExplodingKittensPrivateState,
  type ExplodingKittensView,
} from '../../../../shared/games/exploding-kittens'
import type { GameActionResult, GameModule, GameRoomContext } from '../types'
import {
  applyExplodingKittensAction,
  canPlayerNope,
  createExplodingKittensGame,
  getNopeRespondedBy,
  leaveExplodingKittens,
  processExplodingKittensTimers,
} from './rules'
import type { StoredExplodingKittens } from './types'

function failure(code: string, message: string, changed = false): GameActionResult {
  return { ok: false, changed, code, message }
}

function currentSettings(room: GameRoomContext) {
  const settings = isExplodingKittensSettings(room.gameSettings)
    ? { ...room.gameSettings }
    : { ...DEFAULT_EXPLODING_KITTENS_SETTINGS }
  return {
    ...settings,
    turnNoticeSeconds: settings.turnNoticeSeconds ?? DEFAULT_EXPLODING_KITTENS_SETTINGS.turnNoticeSeconds,
  }
}

function activeGame(room: GameRoomContext): StoredExplodingKittens | null {
  return room.game?.gameId === 'exploding-kittens' ? room.game : null
}

function updateRoomStatus(room: GameRoomContext, game: StoredExplodingKittens): void {
  if (game.phase === 'finished') {
    room.status = 'finished'
  }
}

export const explodingKittensGame: GameModule = {
  id: 'exploding-kittens',
  pushPrivateState: true,
  defaultSettings: () => ({ ...DEFAULT_EXPLODING_KITTENS_SETTINGS }),
  configure(room, playerId, settings) {
    if (room.status !== 'waiting') {
      return failure('GAME_ALREADY_STARTED', '遊戲開始後不能調整設定。')
    }
    if (playerId !== room.hostId) {
      return failure('NOT_HOST', '只有房主可以調整本局設定。')
    }
    if (!isExplodingKittensSettings(settings)) {
      return failure('INVALID_GAME_SETTINGS', '每回合需為 5–100 秒，休想判定需為 3–10 秒，回合通知需為 5–20 秒。')
    }

    const current = currentSettings(room)
    if (
      current.turnTimeSeconds === settings.turnTimeSeconds &&
      current.nopeWindowSeconds === settings.nopeWindowSeconds &&
      current.turnNoticeSeconds === (settings.turnNoticeSeconds ?? DEFAULT_EXPLODING_KITTENS_SETTINGS.turnNoticeSeconds)
    ) {
      return { ok: true, changed: false }
    }

    room.gameSettings = { ...settings }
    return { ok: true, changed: true }
  },
  publicSettings: (room) => ({ ...currentSettings(room) }),
  privateState(room, playerId) {
    const game = activeGame(room)
    const seat = game?.seats.find((candidate) => candidate.id === playerId)
    if (room.status !== 'playing' || !game || !seat) {
      return null
    }

    const pending = game.pending
    const choice: ExplodingKittensPrivateState['choice'] =
      game.phase === 'favor' && pending?.targetId === playerId
        ? 'give'
        : game.phase === 'defuse' && pending?.actorId === playerId
          ? 'defuse'
          : null

    return {
      name: EXPLODING_KITTENS_PRIVATE_EVENT,
      payload: {
        hand: seat.hand.map((card) => ({ ...card })),
        peek: game.currentPlayerId === playerId && game.peek ? [...game.peek] : null,
        choice,
        maxPosition: choice === 'defuse'
          ? Math.min(game.startingPlayerCount, game.drawPile.length + 1)
          : null,
        canNope: canPlayerNope(game, playerId),
      } satisfies ExplodingKittensPrivateState,
    }
  },
  start(room, now) {
    room.game = createExplodingKittensGame(
      room.players.map(({ id, name }) => ({ id, name })),
      currentSettings(room),
      now,
    )
    room.status = 'playing'
  },
  handleAction(room, playerId, action, payload, now) {
    const game = activeGame(room)
    if (room.status !== 'playing' || !game) {
      return failure('GAME_NOT_STARTED', '爆炸貓尚未開始。')
    }

    if (game.phaseEndsAt !== null && game.phaseEndsAt <= now) {
      const changed = processExplodingKittensTimers(game, now)
      updateRoomStatus(room, game)
      if (changed) {
        return failure('PHASE_EXPIRED', '階段時間已到，系統已自動處理。', true)
      }
    }

    const result = applyExplodingKittensAction(game, playerId, action, payload, now)
    updateRoomStatus(room, game)
    return result
  },
  nextAlarmAt(room) {
    return room.status === 'playing' ? activeGame(room)?.phaseEndsAt ?? null : null
  },
  handleAlarm(room, now) {
    const game = activeGame(room)
    if (
      room.status !== 'playing' ||
      !game ||
      game.phaseEndsAt === null ||
      game.phaseEndsAt > now
    ) {
      return false
    }

    const changed = processExplodingKittensTimers(game, now)
    updateRoomStatus(room, game)
    return changed
  },
  onPlayerLeave(room, playerId, now) {
    const game = activeGame(room)
    if (room.status !== 'playing' || !game) {
      return false
    }

    const changed = leaveExplodingKittens(game, playerId, now)
    updateRoomStatus(room, game)
    return changed
  },
  playerFlags() {
    return { answered: false, correct: false }
  },
  toView(room): ExplodingKittensView | null {
    const game = activeGame(room)
    if (!game) {
      return null
    }

    return {
      gameId: 'exploding-kittens',
      phase: game.phase,
      startingPlayerCount: game.startingPlayerCount,
      seats: game.seats.map(({ id, name, status, hand }) => ({
        id,
        name,
        status,
        handCount: hand.length,
      })),
      currentPlayerId: game.currentPlayerId,
      turnsLeft: game.turnsLeft,
      drawPileCount: game.drawPile.length,
      discard: [...game.discard],
      finalHands: game.phase === 'finished'
        ? game.seats.map((seat) => ({
            playerId: seat.id,
            cards: [...(seat.finalHand ?? seat.hand.map((card) => card.type))],
          }))
        : null,
      turnPlays: game.turnPlays.map((play) => ({ ...play, cardTypes: [...play.cardTypes] })),
      lastTurnPlays: game.lastTurnPlays.map((play) => ({ ...play, cardTypes: [...play.cardTypes] })),
      pending: game.pending
        ? {
            kind: game.pending.kind,
            actorId: game.pending.actorId,
            targetId: game.pending.targetId,
            playKind: game.pending.playKind,
            cardTypes: [...game.pending.cardTypes],
            namedType: game.pending.namedType,
            nopeCount: game.pending.nopeCount,
            nopedBy: [...game.pending.nopedBy],
            nopeRespondedBy: [...getNopeRespondedBy(game.pending)],
          }
        : null,
      announcements: [...game.announcements],
      phaseEndsAt: game.phaseEndsAt,
      settings: {
        ...game.settings,
        turnNoticeSeconds: game.settings.turnNoticeSeconds ?? DEFAULT_EXPLODING_KITTENS_SETTINGS.turnNoticeSeconds,
      },
      eliminationOrder: [...game.eliminationOrder],
      winnerId: game.winnerId,
    }
  },
}
