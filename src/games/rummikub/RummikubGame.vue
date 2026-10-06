<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as Tone from 'tone'
import {
  areRummikubMeldsEqual,
  getRummikubComboTier,
} from '../../../shared/games/rummikub'
import {
  getRummikubBoardTilePoints,
  isRummikubColor,
  isRummikubPrivateState,
  isRummikubSettings,
  isValidRummikubMeld,
  RUMMIKUB_PRIVATE_EVENT,
} from '../../../shared/games/rummikub'
import type {
  RummikubBoardTile,
  RummikubColor,
  RummikubFace,
  RummikubMeld,
  RummikubMove,
  RummikubTile,
} from '../../../shared/games/rummikub'
import type { GameEvent, GameView, PlayerView } from '../../../shared/protocol'
import {
  loadRummikubSettings,
  saveRummikubSettings,
  type RummikubHandTheme,
  type RummikubPersonalSettings,
} from '../../services/rummikubSettings'
import RummikubComboRecord from './RummikubComboRecord.vue'

interface DraftMeld {
  id: string
  tiles: RummikubBoardTile[]
}

type BoardJoker = Extract<RummikubBoardTile, { kind: 'joker' }>
type RackSortMode = 'color' | 'number'

const COLOR_NAMES: Record<RummikubColor, string> = {
  red: '紅',
  blue: '藍',
  black: '黑',
  yellow: '黃',
}

const COLOR_ORDER: Record<RummikubColor, number> = {
  red: 0,
  blue: 1,
  black: 2,
  yellow: 3,
}

const HAND_THEMES = [
  {
    id: 'sage',
    name: '晨霧鼠尾草',
    description: '',
  },
  {
    id: 'mist',
    name: '月光霧藍',
    description: '',
  },
] as const satisfies readonly {
  id: RummikubHandTheme
  name: string
  description: string
}[]

const HIT_SOUND_NOTES = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6'] as const
const TURN_REMINDER_NOTES = ['C6', 'D6'] as const
const loadedSettings = loadRummikubSettings()
const hitVolume = ref(loadedSettings.settings.hitVolume)
const handTheme = ref(loadedSettings.settings.handTheme)
const settingsNotice = ref(loadedSettings.error ?? '')

function hitVolumeToDecibels(volume: number): number {
  return volume === 0 ? -Infinity : 20 * Math.log10(volume / 100)
}

const hitSynth = new Tone.Synth({
  volume: hitVolumeToDecibels(hitVolume.value),
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.005, decay: 0.08, sustain: 0, release: 0.12 },
}).toDestination()

const props = defineProps<{
  game: GameView
  gameSettings: Record<string, unknown>
  gameEvent: GameEvent | null
  players: PlayerView[]
  playerId: string
  gameName: string
  isHost: boolean
  canInteract: boolean
  settingsOpen: boolean
}>()

const emit = defineEmits<{
  'game-action': [action: string, payload: Record<string, unknown>]
  'close-settings': []
}>()

const game = computed(() => props.game.gameId === 'rummikub' ? props.game : null)
const clockNow = ref(Date.now())
const privateHand = ref<RummikubTile[]>([])
const latestDrawnTileId = ref<number | null>(null)
const rackSortMode = ref<RackSortMode>('color')
const isEditing = ref(false)
const draftHand = ref<RummikubTile[]>([])
const draftMelds = ref<DraftMeld[]>([])
const selectedTileIds = ref<number[]>([])
const originalHand = ref<RummikubTile[]>([])
const originalMelds = ref<RummikubMeld[]>([])
const originalHandTileIds = ref(new Set<number>())
const originalTableTileIds = ref(new Set<number>())
const settingsDialog = ref<HTMLDialogElement | null>(null)
const hitVolumeSlider = ref<HTMLInputElement | null>(null)
let lastDraftSignature: string | null = null
let nextDraftMeldId = 1
let turnClockInterval: number | null = null
let hitAudioStartPromise: Promise<void> | null = null
let isHitAudioReady = false
let isHitAudioDisposed = false
let pendingTurnReminderTurnNumber: number | null = null
let nextHitSoundAt = 0
const pendingHitNotes: (typeof HIT_SOUND_NOTES)[number][] = []

function scheduleHitNote(note: (typeof HIT_SOUND_NOTES)[number]): void {
  const playAt = Math.max(Tone.now(), nextHitSoundAt)
  hitSynth.triggerAttackRelease(note, '16n', playAt)
  nextHitSoundAt = playAt + 0.333
}

function playPendingHitNotes(): void {
  pendingHitNotes.splice(0).forEach(scheduleHitNote)
}

function playTurnReminderNotes(): void {
  TURN_REMINDER_NOTES.forEach(scheduleHitNote)
}

function playPendingTurnReminder(): void {
  const turnNumber = pendingTurnReminderTurnNumber
  pendingTurnReminderTurnNumber = null

  const currentGame = game.value
  if (
    turnNumber === null ||
    !currentGame ||
    currentGame.turnNumber !== turnNumber ||
    currentGame.currentPlayerId !== props.playerId
  ) {
    return
  }

  playTurnReminderNotes()
}

function playTurnReminder(): void {
  const currentGame = game.value
  if (!currentGame || currentGame.currentPlayerId !== props.playerId) {
    return
  }

  if (!isHitAudioReady) {
    pendingTurnReminderTurnNumber = currentGame.turnNumber
    return
  }

  playTurnReminderNotes()
}

function unlockHitAudio(): void {
  if (hitAudioStartPromise || isHitAudioReady || isHitAudioDisposed) {
    return
  }

  hitAudioStartPromise = Tone.start()
    .then(() => {
      if (isHitAudioDisposed) {
        return
      }

      isHitAudioReady = true
      window.removeEventListener('pointerdown', unlockHitAudio)
      window.removeEventListener('keydown', unlockHitAudio)
      playPendingHitNotes()
      playPendingTurnReminder()
    })
    .catch((error: unknown) => {
      hitAudioStartPromise = null
      pendingHitNotes.length = 0
      console.error('Unable to start Rummikub hit audio.', error)
    })
}

function playHitSound(hitCount: number): void {
  const note = HIT_SOUND_NOTES[Math.min(hitCount, HIT_SOUND_NOTES.length) - 1]
  if (note === undefined) {
    throw new RangeError(`Cannot play Rummikub hit sound for count ${hitCount}`)
  }

  if (!isHitAudioReady) {
    if (hitAudioStartPromise) {
      pendingHitNotes.push(note)
    }
    return
  }

  scheduleHitNote(note)
}

function closeSettings(): void {
  emit('close-settings')
}

watch(hitVolume, (volume) => {
  hitSynth.volume.rampTo(hitVolumeToDecibels(volume), 0.05)
}, { flush: 'sync' })

watch([hitVolume, handTheme], ([volume, selectedTheme]) => {
  const settings: RummikubPersonalSettings = {
    hitVolume: volume,
    handTheme: selectedTheme,
  }
  settingsNotice.value = saveRummikubSettings(settings) ?? ''
})

watch(() => props.settingsOpen, (isOpen) => {
  if (!isOpen) {
    return
  }

  void nextTick(() => {
    if (!props.settingsOpen) {
      return
    }

    const dialog = settingsDialog.value
    if (!dialog) {
      return
    }
    if (!dialog.open) {
      dialog.showModal()
    }
    hitVolumeSlider.value?.focus()
  })
})

