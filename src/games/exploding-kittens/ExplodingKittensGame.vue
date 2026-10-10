<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  EXPLODING_KITTENS_PRIVATE_EVENT,
  getExplodingKittensStartingCardCounts,
  isExplodingKittensPrivateState,
  type ExplodingKittensCardType,
  type ExplodingKittensPrivateState,
  type ExplodingKittensView,
} from '../../../shared/games'
import type { GameEvent, GameView, PlayerView } from '../../../shared/protocol'
import {
  analyzePlay,
  cardName,
  countCardTypes,
  formatCardList,
  namedOptionsFor,
  nopeOutcomeLabel,
  PHASE_LABELS,
  remainingSeconds,
  SEAT_STATUS_LABELS,
  sortHand,
  targetCandidates,
} from './helpers'
import {
  explodingKittensCardFaceUrl,
  explodingKittensEffectIllustrationUrl,
} from './visualAssets'

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

const EMPTY_PRIVATE_STATE: ExplodingKittensPrivateState = {
  hand: [],
  peek: null,
  choice: null,
  maxPosition: null,
  canNope: false,
}

const CARD_EFFECT_SUMMARIES: Partial<Record<ExplodingKittensCardType, string>> = {
  nope: '每張休想都反制上一張；奇數張取消原效果，偶數張則讓原效果生效。',
  attack: '下一位玩家須連續行動兩回合。',
  skip: '跳過你的回合。',
  favor: '指定一位玩家，請對方交出一張手牌。',
  shuffle: '重新洗混抽牌堆。',
  'see-the-future': '私下查看抽牌堆頂端三張牌。',
}

const privateState = ref<ExplodingKittensPrivateState>({ ...EMPTY_PRIVATE_STATE })
const selectedCardIds = ref<string[]>([])
const targetId = ref('')
const namedType = ref<ExplodingKittensCardType | ''>('')
const giveCardId = ref('')
const defusePosition = ref<number | 'random'>(1)
const now = ref(Date.now())
let clockTimer: number | undefined

