<script setup lang="ts">
import type { AvatarId } from '../../../shared/avatars'

const props = withDefaults(defineProps<{
  player: {
    name: string
    avatarId: AvatarId | null
  }
  compact?: boolean
}>(), {
  compact: false,
})

function avatarUrl(avatarId: AvatarId): string {
  return `${import.meta.env.BASE_URL}avatars/${avatarId}.svg`
}
</script>

<template>
  <span class="avalon-player-identity" :class="{ 'is-compact': props.compact }">
    <img v-if="props.player.avatarId" :src="avatarUrl(props.player.avatarId)" alt="" />
    <span v-else class="avalon-player-avatar-placeholder" aria-hidden="true">
      {{ props.player.name.slice(0, 1) || '?' }}
    </span>
    <span class="avalon-player-name">{{ props.player.name }}</span>
  </span>
</template>

<style scoped>
.avalon-player-identity {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  vertical-align: middle;
}

.avalon-player-identity img,
.avalon-player-avatar-placeholder {
  display: block;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50%;
}

.avalon-player-identity img {
  object-fit: cover;
  background: #fff;
}

.avalon-player-avatar-placeholder {
  display: grid;
  place-items: center;
  background: #eeebfa;
  color: #675ca4;
  font-size: 11px;
  font-weight: 800;
}

.avalon-player-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.avalon-player-identity.is-compact {
  gap: 5px;
}

.avalon-player-identity.is-compact img,
.avalon-player-identity.is-compact .avalon-player-avatar-placeholder {
  width: 22px;
  height: 22px;
}
</style>
