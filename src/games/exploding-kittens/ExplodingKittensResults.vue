<script setup lang="ts">
import { computed } from 'vue'
import {
  SEAT_STATUS_LABELS,
  explodingKittensRanking,
} from './helpers'
import { isExplodingKittensView } from '../../../shared/games'
import type { ExplodingKittensView } from '../../../shared/games'
import type { PlayerView } from '../../../shared/protocol'

const props = defineProps<{
  players: PlayerView[]
  game?: unknown
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
      </li>
    </ol>
    <p v-else class="ek-results-empty">無法取得本局名次資料。</p>
  </div>
</template>

<style scoped>
.ek-results {
  text-align: center;
}

.ek-results-list {
  display: grid;
  max-width: 340px;
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
</style>
