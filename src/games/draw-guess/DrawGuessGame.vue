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
const hintInput = ref('')
const guessInput = ref('')
const secretAnswer = ref('')
const secretHint = ref('')
const guessFeedback = ref('')
const now = ref(Date.now())
let clockTimer: number | undefined

const game = computed(() => props.game.gameId === 'draw-guess' ? props.game : null)
const isDrawer = computed(() => game.value?.drawerId === props.playerId)
const drawer = computed(() => props.players.find((player) => player.id === game.value?.drawerId) ?? null)
const drawerOnline = computed(() => drawer.value?.online ?? false)
const alreadyGuessed = computed(() => game.value?.correctPlayerIds.includes(props.playerId) ?? false)
const alreadyPassed = computed(() => game.value?.passedPlayerIds.includes(props.playerId) ?? false)
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
    (game.value?.phase === 'drawing' || game.value?.phase === 'guessing') &&
    !isDrawer.value &&
    !alreadyGuessed.value &&
    !alreadyPassed.value &&
    guessInput.value.trim(),
  )
})
const canPassGuess = computed(() => Boolean(
  props.canInteract &&
  (game.value?.phase === 'drawing' || game.value?.phase === 'guessing') &&
  !isDrawer.value &&
  !alreadyGuessed.value &&
  !alreadyPassed.value,
))
const correctPlayers = computed(() => {
  const correctIds = game.value?.correctPlayerIds ?? []
  return correctIds
    .map((id) => props.players.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name))
})

watch(() => game.value?.turnNumber, () => {
  answerInput.value = ''
  hintInput.value = ''
  guessInput.value = ''
  secretAnswer.value = ''
  secretHint.value = ''
  guessFeedback.value = ''
})

watch(
  () => [props.gameEvent, game.value?.turnNumber, game.value?.phaseEndsAt] as const,
  ([event, turnNumber, phaseEndsAt]) => {
    if (event?.gameId !== 'draw-guess' || event.event !== 'answer-prompt') {
      return
    }
    if (
      typeof event.payload.turnNumber !== 'number' ||
      event.payload.turnNumber !== turnNumber ||
      typeof event.payload.phaseEndsAt !== 'number' ||
      event.payload.phaseEndsAt !== phaseEndsAt
    ) {
      return
    }
    if (typeof event.payload.answer === 'string') {
      secretAnswer.value = event.payload.answer
    }
    if (typeof event.payload.hint === 'string') {
      secretHint.value = event.payload.hint
    }
  },
  { immediate: true },
)

