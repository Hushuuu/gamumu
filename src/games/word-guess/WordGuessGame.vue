<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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

const answer = ref('')
const feedback = ref('')
const now = ref(Date.now())
let clockTimer: number | undefined

const game = computed(() => props.game.gameId === 'word-guess' ? props.game : null)
const currentPlayer = computed(() => props.players.find((player) => player.id === props.playerId) ?? null)
const answeredCount = computed(() => props.players.filter((player) => player.answered).length)
const remainingSeconds = computed(() => {
  const deadline = game.value?.roundEndsAt
  return deadline ? Math.max(0, Math.ceil((deadline - now.value) / 1_000)) : 0
})
const canSubmitAnswer = computed(() => {
  return Boolean(
    props.canInteract &&
    game.value?.phase === 'guessing' &&
    !currentPlayer.value?.answered &&
    answer.value.trim(),
  )
})

watch(() => game.value?.round, () => {
  answer.value = ''
  feedback.value = ''
})

watch(() => props.gameEvent, (event) => {
  if (
    event?.gameId !== 'word-guess' ||
    event.event !== 'answer-result' ||
    typeof event.payload.correct !== 'boolean'
  ) {
    return
  }
  feedback.value = event.payload.correct ? '答對了！獲得 100 分。' : '答案不對，下一題再試試。'
})

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 250)
})

onUnmounted(() => {
  if (clockTimer !== undefined) {
    window.clearInterval(clockTimer)
  }
})

function submitAnswer(): void {
  if (!canSubmitAnswer.value) {
    return
  }

  emit('game-action', 'submit_answer', { answer: answer.value.trim() })
  answer.value = ''
}
</script>

<template>
  <div class="playing-state">
    <template v-if="game">
      <div class="round-heading">
        <div>
          <span class="round-kicker">第 {{ game.round }} / {{ game.totalRounds }} 題</span>
          <h2>{{ game.phase === 'guessing' ? '猜猜看是什麼？' : '公布答案' }}</h2>
        </div>
        <div v-if="game.roundEndsAt" class="timer-badge" :class="{ 'timer-low': remainingSeconds <= 5 }">
          <strong>{{ remainingSeconds }}</strong>
          <span>{{ game.phase === 'guessing' ? '秒' : '秒後下一題' }}</span>
        </div>
      </div>

      <div class="hint-card">
        <span class="hint-label">小提示</span>
        <p>{{ game.hint }}</p>
      </div>

      <template v-if="game.phase === 'guessing'">
        <div class="answer-area">
          <label class="field-label" for="answer-input">想到答案了嗎？</label>
          <form class="answer-form" @submit.prevent="submitAnswer">
            <input
              id="answer-input"
              v-model="answer"
              class="text-input answer-input"
              type="text"
              autocomplete="off"
              autocapitalize="characters"
              maxlength="80"
              placeholder="輸入你的答案…"
              :disabled="currentPlayer?.answered || !canInteract"
            />
            <button class="button button-primary answer-button" type="submit" :disabled="!canSubmitAnswer">
              送出
            </button>
          </form>
          <p v-if="feedback" class="guess-feedback" :class="{ 'guess-correct': currentPlayer?.correct }" role="status">
            {{ feedback }}
          </p>
          <p v-else-if="currentPlayer?.answered" class="guess-feedback" role="status">
            已送出答案，等其他玩家完成這題。
          </p>
          <p v-else class="guess-helper">每題只能送出一次，答對可得 100 分。</p>
        </div>
        <div class="answer-progress">
          <span>作答進度</span>
          <strong>{{ answeredCount }} / {{ players.length }}</strong>
          <div class="progress-track">
            <span :style="{ width: `${players.length ? (answeredCount / players.length) * 100 : 0}%` }"></span>
          </div>
        </div>
      </template>

      <div v-else class="reveal-card">
        <span class="reveal-label">這題的答案是</span>
        <strong>{{ game.answer }}</strong>
        <p>準備好，下一題馬上開始。</p>
      </div>
    </template>
  </div>
</template>
