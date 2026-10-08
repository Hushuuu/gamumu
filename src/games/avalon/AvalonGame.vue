<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  AVALON_PRIVATE_EVENT,
  AVALON_ROLES,
  getAvalonRoleCounts,
  isAvalonPrivateState,
  type AvalonKnowledge,
  type AvalonMissionCard,
  type AvalonPhase,
  type AvalonPrivateState,
  type AvalonRoleId,
} from '../../../shared/games/avalon'
import type { GameEvent, GameView, PlayerView } from '../../../shared/protocol'
import AvalonPlayerIdentity from './AvalonPlayerIdentity.vue'
import {
  avalonAssetUrl,
  avalonCampIconUrl,
  avalonMissionIconUrl,
  avalonPhaseIconUrl,
  avalonRoleIconUrl,
} from './visualAssets'

const props = defineProps<{
  game: GameView
  gameEvent: GameEvent | null
  players: PlayerView[]
  playerId: string
  gameName: string
  isHost: boolean
  canInteract: boolean
}>()

const emit = defineEmits<{
  'game-action': [action: string, payload: Record<string, unknown>]
}>()

const PHASE_TITLES: Record<AvalonPhase, string> = {
  'role-reveal': '確認身分',
  'team-selection': '隊長組隊',
  'team-vote': '隊伍投票',
  mission: '執行任務',
  'lake-check': '湖中女神查驗',
  assassination: '刺殺梅林',
  finished: '遊戲結束',
}
const ROLE_GUESS_DRAG_TYPE = 'application/x-gamumu-avalon-role-guess'

type AvalonHistoryTab = 'missions' | 'votes'

const privateState = ref<AvalonPrivateState | null>(null)
const hasAnimatedRoleCard = ref(false)
const animateRoleCard = ref(false)
const roleCardRevealed = ref(false)
const selectedHistoryTab = ref<AvalonHistoryTab>('missions')
const missionHistoryTabButton = ref<HTMLButtonElement | null>(null)
const voteHistoryTabButton = ref<HTMLButtonElement | null>(null)
const selectedTeamIds = ref<string[]>([])
const selectedLakeTargetId = ref('')
const selectedAssassinationTargetId = ref('')
const selectedGuessRole = ref<AvalonRoleId | null>(null)
const roleGuesses = ref<Partial<Record<string, AvalonRoleId>>>({})
let roleRevealPointerId: number | null = null
let roleRevealKeyDown = false
let suppressRoleRevealClick = false

function resetRoleCardReveal(): void {
  roleRevealPointerId = null
  roleRevealKeyDown = false
  roleCardRevealed.value = false
}

function startRoleCardReveal(event: PointerEvent): void {
  if (event.button !== 0 || roleRevealPointerId !== null) {
    return
  }

  event.preventDefault()
  roleRevealPointerId = event.pointerId
  roleCardRevealed.value = true
  if (event.currentTarget instanceof HTMLButtonElement) {
    event.currentTarget.setPointerCapture(event.pointerId)
  }
}

function endRoleCardReveal(event: PointerEvent): void {
  if (roleRevealPointerId !== event.pointerId) {
    return
  }

  resetRoleCardReveal()
}

function handleRoleRevealKeydown(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') {
    return
  }

  event.preventDefault()
  roleRevealKeyDown = true
  roleCardRevealed.value = true
}

function handleRoleRevealKeyup(event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') {
    return
  }

  event.preventDefault()
  roleRevealKeyDown = false
  roleCardRevealed.value = false
  suppressRoleRevealClick = true
  window.setTimeout(() => {
    suppressRoleRevealClick = false
  }, 0)
}

function handleRoleRevealClick(event: MouseEvent): void {
  if (event.detail !== 0 || roleRevealKeyDown || suppressRoleRevealClick) {
    return
  }

  roleCardRevealed.value = !roleCardRevealed.value
}

function playerInfoOf(playerId: string) {
  const player = props.players.find((candidate) => candidate.id === playerId)
  return {
    id: playerId,
    name: player?.name ?? '已離開的玩家',
    avatarId: player?.avatarId ?? null,
  }
}

const view = computed(() => (props.game.gameId === 'avalon' ? props.game : null))
const currentPrivateState = computed(() => {
  const state = privateState.value
  return state && view.value && state.stateVersion === view.value.stateVersion ? state : null
})
const displayPrivateState = computed(() => {
  const state = privateState.value
  return state && view.value && state.stateVersion <= view.value.stateVersion ? state : null
})
const playerRows = computed(() => {
  const current = view.value
  if (!current) {
    return []
  }
  return current.seatIds.map((id) => ({
    ...playerInfoOf(id),
    guessRoleId: roleGuesses.value[id] ?? null,
  }))
})
const roleCountEntries = computed(() => {
  const current = view.value
  if (!current) {
    return []
  }

  const roleCounts = getAvalonRoleCounts(current.seatIds.length, current.settings)
  return roleCounts
    ? Object.values(AVALON_ROLES)
      .map((role) => ({ ...role, count: roleCounts[role.id] }))
      .filter((role) => role.count > 0)
    : []
})
const isCurrentLeader = computed(() => view.value?.leaderId === props.playerId)
const isLakeHolder = computed(() => view.value?.lakeHolderId === props.playerId)
const isOnMissionTeam = computed(() => view.value?.teamIds.includes(props.playerId) ?? false)
const canProposeTeam = computed(() => Boolean(
  props.canInteract &&
  view.value?.phase === 'team-selection' &&
  isCurrentLeader.value &&
  selectedTeamIds.value.length === view.value.teamSize,
))
const teamNames = computed(() => {
  const current = view.value
  if (!current) {
    return []
  }
  return current.teamIds.map(playerInfoOf)
})
const publicMarkers = computed(() => {
  const current = view.value
  if (!current) {
    return []
  }

  return [
    //{ label: '首任隊長', player: playerInfoOf(current.initialLeaderId) },
    { label: '目前隊長', player: playerInfoOf(current.leaderId) },
    ...(current.lakeHolderId
      ? [{ label: '湖中女神', player: playerInfoOf(current.lakeHolderId) }]
      : []),
  ]
})
const voteHistoryRows = computed(() => {
  const current = view.value
  return current
    ? current.voteHistory.map((vote, index) => ({
      key: `${vote.missionNumber}-${index}`,
      vote,
      leader: playerInfoOf(vote.leaderId),
      team: vote.teamIds.map(playerInfoOf),
    }))
    : []
})
const missionResultRows = computed(() => {
  const current = view.value
  return current
    ? current.missions.map((mission) => ({
      mission,
      leader: playerInfoOf(mission.leaderId),
      team: mission.teamIds.map(playerInfoOf),
    }))
    : []
})
const lakeHolderInfo = computed(() => {
  const lakeHolderId = view.value?.lakeHolderId
  return lakeHolderId ? playerInfoOf(lakeHolderId) : null
})
const currentPhaseTitle = computed(() => {
  return view.value ? PHASE_TITLES[view.value.phase] : ''
})
const missionRoute = computed(() => {
  const current = view.value
  return Array.from({ length: 5 }, (_, index) => {
    const missionNumber = index + 1
    const mission = current?.missions.find((entry) => entry.missionNumber === missionNumber)
    return {
      missionNumber,
      outcome: mission?.outcome ?? null,
      isCurrent: Boolean(
        current &&
        current.missionNumber === missionNumber &&
        current.phase !== 'finished',
      ),
    }
  })
})
const phaseDescription = computed(() => {
  const current = view.value
  if (!current) {
    return ''
  }
  switch (current.phase) {
    case 'role-reveal':
      return '先確認自己的角色與私人資訊；所有人確認後，首任隊長開始組隊。'
    case 'team-selection':
      return isCurrentLeader.value
        ? `你是隊長，請選出 ${current.teamSize} 位玩家組成第 ${current.missionNumber} 個任務隊伍。`
        : `等待目前隊長組隊；任務需要 ${current.teamSize} 位玩家。`
    case 'team-vote':
      return '所有玩家私下投票；全員完成後才會同時公布結果。'
    case 'mission':
      return isOnMissionTeam.value
        ? '任務成員私下選擇任務牌；正義陣營只能選成功。'
        : '任務隊伍正在私下出牌；系統只會公布成功與失敗牌數。'
    case 'lake-check':
      return isLakeHolder.value
        ? '選擇一位從未持有過女神標記的玩家，私下查看其忠誠陣營後傳遞標記。'
        : '等待湖中女神持有人完成查驗。'
    case 'assassination':
      return currentPrivateState.value?.roleId === 'assassin'
        ? '邪惡陣營討論後，由你指定一位玩家刺殺。'
        : '正義陣營完成三個任務；邪惡陣營正在討論刺殺目標。'
    case 'finished':
      return '本局已結束，所有角色身分已公開。'
  }
})
const availableLakeTargets = computed(() => {
  const current = view.value
  return current
    ? playerRows.value.filter((player) => !current.lakeVisitedIds.includes(player.id))
    : []
})
const knownPlayerRows = computed(() => {
  const state = displayPrivateState.value
  return (state?.knownPlayers ?? []).map((knownPlayer) => ({
    ...knownPlayer,
    ...playerInfoOf(knownPlayer.playerId),
  }))
})
const roleInfo = computed(() => {
  const roleId = displayPrivateState.value?.roleId
  return roleId ? AVALON_ROLES[roleId] : null
})
const campLabel = computed(() =>
  displayPrivateState.value?.camp === 'good' ? '正義陣營' : '邪惡陣營',
)

