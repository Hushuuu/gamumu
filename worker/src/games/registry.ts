import type { GameId } from '../../../shared/games'
import { blankGame } from './blank'
import { drawGuessGame } from './draw-guess'
import { wordGuessGame } from './word-guess'
import { werewolfGame } from './werewolf'
import type { GameModule } from './types'

export const GAME_MODULES = {
  'word-guess': wordGuessGame,
  blank: blankGame,
  'draw-guess': drawGuessGame,
  werewolf: werewolfGame,
} satisfies Record<GameId, GameModule>

export function getGameModule(gameId: GameId): GameModule {
  return GAME_MODULES[gameId]
}
