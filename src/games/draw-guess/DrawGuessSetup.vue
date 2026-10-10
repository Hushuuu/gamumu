<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DRAW_GUESS_QUESTION_CATEGORIES,
  type DrawGuessQuestionCategory,
  type DrawGuessQuestionMode,
  type DrawGuessSettings,
} from '../../../shared/games/draw-guess'

const props = defineProps<{
  settings: Record<string, unknown>
  isHost: boolean
  canConfigure: boolean
  playerCount?: number
}>()

const emit = defineEmits<{
  'configure-game': [settings: DrawGuessSettings]
}>()

const drawTimeSeconds = ref(60)
const roundsPerPlayer = ref(1)
const guessTimeSeconds = ref(30)
const revealTimeSeconds = ref(10)
const questionMode = ref<DrawGuessQuestionMode>('free')
const questionCategory = ref<DrawGuessQuestionCategory>('all')
const showHints = ref(true)

const isValid = computed(() => {
  return (
    Number.isInteger(drawTimeSeconds.value) &&
    drawTimeSeconds.value >= 15 &&
    drawTimeSeconds.value <= 180 &&
    Number.isInteger(roundsPerPlayer.value) &&
    roundsPerPlayer.value >= 1 &&
    roundsPerPlayer.value <= 5 &&
    Number.isInteger(guessTimeSeconds.value) &&
    guessTimeSeconds.value >= 10 &&
    guessTimeSeconds.value <= 120 &&
    Number.isInteger(revealTimeSeconds.value) &&
    revealTimeSeconds.value >= 10 &&
    revealTimeSeconds.value <= 180 &&
    ['free', 'bank'].includes(questionMode.value) &&
    DRAW_GUESS_QUESTION_CATEGORIES.some(({ id }) => id === questionCategory.value) &&
    typeof showHints.value === 'boolean'
  )
})

watch(() => props.settings, (settings) => {
  drawTimeSeconds.value = settingNumber(settings.drawTimeSeconds, 60)
  roundsPerPlayer.value = settingNumber(settings.roundsPerPlayer, 1)
  guessTimeSeconds.value = settingNumber(settings.guessTimeSeconds, 30)
  revealTimeSeconds.value = settingNumber(settings.revealTimeSeconds, 10)
  questionMode.value = settings.questionMode === 'bank' ? 'bank' : 'free'
  questionCategory.value = DRAW_GUESS_QUESTION_CATEGORIES.some(({ id }) => id === settings.questionCategory)
    ? settings.questionCategory as DrawGuessQuestionCategory
    : 'all'
  showHints.value = settings.showHints !== false
}, { deep: true, immediate: true })

function settingNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}

function applySettings(): void {
  if (!props.isHost || !props.canConfigure || !isValid.value) {
    return
  }

  emit('configure-game', {
    drawTimeSeconds: drawTimeSeconds.value,
    roundsPerPlayer: roundsPerPlayer.value,
    guessTimeSeconds: guessTimeSeconds.value,
    revealTimeSeconds: revealTimeSeconds.value,
    questionMode: questionMode.value,
    questionCategory: questionCategory.value,
    showHints: showHints.value,
  })
}
</script>

<template>
  <section class="draw-settings-panel" aria-labelledby="draw-settings-title">
    <div class="draw-settings-heading">
      <div>
        <p class="eyebrow">本局設定</p>
        <h3 id="draw-settings-title">你畫我猜</h3>
        <p>選擇自由出題，或從分類題庫抽題；繪圖者可跳過。</p>
      </div>
    </div>

    <form
      class="draw-settings-form"
      @change="applySettings"
      @submit.prevent="applySettings"
    >
      <label>
        <span>出題模式</span>
        <select v-model="questionMode" :disabled="!isHost || !canConfigure">
          <option value="free">自由出題</option>
          <option value="bank">分類題庫</option>
        </select>
        <small>{{ questionMode === 'bank' ? '題目與固定提示由題庫提供' : '繪圖者自行輸入題目與提示' }}</small>
      </label>
      <label v-if="questionMode === 'bank'">
        <span>題庫分類</span>
        <select v-model="questionCategory" :disabled="!isHost || !canConfigure">
          <option v-for="category in DRAW_GUESS_QUESTION_CATEGORIES" :key="category.id" :value="category.id">
            {{ category.label }}
          </option>
        </select>
        <small>每題會從分類中抽選，題目不會重複直到抽完</small>
      </label>
      <label>
        <span>提示顯示</span>
        <select v-model="showHints" :disabled="!isHost || !canConfigure">
          <option :value="true">顯示提示</option>
          <option :value="false">不顯示提示</option>
        </select>
        <small>不顯示提示時，答案字數仍會顯示</small>
      </label>
      <label>
        <span>繪畫時間（秒）</span>
        <input v-model.number="drawTimeSeconds" type="number" min="15" max="180" step="1" :disabled="!isHost || !canConfigure" />
        <small>15–180 秒</small>
      </label>
      <label>
        <span>每人繪畫輪數</span>
        <input v-model.number="roundsPerPlayer" type="number" min="1" max="5" step="1" :disabled="!isHost || !canConfigure" />
        <small>1–5 輪</small>
      </label>
      <label>
        <span>猜答案時間（秒）</span>
        <input v-model.number="guessTimeSeconds" type="number" min="10" max="120" step="1" :disabled="!isHost || !canConfigure" />
        <small>10–120 秒</small>
      </label>
      <label>
        <span>公布答案時間（秒）</span>
        <input v-model.number="revealTimeSeconds" type="number" min="10" max="180" step="1" :disabled="!isHost || !canConfigure" />
        <small>10–180 秒；房主可以提前結束</small>
      </label>
    </form>
    <p class="draw-settings-note">
      {{ isHost ? '' : '房主調整設定中。' }}
    </p>
  </section>
</template>
