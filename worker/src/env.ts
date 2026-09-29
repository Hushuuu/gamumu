import type { GameRoom } from './rooms/GameRoom'

export interface Env {
  GAME_ROOMS: DurableObjectNamespace<GameRoom>
  ALLOWED_ORIGINS?: string
}