function handleHistoryTabKeydown(event: KeyboardEvent, currentTab: AvalonHistoryTab): void {
  let nextTab: AvalonHistoryTab | null = null
  if (event.key === 'ArrowRight') {
    nextTab = currentTab === 'missions' ? 'votes' : 'missions'
  } else if (event.key === 'ArrowLeft') {
    nextTab = currentTab === 'votes' ? 'missions' : 'votes'
  } else if (event.key === 'Home') {
    nextTab = 'missions'
  } else if (event.key === 'End') {
    nextTab = 'votes'
  }

  if (!nextTab) {
    return
  }

  event.preventDefault()
  selectedHistoryTab.value = nextTab
  void nextTick(() => {
    const button = nextTab === 'missions'
      ? missionHistoryTabButton.value
      : voteHistoryTabButton.value
    button?.focus()
  })
}

watch(
  [() => view.value?.phase, roleInfo],
  ([phase, role], [previousPhase]) => {
    if (phase === 'role-reveal' && previousPhase !== 'role-reveal') {
      hasAnimatedRoleCard.value = false
      animateRoleCard.value = false
    }

    if (!role) {
      animateRoleCard.value = false
      return
    }

    if (!hasAnimatedRoleCard.value) {
      hasAnimatedRoleCard.value = true
      animateRoleCard.value = true
    }
  },
)

watch(() => view.value?.phase, resetRoleCardReveal)

watch(
  [() => view.value?.phase, () => view.value?.stateVersion],
  ([phase, stateVersion], [previousPhase, previousStateVersion]) => {
    if (
      (phase === 'role-reveal' && previousPhase === 'finished') ||
      (
        stateVersion !== undefined &&
        previousStateVersion !== undefined &&
        stateVersion < previousStateVersion
      )
    ) {
      resetRoleCardReveal()
      privateState.value = null
      hasAnimatedRoleCard.value = false
      animateRoleCard.value = false
    }
  },
)

watch(() => props.gameEvent, (event) => {
  if (
    event?.gameId === 'avalon' &&
    event.event === AVALON_PRIVATE_EVENT &&
    isAvalonPrivateState(event.payload)
  ) {
    privateState.value = event.payload
  }
}, { immediate: true })

watch(
  [
    () => view.value?.phase,
    () => view.value?.leaderId,
    () => view.value?.missionNumber,
  ],
  () => {
    selectedTeamIds.value = [...(view.value?.teamIds ?? [])]
    selectedLakeTargetId.value = ''
    selectedAssassinationTargetId.value = ''
  },
  { immediate: true },
)

function selectGuessRole(roleId: AvalonRoleId): void {
  selectedGuessRole.value = selectedGuessRole.value === roleId ? null : roleId
}

function startRoleGuessDrag(event: DragEvent, roleId: AvalonRoleId): void {
  const transfer = event.dataTransfer
  if (!transfer) {
    return
  }

  selectedGuessRole.value = roleId
  transfer.effectAllowed = 'copy'
  transfer.setData(ROLE_GUESS_DRAG_TYPE, roleId)
  transfer.setData('text/plain', roleId)
}

function assignRoleGuess(playerId: string, roleId: string): boolean {
  const guessableRole = roleCountEntries.value.find((role) => role.id === roleId)
  if (!guessableRole || !view.value?.seatIds.includes(playerId)) {
    return false
  }

  roleGuesses.value[playerId] = guessableRole.id
  selectedGuessRole.value = null
  return true
}

function assignSelectedRoleGuess(playerId: string): void {
  if (selectedGuessRole.value) {
    assignRoleGuess(playerId, selectedGuessRole.value)
  }
}

