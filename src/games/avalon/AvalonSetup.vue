<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AVALON_ROLES,
  DEFAULT_AVALON_SETTINGS,
  getAvalonPlayerRange,
  getAvalonRoleCounts,
  type AvalonRoleId,
  type AvalonSettings,
} from '../../../shared/games/avalon'

const props = defineProps<{
  settings: Record<string, unknown>
  isHost: boolean
  canConfigure: boolean
  playerCount: number
}>()

const emit = defineEmits<{
  'configure-game': [settings: AvalonSettings]
}>()

const includePercival = ref(DEFAULT_AVALON_SETTINGS.includePercival)
const includeMorgana = ref(DEFAULT_AVALON_SETTINGS.includeMorgana)
const includeMordred = ref(DEFAULT_AVALON_SETTINGS.includeMordred)
const includeOberon = ref(DEFAULT_AVALON_SETTINGS.includeOberon)
const ladyOfTheLake = ref(DEFAULT_AVALON_SETTINGS.ladyOfTheLake)

const disabled = computed(() => !props.isHost || !props.canConfigure)
const settingsValue = computed<AvalonSettings>(() => ({
  includePercival: includePercival.value,
  includeMorgana: includeMorgana.value,
  includeMordred: includeMordred.value,
  includeOberon: includeOberon.value,
  ladyOfTheLake: ladyOfTheLake.value,
}))
const playerRange = computed(() => getAvalonPlayerRange(settingsValue.value) ?? { min: 5, max: 10 })
const roleEntries = computed(() => {
  const counts = getAvalonRoleCounts(props.playerCount, settingsValue.value)
  return counts
    ? (Object.entries(counts) as Array<[AvalonRoleId, number]>)
      .filter(([, count]) => count > 0)
      .map(([roleId, count]) => ({ role: AVALON_ROLES[roleId], count }))
    : []
})
const playerCountWarning = computed(() => {
  if (props.playerCount < playerRange.value.min) {
    return `目前 ${props.playerCount} 人，這組角色至少需要 ${playerRange.value.min} 人。`
  }
  if (props.playerCount > playerRange.value.max) {
    return `阿瓦隆最多 ${playerRange.value.max} 人，請調整人數後開始。`
  }
  return ''
})

watch(() => props.settings, (settings) => {
  includePercival.value = settings.includePercival === true
  includeMorgana.value = settings.includeMorgana === true
  includeMordred.value = settings.includeMordred === true
  includeOberon.value = settings.includeOberon === true
  ladyOfTheLake.value = settings.ladyOfTheLake === true
}, { deep: true, immediate: true })

function applySettings(): void {
  if (disabled.value) {
    return
  }
  emit('configure-game', { ...settingsValue.value })
}
</script>

<template>
  <section class="draw-settings-panel avalon-setup" aria-labelledby="avalon-settings-title">
    <div class="draw-settings-heading">
      <div>
        <p class="eyebrow">本局設定</p>
        <h3 id="avalon-settings-title">阿瓦隆角色</h3>
        <p>固定包含梅林與刺客；選配角色會替換同陣營的基本角色，不增加陣營人數。</p>
      </div>
      <span class="draw-settings-icon" aria-hidden="true">⚔</span>
    </div>

    <form class="avalon-settings-options" @change="applySettings" @submit.prevent="applySettings">
      <label class="avalon-setting-option">
        <input v-model="includePercival" type="checkbox" :disabled="disabled" />
        <span>
          <strong>派西維爾</strong>
          <small>好人；能看到梅林與莫甘娜，但不知道誰是誰。</small>
        </span>
      </label>
      <label class="avalon-setting-option">
        <input v-model="includeMorgana" type="checkbox" :disabled="disabled" />
        <span>
          <strong>莫甘娜</strong>
          <small>壞人；只有派西維爾也加入時才會造成梅林身分混淆。</small>
        </span>
      </label>
      <label class="avalon-setting-option">
        <input v-model="includeMordred" type="checkbox" :disabled="disabled" />
        <span>
          <strong>莫德雷德</strong>
          <small>壞人；梅林看不到他。</small>
        </span>
      </label>
      <label class="avalon-setting-option">
        <input v-model="includeOberon" type="checkbox" :disabled="disabled" />
        <span>
          <strong>奧伯倫</strong>
          <small>壞人；與其他壞人互不認識，湖中女神會查出好人。</small>
        </span>
      </label>
      <label class="avalon-setting-option">
        <input v-model="ladyOfTheLake" type="checkbox" :disabled="disabled" />
        <span>
          <strong>湖中女神</strong>
          <small>7 人以上啟用；第 2、3、4 個任務後私下查驗陣營並傳遞標記。</small>
        </span>
      </label>
    </form>

    <div class="avalon-role-composition" aria-label="目前角色配置">
      <span v-for="entry in roleEntries" :key="entry.role.id" class="avalon-role-chip">
        {{ entry.role.name }} × {{ entry.count }}
      </span>
      <span v-if="!roleEntries.length" class="avalon-role-warning">
        目前人數不足，請增加玩家或取消部分角色。
      </span>
    </div>
    <p v-if="playerCountWarning" class="avalon-role-warning" role="status">
      {{ playerCountWarning }}
    </p>
    <p class="draw-settings-note">
      {{ isHost ? '' : '由房主調整本局角色。' }}
      壞人角色選配過多時，需求人數會提高；完整規則請查看「規則說明」。
    </p>
  </section>
</template>

<style scoped>
.avalon-setup .draw-settings-heading p:last-child {
  max-width: 460px;
  line-height: 1.5;
}

.avalon-settings-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.avalon-setting-option {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px;
  border: 1px solid #ebe8f4;
  border-radius: 11px;
  background: #fff;
  cursor: pointer;
}

.avalon-setting-option input {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  margin: 2px 0 0;
  accent-color: var(--purple);
}

.avalon-setting-option span {
  display: grid;
  gap: 3px;
}

.avalon-setting-option strong {
  color: var(--ink);
  font-size: 11px;
}

.avalon-setting-option small {
  color: #858198;
  font-size: 9px;
  line-height: 1.45;
}

.avalon-role-composition {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.avalon-role-chip {
  padding: 5px 8px;
  border-radius: 999px;
  background: #f0edff;
  color: #6659b7;
  font-size: 9px;
  font-weight: 700;
}

.avalon-role-warning {
  margin: 8px 0 0;
  color: #a35b37;
  font-size: 10px;
  line-height: 1.5;
}

@media (max-width: 520px) {
  .avalon-settings-options {
    grid-template-columns: 1fr;
  }
}
</style>
