import { WEREWOLF_ROLES } from '../../../../shared/games/werewolf'
import type { StoredWerewolf } from './types'

export function isWolfCamp(game: StoredWerewolf, playerId: string): boolean {
  const roleId = game.roles[playerId]
  return roleId !== undefined && WEREWOLF_ROLES[roleId].camp === 'wolf'
}

export function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) {
    return 0
  }

  const range = 0x1_0000_0000
  const limit = range - (range % maxExclusive)
  const buffer = new Uint32Array(1)
  do {
    crypto.getRandomValues(buffer)
  } while (buffer[0]! >= limit)
  return buffer[0]! % maxExclusive
}

export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    const current = result[index]!
    result[index] = result[swapIndex]!
    result[swapIndex] = current
  }
  return result
}

export function isAlive(game: StoredWerewolf, playerId: string): boolean {
  return game.alive[playerId] === true
}

export function aliveIds(game: StoredWerewolf): string[] {
  return game.playerIds.filter((playerId) => isAlive(game, playerId))
}

export function isTargetId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= 80)
}
