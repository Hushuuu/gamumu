import { isAlive, isTargetId } from '../helpers'
import type { RoleDefinition } from '../types'

export const guardRole: RoleDefinition = {
  id: 'guard',
  camp: 'good',
  nightAction: {
    action: 'guard_protect',
    handle(game, _playerId, payload) {
      const targetId = payload.targetId
      if (!isTargetId(targetId)) {
        return { ok: false, message: '守護目標格式不正確。' }
      }
      if (targetId !== null) {
        if (!isAlive(game, targetId)) {
          return { ok: false, message: '只能守護存活的玩家。' }
        }
        if (targetId === game.lastGuardTargetId) {
          return { ok: false, message: '不能連續兩晚守護同一位玩家。' }
        }
      }

      game.night.guardTargetId = targetId
      return { ok: true }
    },
    onStepEnd(game) {
      game.lastGuardTargetId = game.night.guardTargetId
    },
  },
  privateState(game) {
    return {
      guard: { lastTargetId: game.lastGuardTargetId },
      myTarget: game.phase === 'night' ? game.night.guardTargetId : null,
    }
  },
}