const game = computed<ExplodingKittensView | null>(() => {
  return props.game.gameId === 'exploding-kittens' ? props.game : null
})
const remaining = computed(() => remainingSeconds(game.value?.phaseEndsAt ?? 0, now.value))
const phaseDurationSeconds = computed(() => {
  const currentGame = game.value
  if (!currentGame) {
    return 0
  }
  return currentGame.phase === 'nope'
    ? currentGame.settings.nopeWindowSeconds
    : currentGame.settings.turnTimeSeconds
})
const phaseProgress = computed(() => {
  const deadline = game.value?.phaseEndsAt
  const durationMs = phaseDurationSeconds.value * 1_000
  if (deadline === null || deadline === undefined || durationMs === 0) {
    return 0
  }
  return Math.max(0, Math.min(100, ((deadline - now.value) / durationMs) * 100))
})
const currentPlayer = computed(() => {
  return game.value?.seats.find((seat) => seat.id === game.value?.currentPlayerId) ?? null
})
const isCurrentPlayer = computed(() => game.value?.currentPlayerId === props.playerId)
const canTakeTurn = computed(() => {
  return Boolean(props.canInteract && isCurrentPlayer.value && game.value?.phase === 'turn')
})
const canGiveCard = computed(() => {
  return Boolean(props.canInteract && privateState.value.choice === 'give')
})
const canPlaceDefuse = computed(() => {
  return Boolean(props.canInteract && privateState.value.choice === 'defuse')
})
const canPlayNope = computed(() => {
  return Boolean(
    props.canInteract &&
    game.value?.phase === 'nope' &&
    privateState.value.canNope,
  )
})
const canRespondNope = computed(() => {
  const pending = game.value?.pending
  return Boolean(
    props.canInteract &&
    game.value?.phase === 'nope' &&
    pending &&
    !pending.nopeRespondedBy.includes(props.playerId),
  )
})
const sortedHand = computed(() => sortHand(privateState.value.hand))
const selectedCards = computed(() => {
  const selectedIds = new Set(selectedCardIds.value)
  return sortedHand.value.filter((card) => selectedIds.has(card.id))
})
const selectedTypes = computed(() => selectedCards.value.map((card) => card.type))
const playAnalysis = computed(() => analyzePlay(selectedTypes.value))
const possibleTargets = computed(() => {
  return game.value ? targetCandidates(game.value.seats, props.playerId) : []
})
const discardTypes = computed(() => countCardTypes(game.value?.discard ?? []))
const gameCardCounts = computed(() => {
  return game.value ? getExplodingKittensStartingCardCounts(game.value.startingPlayerCount) : []
})
const gameCardTotal = computed(() => {
  return gameCardCounts.value.reduce((total, entry) => total + entry.count, 0)
})
const namedOptions = computed(() => {
  const kind = playAnalysis.value.kind
  if (kind !== 'five') {
    return namedOptionsFor(kind, [])
  }

  return namedOptionsFor(kind, [
    ...(game.value?.discard ?? []),
    ...selectedTypes.value,
  ])
})
const canPlaySelected = computed(() => {
  const analysis = playAnalysis.value
  if (!canTakeTurn.value || !analysis.kind) {
    return false
  }
  if (analysis.needsTarget && !possibleTargets.value.some((seat) => seat.id === targetId.value)) {
    return false
  }
  if (
    analysis.needsNamedType &&
    (namedType.value === '' || !namedOptions.value.includes(namedType.value))
  ) {
    return false
  }
  return true
})
const nopeDialog = computed(() => {
  const currentGame = game.value
  const pending = currentGame?.pending
  if (
    currentGame?.phase !== 'nope' ||
    !pending ||
    !currentGame.seats.some((seat) => seat.id === props.playerId && seat.status === 'alive') ||
    pending.nopeRespondedBy.includes(props.playerId)
  ) {
    return null
  }

  const isCounter = pending.nopeCount > 0
  let message: string
  if (!isCounter) {
    message = `${playerName(pending.actorId)} 打出${formatCardList(pending.cardTypes)}，是否要使用休想卡？`
  } else {
    const lastNopeId = pending.nopedBy[pending.nopedBy.length - 1]
    if (!lastNopeId) {
      return null
    }
    const previousNopeId = pending.nopedBy[pending.nopedBy.length - 2]
    message = previousNopeId
      ? `${playerName(lastNopeId)}：休想 ${playerName(previousNopeId)} 的休想卡`
      : `${playerName(lastNopeId)} 對 ${playerName(pending.actorId)} 使用休想卡`
  }

  return { isCounter, message }
})
const nopeDialogPreview = computed(() => {
  const pending = game.value?.pending
  if (!pending) {
    return null
  }

  if (pending.nopeCount === 0 && pending.playKind !== 'card') {
    return null
  }

  const type = pending.nopeCount > 0 ? 'nope' : pending.cardTypes[0]
  if (!type) {
    return null
  }

  const imageUrl = explodingKittensEffectIllustrationUrl(type)
  const description = CARD_EFFECT_SUMMARIES[type]
  if (!imageUrl || !description) {
    return null
  }

  return {
    title: cardName(type),
    imageUrl,
    description,
  }
})
const turnMessage = computed(() => {
  const current = currentPlayer.value?.name ?? '玩家'
  const pending = game.value?.pending
  if (!game.value) {
    return ''
  }

  switch (game.value.phase) {
    case 'turn':
      return isCurrentPlayer.value
        ? `輪到你行動${game.value.turnsLeft > 1 ? `，還有 ${game.value.turnsLeft} 回合` : ''}。`
        : `輪到 ${current} 行動${game.value.turnsLeft > 1 ? `，還有 ${game.value.turnsLeft} 回合` : ''}。`
    case 'nope':
      return `${pending ? playerName(pending.actorId) : current} 的效果等待休想判定。${nopeOutcomeLabel(pending?.nopeCount ?? 0)}`
    case 'favor':
      return pending ? `${playerName(pending.targetId ?? '')} 請選擇要交出的手牌。` : '等待恩惠結算。'
    case 'defuse':
      return pending ? `${playerName(pending.actorId)} 抽到爆炸貓，必須拆除並放回牌堆。` : '等待拆除。'
    case 'finished':
      return '本局已結束。'
  }
})

