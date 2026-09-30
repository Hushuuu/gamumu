<script setup lang="ts">
import type { AvatarId } from '../../../../shared/avatars'
import type { PickerSeat } from './types'

defineProps<{
  seats: PickerSeat[]
  selectable: string[]
  selected: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [playerId: string]
}>()

function avatarUrl(avatarId: AvatarId): string {
  return `${import.meta.env.BASE_URL}avatars/${avatarId}.svg`
}
</script>

<template>
  <ul class="ww-seats">
    <li v-for="seat in seats" :key="seat.id">
      <button
        class="ww-seat"
        :class="{
          'is-dead': !seat.alive,
          'is-selected': selected === seat.id,
          'is-selectable': selectable.includes(seat.id) && !disabled,
        }"
        type="button"
        :disabled="disabled || !selectable.includes(seat.id)"
        :aria-pressed="selected === seat.id"
        @click="emit('select', seat.id)"
      >
        <img v-if="seat.avatarId" :src="avatarUrl(seat.avatarId)" alt="" />
        <span v-else class="ww-seat-placeholder" aria-hidden="true">?</span>
        <span class="ww-seat-name">{{ seat.name }}</span>
        <span v-if="!seat.alive" class="ww-tag ww-tag-dead">出局</span>
        <span v-for="tag in seat.tags" :key="tag" class="ww-tag">{{ tag }}</span>
      </button>
    </li>
  </ul>
</template>
