import type { RoleDefinition } from '../types'

export const hunterRole: RoleDefinition = {
  id: 'hunter',
  camp: 'good',
  triggersShotOnDeath: (cause) => cause === 'wolf' || cause === 'vote',
}