function allowRoleDrop(event: DragEvent): void {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function dropRoleGuess(event: DragEvent, playerId: string): void {
  const transfer = event.dataTransfer
  const roleId =
    transfer?.getData(ROLE_GUESS_DRAG_TYPE) ||
    transfer?.getData('text/plain') ||
    ''
  assignRoleGuess(playerId, roleId)
}

function clearRoleGuess(playerId: string): void {
  delete roleGuesses.value[playerId]
}

function toggleTeamPlayer(playerId: string): void {
  if (!props.canInteract || !isCurrentLeader.value || view.value?.phase !== 'team-selection') {
    return
  }
  if (selectedTeamIds.value.includes(playerId)) {
    selectedTeamIds.value = selectedTeamIds.value.filter((id) => id !== playerId)
    return
  }
  if (selectedTeamIds.value.length < (view.value?.teamSize ?? 0)) {
    selectedTeamIds.value = [...selectedTeamIds.value, playerId]
  }
}

function proposeTeam(): void {
  if (!canProposeTeam.value) {
    return
  }
  emit('game-action', 'propose-team', { teamIds: [...selectedTeamIds.value] })
}

function voteTeam(approve: boolean): void {
  if (!props.canInteract || view.value?.phase !== 'team-vote') {
    return
  }
  emit('game-action', 'vote-team', { approve })
}

function submitMissionCard(card: AvalonMissionCard): void {
  if (!props.canInteract || view.value?.phase !== 'mission' || !isOnMissionTeam.value) {
    return
  }
  emit('game-action', 'submit-mission', { card })
}

function checkLake(): void {
  if (
    !props.canInteract ||
    view.value?.phase !== 'lake-check' ||
    !isLakeHolder.value ||
    !selectedLakeTargetId.value
  ) {
    return
  }
  emit('game-action', 'check-lake', { targetId: selectedLakeTargetId.value })
}

function assassinate(): void {
  if (
    !props.canInteract ||
    view.value?.phase !== 'assassination' ||
    currentPrivateState.value?.roleId !== 'assassin' ||
    !selectedAssassinationTargetId.value
  ) {
    return
  }
  emit('game-action', 'assassinate', { targetId: selectedAssassinationTargetId.value })
}

function knowledgeLabel(knowledge: AvalonKnowledge): string {
  return knowledge === 'evil' ? '確認為邪惡陣營' : '梅林或莫甘娜'
}
</script>

<template>
  <div v-if="view" class="avalon-game">
    <header class="avalon-game-heading">
      <div class="avalon-game-brand">
        <img class="avalon-brand-crest" :src="avalonAssetUrl('avalon-crest.svg')" alt="" />
        <div class="avalon-game-title">
          <p class="eyebrow">隱藏身分 · 任務推理</p>
          <h2>{{ gameName }}</h2>
        </div>
      </div>
      <div class="avalon-current-phase">
        <img :src="avalonPhaseIconUrl(view.phase)" alt="" />
        <span>{{ currentPhaseTitle }}</span>
      </div>
      <p class="avalon-phase-summary">{{ phaseDescription }}</p>
      <div class="avalon-public-markers">
        <span v-for="marker in publicMarkers" :key="marker.label" class="avalon-public-marker">
          <small>{{ marker.label }}</small>
          <AvalonPlayerIdentity
            :player="marker.player"
            compact
            :is-leader="marker.label === '目前隊長'"
            :is-lake-holder="marker.label === '湖中女神'"
          />
        </span>
      </div>
    </header>

    <section
      v-if="roleInfo"
      class="avalon-role-card"
      :class="[
        `is-${roleCardRevealed ? roleInfo.camp : 'masked'}`,
        { 'is-revealing': animateRoleCard },
      ]"
    >
      <div
        v-show="roleCardRevealed"
        class="avalon-role-card-content"
        :aria-hidden="!roleCardRevealed"
      >
        <div class="avalon-role-card-topline">
          <span class="avalon-camp-badge" :class="`is-${roleInfo.camp}`">
            <img :src="avalonCampIconUrl(roleInfo.camp)" alt="" />
            {{ campLabel }}
          </span>
          <span v-if="view.lakeHolderId === playerId" class="avalon-lake-badge">
            <img :src="avalonPhaseIconUrl('lake-check')" alt="" />
            湖中女神標記
          </span>
        </div>
        <div class="avalon-role-card-intro">
          <img class="avalon-role-icon" :src="avalonRoleIconUrl(roleInfo.id)" alt="" />
          <div>
            <h3>{{ roleInfo.name }}</h3>
            <p>{{ roleInfo.description }}</p>
          </div>
        </div>
        <div v-if="knownPlayerRows.length" class="avalon-known-players">
          <strong>已獲得資訊</strong>
          <ul>
            <li v-for="knownPlayer in knownPlayerRows" :key="knownPlayer.playerId">
              <AvalonPlayerIdentity :player="knownPlayer" compact />
              <small>{{ knowledgeLabel(knownPlayer.knowledge) }}</small>
            </li>
          </ul>
        </div>
        <div v-if="displayPrivateState?.lakeResults.length" class="avalon-known-players">
          <strong>查驗資訊</strong>
          <ul>
            <li v-for="result in displayPrivateState.lakeResults" :key="`${result.missionNumber}-${result.targetId}`">
              <AvalonPlayerIdentity :player="playerInfoOf(result.targetId)" compact />
              <small>{{ result.camp === 'good' ? '好人' : '邪惡' }} · 第 {{ result.missionNumber }} 個任務後</small>
            </li>
          </ul>
        </div>
      </div>
      <button
        class="avalon-role-card-hold"
        :class="{ 'is-revealed': roleCardRevealed }"
        type="button"
        :aria-label="roleCardRevealed
          ? '身分已顯示，放開或再次啟用以隱藏'
          : '按住或啟用以查看身分'"
        :aria-pressed="roleCardRevealed"
        @pointerdown="startRoleCardReveal"
        @pointerup="endRoleCardReveal"
        @pointercancel="endRoleCardReveal"
        @lostpointercapture="endRoleCardReveal"
        @keydown="handleRoleRevealKeydown"
        @keyup="handleRoleRevealKeyup"
        @blur="resetRoleCardReveal"
        @click="handleRoleRevealClick"
      >
        <span v-show="!roleCardRevealed">按住查看身分</span>
      </button>
    </section>
    <section v-else class="avalon-role-card avalon-role-loading" aria-live="polite">
      正在接收資訊……
    </section>

        <ol class="avalon-mission-track" aria-label="前往王國的五個任務路線">
      <li
        v-for="mission in missionRoute"
        :key="mission.missionNumber"
        class="avalon-mission-marker"
        :class="{
          'is-current': mission.isCurrent,
          'is-success': mission.outcome === 'success',
          'is-failure': mission.outcome === 'failure',
        }"
        :aria-label="`任務 ${mission.missionNumber}：${
          mission.outcome === 'success'
            ? '成功'
            : mission.outcome === 'failure'
              ? '失敗'
              : mission.isCurrent
                ? '進行中'
                : '尚未開始'
        }`"
      >
        <span class="avalon-mission-node">
          <img
            v-if="mission.outcome"
            :src="avalonMissionIconUrl(mission.outcome)"
            alt=""
          />
          <span v-else>{{ mission.missionNumber }}</span>
        </span>
        <strong>任務 {{ mission.missionNumber }}</strong>
        <span class="avalon-mission-status">
          {{
            mission.outcome === 'success'
              ? '成功'
              : mission.outcome === 'failure'
                ? '失敗'
                : mission.isCurrent
                  ? '進行中'
                  : '待命'
          }}
        </span>
      </li>
    </ol>

    <section class="avalon-stage" :class="`is-${view.phase}`" aria-live="polite">
      <div class="avalon-stage-banner" aria-hidden="true">
        <img :src="avalonPhaseIconUrl(view.phase)" alt="" />
        <span>{{ currentPhaseTitle }}</span>
      </div>
      <template v-if="view.phase === 'role-reveal'">
        <h3>確認你的身分</h3>
        <p>角色與提示只會顯示給你。請在查看完畢後確認，所有玩家完成確認才會開始第一個任務。</p>
        <p class="avalon-role-ready-count">
          已確認 <strong>{{ view.readyIds.length }} / {{ view.seatIds.length }}</strong> 位玩家
        </p>
        <button
          class="button button-primary avalon-action-button"
          type="button"
          :disabled="!canInteract || !currentPrivateState || view.readyIds.includes(playerId)"
          @click="emit('game-action', 'confirm-role', {})"
        >
          {{ view.readyIds.includes(playerId) ? '已確認身分' : '我已確認身分' }}
        </button>
      </template>

      <template v-else-if="view.phase === 'team-selection'">
        <h3>第 {{ view.missionNumber }} 個任務 · 選出 {{ view.teamSize }} 人</h3>
        <p v-if="isCurrentLeader">點選玩家組成任務隊伍；選好後送出提案，所有人再投票。</p>
        <p v-else>任務需要 {{ view.teamSize }} 位玩家；目前隊長請見上方標記。</p>
        <div class="avalon-player-grid">
          <button
            v-for="player in playerRows"
            :key="player.id"
            class="avalon-player-button"
            :class="{ 'is-selected': selectedTeamIds.includes(player.id) }"
            type="button"
            :aria-pressed="selectedTeamIds.includes(player.id)"
            :disabled="!canInteract || !isCurrentLeader"
            @click="toggleTeamPlayer(player.id)"
          >
            <AvalonPlayerIdentity
              :player="player"
              compact
              :is-leader="player.id === view.leaderId"
              :is-lake-holder="player.id === view.lakeHolderId"
              :is-on-team="selectedTeamIds.includes(player.id)"
            />
          </button>
        </div>
        <div v-if="isCurrentLeader" class="avalon-action-row">
          <span>已選 {{ selectedTeamIds.length }} / {{ view.teamSize }} 人</span>
          <button class="button button-primary" type="button" :disabled="!canProposeTeam" @click="proposeTeam">
            提出隊伍
          </button>
        </div>
        <p v-if="view.rejectedTeams" class="avalon-warning" role="status">
          本任務已有 {{ view.rejectedTeams }} 次隊伍遭否決；連續 5 次否決將由邪惡陣營獲勝。
        </p>
      </template>

      <template v-else-if="view.phase === 'team-vote'">
        <h3>任務 {{ view.missionNumber }}</h3>
        <ul class="avalon-team-list">
          <li v-for="player in teamNames" :key="player.id">
            <AvalonPlayerIdentity
              :player="player"
              compact
              :is-leader="player.id === view.leaderId"
              :is-lake-holder="player.id === view.lakeHolderId"
              is-on-team
            />
          </li>
        </ul>
        <p>目前 {{ view.votesSubmitted }} / {{ view.seatIds.length }} 人已投票</p>
        <div class="avalon-action-row avalon-vote-actions">
          <button
            class="button button-primary"
            type="button"
            :disabled="!canInteract"
            :aria-pressed="displayPrivateState?.voteSelection === true"
            @click="voteTeam(true)"
          >
            同意
          </button>
          <button
            class="button button-secondary"
            type="button"
            :disabled="!canInteract"
            :aria-pressed="displayPrivateState?.voteSelection === false"
            @click="voteTeam(false)"
          >
            反對
          </button>
        </div>
        <p v-if="displayPrivateState?.voteSelection !== null && displayPrivateState" class="avalon-private-status">
          你已{{ displayPrivateState.voteSelection ? '同意' : '反對' }}；在全員投票前可以修改。
        </p>
      </template>

      <template v-else-if="view.phase === 'mission'">
        <h3>第 {{ view.missionNumber }} 個任務正在執行</h3>
        <ul class="avalon-team-list">
          <li v-for="player in teamNames" :key="player.id">
            <AvalonPlayerIdentity
              :player="player"
              compact
              :is-leader="player.id === view.leaderId"
              :is-lake-holder="player.id === view.lakeHolderId"
              is-on-team
            />
          </li>
        </ul>
        <p>{{ view.missionCardsSubmitted }} / {{ view.teamIds.length }} 位隊員已出牌，結果會在全員出牌後公布。</p>
        <div v-if="isOnMissionTeam" class="avalon-action-row avalon-mission-actions">
          <button
            class="button button-primary"
            type="button"
            :disabled="!canInteract || !currentPrivateState"
            :aria-pressed="currentPrivateState?.missionSelection === 'success'"
            @click="submitMissionCard('success')"
          >
            出任務成功
          </button>
          <button
            v-if="currentPrivateState?.camp === 'evil'"
            class="button button-secondary"
            type="button"
            :disabled="!canInteract"
            :aria-pressed="currentPrivateState?.missionSelection === 'fail'"
            @click="submitMissionCard('fail')"
          >
            出任務失敗
          </button>
        </div>
        <p v-if="isOnMissionTeam && currentPrivateState?.missionSelection" class="avalon-private-status">
          你已出牌；在所有隊員出牌前可以修改。
        </p>
      </template>

      <template v-else-if="view.phase === 'lake-check'">
        <h3>
          湖中女神標記由
          <AvalonPlayerIdentity v-if="lakeHolderInfo" :player="lakeHolderInfo" compact />
          持有
        </h3>
        <template v-if="isLakeHolder">
          <p>選擇一位未曾持有標記的玩家。查驗只會告訴你對方是好人或壞人，結果不會公開。</p>
          <div class="avalon-player-grid">
            <button
              v-for="player in availableLakeTargets"
              :key="player.id"
              class="avalon-player-button"
              :class="{ 'is-selected': selectedLakeTargetId === player.id }"
              type="button"
              :aria-pressed="selectedLakeTargetId === player.id"
              :disabled="!canInteract"
              @click="selectedLakeTargetId = player.id"
            >
              <AvalonPlayerIdentity
                :player="player"
                compact
                :is-leader="player.id === view.leaderId"
                :is-lake-holder="player.id === view.lakeHolderId"
              />
              <strong>{{ selectedLakeTargetId === player.id ? '已選' : '選擇' }}</strong>
            </button>
          </div>
          <button
            class="button button-primary avalon-action-button"
            type="button"
            :disabled="!canInteract || !selectedLakeTargetId"
            @click="checkLake"
          >
            查驗並傳遞標記
          </button>
        </template>
        <p v-else>查驗完成後，標記會交給被查驗的玩家；只有持有人會看到查驗結果。</p>
      </template>

      <template v-else-if="view.phase === 'assassination'">
        <h3>正義陣營完成三個任務</h3>
        <p>邪惡陣營討論後由刺客選擇一名玩家；若刺中梅林，邪惡陣營反敗為勝。</p>
        <template v-if="currentPrivateState?.roleId === 'assassin'">
          <div class="avalon-player-grid">
            <button
              v-for="player in playerRows"
              :key="player.id"
              class="avalon-player-button"
              :class="{ 'is-selected': selectedAssassinationTargetId === player.id }"
              type="button"
              :aria-pressed="selectedAssassinationTargetId === player.id"
              :disabled="!canInteract"
              @click="selectedAssassinationTargetId = player.id"
            >
              <AvalonPlayerIdentity
                :player="player"
                compact
                :is-leader="player.id === view.leaderId"
                :is-lake-holder="player.id === view.lakeHolderId"
              />
            </button>
          </div>
          <button
            class="button button-primary avalon-action-button"
            type="button"
            :disabled="!canInteract || !selectedAssassinationTargetId"
            @click="assassinate"
          >
            確認刺殺
          </button>
        </template>
        <p v-else>等待邪惡陣營完成討論並公布刺殺目標。</p>
      </template>
    </section>

    <section
      v-if="view.voteHistory.length || view.missions.length"
      class="avalon-history-card avalon-history-tabs-card"
      aria-label="遊戲紀錄"
    >
      <div class="avalon-history-tablist" role="tablist" aria-label="遊戲紀錄">
        <button
          id="avalon-missions-tab"
          ref="missionHistoryTabButton"
          class="avalon-history-tab"
          :class="{ 'is-active': selectedHistoryTab === 'missions' }"
          type="button"
          role="tab"
          aria-controls="avalon-missions-panel"
          :aria-selected="selectedHistoryTab === 'missions'"
          :tabindex="selectedHistoryTab === 'missions' ? 0 : -1"
          @click="selectedHistoryTab = 'missions'"
          @keydown="handleHistoryTabKeydown($event, 'missions')"
        >
          <img :src="avalonPhaseIconUrl('mission')" alt="" />
          任務結果
          <span class="avalon-history-tab-count">{{ missionResultRows.length }}</span>
        </button>
        <button
          id="avalon-votes-tab"
          ref="voteHistoryTabButton"
          class="avalon-history-tab"
          :class="{ 'is-active': selectedHistoryTab === 'votes' }"
          type="button"
          role="tab"
          aria-controls="avalon-votes-panel"
          :aria-selected="selectedHistoryTab === 'votes'"
          :tabindex="selectedHistoryTab === 'votes' ? 0 : -1"
          @click="selectedHistoryTab = 'votes'"
          @keydown="handleHistoryTabKeydown($event, 'votes')"
        >
          <img :src="avalonPhaseIconUrl('team-vote')" alt="" />
          隊伍投票紀錄
          <span class="avalon-history-tab-count">{{ voteHistoryRows.length }}</span>
        </button>
      </div>

      <section
        id="avalon-missions-panel"
        class="avalon-history-panel"
        role="tabpanel"
        aria-labelledby="avalon-missions-tab"
        tabindex="0"
        v-show="selectedHistoryTab === 'missions'"
      >
        <ul v-if="missionResultRows.length" class="avalon-mission-results">
          <li
            v-for="entry in missionResultRows"
            :key="entry.mission.missionNumber"
            :class="entry.mission.outcome === 'success' ? 'is-success' : 'is-failure'"
          >
            <div>
              <strong class="avalon-mission-result-heading">
                <img :src="avalonMissionIconUrl(entry.mission.outcome)" alt="" />
                <span>
                  任務 {{ entry.mission.missionNumber }} ·
                  {{ entry.mission.outcome === 'success' ? '成功' : '失敗' }}
                </span>
              </strong>
              <small class="avalon-mission-result-players">
                <span>隊長</span>
                <AvalonPlayerIdentity :player="entry.leader" compact />
              </small>
              <small>
                <span>隊伍 &nbsp;</span>
                <AvalonPlayerIdentity
                  v-for="player in entry.team"
                  :key="player.id"
                  :player="player"
                  compact
                  is-on-team
                />
              </small>
            </div>
            <span class="avalon-mission-result-counts">
              {{ entry.mission.successCount }} 成功 / {{ entry.mission.failCount }} 失敗
            </span>
          </li>
        </ul>
        <p v-else class="avalon-history-empty">任務結果公布後會顯示在這裡。</p>
      </section>

      <section
        id="avalon-votes-panel"
        class="avalon-history-panel"
        role="tabpanel"
        aria-labelledby="avalon-votes-tab"
        tabindex="0"
        v-show="selectedHistoryTab === 'votes'"
      >
        <ol v-if="voteHistoryRows.length" class="avalon-vote-history">
          <li v-for="entry in voteHistoryRows" :key="entry.key">
            <strong class="avalon-vote-history-heading">
              <span>任務 {{ entry.vote.missionNumber }} ·</span>
              <AvalonPlayerIdentity :player="entry.leader" compact />
              <span>提案</span>
              <span
                class="avalon-vote-stamp"
                :class="entry.vote.accepted ? 'is-accepted' : 'is-rejected'"
              >
                <span aria-hidden="true">{{ entry.vote.accepted ? '✓' : '×' }}</span>
                {{ entry.vote.accepted ? '通過' : '否決' }}
              </span>
            </strong>
            <small class="avalon-vote-history-team">
              <span>隊伍：</span>
              <AvalonPlayerIdentity
                v-for="player in entry.team"
                :key="player.id"
                :player="player"
                compact
                is-on-team
              />
              <span>· {{ entry.vote.approveCount }} 同意 / {{ entry.vote.rejectCount }} 反對</span>
            </small>
            <details>
              <summary>查看投票</summary>
              <ul class="avalon-vote-list">
                <li v-for="player in playerRows" :key="player.id">
                  <AvalonPlayerIdentity :player="player" compact />
                  <strong :class="entry.vote.votes[player.id] ? 'is-approve' : 'is-reject'">
                    {{ entry.vote.votes[player.id] ? '同意' : '反對' }}
                  </strong>
                </li>
              </ul>
            </details>
          </li>
        </ol>
        <p v-else class="avalon-history-empty">隊伍提案投票結果公布後會顯示在這裡。</p>
      </section>
    </section>

    <section class="avalon-history-card avalon-role-guess-card" aria-label="本局角色配置與推測">
      <div class="avalon-role-guess-heading">
        <div>
          <h3>本局角色配置（{{ view.seatIds.length }} 人）</h3>
          <p>點選角色卡後可選擇玩家推測；推測只會呈現在你的畫面。</p>
        </div>
      </div>
      <div class="avalon-role-guess-roles">
        <button
          v-for="role in roleCountEntries"
          :key="role.id"
          class="avalon-role-guess-option"
          :class="[`is-${role.camp}`, { 'is-selected': selectedGuessRole === role.id }]"
          type="button"
          :aria-pressed="selectedGuessRole === role.id"
          :aria-label="`選擇${role.name}角色卡，本局有 ${role.count} 位`"
          draggable="true"
          @click="selectGuessRole(role.id)"
          @dragstart="startRoleGuessDrag($event, role.id)"
        >
          <img :src="avalonRoleIconUrl(role.id)" alt="" />
          <span class="avalon-role-guess-camp">{{ role.camp === 'good' ? '正義' : '邪惡' }}</span>
          <span>{{ role.name }}</span>
          <strong>× {{ role.count }}</strong>
        </button>
      </div>
      <p class="avalon-guess-status" role="status">
        {{
          selectedGuessRole
            ? `已選擇${AVALON_ROLES[selectedGuessRole].name}，點選或拖曳至玩家以新增推測。`
            : '選擇角色卡後點選玩家，或直接拖曳角色卡；點擊 × 可清除推測。'
        }}
      </p>
      <div class="avalon-role-guess-players" aria-label="玩家角色推測">
        <div v-for="player in playerRows" :key="player.id" class="avalon-role-guess-player">
          <button
            class="avalon-role-guess-target"
            :class="{ 'is-targeting': selectedGuessRole !== null }"
            type="button"
            :aria-label="selectedGuessRole
              ? `將${player.name}推測為${AVALON_ROLES[selectedGuessRole].name}`
              : player.guessRoleId
                ? `${player.name}，目前推測為${AVALON_ROLES[player.guessRoleId].name}`
                : `${player.name}目前尚無角色推測`"
            @click="assignSelectedRoleGuess(player.id)"
            @dragover.prevent="allowRoleDrop"
            @drop.prevent.stop="dropRoleGuess($event, player.id)"
          >
            <AvalonPlayerIdentity :player="player" compact />
            <strong v-if="player.guessRoleId" class="avalon-player-guess">
              {{ AVALON_ROLES[player.guessRoleId].name }}
            </strong>
          </button>
          <button
            v-if="player.guessRoleId"
            class="avalon-guess-clear"
            type="button"
            :aria-label="`清除${player.name}的角色推測`"
            title="清除角色推測"
            @click.stop="clearRoleGuess(player.id)"
          >
            ×
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.avalon-game {
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
  display: grid;
  gap: 14px;
  width: 100%;
  color: var(--avalon-ink);
  text-align: left;
}

.avalon-game-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "brand phase"
    "summary summary"
    "markers markers";
  align-items: center;
  gap: 9px 14px;
  padding: 12px 14px;
  border: 1px solid #ded4bc;
  border-radius: 18px;
  background: var(--avalon-paper);
}

.avalon-game-brand {
  display: flex;
  min-width: 0;
  grid-area: brand;
  align-items: center;
  gap: 10px;
}

.avalon-brand-crest {
  display: block;
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
}

.avalon-game-title {
  min-width: 0;
}

.avalon-game-title .eyebrow {
  color: var(--avalon-good);
}

.avalon-current-phase {
  display: inline-flex;
  grid-area: phase;
  align-items: center;
  gap: 6px;
  padding: 5px 9px 5px 5px;
  border: 1px solid #e5d7b5;
  border-radius: 999px;
  background: #fbf4e4;
  color: #725820;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.avalon-current-phase img {
  display: block;
  width: 30px;
  height: 30px;
}

.avalon-game-heading h2 {
  margin: 3px 0 5px;
  color: var(--avalon-ink);
  font-size: clamp(18px, 3vw, 22px);
}

.avalon-phase-summary {
  grid-area: summary;
  margin: 0;
  color: #514e5b;
  font-size: 11px;
  line-height: 1.55;
}

.avalon-public-markers {
  display: flex;
  grid-area: markers;
  flex-wrap: wrap;
  gap: 5px;
}

.avalon-public-marker {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px 3px 8px;
  border: 1px solid #e9e1d0;
  border-radius: 999px;
  background: var(--avalon-parchment);
  color: #514e5b;
  font-size: 9px;
}

.avalon-public-marker small {
  font-size: 9px;
}

.avalon-mission-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 2px;
  margin: 0;
  padding: 8px 0 0;
  list-style: none;
}

.avalon-mission-track::before {
  position: absolute;
  top: 27px;
  right: 10%;
  left: 10%;
  height: 2px;
  background: #ded4bc;
  content: "";
}

.avalon-mission-marker {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 4px;
  min-width: 0;
  padding: 0 2px 4px;
  color: #686473;
  font-size: 9px;
  text-align: center;
}

.avalon-mission-node {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  border: 2px solid #ded4bc;
  background: var(--avalon-paper);
  color: #514e5b;
  font-size: 11px;
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.avalon-mission-node img {
  display: block;
  width: 32px;
  height: 32px;
}

.avalon-mission-marker strong {
  color: var(--avalon-ink);
  font-size: 9px;
}

.avalon-mission-marker.is-current .avalon-mission-node {
  border-color: var(--avalon-gold);
  box-shadow: 0 0 0 4px rgb(213 170 88 / 18%);
  transform: translateY(-2px);
}

.avalon-mission-marker.is-success,
.avalon-mission-marker.is-success strong {
  color: var(--avalon-good);
}

.avalon-mission-marker.is-failure,
.avalon-mission-marker.is-failure strong {
  color: var(--avalon-evil);
}

.avalon-mission-status {
  font-size: 8px;
  font-weight: 700;
}

.avalon-mission-marker.is-success .avalon-mission-node img,
.avalon-mission-marker.is-failure .avalon-mission-node img {
  animation: avalon-stamp-in 340ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.avalon-role-card,
.avalon-stage,
.avalon-history-card {
  padding: 14px;
  border: 1px solid #e4dccb;
  border-radius: 15px;
  background: var(--avalon-paper);
}

.avalon-history-tabs-card {
  display: grid;
  gap: 10px;
}

.avalon-history-tablist {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--avalon-parchment);
}

.avalon-history-tab {
  display: flex;
  min-width: 0;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: #696575;
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease;
}

.avalon-history-tab img {
  display: block;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
}

.avalon-history-tab.is-active {
  border-color: #e4dccb;
  background: var(--avalon-paper);
  color: var(--avalon-ink);
  box-shadow: 0 2px 6px rgb(48 45 61 / 6%);
}

.avalon-history-tab-count {
  display: grid;
  min-width: 18px;
  height: 18px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0 4px;
  border-radius: 999px;
  background: #ece5d5;
  color: #696575;
  font-size: 8px;
  line-height: 1;
}

.avalon-history-tab.is-active .avalon-history-tab-count {
  background: #fbf4e4;
  color: #725820;
}

.avalon-history-panel {
  min-width: 0;
}

.avalon-history-empty {
  margin: 0;
  color: #696575;
  font-size: 10px;
  line-height: 1.5;
}

.avalon-role-card {
  position: relative;
  border-color: #c9dccd;
  background: linear-gradient(135deg, #fffdf7, #e3f0e7);
}

.avalon-role-card.is-masked {
  min-height: 72px;
  border-color: #e4dccb;
  background: var(--avalon-paper);
}

.avalon-role-card.is-revealing {
  animation: avalon-role-reveal 420ms ease-out both;
}

.avalon-role-card.is-evil {
  border-color: #e3c5c3;
  background: linear-gradient(135deg, #fffdf7, #f5e5e3);
}

.avalon-role-card-hold {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: var(--avalon-ink);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: 800;
  touch-action: none;
  user-select: none;
}

.avalon-role-card-hold > span {
  padding: 6px 10px;
  border: 1px solid rgb(48 45 61 / 14%);
  border-radius: 999px;
  background: rgb(255 253 247 / 94%);
}

.avalon-role-card-hold.is-revealed {
  align-items: flex-end;
  justify-content: flex-end;
}

.avalon-role-card-hold.is-revealed > span {
  border-color: transparent;
  background: rgb(48 45 61 / 78%);
  color: #fffdf7;
}

.avalon-role-card-hold:focus-visible {
  outline: 3px solid var(--avalon-gold);
  outline-offset: 2px;
}

.avalon-role-card-topline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px;
}

.avalon-camp-badge,
.avalon-lake-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
}

.avalon-camp-badge img,
.avalon-lake-badge img {
  display: block;
  width: 22px;
  height: 22px;
}

.avalon-camp-badge.is-good {
  background: var(--avalon-good-soft);
  color: var(--avalon-good);
}

.avalon-camp-badge.is-evil {
  background: var(--avalon-evil-soft);
  color: var(--avalon-evil);
}

.avalon-lake-badge {
  background: var(--avalon-lake-soft);
  color: #367d82;
}

.avalon-role-card-intro {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 9px;
}

.avalon-role-icon {
  display: block;
  width: 68px;
  height: 68px;
  flex: 0 0 auto;
  border-radius: 16px;
  background: rgb(255 253 247 / 75%);
}

.avalon-role-card h3 {
  margin: 2px 0 4px;
  color: var(--avalon-ink);
  font-size: 17px;
}

.avalon-role-card-intro p {
  margin: 0;
  color: #514e5b;
  font-size: 10px;
  line-height: 1.55;
}

.avalon-role-loading {
  color: #817c92;
  font-size: 11px;
}

.avalon-known-players {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.avalon-known-players > strong {
  color: var(--avalon-good);
  font-size: 10px;
}

.avalon-known-players ul,
.avalon-team-list,
.avalon-vote-list,
.avalon-mission-results {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.avalon-known-players li,
.avalon-vote-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 9px;
  background: rgb(255 253 247 / 86%);
  font-size: 10px;
}

.avalon-known-players small,
.avalon-vote-list strong {
  color: #88839b;
  font-size: 9px;
}

.avalon-role-guess-heading {
  margin-bottom: 9px;
}

.avalon-role-guess-heading h3 {
  margin: 0;
  color: var(--avalon-ink);
  font-size: 14px;
}

.avalon-role-guess-heading p {
  margin: 5px 0 0;
  color: #696575;
  font-size: 10px;
  line-height: 1.5;
}

.avalon-role-guess-roles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(125px, 1fr));
  gap: 6px;
}

.avalon-role-guess-option {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  padding: 7px;
  border: 1px solid #e4dccb;
  border-radius: 10px;
  background: var(--avalon-paper);
  color: var(--avalon-ink);
  font: inherit;
  font-size: 10px;
  text-align: left;
  cursor: grab;
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.avalon-role-guess-option.is-good {
  background: #f5faf5;
}

.avalon-role-guess-option.is-evil {
  background: #fcf5f4;
}

.avalon-role-guess-option.is-selected {
  border-color: var(--avalon-gold);
  box-shadow: 0 0 0 2px rgb(213 170 88 / 22%);
  transform: translateY(-1px);
}

.avalon-role-guess-option > img {
  display: block;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
}

.avalon-role-guess-option > span:nth-of-type(2) {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}

.avalon-role-guess-option strong {
  flex: 0 0 auto;
  color: #696575;
  font-size: 9px;
}

.avalon-role-guess-camp {
  padding: 3px 5px;
  border-radius: 999px;
  background: var(--avalon-good-soft);
  color: var(--avalon-good);
  font-size: 8px;
  font-weight: 800;
}

.avalon-role-guess-option.is-evil .avalon-role-guess-camp {
  background: var(--avalon-evil-soft);
  color: var(--avalon-evil);
}

.avalon-guess-status {
  margin: 8px 0 0;
  color: #696575;
  font-size: 9px;
  line-height: 1.5;
}

.avalon-role-guess-players {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}

.avalon-role-guess-player {
  display: flex;
  min-width: 0;
  gap: 3px;
}

.avalon-role-guess-target {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  padding: 5px 7px;
  border: 1px solid #e4dccb;
  border-radius: 9px;
  background: var(--avalon-paper);
  color: var(--avalon-ink);
  font: inherit;
  font-size: 9px;
  text-align: left;
  cursor: pointer;
  transition: border-color 180ms ease, background-color 180ms ease;
}

.avalon-role-guess-target.is-targeting {
  border-color: var(--avalon-gold);
  background: #fbf4e4;
}

.avalon-role-guess-target strong,
.avalon-player-guess-empty {
  max-width: 42%;
  flex: 0 0 auto;
  color: #89859a;
  font-size: 8px;
  overflow-wrap: anywhere;
  text-align: right;
}

.avalon-role-guess-target strong.avalon-player-guess {
  padding: 3px 5px;
  border-radius: 999px;
  background: #f5ecd5;
  color: #725820;
}

.avalon-guess-clear {
  width: 28px;
  flex: 0 0 auto;
  border: 1px solid #e4dccb;
  border-radius: 8px;
  background: var(--avalon-paper);
  color: #686473;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.avalon-stage h3,
.avalon-history-card h3 {
  margin: 0 0 6px;
  color: var(--avalon-ink);
  font-size: 14px;
}

.avalon-stage {
  border-color: #dfd1af;
  box-shadow: 0 8px 22px rgb(48 45 61 / 5%);
}

.avalon-stage-banner {
  display: flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  margin-bottom: 10px;
  padding: 4px 10px 4px 4px;
  border: 1px solid #e5d7b5;
  border-radius: 999px;
  background: #fbf4e4;
  color: #725820;
  font-size: 9px;
  font-weight: 800;
}

.avalon-stage-banner img {
  display: block;
  width: 30px;
  height: 30px;
}

.avalon-stage > p,
.avalon-history-card > p {
  margin: 0 0 10px;
  color: #514e5b;
  font-size: 10px;
  line-height: 1.55;
}

.avalon-role-ready-count {
  width: fit-content;
  padding: 5px 9px;
  border: 1px solid #c9dccd;
  border-radius: 999px;
  background: #e3f0e7;
  color: var(--avalon-good);
  font-weight: 700;
}

.avalon-role-ready-count strong {
  font-variant-numeric: tabular-nums;
}

.avalon-role-guess-card > .avalon-guess-status {
  margin: 8px 0 0;
  color: #696575;
  font-size: 9px;
}

.avalon-player-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.avalon-player-button {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  min-height: 39px;
  padding: 7px 9px;
  border: 1px solid #e4dccb;
  border-radius: 10px;
  background: var(--avalon-paper);
  color: var(--avalon-ink);
  font: inherit;
  font-size: 10px;
  text-align: left;
  cursor: pointer;
  transition: border-color 180ms ease, background-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.avalon-player-button strong {
  color: #686473;
  font-size: 9px;
}

.avalon-player-button.is-selected {
  border-color: var(--avalon-gold);
  background: #fbf4e4;
  box-shadow: 0 0 0 2px rgb(213 170 88 / 18%);
  color: #725820;
}

.avalon-player-button.is-selected strong {
  color: #725820;
}

.avalon-player-button:not(:disabled):hover {
  box-shadow: 0 5px 12px rgb(48 45 61 / 9%);
  transform: translateY(-1px);
}

.avalon-player-button:disabled {
  cursor: default;
  opacity: 0.75;
}

.avalon-team-list {
  display: flex;
  flex-wrap: wrap;
  margin: 9px 0 12px;
}

.avalon-team-list li {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 9px;
  border-radius: 999px;
  border: 1px solid #d4e4d7;
  background: var(--avalon-good-soft);
  color: var(--avalon-good);
  font-size: 10px;
  font-weight: 700;
}

.avalon-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  color: #514e5b;
  font-size: 10px;
}

.avalon-action-row .button,
.avalon-action-button {
  min-height: 36px;
  padding-inline: 13px;
  border-radius: 9px;
  font-size: 10px;
}

.avalon-action-button {
  margin-top: 11px;
}

.avalon-stage .avalon-action-button.button-primary {
  border-color: #b88935;
  background: var(--avalon-gold);
  color: #302d3d;
}

.avalon-stage .avalon-action-row .button-primary {
  border-color: #b88935;
  background: var(--avalon-gold);
  color: var(--avalon-ink);
}

.avalon-vote-actions,
.avalon-mission-actions {
  justify-content: flex-start;
}

.avalon-vote-actions .button-primary,
.avalon-mission-actions .button-primary {
  border-color: var(--avalon-good);
  background: var(--avalon-good);
  color: #fffdf7;
}

.avalon-vote-actions .button-secondary,
.avalon-mission-actions .button-secondary {
  border-color: #d4aaa5;
  background: var(--avalon-evil-soft);
  color: var(--avalon-evil);
}

.avalon-game button:focus-visible {
  outline: 3px solid rgb(213 170 88 / 78%);
  outline-offset: 3px;
}

.avalon-warning {
  margin: 10px 0 0 !important;
  color: #86542e !important;
}

.avalon-private-status {
  margin-top: 8px !important;
  color: #367d82 !important;
}

.avalon-vote-list {
  width: 100%;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.avalon-vote-list li {
  min-width: 0;
}

.avalon-vote-list .avalon-player-identity {
  min-width: 0;
  flex: 1 1 auto;
}

.avalon-vote-list strong {
  flex: 0 0 auto;
  white-space: nowrap;
}

.avalon-vote-list strong.is-approve {
  color: var(--avalon-good);
}

.avalon-vote-list strong.is-reject {
  color: var(--avalon-evil);
}

.avalon-vote-history {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.avalon-vote-history > li {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 9px;
  border-radius: 10px;
  background: var(--avalon-parchment);
  font-size: 10px;
}

.avalon-vote-history > li > strong {
  color: var(--avalon-ink);
}

.avalon-vote-history > li > small {
  color: #696575;
  font-size: 9px;
  line-height: 1.5;
}

.avalon-vote-history-heading,
.avalon-vote-history-team,
.avalon-mission-result-players {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.avalon-vote-history-team {
  color: #696575;
  font-size: 9px;
  line-height: 1.5;
}

.avalon-vote-history details {
  width: 100%;
  min-width: 0;
  margin-top: 3px;
}

.avalon-vote-history summary {
  max-width: 100%;
  color: #725820;
  font-size: 9px;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.avalon-vote-history .avalon-vote-list {
  margin-top: 6px;
}

.avalon-mission-results {
  gap: 7px;
}

.avalon-mission-results li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px;
  border-radius: 10px;
  background: var(--avalon-parchment);
  font-size: 9px;
}

.avalon-mission-results li > div {
  display: grid;
  gap: 3px;
}

.avalon-mission-result-players {
  line-height: 1.5;
}

.avalon-mission-results strong {
  color: var(--avalon-ink);
  font-size: 10px;
}

.avalon-mission-results small,
.avalon-mission-results li > span {
  color: #696575;
  font-size: 9px;
}

.avalon-mission-results li.is-success {
  background: var(--avalon-good-soft);
}

.avalon-mission-results li.is-failure {
  background: var(--avalon-evil-soft);
}

.avalon-mission-result-heading {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.avalon-mission-result-heading img {
  display: block;
  width: 24px;
  height: 24px;
}

.avalon-mission-result-counts {
  flex: 0 0 auto;
  font-weight: 700;
}

.avalon-vote-stamp {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 7px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
}

.avalon-vote-stamp.is-accepted {
  background: var(--avalon-good-soft);
  color: var(--avalon-good);
}

.avalon-vote-stamp.is-rejected {
  background: var(--avalon-evil-soft);
  color: var(--avalon-evil);
}

.avalon-vote-stamp > span {
  animation: avalon-stamp-in 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes avalon-stamp-in {
  from {
    opacity: 0.45;
    transform: scale(0.72) rotate(-8deg);
  }

  to {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

@keyframes avalon-role-reveal {
  from {
    opacity: 0.88;
    transform: translateY(5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 760px) {
  .avalon-role-guess-players {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .avalon-game-heading {
    gap: 8px 6px;
    padding: 10px;
  }

  .avalon-brand-crest {
    width: 46px;
    height: 46px;
  }

  .avalon-current-phase {
    gap: 4px;
    padding-right: 7px;
    font-size: 9px;
  }

  .avalon-current-phase img {
    width: 26px;
    height: 26px;
  }

  .avalon-vote-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .avalon-history-tab {
    gap: 3px;
    padding-inline: 4px;
    font-size: 9px;
  }

  .avalon-history-tab img {
    width: 20px;
    height: 20px;
  }

  .avalon-role-guess-players {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .avalon-mission-results li {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .avalon-role-card.is-revealing,
  .avalon-mission-marker.is-success .avalon-mission-node img,
  .avalon-mission-marker.is-failure .avalon-mission-node img,
  .avalon-vote-stamp > span {
    animation: none;
  }

  .avalon-mission-node,
  .avalon-role-guess-option,
  .avalon-role-guess-target,
  .avalon-player-button {
    transition: none;
  }

  .avalon-mission-marker.is-current .avalon-mission-node,
  .avalon-role-guess-option.is-selected,
  .avalon-player-button:not(:disabled):hover {
    transform: none;
  }
}
</style>
