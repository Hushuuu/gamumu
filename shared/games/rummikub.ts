export const RUMMIKUB_COLORS = ['red', 'blue', 'black', 'yellow'] as const
export const RUMMIKUB_PRIVATE_EVENT = 'rummikub-private-state'
export const RUMMIKUB_TILE_COUNT = 106

export interface RummikubSettings {
  turnTimeSeconds: number | null
}

export const DEFAULT_RUMMIKUB_SETTINGS: RummikubSettings = {
  turnTimeSeconds: 60,
}

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

export interface RummikubComboState {
  playerId: string
  count: number
}

export interface RummikubTurnPreview {
  playerId: string
  turnNumber: number
  melds: RummikubMeld[]
}

export type RummikubComboTier = 'spark' | 'surge' | 'overdrive'

export function getRummikubComboTier(count: number): RummikubComboTier {
  if (count >= 7) {
    return 'overdrive'
  }
  return count >= 4 ? 'surge' : 'spark'
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
  combo?: RummikubComboState | null
  lastTurnCombo?: RummikubComboState | null
  lastTurnChangedMelds?: number[][]
  turnPreview?: RummikubTurnPreview | null
  turnDeadlineAt: number | null
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

function isRummikubComboState(value: unknown): value is RummikubComboState {
  return (
    isRecord(value) &&
    typeof value.playerId === 'string' &&
    Number.isInteger(value.count) &&
    Number(value.count) >= 1 &&
    Number(value.count) <= RUMMIKUB_TILE_COUNT
  )
}

function isRummikubMeldTileIds(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value.length <= 13 &&
    value.every((tileId) => {
      return (
        typeof tileId === 'number' &&
        Number.isInteger(tileId) &&
        tileId >= 0 &&
        tileId < RUMMIKUB_TILE_COUNT
      )
    }) &&
    new Set(value).size === value.length
  )
}

function isRummikubMeldTileIdGroups(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every(isRummikubMeldTileIds)
}

export function isRummikubSettings(value: unknown): value is RummikubSettings {
  return (
    isRecord(value) &&
    (
      value.turnTimeSeconds === null ||
      (
        Number.isInteger(value.turnTimeSeconds) &&
        Number(value.turnTimeSeconds) >= 15 &&
        Number(value.turnTimeSeconds) <= 300
      )
    )
  )
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

export function areRummikubMeldsEqual(
  left: Pick<RummikubMeld, 'tiles'>,
  right: Pick<RummikubMeld, 'tiles'>,
): boolean {
  if (left.tiles.length !== right.tiles.length) {
    return false
  }

  const rightTilesById = new Map(right.tiles.map((tile) => [tile.id, tile]))
  return left.tiles.every((leftTile) => {
    const rightTile = rightTilesById.get(leftTile.id)
    if (!rightTile || rightTile.kind !== leftTile.kind) {
      return false
    }
    if (leftTile.kind === 'number') {
      return (
        rightTile.kind === 'number' &&
        leftTile.color === rightTile.color &&
        leftTile.value === rightTile.value
      )
    }
    return (
      rightTile.kind === 'joker' &&
      leftTile.representedAs.color === rightTile.representedAs.color &&
      leftTile.representedAs.value === rightTile.representedAs.value
    )
  })
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

function isRummikubTurnPreview(value: unknown): value is RummikubTurnPreview {
  if (
    !isRecord(value) ||
    typeof value.playerId !== 'string' ||
    !Number.isInteger(value.turnNumber) ||
    Number(value.turnNumber) < 1 ||
    !Array.isArray(value.melds) ||
    value.melds.length > RUMMIKUB_TILE_COUNT
  ) {
    return false
  }

  const tileIds = new Set<number>()
  for (const meld of value.melds) {
    if (
      !isRecord(meld) ||
      !Array.isArray(meld.tiles) ||
      meld.tiles.length < 1 ||
      meld.tiles.length > 13
    ) {
      return false
    }

    for (const tile of meld.tiles) {
      if (!isRummikubBoardTile(tile) || tileIds.has(tile.id)) {
        return false
      }
      tileIds.add(tile.id)
    }
  }

  return true
}

export function isRummikubView(value: unknown): value is RummikubView {
  if (!isRecord(value)) {
    return false
  }

  const combo = value.combo
  const lastTurnCombo = value.lastTurnCombo
  const lastTurnChangedMelds = value.lastTurnChangedMelds
  const turnPreview = value.turnPreview
  if (
    (combo !== undefined && combo !== null && !isRummikubComboState(combo)) ||
    (
      lastTurnCombo !== undefined &&
      lastTurnCombo !== null &&
      !isRummikubComboState(lastTurnCombo)
    ) ||
    (
      lastTurnChangedMelds !== undefined &&
      !isRummikubMeldTileIdGroups(lastTurnChangedMelds)
    ) ||
    (
      turnPreview !== undefined &&
      turnPreview !== null &&
      !isRummikubTurnPreview(turnPreview)
    )
  ) {
    return false
  }

  if (
    value.gameId !== 'rummikub' ||
    !Array.isArray(value.table) ||
    !Array.isArray(value.players) ||
    value.players.length < 1 ||
    value.players.length > 4 ||
    (value.currentPlayerId !== null && typeof value.currentPlayerId !== 'string') ||
    (
      value.turnDeadlineAt !== null &&
      (
        typeof value.turnDeadlineAt !== 'number' ||
        !Number.isSafeInteger(value.turnDeadlineAt) ||
        value.turnDeadlineAt < 0
      )
    ) ||
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
  const playerTileCounts = new Map<string, number>()
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
    playerTileCounts.set(player.id, Number(player.tileCount))
  }

  if (
    (value.currentPlayerId !== null && !playerIds.has(value.currentPlayerId)) ||
    (value.winnerId !== null && !playerIds.has(value.winnerId))
  ) {
    return false
  }

  if (
    lastTurnCombo !== undefined &&
    lastTurnCombo !== null &&
    !playerIds.has(lastTurnCombo.playerId)
  ) {
    return false
  }

  if (
    combo !== undefined &&
    combo !== null &&
    (
      !playerIds.has(combo.playerId) ||
      value.currentPlayerId !== combo.playerId ||
      combo.count > (playerTileCounts.get(combo.playerId) ?? 0)
    )
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
  const tableMeldTileIdSignatures = new Set<string>()
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
    tableMeldTileIdSignatures.add(
      meld.tiles.map((tile) => tile.id).sort((left, right) => left - right).join(','),
    )
  }

  if (turnPreview !== undefined && turnPreview !== null) {
    if (
      turnPreview.playerId !== value.currentPlayerId ||
      turnPreview.turnNumber !== Number(value.turnNumber)
    ) {
      return false
    }

    const previewTileIds = new Set(
      turnPreview.melds.flatMap((meld) => meld.tiles.map((tile) => tile.id)),
    )
    if ([...tileIds].some((tileId) => !previewTileIds.has(tileId))) {
      return false
    }
  }

  if (lastTurnChangedMelds !== undefined) {
    const changedMeldSignatures = new Set<string>()
    for (const changedMeldTileIds of lastTurnChangedMelds) {
      const signature = [...changedMeldTileIds].sort((left, right) => left - right).join(',')
      if (
        !tableMeldTileIdSignatures.has(signature) ||
        changedMeldSignatures.has(signature)
      ) {
        return false
      }
      changedMeldSignatures.add(signature)
    }
  }

  return true
}
