import { isBlankGameView } from './blank'
import { getGameOption, isGameId } from './catalog'
import type { GameId } from './catalog'
import { isDrawGuessView } from './draw-guess'
import { getWerewolfPlayerRange, isWerewolfView } from './werewolf'
import { isWordGuessView } from './word-guess'
import type { GameView } from './types'

export { isBlankGameView } from './blank'
export { isDrawGuessSettings, isDrawGuessView } from './draw-guess'
export {
  DEFAULT_WEREWOLF_SETTINGS,
  WEREWOLF_PRIVATE_EVENT,
  WEREWOLF_ROLES,
  WEREWOLF_SCRIPTS,
  getWerewolfPlayerRange,
  isWerewolfPrivateState,
  isWerewolfRoleId,
  isWerewolfScriptId,
  isWerewolfSettings,
  isWerewolfView,
} from './werewolf'
export type {
  WerewolfCamp,
  WerewolfGuardState,
  WerewolfHunterShot,
  WerewolfPhase,
  WerewolfPrivateState,
  WerewolfRoleId,
  WerewolfRoleInfo,
  WerewolfScriptId,
  WerewolfScriptInfo,
  WerewolfSeerResult,
  WerewolfSettings,
  WerewolfView,
  WerewolfWitchState,
} from './werewolf'
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
  werewolf: isWerewolfView,
}

export function getPlayerRange(
  gameId: GameId,
  settings: Record<string, unknown> | undefined,
): { min: number; max: number } {
  const option = getGameOption(gameId)
  const range = gameId === 'werewolf' ? getWerewolfPlayerRange(settings) : null
  return range ?? { min: option.minPlayers, max: option.maxPlayers }
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
