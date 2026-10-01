export const AVATARS = [
  { id: 'bear', label: '小熊' },
  { id: 'cat', label: '花貓' },
  { id: 'fox', label: '狐狸' },
  { id: 'frog', label: '青蛙' },
  { id: 'owl', label: '貓頭鷹' },
  { id: 'panda', label: '熊貓' },
  { id: 'rabbit', label: '兔子' },
  { id: 'whale', label: '鯨魚' },
  { id: 'apple', label: '蘋果' },
  { id: 'banana', label: '香蕉' },
  { id: 'orange', label: '橘子' },
  { id: 'grape', label: '葡萄' },
  { id: 'strawberry', label: '草莓' },
  { id: 'watermelon', label: '西瓜' },
  { id: 'pineapple', label: '鳳梨' },
  { id: 'peach', label: '水蜜桃' },
] as const

export type AvatarId = (typeof AVATARS)[number]['id']

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && AVATARS.some((avatar) => avatar.id === value)
}
