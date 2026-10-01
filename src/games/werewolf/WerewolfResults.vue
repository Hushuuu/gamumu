<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { GameView } from '../../../shared/games'
import { WEREWOLF_ROLES, type WerewolfReplayEvent } from '../../../shared/games/werewolf'
import type { PlayerView } from '../../../shared/protocol'
import WerewolfMomentOverlay from './components/WerewolfMomentOverlay.vue'
import WerewolfRoleIcon from './components/WerewolfRoleIcon.vue'
import type { WerewolfMoment } from './components/types'

const props = defineProps<{ players: PlayerView[]; game?: GameView | null }>()

const view = computed(() => (props.game?.gameId === 'werewolf' ? props.game : null))
const reviewOpen = ref(false)
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

const reviewSections = computed(() => {
  const days = new Map<number, WerewolfReplayEvent[]>()
  for (const event of review.value?.events ?? []) {
    const events = days.get(event.day) ?? []
    events.push(event)
    days.set(event.day, events)
  }

  return [...days.entries()]
    .sort(([dayA], [dayB]) => dayA - dayB)
    .map(([day, events]) => ({
      day,
      title: day === 0 ? '開局' : `第 ${day} 天`,
      events,
    }))
})

function playerName(playerId: string): string {
  return (
    review.value?.playerNames[playerId] ??
    props.players.find((player) => player.id === playerId)?.name ??
    '已離開的玩家'
  )
}

function targetName(playerId: string | null): string {
  return playerId === null ? '無人' : playerName(playerId)
}

function eventText(event: WerewolfReplayEvent): string {
  switch (event.type) {
    case 'wolf-choice':
      return `狼人 ${playerName(event.playerId)} 選擇襲擊 ${targetName(event.targetId)}`
    case 'wolf-attack':
      return `狼隊最終襲擊目標：${targetName(event.targetId)}`
    case 'seer-check':
      return `預言家 ${playerName(event.playerId)} 查驗 ${playerName(event.targetId)}，結果為${event.camp === 'wolf' ? '狼人' : '好人'}`
    case 'guard-protect':
      return `守衛 ${playerName(event.playerId)} 守護 ${targetName(event.targetId)}`
    case 'witch-save':
      return `女巫 ${playerName(event.playerId)} 使用解藥救起 ${playerName(event.targetId)}`
    case 'witch-poison':
      return `女巫 ${playerName(event.playerId)} 使用毒藥毒殺 ${playerName(event.targetId)}`
    case 'night-death':
      return `${playerName(event.playerId)} 因${event.cause === 'wolf' ? '狼人襲擊' : '女巫毒藥'}出局`
    case 'night-peace':
      return '平安夜，沒有人出局'
    case 'day-vote':
      return `${playerName(event.playerId)} 投票給 ${event.targetId === null ? '棄票' : playerName(event.targetId)}`
    case 'vote-result':
      if (event.result === 'exiled') {
        return `${playerName(event.targetId)} 被投票放逐`
      }
      return event.result === 'tie' ? '投票平票，無人被放逐' : '無有效投票，無人被放逐'
    case 'hunter-shot':
      return event.targetId === null
        ? `${playerName(event.playerId)}（${WEREWOLF_ROLES[event.roleId].name}）選擇不開槍`
        : `${playerName(event.playerId)}（${WEREWOLF_ROLES[event.roleId].name}）開槍帶走 ${playerName(event.targetId)}`
    case 'player-left':
      return `${playerName(event.playerId)} 離開遊戲`
    case 'game-end':
      return `遊戲結束，${event.winner === 'wolf' ? '狼人' : '好人'}陣營獲勝`
  }
}

function closeReview(): void {
  reviewOpen.value = false
}

function handleReviewKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeReview()
  }
}

watch(reviewOpen, (open) => {
  if (open) {
    window.addEventListener('keydown', handleReviewKeydown)
  } else {
    window.removeEventListener('keydown', handleReviewKeydown)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleReviewKeydown)
})
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
  <p class="eyebrow">狼人殺完成</p>
  <h2>{{ winnerText }}</h2>
  <p>勝利陣營每位玩家獲得 100 分；分數會保留到下一局。</p>
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
  <button
    v-if="review"
    class="button button-secondary ww-review-open"
    type="button"
    @click="reviewOpen = true"
  >
    查看本局覆盤
  </button>

  <Teleport to="body">
    <div
      v-if="reviewOpen && review"
      class="ww-review-backdrop"
      @click.self="closeReview"
    >
      <section
        class="ww-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ww-review-title"
      >
        <header class="ww-review-header">
          <div>
            <p class="eyebrow">覆盤</p>
            <h2 id="ww-review-title">本局行動紀錄</h2>
          </div>
          <button
            class="button button-secondary ww-review-close"
            type="button"
            aria-label="關閉覆盤"
            @click="closeReview"
          >
            關閉
          </button>
        </header>
        <div class="ww-review-content">
          <section v-for="section in reviewSections" :key="section.day" class="ww-review-day">
            <h3>{{ section.title }}</h3>
            <ol>
              <li v-for="(event, index) in section.events" :key="`${section.day}-${index}`">
                <span class="ww-review-index">{{ index + 1 }}</span>
                <span>{{ eventText(event) }}</span>
              </li>
            </ol>
          </section>
          <p v-if="reviewSections.length === 0" class="ww-review-empty">沒有可顯示的行動紀錄。</p>
        </div>
      </section>
    </div>
  </Teleport>
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

.ww-review-open {
  margin-top: 14px;
}

.ww-review-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  background: rgb(25 22 39 / 68%);
  color: var(--ink);
}

.ww-review-dialog {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: #fff;
}

.ww-review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: max(16px, env(safe-area-inset-top)) 20px 14px;
  border-bottom: 1px solid #eceaf3;
}

.ww-review-header .eyebrow {
  margin: 0 0 4px;
}

.ww-review-header h2 {
  margin: 0;
  color: var(--ink);
  font-size: 20px;
}

.ww-review-close {
  flex: 0 0 auto;
}

.ww-review-content {
  min-height: 0;
  overflow: auto;
  padding: 20px;
  overscroll-behavior: contain;
}

.ww-review-day {
  width: min(100%, 860px);
  margin: 0 auto 24px;
}

.ww-review-day h3 {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0 0 10px;
  padding: 8px 0;
  background: #fff;
  color: var(--purple-dark);
  font-size: 14px;
}

.ww-review-day ol {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ww-review-day li {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 12px;
  border: 1px solid #eceaf3;
  border-radius: 12px;
  background: #faf9fd;
  font-size: 13px;
  line-height: 1.5;
}

.ww-review-index {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 50%;
  background: #eeebff;
  color: var(--purple-dark);
  font-size: 11px;
  font-weight: 700;
}

.ww-review-empty {
  width: min(100%, 860px);
  margin: 0 auto;
  color: #77738e;
  text-align: center;
}

@media (max-width: 520px) {

  .ww-review-header {
    padding: max(14px, env(safe-area-inset-top)) 14px 12px;
  }

  .ww-review-header h2 {
    font-size: 17px;
  }

  .ww-review-content {
    padding: 14px;
  }

  .ww-review-day li {
    gap: 8px;
    padding: 10px;
    font-size: 12px;
  }
}
</style>
