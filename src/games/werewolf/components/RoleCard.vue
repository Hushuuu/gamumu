<script setup lang="ts">
import { computed, ref } from 'vue'
import { WEREWOLF_ROLES, type WerewolfRoleId } from '../../../../shared/games/werewolf'
import WerewolfRoleIcon from './WerewolfRoleIcon.vue'

const props = defineProps<{
  role: WerewolfRoleId | null
  teammateNames: string[]
}>()

const revealed = ref(false)
const info = computed(() => (props.role ? WEREWOLF_ROLES[props.role] : null))

function reveal(): void {
  revealed.value = true
}

function hide(): void {
  revealed.value = false
}
</script>

<template>
  <button
    class="ww-role-card"
    :class="{ 'is-revealed': revealed, 'is-wolf': revealed && info?.camp === 'wolf' }"
    type="button"
    :disabled="!info"
    :aria-pressed="revealed"
    aria-label="按住查看你的身分，放開後隱藏"
    @pointerdown.prevent="reveal"
    @pointerup="hide"
    @pointerleave="hide"
    @pointercancel="hide"
    @contextmenu.prevent
    @keydown.space.prevent="reveal"
    @keydown.enter.prevent="reveal"
    @keyup.space="hide"
    @keyup.enter="hide"
    @blur="hide"
  >
    <template v-if="info && revealed">
      <WerewolfRoleIcon :role-id="info.id" :size="40" class="ww-role-card-icon" />
      <strong>{{ info.name }}</strong>
      <span class="ww-role-camp">{{ info.camp === 'wolf' ? '狼人陣營' : '好人陣營' }}</span>
      <small>{{ info.description }}</small>
      <small v-if="teammateNames.length">狼人同伴：{{ teammateNames.join('、') }}</small>
    </template>
    <template v-else>
      <svg class="ww-role-card-back" viewBox="0 0 36 44" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="32" height="40" rx="5" />
        <path d="M8 11h20M8 33h20M10 22c4-7 12-7 16 0-4 7-12 7-16 0Z" />
        <circle cx="18" cy="22" r="2" />
      </svg>
      <strong>{{ info ? '按住查看身分' : '身分同步中…' }}</strong>
      <small>放開後會自動隱藏，避免被旁人看到。</small>
    </template>
  </button>
</template>

<style scoped>
.ww-role-card {
  display: flex;
  min-height: 92px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px;
  border: 1px dashed #cfc8fa;
  border-radius: 14px;
  background: #f7f5ff;
  color: var(--ink);
  font: inherit;
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.ww-role-card.is-revealed {
  border-style: solid;
  background: #eafaf3;
}

.ww-role-card.is-wolf {
  background: #fff0ec;
}

.ww-role-card:disabled {
  opacity: 0.6;
}

.ww-role-card-icon {
  margin-bottom: 2px;
}

.ww-role-card-back {
  width: 32px;
  height: 40px;
  margin-bottom: 2px;
  color: var(--purple-dark);
  fill: #eeebff;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.ww-role-card-back circle {
  fill: currentColor;
}

.ww-role-card strong {
  font-size: 15px;
}

.ww-role-camp {
  color: #77738e;
  font-size: 10px;
  font-weight: 700;
}

.ww-role-card small {
  color: #77738e;
  font-size: 10px;
  line-height: 1.5;
}
</style>
