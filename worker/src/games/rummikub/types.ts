import type {
  RummikubComboState,
  RummikubEndReason,
  RummikubMeld,
  RummikubMove,
  RummikubTile,
  RummikubTurnPreview,
} from '../../../../shared/games/rummikub'

export interface StoredRummikub {
  gameId: 'rummikub'
  tiles: Record<string, RummikubTile>
  drawPile: number[]
  hands: Record<string, number[]>
  table: RummikubMeld[]
  combo?: RummikubComboState | null
  lastTurnCombo?: RummikubComboState | null
  lastTurnChangedMelds?: number[][]
  pendingTurnMove?: {
    playerId: string
    turnNumber: number
    move: RummikubMove
  } | null
  pendingTurnPreview?: RummikubTurnPreview | null
  turnOrder: string[]
  currentPlayerId: string | null
  turnTimeSeconds?: number | null
  turnDeadlineAt?: number | null
  turnNumber: number
  openedPlayerIds: string[]
  consecutivePasses: number
  winnerId: string | null
  endReason: RummikubEndReason | null
  roundScores: Record<string, number>
}
