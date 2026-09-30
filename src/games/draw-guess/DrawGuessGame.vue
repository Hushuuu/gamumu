<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { GameEvent, GameView, PlayerView } from '../../../shared/protocol'
import DrawCanvas from './DrawCanvas.vue'

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

const answerInput = ref('')
const guessInput = ref('')
const secretAnswer = ref('')
const guessFeedback = ref('')
const now = ref(Date.now())
let clockTimer: number | undefined

const game = computed(() => props.game.gameId === 'draw-guess' ? props.game : null)
const isDrawer = computed(() => game.value?.drawerId === props.playerId)
const drawer = computed(() => props.players.find((player) => player.id === game.value?.drawerId) ?? null)
const drawerOnline = computed(() => drawer.value?.online ?? false)
const alreadyGuessed = computed(() => game.value?.correctPlayerIds.includes(props.playerId) ?? false)
const remainingSeconds = computed(() => {
  const deadline = game.value?.phaseEndsAt
  return deadline ? Math.max(0, Math.ceil((deadline - now.value) / 1_000)) : 0
})
const canDraw = computed(() => {
  return Boolean(props.canInteract && isDrawer.value && game.value?.phase === 'drawing')
})
const canGuess = computed(() => {
  return Boolean(
    props.canInteract &&
    game.value?.phase === 'guessing' &&
    !isDrawer.value &&
    !alreadyGuessed.value &&
    guessInput.value.trim(),
  )
})
const correctPlayers = computed(() => {
  const correctIds = game.value?.correctPlayerIds ?? []
  return correctIds
    .map((id) => props.players.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name))
})

watch(() => game.value?.turnNumber, () => {
  answerInput.value = ''
  guessInput.value = ''
  secretAnswer.value = ''
  guessFeedback.value = ''
})

