import { WEREWOLF_ROLE_COUNTS_BY_SCRIPT } from '../../../../../shared/games/werewolf'
import { buildRoleList, checkWinByElimination, resolveNight } from './common'
import type { ScriptDefinition } from '../types'

export const wolfGuardScript: ScriptDefinition = {
  id: 'wolf-guard',
  roleSetup: (playerCount) =>
    buildRoleList(WEREWOLF_ROLE_COUNTS_BY_SCRIPT['wolf-guard'], playerCount),
  nightSteps: [['werewolf', 'wolfKing', 'seer', 'guard'], ['witch']],
  resolveNight,
  checkWin: checkWinByElimination,
}