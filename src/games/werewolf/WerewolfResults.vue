<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GameView } from '../../../shared/games'
import { WEREWOLF_ROLES } from '../../../shared/games/werewolf'
import type { PlayerView } from '../../../shared/protocol'
import WerewolfHistoryDialog from './components/WerewolfHistoryDialog.vue'
import WerewolfMomentOverlay from './components/WerewolfMomentOverlay.vue'
import WerewolfRoleIcon from './components/WerewolfRoleIcon.vue'
import type { WerewolfMoment } from './components/types'

const props = defineProps<{ players: PlayerView[]; game?: GameView | null }>()

const view = computed(() => (props.game?.gameId === 'werewolf' ? props.game : null))
const review = computed(() => view.value?.review ?? null)
const winnerText = computed(() => {
  if (view.value?.winner === 'wolf') return '狼人陣營獲勝！'
  if (view.value?.winner === 'good') return '好人陣營獲勝！'
  return '狼人殺結束'
})
const winnerMoment = ref<WerewolfMoment | null>(null)
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

let momentSequence = 0

watch(() => view.value?.winner, (winner) => {
  if (!winner) {
    winnerMoment.value = null
    return
  }

  winnerMoment.value = {
    id: ++momentSequence,
    kind: winner === 'wolf' ? 'wolf-win' : 'good-win',
    title: winnerText.value,
    detail: winner === 'wolf'
      ? '狼人陣營拿下勝利，村莊今晚屬於他們。'
      : '好人們齊心合作，村莊終於恢復平靜。',
  }
}, { immediate: true })

function completeWinnerMoment(id: number): void {
  if (winnerMoment.value?.id === id) {
    winnerMoment.value = null
  }
}
</script>

<template>
  <WerewolfMomentOverlay
    v-if="winnerMoment"
    :key="winnerMoment.id"
    :moment="winnerMoment"
    @complete="completeWinnerMoment"
  />
  <div class="finish-icon" aria-hidden="true">
    <WerewolfRoleIcon v-if="view?.winner === 'wolf'" role-id="werewolf" :size="32" />
    <span v-else>🏆</span>
  </div>
  <p class="eyebrow">遊戲結束</p>
  <h2>{{ winnerText }}</h2>
  <p>勝利陣營每位玩家獲得 100 分</p>
  <ul v-if="rows.length" class="ww-results-list">
    <li v-for="row in rows" :key="row.id" :class="{ 'is-winner': row.won }">
      <span class="ww-result-player">
        <WerewolfRoleIcon v-if="row.role" :role-id="row.role.id" :size="16" />
        {{ row.name }}
      </span>
      <strong>{{ row.role?.name }}</strong>
      <small>{{ row.alive ? '存活' : '出局' }}{{ row.won ? ' · 勝利 +100' : '' }}</small>
    </li>
  </ul>
  <WerewolfHistoryDialog
    v-if="review"
    :events="review.events"
    :players="props.players"
    :player-names="review.playerNames"
    button-label="本局覆盤"
    eyebrow="覆盤"
    dialog-title="本局行動紀錄"
  />
</template>

<style scoped>
.ww-result-player {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ww-results-list {
  display: grid;
  gap: 6px;
  width: 100%;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  text-align: left;
}

.ww-results-list li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #f7f5ff;
  font-size: 12px;
}

.ww-results-list li.is-winner {
  background: #eafaf3;
}

.ww-results-list small {
  grid-column: 1 / -1;
  color: #77738e;
  font-size: 10px;
}

</style>
