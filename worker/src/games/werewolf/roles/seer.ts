import { WEREWOLF_ROLES } from '../../../../../shared/games/werewolf'
import { isAlive } from '../helpers'
import type { RoleDefinition } from '../types'

export const seerRole: RoleDefinition = {
  id: 'seer',
  camp: 'good',
  nightAction: {
    action: 'seer_check',
    handle(game, playerId, payload) {
      const targetId = payload.targetId
      if (typeof targetId !== 'string' || !isAlive(game, targetId) || targetId === playerId) {
        return { ok: false, message: '請選擇一位存活的其他玩家。' }
      }
      if (game.night.seerTargetId !== null) {
        return { ok: false, message: '今晚已經查驗過了。' }
      }
      if (game.seerResults.some((result) => result.playerId === targetId)) {
        return { ok: false, message: '這位玩家已經查驗過了。' }
      }

      const role = game.roles[targetId]
      if (!role) {
        return { ok: false, message: '找不到這位玩家。' }
      }

      game.night.seerTargetId = targetId
      game.seerResults.push({ playerId: targetId, camp: WEREWOLF_ROLES[role].camp })
      return { ok: true }
    },
  },
  privateState(game) {
    return {
      seerResults: game.seerResults.map((result) => ({ ...result })),
      myTarget: game.phase === 'night' ? game.night.seerTargetId : null,
    }
  },
}
