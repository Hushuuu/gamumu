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
import {
  avalonAssetUrl,
  avalonPhaseIconUrl,
  avalonRoleIconUrl,
} from './visualAssets'

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
      <span class="draw-settings-icon" aria-hidden="true">
        <img :src="avalonAssetUrl('avalon-crest.svg')" alt="" />
      </span>
    </div>

    <form class="avalon-settings-options" @change="applySettings" @submit.prevent="applySettings">
      <label class="avalon-setting-option">
        <input v-model="includePercival" type="checkbox" :disabled="disabled" />
        <span class="avalon-setting-icon" aria-hidden="true">
          <img :src="avalonRoleIconUrl('percival')" alt="" />
        </span>
        <span class="avalon-setting-copy">
          <strong>派西維爾</strong>
          <small>好人；能看到梅林與莫甘娜，但不知道誰是誰。</small>
        </span>
      </label>
      <label class="avalon-setting-option">
        <input v-model="includeMorgana" type="checkbox" :disabled="disabled" />
        <span class="avalon-setting-icon" aria-hidden="true">
          <img :src="avalonRoleIconUrl('morgana')" alt="" />
        </span>
        <span class="avalon-setting-copy">
          <strong>莫甘娜</strong>
          <small>壞人；只有派西維爾也加入時才會造成梅林身分混淆。</small>
        </span>
      </label>
      <label class="avalon-setting-option">
        <input v-model="includeMordred" type="checkbox" :disabled="disabled" />
        <span class="avalon-setting-icon" aria-hidden="true">
          <img :src="avalonRoleIconUrl('mordred')" alt="" />
        </span>
        <span class="avalon-setting-copy">
          <strong>莫德雷德</strong>
          <small>壞人；梅林看不到他。</small>
        </span>
      </label>
      <label class="avalon-setting-option">
        <input v-model="includeOberon" type="checkbox" :disabled="disabled" />
        <span class="avalon-setting-icon" aria-hidden="true">
          <img :src="avalonRoleIconUrl('oberon')" alt="" />
        </span>
        <span class="avalon-setting-copy">
          <strong>奧伯倫</strong>
          <small>壞人；與其他壞人互不認識，湖中女神會查出好人。</small>
        </span>
      </label>
      <label class="avalon-setting-option">
        <input v-model="ladyOfTheLake" type="checkbox" :disabled="disabled" />
        <span class="avalon-setting-icon" aria-hidden="true">
          <img :src="avalonPhaseIconUrl('lake-check')" alt="" />
        </span>
        <span class="avalon-setting-copy">
          <strong>湖中女神</strong>
          <small>7 人以上啟用；第 2、3、4 個任務後私下查驗陣營並傳遞標記。</small>
        </span>
      </label>
    </form>

    <div class="avalon-role-composition" aria-label="目前角色配置">
      <span
        v-for="entry in roleEntries"
        :key="entry.role.id"
        class="avalon-role-chip"
        :class="`is-${entry.role.camp}`"
      >
        <img :src="avalonRoleIconUrl(entry.role.id)" alt="" />
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
.draw-settings-panel.avalon-setup {
  --avalon-parchment: #f4f0e4;
  --avalon-paper: #fffdf7;
  --avalon-ink: #302d3d;
  --avalon-good: #3e7659;
  --avalon-good-soft: #e3f0e7;
  --avalon-evil: #853f4c;
  --avalon-evil-soft: #f5e5e3;
  --avalon-gold: #d5aa58;
  --avalon-lake: #4a9aa0;
  --avalon-lake-soft: #e1f1f0;
  border-color: #ded4bc;
  background: linear-gradient(135deg, var(--avalon-paper), var(--avalon-parchment));
  color: var(--avalon-ink);
}

.avalon-setup .draw-settings-heading p:last-child {
  max-width: 460px;
  line-height: 1.5;
}

.avalon-setup .draw-settings-heading .eyebrow {
  color: var(--avalon-good);
}

.avalon-setup .draw-settings-heading h3 {
  color: var(--avalon-ink);
}

.avalon-setup .draw-settings-icon {
  display: grid;
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid #e5d7b5;
  border-radius: 16px;
  background: #fbf4e4;
}

.avalon-setup .draw-settings-icon img {
  display: block;
  width: 42px;
  height: 42px;
}

.avalon-settings-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.avalon-setting-option {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid #e7dfce;
  border-radius: 13px;
  background: var(--avalon-paper);
  cursor: pointer;
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.avalon-setting-option:hover {
  border-color: #d5aa58;
  box-shadow: 0 5px 12px rgb(48 45 61 / 8%);
  transform: translateY(-1px);
}

.avalon-setting-option input {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  margin: 0;
  accent-color: var(--avalon-good);
}

.avalon-setting-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: var(--avalon-parchment);
}

.avalon-setting-icon img {
  display: block;
  width: 30px;
  height: 30px;
}

.avalon-setting-copy {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 3px;
}

.avalon-setting-option strong {
  color: var(--avalon-ink);
  font-size: 11px;
}

.avalon-setting-option small {
  color: #696575;
  font-size: 9px;
  line-height: 1.45;
}

.avalon-setting-option:focus-within {
  border-color: var(--avalon-gold);
  box-shadow: 0 0 0 3px rgb(213 170 88 / 22%);
}

.avalon-role-composition {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.avalon-role-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 5px;
  border-radius: 999px;
  background: var(--avalon-good-soft);
  color: var(--avalon-good);
  font-size: 9px;
  font-weight: 700;
}

.avalon-role-chip.is-evil {
  background: var(--avalon-evil-soft);
  color: var(--avalon-evil);
}

.avalon-role-chip img {
  display: block;
  width: 22px;
  height: 22px;
}

.avalon-role-warning {
  margin: 8px 0 0;
  color: #86542e;
  font-size: 10px;
  line-height: 1.5;
}

.avalon-setup .draw-settings-note {
  color: #696575;
}

@media (max-width: 520px) {
  .avalon-settings-options {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .avalon-setting-option {
    transition: none;
  }

  .avalon-setting-option:hover {
    transform: none;
  }
}
</style>
