import { WEREWOLF_ROLES, type WerewolfRoleId } from '../../../../../shared/games/werewolf'
import { aliveIds } from '../helpers'
import type { DeathCause, ScriptDefinition } from '../types'

const ROLE_TABLE: Record<number, Record<WerewolfRoleId, number>> = {
  6: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0 },
  7: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 1 },
  8: { werewolf: 3, villager: 2, seer: 1, witch: 1, hunter: 1 },
  9: { werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1 },
  10: { werewolf: 3, villager: 4, seer: 1, witch: 1, hunter: 1 },
  11: { werewolf: 4, villager: 4, seer: 1, witch: 1, hunter: 1 },
  12: { werewolf: 4, villager: 5, seer: 1, witch: 1, hunter: 1 },
}

export const classicScript: ScriptDefinition = {
  id: 'classic',
  roleSetup(playerCount) {
    const counts = ROLE_TABLE[playerCount]
    if (!counts) {
      throw new Error(`Unsupported player count: ${playerCount}`)
    }

    return (Object.keys(counts) as WerewolfRoleId[]).flatMap((roleId) => {
      return Array.from({ length: counts[roleId] }, () => roleId)
    })
  },
  nightSteps: [['werewolf', 'seer'], ['witch']],
  resolveNight(game) {
    const deaths: Array<{ playerId: string; cause: DeathCause }> = []
    const victimId = game.night.wolfVictimId
    if (game.night.witchSave) {
      game.witchPotions.antidote = false
    } else if (victimId !== null) {
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
  },
  checkWin(game) {
    const alive = aliveIds(game)
    const wolves = alive.filter((playerId) => WEREWOLF_ROLES[game.roles[playerId]!].camp === 'wolf')
    if (wolves.length === 0) {
      return 'good'
    }
    return alive.length === wolves.length ? 'wolf' : null
  },
}
