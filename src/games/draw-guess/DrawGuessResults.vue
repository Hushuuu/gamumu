<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerView } from '../../../shared/protocol'

const props = defineProps<{ players: PlayerView[]; game?: unknown }>()

const ranking = computed(() => {
  return [...props.players].sort((left, right) => right.score - left.score)
})
const winner = computed(() => ranking.value[0] ?? null)
</script>

<template>
  <div class="finish-icon" aria-hidden="true">{{ winner ? '✎' : '✦' }}</div>
  <p class="eyebrow">你畫我猜完成</p>
  <h2>{{ winner ? `${winner.name} 目前累積分數最高！` : '精彩的一局！' }}</h2>
  <p>每位猜中的玩家及該題繪圖者都獲得 50 分；分數會保留到下一局。</p>
  <ol v-if="ranking.length" class="draw-results-list">
    <li v-for="player in ranking.slice(0, 3)" :key="player.id">
      <span>{{ player.name }}</span>
      <strong>{{ player.score }}<small> 分</small></strong>
    </li>
  </ol>
</template>
