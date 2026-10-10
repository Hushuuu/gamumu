import type { DrawGuessPhase, DrawGuessSettings } from '../../../../shared/games/draw-guess'

export interface StoredDrawGuess {
  gameId: 'draw-guess'
  settings: DrawGuessSettings
  playerIds: string[]
  turnIndex: number
  round: number
  drawerId: string
  phase: DrawGuessPhase
  phaseEndsAt: number
  answer: string | null
  answerLength: number | null
  hint: string | null
  usedPromptIds: string[]
  correctPlayerIds: string[]
  passedPlayerIds: string[]
  drawerScored: boolean
}
