export const EXPLODING_KITTENS_PRIVATE_EVENT = 'exploding-kittens-private-state'
export const EXPLODING_KITTENS_MAX_PLAYERS = 9
export const EXPLODING_KITTENS_MAX_CARDS = 112

export const EXPLODING_KITTENS_CARD_TYPES = [
  'exploding-kitten',
  'defuse',
  'nope',
  'attack',
  'skip',
  'favor',
  'shuffle',
  'see-the-future',
  'cat-pudding',
  'cat-taro',
  'cat-matcha',
  'cat-peach',
  'cat-mochi',
] as const

export type ExplodingKittensCardType = (typeof EXPLODING_KITTENS_CARD_TYPES)[number]

export interface ExplodingKittensCardTypeCount {
  type: ExplodingKittensCardType
  count: number
}

export const EXPLODING_KITTENS_CARD_NAMES: Record<ExplodingKittensCardType, string> = {
  'exploding-kitten': '爆炸貓',
  defuse: '拆除',
  nope: '休想',
  attack: '攻擊',
  skip: '跳過',
  favor: '恩惠',
  shuffle: '洗混',
  'see-the-future': '預見未來',
  'cat-pudding': '布丁貓',
  'cat-taro': '芋頭貓',
  'cat-matcha': '抹茶貓',
  'cat-peach': '蜜桃貓',
  'cat-mochi': '麻糬貓',
}

export const EXPLODING_KITTENS_CARD_COPIES_PER_DECK: Record<ExplodingKittensCardType, number> = {
  'exploding-kitten': 4,
  defuse: 6,
  nope: 5,
  attack: 4,
  skip: 4,
  favor: 4,
  shuffle: 4,
  'see-the-future': 5,
  'cat-pudding': 4,
  'cat-taro': 4,
  'cat-matcha': 4,
  'cat-peach': 4,
  'cat-mochi': 4,
}

export function getExplodingKittensStartingCardCounts(
  playerCount: number,
): ExplodingKittensCardTypeCount[] {
  if (
    !Number.isInteger(playerCount) ||
    playerCount < 2 ||
    playerCount > EXPLODING_KITTENS_MAX_PLAYERS
  ) {
    return []
  }

  const deckCount = playerCount > 5 ? 2 : 1
  return EXPLODING_KITTENS_CARD_TYPES.map((type) => ({
    type,
    count: type === 'exploding-kitten'
      ? playerCount - 1
      : EXPLODING_KITTENS_CARD_COPIES_PER_DECK[type] * deckCount,
  }))
}

export const EXPLODING_KITTENS_PHASES = ['turn', 'nope', 'favor', 'defuse', 'finished'] as const
export type ExplodingKittensPhase = (typeof EXPLODING_KITTENS_PHASES)[number]

export const EXPLODING_KITTENS_PLAY_KINDS = ['card', 'pair', 'triple', 'five', 'nope'] as const
export type ExplodingKittensPlayKind = (typeof EXPLODING_KITTENS_PLAY_KINDS)[number]

export const EXPLODING_KITTENS_SEAT_STATUSES = ['alive', 'eliminated', 'left'] as const
export type ExplodingKittensSeatStatus = (typeof EXPLODING_KITTENS_SEAT_STATUSES)[number]

export const EXPLODING_KITTENS_PENDING_KINDS = ['nope', 'favor', 'defuse'] as const
export type ExplodingKittensPendingKind = (typeof EXPLODING_KITTENS_PENDING_KINDS)[number]

export interface ExplodingKittensSettings {
  turnTimeSeconds: number
  nopeWindowSeconds: number
  turnNoticeSeconds: number
}

export const DEFAULT_EXPLODING_KITTENS_SETTINGS: ExplodingKittensSettings = {
  turnTimeSeconds: 20,
  nopeWindowSeconds: 5,
  turnNoticeSeconds: 5,
}

export interface ExplodingKittensSeat {
  id: string
  name: string
  status: ExplodingKittensSeatStatus
  handCount: number
}

export interface ExplodingKittensFinalHand {
  playerId: string
  cards: ExplodingKittensCardType[]
}

export interface ExplodingKittensPlay {
  playerId: string
  kind: ExplodingKittensPlayKind
  cardTypes: ExplodingKittensCardType[]
  targetId: string | null
}

