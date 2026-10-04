import type { GameId } from '../../../shared/games'
//import { blankGame } from './blank'
import { avalonGame } from './avalon'
import { drawGuessGame } from './draw-guess'
import { rummikubGame } from './rummikub'
import { wordGuessGame } from './word-guess'
import { werewolfGame } from './werewolf'
import type { GameModule } from './types'

export const GAME_MODULES = {
  'word-guess': wordGuessGame,
  //blank: blankGame,
  'draw-guess': drawGuessGame,
  rummikub: rummikubGame,
  werewolf: werewolfGame,
  avalon: avalonGame,
} satisfies Record<GameId, GameModule>

export function getGameModule(gameId: GameId): GameModule {
  return GAME_MODULES[gameId]
}
