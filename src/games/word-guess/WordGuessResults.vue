<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerView } from '../../../shared/protocol'

const props = defineProps<{ players: PlayerView[]; game?: unknown }>()

const winner = computed(() => {
  return [...props.players].sort((left, right) => right.score - left.score)[0] ?? null
})
</script>

<template>
  <div class="finish-icon" aria-hidden="true">{{ winner ? '🏆' : '✦' }}</div>
  <p class="eyebrow">派對完成</p>
  <h2>{{ winner ? `${winner.name} 目前累積分數最高！` : '精彩的一局！' }}</h2>
  <p>本局結束，玩家總分會保留在下一局。</p>
  <div v-if="winner" class="winner-score">
    <span>累積最高分</span>
    <strong>{{ winner.score }} <small>分</small></strong>
  </div>
</template>

<style scoped>
.winner-score {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-top: 15px;
  padding: 8px 15px;
  border-radius: 13px;
  background: #fff7e4;
  color: #9d7a2e;
  font-size: 10px;
  font-weight: 700;
}

.winner-score strong {
  color: #8d6821;
  font-size: 20px;
}

.winner-score small {
  font-size: 10px;
}
</style>
