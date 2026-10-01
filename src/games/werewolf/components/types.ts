import type { AvatarId } from '../../../../shared/avatars'
import type { WerewolfRoleId } from '../../../../shared/games/werewolf'

export interface PickerSeat {
  id: string
  name: string
  avatarId: AvatarId | null
  alive: boolean
  tags: string[]
  guessRoleId: WerewolfRoleId | null
}

export const ROLE_GUESS_DRAG_TYPE = 'application/x-gamumu-werewolf-role'