export interface ExplodingKittensPending {
  kind: ExplodingKittensPendingKind
  actorId: string
  targetId: string | null
  playKind: ExplodingKittensPlayKind | null
  cardTypes: ExplodingKittensCardType[]
  namedType: ExplodingKittensCardType | null
  nopeCount: number
  nopedBy: string[]
  nopeRespondedBy: string[]
}

export interface ExplodingKittensView {
  gameId: 'exploding-kittens'
  phase: ExplodingKittensPhase
  startingPlayerCount: number
  seats: ExplodingKittensSeat[]
  currentPlayerId: string | null
  turnsLeft: number
  drawPileCount: number
  discard: ExplodingKittensCardType[]
  finalHands?: ExplodingKittensFinalHand[] | null
  turnPlays: ExplodingKittensPlay[]
  lastTurnPlays: ExplodingKittensPlay[]
  pending: ExplodingKittensPending | null
  announcements: string[]
  phaseEndsAt: number | null
  settings: ExplodingKittensSettings
  eliminationOrder: string[]
  winnerId: string | null
}

export interface ExplodingKittensHandCard {
  id: string
  type: ExplodingKittensCardType
}

export interface ExplodingKittensPrivateState {
  hand: ExplodingKittensHandCard[]
  peek: ExplodingKittensCardType[] | null
  choice: 'give' | 'defuse' | null
  maxPosition: number | null
  canNope: boolean
}

type PlayerIdCheck = (id: unknown) => boolean

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

function isCount(value: unknown, max: number): boolean {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= max
}

function isPlayerCount(value: unknown): boolean {
  return (
    Number.isInteger(value) &&
    Number(value) >= 2 &&
    Number(value) <= EXPLODING_KITTENS_MAX_PLAYERS
  )
}

function isCardTypeList(value: unknown, max: number): value is ExplodingKittensCardType[] {
  return Array.isArray(value) && value.length <= max && value.every(isExplodingKittensCardType)
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isExplodingKittensCardType(value: unknown): value is ExplodingKittensCardType {
  return isOneOf(EXPLODING_KITTENS_CARD_TYPES, value)
}

export function canPlayExplodingKittensAlone(type: ExplodingKittensCardType): boolean {
  return (
    type === 'attack' ||
    type === 'skip' ||
    type === 'favor' ||
    type === 'shuffle' ||
    type === 'see-the-future'
  )
}

export function isExplodingKittensComboType(type: ExplodingKittensCardType): boolean {
  return type !== 'exploding-kitten' && type !== 'defuse'
}

export function isExplodingKittensSettings(value: unknown): value is ExplodingKittensSettings {
  return (
    isRecord(value) &&
    Number.isInteger(value.turnTimeSeconds) &&
    Number(value.turnTimeSeconds) >= 5 &&
    Number(value.turnTimeSeconds) <= 100 &&
    Number.isInteger(value.nopeWindowSeconds) &&
    Number(value.nopeWindowSeconds) >= 3 &&
    Number(value.nopeWindowSeconds) <= 10 &&
    Number.isInteger(value.turnNoticeSeconds ?? 5) &&
    Number(value.turnNoticeSeconds ?? 5) >= 5 &&
    Number(value.turnNoticeSeconds ?? 5) <= 20
  )
}

function isExplodingKittensSeat(value: unknown): value is ExplodingKittensSeat {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isOneOf(EXPLODING_KITTENS_SEAT_STATUSES, value.status) &&
    isCount(value.handCount, EXPLODING_KITTENS_MAX_CARDS)
  )
}

function isExplodingKittensPlay(value: unknown, isPlayer: PlayerIdCheck): value is ExplodingKittensPlay {
  return (
    isRecord(value) &&
    isPlayer(value.playerId) &&
    isOneOf(EXPLODING_KITTENS_PLAY_KINDS, value.kind) &&
    isCardTypeList(value.cardTypes, 5) &&
    value.cardTypes.length >= 1 &&
    (value.targetId === null || isPlayer(value.targetId))
  )
}

function isExplodingKittensFinalHand(value: unknown, isPlayer: PlayerIdCheck): value is ExplodingKittensFinalHand {
  return (
    isRecord(value) &&
    isPlayer(value.playerId) &&
    isCardTypeList(value.cards, EXPLODING_KITTENS_MAX_CARDS)
  )
}

