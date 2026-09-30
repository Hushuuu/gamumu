<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DrawGuessSettings } from '../../../shared/games/draw-guess'

const props = defineProps<{
  settings: Record<string, unknown>
  isHost: boolean
  canConfigure: boolean
}>()

const emit = defineEmits<{
  'configure-game': [settings: DrawGuessSettings]
}>()

const drawTimeSeconds = ref(60)
const roundsPerPlayer = ref(1)
const guessTimeSeconds = ref(30)

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
    guessTimeSeconds.value <= 120
  )
})

watch(() => props.settings, (settings) => {
  drawTimeSeconds.value = settingNumber(settings.drawTimeSeconds, 60)
  roundsPerPlayer.value = settingNumber(settings.roundsPerPlayer, 1)
  guessTimeSeconds.value = settingNumber(settings.guessTimeSeconds, 30)
}, { deep: true, immediate: true })

function settingNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}

function saveSettings(): void {
  if (!props.isHost || !props.canConfigure || !isValid.value) {
    return
  }

  emit('configure-game', {
    drawTimeSeconds: drawTimeSeconds.value,
    roundsPerPlayer: roundsPerPlayer.value,
    guessTimeSeconds: guessTimeSeconds.value,
  })
}
</script>

<template>
  <section class="draw-settings-panel" aria-labelledby="draw-settings-title">
    <div class="draw-settings-heading">
      <div>
        <p class="eyebrow">本局設定</p>
        <h3 id="draw-settings-title">你畫我猜</h3>
        <p>每位玩家依序繪畫指定輪數；繪圖者可跳過。</p>
      </div>
      <span class="draw-settings-icon" aria-hidden="true">✎</span>
    </div>

    <form class="draw-settings-form" @submit.prevent="saveSettings">
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
      <button
        class="button button-secondary draw-settings-save"
        type="submit"
        :disabled="!isHost || !canConfigure || !isValid"
      >
        {{ isHost ? '儲存設定' : '由房主設定' }}
      </button>
    </form>
    <p class="draw-settings-note">
      {{ isHost ? '儲存變更會清除所有人的準備狀態。' : '設定變更後需要重新準備。' }}
    </p>
  </section>
</template>