watch(() => props.gameEvent, (event) => {
  if (
    event?.gameId === 'exploding-kittens' &&
    event.event === EXPLODING_KITTENS_PRIVATE_EVENT &&
    isExplodingKittensPrivateState(event.payload)
  ) {
    privateState.value = event.payload
  }
}, { immediate: true })

watch(() => [game.value?.phase, game.value?.currentPlayerId], () => {
  selectedCardIds.value = []
  targetId.value = ''
  namedType.value = ''
  giveCardId.value = ''
})

watch(() => privateState.value.hand.map((card) => card.id).join(','), () => {
  const availableIds = new Set(privateState.value.hand.map((card) => card.id))
  selectedCardIds.value = selectedCardIds.value.filter((id) => availableIds.has(id))
  if (!availableIds.has(giveCardId.value)) {
    giveCardId.value = ''
  }
})

watch(() => privateState.value.maxPosition, (maxPosition) => {
  if (maxPosition !== null && typeof defusePosition.value === 'number') {
    defusePosition.value = Math.min(Math.max(defusePosition.value, 1), maxPosition)
  }
})

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 250)
})

onUnmounted(() => {
  if (clockTimer !== undefined) {
    window.clearInterval(clockTimer)
  }
})

function playerName(id: string): string {
  return game.value?.seats.find((seat) => seat.id === id)?.name
    ?? props.players.find((player) => player.id === id)?.name
    ?? '玩家'
}

function toggleCard(cardId: string): void {
  if (canGiveCard.value) {
    giveCardId.value = giveCardId.value === cardId ? '' : cardId
    return
  }
  if (!canTakeTurn.value) {
    return
  }

  selectedCardIds.value = selectedCardIds.value.includes(cardId)
    ? selectedCardIds.value.filter((id) => id !== cardId)
    : selectedCardIds.value.length < 5
      ? [...selectedCardIds.value, cardId]
      : selectedCardIds.value
}

function submitPlay(): void {
  if (!canPlaySelected.value || !playAnalysis.value.kind) {
    return
  }

  const payload: Record<string, unknown> = {
    cardIds: [...selectedCardIds.value],
  }
  if (playAnalysis.value.needsTarget) {
    payload.targetId = targetId.value
  }
  if (playAnalysis.value.needsNamedType) {
    payload.namedType = namedType.value
  }
  emit('game-action', 'play', payload)
  selectedCardIds.value = []
  targetId.value = ''
  namedType.value = ''
}

function drawCard(): void {
  if (canTakeTurn.value) {
    selectedCardIds.value = []
    targetId.value = ''
    namedType.value = ''
    emit('game-action', 'draw', {})
  }
}

function playNope(): void {
  if (canPlayNope.value) {
    emit('game-action', 'nope', {})
  }
}

function passNope(): void {
  if (canRespondNope.value) {
    emit('game-action', 'nope-pass', {})
  }
}

function giveCard(): void {
  if (canGiveCard.value && giveCardId.value) {
    emit('game-action', 'give', { cardId: giveCardId.value })
    giveCardId.value = ''
  }
}

function placeDefuse(): void {
  if (canPlaceDefuse.value) {
    emit('game-action', 'defuse', { position: defusePosition.value })
  }
}
</script>

