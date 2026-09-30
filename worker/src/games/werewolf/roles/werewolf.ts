import { isAlive, randomInt, isTargetId } from '../helpers'
import type { RoleDefinition, StoredWerewolf } from '../types'

function wolfIds(game: StoredWerewolf): string[] {
  return game.playerIds.filter((playerId) => game.roles[playerId] === 'werewolf')
}

export const werewolfRole: RoleDefinition = {
  id: 'werewolf',
  camp: 'wolf',
  nightAction: {
    action: 'wolf_target',
    handle(game, playerId, payload) {
      const targetId = payload.targetId
      if (!isTargetId(targetId)) {
        return { ok: false, message: '襲擊目標格式不正確。' }
      }
      if (targetId !== null) {
        if (!isAlive(game, targetId) || game.roles[targetId] === 'werewolf') {
          return { ok: false, message: '只能選擇存活的非狼人玩家。' }
        }
      }

      game.night.wolfPicks[playerId] = targetId
      return { ok: true }
    },
    onStepEnd(game) {
      const counts = new Map<string, number>()
      for (const [wolfId, targetId] of Object.entries(game.night.wolfPicks)) {
        if (targetId !== null && isAlive(game, wolfId)) {
          counts.set(targetId, (counts.get(targetId) ?? 0) + 1)
        }
      }

      const highest = Math.max(0, ...counts.values())
      const leaders = [...counts.entries()]
        .filter(([, count]) => count === highest && highest > 0)
        .map(([targetId]) => targetId)
      game.night.wolfVictimId = leaders.length > 0 ? leaders[randomInt(leaders.length)]! : null
    },
  },
  privateState(game, playerId, acting) {
    return {
      teammates: wolfIds(game).filter((wolfId) => wolfId !== playerId),
      wolfPicks: acting ? { ...game.night.wolfPicks } : {},
      myTarget: game.phase === 'night' ? (game.night.wolfPicks[playerId] ?? null) : null,
    }
  },
}
