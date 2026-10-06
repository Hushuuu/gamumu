<script setup lang="ts">
import type { AvatarId } from '../../../shared/avatars'

const props = withDefaults(defineProps<{
  player: {
    name: string
    avatarId: AvatarId | null
    isEvil?: boolean
    missionFailed?: boolean
  }
  compact?: boolean
  isLeader?: boolean
  isLakeHolder?: boolean
  isOnTeam?: boolean
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
    <span class="avalon-player-name" :class="{ 'is-evil': props.player.isEvil }">
      {{ props.player.missionFailed ? '*' : '' }}{{ props.player.name }}
    </span>
    <span
      v-if="props.isLeader || props.isLakeHolder || props.isOnTeam"
      class="avalon-player-badges"
    >
      <span v-if="props.isLeader" class="avalon-player-status is-leader" aria-label="目前隊長" title="目前隊長">
        隊長
      </span>
      <span v-if="props.isLakeHolder" class="avalon-player-status is-lake-holder" aria-label="湖中女神標記持有人" title="湖中女神標記">
        湖標記
      </span>
    </span>
  </span>
</template>

<style scoped>
.avalon-player-identity {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
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
  background: #fffdf7;
}

.avalon-player-avatar-placeholder {
  display: grid;
  place-items: center;
  background: #e3f0e7;
  color: #3e7659;
  font-size: 11px;
  font-weight: 800;
}

.avalon-player-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.avalon-player-name.is-evil {
  color: #853f4c;
  font-weight: 700;
}

.avalon-player-badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
}

.avalon-player-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 5px;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 800;
  line-height: 1.3;
  white-space: nowrap;
}

.avalon-player-status.is-leader {
  background: #f5ecd5;
  color: #725820;
}

.avalon-player-status.is-lake-holder {
  background: #e1f1f0;
  color: #367d82;
  animation: avalon-lake-mark-arrive 420ms ease-out both;
}

.avalon-player-status.is-on-team {
  background: #e3f0e7;
  color: #3e7659;
}

.avalon-player-identity.is-compact {
  gap: 4px;
}

.avalon-player-identity.is-compact img,
.avalon-player-identity.is-compact .avalon-player-avatar-placeholder {
  width: 22px;
  height: 22px;
}

.avalon-player-identity.is-compact .avalon-player-status {
  padding: 2px 4px;
}

@keyframes avalon-lake-mark-arrive {
  0% {
    box-shadow: 0 0 0 0 rgb(74 154 160 / 35%);
    transform: scale(0.92);
  }

  70% {
    box-shadow: 0 0 0 5px rgb(74 154 160 / 0%);
    transform: scale(1.04);
  }

  100% {
    box-shadow: 0 0 0 5px rgb(74 154 160 / 0%);
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .avalon-player-status {
    animation: none;
    transition: none;
  }
}
</style>
