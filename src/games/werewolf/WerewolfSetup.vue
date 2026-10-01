<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  DEFAULT_WEREWOLF_SETTINGS,
  WEREWOLF_ROLES,
  WEREWOLF_SCRIPTS,
  isWerewolfScriptId,
  type WerewolfScriptId,
  type WerewolfSettings,
} from '../../../shared/games/werewolf'
import WerewolfRoleIcon from './components/WerewolfRoleIcon.vue'

const props = defineProps<{
  settings: Record<string, unknown>
  isHost: boolean
  canConfigure: boolean
}>()

const emit = defineEmits<{
  'configure-game': [settings: WerewolfSettings]
}>()

const scriptId = ref<WerewolfScriptId>(DEFAULT_WEREWOLF_SETTINGS.scriptId)
const discussionSeconds = ref(DEFAULT_WEREWOLF_SETTINGS.discussionSeconds)
const speechMode = ref(DEFAULT_WEREWOLF_SETTINGS.speechMode)
const speechSeconds = ref(DEFAULT_WEREWOLF_SETTINGS.speechSeconds)
const voteSeconds = ref(DEFAULT_WEREWOLF_SETTINGS.voteSeconds)
const nightStepSeconds = ref(DEFAULT_WEREWOLF_SETTINGS.nightStepSeconds)

const script = computed(() => {
  return WEREWOLF_SCRIPTS.find((candidate) => candidate.id === scriptId.value) ?? WEREWOLF_SCRIPTS[0]!
})
const isValid = computed(() => {
  return (
    Number.isInteger(discussionSeconds.value) &&
    discussionSeconds.value >= 30 &&
    discussionSeconds.value <= 600 &&
    Number.isInteger(speechSeconds.value) &&
    speechSeconds.value >= 10 &&
    speechSeconds.value <= 180 &&
    Number.isInteger(voteSeconds.value) &&
    voteSeconds.value >= 15 &&
    voteSeconds.value <= 180 &&
    Number.isInteger(nightStepSeconds.value) &&
    nightStepSeconds.value >= 10 &&
    nightStepSeconds.value <= 60
  )
})
const disabled = computed(() => !props.isHost || !props.canConfigure)

watch(() => props.settings, (settings) => {
  scriptId.value = isWerewolfScriptId(settings.scriptId) ? settings.scriptId : DEFAULT_WEREWOLF_SETTINGS.scriptId
  discussionSeconds.value = settingNumber(settings.discussionSeconds, DEFAULT_WEREWOLF_SETTINGS.discussionSeconds)
  speechMode.value = settings.speechMode === true
  speechSeconds.value = settingNumber(settings.speechSeconds, DEFAULT_WEREWOLF_SETTINGS.speechSeconds)
  voteSeconds.value = settingNumber(settings.voteSeconds, DEFAULT_WEREWOLF_SETTINGS.voteSeconds)
  nightStepSeconds.value = settingNumber(settings.nightStepSeconds, DEFAULT_WEREWOLF_SETTINGS.nightStepSeconds)
}, { deep: true, immediate: true })

function settingNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}

function selectScript(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement) || !isWerewolfScriptId(target.value)) {
    return
  }

  scriptId.value = target.value
  saveSettings()
}

function saveSettings(): void {
  if (disabled.value || !isValid.value) {
    return
  }

  emit('configure-game', {
    scriptId: scriptId.value,
    discussionSeconds: discussionSeconds.value,
    speechMode: speechMode.value,
    speechSeconds: speechSeconds.value,
    voteSeconds: voteSeconds.value,
    nightStepSeconds: nightStepSeconds.value,
  })
}
</script>

<template>
  <section class="draw-settings-panel" aria-labelledby="werewolf-settings-title">
    <div class="draw-settings-heading">
      <div>
        <p class="eyebrow">本局設定</p>
        <h3 id="werewolf-settings-title">狼人殺 · {{ script.name }}</h3>
        <p>{{ script.description }}（{{ script.minPlayers }}–{{ script.maxPlayers }} 人）</p>
      </div>
      <span class="draw-settings-icon">
        <WerewolfRoleIcon role-id="werewolf" :size="28" />
      </span>
    </div>

    <p class="ww-setup-roles">
      <span v-for="roleId in script.roles" :key="roleId" class="ww-tag">
        <WerewolfRoleIcon :role-id="roleId" :size="16" />
        {{ WEREWOLF_ROLES[roleId].name }}
      </span>
    </p>

    <form class="draw-settings-form" @submit.prevent="saveSettings">
      <label v-if="WEREWOLF_SCRIPTS.length > 1">
        <span>劇本</span>
        <select :value="scriptId" :disabled="disabled || !isValid" @change="selectScript">
          <option v-for="item in WEREWOLF_SCRIPTS" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <small>角色依人數自動配置</small>
      </label>
      <label class="ww-checkbox">
        <span>輪流發言</span>
        <input v-model="speechMode" type="checkbox" :disabled="disabled" />
        <small>每天隨機安排存活玩家依序發言，發言者可提早結束</small>
      </label>
      <label v-if="speechMode">
        <span>每人發言時間（秒）</span>
        <input v-model.number="speechSeconds" type="number" min="10" max="180" step="1" :disabled="disabled" />
        <small>10–180 秒</small>
      </label>
      <label v-else>
        <span>自由討論時間（秒）</span>
        <input v-model.number="discussionSeconds" type="number" min="30" max="600" step="1" :disabled="disabled" />
        <small>30–600 秒</small>
      </label>
      <label>
        <span>投票時間（秒）</span>
        <input v-model.number="voteSeconds" type="number" min="15" max="180" step="1" :disabled="disabled" />
        <small>15–180 秒</small>
      </label>
      <label>
        <span>夜間每步驟（秒）</span>
        <input v-model.number="nightStepSeconds" type="number" min="10" max="60" step="1" :disabled="disabled" />
        <small>10–60 秒</small>
      </label>
      <button
        class="button button-secondary draw-settings-save"
        type="submit"
        :disabled="disabled || !isValid"
      >
        {{ isHost ? '儲存設定' : '由房主設定' }}
      </button>
    </form>
    <p class="draw-settings-note">
      {{ isHost ? '儲存變更會清除所有人的準備狀態。' : '設定變更後需要重新準備。' }}
      討論請面對面或自行用語音進行。
    </p>
  </section>
</template>