<template>
  <main v-if="game" class="playing-state exploding-kittens-state">
    <header class="ek-heading">
      <div>
        <p class="eyebrow">最後的倖存者</p>
        <h2>{{ gameName }}</h2>
      </div>
      <div class="ek-phase-timer" :class="{ 'is-low': remaining <= 5 }" role="timer">
        <strong>{{ remaining }}</strong>
        <span>{{ PHASE_LABELS[game.phase] }}</span>
      </div>
    </header>

    <div class="ek-turn-banner" role="status">
      <strong>{{ turnMessage }}</strong>
      <span v-if="game.phase === 'nope' && game.pending">
        {{ game.pending.nopeCount }} 張休想 · 判定倒數 {{ remaining }} 秒
      </span>
    </div>

    <section class="ek-seats" aria-label="玩家狀態">
      <article
        v-for="seat in game.seats"
        :key="seat.id"
        class="ek-seat"
        :class="{
          'is-current': seat.id === game.currentPlayerId,
          'is-me': seat.id === playerId,
          'is-out': seat.status !== 'alive',
        }"
      >
        <span class="ek-seat-name">{{ seat.name }}{{ seat.id === playerId ? '（你）' : '' }}</span>
        <span class="ek-seat-meta">
          {{ SEAT_STATUS_LABELS[seat.status] }} · {{ seat.handCount }} 張手牌
        </span>
        <span v-if="seat.id === game.currentPlayerId && game.phase !== 'finished'" class="ek-seat-turn">
          {{ game.turnsLeft > 1 ? `剩餘 ${game.turnsLeft} 回合` : '目前回合' }}
        </span>
      </article>
    </section>

    <section class="ek-board" aria-label="棄牌區">
      <div class="ek-discard-area">
        <div class="ek-discard-heading">
          <strong>棄牌區</strong>
          <span>{{ game.discard.length }} 張</span>
        </div>
        <div v-if="discardTypes.length" class="ek-discard-types" aria-label="棄牌種類與張數">
          <span v-for="entry in discardTypes" :key="entry.type" class="ek-discard-type">
            {{ cardName(entry.type) }}
            <strong>× {{ entry.count }}</strong>
          </span>
        </div>
        <p v-else class="ek-empty-discard">目前沒有棄牌</p>
      </div>
    </section>

    <section v-if="game.phase === 'nope'" class="ek-pending-panel" aria-live="polite">
      <div>
        <strong>休想判定</strong>
        <p>{{ nopeOutcomeLabel(game.pending?.nopeCount ?? 0) }}</p>
      </div>
    </section>

    <section v-if="game.phase === 'favor' && privateState.choice === 'give'" class="ek-choice-panel">
      <div>
        <strong>恩惠：選擇一張手牌交出</strong>
        <p>對方會收到你選擇的牌。</p>
      </div>
      <button
        class="button button-primary"
        type="button"
        :disabled="!canGiveCard || !giveCardId"
        @click="giveCard"
      >
        交出所選手牌
      </button>
    </section>

    <section v-if="game.phase === 'defuse' && privateState.choice === 'defuse'" class="ek-choice-panel">
      <div>
        <strong>拆除成功，選擇爆炸貓放回的位置</strong>
        <p>放在第 1 張最靠近牌堆頂端，或交由系統隨機放置。</p>
      </div>
      <div class="ek-defuse-controls">
        <label>
          <span class="sr-only">放回位置</span>
          <select v-model="defusePosition" :disabled="!canPlaceDefuse">
            <option
              v-for="position in privateState.maxPosition ?? 0"
              :key="position"
              :value="position"
            >
              第 {{ position }} 張
            </option>
            <option value="random">隨機放置</option>
          </select>
        </label>
        <button class="button button-primary" type="button" :disabled="!canPlaceDefuse" @click="placeDefuse">
          放回牌堆
        </button>
      </div>
    </section>

    <section v-if="privateState.peek?.length" class="ek-peek-panel">
      <strong>你預見的牌堆頂端</strong>
      <div>
        <figure v-for="(type, index) in privateState.peek" :key="`${type}-${index}`">
          <img :src="explodingKittensCardFaceUrl(type)" :alt="cardName(type)" />
          <figcaption>第 {{ index + 1 }} 張 · {{ cardName(type) }}</figcaption>
        </figure>
      </div>
    </section>

    <section
      class="ek-hand-panel"
      :class="{ 'is-my-turn': canTakeTurn }"
      aria-labelledby="ek-hand-heading"
    >
      <div
        v-if="game.phaseEndsAt !== null && game.phase !== 'finished'"
        class="ek-turn-progress"
        :class="{ 'is-low': remaining <= 5 }"
        role="progressbar"
        :aria-label="`${PHASE_LABELS[game.phase]}倒數`"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(phaseProgress)"
        :aria-valuetext="`剩餘 ${remaining} 秒`"
      >
        <span :style="{ transform: `scaleX(${phaseProgress / 100})` }"></span>
      </div>
      <div class="ek-section-heading">
        <div>
          <p class="eyebrow">私人手牌</p>
          <h3 id="ek-hand-heading">你的手牌 <span>({{ privateState.hand.length }})</span></h3>
        </div>
        <p v-if="canGiveCard" class="ek-selection-help">選一張牌交給恩惠對象</p>
        <p v-else-if="canTakeTurn" class="ek-selection-help">選擇 1–5 張牌，或直接抽牌結束回合</p>
      </div>

      <div v-if="privateState.hand.length" class="ek-hand">
        <button
          v-for="card in sortedHand"
          :key="card.id"
          class="ek-hand-card"
          :class="{
            'is-selected': selectedCardIds.includes(card.id) || giveCardId === card.id,
            'is-playable': canTakeTurn || canGiveCard,
          }"
          type="button"
          :disabled="!canTakeTurn && !canGiveCard"
          :aria-pressed="selectedCardIds.includes(card.id) || giveCardId === card.id"
          :aria-label="`${cardName(card.type)}${selectedCardIds.includes(card.id) ? '，已選擇' : ''}`"
          @click="toggleCard(card.id)"
        >
          <img :src="explodingKittensCardFaceUrl(card.type)" :alt="cardName(card.type)" />
          <span>{{ cardName(card.type) }}</span>
        </button>
      </div>
      <p v-else class="ek-empty-hand">目前沒有手牌。</p>

      <div v-if="canTakeTurn" class="ek-play-controls">
        <p class="ek-play-message" :class="{ 'is-invalid': selectedCardIds.length > 0 && !playAnalysis.kind }">
          {{ playAnalysis.message }}
        </p>
        <div v-if="playAnalysis.needsTarget" class="ek-inline-field">
          <label for="ek-target">指定玩家</label>
          <select id="ek-target" v-model="targetId" :disabled="possibleTargets.length === 0">
            <option value="" disabled>選擇目標</option>
            <option v-for="seat in possibleTargets" :key="seat.id" :value="seat.id">
              {{ seat.name }}（{{ seat.handCount }} 張）
            </option>
          </select>
        </div>
        <div v-if="playAnalysis.needsNamedType" class="ek-inline-field">
          <label for="ek-named-type">指定牌名</label>
          <select id="ek-named-type" v-model="namedType">
            <option value="" disabled>選擇牌名</option>
            <option v-for="type in namedOptions" :key="type" :value="type">
              {{ cardName(type) }}
            </option>
          </select>
        </div>
        <div class="ek-action-buttons">
          <button class="button button-primary" type="button" :disabled="!canPlaySelected" @click="submitPlay">
            打出所選牌
          </button>
          <button class="button button-secondary" type="button" :disabled="!canTakeTurn" @click="drawCard">
            抽牌並結束回合
          </button>
        </div>
      </div>
    </section>

    <section class="ek-card-counts-panel" aria-labelledby="ek-card-counts-heading">
      <div class="ek-section-heading">
        <div>
          <p class="eyebrow">本局起始牌組</p>
          <h3 id="ek-card-counts-heading">牌組組成 <span>（共 {{ gameCardTotal }} 張）</span></h3>
        </div>
      </div>
      <p class="ek-empty-copy">依玩家人數計算，包含起始牌與抽牌堆；數量不隨抽牌變動。</p>
      <div v-if="gameCardCounts.length" class="ek-card-counts" aria-label="本局牌組各牌種與總數">
        <span v-for="entry in gameCardCounts" :key="entry.type" class="ek-card-count">
          {{ cardName(entry.type) }}
          <strong>× {{ entry.count }}</strong>
        </span>
      </div>
      <p v-else class="ek-empty-copy">目前沒有牌組資訊。</p>
    </section>

    <section class="ek-announcements" aria-label="遊戲近況">
      <h3>最近出牌</h3>
      <ol>
        <li v-for="(announcement, index) in [...game.announcements].reverse()" :key="`${index}-${announcement}`">
          {{ announcement }}
        </li>
      </ol>
    </section>

    <Teleport to="body">
      <div
        v-if="nopeDialog"
        class="ek-nope-backdrop"
      >
        <section
          class="ek-nope-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ek-nope-dialog-title"
          aria-describedby="ek-nope-dialog-message"
        >
          <p class="eyebrow">{{ nopeDialog.isCounter ? '休想 PK' : '效果反制' }}</p>
          <h2 id="ek-nope-dialog-title">
            {{ nopeDialog.isCounter ? '休想反制中' : '要打出休想卡嗎？' }}
          </h2>
          <p id="ek-nope-dialog-message" class="ek-nope-dialog-message">
            {{ nopeDialog.message }}
          </p>
          <div v-if="nopeDialogPreview" class="ek-nope-dialog-preview">
            <img :src="nopeDialogPreview.imageUrl" :alt="`${nopeDialogPreview.title}效果插畫`" />
            <div class="ek-nope-dialog-preview-copy">
              <span class="eyebrow">本次出牌效果</span>
              <strong>{{ nopeDialogPreview.title }}</strong>
              <p>{{ nopeDialogPreview.description }}</p>
            </div>
          </div>
          <p class="ek-nope-dialog-timer" role="timer">
            判定倒數 {{ remaining }} 秒 · {{ nopeOutcomeLabel(game.pending?.nopeCount ?? 0) }}
          </p>
          <div class="ek-nope-dialog-actions">
            <button
              v-if="privateState.canNope"
              class="button button-primary"
              type="button"
              :disabled="!canPlayNope"
              @click="playNope"
            >
              打出休想卡
            </button>
            <button
              class="button button-secondary"
              type="button"
              :disabled="!canRespondNope"
              @click="passNope"
            >
              {{ privateState.canNope ? '略過' : '確定' }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </main>
  <p v-else class="ek-empty-copy">正在載入爆炸貓牌局…</p>
</template>

<style scoped>
.exploding-kittens-state {
  display: grid;
  min-width: 0;
  width: 100%;
  gap: 16px;
  max-width: 100%;
  color: var(--ink);
}

.exploding-kittens-state > * {
  min-width: 0;
  max-width: 100%;
}

.ek-heading,
.ek-section-heading,
.ek-discard-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.ek-heading h2,
.ek-section-heading h3,
.ek-announcements h3 {
  margin: 4px 0 0;
}

.ek-phase-timer {
  display: grid;
  min-width: 86px;
  justify-items: center;
  padding: 8px 12px;
  border-radius: 14px;
  background: var(--purple-light);
  color: var(--purple-dark);
}

.ek-phase-timer strong {
  font-size: 22px;
  line-height: 1;
}

.ek-phase-timer span {
  margin-top: 5px;
  font-size: 10px;
  font-weight: 700;
}

.ek-phase-timer.is-low {
  background: #fff0ed;
  color: #c64f48;
}

.ek-turn-banner,
.ek-pending-panel,
.ek-choice-panel,
.ek-peek-panel,
.ek-hand-panel,
.ek-card-counts-panel,
.ek-announcements,
.ek-board {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}

.ek-turn-banner {
  display: grid;
  gap: 5px;
  border-color: #ded9ff;
  background: #f5f3ff;
}

.ek-turn-banner span,
.ek-selection-help,
.ek-empty-copy,
.ek-empty-hand {
  color: var(--muted);
  font-size: 12px;
}

.ek-seats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
  gap: 8px;
}

