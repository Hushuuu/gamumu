import type { GameActionResult, GameModule, GameRoomContext } from '../types'

export function startBlankGame(room: GameRoomContext, now: number): void {
  room.status = 'playing'
  room.game = { gameId: 'blank', startedAt: now }
}

export function finishBlankGame(room: GameRoomContext): boolean {
  if (room.status !== 'playing' || room.game?.gameId !== 'blank') {
    return false
  }

  room.status = 'finished'
  room.game = null
  return true
}

function handleBlankGameAction(
  room: GameRoomContext,
  playerId: string,
  action: string,
): GameActionResult {
  if (action !== 'finish_game') {
    return {
      ok: false,
      changed: false,
      code: 'UNKNOWN_GAME_ACTION',
      message: '空白測試遊戲不支援這個操作。',
    }
  }

  if (playerId !== room.hostId) {
    return {
      ok: false,
      changed: false,
      code: 'HOST_ONLY',
      message: '只有房主可以結束測試遊戲。',
    }
  }

  if (!finishBlankGame(room)) {
    return {
      ok: false,
      changed: false,
      code: 'GAME_NOT_RUNNING',
      message: '目前沒有可結束的測試遊戲。',
    }
  }

  return { ok: true, changed: true }
}

export const blankGame: GameModule = {
  // @ts-ignore
  id: 'blank', 
  defaultSettings: () => ({}),
  configure: () => ({
    ok: false,
    changed: false,
    code: 'GAME_NOT_CONFIGURABLE',
    message: '空白測試遊戲沒有可調整的設定。',
  }),
  publicSettings: () => ({}),
  privateState: () => null,
  start: startBlankGame,
  handleAction: handleBlankGameAction,
  nextAlarmAt: () => null,
  handleAlarm: () => false,
  onPlayerLeave: () => false,
  playerFlags: () => ({ answered: false, correct: false }),
  toView(room) {
    const game = room.game
    return game?.gameId === 'blank'
      ? { gameId: 'blank', startedAt: game.startedAt }
      : null
  },
}
