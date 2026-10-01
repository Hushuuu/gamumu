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

<style scoped>
.ww-seats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ww-seat {
  display: flex;
  width: 100%;
  min-height: 82px;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border: 2px solid transparent;
  border-radius: 12px;
  background: #f7f5ff;
  color: var(--ink);
  font: inherit;
}

.ww-seats > li {
  position: relative;
  min-width: 0;
}

.ww-seat img, .ww-seat-placeholder {
  width: 34px;
  height: 34px;
  border-radius: 50%;
}

.ww-seat-placeholder {
  display: grid;
  place-items: center;
  background: #e5e2f3;
  color: #9895a9;
}

.ww-seat-name {
  max-width: 100%;
  overflow: hidden;
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ww-seat.is-dead {
  opacity: 0.45;
  filter: grayscale(1);
}

.ww-seat.is-selectable {
  cursor: pointer;
  border-color: #d9d3fb;
}

.ww-seats > li.is-guess-target .ww-seat {
  border-style: dashed;
  border-color: var(--purple);
  cursor: copy;
}

.ww-seat.is-selected {
  border-color: var(--purple);
  background: #eeebff;
}

.ww-seat:disabled:not(.is-dead) {
  opacity: 1;
}

.ww-tag-dead {
  background: #e7e6ee;
  color: #6c6982;
}

.ww-role-guess {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #fff;
  color: var(--purple-dark);
  font-size: 9px;
  font-weight: 700;
}

.ww-guess-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  padding: 0;
  border: 1px solid #ded9f1;
  border-radius: 50%;
  background: #fff;
  color: #77738e;
  font: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.ww-guess-remove:hover, .ww-guess-remove:focus-visible {
  border-color: var(--purple);
  background: #eeebff;
  color: var(--purple-dark);
}
</style>
