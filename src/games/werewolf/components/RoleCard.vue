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
