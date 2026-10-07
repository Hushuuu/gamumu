export const ROOM_CAPACITY = 12

const ALL_GAME_OPTIONS = [
  {
    id: 'word-guess',
    name: '猜詞派對',
    description: '五題猜詞挑戰',
    icon: 'games/icons/word-guess.svg',
    enabled: false,
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
    description: '',
    icon: 'games/icons/draw-guess.svg',
    enabled: true,
    minPlayers: 2,
    maxPlayers: ROOM_CAPACITY,
  },
  {
    id: 'rummikub',
    name: '拉密',
    description: '',
    icon: 'games/icons/rummikub.svg',
    enabled: true,
    minPlayers: 2,
    maxPlayers: 4,
  },
  {
    id: 'werewolf',
    name: '狼人殺',
    description: '',
    icon: 'games/icons/werewolf.svg',
    enabled: true,
    minPlayers: 6,
    maxPlayers: ROOM_CAPACITY,
  },
  {
    id: 'avalon',
    name: '阿瓦隆',
    description: '',
    icon: 'games/icons/avalon.svg',
    enabled: true,
    minPlayers: 5,
    maxPlayers: 10,
  },
] as const

export type GameId = (typeof ALL_GAME_OPTIONS)[number]['id']
export type GameOption = (typeof ALL_GAME_OPTIONS)[number]
export const GAME_OPTIONS = ALL_GAME_OPTIONS.filter((game) => game.enabled)

const defaultGame = GAME_OPTIONS[0]
if (!defaultGame) {
  throw new Error('At least one game must be enabled.')
}

export const DEFAULT_GAME_ID: GameId = defaultGame.id

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && ALL_GAME_OPTIONS.some((game) => game.id === value)
}

export function isGameEnabled(value: unknown): value is GameId {
  return isGameId(value) && GAME_OPTIONS.some((game) => game.id === value)
}

export function getGameOption(gameId: GameId): GameOption {
  return ALL_GAME_OPTIONS.find((game) => game.id === gameId) ?? ALL_GAME_OPTIONS[0]
}