.ek-seat {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}

.ek-seat.is-current {
  border-color: var(--purple);
  box-shadow: 0 0 0 2px rgb(105 87 232 / 10%);
}

.ek-seat.is-me {
  background: #f5f3ff;
}

.ek-seat.is-out {
  opacity: 0.55;
}

.ek-seat-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-seat-meta,
.ek-seat-turn {
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 10px;
}

.ek-seat-turn {
  color: var(--purple-dark);
  font-weight: 700;
}

.ek-board {
  display: block;
  min-width: 0;
}

.ek-discard-area {
  display: grid;
  min-width: 0;
  grid-template-rows: auto auto;
  align-content: start;
  gap: 8px;
}

.ek-discard-heading {
  font-size: 12px;
}

.ek-discard-heading span {
  color: var(--muted);
  font-size: 10px;
}

.ek-discard-types,
.ek-card-counts {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-content: start;
  gap: 6px;
}

.ek-discard-type,
.ek-card-count {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  font-size: 11px;
  white-space: nowrap;
}

.ek-discard-type strong,
.ek-card-count strong {
  color: var(--purple-dark);
  font-variant-numeric: tabular-nums;
}

.ek-empty-discard {
  display: grid;
  min-height: 50px;
  margin: 0;
  place-items: center;
  border: 1px dashed var(--line);
  border-radius: 10px;
  color: var(--muted);
  font-size: 11px;
}

