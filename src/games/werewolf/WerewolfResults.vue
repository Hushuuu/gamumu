<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { GameView } from '../../../shared/games'
import { WEREWOLF_ROLES, type WerewolfReplayEvent } from '../../../shared/games/werewolf'
import type { PlayerView } from '../../../shared/protocol'
import WerewolfRoleIcon from './components/WerewolfRoleIcon.vue'

const props = defineProps<{ players: PlayerView[]; game?: GameView | null }>()

const view = computed(() => (props.game?.gameId === 'werewolf' ? props.game : null))
const reviewOpen = ref(false)
const review = computed(() => view.value?.review ?? null)
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