onMounted(() => {
  // Web Audio must be started in response to a user gesture.
  window.addEventListener('pointerdown', unlockHitAudio)
  window.addEventListener('keydown', unlockHitAudio)
  turnClockInterval = window.setInterval(() => {
    clockNow.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', unlockHitAudio)
  window.removeEventListener('keydown', unlockHitAudio)
  isHitAudioDisposed = true
  pendingTurnReminderTurnNumber = null
  pendingHitNotes.length = 0
  hitSynth.dispose()

  if (turnClockInterval !== null) {
    window.clearInterval(turnClockInterval)
  }
})

const currentPlayer = computed(() => {
  return props.players.find((player) => player.id === game.value?.currentPlayerId) ?? null
})
const ownGamePlayer = computed(() => {
  return game.value?.players.find((player) => player.id === props.playerId) ?? null
})
const isMyTurn = computed(() => {
  return Boolean(game.value && game.value.currentPlayerId === props.playerId)
})
const activeTurnPreview = computed(() => {
  const currentGame = game.value
  const preview = currentGame?.turnPreview
  return preview &&
    preview.playerId === currentGame.currentPlayerId &&
    preview.turnNumber === currentGame.turnNumber
    ? preview
    : null
})
const isDraftingBoard = computed(() => {
  return isEditing.value || activeTurnPreview.value !== null
})
watch(
  () => ({
    turnNumber: game.value?.turnNumber ?? null,
    currentPlayerId: game.value?.currentPlayerId ?? null,
    playerId: props.playerId,
  }),
  (turn, previousTurn) => {
    if (
      pendingTurnReminderTurnNumber !== null &&
      (
        pendingTurnReminderTurnNumber !== turn.turnNumber ||
        turn.currentPlayerId !== turn.playerId
      )
    ) {
      pendingTurnReminderTurnNumber = null
    }

    if (
      turn.turnNumber !== null &&
      turn.currentPlayerId === turn.playerId &&
      (
        turn.turnNumber !== previousTurn?.turnNumber ||
        turn.currentPlayerId !== previousTurn?.currentPlayerId ||
        turn.playerId !== previousTurn?.playerId
      )
    ) {
      playTurnReminder()
    }
  },
  { immediate: true },
)
const remainingTurnSeconds = computed(() => {
  const deadlineAt = game.value?.turnDeadlineAt
  return deadlineAt == null
    ? null
    : Math.max(0, Math.ceil((deadlineAt - clockNow.value) / 1000))
})
const turnTimeSeconds = computed(() => {
  return isRummikubSettings(props.gameSettings)
    ? props.gameSettings.turnTimeSeconds
    : null
})
const hasTurnTimer = computed(() => {
  return turnTimeSeconds.value !== null && game.value?.turnDeadlineAt != null
})
const turnProgressPercent = computed(() => {
  const durationSeconds = turnTimeSeconds.value
  const deadlineAt = game.value?.turnDeadlineAt
  if (durationSeconds === null || deadlineAt == null) {
    return 0
  }

  const durationMs = durationSeconds * 1000
  const remainingMs = Math.max(0, Math.min(durationMs, deadlineAt - clockNow.value))
  return (remainingMs / durationMs) * 100
})
const turnCountdown = computed(() => {
  if (remainingTurnSeconds.value === null) {
    return '∞'
  }

  const minutes = Math.floor(remainingTurnSeconds.value / 60)
  const seconds = String(remainingTurnSeconds.value % 60).padStart(2, '0')
  return `${String(minutes).padStart(2, '0')}:${seconds}`
})
const handIsSynchronized = computed(() => {
  return Boolean(
    ownGamePlayer.value &&
    privateHand.value.length === ownGamePlayer.value.tileCount,
  )
})
const canAct = computed(() => {
  return Boolean(props.canInteract && isMyTurn.value && handIsSynchronized.value)
})
const visibleMelds = computed<DraftMeld[]>(() => {
  if (isEditing.value) {
    return draftMelds.value
  }
  const preview = activeTurnPreview.value
  if (preview) {
    return preview.melds.map((meld, index) => ({
      id: `preview-${preview.turnNumber}-${index}`,
      tiles: meld.tiles,
    }))
  }
  return (game.value?.table ?? []).map((meld, index) => ({
    id: `table-${index}`,
    tiles: meld.tiles,
  }))
})
const previewChangedMeldSignatures = computed(() => {
  const previewMelds = isEditing.value
    ? draftMelds.value
    : activeTurnPreview.value?.melds ?? []
  const originalBoard = isEditing.value
    ? originalMelds.value
    : game.value?.table ?? []

  return new Set(
    previewMelds
      .filter((meld) => {
        return !originalBoard.some((originalMeld) => {
          return areRummikubMeldsEqual(originalMeld, meld)
        })
      })
      .map((meld) => getTileIdsSignature(meld.tiles.map((tile) => tile.id))),
  )
})

const changedMeldSignatures = computed(() => {
  return new Set(
    [
      ...(game.value?.lastTurnChangedMelds ?? []).map(getTileIdsSignature),
      ...previewChangedMeldSignatures.value,
    ],
  )
})
const visibleHand = computed(() => {
  return sortHand(
    isEditing.value ? draftHand.value : privateHand.value,
    rackSortMode.value,
  )
})
const playerNameById = computed(() => new Map(props.players.map((player) => [player.id, player.name])))
const turnPreviewPlayerName = computed(() => {
  const preview = activeTurnPreview.value
  return preview
    ? playerNameById.value.get(preview.playerId) ?? '目前玩家'
    : ''
})
const activeCombo = computed(() => {
  const combo = game.value?.combo
  if (!combo || combo.playerId !== game.value?.currentPlayerId) {
    return null
  }
  return { ...combo, tier: getRummikubComboTier(combo.count) }
})
const previousTurnCombo = computed(() => {
  const combo = game.value?.lastTurnCombo
  if (!combo) {
    return null
  }
  const playerName = playerNameById.value.get(combo.playerId)
  return playerName ? { combo, playerName } : null
})
const selectedTileCount = computed(() => selectedTileIds.value.length)
const canReturnSelectedTiles = computed(() => {
  const handTileIds = new Set(draftHand.value.map((tile) => tile.id))
  return selectedTileIds.value.some((tileId) => {
    return originalHandTileIds.value.has(tileId) && !handTileIds.has(tileId)
  })
})
const usedHandTileCount = computed(() => originalHand.value.length - draftHand.value.length)
const invalidMeldCount = computed(() => {
  return draftMelds.value.filter((meld) => !isValidRummikubMeld(meld.tiles)).length
})
const registrationPoints = computed(() => {
  const handIds = originalHandTileIds.value
  return draftMelds.value
    .filter((meld) => meld.tiles.every((tile) => handIds.has(tile.id)))
    .flatMap((meld) => meld.tiles)
    .reduce((total, tile) => total + getRummikubBoardTilePoints(tile), 0)
})
const draftHasAllOriginalTableTiles = computed(() => {
  const currentTileIds = new Set(draftMelds.value.flatMap((meld) => meld.tiles.map((tile) => tile.id)))
  return [...originalTableTileIds.value].every((tileId) => currentTileIds.has(tileId))
})
const canSubmitDraft = computed(() => {
  const currentGame = game.value
  const ownPlayer = ownGamePlayer.value
  if (
    !isEditing.value ||
    !canAct.value ||
    !currentGame ||
    !ownPlayer ||
    draftMelds.value.length === 0 ||
    invalidMeldCount.value > 0 ||
    !draftHasAllOriginalTableTiles.value ||
    usedHandTileCount.value === 0
  ) {
    return false
  }

  return ownPlayer.hasOpened || registrationPoints.value >= 30
})
const visibleJokers = computed<BoardJoker[]>(() => {
  return draftMelds.value.flatMap((meld) => {
    return meld.tiles.filter((tile): tile is BoardJoker => tile.kind === 'joker')
  })
})
const jokerNumberById = computed(() => {
  const currentGame = game.value
  const knownTiles: (RummikubTile | RummikubBoardTile)[] = isEditing.value
    ? [
        ...originalHand.value,
        ...originalMelds.value.flatMap((meld) => meld.tiles),
      ]
    : [
        ...privateHand.value,
        ...(currentGame?.table.flatMap((meld) => meld.tiles) ?? []),
        ...(activeTurnPreview.value?.melds.flatMap((meld) => meld.tiles) ?? []),
      ]
  const jokerIds = [...new Set(
    knownTiles
      .filter((tile) => tile.kind === 'joker')
      .map((tile) => tile.id),
  )].sort((left, right) => left - right)
  const markers = new Map<number, number>()
  jokerIds.forEach((tileId, index) => markers.set(tileId, index + 1))
  return markers
})
const numberValues = Array.from({ length: 13 }, (_value, index) => index + 1)
const colors = [
  { value: 'red', label: '紅色' },
  { value: 'blue', label: '藍色' },
  { value: 'black', label: '黑色' },
  { value: 'yellow', label: '黃色' },
] as const satisfies Array<{ value: RummikubColor; label: string }>

watch(
  () => props.gameEvent,
  (event) => {
    if (
      event?.gameId !== 'rummikub' ||
      event.event !== RUMMIKUB_PRIVATE_EVENT ||
      !isRummikubPrivateState(event.payload)
    ) {
      return
    }

    const previousHandIds = new Set(privateHand.value.map((tile) => tile.id))
    const addedTiles = event.payload.hand.filter((tile) => !previousHandIds.has(tile.id))
    if (
      privateHand.value.length > 0 &&
      event.payload.hand.length === privateHand.value.length + 1 &&
      addedTiles.length === 1
    ) {
      latestDrawnTileId.value = addedTiles[0]!.id
    } else if (
      latestDrawnTileId.value !== null &&
      !event.payload.hand.some((tile) => tile.id === latestDrawnTileId.value)
    ) {
      latestDrawnTileId.value = null
    }

    privateHand.value = sortHand(event.payload.hand)
  },
  { immediate: true },
)

watch(
  () => ({
    playerId: activeCombo.value?.playerId,
    turnNumber: game.value?.turnNumber,
    count: activeCombo.value?.count,
  }),
  (combo, previousCombo) => {
    if (combo.playerId === undefined || combo.count === undefined) {
      return
    }

    const isSameCombo = (
      combo.playerId === previousCombo.playerId &&
      combo.turnNumber === previousCombo.turnNumber
    )
    const previousCount = isSameCombo ? previousCombo.count ?? 0 : 0
    if (combo.count <= previousCount) {
      return
    }

    for (let hitCount = previousCount + 1; hitCount <= combo.count; hitCount += 1) {
      playHitSound(hitCount)
    }
  },
)

watch(() => game.value?.turnNumber, (turnNumber, previousTurnNumber) => {
  if (previousTurnNumber !== undefined && turnNumber !== previousTurnNumber) {
    cancelEdit(false)
  }
})

function sortHand(tiles: RummikubTile[], mode: RackSortMode = rackSortMode.value): RummikubTile[] {
  return [...tiles].sort((left, right) => {
    if (left.kind === 'joker' || right.kind === 'joker') {
      if (left.kind === 'joker' && right.kind === 'joker') {
        return left.id - right.id
      }
      return left.kind === 'joker' ? 1 : -1
    }

    const primaryOrder = mode === 'color'
      ? COLOR_ORDER[left.color] - COLOR_ORDER[right.color]
      : left.value - right.value
    if (primaryOrder !== 0) {
      return primaryOrder
    }

    const secondaryOrder = mode === 'color'
      ? left.value - right.value
      : COLOR_ORDER[left.color] - COLOR_ORDER[right.color]
    return secondaryOrder || left.id - right.id
  })
}

function cloneBoardTile(tile: RummikubBoardTile): RummikubBoardTile {
  return tile.kind === 'joker'
    ? { id: tile.id, kind: 'joker', representedAs: { ...tile.representedAs } }
    : { ...tile }
}

function getTileColor(tile: RummikubTile | RummikubBoardTile): RummikubColor {
  if (tile.kind === 'number') {
    return tile.color
  }
  return 'representedAs' in tile ? tile.representedAs.color : 'yellow'
}

function getTileValue(tile: RummikubTile | RummikubBoardTile): number | null {
  if (tile.kind === 'number') {
    return tile.value
  }
  return 'representedAs' in tile ? tile.representedAs.value : null
}

function getTileLabel(tile: RummikubTile | RummikubBoardTile): string {
  return tile.kind === 'joker' ? '★' : String(tile.value)
}

function getJokerNumber(tileId: number): number | null {
  return jokerNumberById.value.get(tileId) ?? null
}

function getJokerName(tileId: number): string {
  const jokerNumber = getJokerNumber(tileId)
  return jokerNumber === null ? 'Joker' : `Joker ${jokerNumber}`
}

function getTileAriaLabel(tile: RummikubTile | RummikubBoardTile): string {
  let label: string
  if (tile.kind === 'number') {
    label = `${COLOR_NAMES[tile.color]}色 ${tile.value}`
  } else if ('representedAs' in tile) {
    label = `${getJokerName(tile.id)}，代表${COLOR_NAMES[tile.representedAs.color]}色 ${tile.representedAs.value}`
  } else {
    label = `${getJokerName(tile.id)} 百搭牌`
  }
  return tile.id === latestDrawnTileId.value ? `新抽牌，${label}` : label
}

function getMeldTiles(meld: DraftMeld): RummikubBoardTile[] {
  return [...meld.tiles].sort((left, right) => {
    const leftColor = COLOR_ORDER[getTileColor(left)]
    const rightColor = COLOR_ORDER[getTileColor(right)]
    if (leftColor !== rightColor) {
      return leftColor - rightColor
    }
    return (getTileValue(left) ?? 0) - (getTileValue(right) ?? 0)
  })
}

function getTileIdsSignature(tileIds: readonly number[]): string {
  return [...tileIds].sort((left, right) => left - right).join(',')
}

function isMeldChanged(meld: DraftMeld): boolean {
  return changedMeldSignatures.value.has(
    getTileIdsSignature(meld.tiles.map((tile) => tile.id)),
  )
}

function isMeldPreviewChanged(meld: DraftMeld): boolean {
  return previewChangedMeldSignatures.value.has(
    getTileIdsSignature(meld.tiles.map((tile) => tile.id)),
  )
}

function beginEdit(): void {
  const currentGame = game.value
  if (!canAct.value || !currentGame) {
    return
  }

  originalHand.value = privateHand.value.map((tile) => ({ ...tile }))
  originalHandTileIds.value = new Set(originalHand.value.map((tile) => tile.id))
  originalMelds.value = currentGame.table.map((meld) => ({
    tiles: meld.tiles.map(cloneBoardTile),
  }))
  originalTableTileIds.value = new Set(
    originalMelds.value.flatMap((meld) => meld.tiles.map((tile) => tile.id)),
  )
  draftHand.value = sortHand(originalHand.value)
  nextDraftMeldId = 1
  draftMelds.value = originalMelds.value.map((meld, index) => ({
    id: `meld-${index + 1}`,
    tiles: meld.tiles.map(cloneBoardTile),
  }))
  selectedTileIds.value = []
  isEditing.value = true
  publishComboPreview(true)
}

function cancelEdit(syncComboPreview = true): void {
  if (syncComboPreview && isEditing.value && game.value) {
    emit('game-action', 'update_combo', {
      turnNumber: game.value.turnNumber,
      tileIds: [],
    })
  }
  isEditing.value = false
  draftHand.value = []
  draftMelds.value = []
  selectedTileIds.value = []
  originalHand.value = []
  originalHandTileIds.value = new Set()
  originalMelds.value = []
  originalTableTileIds.value = new Set()
  lastDraftSignature = null
}

function getDraftMove(): RummikubMove {
  return {
    melds: draftMelds.value.map((meld) => meld.tiles.map((tile) => tile.id)),
    jokers: draftMelds.value.flatMap((meld) => {
      return meld.tiles
        .filter((tile): tile is BoardJoker => tile.kind === 'joker')
        .map((tile) => ({
          tileId: tile.id,
          representedAs: { ...tile.representedAs },
        }))
    }),
  }
}

function publishComboPreview(force = false): void {
  const currentGame = game.value
  if (!isEditing.value || !currentGame) {
    return
  }

  const tileIds = draftMelds.value
    .flatMap((meld) => meld.tiles)
    .filter((tile) => originalHandTileIds.value.has(tile.id))
    .map((tile) => tile.id)
    .sort((left, right) => left - right)
  const move = getDraftMove()
  const signature = JSON.stringify(move)
  if (!force && signature === lastDraftSignature) {
    return
  }

  lastDraftSignature = signature
  emit('game-action', 'update_combo', {
    turnNumber: currentGame.turnNumber,
    tileIds,
    move: {
      melds: move.melds,
      jokers: move.jokers,
    },
  })
}

function canSelectBoardTile(tileId: number): boolean {
  return Boolean(
    ownGamePlayer.value?.hasOpened ||
    (originalHandTileIds.value.has(tileId) && !originalTableTileIds.value.has(tileId)),
  )
}

function toggleTileSelection(tileId: number, isHandTile: boolean): void {
  if (
    !isEditing.value ||
    !props.canInteract ||
    (!isHandTile && !canSelectBoardTile(tileId))
  ) {
    return
  }

  selectedTileIds.value = selectedTileIds.value.includes(tileId)
    ? selectedTileIds.value.filter((selectedId) => selectedId !== tileId)
    : [...selectedTileIds.value, tileId]
}

function toBoardTile(tile: RummikubTile): RummikubBoardTile {
  return tile.kind === 'joker'
    ? { id: tile.id, kind: 'joker', representedAs: { color: 'red', value: 1 } }
    : { ...tile }
}

function canMoveSelectionToMeld(meld: DraftMeld): boolean {
  return Boolean(
    selectedTileIds.value.length > 0 &&
    (ownGamePlayer.value?.hasOpened ||
      meld.tiles.every((tile) => !originalTableTileIds.value.has(tile.id))),
  )
}

function transferSelectedTiles(targetMeldId: string | null): void {
  if (!isEditing.value || selectedTileIds.value.length === 0) {
    return
  }

  const targetMeld = targetMeldId === null
    ? null
    : draftMelds.value.find((meld) => meld.id === targetMeldId)
  if (targetMeldId !== null && (!targetMeld || !canMoveSelectionToMeld(targetMeld))) {
    return
  }

  const movedTiles: RummikubBoardTile[] = []
  for (const tileId of selectedTileIds.value) {
    const handIndex = draftHand.value.findIndex((tile) => tile.id === tileId)
    if (handIndex >= 0) {
      const [tile] = draftHand.value.splice(handIndex, 1)
      if (tile) {
        movedTiles.push(toBoardTile(tile))
      }
      continue
    }

    for (const meld of draftMelds.value) {
      const tileIndex = meld.tiles.findIndex((tile) => tile.id === tileId)
      if (tileIndex >= 0) {
        const [tile] = meld.tiles.splice(tileIndex, 1)
        if (tile) {
          movedTiles.push(tile)
        }
        break
      }
    }
  }

  if (targetMeld) {
    targetMeld.tiles.push(...movedTiles)
  } else if (movedTiles.length > 0) {
    draftMelds.value.push({
      id: `meld-new-${nextDraftMeldId}`,
      tiles: movedTiles,
    })
    nextDraftMeldId += 1
  }

  draftMelds.value = draftMelds.value.filter((meld) => meld.tiles.length > 0)
  draftHand.value = sortHand(draftHand.value)
  selectedTileIds.value = []
  publishComboPreview()
}

function moveSelectedToMeld(meldId: string): void {
  transferSelectedTiles(meldId)
}

function moveSelectedToNewMeld(): void {
  transferSelectedTiles(null)
}

function returnSelectedTilesToHand(): void {
  if (!isEditing.value || selectedTileIds.value.length === 0) {
    return
  }

  const selectedIds = new Set(selectedTileIds.value)
  const returnedTiles: RummikubTile[] = []
  for (const meld of draftMelds.value) {
    for (let index = meld.tiles.length - 1; index >= 0; index -= 1) {
      const tile = meld.tiles[index]!
      if (!selectedIds.has(tile.id) || !originalHandTileIds.value.has(tile.id)) {
        continue
      }
      meld.tiles.splice(index, 1)
      returnedTiles.push(
        tile.kind === 'joker'
          ? { id: tile.id, kind: 'joker' }
          : { ...tile },
      )
    }
  }

  draftMelds.value = draftMelds.value.filter((meld) => meld.tiles.length > 0)
  draftHand.value = sortHand([...draftHand.value, ...returnedTiles])
  selectedTileIds.value = []
  publishComboPreview()
}

function updateJokerFace(tileId: number, face: RummikubFace): void {
  draftMelds.value = draftMelds.value.map((meld) => ({
    ...meld,
    tiles: meld.tiles.map((tile) => {
      return tile.id === tileId && tile.kind === 'joker'
        ? { ...tile, representedAs: { ...face } }
        : tile
    }),
  }))
  publishComboPreview()
}

function changeJokerColor(tileId: number, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement) || !isRummikubColor(target.value)) {
    return
  }
  const joker = visibleJokers.value.find((tile) => tile.id === tileId)
  if (joker) {
    updateJokerFace(tileId, { ...joker.representedAs, color: target.value })
  }
}

