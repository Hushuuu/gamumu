export const RUMMIKUB_COLORS = ['red', 'blue', 'black', 'yellow'] as const
export const RUMMIKUB_PRIVATE_EVENT = 'rummikub-private-state'
export const RUMMIKUB_TILE_COUNT = 106

export type RummikubColor = (typeof RUMMIKUB_COLORS)[number]

export interface RummikubFace {
  color: RummikubColor
  value: number
}

export interface RummikubNumberTile {
  id: number
  kind: 'number'
  color: RummikubColor
  value: number
}

export interface RummikubJokerTile {
  id: number
  kind: 'joker'
}

export type RummikubTile = RummikubNumberTile | RummikubJokerTile

export type RummikubBoardTile =
  | RummikubNumberTile
  | (RummikubJokerTile & { representedAs: RummikubFace })

export interface RummikubMeld {
  tiles: RummikubBoardTile[]
}

export interface RummikubJokerAssignment {
  tileId: number
  representedAs: RummikubFace
}

export interface RummikubMove {
  melds: number[][]
  jokers: RummikubJokerAssignment[]
}

export interface RummikubPlayerState {
  id: string
  tileCount: number
  hasOpened: boolean
}

export type RummikubEndReason = 'played-out' | 'blocked' | 'player-left'

function isRummikubEndReason(value: unknown): value is RummikubEndReason {
  return value === 'played-out' || value === 'blocked' || value === 'player-left'
}

export interface RummikubView {
  gameId: 'rummikub'
  table: RummikubMeld[]
  players: RummikubPlayerState[]
  currentPlayerId: string | null
  turnNumber: number
  drawPileCount: number
  consecutivePasses: number
  winnerId: string | null
  endReason: RummikubEndReason | null
  roundScores: Record<string, number>
}

export interface RummikubPrivateState {
  hand: RummikubTile[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isRummikubColor(value: unknown): value is RummikubColor {
  return typeof value === 'string' && RUMMIKUB_COLORS.some((color) => color === value)
}

export function isRummikubFace(value: unknown): value is RummikubFace {
  return (
    isRecord(value) &&
    isRummikubColor(value.color) &&
    Number.isInteger(value.value) &&
    Number(value.value) >= 1 &&
    Number(value.value) <= 13
  )
}

export function isRummikubTile(value: unknown): value is RummikubTile {
  if (!isRecord(value) || !Number.isInteger(value.id) || Number(value.id) < 0 ||
      Number(value.id) >= RUMMIKUB_TILE_COUNT) {
    return false
  }

  if (value.kind === 'joker') {
    return true
  }

  return (
    value.kind === 'number' &&
    isRummikubColor(value.color) &&
    Number.isInteger(value.value) &&
    Number(value.value) >= 1 &&
    Number(value.value) <= 13
  )
}

export function isRummikubBoardTile(value: unknown): value is RummikubBoardTile {
  if (!isRummikubTile(value)) {
    return false
  }

  if (value.kind === 'number') {
    return true
  }
  return 'representedAs' in value && isRummikubFace(value.representedAs)
}

export function isValidRummikubMeld(tiles: readonly RummikubBoardTile[]): boolean {
  if (
    tiles.length < 3 ||
    tiles.length > 13 ||
    tiles.some((tile) => !isRummikubBoardTile(tile)) ||
    new Set(tiles.map((tile) => tile.id)).size !== tiles.length
  ) {
    return false
  }

  const faces = tiles.map((tile) => {
    return tile.kind === 'joker'
      ? tile.representedAs
      : { color: tile.color, value: tile.value }
  })

  const isGroup =
    tiles.length <= 4 &&
    faces.every((face) => face.value === faces[0]!.value) &&
    new Set(faces.map((face) => face.color)).size === faces.length
  if (isGroup) {
    return true
  }

  const color = faces[0]!.color
  if (faces.some((face) => face.color !== color)) {
    return false
  }

  const values = faces.map((face) => face.value).sort((left, right) => left - right)
  return values.every((value, index) => value === values[0]! + index)
}

export function isRummikubMeld(value: unknown): value is RummikubMeld {
  return (
    isRecord(value) &&
    Array.isArray(value.tiles) &&
    value.tiles.every(isRummikubBoardTile) &&
    isValidRummikubMeld(value.tiles)
  )
}

export function getRummikubBoardTilePoints(tile: RummikubBoardTile): number {
  return tile.kind === 'joker' ? tile.representedAs.value : tile.value
}

export function getRummikubRackTilePoints(tile: RummikubTile): number {
  return tile.kind === 'joker' ? 30 : tile.value
}

export function isRummikubPrivateState(value: unknown): value is RummikubPrivateState {
  if (!isRecord(value) || !Array.isArray(value.hand) || value.hand.length > RUMMIKUB_TILE_COUNT) {
    return false
  }

  const handIds = new Set<number>()
  for (const tile of value.hand) {
    if (!isRummikubTile(tile) || handIds.has(tile.id)) {
      return false
    }
    handIds.add(tile.id)
  }

  return true
}

export function isRummikubView(value: unknown): value is RummikubView {
  if (
    !isRecord(value) ||
    value.gameId !== 'rummikub' ||
    !Array.isArray(value.table) ||
    !Array.isArray(value.players) ||
    value.players.length < 1 ||
    value.players.length > 4 ||
    (value.currentPlayerId !== null && typeof value.currentPlayerId !== 'string') ||
    !Number.isInteger(value.turnNumber) ||
    Number(value.turnNumber) < 1 ||
    !Number.isInteger(value.drawPileCount) ||
    Number(value.drawPileCount) < 0 ||
    Number(value.drawPileCount) > RUMMIKUB_TILE_COUNT ||
    !Number.isInteger(value.consecutivePasses) ||
    Number(value.consecutivePasses) < 0 ||
    Number(value.consecutivePasses) > 4 ||
    (value.winnerId !== null && typeof value.winnerId !== 'string') ||
    (value.endReason !== null && !isRummikubEndReason(value.endReason)) ||
    !isRecord(value.roundScores) ||
    !Object.values(value.roundScores).every(
      (score) => typeof score === 'number' && Number.isFinite(score),
    )
  ) {
    return false
  }

  const playerIds = new Set<string>()
  for (const player of value.players) {
    if (
      !isRecord(player) ||
      typeof player.id !== 'string' ||
      playerIds.has(player.id) ||
      !Number.isInteger(player.tileCount) ||
      Number(player.tileCount) < 0 ||
      Number(player.tileCount) > RUMMIKUB_TILE_COUNT ||
      typeof player.hasOpened !== 'boolean'
    ) {
      return false
    }
    playerIds.add(player.id)
  }

  if (
    (value.currentPlayerId !== null && !playerIds.has(value.currentPlayerId)) ||
    (value.winnerId !== null && !playerIds.has(value.winnerId))
  ) {
    return false
  }

  if (value.endReason === null) {
    if (value.currentPlayerId === null || value.winnerId !== null) {
      return false
    }
  } else if (value.currentPlayerId !== null) {
    return false
  } else if (value.endReason === 'player-left' ? value.winnerId !== null : value.winnerId === null) {
    return false
  }

  const tileIds = new Set<number>()
  for (const meld of value.table) {
    if (!isRummikubMeld(meld)) {
      return false
    }
    for (const tile of meld.tiles) {
      if (tileIds.has(tile.id)) {
        return false
      }
      tileIds.add(tile.id)
    }
  }

  return true
}
