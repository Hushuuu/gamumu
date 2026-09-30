import type { WerewolfRoleId } from '../../../../../shared/games/werewolf'
import type { RoleDefinition } from '../types'
import { hunterRole } from './hunter'
import { seerRole } from './seer'
import { villagerRole } from './villager'
import { werewolfRole } from './werewolf'
import { witchRole } from './witch'

export const ROLE_DEFINITIONS: Record<WerewolfRoleId, RoleDefinition> = {
  werewolf: werewolfRole,
  villager: villagerRole,
  seer: seerRole,
  witch: witchRole,
  hunter: hunterRole,
}

export function getRole(roleId: WerewolfRoleId): RoleDefinition {
  return ROLE_DEFINITIONS[roleId]
}
