<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DEFAULT_RUMMIKUB_SETTINGS,
  type RummikubSettings,
} from '../../../shared/games/rummikub'

const props = defineProps<{
  settings: Record<string, unknown>
  isHost: boolean
  canConfigure: boolean
}>()

const emit = defineEmits<{
  'configure-game': [settings: RummikubSettings]
}>()

const turnTimeSeconds = ref(DEFAULT_RUMMIKUB_SETTINGS.turnTimeSeconds ?? 60)
const unlimitedTime = ref(false)
const disabled = computed(() => !props.isHost || !props.canConfigure)
const isValid = computed(() => {
  return (
    unlimitedTime.value ||
    (
      Number.isInteger(turnTimeSeconds.value) &&
      turnTimeSeconds.value >= 15 &&
      turnTimeSeconds.value <= 300
    )
  )
})

watch(() => props.settings, (settings) => {
  unlimitedTime.value = settings.turnTimeSeconds === null
  turnTimeSeconds.value = settingNumber(
    settings.turnTimeSeconds,
    DEFAULT_RUMMIKUB_SETTINGS.turnTimeSeconds ?? 60,
  )
}, { deep: true, immediate: true })

function settingNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}

function applySettings(): void {
  if (disabled.value || !isValid.value) {
    return
  }

  emit('configure-game', {
    turnTimeSeconds: unlimitedTime.value ? null : turnTimeSeconds.value,
  })
}
</script>

<template>
  <section class="draw-settings-panel" aria-labelledby="rummikub-settings-title">
    <div class="draw-settings-heading">
      <div>
        <p class="eyebrow">本局設定</p>
        <h3 id="rummikub-settings-title">拉密</h3>
        <p>設定每位玩家的回合思考時間。</p>
      </div>
      <span class="draw-settings-icon" aria-hidden="true">13</span>
    </div>

    <form
      class="draw-settings-form"
      @change="applySettings"
      @submit.prevent="applySettings"
    >
      <label>
        <span>每回合思考時間（秒）</span>
        <input
          v-model.number="turnTimeSeconds"
          type="number"
          min="15"
          max="300"
          step="1"
          :disabled="disabled || unlimitedTime"
        />
        <small v-if="isValid">15–300 秒，預設 60 秒；有效變更會自動套用</small>
        <small v-else>請輸入 15–300 秒的整數，才會套用設定</small>
      </label>
      <label class="rummikub-unlimited-setting">
        <span class="rummikub-unlimited-toggle">
          <input v-model="unlimitedTime" type="checkbox" :disabled="disabled" />
          不限時
        </span>
        <small>不會因思考時間結束而自動抽牌</small>
      </label>
    </form>
    <p class="draw-settings-note">
      {{ isHost ? '有效設定變更會自動套用，並清除所有人的準備狀態。' : '設定變更後需要重新準備。' }}
      限時逾時時，合法且有出牌的桌面草稿會自動確認；否則還原編輯並抽牌，牌堆已空則自動跳過。
    </p>
  </section>
</template>

<style scoped>
.rummikub-unlimited-toggle {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 7px;
}

.rummikub-unlimited-toggle input {
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
}
</style>
