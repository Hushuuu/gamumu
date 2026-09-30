import { isAlive } from '../helpers'
import type { RoleDefinition } from '../types'

export const witchRole: RoleDefinition = {
  id: 'witch',
  camp: 'good',
  nightAction: {
    action: 'witch_action',
    handle(game, playerId, payload) {
      const choice = payload.choice
      if (choice === 'skip') {
        game.night.witchSave = false
        game.night.witchPoisonId = null
        return { ok: true }
      }

      if (choice === 'save') {
        const victimId = game.night.wolfVictimId
        if (!game.witchPotions.antidote) {
          return { ok: false, message: '解藥已經用完了。' }
        }
        if (victimId === null) {
          return { ok: false, message: '今晚沒有人被襲擊。' }
        }
        if (victimId === playerId && game.day > 1) {
          return { ok: false, message: '只有第一晚可以自救。' }
        }

        game.night.witchSave = true
        game.night.witchPoisonId = null
        return { ok: true }
      }

      if (choice === 'poison') {
        const targetId = payload.targetId
        if (!game.witchPotions.poison) {
          return { ok: false, message: '毒藥已經用完了。' }
        }
        if (typeof targetId !== 'string' || !isAlive(game, targetId) || targetId === playerId) {
          return { ok: false, message: '請選擇一位存活的其他玩家。' }
        }

        game.night.witchSave = false
        game.night.witchPoisonId = targetId
        return { ok: true }
      }

      return { ok: false, message: '女巫操作格式不正確。' }
    },
  },
  privateState(game, _playerId, acting) {
    return {
      witch: {
        antidote: game.witchPotions.antidote,
        poison: game.witchPotions.poison,
        victimId: acting && game.witchPotions.antidote ? game.night.wolfVictimId : null,
        saving: game.phase === 'night' ? game.night.witchSave : false,
        poisonTargetId: game.phase === 'night' ? game.night.witchPoisonId : null,
      },
    }
  },
}
