<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  DEFAULT_EXPLODING_KITTENS_SETTINGS,
  type ExplodingKittensSettings,
} from '../../../shared/games'

const props = defineProps<{
  settings: Record<string, unknown>
  isHost: boolean
  canConfigure: boolean
  playerCount?: number
}>()

const emit = defineEmits<{
  'configure-game': [settings: ExplodingKittensSettings]
}>()

const turnTimeSeconds = ref(DEFAULT_EXPLODING_KITTENS_SETTINGS.turnTimeSeconds)
const nopeWindowSeconds = ref(DEFAULT_EXPLODING_KITTENS_SETTINGS.nopeWindowSeconds)
const turnNoticeSeconds = ref(DEFAULT_EXPLODING_KITTENS_SETTINGS.turnNoticeSeconds)
const hasLocalEdits = ref(false)
let applySettingsTimer: number | undefined

onBeforeUnmount(() => {
  if (applySettingsTimer !== undefined) {
    window.clearTimeout(applySettingsTimer)
  }
})

const isValid = computed(() => {
  return (
    Number.isInteger(turnTimeSeconds.value) &&
    turnTimeSeconds.value >= 5 &&
    turnTimeSeconds.value <= 100 &&
    Number.isInteger(nopeWindowSeconds.value) &&
    nopeWindowSeconds.value >= 3 &&
    nopeWindowSeconds.value <= 30 &&
    Number.isInteger(turnNoticeSeconds.value) &&
    turnNoticeSeconds.value >= 5 &&
    turnNoticeSeconds.value <= 20
  )
})

watch(
  [
    () => props.settings.turnTimeSeconds,
    () => props.settings.nopeWindowSeconds,
    () => props.settings.turnNoticeSeconds,
  ],
  ([turnTime, nopeWindow, turnNotice]) => {
    const serverTurnTime = settingNumber(turnTime, DEFAULT_EXPLODING_KITTENS_SETTINGS.turnTimeSeconds)
    const serverNopeWindow = settingNumber(nopeWindow, DEFAULT_EXPLODING_KITTENS_SETTINGS.nopeWindowSeconds)
    const serverTurnNotice = settingNumber(turnNotice, DEFAULT_EXPLODING_KITTENS_SETTINGS.turnNoticeSeconds)

    if (hasLocalEdits.value) {
      if (
        serverTurnTime === turnTimeSeconds.value &&
        serverNopeWindow === nopeWindowSeconds.value &&
        serverTurnNotice === turnNoticeSeconds.value
      ) {
        hasLocalEdits.value = false
      } else {
        return
      }
    }

    turnTimeSeconds.value = serverTurnTime
    nopeWindowSeconds.value = serverNopeWindow
    turnNoticeSeconds.value = serverTurnNotice
  },
  { immediate: true },
)

function settingNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}

function queueApplySettings(): void {
  hasLocalEdits.value = true
  if (applySettingsTimer !== undefined) {
    window.clearTimeout(applySettingsTimer)
  }
  applySettingsTimer = window.setTimeout(() => {
    applySettingsTimer = undefined
    void nextTick(applySettings)
  }, 300)
}

function applySettings(): void {
  if (applySettingsTimer !== undefined) {
    window.clearTimeout(applySettingsTimer)
    applySettingsTimer = undefined
  }

  if (!props.isHost || !props.canConfigure || !isValid.value) {
    return
  }

  const settings = {
    turnTimeSeconds: turnTimeSeconds.value,
    nopeWindowSeconds: nopeWindowSeconds.value,
    turnNoticeSeconds: turnNoticeSeconds.value,
  }
  const currentSettings = {
    turnTimeSeconds: settingNumber(
      props.settings.turnTimeSeconds,
      DEFAULT_EXPLODING_KITTENS_SETTINGS.turnTimeSeconds,
    ),
    nopeWindowSeconds: settingNumber(
      props.settings.nopeWindowSeconds,
      DEFAULT_EXPLODING_KITTENS_SETTINGS.nopeWindowSeconds,
    ),
    turnNoticeSeconds: settingNumber(
      props.settings.turnNoticeSeconds,
      DEFAULT_EXPLODING_KITTENS_SETTINGS.turnNoticeSeconds,
    ),
  }

  if (
    settings.turnTimeSeconds === currentSettings.turnTimeSeconds &&
    settings.nopeWindowSeconds === currentSettings.nopeWindowSeconds &&
    settings.turnNoticeSeconds === currentSettings.turnNoticeSeconds
  ) {
    hasLocalEdits.value = false
    return
  }

  hasLocalEdits.value = true
  emit('configure-game', settings)
}
</script>

<template>
  <section class="ek-settings" aria-labelledby="ek-settings-title">
    <div>
      <p class="eyebrow">本局設定</p>
      <h3 id="ek-settings-title">爆炸貓</h3>
      <p class="ek-settings-description">
        {{ (playerCount ?? 2) > 5 ? '6–9 位玩家使用兩副牌。' : '2–5 位玩家使用一副牌。' }}
        拆除選擇逾時或休想判定逾時時，系統會自動處理。
      </p>
    </div>

    <form class="ek-settings-fields" @change="applySettings" @submit.prevent="applySettings">
      <label>
        <span>每回合時限</span>
        <div class="ek-setting-input">
          <input
            v-model.number="turnTimeSeconds"
            type="number"
            min="5"
            max="100"
            step="1"
            :disabled="!isHost || !canConfigure"
            @input="queueApplySettings"
          />
          <small>秒（5–100）</small>
        </div>
      </label>
      <label>
        <span>休想判定時間</span>
        <div class="ek-setting-input">
          <input
            v-model.number="nopeWindowSeconds"
            type="number"
            min="3"
            max="30"
            step="1"
            :disabled="!isHost || !canConfigure"
            @input="queueApplySettings"
          />
          <small>秒（3–30）</small>
        </div>
      </label>
      <label>
        <span>回合通知顯示時間</span>
        <div class="ek-setting-input">
          <input
            v-model.number="turnNoticeSeconds"
            type="number"
            min="5"
            max="20"
            step="1"
            :disabled="!isHost || !canConfigure"
            @input="queueApplySettings"
          />
          <small>秒（5–20）</small>
        </div>
      </label>
    </form>
    <p v-if="!isHost" class="ek-settings-note">房主可以調整本局設定。</p>
  </section>
</template>

<style scoped>
.ek-settings {
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(0, 1.2fr);
  gap: 18px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}

.ek-settings h3 {
  margin: 4px 0;
}

.ek-settings-description,
.ek-settings-note {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

.ek-settings-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.ek-settings-fields label {
  display: grid;
  align-content: start;
  gap: 6px;
  color: #5c5875;
  font-size: 11px;
  font-weight: 700;
}

.ek-setting-input {
  display: flex;
  align-items: center;
  gap: 7px;
}

.ek-setting-input input {
  width: 68px;
  min-width: 0;
  height: 40px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fbfaff;
  color: var(--ink);
}

.ek-setting-input small {
  color: var(--muted);
  font-size: 9px;
  font-weight: 500;
}

@media (max-width: 620px) {
  .ek-settings {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

@media (max-width: 420px) {
  .ek-settings-fields {
    grid-template-columns: 1fr;
  }
}
</style>
