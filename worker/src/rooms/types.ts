import type { RoomStatus, RoundPhase } from '../../../shared/protocol'

export interface StoredPlayer {
  id: string
  name: string
  score: number
  tokenHash: string
  online: boolean
}

export interface StoredWordGuess {
  round: number
  totalRounds: number
  phase: RoundPhase
  answer: string
  hint: string
  roundEndsAt: number
  answeredPlayerIds: string[]
  correctPlayerIds: string[]
}

export interface StoredRoom {
  code: string
  hostId: string
  status: RoomStatus
  players: StoredPlayer[]
  game: StoredWordGuess | null
  createdAt: number
  updatedAt: number
}