function isExplodingKittensPending(value: unknown, isPlayer: PlayerIdCheck): value is ExplodingKittensPending {
  return (
    isRecord(value) &&
    isOneOf(EXPLODING_KITTENS_PENDING_KINDS, value.kind) &&
    isPlayer(value.actorId) &&
    (value.targetId === null || isPlayer(value.targetId)) &&
    (value.playKind === null || isOneOf(EXPLODING_KITTENS_PLAY_KINDS, value.playKind)) &&
    isCardTypeList(value.cardTypes, 5) &&
    (value.namedType === null || isExplodingKittensCardType(value.namedType)) &&
    isCount(value.nopeCount, EXPLODING_KITTENS_MAX_CARDS) &&
    Array.isArray(value.nopedBy) &&
    value.nopedBy.every(isPlayer) &&
    Array.isArray(value.nopeRespondedBy) &&
    value.nopeRespondedBy.length <= EXPLODING_KITTENS_MAX_PLAYERS &&
    value.nopeRespondedBy.every(isPlayer) &&
    new Set(value.nopeRespondedBy).size === value.nopeRespondedBy.length
  )
}

export function isExplodingKittensView(value: unknown): value is ExplodingKittensView {
  if (!isRecord(value) || value.gameId !== 'exploding-kittens') {
    return false
  }

  const seats = value.seats
  if (
    !isOneOf(EXPLODING_KITTENS_PHASES, value.phase) ||
    !isPlayerCount(value.startingPlayerCount) ||
    !Array.isArray(seats) ||
    seats.length !== value.startingPlayerCount ||
    !seats.every(isExplodingKittensSeat)
  ) {
    return false
  }

  const seatIds = new Set<string>(seats.map((seat: ExplodingKittensSeat) => seat.id))
  if (seatIds.size !== seats.length) {
    return false
  }

  const isSeat: PlayerIdCheck = (id) => typeof id === 'string' && seatIds.has(id)
  const isOptionalSeat = (id: unknown): boolean => id === null || isSeat(id)
  const finalHandsValid = value.finalHands === undefined || (value.phase === 'finished'
    ? Array.isArray(value.finalHands) &&
      value.finalHands.length === seats.length &&
      value.finalHands.every((hand) => isExplodingKittensFinalHand(hand, isSeat)) &&
      new Set(value.finalHands.map((hand) => (hand as ExplodingKittensFinalHand).playerId)).size === seats.length
    : value.finalHands === null)

  return (
    isOptionalSeat(value.currentPlayerId) &&
    isOptionalSeat(value.winnerId) &&
    isCount(value.turnsLeft, 2) &&
    isCount(value.drawPileCount, EXPLODING_KITTENS_MAX_CARDS) &&
    finalHandsValid &&
    isCardTypeList(value.discard, EXPLODING_KITTENS_MAX_CARDS) &&
    Array.isArray(value.turnPlays) &&
    value.turnPlays.every((play) => isExplodingKittensPlay(play, isSeat)) &&
    Array.isArray(value.lastTurnPlays) &&
    value.lastTurnPlays.every((play) => isExplodingKittensPlay(play, isSeat)) &&
    (value.pending === null || isExplodingKittensPending(value.pending, isSeat)) &&
    isStringList(value.announcements) &&
    (
      value.phaseEndsAt === null ||
      (Number.isSafeInteger(value.phaseEndsAt) && Number(value.phaseEndsAt) >= 0)
    ) &&
    isExplodingKittensSettings(value.settings) &&
    Array.isArray(value.eliminationOrder) &&
    value.eliminationOrder.every(isSeat)
  )
}

function isExplodingKittensHandCard(value: unknown): value is ExplodingKittensHandCard {
  return isRecord(value) && typeof value.id === 'string' && isExplodingKittensCardType(value.type)
}

export function isExplodingKittensPrivateState(value: unknown): value is ExplodingKittensPrivateState {
  return (
    isRecord(value) &&
    Array.isArray(value.hand) &&
    value.hand.every(isExplodingKittensHandCard) &&
    (value.peek === null || isCardTypeList(value.peek, 3)) &&
    (value.choice === null || value.choice === 'give' || value.choice === 'defuse') &&
    (
      value.maxPosition === null ||
      (Number.isInteger(value.maxPosition) && Number(value.maxPosition) >= 1)
    ) &&
    typeof value.canNope === 'boolean'
  )
}
