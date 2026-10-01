import type { GameRoom } from './rooms/GameRoom'

export interface Env {
  GAME_ROOMS: DurableObjectNamespace<GameRoom>
  ALLOWED_ORIGINS?: string
  BETA_CODES?: string
  BETA_SESSION_SECRET?: string
  ENABLE_DEV_ROLE_SELECTION?: string
}
