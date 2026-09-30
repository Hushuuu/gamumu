import { isAvatarId, type AvatarId } from './avatars'

export const ROOM_CAPACITY = 10

export type RoomStatus = 'waiting' | 'playing' | 'finished'
export type RoundPhase = 'guessing' | 'reveal'

export const GAME_OPTIONS = [
  {
    id: 'word-guess',
    name: '猜詞派對',
    description: '五題猜詞挑戰，答對累積分數。',
  },
  {
    id: 'blank',
    name: '空白測試遊戲',
    description: '驗證新遊戲的選擇、啟動與結束流程。',
  },
] as const

export type GameId = (typeof GAME_OPTIONS)[number]['id']

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && GAME_OPTIONS.some((game) => game.id === value)
}

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

export interface WordGuessView {
  gameId: 'word-guess'
  round: number
  totalRounds: number
  phase: RoundPhase
  hint: string
  answer: string | null
  roundEndsAt: number | null
}

export interface BlankGameView {
  gameId: 'blank'
  startedAt: number
}

export type GameView = WordGuessView | BlankGameView

export interface RoomSnapshot {
  code: string
  hostId: string
  status: RoomStatus
  capacity: number
  selectedGameId: GameId
  players: PlayerView[]
  game: GameView | null
}

export type ClientMessage =
  | { type: 'authenticate'; token: string }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'select_avatar'; avatarId: AvatarId }
  | { type: 'select_game'; gameId: GameId }
  | { type: 'kick_player'; playerId: string }
  | { type: 'start_game' }
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

  if (value.game === null) {
    return true
  }

  if (
    !isRecord(value.game) ||
    !isGameId(value.game.gameId) ||
    value.game.gameId !== value.selectedGameId
  ) {
    return false
  }

  if (value.game.gameId === 'blank') {
    return typeof value.game.startedAt === 'number'
  }

  return (
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
    case 'kicked':
      return typeof value.message === 'string'
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
