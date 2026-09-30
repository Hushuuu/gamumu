import type { RoleDefinition } from '../types'
import { wolfPackAction, wolfPackPrivateState } from './werewolf'

export const wolfKingRole: RoleDefinition = {
  id: 'wolfKing',
  camp: 'wolf',
  nightAction: wolfPackAction,
  triggersShotOnDeath: (cause) => cause === 'wolf' || cause === 'vote',
  privateState: wolfPackPrivateState,
}