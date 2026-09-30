import type { RoundPhase } from '../../../../shared/protocol'

export interface StoredWordGuess {
  gameId: 'word-guess'
  round: number
  totalRounds: number
  phase: RoundPhase
  answer: string
  hint: string
  roundEndsAt: number
  answeredPlayerIds: string[]
  correctPlayerIds: string[]
}
