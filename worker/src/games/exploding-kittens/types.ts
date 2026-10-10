import type {
  ExplodingKittensCardType,
  ExplodingKittensPendingKind,
  ExplodingKittensPhase,
  ExplodingKittensPlayKind,
  ExplodingKittensSeatStatus,
  ExplodingKittensSettings,
} from '../../../../shared/games/exploding-kittens'

export interface StoredExplodingKittensCard {
  id: string
  type: ExplodingKittensCardType
}

export interface StoredExplodingKittensSeat {
  id: string
  name: string
  status: ExplodingKittensSeatStatus
  hand: StoredExplodingKittensCard[]
  finalHand: ExplodingKittensCardType[] | null
}

export interface StoredExplodingKittensPlay {
  playerId: string
  kind: ExplodingKittensPlayKind
  cardTypes: ExplodingKittensCardType[]
  targetId: string | null
}

export interface StoredExplodingKittensPending {
  kind: ExplodingKittensPendingKind
  actorId: string
  targetId: string | null
  playKind: ExplodingKittensPlayKind | null
  cardTypes: ExplodingKittensCardType[]
  namedType: ExplodingKittensCardType | null
  nopeCount: number
  nopedBy: string[]
  nopeRespondedBy: string[]
  kitten: StoredExplodingKittensCard | null
}

export interface StoredExplodingKittens {
  gameId: 'exploding-kittens'
  phase: ExplodingKittensPhase
  startingPlayerCount: number
  seats: StoredExplodingKittensSeat[]
  currentPlayerId: string | null
  turnsLeft: number
  /** 索引 0 為牌堆頂端。 */
  drawPile: StoredExplodingKittensCard[]
  discard: ExplodingKittensCardType[]
  turnPlays: StoredExplodingKittensPlay[]
  lastTurnPlays: StoredExplodingKittensPlay[]
  pending: StoredExplodingKittensPending | null
  peek: ExplodingKittensCardType[] | null
  announcements: string[]
  phaseEndsAt: number | null
  settings: ExplodingKittensSettings
  eliminationOrder: string[]
  winnerId: string | null
  cardSeq: number
}
