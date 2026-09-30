export const AVATARS = [
  { id: 'bear', label: '小熊' },
  { id: 'cat', label: '花貓' },
  { id: 'fox', label: '狐狸' },
  { id: 'frog', label: '青蛙' },
  { id: 'owl', label: '貓頭鷹' },
  { id: 'panda', label: '熊貓' },
  { id: 'rabbit', label: '兔子' },
  { id: 'whale', label: '鯨魚' },
] as const

export type AvatarId = (typeof AVATARS)[number]['id']

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && AVATARS.some((avatar) => avatar.id === value)
}
