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
  correctPlayerIds: string[]
  drawerScored: boolean
}
