export const ROOM_CAPACITY = 10

export type RoomStatus = 'waiting' | 'playing' | 'finished'
export type RoundPhase = 'guessing' | 'reveal'

export interface PlayerView {
  id: string
  name: string
  score: number
  online: boolean
  answered: boolean
  correct: boolean
}

export interface WordGuessView {
  round: number
  totalRounds: number
  phase: RoundPhase
  hint: string
  answer: string | null
  roundEndsAt: number | null
}

export interface RoomSnapshot {
  code: string
  hostId: string
  status: RoomStatus
  capacity: number
  players: PlayerView[]
  game: WordGuessView | null
}

export type ClientMessage =
  | { type: 'authenticate'; token: string }
  | { type: 'start_game' }
  | { type: 'submit_answer'; answer: string }
  | { type: 'leave_room' }

export type ServerMessage =
  | { type: 'auth_required' }
  | { type: 'authenticated'; playerId: string }
  | { type: 'auth_error'; code: string; message: string }
  | { type: 'state'; state: RoomSnapshot }
  | { type: 'guess_result'; correct: boolean }
  | { type: 'action_error'; code: string; message: string }
  | { type: 'left_room' }
  | { type: 'room_expired' }

export interface RoomCredentials {
  code: string
  playerId: string
  token: string
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (
    !isRecord(value) ||
    typeof value.code !== 'string' ||
    typeof value.hostId !== 'string' ||
    !['waiting', 'playing', 'finished'].includes(String(value.status)) ||
    typeof value.capacity !== 'number' ||
    !Array.isArray(value.players)
  ) {
    return false
  }

  const playersAreValid = value.players.every((player) => {
    return (
      isRecord(player) &&
      typeof player.id === 'string' &&
      typeof player.name === 'string' &&
      typeof player.score === 'number' &&
      typeof player.online === 'boolean' &&
      typeof player.answered === 'boolean' &&
      typeof player.correct === 'boolean'
    )
  })

  if (!playersAreValid) {
    return false
  }

  if (value.game === null) {
    return true
  }

  return (
    isRecord(value.game) &&
    typeof value.game.round === 'number' &&
    typeof value.game.totalRounds === 'number' &&
    ['guessing', 'reveal'].includes(String(value.game.phase)) &&
    typeof value.game.hint === 'string' &&
    (value.game.answer === null || typeof value.game.answer === 'string') &&
    (value.game.roundEndsAt === null || typeof value.game.roundEndsAt === 'number')
  )
}

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }

  switch (value.type) {
    case 'auth_required':
    case 'left_room':
    case 'room_expired':
      return true
    case 'authenticated':
      return typeof value.playerId === 'string'
    case 'auth_error':
    case 'action_error':
      return typeof value.code === 'string' && typeof value.message === 'string'
    case 'state':
      return isRoomSnapshot(value.state)
    case 'guess_result':
      return typeof value.correct === 'boolean'
    default:
      return false
  }
}
