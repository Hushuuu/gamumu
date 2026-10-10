<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  WEREWOLF_ROLES,
  type WerewolfPublicEvent,
} from '../../../../shared/games/werewolf'
import type { PlayerView } from '../../../../shared/protocol'

type VoteResultEvent = Extract<WerewolfPublicEvent, { type: 'vote-result' }>
type GroupedVoteEvent = {
  type: 'day-vote-group'
  day: number
  targetId: string | null
  voterIds: string[]
  round?: 'pk'
}
type DisplayEvent = Exclude<WerewolfPublicEvent, { type: 'day-vote' }> | GroupedVoteEvent
type VoteRound = {
  id: string
  day: number
  round?: 'pk'
  groups: Array<{ targetId: string | null; voterIds: string[] }>
  result: VoteResultEvent | null
}
type DayActivity = {
  day: number
  events: DisplayEvent[]
  voteRounds: VoteRound[]
  summary: string[]
}

const props = defineProps<{
  events: WerewolfPublicEvent[]
  players: PlayerView[]
}>()

const activeTab = ref<'daily' | 'history'>('daily')

function playerName(playerId: string): string {
  return props.players.find((player) => player.id === playerId)?.name ?? '已離開的玩家'
}

function roundId(day: number, isPk: boolean): string {
  return `${day}:${isPk ? 'pk' : 'vote'}`
}

