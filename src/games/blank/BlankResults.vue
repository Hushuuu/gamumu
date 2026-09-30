<script setup lang="ts">
import type { PlayerView } from '../../../shared/protocol'

defineProps<{ players: PlayerView[]; game?: unknown }>()
</script>

<template>
  <div class="finish-icon" aria-hidden="true">✦</div>
  <p class="eyebrow">派對完成</p>
  <h2>空白測試遊戲已結束</h2>
  <p>遊戲選擇、啟動與結束流程已完成；玩家總分會保留。</p>
</template>
