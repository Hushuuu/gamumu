<script setup lang="ts">
import type { WerewolfRoleId } from '../../../../shared/games/werewolf'

withDefaults(defineProps<{
  roleId: WerewolfRoleId
  size?: number
}>(), {
  size: 24,
})
</script>

<template>
  <svg
    class="ww-role-symbol"
    :class="`ww-role-symbol-${roleId}`"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <circle class="ww-role-symbol-bg" cx="24" cy="24" r="21" />
    <g stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <g v-if="roleId === 'werewolf'">
        <path d="m13 18-3-10 11 6a11 11 0 0 1 6 0l11-6-3 10a12 12 0 0 1 2 6c0 7-5.8 12-13 12S11 31 11 24a12 12 0 0 1 2-6Z" />
        <circle cx="19" cy="24" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="29" cy="24" r="1.3" fill="currentColor" stroke="none" />
        <path d="M21 29c2 1.5 4 1.5 6 0m-10-2-4 1m18-1 4 1" />
      </g>
      <g v-else-if="roleId === 'wolfKing'">
        <path d="m14 13-2-8 7 5 5-7 5 7 7-5-2 8" />
        <path d="m13 20-2-7 10 4a11 11 0 0 1 6 0l10-4-2 7a12 12 0 0 1 2 6c0 7-5.8 12-13 12S11 33 11 26a12 12 0 0 1 2-6Z" />
        <circle cx="19" cy="26" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="29" cy="26" r="1.3" fill="currentColor" stroke="none" />
        <path d="M21 31c2 1.5 4 1.5 6 0" />
      </g>
      <g v-else-if="roleId === 'villager'">
        <circle cx="24" cy="17" r="7" />
        <path d="M10 39c1-8 6-13 14-13s13 5 14 13M18 29l6 5 6-5" />
      </g>
      <g v-else-if="roleId === 'seer'">
        <circle cx="24" cy="24" r="13" />
        <path d="M24 15v18m-9-9h18m-9-15v6m0 18v6" />
        <circle cx="24" cy="24" r="3" fill="currentColor" stroke="none" />
      </g>
      <g v-else-if="roleId === 'witch'">
        <path d="M19 9h10m-8 0v9l-8 11a8 8 0 0 0 7 12h8a8 8 0 0 0 7-12l-8-11V9" />
        <path d="M16 29h16m-10 5 3 3 5-6" />
      </g>
      <g v-else-if="roleId === 'hunter'">
        <path d="M14 9c15 5 18 25 0 30M14 9v30m6-15h18m-7-7 7 7-7 7m-12-12-4-4m4 16-4 4" />
      </g>
      <g v-else-if="roleId === 'guard'">
        <path d="m24 7 13 5v10c0 9-5 15-13 19-8-4-13-10-13-19V12l13-5Z" />
        <path d="m18 24 4 4 8-9" />
      </g>
    </g>
  </svg>
</template>