.ek-pending-panel,
.ek-choice-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #fffaf0;
}

.ek-pending-panel p,
.ek-choice-panel p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 11px;
}

.ek-defuse-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ek-defuse-controls select,
.ek-inline-field select {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  color: var(--ink);
}

.ek-peek-panel > strong {
  display: block;
  margin-bottom: 10px;
}

.ek-peek-panel > div {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.ek-peek-panel figure {
  width: 84px;
  margin: 0;
}

.ek-peek-panel img {
  display: block;
  width: 100%;
  aspect-ratio: 5 / 6;
  box-sizing: border-box;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fffdf7;
  object-fit: contain;
}

.ek-peek-panel figcaption {
  margin-top: 4px;
  color: var(--muted);
  font-size: 9px;
  text-align: center;
}

.ek-section-heading {
  margin-bottom: 12px;
}

.ek-hand-panel {
  position: relative;
}

.ek-turn-progress {
  position: absolute;
  z-index: 1;
  top: -1px;
  right: 0;
  left: 0;
  height: 4px;
  overflow: hidden;
  border-radius: 16px 16px 0 0;
  background: rgb(105 87 232 / 12%);
  pointer-events: none;
}

.ek-turn-progress span {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: left center;
  transition: transform 180ms linear;
  background: var(--purple);
}

.ek-turn-progress.is-low span {
  background: #c64f48;
}

.ek-hand-panel.is-my-turn {
  animation: ek-hand-panel-breathe 2s ease-in-out infinite;
}

@keyframes ek-hand-panel-breathe {
  0%, 100% {
    border-color: var(--line);
    box-shadow: 0 0 0 0 rgb(105 87 232 / 0%);
  }

  50% {
    border-color: var(--purple);
    box-shadow: 0 0 0 5px rgb(105 87 232 / 13%);
  }
}

.ek-section-heading h3 {
  font-size: 16px;
}

.ek-section-heading h3 span {
  color: var(--muted);
  font-size: 12px;
}

.ek-selection-help {
  margin: 0;
  text-align: right;
}

.ek-hand {
  display: grid;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 104px), 1fr));
  gap: 8px;
  padding: 4px 2px 10px;
  max-height: min(45dvh, 400px);
  overflow-y: auto;
}

