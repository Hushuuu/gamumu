import type { BlankGameView } from './blank'
import type { DrawGuessView } from './draw-guess'
import type { WordGuessView } from './word-guess'

export type GameView = WordGuessView | BlankGameView | DrawGuessView
