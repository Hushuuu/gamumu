<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

const privateState = ref<AvalonPrivateState | null>(null)
const selectedTeamIds = ref<string[]>([])
const selectedLakeTargetId = ref('')
const selectedAssassinationTargetId = ref('')
const selectedGuessRole = ref<AvalonRoleId | null>(null)
const roleGuesses = ref<Partial<Record<string, AvalonRoleId>>>({})

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
const missionSuccesses = computed(() =>
  view.value?.missions.filter((mission) => mission.outcome === 'success').length ?? 0,
)
const missionFailures = computed(() =>
  view.value?.missions.filter((mission) => mission.outcome === 'failure').length ?? 0,
)
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
    { label: '首任隊長', player: playerInfoOf(current.initialLeaderId) },
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
        : `等待目前隊長組隊；每個任務需要 ${current.teamSize} 位玩家。`
    case 'team-vote':
      return '所有玩家私下投票；全員完成後才會同時公布結果。'
    case 'mission':
      return isOnMissionTeam.value
        ? '任務隊伍成員私下選擇任務牌；正義陣營只能選成功。'
        : '任務隊伍正在私下出牌；系統只會公布成功與失敗牌數。'
    case 'lake-check':
      return isLakeHolder.value
        ? '選擇一位從未持有過標記的玩家，私下查看其忠誠陣營後傳遞標記。'
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
  const state = currentPrivateState.value
  return (state?.knownPlayers ?? []).map((knownPlayer) => ({
    ...knownPlayer,
    ...playerInfoOf(knownPlayer.playerId),
  }))
})
const roleInfo = computed(() => {
  const roleId = currentPrivateState.value?.roleId
  return roleId ? AVALON_ROLES[roleId] : null
})
const campLabel = computed(() => currentPrivateState.value?.camp === 'good' ? '正義陣營' : '邪惡陣營')

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
      <div>
        <p class="eyebrow">隱藏身分 · 任務推理</p>
        <h2>{{ gameName }}</h2>
        <p class="avalon-phase-summary">{{ currentPhaseTitle }} · {{ phaseDescription }}</p>
        <div class="avalon-public-markers">
          <span v-for="marker in publicMarkers" :key="marker.label" class="avalon-public-marker">
            <small>{{ marker.label }}</small>
            <AvalonPlayerIdentity :player="marker.player" compact />
          </span>
        </div>
      </div>
      <div class="avalon-score" aria-label="任務勝負">
        <span><strong>{{ missionSuccesses }}</strong> 正義任務</span>
        <span><strong>{{ missionFailures }}</strong> 邪惡任務</span>
      </div>
    </header>

    <section class="avalon-mission-track" aria-label="任務進度">
      <div
        v-for="missionNumber in 5"
        :key="missionNumber"
        class="avalon-mission-marker"
        :class="{
          'is-current': view.missionNumber === missionNumber && view.phase !== 'finished',
          'is-success': view.missions.find((mission) => mission.missionNumber === missionNumber)?.outcome === 'success',
          'is-failure': view.missions.find((mission) => mission.missionNumber === missionNumber)?.outcome === 'failure',
        }"
      >
        <strong>{{ missionNumber }}</strong>
        <span>{{ view.missions.find((mission) => mission.missionNumber === missionNumber)?.outcome === 'success'
          ? '成功'
          : view.missions.find((mission) => mission.missionNumber === missionNumber)?.outcome === 'failure'
            ? '失敗'
            : '任務' }}</span>
      </div>
    </section>

    <section v-if="roleInfo" class="avalon-role-card">
      <div class="avalon-role-heading">
        <span class="avalon-camp-badge" :class="`is-${currentPrivateState?.camp}`">{{ campLabel }}</span>
        <span v-if="view.lakeHolderId === playerId" class="avalon-lake-badge">湖中女神標記</span>
      </div>
      <h3>{{ roleInfo.name }}</h3>
      <p>{{ roleInfo.description }}</p>
      <div v-if="knownPlayerRows.length" class="avalon-known-players">
        <strong>你的身分資訊</strong>
        <ul>
          <li v-for="knownPlayer in knownPlayerRows" :key="knownPlayer.playerId">
            <AvalonPlayerIdentity :player="knownPlayer" compact />
            <small>{{ knowledgeLabel(knownPlayer.knowledge) }}</small>
          </li>
        </ul>
      </div>
      <div v-if="currentPrivateState?.lakeResults.length" class="avalon-known-players">
        <strong>你查驗過的忠誠資訊</strong>
        <ul>
          <li v-for="result in currentPrivateState.lakeResults" :key="`${result.missionNumber}-${result.targetId}`">
            <AvalonPlayerIdentity :player="playerInfoOf(result.targetId)" compact />
            <small>{{ result.camp === 'good' ? '好人' : '邪惡' }} · 第 {{ result.missionNumber }} 個任務後</small>
          </li>
        </ul>
      </div>
    </section>
    <section v-else class="avalon-role-card avalon-role-loading" aria-live="polite">
      正在接收你的角色資訊……
    </section>

    <section class="avalon-stage" aria-live="polite">
      <template v-if="view.phase === 'role-reveal'">
        <h3>確認你的身分</h3>
        <p>角色與提示只會顯示給你。請在查看完畢後確認，所有玩家完成確認才會開始第一個任務。</p>
        <ul class="avalon-player-list">
          <li v-for="player in playerRows" :key="player.id">
            <AvalonPlayerIdentity :player="player" compact />
            <strong :class="{ 'is-ready': view.readyIds.includes(player.id) }">
              {{ view.readyIds.includes(player.id) ? '已確認' : '查看中' }}
            </strong>
          </li>
        </ul>
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
        <p v-else>每個任務需要 {{ view.teamSize }} 位玩家；目前隊長請見上方標記。</p>
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
            <AvalonPlayerIdentity :player="player" compact />
            <strong>{{ selectedTeamIds.includes(player.id) ? '已選' : '選擇' }}</strong>
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
        <h3>第 {{ view.missionNumber }} 個任務隊伍</h3>
        <ul class="avalon-team-list">
          <li v-for="player in teamNames" :key="player.id">
            <AvalonPlayerIdentity :player="player" compact />
          </li>
        </ul>
        <p>目前 {{ view.votesSubmitted }} / {{ view.seatIds.length }} 人已投票；所有人完成前不會揭露個別選擇。</p>
        <div class="avalon-action-row avalon-vote-actions">
          <button
            class="button button-primary"
            type="button"
            :disabled="!canInteract || !currentPrivateState"
            :aria-pressed="currentPrivateState?.voteSelection === true"
            @click="voteTeam(true)"
          >
            同意
          </button>
          <button
            class="button button-secondary"
            type="button"
            :disabled="!canInteract || !currentPrivateState"
            :aria-pressed="currentPrivateState?.voteSelection === false"
            @click="voteTeam(false)"
          >
            反對
          </button>
        </div>
        <p v-if="currentPrivateState?.voteSelection !== null && currentPrivateState" class="avalon-private-status">
          你已{{ currentPrivateState.voteSelection ? '同意' : '反對' }}；在全員投票前可以修改。
        </p>
      </template>

      <template v-else-if="view.phase === 'mission'">
        <h3>第 {{ view.missionNumber }} 個任務正在執行</h3>
        <ul class="avalon-team-list">
          <li v-for="player in teamNames" :key="player.id">
            <AvalonPlayerIdentity :player="player" compact />
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
          <p>選擇一位未曾持有標記的玩家。查驗只會告訴你對方是好人或邪惡陣營，結果不會公開。</p>
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
              <AvalonPlayerIdentity :player="player" compact />
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
              <AvalonPlayerIdentity :player="player" compact />
              <strong>{{ selectedAssassinationTargetId === player.id ? '已選' : '選擇' }}</strong>
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

    <section v-if="view.voteHistory.length" class="avalon-history-card">
      <h3>隊伍投票紀錄</h3>
      <ol class="avalon-vote-history">
        <li v-for="entry in voteHistoryRows" :key="entry.key">
          <strong class="avalon-vote-history-heading">
            <span>第 {{ entry.vote.missionNumber }} 個任務 ·</span>
            <AvalonPlayerIdentity :player="entry.leader" compact />
            <span>提案 {{ entry.vote.accepted ? '通過' : '遭否決' }}</span>
          </strong>
          <small class="avalon-vote-history-team">
            <span>隊伍：</span>
            <AvalonPlayerIdentity
              v-for="player in entry.team"
              :key="player.id"
              :player="player"
              compact
            />
            <span>· {{ entry.vote.approveCount }} 同意 / {{ entry.vote.rejectCount }} 反對</span>
          </small>
          <details>
            <summary>查看個別投票</summary>
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
    </section>

    <section v-if="view.missions.length" class="avalon-history-card">
      <h3>任務結果</h3>
      <ul class="avalon-mission-results">
        <li v-for="entry in missionResultRows" :key="entry.mission.missionNumber">
          <div>
            <strong>
              第 {{ entry.mission.missionNumber }} 個任務 ·
              {{ entry.mission.outcome === 'success' ? '成功' : '失敗' }}
            </strong>
            <small class="avalon-mission-result-players">
              <span>隊長</span>
              <AvalonPlayerIdentity :player="entry.leader" compact />
              <span>· 隊伍</span>
              <AvalonPlayerIdentity
                v-for="player in entry.team"
                :key="player.id"
                :player="player"
                compact
              />
            </small>
          </div>
          <span>{{ entry.mission.successCount }} 成功 / {{ entry.mission.failCount }} 失敗</span>
        </li>
      </ul>
    </section>

    <section class="avalon-history-card avalon-role-guess-card" aria-label="本局角色配置與推測">
      <div class="avalon-role-guess-heading">
        <div>
          <h3>本局角色配置（{{ view.seatIds.length }} 人）</h3>
          <p>點選角色卡後選擇玩家，或將角色卡拖曳至玩家；推測只會保存在你的畫面。</p>
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
            <span v-else class="avalon-player-guess-empty">
              {{ selectedGuessRole ? '標記此玩家' : '未推測' }}
            </span>
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
  display: grid;
  gap: 14px;
  width: 100%;
  color: var(--ink);
  text-align: left;
}

