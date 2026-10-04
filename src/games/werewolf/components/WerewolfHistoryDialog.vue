<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import {
  WEREWOLF_ROLES,
  type WerewolfPublicEvent,
  type WerewolfReplayEvent,
} from '../../../../shared/games/werewolf'
import type { PlayerView } from '../../../../shared/protocol'

type HistoryEvent = WerewolfPublicEvent | WerewolfReplayEvent
type GroupedVoteEvent = {
  type: 'day-vote-group'
  day: number
  targetId: string | null
  voterIds: string[]
  round?: 'pk'
}
type DisplayEvent = Exclude<HistoryEvent, { type: 'day-vote' }> | GroupedVoteEvent
type DayVoteEvent = Extract<HistoryEvent, { type: 'day-vote' }>
type VoteRound = {
  day: number
  round?: 'pk'
  groups: Map<string | null, string[]>
}

const props = defineProps<{
  events: HistoryEvent[]
  players: PlayerView[]
  playerNames?: Record<string, string>
  buttonLabel: string
  eyebrow: string
  dialogTitle: string
}>()

const dialogOpen = ref(false)
const contentElement = ref<HTMLElement | null>(null)

function voteRoundKey(event: DayVoteEvent): string {
  return `${event.day}:${event.round === 'pk' ? 'pk' : 'vote'}`
}

function groupVotes(events: HistoryEvent[]): DisplayEvent[] {
  const rounds = new Map<string, VoteRound>()
  for (const event of events) {
    if (event.type === 'day-vote') {
      const key = voteRoundKey(event)
      let round = rounds.get(key)
      if (!round) {
        round = {
          day: event.day,
          ...(event.round === 'pk' ? { round: 'pk' as const } : {}),
          groups: new Map(),
        }
        rounds.set(key, round)
      }
      const voters = round.groups.get(event.targetId) ?? []
      voters.push(event.playerId)
      round.groups.set(event.targetId, voters)
    }
  }

  const grouped: DisplayEvent[] = []
  const emittedRounds = new Set<string>()
  for (const event of events) {
    if (event.type !== 'day-vote') {
      grouped.push(event)
      continue
    }

    const key = voteRoundKey(event)
    if (emittedRounds.has(key)) {
      continue
    }
    emittedRounds.add(key)

    const round = rounds.get(key)
    if (!round) {
      continue
    }
    const voteGroups = [...round.groups.entries()]
      .sort(([, left], [, right]) => right.length - left.length)
    for (const [targetId, voterIds] of voteGroups) {
      grouped.push({
        type: 'day-vote-group',
        day: round.day,
        targetId,
        voterIds,
        ...(round.round === 'pk' ? { round: 'pk' as const } : {}),
      })
    }
  }

  return grouped
}

const sections = computed(() => {
  const days = new Map<number, DisplayEvent[]>()
  for (const event of groupVotes(props.events)) {
    const dayEvents = days.get(event.day) ?? []
    dayEvents.push(event)
    days.set(event.day, dayEvents)
  }

  return [...days.entries()]
    .sort(([left], [right]) => left - right)
    .map(([day, events]) => ({
      day,
      title: day === 0 ? '開局' : `第 ${day} 天`,
      events,
    }))
})

function playerName(playerId: string): string {
  return (
    props.playerNames?.[playerId] ??
    props.players.find((player) => player.id === playerId)?.name ??
    '已離開的玩家'
  )
}

function targetName(playerId: string | null): string {
  return playerId === null ? '無人' : playerName(playerId)
}

