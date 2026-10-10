//import { isBlankGameView } from './blank'
import { getAvalonPlayerRange, isAvalonView } from './avalon'
import { getGameOption, isGameId } from './catalog'
import type { GameId } from './catalog'
import { isDrawGuessView } from './draw-guess'
import { isExplodingKittensView } from './exploding-kittens'
import { getWerewolfPlayerRange, isWerewolfView } from './werewolf'
import { isWordGuessView } from './word-guess'
import { isRummikubView } from './rummikub'
import type { GameView } from './types'

export { isBlankGameView } from './blank'
export {
  AVALON_EVIL_COUNTS,
  AVALON_MISSION_TEAM_SIZES,
  AVALON_PRIVATE_EVENT,
  AVALON_ROLES,
  DEFAULT_AVALON_SETTINGS,
  getAvalonMissionFailThreshold,
  getAvalonMissionTeamSize,
  getAvalonMissionTeamSizes,
  getAvalonPlayerRange,
  getAvalonRoleCounts,
  isAvalonPrivateState,
  isAvalonRoleId,
  isAvalonSettings,
  isAvalonView,
} from './avalon'
export type {
  AvalonCamp,
  AvalonEndReason,
  AvalonKnowledge,
  AvalonLakeResult,
  AvalonMissionCard,
  AvalonMissionOutcome,
  AvalonMissionResult,
  AvalonPhase,
  AvalonPrivateState,
  AvalonRoleCounts,
  AvalonRoleId,
  AvalonRoleInfo,
  AvalonSettings,
  AvalonView,
  AvalonVoteResult,
} from './avalon'
export {
  DRAW_GUESS_PEN_COLORS,
  DRAW_GUESS_QUESTION_BANK,
  DRAW_GUESS_QUESTION_CATEGORIES,
  isDrawGuessQuestionCategory,
  isDrawGuessSettings,
  isDrawGuessView,
} from './draw-guess'
export {
  canPlayExplodingKittensAlone,
  DEFAULT_EXPLODING_KITTENS_SETTINGS,
  EXPLODING_KITTENS_ANNOUNCEMENT_LIMIT,
  EXPLODING_KITTENS_CARD_COPIES_PER_DECK,
  EXPLODING_KITTENS_CARD_NAMES,
  EXPLODING_KITTENS_CARD_TYPES,
  EXPLODING_KITTENS_MAX_CARDS,
  EXPLODING_KITTENS_MAX_PLAYERS,
  EXPLODING_KITTENS_PRIVATE_EVENT,
  getExplodingKittensStartingCardCounts,
  isExplodingKittensCardType,
  isExplodingKittensComboType,
  isExplodingKittensPrivateState,
  isExplodingKittensSettings,
  isExplodingKittensView,
} from './exploding-kittens'
export type {
  ExplodingKittensCardType,
  ExplodingKittensCardTypeCount,
  ExplodingKittensHandCard,
  ExplodingKittensPending,
  ExplodingKittensPendingKind,
  ExplodingKittensPhase,
  ExplodingKittensPlay,
  ExplodingKittensPlayKind,
  ExplodingKittensPrivateState,
  ExplodingKittensSeat,
  ExplodingKittensSeatStatus,
  ExplodingKittensSettings,
  ExplodingKittensView,
} from './exploding-kittens'
export {
  DEFAULT_WEREWOLF_SETTINGS,
  WEREWOLF_PRIVATE_EVENT,
  WEREWOLF_ROLE_COUNTS_BY_SCRIPT,
  WEREWOLF_ROLES,
  WEREWOLF_SCRIPTS,
  getWerewolfRoleCounts,
  getWerewolfPlayerRange,
  isWerewolfPrivateState,
  isWerewolfRoleId,
  isWerewolfScriptId,
  isWerewolfSettings,
  isWerewolfView,
  isWerewolfWinCondition,
} from './werewolf'
export type {
  WerewolfCamp,
  WerewolfGuardState,
  WerewolfHunterShot,
  WerewolfPhase,
  WerewolfPrivateState,
  WerewolfReplayEvent,
  WerewolfRoleCounts,
  WerewolfRoleId,
  WerewolfRoleInfo,
  WerewolfReview,
  WerewolfScriptId,
  WerewolfScriptInfo,
  WerewolfSeerResult,
  WerewolfSettings,
  WerewolfView,
  WerewolfWinCondition,
  WerewolfWitchState,
} from './werewolf'
export {
  DEFAULT_RUMMIKUB_SETTINGS,
  getRummikubBoardTilePoints,
  getRummikubComboTier,
  getRummikubRackTilePoints,
  isRummikubBoardTile,
  isRummikubColor,
  isRummikubFace,
  isRummikubMeld,
  isRummikubPrivateState,
  isRummikubSettings,
  isRummikubTile,
  isRummikubView,
  isValidRummikubMeld,
  RUMMIKUB_COLORS,
  RUMMIKUB_PRIVATE_EVENT,
  RUMMIKUB_TILE_COUNT,
} from './rummikub'
export type {
  RummikubSettings,
  RummikubBoardTile,
  RummikubColor,
  RummikubComboState,
  RummikubComboTier,
  RummikubEndReason,
  RummikubFace,
  RummikubJokerAssignment,
  RummikubMeld,
  RummikubMove,
  RummikubNumberTile,
  RummikubPlayerState,
  RummikubPrivateState,
  RummikubTile,
  RummikubTurnPreview,
  RummikubView,
} from './rummikub'
export {
  DEFAULT_GAME_ID,
  GAME_OPTIONS,
  getGameOption,
  isGameEnabled,
  isGameId,
  ROOM_CAPACITY,
} from './catalog'
export type { GameId, GameOption } from './catalog'
export { isWordGuessView } from './word-guess'
export type { BlankGameView } from './blank'
export type {
  DrawGuessPhase,
  DrawGuessPrompt,
  DrawGuessQuestionCategory,
  DrawGuessQuestionMode,
  DrawGuessSettings,
  DrawGuessView,
} from './draw-guess'
export type { GameView } from './types'
export type { WordGuessView } from './word-guess'

const GAME_VIEW_VALIDATORS: Record<GameId, (value: unknown) => boolean> = {
  'word-guess': isWordGuessView,
  //blank: isBlankGameView,
  'draw-guess': isDrawGuessView,
  rummikub: isRummikubView,
  werewolf: isWerewolfView,
  avalon: isAvalonView,
  'exploding-kittens': isExplodingKittensView,
}

export function getPlayerRange(
  gameId: GameId,
  settings: Record<string, unknown> | undefined,
): { min: number; max: number } {
  const option = getGameOption(gameId)
  const range =
    gameId === 'werewolf'
      ? getWerewolfPlayerRange(settings)
      : gameId === 'avalon'
        ? getAvalonPlayerRange(settings)
        : null
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
