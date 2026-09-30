import { buildRoleList, checkWinByElimination, resolveNight, type RoleCounts } from './common'
import type { ScriptDefinition } from '../types'

// 12 人為 3 狼人 + 狼王 + 4 村民 + 預言家/女巫/獵人/守衛；11 人少 1 村民，10 人再少 1 狼人。
const ROLE_TABLE: Record<number, RoleCounts> = {
  10: { werewolf: 2, wolfKing: 1, villager: 3, seer: 1, witch: 1, hunter: 1, guard: 1 },
  11: { werewolf: 3, wolfKing: 1, villager: 3, seer: 1, witch: 1, hunter: 1, guard: 1 },
  12: { werewolf: 3, wolfKing: 1, villager: 4, seer: 1, witch: 1, hunter: 1, guard: 1 },
}

export const wolfGuardScript: ScriptDefinition = {
  id: 'wolf-guard',
  roleSetup: (playerCount) => buildRoleList(ROLE_TABLE, playerCount),
  nightSteps: [['werewolf', 'wolfKing', 'seer', 'guard'], ['witch']],
  resolveNight,
  checkWin: checkWinByElimination,
}