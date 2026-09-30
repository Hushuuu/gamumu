import { isAvatarId, type AvatarId } from './avatars'
import { isGameId, isGameView } from './games'
import type { GameId, GameView } from './games'

export { GAME_OPTIONS, ROOM_CAPACITY, getGameOption, isGameId } from './games'
export type { GameId, GameOption, GameView } from './games'

export type RoomStatus = 'waiting' | 'playing' | 'finished'
export type RoundPhase = 'guessing' | 'reveal'

export interface PlayerView {
  id: string
  name: string
  avatarId: AvatarId
  score: number
  online: boolean
  ready: boolean
  answered: boolean
  correct: boolean
}

export interface RoomSnapshot {
  code: string
  hostId: string
  status: RoomStatus
  capacity: number
  selectedGameId: GameId
  gameSettings: Record<string, unknown>
  players: PlayerView[]
  game: GameView | null
}

export interface GameEvent {
  gameId: GameId
  event: string
  payload: Record<string, unknown>
}

export type ClientMessage =
  | { type: 'authenticate'; token: string }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'select_avatar'; avatarId: AvatarId }
  | { type: 'select_game'; gameId: GameId }
  | { type: 'configure_game'; gameId: GameId; settings: Record<string, unknown> }
  | { type: 'kick_player'; playerId: string }
  | { type: 'start_game' }
  | { type: 'game_action'; gameId: GameId; action: string; payload: Record<string, unknown> }
  | { type: 'submit_answer'; answer: string }
  | { type: 'finish_game' }
  | { type: 'prepare_next_game' }
  | { type: 'leave_room' }

export type ServerMessage =
  | { type: 'auth_required' }
  | { type: 'authenticated'; playerId: string }
  | { type: 'auth_error'; code: string; message: string }
  | { type: 'kicked'; message: string }
  | { type: 'state'; state: RoomSnapshot }
  | ({ type: 'game_event' } & GameEvent)
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
    !isGameId(value.selectedGameId) ||
    !isRecord(value.gameSettings) ||
    !Array.isArray(value.players)
  ) {
    return false
  }

  const playersAreValid = value.players.every((player) => {
    return (
      isRecord(player) &&
      typeof player.id === 'string' &&
      typeof player.name === 'string' &&
      isAvatarId(player.avatarId) &&
      typeof player.score === 'number' &&
      typeof player.online === 'boolean' &&
      typeof player.ready === 'boolean' &&
      typeof player.answered === 'boolean' &&
      typeof player.correct === 'boolean'
    )
  })

  if (!playersAreValid) {
    return false
  }

  return value.game === null || (
    isGameView(value.game) &&
    value.game.gameId === value.selectedGameId
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
    case 'kicked':
      return typeof value.message === 'string'
    case 'authenticated':
      return typeof value.playerId === 'string'
    case 'auth_error':
    case 'action_error':
      return typeof value.code === 'string' && typeof value.message === 'string'
    case 'state':
      return isRoomSnapshot(value.state)
    case 'game_event':
      return (
        isGameId(value.gameId) &&
        typeof value.event === 'string' &&
        isRecord(value.payload)
      )
    case 'guess_result':
      return typeof value.correct === 'boolean'
    default:
      return false
  }
}