function eventText(event: DisplayEvent): string {
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
      return 'cause' in event
        ? `${playerName(event.playerId)} 因${event.cause === 'wolf' ? '狼人襲擊' : '女巫毒藥'}出局`
        : `${playerName(event.playerId)} 夜間出局`
    case 'night-peace':
      return '平安夜，沒有人出局'
    case 'day-vote-group': {
      const voters = event.voterIds.map(playerName).join('、')
      const prefix = event.round === 'pk' ? 'PK 複投：' : ''
      return event.targetId === null
        ? `${prefix}${voters} 棄票`
        : `${prefix}${voters} 投給 ${playerName(event.targetId)}`
    }
    case 'vote-result':
      if (event.result === 'exiled') {
        return event.round === 'pk'
          ? `${playerName(event.targetId)} 在 PK 複投中被放逐`
          : `${playerName(event.targetId)} 被投票放逐`
      }
      if (event.round === 'pk') {
        return event.result === 'tie'
          ? 'PK 複投仍平票，無人被放逐'
          : 'PK 複投無有效投票，無人被放逐'
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

function closeDialog(): void {
  dialogOpen.value = false
}

function handleDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeDialog()
  }
}

watch(dialogOpen, async (open) => {
  if (open) {
    window.addEventListener('keydown', handleDialogKeydown)
    await nextTick()
    if (contentElement.value) {
      contentElement.value.scrollTop = contentElement.value.scrollHeight
    }
  } else {
    window.removeEventListener('keydown', handleDialogKeydown)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleDialogKeydown)
})
</script>

<template>
  <button
    class="button button-secondary ww-history-open"
    type="button"
    @click="dialogOpen = true"
  >
    {{ buttonLabel }}
  </button>

  <Teleport to="body">
    <div
      v-if="dialogOpen"
      class="ww-history-backdrop"
      @click.self="closeDialog"
    >
      <section
        class="ww-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ww-history-title"
      >
        <header class="ww-history-header">
          <div>
            <p class="eyebrow">{{ eyebrow }}</p>
            <h2 id="ww-history-title">{{ dialogTitle }}</h2>
          </div>
          <button
            class="button button-secondary ww-history-close"
            type="button"
            aria-label="關閉紀錄"
            @click="closeDialog"
          >
            關閉
          </button>
        </header>
        <div ref="contentElement" class="ww-history-content">
          <section v-for="section in sections" :key="section.day" class="ww-history-day">
            <h3>{{ section.title }}</h3>
            <ol>
              <li v-for="(event, index) in section.events" :key="`${section.day}-${index}`">
                <span class="ww-history-index">{{ index + 1 }}</span>
                <span>{{ eventText(event) }}</span>
              </li>
            </ol>
          </section>
          <p v-if="sections.length === 0" class="ww-history-empty">目前沒有可顯示的紀錄。</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.ww-history-open {
  align-self: flex-start;
}

.ww-history-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  background: rgb(25 22 39 / 68%);
  color: var(--ink);
}

.ww-history-dialog {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: #fff;
}

.ww-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: max(16px, env(safe-area-inset-top)) 20px 14px;
  border-bottom: 1px solid #eceaf3;
}

.ww-history-header .eyebrow {
  margin: 0 0 4px;
}

.ww-history-header h2 {
  margin: 0;
  color: var(--ink);
  font-size: 20px;
}

.ww-history-close {
  flex: 0 0 auto;
}

.ww-history-content {
  min-height: 0;
  overflow: auto;
  padding: 20px;
  overscroll-behavior: contain;
}

.ww-history-day {
  width: min(100%, 860px);
  margin: 0 auto 24px;
}

.ww-history-day h3 {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0 0 10px;
  padding: 8px 0;
  background: #fff;
  color: var(--purple-dark);
  font-size: 14px;
}

.ww-history-day ol {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ww-history-day li {
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

.ww-history-index {
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

.ww-history-empty {
  width: min(100%, 860px);
  margin: 0 auto;
  color: #77738e;
  text-align: center;
}

@media (max-width: 520px) {
  .ww-history-header {
    padding: max(14px, env(safe-area-inset-top)) 14px 12px;
  }

  .ww-history-header h2 {
    font-size: 17px;
  }

  .ww-history-content {
    padding: 14px;
  }

  .ww-history-day li {
    gap: 8px;
    padding: 10px;
    font-size: 12px;
  }
}
</style>