watch(() => props.gameEvent, (event) => {
  if (event?.gameId === 'draw-guess' && event.event === 'guess-result' && typeof event.payload.correct === 'boolean') {
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
  secretHint.value = hintInput.value.normalize('NFKC').trim()
  emit('game-action', 'set_answer', { answer, hint: secretHint.value })
}

function startBankDrawing(): void {
  if (props.canInteract && isDrawer.value && secretAnswer.value) {
    emit('game-action', 'start_drawing', {})
  }
}

function skipTurn(): void {
  if (props.canInteract && isDrawer.value) {
    emit('game-action', 'skip_turn', {})
  }
}

function finishReveal(): void {
  if (props.isHost && props.canInteract && game.value?.phase === 'reveal') {
    emit('game-action', 'finish_reveal', {})
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

function passGuess(): void {
  if (canPassGuess.value) {
    emit('game-action', 'pass_guess', {})
  }
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
          <span>{{ game.phase === 'answering' ? '秒內準備題目' : game.phase === 'drawing' ? '繪畫秒數' : game.phase === 'guessing' ? '猜答案秒數' : '秒後下一題' }}</span>
        </div>
      </div>

      <div class="draw-turn-banner" role="status">
        <strong>{{ drawer?.name ?? '繪圖者' }}</strong>
        <span>
          {{ game.phase === 'answering'
            ? (isDrawer
              ? (game.settings.questionMode === 'bank' ? '題庫已抽出本題，查看題目後開始繪圖。' : '請先輸入要畫的答案和提示。')
              : '正在準備題目，答案只有繪圖者看得到。')
            : game.phase === 'drawing'
              ? (isDrawer ? `你的題目：${secretAnswer || '重新連線後載入題目'}` : '正在繪圖，想想看這幅畫代表什麼。')
              : game.phase === 'guessing'
                ? (isDrawer ? '其他玩家正在猜你的畫。' : '繪圖已完成，輸入答案，猜中可得 50 分。')
                : `答案是「${game.answer ?? ''}」` }}
        </span>
      </div>

      <template v-if="game.phase === 'answering'">
        <form v-if="isDrawer && game.settings.questionMode === 'free'" class="draw-answer-form" @submit.prevent="setAnswer">
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
          <template v-if="game.settings.showHints">
            <label class="field-label draw-hint-label" for="draw-hint-input">提示（選填，其他玩家看得到）</label>
            <input
              id="draw-hint-input"
              v-model="hintInput"
              class="text-input answer-input"
              type="text"
              autocomplete="off"
              maxlength="100"
              placeholder="例如：一種會在夜晚出現的動物"
              :disabled="!canInteract"
            />
          </template>
          <button class="draw-skip-button" type="button" :disabled="!canInteract" @click="skipTurn">跳過這題</button>
        </form>
        <div v-else-if="isDrawer && game.settings.questionMode === 'bank'" class="draw-answer-form bank-prompt-card">
          <p class="field-label">題庫題目</p>
          <strong>{{ secretAnswer || '題目載入中…' }}</strong>
          <p v-if="game.settings.showHints && secretHint" class="bank-prompt-hint">提示：{{ secretHint }}</p>
          <button
            class="button button-primary answer-button"
            type="button"
            :disabled="!canInteract || !secretAnswer"
            @click="startBankDrawing"
          >
            開始畫
          </button>
          <button class="draw-skip-button" type="button" :disabled="!canInteract" @click="skipTurn">跳過這題</button>
        </div>
        <p v-else class="draw-wait-message">
          {{ drawerOnline ? '等待繪圖者準備題目。' : '繪圖者離線，設定時間結束後會自動跳過。' }}
        </p>
      </template>

      <template v-else>
        <DrawCanvas
          :can-draw="canDraw"
          :game-event="gameEvent"
          :turn-number="game.turnNumber"
          @game-action="sendGameAction"
        />

        <div v-if="game.phase !== 'reveal' && game.answerLength !== null" class="draw-answer-meta">
          答案共 <strong>{{ game.answerLength }}</strong> 個字
        </div>
        <p v-if="game.settings.showHints && game.phase !== 'reveal' && game.hint" class="draw-public-hint">
          提示：{{ game.hint }}
        </p>

        <div v-if="game.phase === 'drawing'" class="draw-phase-controls">
          <p v-if="!drawerOnline" class="draw-wait-message">
            繪圖者離線，時間結束後會公布本題結果。
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
            <span v-if="game.settings.showHints && secretHint"> · 提示：{{ secretHint }}</span>
          </p>
        </div>

        <template v-if="game.phase === 'drawing' || game.phase === 'guessing'">
          <form v-if="!isDrawer && !alreadyGuessed && !alreadyPassed" class="draw-guess-form" @submit.prevent="submitGuess">
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
            <button class="button button-secondary draw-pass-button" type="button" :disabled="!canPassGuess" @click="passGuess">
              放棄猜題
            </button>
            <p v-if="guessFeedback" class="guess-feedback" role="status">{{ guessFeedback }}</p>
            <p v-else-if="game.phase === 'drawing'" class="guess-helper">可以邊看繪圖邊猜；猜中立即得分，等繪圖完成後公布結果。</p>
            <p v-else class="guess-helper">答錯可以繼續猜；每位猜中的玩家都得 50 分。</p>
          </form>
          <p v-else class="draw-wait-message">
            {{ isDrawer
              ? '等待其他玩家猜答案。'
              : alreadyPassed
                ? '你已放棄猜題，等待本題公布結果。'
                : game.phase === 'drawing'
                  ? '你已猜中並取得分數，等待繪圖完成。'
                  : '你已猜中並取得分數，等待本題公布。' }}
          </p>
        </template>

        <div v-if="game.phase === 'reveal'" class="draw-reveal-card">
          <span class="reveal-label">本題答案</span>
          <strong>{{ game.answer }}</strong>
          <p v-if="correctPlayers.length">猜中：{{ correctPlayers.join('、') }}</p>
          <p v-else>這題沒有人猜中。</p>
          <button
            v-if="isHost"
            class="button button-secondary draw-reveal-end-button"
            type="button"
            :disabled="!canInteract"
            @click="finishReveal"
          >
            提前結束公布
          </button>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.draw-guess-state {
  padding-bottom: 6px;
}

.draw-guess-heading h2 {
  font-size: 17px;
}

.draw-turn-banner {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 13px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f7f5ff;
  color: #77738e;
  font-size: 10px;
  line-height: 1.5;
}

.draw-turn-banner strong {
  color: var(--purple-dark);
  font-size: 11px;
}

.draw-answer-form, .draw-guess-form {
  margin-top: 13px;
}

.draw-pass-button {
  min-height: 32px;
  margin-top: 8px;
  padding-inline: 10px;
  font-size: 9px;
}

.draw-hint-label {
  display: block;
  margin: 10px 0 6px;
}

.bank-prompt-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 12px;
  border: 1px solid #e8e3ff;
  border-radius: 12px;
  background: #fbfaff;
}

.bank-prompt-card > strong {
  color: var(--purple-dark);
  font-size: 18px;
}

.bank-prompt-hint {
  margin: 5px 0 8px;
  color: #77738e;
  font-size: 10px;
}

.draw-answer-meta {
  margin-top: 9px;
  color: #77738e;
  font-size: 10px;
}

.draw-answer-meta strong {
  color: var(--purple-dark);
  font-size: 13px;
}

.draw-public-hint {
  margin: 4px 0 9px;
  color: #77738e;
  font-size: 10px;
}

.draw-skip-button {
  min-height: 34px;
  margin-top: 9px;
  padding: 0 11px;
  border: 1px solid #e5e2ed;
  border-radius: 9px;
  background: #fff;
  color: #77738e;
  font-size: 9px;
  font-weight: 700;
}

.draw-skip-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.draw-wait-message {
  margin: 12px 0;
  color: #89869b;
  font-size: 10px;
  text-align: center;
}

.draw-phase-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.draw-action-buttons {
  display: flex;
  gap: 7px;
}

.draw-finish-button {
  min-height: 34px;
  margin-top: 9px;
  padding-inline: 11px;
  font-size: 9px;
}

.draw-secret-answer {
  margin: 8px 0 0;
  color: #77738e;
  font-size: 10px;
}

.draw-secret-answer strong {
  color: var(--purple-dark);
}

.draw-reveal-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 13px;
  padding: 13px;
  border-radius: 12px;
  background: #f4f2ff;
  text-align: center;
}

.draw-reveal-card strong {
  margin-top: 4px;
  color: var(--purple-dark);
  font-size: 20px;
  font-weight: 800;
}

.draw-reveal-card p {
  margin: 6px 0 0;
  color: #85809d;
  font-size: 9px;
}

.draw-reveal-end-button {
  margin-top: 10px;
  padding: 7px 12px;
  font-size: 10px;
}
</style>
