import { WEREWOLF_ROLES, type WerewolfRoleId } from '../../../../../shared/games/werewolf'
import { aliveIds } from '../helpers'
import type { DeathCause, ScriptDefinition } from '../types'

export type RoleCounts = Partial<Record<WerewolfRoleId, number>>

export function buildRoleList(table: Record<number, RoleCounts>, playerCount: number): WerewolfRoleId[] {
  const counts = table[playerCount]
  if (!counts) {
    throw new Error(`Unsupported player count: ${playerCount}`)
  }

  return (Object.keys(counts) as WerewolfRoleId[]).flatMap((roleId) => {
    return Array.from({ length: counts[roleId] ?? 0 }, () => roleId)
  })
}

// 未安排守衛的劇本 guardTargetId 恆為 null，行為等同沒有守護。
export const resolveNight: ScriptDefinition['resolveNight'] = (game) => {
  const deaths: Array<{ playerId: string; cause: DeathCause }> = []
  const victimId = game.night.wolfVictimId
  const guarded = victimId !== null && game.night.guardTargetId === victimId
  if (game.night.witchSave) {
    game.witchPotions.antidote = false
  }

  // 守衛與解藥同時保護同一人（同守同救）時，該玩家仍會死亡。
  if (victimId !== null && game.night.witchSave === guarded) {
    deaths.push({ playerId: victimId, cause: 'wolf' })
  }

  const poisonId = game.night.witchPoisonId
  if (poisonId !== null) {
    game.witchPotions.poison = false
    if (!deaths.some((death) => death.playerId === poisonId)) {
      deaths.push({ playerId: poisonId, cause: 'poison' })
    }
  }

  return deaths
}

export const checkWinByElimination: ScriptDefinition['checkWin'] = (game) => {
  const alive = aliveIds(game)
  const wolves = alive.filter((playerId) => WEREWOLF_ROLES[game.roles[playerId]!].camp === 'wolf')
  if (wolves.length === 0) {
    return 'good'
  }

  if (game.settings.winCondition === 'side') {
    let totalGood = 0
    let eliminatedGood = 0
    let villagersAlive = false
    let godsAlive = false

    for (const playerId of game.playerIds) {
      const roleId = game.roles[playerId]
      if (!roleId || WEREWOLF_ROLES[roleId].camp !== 'good') {
        continue
      }

      totalGood += 1
      if (!game.alive[playerId]) {
        eliminatedGood += 1
      } else if (roleId === 'villager') {
        villagersAlive = true
      } else {
        godsAlive = true
      }
    }

    if (
      (!villagersAlive || !godsAlive) &&
      eliminatedGood * 2 >= totalGood
    ) {
      return 'wolf'
    }
  }

  return alive.length === wolves.length ? 'wolf' : null
}