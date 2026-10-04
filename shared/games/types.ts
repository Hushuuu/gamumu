import type { BlankGameView } from './blank'
import type { AvalonView } from './avalon'
import type { DrawGuessView } from './draw-guess'
import type { WerewolfView } from './werewolf'
import type { WordGuessView } from './word-guess'
import type { RummikubView } from './rummikub'

export type GameView =
  | WordGuessView
  | BlankGameView
  | DrawGuessView
  | RummikubView
  | WerewolfView
  | AvalonView
