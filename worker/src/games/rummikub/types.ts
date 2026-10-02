import type {
  RummikubEndReason,
  RummikubMeld,
  RummikubTile,
} from '../../../../shared/games/rummikub'

export interface StoredRummikub {
  gameId: 'rummikub'
  tiles: Record<string, RummikubTile>
  drawPile: number[]
  hands: Record<string, number[]>
  table: RummikubMeld[]
  turnOrder: string[]
  currentPlayerId: string | null
  turnNumber: number
  openedPlayerIds: string[]
  consecutivePasses: number
  winnerId: string | null
  endReason: RummikubEndReason | null
  roundScores: Record<string, number>
}
