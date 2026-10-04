import type { GameId, GameView } from '../../../shared/games'
import type { PlayerView, RoomStatus, ServerMessage } from '../../../shared/protocol'
import type { StoredBlankGame } from './blank/types'
import type { StoredDrawGuess } from './draw-guess/types'
import type { StoredWerewolf } from './werewolf/types'
import type { StoredWordGuess } from './word-guess/types'
import type { StoredRummikub } from './rummikub/types'
import type { StoredAvalon } from './avalon/types'
import type { WerewolfRoleId } from '../../../shared/games/werewolf'

export type StoredGame =
  | StoredWordGuess
  | StoredBlankGame
  | StoredDrawGuess
  | StoredRummikub
  | StoredWerewolf
  | StoredAvalon

export interface GameRoomContext {
  status: RoomStatus
  hostId: string
  players: Array<Pick<PlayerView, 'id' | 'name' | 'score' | 'online'>>
  gameSettings?: Record<string, unknown>
  game: StoredGame | null
}

export interface GameStartOptions {
  devWerewolfRole?: WerewolfRoleId
}

export interface GameActionEvent {
  name: string
  payload: Record<string, unknown>
  audience?: 'player' | 'room'
  legacyMessage?: ServerMessage
}

export type GameActionResult =
  | { ok: true; changed: boolean; event?: GameActionEvent }
  | { ok: false; changed: boolean; code: string; message: string }

export interface GameModule {
  id: GameId
  /** 為 true 時，房間狀態每次廣播後會再把 privateState() 重送給每位在線玩家。 */
  pushPrivateState?: boolean
  defaultSettings(): Record<string, unknown>
  configure(
    room: GameRoomContext,
    playerId: string,
    settings: Record<string, unknown>,
  ): GameActionResult
  publicSettings(room: GameRoomContext): Record<string, unknown>
  privateState(room: GameRoomContext, playerId: string): GameActionEvent | null
  start(room: GameRoomContext, now: number, options?: GameStartOptions): void
  handleAction(
    room: GameRoomContext,
    playerId: string,
    action: string,
    payload: Record<string, unknown>,
    now: number,
  ): GameActionResult
  nextAlarmAt(room: GameRoomContext): number | null
  handleAlarm(room: GameRoomContext, now: number): boolean
  onPlayerLeave(room: GameRoomContext, playerId: string, now: number): boolean
  playerFlags(room: GameRoomContext, playerId: string): Pick<PlayerView, 'answered' | 'correct'>
  toView(room: GameRoomContext): GameView | null
}