.avalon-game-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.avalon-game-heading h2 {
  margin: 3px 0 5px;
  font-size: 22px;
}

.avalon-phase-summary {
  margin: 0;
  color: #6d6982;
  font-size: 11px;
  line-height: 1.55;
}

.avalon-public-markers {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.avalon-public-marker {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px 3px 8px;
  border-radius: 999px;
  background: #f0edfa;
  color: #69647f;
  font-size: 9px;
}

.avalon-public-marker small {
  font-size: 9px;
}

.avalon-score {
  display: grid;
  flex: 0 0 auto;
  gap: 5px;
  padding: 9px 11px;
  border: 1px solid #ece9f4;
  border-radius: 12px;
  background: #fff;
  color: #77738a;
  font-size: 9px;
}

.avalon-score strong {
  margin-right: 3px;
  color: var(--purple-dark);
  font-size: 14px;
}

.avalon-mission-track {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.avalon-mission-marker {
  display: grid;
  justify-items: center;
  gap: 3px;
  padding: 7px 4px;
  border: 1px solid #eeeaf6;
  border-radius: 10px;
  background: #fff;
  color: #87839a;
  font-size: 9px;
}

.avalon-mission-marker strong {
  display: grid;
  width: 23px;
  height: 23px;
  place-items: center;
  border-radius: 50%;
  background: #f1eff7;
  color: #726d87;
  font-size: 11px;
}

.avalon-mission-marker.is-current {
  border-color: #9787eb;
  box-shadow: 0 0 0 2px rgb(151 135 235 / 12%);
}

.avalon-mission-marker.is-success {
  background: #effaf5;
  color: #378262;
}

.avalon-mission-marker.is-success strong {
  background: #d9f2e5;
  color: #28734e;
}

.avalon-mission-marker.is-failure {
  background: #fff2f1;
  color: #a95950;
}

.avalon-mission-marker.is-failure strong {
  background: #fbe0dd;
  color: #9e4841;
}

.avalon-role-card,
.avalon-stage,
.avalon-history-card {
  padding: 14px;
  border: 1px solid #ebe8f3;
  border-radius: 15px;
  background: #fff;
}

.avalon-role-card {
  border-color: #dcd6f8;
  background: linear-gradient(135deg, #fbfaff, #f1efff);
}

.avalon-role-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.avalon-camp-badge,
.avalon-lake-badge {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
}

.avalon-camp-badge.is-good {
  background: #e2f6ec;
  color: #2f8058;
}

.avalon-camp-badge.is-evil {
  background: #fde8e6;
  color: #a24f48;
}

.avalon-lake-badge {
  background: #e3f4fb;
  color: #397e99;
}

.avalon-role-card h3 {
  margin: 8px 0 4px;
  color: #38334f;
  font-size: 17px;
}

.avalon-role-card > p {
  margin: 0;
  color: #6c6880;
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
  color: #655b9f;
  font-size: 10px;
}

.avalon-known-players ul,
.avalon-player-list,
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
.avalon-player-list li,
.avalon-vote-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 9px;
  background: rgb(255 255 255 / 82%);
  font-size: 10px;
}

.avalon-known-players small,
.avalon-player-list strong,
.avalon-vote-list strong {
  color: #88839b;
  font-size: 9px;
}

.avalon-player-list strong.is-ready {
  color: #32815b;
}

.avalon-role-guess-heading {
  margin-bottom: 9px;
}

.avalon-role-guess-heading h3 {
  margin: 0;
  color: #403b59;
  font-size: 14px;
}

.avalon-role-guess-heading p {
  margin: 5px 0 0;
  color: #77738a;
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
  border: 1px solid #e7e4ef;
  border-radius: 10px;
  background: #fff;
  color: #55516b;
  font: inherit;
  font-size: 10px;
  text-align: left;
  cursor: grab;
}

.avalon-role-guess-option.is-good {
  background: #f5fbf7;
}

.avalon-role-guess-option.is-evil {
  background: #fff7f6;
}

.avalon-role-guess-option.is-selected {
  border-color: #8b7ae3;
  box-shadow: 0 0 0 2px rgb(139 122 227 / 14%);
}

.avalon-role-guess-option > span:nth-child(2) {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}

.avalon-role-guess-option strong {
  flex: 0 0 auto;
  color: #77738a;
  font-size: 9px;
}

.avalon-role-guess-camp {
  padding: 3px 5px;
  border-radius: 999px;
  background: #e2f6ec;
  color: #2f8058;
  font-size: 8px;
  font-weight: 800;
}

.avalon-role-guess-option.is-evil .avalon-role-guess-camp {
  background: #fde8e6;
  color: #a24f48;
}

.avalon-guess-status {
  margin: 8px 0 0;
  color: #77738a;
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
  border: 1px solid #e7e4ef;
  border-radius: 9px;
  background: #fff;
  color: #55516b;
  font: inherit;
  font-size: 9px;
  text-align: left;
  cursor: pointer;
}

.avalon-role-guess-target.is-targeting {
  border-color: #a89be9;
  background: #faf9ff;
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
  background: #eeebff;
  color: #6558ae;
}

.avalon-guess-clear {
  width: 28px;
  flex: 0 0 auto;
  border: 1px solid #e7e4ef;
  border-radius: 8px;
  background: #fff;
  color: #89859a;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.avalon-stage h3,
.avalon-history-card h3 {
  margin: 0 0 6px;
  color: #403b59;
  font-size: 14px;
}

.avalon-stage > p,
.avalon-history-card > p {
  margin: 0 0 10px;
  color: #77738a;
  font-size: 10px;
  line-height: 1.55;
}

.avalon-role-guess-card > .avalon-guess-status {
  margin: 8px 0 0;
  color: #77738a;
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
  border: 1px solid #e7e4ef;
  border-radius: 10px;
  background: #fff;
  color: #55516b;
  font: inherit;
  font-size: 10px;
  text-align: left;
  cursor: pointer;
}

.avalon-player-button strong {
  color: #89859a;
  font-size: 9px;
}

.avalon-player-button.is-selected {
  border-color: #8b7ae3;
  background: #f3f0ff;
  color: #5c50a0;
}

.avalon-player-button.is-selected strong {
  color: #6858bc;
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
  background: #f0edff;
  color: #6558ae;
  font-size: 10px;
  font-weight: 700;
}

.avalon-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  color: #77738a;
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

.avalon-vote-actions,
.avalon-mission-actions {
  justify-content: flex-start;
}

.avalon-warning {
  margin: 10px 0 0 !important;
  color: #aa5d39 !important;
}

.avalon-private-status {
  margin-top: 8px !important;
  color: #665ab1 !important;
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
  color: #31815a;
}

.avalon-vote-list strong.is-reject {
  color: #aa5b52;
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
  background: #f8f7fb;
  font-size: 10px;
}

.avalon-vote-history > li > strong {
  color: #514c67;
}

.avalon-vote-history > li > small {
  color: #858197;
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
  color: #858197;
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
  color: #6c629f;
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
  background: #f8f7fb;
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
  color: #514c67;
  font-size: 10px;
}

.avalon-mission-results small,
.avalon-mission-results li > span {
  color: #858197;
  font-size: 9px;
}

@media (max-width: 760px) {
  .avalon-role-guess-players {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .avalon-game-heading {
    flex-direction: column;
  }

  .avalon-score {
    display: flex;
    width: 100%;
    justify-content: space-around;
  }

  .avalon-vote-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .avalon-role-guess-players {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .avalon-mission-results li {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
