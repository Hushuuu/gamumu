<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  getRummikubBoardTilePoints,
  isRummikubColor,
  isRummikubPrivateState,
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

const props = defineProps<{
  game: GameView
  gameEvent: GameEvent | null
  players: PlayerView[]
  playerId: string
  gameName: string
  isHost: boolean
  canInteract: boolean
}>()

const emit = defineEmits<{
  'game-action': [action: string, payload: Record<string, unknown>]
}>()

const game = computed(() => props.game.gameId === 'rummikub' ? props.game : null)
const clockNow = ref(Date.now())
const privateHand = ref<RummikubTile[]>([])
const rackSortMode = ref<RackSortMode>('color')
const isEditing = ref(false)
const draftHand = ref<RummikubTile[]>([])
const draftMelds = ref<DraftMeld[]>([])
const selectedTileIds = ref<number[]>([])
const originalHand = ref<RummikubTile[]>([])
const originalMelds = ref<RummikubMeld[]>([])
const originalHandTileIds = ref(new Set<number>())
const originalTableTileIds = ref(new Set<number>())
let nextDraftMeldId = 1
let turnClockInterval: number | null = null

onMounted(() => {
  turnClockInterval = window.setInterval(() => {
    clockNow.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
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
const remainingTurnSeconds = computed(() => {
  const deadlineAt = game.value?.turnDeadlineAt
  return deadlineAt == null
    ? null
    : Math.max(0, Math.ceil((deadlineAt - clockNow.value) / 1000))
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
  return (game.value?.table ?? []).map((meld, index) => ({
    id: `table-${index}`,
    tiles: meld.tiles,
  }))
})
const visibleHand = computed(() => {
  return sortHand(
    isEditing.value ? draftHand.value : privateHand.value,
    rackSortMode.value,
  )
})
const playerNameById = computed(() => new Map(props.players.map((player) => [player.id, player.name])))
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
const draftPreservesJokers = computed(() => {
  const currentTiles = draftMelds.value.flatMap((meld) => meld.tiles)
  const currentTileById = new Map(currentTiles.map((tile) => [tile.id, tile]))
  const reservedReplacementIds = new Set<number>()

  for (const meld of originalMelds.value) {
    for (const tile of meld.tiles) {
      if (tile.kind !== 'joker') {
        continue
      }

      const replacement = currentTileById.get(tile.id)
      if (!replacement || replacement.kind !== 'joker') {
        return false
      }
      const remainsInOriginalMeld = draftMelds.value.some((draftMeld) => {
        const draftJoker = draftMeld.tiles.find((candidate) => candidate.id === tile.id)
        return (
          draftJoker?.kind === 'joker' &&
          sameFace(tile.representedAs, draftJoker.representedAs) &&
          meld.tiles.every((originalTile) => {
            return draftMeld.tiles.some((candidate) => candidate.id === originalTile.id)
          })
        )
      })
      if (remainsInOriginalMeld) {
        continue
      }

      const replacementTile = currentTiles.find((candidate) => {
        return (
          originalHandTileIds.value.has(candidate.id) &&
          !reservedReplacementIds.has(candidate.id) &&
          candidate.kind === 'number' &&
          sameFace({ color: candidate.color, value: candidate.value }, tile.representedAs)
        )
      })
      if (!replacementTile) {
        return false
      }
      reservedReplacementIds.add(replacementTile.id)
    }
  }

  return true
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
    usedHandTileCount.value === 0 ||
    !draftPreservesJokers.value
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
    privateHand.value = sortHand(event.payload.hand)
  },
  { immediate: true },
)

watch(() => game.value?.turnNumber, (turnNumber, previousTurnNumber) => {
  if (previousTurnNumber !== undefined && turnNumber !== previousTurnNumber) {
    cancelEdit()
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

function getTileAriaLabel(tile: RummikubTile | RummikubBoardTile): string {
  if (tile.kind === 'number') {
    return `${COLOR_NAMES[tile.color]}色 ${tile.value}`
  }
  if ('representedAs' in tile) {
    return `Joker，代表${COLOR_NAMES[tile.representedAs.color]}色 ${tile.representedAs.value}`
  }
  return 'Joker 百搭牌'
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

function sameFace(left: RummikubFace, right: RummikubFace): boolean {
  return left.color === right.color && left.value === right.value
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
}

function cancelEdit(): void {
  isEditing.value = false
  draftHand.value = []
  draftMelds.value = []
  selectedTileIds.value = []
  originalHand.value = []
  originalHandTileIds.value = new Set()
  originalMelds.value = []
  originalTableTileIds.value = new Set()
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

  const move: Record<string, unknown> = {
    melds: draftMelds.value.map((meld) => meld.tiles.map((tile) => tile.id)),
    jokers: draftMelds.value.flatMap((meld) => {
      return meld.tiles
        .filter((tile): tile is BoardJoker => tile.kind === 'joker')
        .map((tile) => ({
          tileId: tile.id,
          representedAs: tile.representedAs,
        }))
    }),
  } satisfies RummikubMove
  emit('game-action', 'play_turn', move)
}

function drawOrPass(): void {
  if (!canAct.value || !game.value) {
    return
  }
  emit('game-action', game.value.drawPileCount > 0 ? 'draw_tile' : 'pass_turn', {})
}
</script>

<template>
  <div class="playing-state rummikub-game">
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
          {{ game?.drawPileCount ? '時間到，未提交的桌面編輯將還原並自動抽牌。' : '時間到且牌堆已空，系統正自動跳過。' }}
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
      <header class="rummikub-panel-heading">
        <div>
          <p class="rummikub-kicker">SHARED TABLE</p>
          <h3>桌面組合 <span>{{ visibleMelds.length }}</span></h3>
        </div>
        <span v-if="isEditing" class="rummikub-selection-count">
          已選 {{ selectedTileCount }} 張
        </span>
      </header>

      <p v-if="visibleMelds.length === 0" class="rummikub-empty-board">
        桌上還沒有組合，先從自己的手牌建立新組合。
      </p>

      <div v-else class="rummikub-meld-list">
        <article
          v-for="(meld, index) in visibleMelds"
          :key="meld.id"
          class="rummikub-meld"
          :class="{ 'is-invalid': isEditing && !isValidRummikubMeld(meld.tiles) }"
        >
          <header class="rummikub-meld-heading">
            <strong>組合 {{ index + 1 }}</strong>
            <span v-if="isEditing && !isValidRummikubMeld(meld.tiles)">尚未完成</span>
            <span v-else-if="isEditing">合法組合</span>
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
            </button>
          </div>
        </article>
      </div>
    </section>

    <section
      class="rummikub-panel rummikub-hand-panel"
      :class="{ 'is-editing': isEditing }"
    >
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
              建立新組合
            </button>
            <button
              class="button button-secondary"
              type="button"
              :disabled="!props.canInteract || !canReturnSelectedTiles"
              @click="returnSelectedTilesToHand"
            >
              撤回所選手牌
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
          <small v-if="tile.kind === 'joker'">Joker</small>
        </button>
      </div>

      <div v-if="isEditing && visibleJokers.length > 0" class="rummikub-joker-settings">
        <div>
          <p class="rummikub-kicker">WILD TILE</p>
          <h4>Joker 代表牌</h4>
        </div>
        <label v-for="joker in visibleJokers" :key="joker.id" class="rummikub-joker-control">
          <span>Joker · {{ COLOR_NAMES[joker.representedAs.color] }}{{ joker.representedAs.value }}</span>
          <select
            :value="joker.representedAs.color"
            :disabled="!props.canInteract || (!ownGamePlayer?.hasOpened && originalTableTileIds.has(joker.id))"
            :aria-label="`Joker ${joker.id} 代表顏色`"
            @change="changeJokerColor(joker.id, $event)"
          >
            <option v-for="color in colors" :key="color.value" :value="color.value">
              {{ color.label }}
            </option>
          </select>
          <select
            :value="joker.representedAs.value"
            :disabled="!props.canInteract || (!ownGamePlayer?.hasOpened && originalTableTileIds.has(joker.id))"
            :aria-label="`Joker ${joker.id} 代表數字`"
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
        <span v-else-if="!draftPreservesJokers">
          換回桌面 Joker 時，請用原本代表的實體牌替換。
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
          @click="cancelEdit"
        >
          取消編輯
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
        整理桌面
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
  gap: 8px;
}

.rummikub-meld {
  min-width: 0;
  padding: 9px;
  border: 1px solid #ece9df;
  border-radius: 12px;
  background: #fafaf6;
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
}
</style>
