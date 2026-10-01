<script setup lang="ts">
import type { AvatarId } from '../../../../shared/avatars'
import { WEREWOLF_ROLES, type WerewolfRoleId } from '../../../../shared/games/werewolf'
import { ROLE_GUESS_DRAG_TYPE, type PickerSeat } from './types'
import WerewolfRoleIcon from './WerewolfRoleIcon.vue'

defineProps<{
  seats: PickerSeat[]
  selectable: string[]
  selected: string | null
  selectedGuessRole: WerewolfRoleId | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [playerId: string]
  'role-drop': [playerId: string, roleId: string]
  'clear-guess': [playerId: string]
}>()

function allowRoleDrop(event: DragEvent): void {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function dropRole(event: DragEvent, playerId: string): void {
  const transfer = event.dataTransfer
  const roleId =
    transfer?.getData(ROLE_GUESS_DRAG_TYPE) ||
    transfer?.getData('text/plain') ||
    ''
  emit('role-drop', playerId, roleId)
}

function avatarUrl(avatarId: AvatarId): string {
  return `${import.meta.env.BASE_URL}avatars/${avatarId}.svg`
}
</script>

<template>
  <ul class="ww-seats">
    <li
      v-for="seat in seats"
      :key="seat.id"
      :class="{ 'is-guess-target': selectedGuessRole !== null }"
      @dragover="allowRoleDrop"
      @drop.prevent.stop="dropRole($event, seat.id)"
    >
      <button
        class="ww-seat"
        :class="{
          'is-dead': !seat.alive,
          'is-selected': selected === seat.id,
          'is-selectable': (selectable.includes(seat.id) && !disabled) || selectedGuessRole !== null,
        }"
        type="button"
        :disabled="selectedGuessRole === null && (disabled || !selectable.includes(seat.id))"
        :aria-pressed="selected === seat.id"
        @click="emit('select', seat.id)"
      >
        <img v-if="seat.avatarId" :src="avatarUrl(seat.avatarId)" alt="" />
        <span v-else class="ww-seat-placeholder" aria-hidden="true">?</span>
        <span class="ww-seat-name">{{ seat.name }}</span>
        <span v-if="!seat.alive" class="ww-tag ww-tag-dead">出局</span>
        <span v-for="tag in seat.tags" :key="tag" class="ww-tag">{{ tag }}</span>
        <span v-if="seat.guessRoleId" class="ww-role-guess">
          <WerewolfRoleIcon :role-id="seat.guessRoleId" :size="15" />
          推測：{{ WEREWOLF_ROLES[seat.guessRoleId].name }}
        </span>
      </button>
      <button
        v-if="seat.guessRoleId"
        class="ww-guess-remove"
        type="button"
        :aria-label="`取消${seat.name}的角色推測`"
        title="取消此玩家的角色推測"
        @click.stop="emit('clear-guess', seat.id)"
      >
        ×
      </button>
    </li>
  </ul>
</template>
