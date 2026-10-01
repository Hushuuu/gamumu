import { isAlive, isTargetId, isWolfCamp, randomInt } from '../helpers'
import type { RoleDefinition, RoleNightAction, StoredWerewolf } from '../types'

function wolfIds(game: StoredWerewolf): string[] {
  return game.playerIds.filter((playerId) => isWolfCamp(game, playerId))
}

// 狼人陣營（含狼王）共用同一個襲擊行動；票數結算只由 werewolf 角色的 onStepEnd 執行一次。
export const wolfPackAction: Pick<RoleNightAction, 'action' | 'handle'> = {
  action: 'wolf_target',
  handle(game, playerId, payload) {
    const targetId = payload.targetId
    if (!isTargetId(targetId)) {
      return { ok: false, message: '襲擊目標格式不正確。' }
    }
    if (targetId !== null && (!isAlive(game, targetId))) {
      return { ok: false, message: '只能選擇存活的其他玩家。' }
    }

    game.night.wolfPicks[playerId] = targetId
    return { ok: true }
  },
}

export const wolfPackPrivateState: NonNullable<RoleDefinition['privateState']> = (
  game,
  playerId,
  acting,
) => ({
  teammates: wolfIds(game).filter((wolfId) => wolfId !== playerId),
  wolfPicks: acting ? { ...game.night.wolfPicks } : {},
  myTarget: game.phase === 'night' ? (game.night.wolfPicks[playerId] ?? null) : null,
})

export const werewolfRole: RoleDefinition = {
  id: 'werewolf',
  camp: 'wolf',
  nightAction: {
    ...wolfPackAction,
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
  privateState: wolfPackPrivateState,
}