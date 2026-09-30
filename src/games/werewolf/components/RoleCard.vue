<script setup lang="ts">
import { computed, ref } from 'vue'
import { WEREWOLF_ROLES, type WerewolfRoleId } from '../../../../shared/games/werewolf'

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
      <span class="ww-role-icon" aria-hidden="true">{{ info.icon }}</span>
      <strong>{{ info.name }}</strong>
      <span class="ww-role-camp">{{ info.camp === 'wolf' ? '狼人陣營' : '好人陣營' }}</span>
      <small>{{ info.description }}</small>
      <small v-if="teammateNames.length">狼人同伴：{{ teammateNames.join('、') }}</small>
    </template>
    <template v-else>
      <span class="ww-role-icon" aria-hidden="true">🂠</span>
      <strong>{{ info ? '按住查看身分' : '身分同步中…' }}</strong>
      <small>放開後會自動隱藏，避免被旁人看到。</small>
    </template>
  </button>
</template>
