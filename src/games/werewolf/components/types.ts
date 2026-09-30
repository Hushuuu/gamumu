import type { AvatarId } from '../../../../shared/avatars'

export interface PickerSeat {
  id: string
  name: string
  avatarId: AvatarId | null
  alive: boolean
  tags: string[]
}
