<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  formatCardList,
  SEAT_STATUS_LABELS,
  explodingKittensRanking,
} from './helpers'
import { isExplodingKittensView } from '../../../shared/games'
import type { ExplodingKittensView } from '../../../shared/games'
import type { PlayerView } from '../../../shared/protocol'

const props = defineProps<{
  players: PlayerView[]
  game?: unknown
  playerId?: string
}>()

const game = computed<ExplodingKittensView | null>(() => {
  return isExplodingKittensView(props.game) ? props.game : null
})
const ranking = computed(() => {
  return game.value ? explodingKittensRanking(game.value) : []
})
const winner = computed(() => {
  return ranking.value.find((seat) => seat.id === game.value?.winnerId) ?? null
})
const finalNoticeQueue = ref<Array<{ title: string; message: string }>>([])
const activeFinalNotice = computed(() => finalNoticeQueue.value[0] ?? null)

function finalCardsLabel(playerId: string): string {
  const cards = game.value?.finalHands?.find((hand) => hand.playerId === playerId)?.cards
  if (!cards) {
    return '未保存'
  }
  return cards.length ? formatCardList(cards) : '無'
}

function dismissFinalNotice(): void {
  finalNoticeQueue.value.shift()
}

const hasShownFinalNotices = ref(false)
watch(() => game.value?.phase === 'finished' ? game.value : null, (current) => {
  if (!current || hasShownFinalNotices.value) {
    return
  }
  hasShownFinalNotices.value = true
  const lastEliminatedId = current?.eliminationOrder[current.eliminationOrder.length - 1]
  const lastEliminated = current?.seats.find((seat) => seat.id === lastEliminatedId)
  if (!lastEliminated) {
    return
  }

  if (
    props.playerId !== lastEliminated.id &&
    current.announcements.includes(`${lastEliminated.name} 抽到了爆炸貓！`)
  ) {
    finalNoticeQueue.value.push({
      title: '有人抽到爆炸貓！',
      message: `${lastEliminated.name} 抽到了爆炸貓。`,
    })
  }
  if (current.announcements.includes(`${lastEliminated.name} 被淘汰了`)) {
    finalNoticeQueue.value.push({
      title: '玩家出局',
      message: `${lastEliminated.name} 被淘汰了。`,
    })
  }
}, { immediate: true })
</script>

<template>
  <div class="ek-results">
    <div class="finish-icon" aria-hidden="true">{{ winner ? '✹' : '✦' }}</div>
    <p class="eyebrow">爆炸貓對局結束</p>
    <h2>{{ winner ? `${winner.name} 成為最後的倖存者！` : '本局結束' }}</h2>
    <p>避開爆炸貓、善用手牌，才能活到最後。</p>

    <ol v-if="ranking.length" class="ek-results-list">
      <li v-for="(seat, index) in ranking" :key="seat.id" :class="{ 'is-winner': seat.id === game?.winnerId }">
        <span class="ek-result-rank">{{ index + 1 }}</span>
        <span class="ek-result-name">{{ seat.name }}</span>
        <span class="ek-result-status">{{ seat.id === game?.winnerId ? '勝利' : SEAT_STATUS_LABELS[seat.status] }}</span>
        <span class="ek-result-cards">
          {{ seat.status === 'alive' ? '最後手牌' : seat.status === 'left' ? '離開時手牌' : '出局時手牌' }}：{{ finalCardsLabel(seat.id) }}
        </span>
      </li>
    </ol>
    <p v-else class="ek-results-empty">無法取得本局名次資料。</p>

    <Teleport to="body">
      <div v-if="activeFinalNotice" class="ek-results-notice-backdrop">
        <section
          class="ek-results-notice"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ek-results-notice-title"
          aria-describedby="ek-results-notice-message"
        >
          <p class="eyebrow">牌局事件</p>
          <h2 id="ek-results-notice-title">{{ activeFinalNotice.title }}</h2>
          <p id="ek-results-notice-message">{{ activeFinalNotice.message }}</p>
          <button class="button button-primary" type="button" @click="dismissFinalNotice">知道了</button>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ek-results {
  text-align: center;
}

.ek-results-list {
  display: grid;
  max-width: 480px;
  gap: 7px;
  margin: 16px auto 0;
  padding: 0;
  list-style: none;
  text-align: left;
}

.ek-results-list li {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #fff;
  color: #5c5875;
  font-size: 11px;
}

.ek-results-list li.is-winner {
  border-color: #d7cfff;
  background: #f5f3ff;
  color: var(--purple-dark);
  font-weight: 800;
}

.ek-result-cards {
  grid-column: 2 / -1;
  color: var(--muted);
  font-size: 10px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.ek-result-rank {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 50%;
  background: #f0eef7;
  font-weight: 800;
}

.ek-results-list li.is-winner .ek-result-rank {
  background: var(--purple);
  color: #fff;
}

.ek-result-status {
  color: var(--muted);
  font-size: 10px;
}

.ek-results-list li.is-winner .ek-result-status {
  color: var(--purple-dark);
}

.ek-results-empty {
  color: var(--muted);
  font-size: 12px;
}

.ek-results-notice-backdrop {
  position: fixed;
  z-index: 12030;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 14px;
  background: rgb(25 22 39 / 68%);
}

.ek-results-notice {
  display: grid;
  width: min(100%, 440px);
  gap: 12px;
  padding: clamp(20px, 6vw, 28px);
  border: 1px solid rgb(255 255 255 / 70%);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: 0 24px 80px rgb(21 18 38 / 28%);
  color: var(--ink);
  text-align: left;
}

.ek-results-notice h2,
.ek-results-notice p {
  margin: 0;
}

.ek-results-notice p:not(.eyebrow) {
  font-size: 15px;
  font-weight: 800;
  overflow-wrap: anywhere;
}
</style>