.ek-hand-card {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 6px;
  padding: 5px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: #f8f7fc;
  color: var(--ink);
  text-align: center;
  transition: transform 120ms ease, border-color 120ms ease;
}

.ek-hand-card.is-playable:hover {
  transform: translateY(-3px);
}

.ek-hand-card.is-selected {
  border-color: var(--purple);
  background: var(--purple-light);
  transform: translateY(-4px);
}

.ek-hand-card:disabled {
  cursor: default;
}

.ek-hand-card img {
  display: block;
  width: 100%;
  aspect-ratio: 5 / 6;
  box-sizing: border-box;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fffdf7;
  object-fit: contain;
}

.ek-hand-card span {
  min-height: 1.4em;
  font-size: 10px;
  font-weight: 700;
}

.ek-play-controls {
  display: flex;
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  align-items: end;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.ek-action-buttons {
  display: grid;
  min-width: 0;
  max-width: 100%;
  flex: 1 1 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ek-action-buttons .button {
  min-width: 0;
  min-height: 42px;
  padding: 8px 12px;
  line-height: 1.35;
  text-align: center;
}

.ek-play-message {
  flex: 1 1 100%;
  margin: 0;
  color: var(--muted);
  font-size: 11px;
}

.ek-play-message.is-invalid {
  color: #c64f48;
}

.ek-inline-field {
  display: grid;
  min-width: 0;
  max-width: 100%;
  gap: 4px;
}

.ek-inline-field label {
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
}

.ek-announcements ol {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
  color: #5c5875;
  font-size: 11px;
}

.ek-announcements h3 {
  margin-bottom: 9px;
  font-size: 14px;
}

.ek-announcements li {
  padding-left: 2px;
  overflow-wrap: anywhere;
}

.ek-turn-banner strong {
  overflow-wrap: anywhere;
}

.ek-nope-backdrop {
  position: fixed;
  z-index: 12000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 14px;
  background: rgb(25 22 39 / 68%);
}

.ek-nope-dialog {
  display: grid;
  width: min(100%, 500px);
  max-height: min(88vh, 660px);
  gap: 10px;
  overflow: auto;
  padding: clamp(20px, 6vw, 28px);
  border: 1px solid rgb(255 255 255 / 70%);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: 0 24px 80px rgb(21 18 38 / 28%);
  color: var(--ink);
}

.ek-nope-dialog h2 {
  margin: 0;
  font-size: clamp(20px, 5vw, 25px);
  line-height: 1.3;
}

.ek-nope-dialog-message {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.ek-nope-dialog-preview {
  display: grid;
  grid-template-columns: minmax(0, 132px) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px;
  border: 1px dashed #ded9ff;
  border-radius: 15px;
  background: #f7f5ff;
}

.ek-nope-dialog-preview img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
}

.ek-nope-dialog-preview-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.ek-nope-dialog-preview-copy .eyebrow {
  margin: 0;
  color: var(--purple-dark);
}

.ek-nope-dialog-preview-copy strong {
  font-size: 16px;
}

.ek-nope-dialog-preview-copy p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.ek-nope-dialog-timer {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.ek-nope-dialog-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 8px;
}

.ek-nope-dialog-actions .button {
  min-height: 44px;
  flex: 1 1 140px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}

@media (max-width: 540px) {
  .exploding-kittens-state {
    gap: 12px;
  }

  .ek-heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .ek-phase-timer {
    min-width: 70px;
    margin-left: auto;
  }

  .ek-seats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ek-hand {
    grid-template-columns: repeat(auto-fill, minmax(68px, 80px));
    justify-content: start;
    gap: 6px;
    max-height: min(35dvh, 280px);
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }

  .ek-hand-card {
    max-height: 132px;
    gap: 4px;
    padding: 4px;
  }

  .ek-hand-card img {
    max-height: 102px;
  }

  .ek-hand-card span {
    font-size: 9px;
  }

  .ek-section-heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .ek-seat {
    padding: 9px;
  }

  .ek-pending-panel,
  .ek-choice-panel {
    align-items: flex-start;
    flex-direction: column;
  }

  .ek-choice-panel .ek-defuse-controls {
    width: 100%;
  }

  .ek-play-controls {
    align-items: stretch;
  }

  .ek-inline-field {
    min-width: 0;
    flex: 1 1 140px;
  }

  .ek-inline-field select {
    width: 100%;
    max-width: 100%;
  }

  .ek-selection-help {
    text-align: left;
  }

  .ek-nope-dialog-preview {
    grid-template-columns: minmax(0, 96px) minmax(0, 1fr);
    gap: 10px;
    padding: 8px;
  }
}

@media (max-width: 390px) {
  .ek-heading h2 {
    font-size: clamp(20px, 7vw, 26px);
  }

  .ek-discard-types {
    gap: 5px;
  }

  .ek-discard-type {
    gap: 4px;
    padding: 4px 6px;
    font-size: 10px;
  }

  .ek-peek-panel figure {
    width: 72px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ek-hand-panel.is-my-turn {
    animation: none;
    border-color: var(--purple);
    box-shadow: 0 0 0 3px rgb(105 87 232 / 13%);
  }

  .ek-turn-progress span {
    transition: none;
  }
}
</style>