watch(() => props.gameEvent, (event) => {
  if (event?.gameId !== 'draw-guess') {
    return
  }

  if (event.event === 'answer-prompt' && typeof event.payload.answer === 'string') {
    secretAnswer.value = event.payload.answer
  }
  if (event.event === 'guess-result' && typeof event.payload.correct === 'boolean') {
    guessFeedback.value = event.payload.correct
      ? '猜中了！你和繪圖者各得 50 分。'
      : '還沒猜中，再試一次。'
  }
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

function setAnswer(): void {
  const answer = answerInput.value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (!props.canInteract || !isDrawer.value || !answer) {
    return
  }

  secretAnswer.value = answer
  emit('game-action', 'set_answer', { answer })
}

function skipTurn(): void {
  if (props.canInteract && isDrawer.value) {
    emit('game-action', 'skip_turn', {})
  }
}

function submitGuess(): void {
  const answer = guessInput.value.trim()
  if (!canGuess.value || !answer) {
    return
  }

  emit('game-action', 'submit_guess', { answer })
  guessInput.value = ''
}

function sendGameAction(action: string, payload: Record<string, unknown>): void {
  emit('game-action', action, payload)
}
</script>

<template>
  <div class="playing-state draw-guess-state">
    <template v-if="game">
      <div class="round-heading draw-guess-heading">
        <div>
          <span class="round-kicker">
            第 {{ game.round }} / {{ game.roundsPerPlayer }} 輪 ·
            第 {{ game.turnNumber }} / {{ game.totalTurns }} 題
          </span>
          <h2>{{ gameName }}</h2>
        </div>
        <div class="timer-badge" :class="{ 'timer-low': remainingSeconds <= 5 }" role="timer">
          <strong>{{ remainingSeconds }}</strong>
          <span>{{ game.phase === 'answering' ? '秒內設定題目' : game.phase === 'drawing' ? '繪畫秒數' : game.phase === 'guessing' ? '猜答案秒數' : '秒後下一題' }}</span>
        </div>
      </div>

      <div class="draw-turn-banner" role="status">
        <strong>{{ drawer?.name ?? '繪圖者' }}</strong>
        <span>
          {{ game.phase === 'answering'
            ? (isDrawer ? '請先輸入要畫的答案。' : '正在設定題目，答案只有繪圖者看得到。')
            : game.phase === 'drawing'
              ? (isDrawer ? `你的題目：${secretAnswer || '重新連線後載入題目'}` : '正在繪圖，想想看這幅畫代表什麼。')
              : game.phase === 'guessing'
                ? (isDrawer ? '其他玩家正在猜你的畫。' : '輸入答案，猜中可得 50 分。')
                : `答案是「${game.answer ?? ''}」` }}
        </span>
      </div>

      <template v-if="game.phase === 'answering'">
        <form v-if="isDrawer" class="draw-answer-form" @submit.prevent="setAnswer">
          <label class="field-label" for="draw-answer-input">設定本題答案</label>
          <div class="answer-form">
            <input
              id="draw-answer-input"
              v-model="answerInput"
              class="text-input answer-input"
              type="text"
              autocomplete="off"
              maxlength="60"
              placeholder="輸入要畫的題目…"
              :disabled="!canInteract"
            />
            <button class="button button-primary answer-button" type="submit" :disabled="!canInteract || !answerInput.trim()">
              開始畫
            </button>
          </div>
          <button class="draw-skip-button" type="button" :disabled="!canInteract" @click="skipTurn">跳過這題</button>
        </form>
        <p v-else class="draw-wait-message">
          {{ drawerOnline ? '等待繪圖者設定答案。' : '繪圖者離線，設定時間結束後會自動跳過。' }}
        </p>
      </template>

      <template v-else>
        <DrawCanvas
          :can-draw="canDraw"
          :game-event="gameEvent"
          :turn-number="game.turnNumber"
          @game-action="sendGameAction"
        />

        <div v-if="game.phase === 'drawing'" class="draw-phase-controls">
          <p v-if="!drawerOnline" class="draw-wait-message">
            繪圖者離線，時間結束後會進入猜答案階段。
          </p>
          <div v-if="isDrawer" class="draw-action-buttons">
            <button class="draw-skip-button" type="button" :disabled="!canInteract" @click="skipTurn">
              跳過這題
            </button>
            <button
              class="button button-primary draw-finish-button"
              type="button"
              :disabled="!canInteract"
              @click="sendGameAction('finish_drawing', {})"
            >
              完成繪圖
            </button>
          </div>
          <p v-if="isDrawer && secretAnswer" class="draw-secret-answer">
            本題答案：<strong>{{ secretAnswer }}</strong>
          </p>
        </div>

        <template v-else-if="game.phase === 'guessing'">
          <form v-if="!isDrawer && !alreadyGuessed" class="draw-guess-form" @submit.prevent="submitGuess">
            <label class="field-label" for="draw-guess-input">你猜答案是？</label>
            <div class="answer-form">
              <input
                id="draw-guess-input"
                v-model="guessInput"
                class="text-input answer-input"
                type="text"
                autocomplete="off"
                maxlength="60"
                placeholder="輸入你的猜測…"
                :disabled="!canInteract"
              />
              <button class="button button-primary answer-button" type="submit" :disabled="!canGuess">
                猜答案
              </button>
            </div>
            <p v-if="guessFeedback" class="guess-feedback" role="status">{{ guessFeedback }}</p>
            <p v-else class="guess-helper">答錯可以繼續猜；每位猜中的玩家都得 50 分。</p>
          </form>
          <p v-else class="draw-wait-message">
            {{ isDrawer ? '等待其他玩家猜答案。' : '你已猜中，等待本題結束。' }}
          </p>
        </template>

        <div v-else class="draw-reveal-card">
          <span class="reveal-label">本題答案</span>
          <strong>{{ game.answer }}</strong>
          <p v-if="correctPlayers.length">猜中：{{ correctPlayers.join('、') }}</p>
          <p v-else>這題沒有人猜中。</p>
        </div>
      </template>
    </template>
  </div>
</template>
