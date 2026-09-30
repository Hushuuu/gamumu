import type { StoredRoom } from '../rooms/types'

export function startBlankGame(room: StoredRoom, now: number): void {
  room.status = 'playing'
  room.game = { gameId: 'blank', startedAt: now }
}

export function finishBlankGame(room: StoredRoom): boolean {
  if (room.status !== 'playing' || room.game?.gameId !== 'blank') {
    return false
  }

  room.status = 'finished'
  room.game = null
  return true
}
