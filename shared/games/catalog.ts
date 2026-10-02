export const ROOM_CAPACITY = 12

export const GAME_OPTIONS = [
  {
    id: 'word-guess',
    name: '猜詞派對',
    description: '五題猜詞挑戰',
    icon: 'Aa',
    minPlayers: 2,
    maxPlayers: ROOM_CAPACITY,
  },
  // {
  //   id: 'blank',
  //   name: '空白測試遊戲',
  //   description: '驗證新遊戲的選擇、啟動與結束流程。',
  //   icon: '＋',
  //   minPlayers: 1,
  //   maxPlayers: ROOM_CAPACITY,
  // },
  {
    id: 'draw-guess',
    name: '你畫我猜',
    description: '輪流設定題目、畫圖，讓其他玩家猜答案。',
    icon: '✎',
    minPlayers: 2,
    maxPlayers: ROOM_CAPACITY,
  },
  {
    id: 'rummikub',
    name: '拉密',
    description: '組成數字牌組並重整桌面，搶先出清手牌。',
    icon: '13',
    minPlayers: 2,
    maxPlayers: 4,
  },
  {
    id: 'werewolf',
    name: '狼人殺',
    description: '經典社交推理，找出隱藏在村莊裡的狼人。',
    icon: '🐺',
    minPlayers: 6,
    maxPlayers: ROOM_CAPACITY,
  },
] as const

export type GameId = (typeof GAME_OPTIONS)[number]['id']
export type GameOption = (typeof GAME_OPTIONS)[number]
export const DEFAULT_GAME_ID: GameId = 'word-guess'

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && GAME_OPTIONS.some((game) => game.id === value)
}

export function getGameOption(gameId: GameId): GameOption {
  return GAME_OPTIONS.find((game) => game.id === gameId) ?? GAME_OPTIONS[0]
}
