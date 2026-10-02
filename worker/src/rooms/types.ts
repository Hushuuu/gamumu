import type { AvatarId } from '../../../shared/avatars'
import type { GameId, RoomStatus, RoundPhase } from '../../../shared/protocol'
import type { StoredGame } from '../games/types'

export interface StoredPlayer {
  id: string
  name: string
  avatarId: AvatarId
  score: number
  tokenHash: string
  online: boolean
  ready: boolean
}

export interface StoredRoom {
  schemaVersion: 3
  code: string
  hostId: string
  status: RoomStatus
  selectedGameId: GameId
  gameSelectionConfirmed: boolean
  gameSettings?: Record<string, unknown>
  players: StoredPlayer[]
  game: StoredGame | null
  createdAt: number
  updatedAt: number
}

export interface PreviousStoredRoom extends Omit<StoredRoom, 'schemaVersion' | 'gameSelectionConfirmed'> {
  schemaVersion: 2
}

export interface LegacyStoredPlayer {
  id: string
  name: string
  score: number
  tokenHash: string
  online: boolean
}

export interface LegacyStoredWordGuess {
  round: number
  totalRounds: number
  phase: RoundPhase
  answer: string
  hint: string
  roundEndsAt: number
  answeredPlayerIds: string[]
  correctPlayerIds: string[]
}

export interface LegacyStoredRoom {
  code: string
  hostId: string
  status: RoomStatus
  players: LegacyStoredPlayer[]
  game: LegacyStoredWordGuess | null
  createdAt: number
  updatedAt: number
}
