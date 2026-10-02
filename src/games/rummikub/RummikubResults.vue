<script setup lang="ts">
import { computed } from 'vue'
import type { RummikubView } from '../../../shared/games/rummikub'
import type { GameView, PlayerView } from '../../../shared/protocol'

const props = defineProps<{
  players: PlayerView[]
  game?: GameView | null
}>()

const view = computed<RummikubView | null>(() => {
  return props.game?.gameId === 'rummikub' ? props.game : null
})
const winner = computed(() => {
  return props.players.find((player) => player.id === view.value?.winnerId) ?? null
})
const headline = computed(() => {
  if (view.value?.endReason === 'played-out') {
    return `${winner.value?.name ?? '有玩家'} 先出完手牌！`
  }
  if (view.value?.endReason === 'blocked') {
    return `${winner.value?.name ?? '剩餘牌值最低者'} 獲勝`
  }
  if (view.value?.endReason === 'player-left') {
    return '玩家離開房間，本局提前結束。'
  }
  return '精彩的一局！'
})
const results = computed(() => {
  return [...props.players]
    .map((player) => ({
      ...player,
      roundScore: view.value?.roundScores[player.id],
    }))
    .sort((left, right) => {
      return (right.roundScore ?? 0) - (left.roundScore ?? 0)
    })
})
</script>

<template>
  <div class="rummikub-results">
    <div class="rummikub-result-icon" aria-hidden="true">{{ winner ? '🏆' : '✦' }}</div>
    <p class="eyebrow">拉密結算</p>
    <h2>{{ headline }}</h2>
    <p class="rummikub-result-copy">
      {{ view?.endReason === 'blocked'
        ? '牌堆抽完且所有玩家都跳過，依剩餘牌值結算。'
        : view?.endReason === 'player-left'
          ? '本局沒有進行計分。'
          : '獲勝者取得其他玩家手牌的總牌值，Joker 留在手牌時算 30 分。' }}
    </p>

    <div v-if="results.length > 0" class="rummikub-score-list">
      <div v-for="player in results" :key="player.id" class="rummikub-score-row">
        <span class="rummikub-score-name">
          <strong>{{ player.name }}</strong>
          <small>累積 {{ player.score }} 分</small>
        </span>
        <strong
          v-if="player.roundScore !== undefined"
          class="rummikub-round-score"
          :class="{ 'is-positive': player.roundScore > 0, 'is-negative': player.roundScore < 0 }"
        >
          {{ player.roundScore > 0 ? '+' : '' }}{{ player.roundScore }}
        </strong>
        <span v-else class="rummikub-round-score is-neutral">未計分</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rummikub-results {
  display: grid;
  justify-items: center;
  text-align: center;
}

.rummikub-result-icon {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  margin-bottom: 10px;
  border-radius: 18px;
  background: #f1f4e9;
  font-size: 25px;
}

.rummikub-results .eyebrow {
  margin: 0 0 5px;
  color: #82866f;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.rummikub-results h2 {
  margin: 0;
  color: var(--ink);
  font-size: 21px;
}

.rummikub-result-copy {
  margin: 8px 0 14px;
  color: #77796d;
  font-size: 11px;
  line-height: 1.5;
}

.rummikub-score-list {
  display: grid;
  width: min(100%, 430px);
  gap: 6px;
}

.rummikub-score-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 9px 12px;
  border: 1px solid #ece9df;
  border-radius: 10px;
  background: #fffefa;
  text-align: left;
}

.rummikub-score-name {
  display: grid;
  gap: 2px;
}

.rummikub-score-name strong {
  color: #454a42;
  font-size: 11px;
}

.rummikub-score-name small {
  color: #898b7e;
  font-size: 9px;
}

.rummikub-round-score {
  color: #5b6154;
  font-size: 15px;
}

.rummikub-round-score.is-positive {
  color: #4d8b50;
}

.rummikub-round-score.is-negative {
  color: #c35b50;
}

.rummikub-round-score.is-neutral {
  font-size: 10px;
}
</style>
