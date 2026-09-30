import type { WerewolfRoleId } from '../../../../../shared/games/werewolf'
import type { RoleDefinition } from '../types'
import { guardRole } from './guard'
import { hunterRole } from './hunter'
import { seerRole } from './seer'
import { villagerRole } from './villager'
import { werewolfRole } from './werewolf'
import { witchRole } from './witch'
import { wolfKingRole } from './wolfKing'

export const ROLE_DEFINITIONS: Record<WerewolfRoleId, RoleDefinition> = {
  werewolf: werewolfRole,
  wolfKing: wolfKingRole,
  guard: guardRole,
  villager: villagerRole,
  seer: seerRole,
  witch: witchRole,
  hunter: hunterRole,
}

export function getRole(roleId: WerewolfRoleId): RoleDefinition {
  return ROLE_DEFINITIONS[roleId]
}