function groupedEvents(events: WerewolfPublicEvent[]): DisplayEvent[] {
  const rounds = new Map<string, { day: number; round?: 'pk'; groups: Map<string | null, string[]> }>()
  for (const event of events) {
    if (event.type !== 'day-vote') continue
    const key = roundId(event.day, event.round === 'pk')
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

  const grouped: DisplayEvent[] = []
  const emittedRounds = new Set<string>()
  for (const event of events) {
    if (event.type !== 'day-vote') {
      grouped.push(event)
      continue
    }

    const key = roundId(event.day, event.round === 'pk')
    if (emittedRounds.has(key)) continue
    emittedRounds.add(key)

    const round = rounds.get(key)
    if (!round) continue
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

function voteOutcome(round: VoteRound): string | null {
  const result = round.result
  if (!result) return null
  if (result.result === 'exiled') return `${playerName(result.targetId)} 被放逐`
  if (result.result === 'no-votes') return '沒有有效票'

  const eligibleGroups = round.groups.filter((group) => group.targetId !== null)
  const highestCount = Math.max(0, ...eligibleGroups.map((group) => group.voterIds.length))
  const tiedNames = eligibleGroups
    .filter((group) => group.voterIds.length === highestCount && highestCount > 0)
    .map((group) => playerName(group.targetId!))
  return tiedNames.length > 0 ? `${tiedNames.join('、')} 平票` : '沒有有效票'
}

function eventText(event: DisplayEvent): string {
  switch (event.type) {
    case 'night-death':
      return `${playerName(event.playerId)} 夜間出局`
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
        return event.result === 'tie' ? 'PK 複投仍平票，無人被放逐' : 'PK 複投無有效投票，無人被放逐'
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

const activities = computed<DayActivity[]>(() => {
  const byDay = new Map<number, WerewolfPublicEvent[]>()
  for (const event of props.events) {
    const dayEvents = byDay.get(event.day) ?? []
    dayEvents.push(event)
    byDay.set(event.day, dayEvents)
  }

  return [...byDay.entries()]
    .sort(([left], [right]) => left - right)
    .map(([day, dayEvents]) => {
      const rounds = new Map<string, VoteRound>()
      for (const event of dayEvents) {
        if (event.type === 'day-vote') {
          const id = roundId(day, event.round === 'pk')
          let round = rounds.get(id)
          if (!round) {
            round = { id, day, ...(event.round === 'pk' ? { round: 'pk' as const } : {}), groups: [], result: null }
            rounds.set(id, round)
          }
          let group = round.groups.find((candidate) => candidate.targetId === event.targetId)
          if (!group) {
            group = { targetId: event.targetId, voterIds: [] }
            round.groups.push(group)
          }
          group.voterIds.push(event.playerId)
        } else if (event.type === 'vote-result') {
          const id = roundId(day, event.round === 'pk')
          let round = rounds.get(id)
          if (!round) {
            round = { id, day, ...(event.round === 'pk' ? { round: 'pk' as const } : {}), groups: [], result: null }
            rounds.set(id, round)
          }
          round.result = event
        }
      }

      const voteRounds = [...rounds.values()]
      for (const round of voteRounds) {
        round.groups.sort((left, right) => right.voterIds.length - left.voterIds.length)
      }
      const summary: string[] = []
      const nightEvents = dayEvents.filter((event) => event.type === 'night-death' || event.type === 'night-peace')
      if (nightEvents.some((event) => event.type === 'night-peace')) {
        summary.push('平安夜，沒有人出局')
      } else {
        const deaths = nightEvents
          .filter((event): event is Extract<WerewolfPublicEvent, { type: 'night-death' }> => event.type === 'night-death')
          .map((event) => playerName(event.playerId))
        if (deaths.length > 0) summary.push(`夜間出局：${deaths.join('、')}`)
      }

      for (const round of voteRounds) {
        const outcome = voteOutcome(round)
        if (!outcome) continue
        const title = round.round === 'pk' ? 'PK 複投' : '首輪投票'
        summary.push(`${title}：${outcome}`)
      }

      for (const event of dayEvents) {
        if (event.type === 'hunter-shot' || event.type === 'player-left' || event.type === 'game-end') {
          summary.push(eventText(event))
        }
      }

      return { day, events: groupedEvents(dayEvents), voteRounds, summary }
    })
})
</script>

<template>
  <section class="ww-panel ww-activity" aria-label="每日統整與歷史紀錄">
    <div class="ww-activity-header">
      <h3 class="ww-activity-title">本局資訊</h3>
      <div class="ww-activity-tabs" role="tablist" aria-label="本局資訊分頁">
        <button
          id="ww-activity-tab-daily"
          class="ww-activity-tab"
          :class="{ 'is-active': activeTab === 'daily' }"
          type="button"
          role="tab"
          aria-controls="ww-activity-panel-daily"
          :aria-selected="activeTab === 'daily'"
          @click="activeTab = 'daily'"
        >
          彙整
        </button>
        <button
          id="ww-activity-tab-history"
          class="ww-activity-tab"
          :class="{ 'is-active': activeTab === 'history' }"
          type="button"
          role="tab"
          aria-controls="ww-activity-panel-history"
          :aria-selected="activeTab === 'history'"
          @click="activeTab = 'history'"
        >
          流水帳
        </button>
      </div>
    </div>

    <div
      v-if="activeTab === 'daily'"
      id="ww-activity-panel-daily"
      class="ww-activity-content"
      role="tabpanel"
      aria-labelledby="ww-activity-tab-daily"
      tabindex="0"
    >
      <section v-for="activity in activities" :key="activity.day" class="ww-activity-day">
        <h4>{{ activity.day === 0 ? '開局' : `第 ${activity.day} 天` }}</h4>
        <p v-if="activity.summary.length === 0" class="ww-activity-empty-day">目前尚無結果。</p>
        <ul v-else class="ww-activity-summary">
          <li v-for="(item, index) in activity.summary" :key="`${activity.day}-summary-${index}`">
            {{ item }}
          </li>
        </ul>
        <details
          v-for="round in activity.voteRounds"
          :key="round.id"
          class="ww-activity-vote"
        >
          <summary>{{ round.round === 'pk' ? 'PK 複投' : '首輪投票' }}票況</summary>
          <ul v-if="round.groups.length > 0" class="ww-activity-vote-groups">
            <li v-for="group in round.groups" :key="group.targetId ?? 'abstain'">
              <strong>{{ group.targetId === null ? '棄票' : playerName(group.targetId) }}：{{ group.voterIds.length }} 票</strong>
              <span>{{ group.voterIds.map(playerName).join('、') }}</span>
            </li>
          </ul>
          <p v-else class="ww-activity-empty-day">沒有記錄到投票。</p>
          <p v-if="voteOutcome(round)" class="ww-activity-outcome">結果：{{ voteOutcome(round) }}</p>
        </details>
      </section>
      <p v-if="activities.length === 0" class="ww-activity-empty">目前沒有可顯示的紀錄。</p>
    </div>

    <div
      v-else
      id="ww-activity-panel-history"
      class="ww-activity-content"
      role="tabpanel"
      aria-labelledby="ww-activity-tab-history"
      tabindex="0"
    >
      <section v-for="activity in activities" :key="activity.day" class="ww-activity-day">
        <h4>{{ activity.day === 0 ? '開局' : `第 ${activity.day} 天` }}</h4>
        <ol class="ww-activity-history-list">
          <li v-for="(event, index) in activity.events" :key="`${activity.day}-${index}`">
            <span class="ww-activity-index">{{ index + 1 }}</span>
            <span>{{ eventText(event) }}</span>
          </li>
        </ol>
      </section>
      <p v-if="activities.length === 0" class="ww-activity-empty">目前沒有可顯示的紀錄。</p>
    </div>
  </section>
</template>

<style scoped>
.ww-activity {
  display: flex;
  max-height: 320px;
  flex-direction: column;
  overflow: hidden;
}

.ww-activity-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid #eae8f2;
}

.ww-activity-title {
  flex: 0 0 auto;
  margin: 0;
  font-size: 14px;
}

.ww-activity-tabs {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  justify-content: flex-end;
}

.ww-activity-tab {
  position: relative;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: #77738e;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.ww-activity-tab.is-active {
  color: var(--purple-dark, #51428d);
}

.ww-activity-tab.is-active::after {
  position: absolute;
  right: 8px;
  bottom: -1px;
  left: 8px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--purple, #6f5cff);
  content: '';
}

.ww-activity-tab:focus-visible,
.ww-activity-content:focus-visible,
.ww-activity-vote summary:focus-visible {
  outline: 2px solid var(--purple, #6f5cff);
  outline-offset: 2px;
}

.ww-activity-content {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding-right: 2px;
  overscroll-behavior: contain;
}

.ww-activity-day + .ww-activity-day {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #eae8f2;
}

.ww-activity-day h4 {
  margin: 0 0 6px;
  color: var(--purple-dark, #51428d);
  font-size: 12px;
}

.ww-activity-summary,
.ww-activity-vote-groups,
.ww-activity-history-list {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ww-activity-summary {
  margin-bottom: 7px;
}

.ww-activity-summary li,
.ww-activity-vote {
  padding: 7px 9px;
  border-radius: 9px;
  background: #f3f1fb;
  color: #514d68;
  font-size: 11px;
  line-height: 1.5;
}

.ww-activity-vote {
  margin-top: 5px;
  background: #faf9fd;
  border: 1px solid #eceaf3;
}

.ww-activity-vote summary {
  color: var(--purple-dark, #51428d);
  font-weight: 700;
  cursor: pointer;
}

.ww-activity-vote-groups {
  margin-top: 8px;
}

.ww-activity-vote-groups li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 7px;
  background: #fff;
}

.ww-activity-vote-groups span,
.ww-activity-empty-day {
  color: #77738e;
  font-size: 10px;
}

.ww-activity-outcome {
  margin: 7px 0 0;
  color: #77738e;
  font-size: 10px;
}

.ww-activity-history-list li {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
  padding: 7px 8px;
  border: 1px solid #eceaf3;
  border-radius: 9px;
  background: #faf9fd;
  font-size: 10px;
  line-height: 1.5;
}

.ww-activity-index {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 50%;
  background: #eeebff;
  color: var(--purple-dark, #51428d);
  font-size: 10px;
  font-weight: 700;
}

.ww-activity-empty,
.ww-activity-empty-day {
  margin: 4px 0;
  color: #77738e;
  font-size: 10px;
}
</style>
