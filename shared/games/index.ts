import { isBlankGameView } from './blank'
import { isGameId } from './catalog'
import type { GameId } from './catalog'
import { isDrawGuessView } from './draw-guess'
import { isWordGuessView } from './word-guess'
import type { GameView } from './types'

export { isBlankGameView } from './blank'
export { isDrawGuessSettings, isDrawGuessView } from './draw-guess'
export { DEFAULT_GAME_ID, GAME_OPTIONS, getGameOption, isGameId, ROOM_CAPACITY } from './catalog'
export type { GameId, GameOption } from './catalog'
export { isWordGuessView } from './word-guess'
export type { BlankGameView } from './blank'
export type { DrawGuessPhase, DrawGuessSettings, DrawGuessView } from './draw-guess'
export type { GameView } from './types'
export type { WordGuessView } from './word-guess'

const GAME_VIEW_VALIDATORS: Record<GameId, (value: unknown) => boolean> = {
  'word-guess': isWordGuessView,
  blank: isBlankGameView,
  'draw-guess': isDrawGuessView,
}

export function isGameView(value: unknown): value is GameView {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('gameId' in value) ||
    !isGameId(value.gameId)
  ) {
    return false
  }

  return GAME_VIEW_VALIDATORS[value.gameId](value)
}
