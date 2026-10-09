import {
  canPlayExplodingKittensAlone,
  EXPLODING_KITTENS_CARD_NAMES,
  EXPLODING_KITTENS_CARD_TYPES,
  isExplodingKittensComboType,
  type ExplodingKittensCardType,
  type ExplodingKittensHandCard,
  type ExplodingKittensPhase,
  type ExplodingKittensPlayKind,
  type ExplodingKittensSeat,
  type ExplodingKittensSeatStatus,
  type ExplodingKittensView,
} from '../../../shared/games/exploding-kittens'

export type ExplodingKittensShape = Exclude<ExplodingKittensPlayKind, 'nope'>

export interface PlayAnalysis {
  kind: ExplodingKittensShape | null
  needsTarget: boolean
  needsNamedType: boolean
  message: string
}

export function cardName(type: ExplodingKittensCardType): string {
  return EXPLODING_KITTENS_CARD_NAMES[type]
}

export function analyzePlay(types: ExplodingKittensCardType[]): PlayAnalysis {
  const invalid = (message: string): PlayAnalysis => ({
    kind: null,
    needsTarget: false,
    needsNamedType: false,
    message,
  })

  if (types.length === 0) {
    return invalid('選擇 1–5 張手牌來出牌')
  }

  if (types.length === 1) {
    const type = types[0]
    if (!isExplodingKittensComboType(type)) {
      return invalid(`${cardName(type)} 不能主動打出`)
    }
    if (!canPlayExplodingKittensAlone(type)) {
      return invalid(`${cardName(type)} 不能單獨打出，請選 2 張相同、3 張相同或 5 張不同的牌`)
    }
    return {
      kind: 'card',
      needsTarget: type === 'favor',
      needsNamedType: false,
      message: type === 'favor'
        ? '恩惠：選擇一位玩家，由對方決定交出哪張牌'
        : `單張：${cardName(type)}`,
    }
  }

  if (types.some((type) => !isExplodingKittensComboType(type))) {
    return invalid('爆炸貓與拆除卡不能用來組合出牌')
  }

  const distinctCount = new Set(types).size
  if (types.length === 2 && distinctCount === 1) {
    return {
      kind: 'pair',
      needsTarget: true,
      needsNamedType: false,
      message: '成雙成對：隨機偷目標玩家一張手牌',
    }
  }
  if (types.length === 3 && distinctCount === 1) {
    return {
      kind: 'triple',
      needsTarget: true,
      needsNamedType: true,
      message: '三條：指定目標與一種牌名，目標沒有該牌則無效',
    }
  }
  if (types.length === 5 && distinctCount === 5) {
    return {
      kind: 'five',
      needsTarget: false,
      needsNamedType: true,
      message: '五彩繽紛：從棄牌區指定一張牌',
    }
  }
  return invalid('只能組成 2 張相同、3 張相同或 5 張不同的牌')
}

export function targetCandidates(seats: ExplodingKittensSeat[], playerId: string): ExplodingKittensSeat[] {
  return seats.filter((seat) => seat.id !== playerId && seat.status === 'alive' && seat.handCount > 0)
}

export function namedOptionsFor(
  kind: ExplodingKittensShape | null,
  discard: ExplodingKittensCardType[],
): ExplodingKittensCardType[] {
  if (kind === 'triple') {
    return [...EXPLODING_KITTENS_CARD_TYPES]
  }
  if (kind === 'five') {
    return EXPLODING_KITTENS_CARD_TYPES.filter((type) => discard.includes(type))
  }
  return []
}

export function sortHand(hand: ExplodingKittensHandCard[]): ExplodingKittensHandCard[] {
  const order = (type: ExplodingKittensCardType): number => EXPLODING_KITTENS_CARD_TYPES.indexOf(type)
  return [...hand].sort((left, right) => order(left.type) - order(right.type) || left.id.localeCompare(right.id))
}

export function explodingKittensRanking(view: ExplodingKittensView): ExplodingKittensSeat[] {
  const orderedIds: Array<string | null> = [
    view.winnerId,
    ...[...view.eliminationOrder].reverse(),
    ...view.seats.map((seat) => seat.id),
  ]
  const ranked: ExplodingKittensSeat[] = []
  for (const id of orderedIds) {
    const seat = view.seats.find((item) => item.id === id)
    if (seat && !ranked.includes(seat)) {
      ranked.push(seat)
    }
  }
  return ranked
}

export function remainingSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1_000))
}

export const EXPLODING_KITTENS_CARDS_PER_DECK = 56

export function explodingKittensDeckCount(playerCount: number): number {
  return playerCount >= 6 ? 2 : 1
}

export function countCardTypes(types: ExplodingKittensCardType[]): Array<{ type: ExplodingKittensCardType; count: number }> {
  return EXPLODING_KITTENS_CARD_TYPES
    .map((type) => ({ type, count: types.filter((item) => item === type).length }))
    .filter((entry) => entry.count > 0)
}

export function formatCardList(types: ExplodingKittensCardType[]): string {
  return countCardTypes(types)
    .map(({ type, count }) => (count > 1 ? `${cardName(type)} × ${count}` : cardName(type)))
    .join('、')
}

export function nopeOutcomeLabel(nopeCount: number): string {
  if (nopeCount === 0) {
    return '尚無休想，效果會生效'
  }
  if (nopeCount % 2 === 1) {
    return `${nopeCount} 張休想（奇數），效果會被取消`
  }
  return `${nopeCount} 張休想（偶數），效果仍會生效`
}

export const PHASE_LABELS: Record<ExplodingKittensPhase, string> = {
  turn: '出牌階段',
  nope: '休想判定',
  favor: '恩惠交換',
  defuse: '拆除放回',
  finished: '對局結束',
}

export const PLAY_KIND_LABELS: Record<ExplodingKittensPlayKind, string> = {
  card: '單張',
  pair: '成雙成對',
  triple: '三條',
  five: '五彩繽紛',
  nope: '休想',
}

export const SEAT_STATUS_LABELS: Record<ExplodingKittensSeatStatus, string> = {
  alive: '存活',
  eliminated: '已淘汰',
  left: '已離開',
}