function changeJokerValue(tileId: number, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) {
    return
  }
  const value = Number(target.value)
  if (!Number.isInteger(value) || value < 1 || value > 13) {
    return
  }
  const joker = visibleJokers.value.find((tile) => tile.id === tileId)
  if (joker) {
    updateJokerFace(tileId, { ...joker.representedAs, value })
  }
}

function submitTurn(): void {
  if (!canSubmitDraft.value) {
    return
  }

  const move = getDraftMove()
  emit('game-action', 'play_turn', {
    melds: move.melds,
    jokers: move.jokers,
  })
}

function drawOrPass(): void {
  if (!canAct.value || !game.value) {
    return
  }
  emit('game-action', game.value.drawPileCount > 0 ? 'draw_tile' : 'pass_turn', {})
}
</script>

<template>
  <div class="playing-state rummikub-game" :class="`hand-theme-${handTheme}`">
    <section class="rummikub-status-panel">
      <div>
        <p class="rummikub-kicker">{{ gameName }} · 第 {{ game?.turnNumber ?? 1 }} 回合</p>
        <h2 v-if="isMyTurn">輪到你了</h2>
        <h2 v-else-if="currentPlayer && !currentPlayer.online">
          等待 {{ currentPlayer.name }} 重新連線
        </h2>
        <h2 v-else>{{ currentPlayer ? `等待 ${currentPlayer.name} 行動` : '等待回合開始' }}</h2>
        <p v-if="ownGamePlayer && !ownGamePlayer.hasOpened">
          先用自己的手牌完成至少 30 分登錄，才能操作桌面牌組。
        </p>
        <p v-else-if="isMyTurn">選擇手牌與桌面牌，重排成合法組合並出牌。</p>
        <p v-else>可隨時查看自己的手牌；輪到你時再開始整理。</p>
        <p v-if="remainingTurnSeconds === 0" class="rummikub-timeout-message" role="status">
          時間到，合法的桌面草稿會自動確認；否則還原編輯並自動抽牌或跳過。
        </p>
      </div>
      <div class="rummikub-status-metrics">
        <div
          class="rummikub-turn-countdown"
          :class="{ 'is-expiring': remainingTurnSeconds !== null && remainingTurnSeconds <= 10 }"
          role="timer"
          aria-label="目前回合剩餘思考時間"
          aria-live="off"
        >
          <strong>{{ turnCountdown }}</strong>
          <span>
            {{ remainingTurnSeconds === null ? '不限時' : remainingTurnSeconds === 0 ? '時間到' : '剩餘時間' }}
          </span>
        </div>
        <div class="rummikub-pile-count">
          <strong>{{ game?.drawPileCount ?? 0 }}</strong>
          <span>牌堆剩餘</span>
        </div>
      </div>
    </section>

    <RummikubComboRecord
      v-if="previousTurnCombo"
      :key="`${previousTurnCombo.combo.playerId}-${previousTurnCombo.combo.count}-${game?.turnNumber ?? 0}`"
      :combo="previousTurnCombo.combo"
      :player-name="previousTurnCombo.playerName"
    />

    <section class="rummikub-player-strip" aria-label="玩家手牌與登錄狀態">
      <div
        v-for="player in game?.players ?? []"
        :key="player.id"
        class="rummikub-player-chip"
        :class="{
          'is-active': game?.currentPlayerId === player.id,
          'is-self': player.id === playerId,
          'is-offline': props.players.find((roomPlayer) => roomPlayer.id === player.id)?.online === false,
        }"
      >
        <strong>{{ playerNameById.get(player.id) ?? '玩家' }}</strong>
        <span>{{ player.tileCount }} 張</span>
        <small v-if="props.players.find((roomPlayer) => roomPlayer.id === player.id)?.online === false">
          離線
        </small>
        <small v-else>{{ player.hasOpened ? '已登錄' : '未登錄' }}</small>
      </div>
    </section>

    <section class="rummikub-panel rummikub-board-panel">
      <div
        v-if="activeCombo"
        :key="`${activeCombo.playerId}-${activeCombo.count}`"
        class="rummikub-hit"
        :class="`is-${activeCombo.tier}`"
        role="status"
        aria-live="polite"
        :aria-label="`Hit ${activeCombo.count}`"
      >
        <span class="rummikub-hit-ring" aria-hidden="true"></span>
        <span class="rummikub-hit-sparks" aria-hidden="true"></span>
        <strong aria-hidden="true">{{ activeCombo.count }}</strong>
        <em aria-hidden="true">HIT</em>
      </div>
      <header class="rummikub-panel-heading">
        <div>
          <p class="rummikub-kicker">SHARED TABLE</p>
          <h3>桌面組合 <span>{{ visibleMelds.length }}</span></h3>
        </div>
        <span v-if="!isEditing && activeTurnPreview" class="rummikub-preview-status" role="status">
          {{ turnPreviewPlayerName }} 正在調整桌面
        </span>
        <span v-else-if="isEditing" class="rummikub-selection-count">
          已選 {{ selectedTileCount }} 張
        </span>
      </header>

      <p v-if="visibleMelds.length === 0" class="rummikub-empty-board">
        {{
          !isEditing && activeTurnPreview
            ? `${turnPreviewPlayerName} 正在整理桌面，尚未放置牌組。`
            : '桌上還沒有組合，先從自己的手牌建立新組合。'
        }}
      </p>

      <div v-else class="rummikub-meld-list">
        <article
          v-for="(meld, index) in visibleMelds"
          :key="meld.id"
          class="rummikub-meld"
          :class="{
            'is-invalid': isDraftingBoard && !isValidRummikubMeld(meld.tiles),
            'is-changed': isMeldChanged(meld),
          }"
        >
          <header class="rummikub-meld-heading">
            <strong>組合 {{ index + 1 }}</strong>
            <span v-if="isDraftingBoard && !isValidRummikubMeld(meld.tiles)">尚未完成</span>
            <span v-else-if="isMeldChanged(meld)" class="rummikub-meld-change-label">
              {{ isMeldPreviewChanged(meld) ? '異動預覽' : '上次異動' }}
            </span>
            <span v-else-if="isDraftingBoard">合法組合</span>
            <button
              v-if="isEditing"
              class="rummikub-meld-target"
              type="button"
              :disabled="!props.canInteract || !canMoveSelectionToMeld(meld)"
              @click="moveSelectedToMeld(meld.id)"
            >
              放入所選牌
            </button>
          </header>
          <div class="rummikub-tile-row">
            <button
              v-for="tile in getMeldTiles(meld)"
              :key="tile.id"
              class="rummikub-tile"
              :class="[
                `tile-${getTileColor(tile)}`,
                {
                  'is-selected': isEditing && selectedTileIds.includes(tile.id),
                  'is-joker': tile.kind === 'joker',
                },
              ]"
              type="button"
              :aria-label="getTileAriaLabel(tile)"
              :aria-pressed="isEditing && selectedTileIds.includes(tile.id)"
              :disabled="!isEditing || !props.canInteract || !canSelectBoardTile(tile.id)"
              @click="toggleTileSelection(tile.id, false)"
            >
              <span>{{ getTileLabel(tile) }}</span>
              <small v-if="tile.kind === 'joker' && 'representedAs' in tile">
                {{ COLOR_NAMES[tile.representedAs.color] }}{{ tile.representedAs.value }}
              </small>
              <span
                v-if="tile.kind === 'joker' && getJokerNumber(tile.id) !== null"
                class="rummikub-joker-identifier"
                aria-hidden="true"
              >
                {{ getJokerNumber(tile.id) }}
              </span>
              <svg
                v-if="tile.id === latestDrawnTileId"
                class="rummikub-new-tile-mark"
                viewBox="0 0 42 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M5 1h36v22H5L1 12Z"
                  fill="#3e7659"
                  stroke="#fffdf7"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
                <text
                  x="23"
                  y="16"
                  fill="#fffdf7"
                  font-family="Arial, sans-serif"
                  font-size="12"
                  font-weight="800"
                  letter-spacing="0.4"
                  text-anchor="middle"
                >
                  NEW
                </text>
              </svg>
            </button>
          </div>
        </article>
      </div>
    </section>

    <section
      class="rummikub-panel rummikub-hand-panel"
      :class="{
        'is-editing': isEditing,
        'is-my-turn': isMyTurn,
        'is-turn-expiring': isMyTurn && hasTurnTimer && remainingTurnSeconds !== null && remainingTurnSeconds <= 10,
      }"
    >
      <div
        v-if="hasTurnTimer && isMyTurn"
        class="rummikub-turn-progress"
        role="progressbar"
        aria-label="本回合剩餘時間"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(turnProgressPercent)"
      >
        <span
          class="rummikub-turn-progress-fill"
          :style="{ width: `${turnProgressPercent}%` }"
        ></span>
      </div>
      <header class="rummikub-panel-heading">
        <div>
          <p class="rummikub-kicker">YOUR RACK</p>
          <h3>你的手牌 <span>{{ visibleHand.length }}</span></h3>
        </div>
        <div class="rummikub-rack-controls">
          <div class="rummikub-sort-controls" role="group" aria-label="手牌排序方式">
            <button
              class="rummikub-sort-button"
              :class="{ 'is-active': rackSortMode === 'color' }"
              type="button"
              :aria-pressed="rackSortMode === 'color'"
              @click="rackSortMode = 'color'"
            >
              依花色
            </button>
            <button
              class="rummikub-sort-button"
              :class="{ 'is-active': rackSortMode === 'number' }"
              type="button"
              :aria-pressed="rackSortMode === 'number'"
              @click="rackSortMode = 'number'"
            >
              依數字
            </button>
          </div>
          <div v-if="isEditing" class="rummikub-editor-actions">
            <button
              class="button button-secondary"
              type="button"
              :disabled="!props.canInteract || selectedTileCount === 0"
              @click="moveSelectedToNewMeld"
            >
              建立新組合⬆
            </button>
            <button
              class="button button-secondary"
              type="button"
              :disabled="!props.canInteract || !canReturnSelectedTiles"
              @click="returnSelectedTilesToHand"
            >
              撤回所選手牌⬇
            </button>
          </div>
        </div>
      </header>

      <p v-if="!handIsSynchronized" class="rummikub-sync-message" role="status">
        正在同步你的手牌…
      </p>
      <p v-else-if="visibleHand.length === 0" class="rummikub-empty-hand">
        {{ isEditing ? '這回合已選完手牌；確認桌面每組都合法後即可出牌。' : '目前沒有手牌。' }}
      </p>
      <div v-else class="rummikub-tile-row rummikub-hand">
        <button
          v-for="tile in visibleHand"
          :key="tile.id"
          class="rummikub-tile"
          :class="[
            `tile-${getTileColor(tile)}`,
            {
              'is-selected': isEditing && selectedTileIds.includes(tile.id),
              'is-joker': tile.kind === 'joker',
            },
          ]"
          type="button"
          :aria-label="getTileAriaLabel(tile)"
          :aria-pressed="isEditing && selectedTileIds.includes(tile.id)"
          :disabled="!isEditing || !props.canInteract"
          @click="toggleTileSelection(tile.id, true)"
        >
          <span>{{ getTileLabel(tile) }}</span>
          <small v-if="tile.kind === 'joker'">{{ getJokerName(tile.id) }}</small>
          <span
            v-if="tile.kind === 'joker' && getJokerNumber(tile.id) !== null"
            class="rummikub-joker-identifier"
            aria-hidden="true"
          >
            {{ getJokerNumber(tile.id) }}
          </span>
          <svg
            v-if="tile.id === latestDrawnTileId"
            class="rummikub-new-tile-mark"
            viewBox="0 0 42 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M5 1h36v22H5L1 12Z"
              fill="#3e7659"
              stroke="#fffdf7"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <text
              x="23"
              y="16"
              fill="#fffdf7"
              font-family="Arial, sans-serif"
              font-size="12"
              font-weight="800"
              letter-spacing="0.4"
              text-anchor="middle"
            >
              NEW
            </text>
          </svg>
        </button>
      </div>

      <div v-if="isEditing && visibleJokers.length > 0" class="rummikub-joker-settings">
        <div>
          <p class="rummikub-kicker">WILD TILE</p>
          <h4>Joker 代表牌</h4>
        </div>
        <label v-for="joker in visibleJokers" :key="joker.id" class="rummikub-joker-control">
          <span>{{ getJokerName(joker.id) }} · {{ COLOR_NAMES[joker.representedAs.color] }}{{ joker.representedAs.value }}</span>
          <select
            :value="joker.representedAs.color"
            :disabled="!props.canInteract || (!ownGamePlayer?.hasOpened && originalTableTileIds.has(joker.id))"
            :aria-label="`${getJokerName(joker.id)} 代表顏色`"
            @change="changeJokerColor(joker.id, $event)"
          >
            <option v-for="color in colors" :key="color.value" :value="color.value">
              {{ color.label }}
            </option>
          </select>
          <select
            :value="joker.representedAs.value"
            :disabled="!props.canInteract || (!ownGamePlayer?.hasOpened && originalTableTileIds.has(joker.id))"
            :aria-label="`${getJokerName(joker.id)} 代表數字`"
            @change="changeJokerValue(joker.id, $event)"
          >
            <option v-for="value in numberValues" :key="value" :value="value">{{ value }}</option>
          </select>
        </label>
      </div>

      <div v-if="isEditing" class="rummikub-draft-status" role="status">
        <span v-if="invalidMeldCount > 0">
          還有 {{ invalidMeldCount }} 組不合法；每組至少 3 張且需符合 Group 或 Run。
        </span>
        <span v-else-if="usedHandTileCount === 0">每回合至少要打出一張自己的手牌。</span>
        <span v-else-if="!ownGamePlayer?.hasOpened && registrationPoints < 30">
          初次登錄 {{ registrationPoints }} / 30 分。
        </span>
        <span v-else-if="!draftHasAllOriginalTableTiles">
          桌面原有的牌都必須留在合法組合中。
        </span>
        <span v-else>牌面符合出牌條件。</span>
        <span v-if="selectedTileCount > 0">選好牌後，點組合上的「放入所選牌」或建立新組合。</span>
      </div>

      <footer v-if="isEditing" class="rummikub-submit-actions">
        <button
          class="button button-secondary"
          type="button"
          :disabled="!props.canInteract"
          @click="cancelEdit()"
        >
          全部取消
        </button>
        <button
          class="button button-primary"
          type="button"
          :disabled="!canSubmitDraft"
          @click="submitTurn"
        >
          確認出牌
        </button>
      </footer>
    </section>

    <section v-if="!isEditing && isMyTurn && handIsSynchronized" class="rummikub-turn-actions">
      <button
        class="button button-primary"
        type="button"
        :disabled="!canAct"
        @click="beginEdit"
      >
        開始出牌
      </button>
      <button
        class="button button-secondary"
        type="button"
        :disabled="!canAct"
        @click="drawOrPass"
      >
        {{ game?.drawPileCount ? '抽一張並結束回合' : '牌堆已空，結束回合' }}
      </button>
    </section>

    <p v-else-if="!isEditing && !isMyTurn" class="rummikub-waiting-note">
      等待目前玩家出牌、抽牌或結束回合。
    </p>

    <Teleport to="body">
      <dialog
        v-if="props.settingsOpen"
        ref="settingsDialog"
        class="rummikub-settings-dialog"
        aria-labelledby="rummikub-settings-title"
        @cancel.prevent="closeSettings"
        @click.self="closeSettings"
      >
        <div class="rummikub-settings-content">
          <header class="rummikub-settings-header">
            <div>
              <p class="rummikub-kicker">YOUR TABLE · YOUR STYLE</p>
              <h2 id="rummikub-settings-title">個人設定</h2>
            </div>
            <button
              class="rummikub-settings-close"
              type="button"
              aria-label="關閉個人設定"
              @click="closeSettings"
            >
              ×
            </button>
          </header>

          <section class="rummikub-settings-block" aria-labelledby="rummikub-volume-title">
            <div class="rummikub-settings-block-heading">
              <label id="rummikub-volume-title" for="rummikub-hit-volume">Hit／回合提醒音量</label>
              <output for="rummikub-hit-volume">
                {{ hitVolume === 0 ? '靜音' : `${hitVolume}%` }}
              </output>
            </div>
            <input
              id="rummikub-hit-volume"
              ref="hitVolumeSlider"
              v-model.number="hitVolume"
              class="rummikub-settings-volume-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              :aria-valuetext="hitVolume === 0 ? '靜音' : `音量 ${hitVolume}%`"
            />
            <div class="rummikub-settings-volume-labels" aria-hidden="true">
              <span>靜音</span>
              <span>最大</span>
            </div>
          </section>

          <section class="rummikub-settings-block" aria-labelledby="rummikub-theme-title">
            <div class="rummikub-settings-block-heading">
              <h3 id="rummikub-theme-title">牌面主題</h3>
              <span>只改變你看到的所有牌面</span>
            </div>
            <div class="rummikub-theme-options" role="radiogroup" aria-labelledby="rummikub-theme-title">
              <label
                v-for="theme in HAND_THEMES"
                :key="theme.id"
                class="rummikub-theme-option"
                :class="[
                  `theme-${theme.id}`,
                  { 'is-selected': handTheme === theme.id },
                ]"
              >
                <input
                  v-model="handTheme"
                  type="radio"
                  name="rummikub-hand-theme"
                  :value="theme.id"
                />
                <span class="rummikub-theme-preview" :class="`theme-${theme.id}`" aria-hidden="true">
                  <span class="rummikub-theme-preview-tile tile-red">3</span>
                  <span class="rummikub-theme-preview-tile tile-blue">8</span>
                  <span class="rummikub-theme-preview-tile tile-yellow">12</span>
                </span>
                <span class="rummikub-theme-copy">
                  <strong>{{ theme.name }}</strong>
                  <small>{{ theme.description }}</small>
                </span>
              </label>
            </div>
          </section>

          <p v-if="settingsNotice" class="rummikub-settings-notice" role="status">
            {{ settingsNotice }}
          </p>
          <footer class="rummikub-settings-footer">
            <span>設定只套用於此裝置</span>
            <button class="button button-primary" type="button" @click="closeSettings">
              完成
            </button>
          </footer>
        </div>
      </dialog>
    </Teleport>
  </div>
