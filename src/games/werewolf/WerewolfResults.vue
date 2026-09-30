<script setup lang="ts">
import { computed } from 'vue'
import type { GameView } from '../../../shared/games'
import { WEREWOLF_ROLES } from '../../../shared/games/werewolf'
import type { PlayerView } from '../../../shared/protocol'

const props = defineProps<{ players: PlayerView[]; game?: GameView | null }>()

const view = computed(() => (props.game?.gameId === 'werewolf' ? props.game : null))
const winnerText = computed(() => {
  if (view.value?.winner === 'wolf') return '狼人陣營獲勝！'
  if (view.value?.winner === 'good') return '好人陣營獲勝！'
  return '狼人殺結束'
})
const rows = computed(() => {
  const current = view.value
  if (!current?.roles) {
    return []
  }

  return current.seatIds.map((id) => {
    const roleId = current.roles![id]
    const role = roleId ? WEREWOLF_ROLES[roleId] : null
    return {
      id,
      name: props.players.find((player) => player.id === id)?.name ?? '已離開的玩家',
      role,
      alive: current.aliveIds.includes(id),
      won: role?.camp === current.winner,
    }
  })
})
</script>

<template>
  <div class="finish-icon" aria-hidden="true">{{ view?.winner === 'wolf' ? '🐺' : '🏆' }}</div>
  <p class="eyebrow">狼人殺完成</p>
  <h2>{{ winnerText }}</h2>
  <p>勝利陣營每位玩家獲得 100 分；分數會保留到下一局。</p>
  <ul v-if="rows.length" class="ww-results-list">
    <li v-for="row in rows" :key="row.id" :class="{ 'is-winner': row.won }">
      <span>{{ row.role?.icon }} {{ row.name }}</span>
      <strong>{{ row.role?.name }}</strong>
      <small>{{ row.alive ? '存活' : '出局' }}{{ row.won ? ' · 勝利 +100' : '' }}</small>
    </li>
  </ul>
</template>
