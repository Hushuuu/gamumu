import { WEREWOLF_ROLE_COUNTS_BY_SCRIPT } from '../../../../../shared/games/werewolf'
import { buildRoleList, checkWinByElimination, resolveNight } from './common'
import type { ScriptDefinition } from '../types'

export const classicScript: ScriptDefinition = {
  id: 'classic',
  roleSetup: (playerCount) =>
    buildRoleList(WEREWOLF_ROLE_COUNTS_BY_SCRIPT.classic, playerCount),
  nightSteps: [['werewolf', 'seer'], ['witch']],
  resolveNight,
  checkWin: checkWinByElimination,
}