</template>

<style scoped>
.rummikub-game {
  display: grid;
  gap: 13px;
}

.rummikub-status-panel,
.rummikub-panel {
  border: 1px solid #e9e4d7;
  border-radius: 16px;
  background: #fffefa;
  box-shadow: 0 7px 22px rgb(64 57 37 / 5%);
}

.rummikub-status-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
  background:
    radial-gradient(ellipse at 100% 0%, rgb(180 216 179 / 28%), transparent 55%),
    #fffefa;
}

.rummikub-kicker {
  margin: 0 0 4px;
  color: #82866f;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.rummikub-status-panel h2,
.rummikub-panel-heading h3,
.rummikub-joker-settings h4 {
  margin: 0;
  color: #353c35;
}

.rummikub-status-panel h2 {
  font-size: 19px;
}

.rummikub-status-panel p:not(.rummikub-kicker) {
  margin: 5px 0 0;
  color: #77796c;
  font-size: 11px;
  line-height: 1.5;
}

.rummikub-status-panel p.rummikub-timeout-message {
  color: #a45b26;
  font-weight: 700;
}

.rummikub-status-metrics {
  display: flex;
  align-items: stretch;
  gap: 7px;
}

.rummikub-board-panel {
  position: relative;
}

.rummikub-board-panel:has(.rummikub-hit) .rummikub-panel-heading {
  margin-bottom: 18px;
  padding-right: 96px;
}

.rummikub-hit {
  position: absolute;
  z-index: 4;
  top: 9px;
  right: 9px;
  display: grid;
  min-width: 64px;
  justify-items: center;
  padding: 7px 10px 6px;
  border: 1px solid transparent;
  border-radius: 16px;
  pointer-events: none;
  transform-origin: 80% 20%;
  animation: rummikub-hit-land 560ms cubic-bezier(0.16, 1.25, 0.32, 1) both;
}

.rummikub-hit strong {
  font-size: 26px;
  font-weight: 900;
  line-height: 0.9;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  animation: rummikub-hit-number 480ms cubic-bezier(0.2, 1.45, 0.36, 1) both;
}

.rummikub-hit em {
  margin-top: 1px;
  font-style: normal;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.rummikub-hit-ring,
.rummikub-hit-sparks {
  position: absolute;
  pointer-events: none;
}

.rummikub-hit-ring {
  inset: -5px;
  border: 1.5px solid currentColor;
  border-radius: inherit;
  opacity: 0;
  animation: rummikub-hit-ring 680ms ease-out both;
}

.rummikub-hit-sparks {
  top: 50%;
  left: 50%;
  width: 4px;
  height: 4px;
  margin: -2px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0;
  box-shadow:
    0 -16px 0 currentColor,
    14px -8px 0 currentColor,
    12px 12px 0 currentColor,
    -14px 9px 0 currentColor,
    -15px -7px 0 currentColor;
  animation: rummikub-hit-sparks 720ms ease-out both;
}

.rummikub-hit.is-spark {
  border-color: #efd48a;
  background: linear-gradient(160deg, #fffaf0, #ffe7a3);
  box-shadow: 0 10px 18px rgb(176 122 28 / 22%);
  color: #8a5410;
}

.rummikub-hit.is-surge {
  border-color: #ffc07a;
  background: linear-gradient(145deg, #fff1d2, #ffb15a 55%, #ff7a45);
  box-shadow: 0 12px 22px rgb(214 92 32 / 32%);
  color: #fffaf3;
  text-shadow: 0 1px 0 rgb(120 42 12 / 28%);
  animation:
    rummikub-hit-land 560ms cubic-bezier(0.16, 1.25, 0.32, 1) both,
    rummikub-hit-glow 1.5s ease-in-out 560ms infinite;
}

.rummikub-hit.is-overdrive {
  border-color: #ffe7a2;
  background: linear-gradient(145deg, #4a2f86, #c43d73 58%, #ff8a3d);
  box-shadow: 0 14px 26px rgb(120 42 170 / 36%);
  color: #fff;
  animation:
    rummikub-hit-land 520ms cubic-bezier(0.16, 1.35, 0.3, 1) both,
    rummikub-hit-glow 1.1s ease-in-out 520ms infinite;
}

.rummikub-hit.is-overdrive::before {
  position: absolute;
  z-index: -1;
  inset: -3px;
  border-radius: 18px;
  background: conic-gradient(from 0deg, #ffe08a, #ff5f8a, #7d5cff, #5ad0ff, #ffe08a);
  content: '';
  animation: rummikub-hit-spin 1.8s linear infinite;
}

.rummikub-hit.is-surge .rummikub-hit-ring,
.rummikub-hit.is-overdrive .rummikub-hit-ring {
  border-width: 2px;
}

@keyframes rummikub-hit-land {
  0% {
    opacity: 0;
    filter: blur(2px);
    transform: translateY(-12px) scale(1.42) rotate(10deg);
  }

  58% {
    opacity: 1;
    filter: none;
    transform: translateY(1px) scale(0.92) rotate(-9deg);
  }

  78% {
    transform: translateY(-1px) scale(1.05) rotate(-4deg);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1) rotate(-6deg);
  }
}

@keyframes rummikub-hit-number {
  0% {
    opacity: 0;
    transform: scale(0.35) translateY(4px);
  }

  55% {
    opacity: 1;
    transform: scale(1.22);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes rummikub-hit-ring {
  0% {
    opacity: 0.75;
    transform: scale(0.72);
  }

  100% {
    opacity: 0;
    transform: scale(1.65);
  }
}

@keyframes rummikub-hit-sparks {
  0% {
    opacity: 0;
    transform: scale(0.2);
  }

  18% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: scale(1.9);
  }
}

@keyframes rummikub-hit-glow {
  0%,
  100% {
    filter: brightness(1);
  }

  50% {
    filter: brightness(1.08);
  }
}

@keyframes rummikub-hit-spin {
  to {
    transform: rotate(1turn);
  }
}

.rummikub-turn-countdown {
  display: grid;
  min-width: 76px;
  place-items: center;
  padding: 9px 10px;
  border-radius: 12px;
  background: #f7f4e9;
  color: #65644d;
}

.rummikub-turn-countdown.is-expiring {
  background: #fff2e8;
  color: #a45b26;
}

.rummikub-turn-countdown strong {
  font-size: 18px;
  line-height: 1;
}

.rummikub-turn-countdown span {
  margin-top: 4px;
  font-size: 9px;
  font-weight: 700;
}

.rummikub-pile-count {
  display: grid;
  min-width: 70px;
  place-items: center;
  padding: 9px 12px;
  border-radius: 12px;
  background: #f1f4e9;
  color: #587153;
}

.rummikub-pile-count strong {
  font-size: 21px;
  line-height: 1;
}

.rummikub-pile-count span {
  margin-top: 4px;
  font-size: 9px;
  font-weight: 700;
}

.rummikub-player-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.rummikub-player-chip {
  display: flex;
  min-height: 35px;
  align-items: center;
  gap: 7px;
  padding: 5px 9px;
  border: 1px solid #ece9df;
  border-radius: 10px;
  background: #fff;
  color: #77796e;
  font-size: 10px;
}

.rummikub-player-chip strong {
  color: #4c5149;
  font-size: 10px;
}

.rummikub-player-chip small {
  color: #92917f;
  font-size: 9px;
}

.rummikub-player-chip.is-active {
  border-color: #98b88e;
  background: #f2f7ee;
}

.rummikub-player-chip.is-self {
  box-shadow: inset 0 0 0 1px rgb(90 138 79 / 22%);
}

.rummikub-player-chip.is-offline {
  opacity: 0.62;
}

.rummikub-panel {
  padding: 13px;
}

.rummikub-panel-heading,
.rummikub-meld-heading,
.rummikub-editor-actions,
.rummikub-submit-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.rummikub-rack-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 9px;
}

.rummikub-panel-heading {
  margin-bottom: 10px;
}

.rummikub-panel-heading h3 {
  font-size: 13px;
}

.rummikub-panel-heading h3 span {
  margin-left: 4px;
  color: #8a907f;
  font-size: 11px;
}

.rummikub-selection-count {
  color: #737b63;
  font-size: 10px;
  font-weight: 700;
}

.rummikub-preview-status {
  color: #737b63;
  font-size: 10px;
  font-weight: 700;
  text-align: right;
}

.rummikub-sort-controls {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 9px;
  background: #f1f3e9;
}

.rummikub-sort-button {
  min-height: 29px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #77796e;
  font: inherit;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
}

.rummikub-sort-button.is-active {
  border-color: #dce5d6;
  background: #fff;
  color: #4f704a;
}

.rummikub-settings-trigger {
  min-height: 29px;
  padding: 0 9px;
  border: 1px solid #e4e7de;
  border-radius: 8px;
  background: #fff;
  color: #62675d;
  font: inherit;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
}

.rummikub-settings-trigger:hover {
  border-color: #d0d9ca;
  background: #f7f9f4;
  color: #4f704a;
}

.rummikub-settings-trigger:focus-visible,
.rummikub-settings-close:focus-visible,
.rummikub-settings-footer .button:focus-visible {
  outline: 2px solid #819975;
  outline-offset: 2px;
}

.rummikub-empty-board,
.rummikub-empty-hand,
.rummikub-waiting-note,
.rummikub-sync-message {
  margin: 0;
  padding: 13px;
  border-radius: 11px;
  background: #f7f7f0;
  color: #77796d;
  font-size: 11px;
  text-align: center;
}

.rummikub-meld-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr));
  gap: 8px;
  max-height: 270px;
  overflow-x: hidden;
  overflow-y: auto;
}

.rummikub-meld {
  min-width: 0;
  padding: 9px;
  border: 1px solid #ece9df;
  border-radius: 12px;
  background: #fafaf6;
}

.rummikub-meld.is-changed {
  border-color: #8a9fc6;
  background: #f7f9fe;
  box-shadow: 0 0 0 1px rgb(138 159 198 / 26%);
}

.rummikub-meld.is-invalid {
  border-color: #dfae88;
  background: #fff9f3;
}

.rummikub-meld-heading {
  justify-content: flex-start;
  margin-bottom: 7px;
  color: #77796e;
  font-size: 9px;
}

.rummikub-meld-heading strong {
  color: #53594d;
  font-size: 10px;
}

.rummikub-meld-change-label {
  color: #617cae;
  font-weight: 700;
}

.rummikub-meld-target {
  min-height: 26px;
  margin-left: auto;
  padding: 0 9px;
  border: 1px solid #dce3d2;
  border-radius: 8px;
  background: #fff;
  color: #5b7456;
  font-size: 9px;
  font-weight: 700;
}

.rummikub-meld-target:disabled {
  opacity: 0.45;
}

.rummikub-tile-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.rummikub-tile {
  display: grid;
  width: 38px;
  min-height: 48px;
  flex: 0 0 auto;
  align-content: center;
  justify-items: center;
  gap: 1px;
  padding: 4px 2px;
  border: 1px solid #e3e1d9;
  border-radius: 8px;
  background: linear-gradient(155deg, #fff, #f8f7f2);
  box-shadow: 0 2px 4px rgb(50 49 42 / 9%);
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}

.rummikub-tile span {
  line-height: 1;
}

.rummikub-tile small {
  color: #6b6f65;
  font-size: 7px;
  font-weight: 800;
  line-height: 1.1;
}

.rummikub-joker-identifier {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 2;
  display: grid;
  width: 9px;
  height: 9px;
  place-items: center;
  border: 1px solid #fff;
  border-radius: 50%;
  background: #45483f;
  color: #fff;
  font-size: 6px;
  font-weight: 900;
  line-height: 1;
  pointer-events: none;
}

.rummikub-new-tile-mark {
  position: absolute;
  top: 2px;
  left: 2px;
  z-index: 1;
  width: 21px;
  height: 12px;
  pointer-events: none;
}

.rummikub-tile.tile-red {
  color: #d14e4e;
}

.rummikub-tile.tile-blue {
  color: #4777bd;
}

.rummikub-tile.tile-black {
  color: #3c4042;
}

.rummikub-tile.tile-yellow {
  color: #be941f;
}

.rummikub-tile.is-joker {
  border-color: #e3d9a9;
  background: linear-gradient(150deg, #fffef6, #f7f1d8);
}

.rummikub-tile:not(:disabled) {
  cursor: pointer;
}

.rummikub-tile:not(:disabled):hover {
  transform: translateY(-2px);
}

.rummikub-tile.is-selected {
  transform: translateY(-3px);
  border-color: #779e6d;
  box-shadow: 0 0 0 2px rgb(119 158 109 / 23%), 0 5px 11px rgb(50 49 42 / 12%);
}

.rummikub-tile:disabled {
  opacity: 1;
}

.rummikub-hand-panel {
  position: relative;
  display: grid;
  gap: 12px;
}

.rummikub-hand-panel.is-editing {
  border-color: #dfe6d7;
  background: #fffffc;
}

.rummikub-hand-panel .rummikub-panel-heading {
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 0;
}

.rummikub-turn-progress {
  position: absolute;
  z-index: 1;
  top: 0;
  right: 20px;
  left: 20px;
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf0e9;
  pointer-events: none;
}

.rummikub-turn-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #a8c795, #779d6b);
  transition: width 1s linear, background 180ms ease;
}

.rummikub-hand-panel.is-turn-expiring .rummikub-turn-progress-fill {
  background: linear-gradient(90deg, #e9b16e, #d47b57);
}

.rummikub-editor-actions {
  flex-wrap: wrap;
}

.rummikub-editor-actions .button,
.rummikub-submit-actions .button {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  font-size: 10px;
}

.rummikub-hand {
  padding: 10px;
  border: 1px dashed #dce3d2;
  border-radius: 11px;
  background: #f8faf4;
}

.rummikub-game.hand-theme-sage .rummikub-hand {
  border-color: #dce4d6;
  background: #f5f8f1;
}

.rummikub-game.hand-theme-sage .rummikub-tile {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-color: #ded7c5;
  background:
    radial-gradient(circle at 4px 4px, rgb(160 126 66 / 34%) 0 1px, transparent 1.5px),
    radial-gradient(circle at calc(100% - 4px) 4px, rgb(160 126 66 / 34%) 0 1px, transparent 1.5px),
    radial-gradient(circle at 4px calc(100% - 4px), rgb(160 126 66 / 34%) 0 1px, transparent 1.5px),
    radial-gradient(circle at calc(100% - 4px) calc(100% - 4px), rgb(160 126 66 / 34%) 0 1px, transparent 1.5px),
    linear-gradient(155deg, #fffefa, #f8f5eb);
}

.rummikub-game.hand-theme-sage .rummikub-tile::before {
  position: absolute;
  inset: 3px;
  border: 1px solid rgb(160 126 66 / 24%);
  border-radius: 4px;
  content: '';
  pointer-events: none;
}

.rummikub-game.hand-theme-sage .rummikub-tile.is-joker {
  border-color: #e3d9a9;
  background:
    radial-gradient(circle at 4px 4px, rgb(160 126 66 / 36%) 0 1px, transparent 1.5px),
    radial-gradient(circle at calc(100% - 4px) 4px, rgb(160 126 66 / 36%) 0 1px, transparent 1.5px),
    radial-gradient(circle at 4px calc(100% - 4px), rgb(160 126 66 / 36%) 0 1px, transparent 1.5px),
    radial-gradient(circle at calc(100% - 4px) calc(100% - 4px), rgb(160 126 66 / 36%) 0 1px, transparent 1.5px),
    linear-gradient(150deg, #fffef6, #f7f1d8);
}

.rummikub-game.hand-theme-sage .rummikub-tile.is-selected {
  border-color: #779e6d;
  box-shadow: 0 0 0 2px rgb(119 158 109 / 23%), 0 5px 11px rgb(50 49 42 / 12%);
}

.rummikub-game.hand-theme-mist .rummikub-hand-panel {
  border-color: #e1e5ed;
  background: #fbfcff;
}

.rummikub-game.hand-theme-mist .rummikub-hand-panel.is-editing {
  border-color: #d7deeb;
  background: #f9fbff;
}

.rummikub-game.hand-theme-mist .rummikub-hand {
  border-color: #d8dfec;
  background: linear-gradient(135deg, #f2f5fa, #f7f8fc);
}

.rummikub-game.hand-theme-mist .rummikub-tile {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 2px double #d4ddeb;
  background:
    radial-gradient(circle at 50% 4px, rgb(118 140 176 / 30%) 0 1px, transparent 1.5px),
    radial-gradient(circle at 50% calc(100% - 4px), rgb(118 140 176 / 30%) 0 1px, transparent 1.5px),
    linear-gradient(155deg, #fff, #f3f6fb);
}

.rummikub-game.hand-theme-mist .rummikub-tile::before {
  position: absolute;
  inset: 3px;
  border: 1px dashed rgb(118 140 176 / 24%);
  border-radius: 4px;
  content: '';
  pointer-events: none;
}

.rummikub-game.hand-theme-mist .rummikub-tile.is-joker {
  border-color: #ded8c0;
  background:
    radial-gradient(circle at 50% 4px, rgb(118 140 176 / 34%) 0 1px, transparent 1.5px),
    radial-gradient(circle at 50% calc(100% - 4px), rgb(118 140 176 / 34%) 0 1px, transparent 1.5px),
    linear-gradient(155deg, #fffef8, #f2f0e7);
}

.rummikub-game.hand-theme-mist .rummikub-tile.is-selected {
  border-color: #8799bb;
  box-shadow: 0 0 0 2px rgb(135 153 187 / 22%), 0 5px 11px rgb(50 49 42 / 12%);
}

.rummikub-game.hand-theme-sage .rummikub-hand-panel.is-my-turn,
.rummikub-game.hand-theme-mist .rummikub-hand-panel.is-my-turn {
  border-color: #7f9f73;
  box-shadow: 0 0 0 3px rgb(127 159 115 / 18%), 0 8px 24px rgb(64 57 37 / 9%);
}

.rummikub-settings-dialog {
  width: min(460px, calc(100vw - 28px));
  max-width: none;
  max-height: min(86vh, 700px);
  overflow-y: auto;
  padding: 0;
  border: 1px solid #e6e8df;
  border-radius: 20px;
  background: #fffefa;
  color: #45483f;
  box-shadow: 0 24px 75px rgb(34 39 30 / 24%);
}

.rummikub-settings-dialog::backdrop {
  background: rgb(24 29 26 / 52%);
  backdrop-filter: blur(3px);
}

.rummikub-settings-content {
  display: grid;
  gap: 15px;
  padding: 22px;
}

.rummikub-settings-header,
.rummikub-settings-block-heading,
.rummikub-settings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.rummikub-settings-header {
  padding-bottom: 14px;
  border-bottom: 1px solid #eeeee7;
}

.rummikub-settings-header .rummikub-kicker {
  margin-bottom: 4px;
}

.rummikub-settings-header h2 {
  margin: 0;
  color: #353c35;
  font-size: 21px;
  letter-spacing: -0.03em;
}

.rummikub-settings-close {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #e8e9e2;
  border-radius: 9px;
  background: #fff;
  color: #74786e;
  font-size: 20px;
  line-height: 1;
}

.rummikub-settings-block {
  display: grid;
  gap: 10px;
  padding: 13px;
  border: 1px solid #eceee6;
  border-radius: 13px;
  background: linear-gradient(145deg, #fff, #fcfdf9);
}

.rummikub-settings-block-heading label,
.rummikub-settings-block-heading h3 {
  margin: 0;
  color: #4e5448;
  font-size: 11px;
  font-weight: 800;
}

.rummikub-settings-block-heading output {
  color: #708366;
  font-size: 10px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.rummikub-settings-block-heading > span {
  color: #85897d;
  font-size: 9px;
  text-align: right;
}

.rummikub-settings-volume-slider {
  width: 100%;
  margin: 0;
  accent-color: #778d6c;
  cursor: pointer;
}

.rummikub-settings-volume-labels {
  display: flex;
  justify-content: space-between;
  color: #8b8f83;
  font-size: 9px;
}

.rummikub-theme-options {
  display: grid;
  gap: 8px;
}

.rummikub-theme-option {
  display: grid;
  min-width: 0;
  grid-template-columns: 16px 78px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid #e9ebe4;
  border-radius: 11px;
  background: #fff;
  cursor: pointer;
}

.rummikub-theme-option.is-selected.theme-sage {
  border-color: #cbd8c4;
  background: #fcfdfb;
  box-shadow: 0 0 0 2px rgb(137 160 125 / 12%);
}

.rummikub-theme-option.is-selected.theme-mist {
  border-color: #cbd5e4;
  background: #fcfcff;
  box-shadow: 0 0 0 2px rgb(135 153 187 / 12%);
}

.rummikub-theme-option:focus-within {
  outline: 2px solid #819975;
  outline-offset: 2px;
}

.rummikub-theme-option input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #778d6c;
}

.rummikub-theme-option.theme-mist input {
  accent-color: #8394b3;
}

.rummikub-theme-preview {
  display: flex;
  width: 78px;
  height: 44px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px;
  border: 1px solid;
  border-radius: 9px;
}

.rummikub-theme-preview.theme-sage {
  border-color: #dce4d6;
  background: #f3f6ef;
}

.rummikub-theme-preview.theme-mist {
  border-color: #d8dfec;
  background: #f0f3f8;
}

.rummikub-theme-preview-tile {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  width: 17px;
  height: 28px;
  place-items: center;
  border: 1px solid;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgb(50 49 42 / 9%);
  font-size: 9px;
  font-weight: 900;
}

.rummikub-theme-preview.theme-sage .rummikub-theme-preview-tile {
  border-color: #ded7c5;
  background:
    radial-gradient(circle at 3px 3px, rgb(160 126 66 / 38%) 0 0.8px, transparent 1.2px),
    radial-gradient(circle at calc(100% - 3px) calc(100% - 3px), rgb(160 126 66 / 38%) 0 0.8px, transparent 1.2px),
    linear-gradient(155deg, #fffefa, #f8f5eb);
}

.rummikub-theme-preview.theme-sage .rummikub-theme-preview-tile::before {
  position: absolute;
  inset: 2px;
  border: 1px solid rgb(160 126 66 / 28%);
  border-radius: 2px;
  content: '';
}

.rummikub-theme-preview.theme-mist .rummikub-theme-preview-tile {
  border: 2px double #d4ddeb;
  background:
    radial-gradient(circle at 50% 3px, rgb(118 140 176 / 32%) 0 0.8px, transparent 1.2px),
    linear-gradient(155deg, #fff, #f3f6fb);
}

.rummikub-theme-preview.theme-mist .rummikub-theme-preview-tile::before {
  position: absolute;
  inset: 2px;
  border: 1px dashed rgb(118 140 176 / 30%);
  border-radius: 2px;
  content: '';
}

.rummikub-theme-preview-tile.tile-red {
  color: #d14e4e;
}

.rummikub-theme-preview-tile.tile-blue {
  color: #4777bd;
}

.rummikub-theme-preview-tile.tile-yellow {
  color: #be941f;
}

.rummikub-theme-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.rummikub-theme-copy strong {
  color: #4b5147;
  font-size: 10px;
}

.rummikub-theme-copy small {
  color: #83877b;
  font-size: 9px;
  line-height: 1.4;
}

.rummikub-settings-notice {
  margin: 0;
  padding: 9px 10px;
  border-radius: 9px;
  background: #fff8e7;
  color: #826820;
  font-size: 10px;
  line-height: 1.5;
}

.rummikub-settings-footer {
  justify-content: space-between;
  color: #85897d;
  font-size: 9px;
}

.rummikub-settings-footer .button {
  min-height: 32px;
  padding: 0 14px;
  border-radius: 9px;
  font-size: 10px;
}

.rummikub-joker-settings {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 9px;
  border-radius: 11px;
  background: #f7f6ed;
}

.rummikub-joker-settings h4 {
  font-size: 11px;
}

.rummikub-joker-control {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 7px;
  border: 1px solid #e7e2cc;
  border-radius: 8px;
  background: #fff;
  color: #666653;
  font-size: 9px;
}

.rummikub-joker-control select {
  min-height: 26px;
  border: 1px solid #e6e4da;
  border-radius: 6px;
  background: #fff;
  color: #45483f;
  font-size: 10px;
}

.rummikub-draft-status {
  display: grid;
  gap: 4px;
  color: #727765;
  font-size: 10px;
  line-height: 1.45;
}

.rummikub-submit-actions {
  justify-content: flex-end;
}

.rummikub-turn-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.rummikub-turn-actions .button {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 10px;
  font-size: 11px;
}

.rummikub-waiting-note {
  background: transparent;
}

@media (max-width: 560px) {
  .rummikub-status-panel {
    align-items: flex-start;
    padding: 13px;
  }

  .rummikub-status-panel h2 {
    font-size: 16px;
  }

  .rummikub-pile-count {
    min-width: 60px;
    padding-inline: 8px;
  }

  .rummikub-status-metrics {
    flex-direction: column;
  }

  .rummikub-player-chip {
    gap: 5px;
    padding-inline: 7px;
  }

  .rummikub-panel {
    padding: 10px;
  }

  .rummikub-meld-list {
    grid-template-columns: 1fr;
  }

  .rummikub-hand-panel .rummikub-panel-heading {
    display: grid;
  }

  .rummikub-rack-controls {
    width: 100%;
    justify-content: flex-start;
  }

  .rummikub-editor-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .rummikub-tile {
    width: 34px;
    min-height: 44px;
  }

  .rummikub-turn-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .rummikub-hit {
    top: 8px;
    right: 8px;
    min-width: 54px;
    padding: 6px 8px 5px;
  }

  .rummikub-hit strong {
    font-size: 22px;
  }

  .rummikub-board-panel:has(.rummikub-hit) .rummikub-panel-heading {
    padding-right: 72px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rummikub-hit,
  .rummikub-hit strong,
  .rummikub-hit-ring,
  .rummikub-hit-sparks,
  .rummikub-hit.is-overdrive::before {
    animation: none;
  }

  .rummikub-hit {
    transform: rotate(-6deg);
  }
}
</style>
