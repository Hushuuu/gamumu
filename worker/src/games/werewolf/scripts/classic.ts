import { buildRoleList, checkWinByElimination, resolveNight, type RoleCounts } from './common'
import type { ScriptDefinition } from '../types'

const ROLE_TABLE: Record<number, RoleCounts> = {
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
  roleSetup: (playerCount) => buildRoleList(ROLE_TABLE, playerCount),
  nightSteps: [['werewolf', 'seer'], ['witch']],
  resolveNight,
  checkWin: checkWinByElimination,
}