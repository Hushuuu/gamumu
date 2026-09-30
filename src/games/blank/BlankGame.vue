<script setup lang="ts">
import { computed } from 'vue'
import type { GameEvent, GameView, PlayerView } from '../../../shared/protocol'

const props = defineProps<{
  game: GameView
  gameEvent: GameEvent | null
  players: PlayerView[]
  playerId: string
  gameName: string
  isHost: boolean
  canInteract: boolean
}>()

const emit = defineEmits<{
  'game-action': [action: string, payload: Record<string, unknown>]
}>()

const game = computed(() => props.game.gameId === 'blank' ? props.game : null)

function finishGame(): void {
  if (props.canInteract) {
    emit('game-action', 'finish_game', {})
  }
}
</script>

<template>
  <div class="playing-state">
    <section v-if="game" class="blank-game-state" aria-labelledby="blank-game-title">
      <div class="blank-game-icon" aria-hidden="true">＋</div>
      <p class="eyebrow">第二款遊戲擴充測試</p>
      <h2 id="blank-game-title">{{ gameName }}</h2>
      <p>這個空白遊戲已透過共用房間流程啟動。後續可在獨立遊戲模組中加入玩法與畫面。</p>
      <div class="blank-game-status" role="status">所有玩家已收到相同的遊戲狀態。</div>
      <button
        v-if="isHost"
        class="button button-primary start-button"
        type="button"
        :disabled="!canInteract"
        @click="finishGame"
      >
        結束測試遊戲
      </button>
      <p v-else class="blank-game-wait">等待房主結束測試遊戲。</p>
    </section>
  </div>
</template>
