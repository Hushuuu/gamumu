<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { GameView } from '../../../shared/games'
import {
  WEREWOLF_PRIVATE_EVENT,
  WEREWOLF_ROLES,
  isWerewolfPrivateState,
  type WerewolfPhase,
  type WerewolfPrivateState,
  type WerewolfRoleId,
} from '../../../shared/games/werewolf'
import type { GameEvent, PlayerView } from '../../../shared/protocol'
import PlayerPicker from './components/PlayerPicker.vue'
import RoleCard from './components/RoleCard.vue'
import WerewolfHistoryDialog from './components/WerewolfHistoryDialog.vue'
import WerewolfMomentOverlay from './components/WerewolfMomentOverlay.vue'
import WerewolfPhaseIllustration from './components/WerewolfPhaseIllustration.vue'
import WerewolfRoleIcon from './components/WerewolfRoleIcon.vue'
import {
  ROLE_GUESS_DRAG_TYPE,
  type PickerSeat,
  type WerewolfMoment,
} from './components/types'

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

type PickMode = 'wolf' | 'guard' | 'seer' | 'witch' | 'hunter' | 'vote' | 'none'
const PHASE_TITLES: Record<WerewolfPhase, string> = {
  'role-reveal': '查看身分',
  night: '黑夜',
  dawn: '天亮了',
  'hunter-shot': '開槍時刻',
  'day-discussion': '白天討論',
  vote: '投票放逐',
  'pk-discussion': '平票 PK 發言',
  'pk-vote': '平票 PK 複投',
  'vote-result': '投票結果',
  finished: '遊戲結束',
}

const WEREWOLF_MOMENT_OVERLAY_ENABLED = false
const now = ref(Date.now())
const privateState = ref<WerewolfPrivateState | null>(null)
const poisonPick = ref<string | null>(null)
const votePick = ref<string | null | undefined>(undefined)
const shootPick = ref<string | null>(null)
const selectedGuessRole = ref<WerewolfRoleId | null>(null)
const momentQueue = ref<WerewolfMoment[]>([])
const activeMoment = computed(() => momentQueue.value[0] ?? null)
const roleGuesses = ref<Partial<Record<string, WerewolfRoleId>>>({})
let suppressPickerClick = false
let clockTimer: number | undefined
let momentSequence = 0

const view = computed(() => (props.game.gameId === 'werewolf' ? props.game : null))
const priv = computed(() => {
  const state = privateState.value
  return state && view.value && state.stateVersion === view.value.stateVersion ? state : null
})
const phase = computed(() => view.value?.phase ?? 'finished')
const canAct = computed(() => Boolean(props.canInteract && priv.value?.alive))
const aliveSet = computed(() => new Set(view.value?.aliveIds ?? []))
const remainingSeconds = computed(() => {
  const deadline = view.value?.phaseEndsAt
  return deadline ? Math.max(0, Math.ceil((deadline - now.value) / 1_000)) : 0
})

const mode = computed<PickMode>(() => {
  const state = priv.value
  const current = view.value
  if (!state || !current) {
    return 'none'
  }
  if (current.phase === 'night' && state.acting) {
    if (state.camp === 'wolf') return 'wolf'
    if (state.role === 'guard') return 'guard'
    if (state.role === 'seer') return state.myTarget === null ? 'seer' : 'none'
    if (state.role === 'witch') return state.witch?.poison ? 'witch' : 'none'
  }
  if (current.phase === 'hunter-shot' && state.canShoot) return 'hunter'
  if ((current.phase === 'vote' || current.phase === 'pk-vote') && state.alive) return 'vote'
  return 'none'
})

const selectable = computed(() => {
  const state = priv.value
  const current = view.value
  if (!state || !current) {
    return []
  }

  const others = [...aliveSet.value].filter((id) => id !== props.playerId)
  switch (mode.value) {
    case 'wolf':
      return [...aliveSet.value]
    case 'seer':
      return others.filter((id) => !state.seerResults.some((result) => result.playerId === id))
    case 'guard':
      return [...aliveSet.value].filter((id) => id !== state.guard?.lastTargetId)
    case 'witch':
    case 'hunter':
      return others
    case 'vote':
      return current.phase === 'pk-vote'
        ? current.pkCandidateIds.filter((id) => id !== props.playerId && aliveSet.value.has(id))
        : others
    default:
      return []
  }
})

const selected = computed(() => {
  const state = priv.value
  switch (mode.value) {
    case 'wolf':
    case 'guard':
    case 'seer':
      return state?.myTarget ?? null
    case 'witch':
      return poisonPick.value ?? state?.witch?.poisonTargetId ?? null
    case 'hunter':
      return shootPick.value
    case 'vote':
      return votePick.value !== undefined
        ? votePick.value
        : (state?.voteSelection ?? state?.myVote ?? null)
    default:
      return null
  }
})

function nameOf(playerId: string | null): string {
  if (playerId === null) {
    return '無人'
  }
  return props.players.find((player) => player.id === playerId)?.name ?? '已離開的玩家'
}

function showMoment(kind: WerewolfMoment['kind'], title: string, detail: string): void {
  if (!WEREWOLF_MOMENT_OVERLAY_ENABLED) {
    return
  }
  momentQueue.value.push({ id: ++momentSequence, kind, title, detail })
}

function completeMoment(id: number): void {
  if (momentQueue.value[0]?.id === id) {
    momentQueue.value.shift()
  }
}

const seats = computed<PickerSeat[]>(() => {
  const current = view.value
  const state = priv.value
  if (!current) {
    return []
  }

  return current.seatIds.map((id) => {
    const player = props.players.find((candidate) => candidate.id === id)
    const tags: string[] = []
    if (id === props.playerId) tags.push('你')
    if (current.phase === 'night' && state?.teammates.includes(id)) tags.push('狼人同伴')
    const checked = state?.seerResults.find((result) => result.playerId === id)
    if (checked) tags.push(checked.camp === 'wolf' ? '查驗：狼人' : '查驗：好人')
    if (
      (current.phase === 'vote' || current.phase === 'pk-vote') &&
      current.votedIds.includes(id)
    ) {
      tags.push('已投票')
    }
    if (state?.camp === 'wolf' && state.acting) {
      const picks = Object.values(state.wolfPicks).filter((target) => target === id).length
      if (picks > 0) tags.push(`狼人選擇 ×${picks}`)
    }

    return {
      id,
      name: player?.name ?? '已離開的玩家',
      avatarId: player?.avatarId ?? null,
      alive: aliveSet.value.has(id),
      tags,
      guessRoleId: roleGuesses.value[id] ?? null,
    }
  })
})

const deathText = computed(() => {
  const ids = view.value?.lastDeathIds ?? []
  return ids.length === 0 ? '昨晚是平安夜，沒有人出局。' : `昨晚 ${ids.map(nameOf).join('、')} 出局。`
})

const hunterText = computed(() => {
  const shot = view.value?.hunterShot
  if (!shot) {
    const pendingRole = view.value?.shooterRoleId
    return `${pendingRole ? WEREWOLF_ROLES[pendingRole].name : '玩家'}正在決定是否開槍…`
  }
  const roleName = WEREWOLF_ROLES[shot.roleId].name
  return shot.targetId === null
    ? `${nameOf(shot.shooterId)} 是${roleName}，選擇不開槍。`
    : `${nameOf(shot.shooterId)} 是${roleName}，開槍帶走了 ${nameOf(shot.targetId)}。`
})

const voteTally = computed(() => {
  const votes = view.value?.votes
  if (!votes) {
    return []
  }

  const groups = new Map<string | null, string[]>()
  for (const [voterId, targetId] of Object.entries(votes)) {
    groups.set(targetId, [...(groups.get(targetId) ?? []), nameOf(voterId)])
  }
  return [...groups.entries()]
    .map(([targetId, voters]) => ({ targetId, voters }))
    .sort((left, right) => right.voters.length - left.voters.length)
})

const pkCandidateNames = computed(() =>
  (view.value?.pkCandidateIds ?? []).map(nameOf).join('、'),
)
const pkSpeechSeconds = computed(() =>
  (view.value?.settings.speechSeconds ?? 0) / 2,
)
const teammateNames = computed(() => (priv.value?.teammates ?? []).map(nameOf))
const seerTonightCamp = computed(() => {
  const state = priv.value
  return state?.seerResults.find((result) => result.playerId === state.myTarget)?.camp ?? null
})
const speakerId = computed(() => {
  const speech = view.value?.speech
  return speech ? (speech.order[speech.index] ?? null) : null
})
const isSpeaker = computed(() => speakerId.value === props.playerId)
const speakerProgress = computed(() => {
  const speech = view.value?.speech
  if (!speech) {
    return ''
  }
  return `${speech.index + 1} / ${speech.order.length}`
})
const witchVictimName = computed(() => nameOf(priv.value?.witch?.victimId ?? null))
const roleCountEntries = computed(() => {
  const roleCounts = view.value?.roleCounts
  if (!roleCounts) {
    return []
  }

  return Object.values(WEREWOLF_ROLES).map(({ id, name }) => ({
    id,
    name,
    count: roleCounts[id],
  }))
})
watch(() => props.gameEvent, (event) => {
  if (event?.gameId === 'werewolf' && event.event === WEREWOLF_PRIVATE_EVENT && isWerewolfPrivateState(event.payload)) {
    privateState.value = event.payload
  }
}, { immediate: true })

watch(
  [
    () => view.value?.phase,
    () => view.value?.day,
    () => JSON.stringify(view.value?.lastDeathIds ?? []),
    () => view.value?.exiledId ?? null,
    () => view.value?.hunterShot?.targetId ?? null,
  ],
  (
    [nextPhase, nextDay, nextDeathIds, nextExiledId, nextShotTargetId],
    [previousPhase, previousDay, previousDeathIds, previousExiledId, previousShotTargetId],
  ) => {
    const current = view.value
    if (!nextPhase || !current) {
      return
    }

    if (
      previousPhase &&
      nextPhase === 'night' &&
      (previousPhase !== 'night' || nextDay !== previousDay)
    ) {
      showMoment('night', '夜晚開始', '村民們請閉上眼睛')
    }

    if (previousPhase && nextPhase === 'dawn' && previousPhase !== 'dawn') {
      showMoment(
        'day',
        '天亮了',
        current.lastDeathIds.length > 0
          ? '村民們醒來了，昨夜的消息即將揭曉。'
          : '昨晚平安無事，大家可以睜開眼睛了。',
      )
    }

    if (
      previousPhase &&
      nextPhase === 'dawn' &&
      nextDeathIds !== previousDeathIds &&
      current.lastDeathIds.length > 0
    ) {
      showMoment(
        'death',
        '有人出局',
        `昨夜 ${current.lastDeathIds.map(nameOf).join('、')} 出局了`,
      )
    }

    if (
      previousPhase &&
      nextPhase === 'vote-result' &&
      nextExiledId &&
      nextExiledId !== previousExiledId
    ) {
      showMoment('death', '投票結果', `${nameOf(nextExiledId)} 被放逐出局`)
    }

    if (
      previousPhase &&
      nextPhase === 'hunter-shot' &&
      nextShotTargetId &&
      nextShotTargetId !== previousShotTargetId
    ) {
      showMoment('death', '獵人開槍', `${nameOf(nextShotTargetId)} 被獵人帶走`)
    }
  },
)

watch(
  [
    () => view.value?.phase,
    () => view.value?.day,
    () => view.value?.nightStep,
  ],
  () => {
    poisonPick.value = null
    votePick.value = undefined
    shootPick.value = null
  },
)

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 250)
})

onUnmounted(() => {
  if (clockTimer !== undefined) {
    window.clearInterval(clockTimer)
  }
})

function act(action: string, payload: Record<string, unknown>): void {
  if (canAct.value) {
    emit('game-action', action, payload)
  }
}

function submitVote(targetId: string | null): void {
  votePick.value = targetId
  act('cast_vote', { targetId })
}

function pick(playerId: string): void {
  if (suppressPickerClick) {
    suppressPickerClick = false
    return
  }

  if (selectedGuessRole.value) {
    assignRoleGuess(playerId, selectedGuessRole.value)
    return
  }

  switch (mode.value) {
    case 'wolf':
      act('wolf_target', { targetId: playerId })
      break
    case 'guard':
      act('guard_protect', { targetId: playerId })
      break
    case 'seer':
      act('seer_check', { targetId: playerId })
      break
    case 'witch':
      poisonPick.value = playerId
      break
    case 'hunter':
      shootPick.value = playerId
      break
    case 'vote':
      votePick.value = playerId
      act('select_vote', { targetId: playerId })
      break
  }
}

function selectGuessRole(roleId: WerewolfRoleId): void {
  selectedGuessRole.value = selectedGuessRole.value === roleId ? null : roleId
}

function startRoleGuessDrag(event: DragEvent, roleId: WerewolfRoleId): void {
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
  const guessableRole = roleCountEntries.value.find((role) => role.id === roleId && role.count > 0)
  if (!guessableRole) {
    return false
  }

  roleGuesses.value[playerId] = guessableRole.id
  selectedGuessRole.value = null
  return true
}

function dropRoleGuess(playerId: string, roleId: string): void {
  if (!assignRoleGuess(playerId, roleId)) {
    return
  }

  suppressPickerClick = true
  window.setTimeout(() => {
    suppressPickerClick = false
  }, 0)
}

function clearRoleGuess(playerId: string): void {
  delete roleGuesses.value[playerId]
}

function endSpeech(): void {
  if (props.canInteract && (isSpeaker.value || props.isHost)) {
    emit('game-action', 'end_speech', {})
  }
}

function endDiscussion(): void {
  if (props.canInteract && props.isHost) {
    emit('game-action', 'end_discussion', {})
  }
}
</script>

<template>
  <div class="playing-state ww-state" :class="{ 'is-night': phase === 'night' }">
    <WerewolfMomentOverlay
      v-if="WEREWOLF_MOMENT_OVERLAY_ENABLED && activeMoment"
      :key="activeMoment.id"
      :moment="activeMoment"
      @complete="completeMoment"
    />
    <template v-if="view">
      <div class="round-heading">
        <div>
          <span class="round-kicker">
            {{ view.day > 0 ? `第 ${view.day} ${phase === 'night' ? '夜' : '天'}` : '開局準備' }}
          </span>
          <h2>{{ PHASE_TITLES[phase] }}</h2>
        </div>
        <div class="timer-badge" :class="{ 'timer-low': remainingSeconds <= 5 }" role="timer">
          <strong>{{ remainingSeconds }}</strong>
          <span>秒</span>
        </div>
      </div>

      <WerewolfHistoryDialog
        :events="view.publicHistory"
        :players="props.players"
        button-label="查看公開紀錄"
        eyebrow="遊戲資訊"
        dialog-title="狼人殺公開紀錄"
      />

      <RoleCard :role="priv?.role ?? null" :teammate-names="teammateNames" />

      <p v-if="priv && !priv.alive" class="ww-notice ww-notice-dead" role="status">
        你已出局。可以繼續旁觀，但請不要透露任何身分資訊。
      </p>

      <section v-if="phase === 'role-reveal'" class="ww-panel ww-phase-panel" aria-live="polite">
        <WerewolfPhaseIllustration phase="role-reveal" />
        <h3>請記住你的身分</h3>
        <p>按住上方卡片查看身分，放開即隱藏。稍後會進入第一個夜晚。</p>
      </section>

      <section v-else-if="phase === 'night'" class="ww-panel ww-panel-night ww-phase-panel" aria-live="polite">
        <WerewolfPhaseIllustration phase="night" />
        <template v-if="priv?.acting && priv.camp === 'wolf'">
          <h3><WerewolfRoleIcon role-id="werewolf" :size="18" /> 選擇今晚要襲擊的玩家</h3>
          <p>與同伴討論後點選目標；最高票者被襲擊。</p>
          <button
            class="button button-secondary ww-inline-button"
            type="button"
            :disabled="!canAct"
            @click="act('wolf_target', { targetId: null })"
          >
            {{ priv.myTarget === null ? '目前：空刀' : '改為空刀' }}
          </button>
        </template>
        <template v-else-if="priv?.acting && priv.role === 'guard'">
          <h3><WerewolfRoleIcon role-id="guard" :size="18" /> 選擇要守護的玩家</h3>
          <p>
            被守護的人今晚不會被狼人殺死（可守護自己），但不能連續兩晚守護同一人。
            若守護的人同晚被女巫救起，反而會死亡。可隨時改選。
          </p>
          <button
            class="button button-secondary ww-inline-button"
            type="button"
            :disabled="!canAct"
            @click="act('guard_protect', { targetId: null })"
          >
            {{ priv.myTarget === null ? '目前：不守護' : '改為不守護' }}
          </button>
        </template>
        <template v-else-if="priv?.acting && priv.role === 'seer'">
          <h3><WerewolfRoleIcon role-id="seer" :size="18" /> 選擇要查驗的玩家</h3>
          <p v-if="priv.myTarget !== null">
            已查驗：{{ nameOf(priv.myTarget) }} 是
            <strong>{{ seerTonightCamp === 'wolf' ? '狼人' : '好人' }}</strong>。
          </p>
          <p v-else>點選一位玩家，立即得知他是好人或狼人。</p>
        </template>
        <template v-else-if="priv?.acting && priv.role === 'witch' && priv.witch">
          <h3><WerewolfRoleIcon role-id="witch" :size="18" /> 女巫行動</h3>
          <p v-if="priv.witch.victimId">今晚 {{ witchVictimName }} 被襲擊。</p>
          <p v-else>{{ priv.witch.antidote ? '今晚沒有人被襲擊。' : '解藥已用完，無法得知襲擊目標。' }}</p>
          <div class="ww-actions">
            <button
              class="button button-secondary ww-inline-button"
              type="button"
              :disabled="!canAct || !priv.witch.antidote || !priv.witch.victimId"
              @click="act('witch_action', { choice: 'save' })"
            >
              {{ priv.witch.saving ? '已選擇：使用解藥' : '使用解藥' }}
            </button>
            <button
              class="button button-secondary ww-inline-button"
              type="button"
              :disabled="!canAct || !priv.witch.poison || !selected"
              @click="act('witch_action', { choice: 'poison', targetId: selected })"
            >
              {{ priv.witch.poisonTargetId ? `已選擇：毒 ${nameOf(priv.witch.poisonTargetId)}` : '對所選玩家使用毒藥' }}
            </button>
            <button
              class="button button-secondary ww-inline-button"
              type="button"
              :disabled="!canAct"
              @click="act('witch_action', { choice: 'skip' })"
            >
              不使用藥水
            </button>
          </div>
          <p class="ww-hint">
            解藥：{{ priv.witch.antidote ? '可用' : '已用完' }} · 毒藥：{{ priv.witch.poison ? '可用（先點選下方玩家）' : '已用完' }}。
            時間結束時，未選擇即視為不使用。
          </p>
        </template>
        <template v-else>
          <h3>天黑請閉眼</h3>
          <p>請保持安靜，等待天亮。</p>
        </template>
      </section>

      <section v-else-if="phase === 'dawn'" class="ww-panel ww-phase-panel" aria-live="polite">
        <WerewolfPhaseIllustration phase="dawn" />
        <h3>天亮了</h3>
        <p>{{ deathText }}</p>
      </section>

      <section v-else-if="phase === 'hunter-shot'" class="ww-panel ww-phase-panel" aria-live="polite">
        <WerewolfPhaseIllustration phase="hunter-shot" />
        <template v-if="priv?.canShoot">
          <h3><WerewolfRoleIcon :role-id="priv.role" :size="18" /> 你可以開槍</h3>
          <p>選擇一位玩家帶走，或放棄開槍。</p>
          <div class="ww-actions">
            <button
              class="button button-primary ww-inline-button"
              type="button"
              :disabled="!props.canInteract || !shootPick"
              @click="emit('game-action', 'hunter_shoot', { targetId: shootPick })"
            >
              開槍
            </button>
            <button
              class="button button-secondary ww-inline-button"
              type="button"
              :disabled="!props.canInteract"
              @click="emit('game-action', 'hunter_shoot', { targetId: null })"
            >
              放棄
            </button>
          </div>
        </template>
        <template v-else>
          <h3>
            <WerewolfRoleIcon v-if="view.shooterRoleId" :role-id="view.shooterRoleId" :size="18" />
            開槍時刻
          </h3>
          <p>{{ hunterText }}</p>
        </template>
      </section>

      <section v-else-if="phase === 'pk-discussion'" class="ww-panel ww-phase-panel" aria-live="polite">
        <WerewolfPhaseIllustration phase="pk-discussion" />
        <h3>平票 PK 發言（{{ speakerProgress }}）</h3>
        <p>同票候選人依座位順序輪流發言，每人 {{ pkSpeechSeconds }} 秒：{{ pkCandidateNames }}。</p>
        <p class="ww-speaker">
          <strong>{{ isSpeaker ? '輪到你發言了' : `${nameOf(speakerId)} 發言中` }}</strong>
        </p>
        <ol class="ww-speech-order">
          <li
            v-for="(id, index) in view.speech?.order ?? view.pkCandidateIds"
            :key="id"
            :class="{ 'is-current': index === (view.speech?.index ?? 0), 'is-done': index < (view.speech?.index ?? 0), 'is-dead': !aliveSet.has(id) }"
          >
            {{ nameOf(id) }}
          </li>
        </ol>
        <button
          v-if="isSpeaker || isHost"
          class="button button-secondary ww-inline-button"
          type="button"
          :disabled="!props.canInteract"
          @click="endSpeech"
        >
          {{ isSpeaker ? '結束發言' : '跳過目前發言者' }}
        </button>
        <p class="ww-hint">候選人都發言後，所有存活玩家會再投票一次，只能選擇上述候選人。</p>
      </section>

      <section v-else-if="phase === 'day-discussion'" class="ww-panel ww-phase-panel" aria-live="polite">
        <WerewolfPhaseIllustration phase="day-discussion" />
        <template v-if="view.speech">
          <h3>輪流發言（{{ speakerProgress }}）</h3>
          <p>{{ deathText }}</p>
          <p class="ww-speaker">
            <strong>{{ isSpeaker ? '輪到你發言了' : `${nameOf(speakerId)} 發言中` }}</strong>
          </p>
          <ol class="ww-speech-order">
            <li
              v-for="(id, index) in view.speech.order"
              :key="id"
              :class="{ 'is-current': index === view.speech.index, 'is-done': index < view.speech.index, 'is-dead': !aliveSet.has(id) }"
            >
              {{ nameOf(id) }}
            </li>
          </ol>
          <button
            v-if="isSpeaker || isHost"
            class="button button-secondary ww-inline-button"
            type="button"
            :disabled="!props.canInteract"
            @click="endSpeech"
          >
            {{ isSpeaker ? '結束發言' : '跳過目前發言者' }}
          </button>
        </template>
        <template v-else>
          <h3>自由討論</h3>
          <p>{{ deathText }}請面對面或用語音討論，找出可疑的玩家。</p>
        </template>
        <p v-if="view.hunterShot" class="ww-hint">{{ hunterText }}</p>
        <button
          v-if="isHost"
          class="button button-secondary ww-inline-button"
          type="button"
          :disabled="!props.canInteract"
          @click="endDiscussion"
        >
          {{ view.speech ? '跳過全部發言，直接投票' : '提早進入投票' }}
        </button>
      </section>

      <section v-else-if="phase === 'vote'" class="ww-panel ww-phase-panel" aria-live="polite">
        <WerewolfPhaseIllustration phase="vote" />
        <template v-if="priv?.alive">
          <h3>投票放逐</h3>
          <p>選擇目標後確認；所有在線存活玩家投完會提早結算。時間到時，未確認的已選目標仍會計票，沒選擇則視為棄票。</p>
          <div class="ww-actions">
            <button
              class="button button-primary ww-inline-button"
              type="button"
              :disabled="!canAct || !selected"
              @click="submitVote(selected)"
            >
              {{ priv.hasVoted && selected === priv.myVote ? '已投票（可改選）' : '確認投票' }}
            </button>
            <button
              class="button button-secondary ww-inline-button"
              type="button"
              :disabled="!canAct"
              @click="submitVote(null)"
            >
              {{ priv.hasVoted && priv.myVote === null ? '已棄票' : '棄票' }}
            </button>
          </div>
        </template>
        <template v-else>
          <h3>投票放逐</h3>
          <p>存活的玩家正在投票。</p>
        </template>
        <p class="ww-hint">已投票 {{ view.votedIds.length }} / {{ view.aliveIds.length }} 人</p>
      </section>

      <section v-else-if="phase === 'pk-vote'" class="ww-panel ww-phase-panel" aria-live="polite">
        <WerewolfPhaseIllustration phase="pk-vote" />
        <template v-if="priv?.alive">
          <h3>平票 PK 複投</h3>
          <p>請只在同票候選人中選擇：{{ pkCandidateNames }}。所有在線存活玩家投完會提早結算；時間到時，未確認的已選目標仍會計票，沒選擇則視為棄票。</p>
          <div class="ww-actions">
            <button
              class="button button-primary ww-inline-button"
              type="button"
              :disabled="!canAct || !selected"
              @click="submitVote(selected)"
            >
              {{ priv.hasVoted && selected === priv.myVote ? '已複投（可改選）' : '確認複投' }}
            </button>
            <button
              class="button button-secondary ww-inline-button"
              type="button"
              :disabled="!canAct"
              @click="submitVote(null)"
            >
              {{ priv.hasVoted && priv.myVote === null ? '已棄票' : '棄票' }}
            </button>
          </div>
        </template>
        <template v-else>
          <h3>平票 PK 複投</h3>
          <p>存活玩家正在同票候選人中複投。</p>
        </template>
        <p class="ww-hint">已投票 {{ view.votedIds.length }} / {{ view.aliveIds.length }} 人</p>
      </section>

      <section v-else-if="phase === 'vote-result'" class="ww-panel ww-phase-panel" aria-live="polite">
        <WerewolfPhaseIllustration phase="vote-result" />
        <h3>{{ view.pkCandidateIds.length > 0 ? 'PK 複投結果' : '投票結果' }}</h3>
        <p v-if="view.exiledId">{{ nameOf(view.exiledId) }} 被放逐出局。</p>
        <p v-else-if="view.pkCandidateIds.length > 0">PK 複投仍平票或無有效票，無人放逐，遊戲繼續。</p>
        <p v-else>平票或無人投票，沒有人被放逐。</p>
        <ul class="ww-tally">
          <li v-for="entry in voteTally" :key="entry.targetId ?? 'abstain'">
            <strong>{{ entry.targetId === null ? '棄票' : nameOf(entry.targetId) }}</strong>
            <span>{{ entry.voters.length }} 票：{{ entry.voters.join('、') }}</span>
          </li>
        </ul>
        <p v-if="view.hunterShot" class="ww-hint">{{ hunterText }}</p>
      </section>

      <PlayerPicker
        :seats="seats"
        :selectable="selectable"
        :selected="selectedGuessRole ? null : selected"
        :selected-guess-role="selectedGuessRole"
        :disabled="!props.canInteract || mode === 'none'"
        @select="pick"
        @role-drop="dropRoleGuess"
        @clear-guess="clearRoleGuess"
      />

      <section class="ww-panel" aria-label="本局角色配置">
        <div class="ww-role-guess-heading">
          <div>
            <h3>本局角色配置（{{ view.seatIds.length }} 人）</h3>
            <p>選取或拖曳角色卡可以猜測玩家的角色；註記只暫存在你的畫面</p>
          </div>
        </div>
        <div class="ww-role-guess-cards">
          <button
            v-for="role in roleCountEntries"
            :key="role.id"
            class="ww-role-guess-card"
            :class="{ 'is-selected': selectedGuessRole === role.id }"
            type="button"
            :disabled="role.count === 0"
            :draggable="role.count > 0"
            :aria-pressed="selectedGuessRole === role.id"
            :aria-label="`選擇${role.name}角色卡，本局有 ${role.count} 位`"
            @click="selectGuessRole(role.id)"
            @dragstart="startRoleGuessDrag($event, role.id)"
          >
            <WerewolfRoleIcon :role-id="role.id" :size="24" />
            <span>{{ role.name }}</span>
            <strong>× {{ role.count }}</strong>
          </button>
        </div>
        <p class="ww-guess-status" role="status">
          {{
            selectedGuessRole
              ? `已選擇${WEREWOLF_ROLES[selectedGuessRole].name}，點擊玩家註記。`
              : '拖曳角色卡或點選卡片後再點玩家。'
          }}
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ww-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
}

.ww-state.is-night {
  margin: 0 -8px;
  padding: 18px 8px 12px;
  border-radius: 16px;
  background: #24213f;
  color: #e9e6ff;
}

.ww-state.is-night .round-heading h2, .ww-state.is-night .round-kicker {
  color: #e9e6ff;
}

.ww-phase-panel::after {
  display: block;
  clear: both;
  content: '';
}

.ww-panel {
  padding: 13px;
  border: 1px solid #eae8f2;
  border-radius: 14px;
  background: #fcfbff;
  color: var(--ink);
}

.ww-panel-night {
  border-color: #3b3766;
  background: #2f2b52;
  color: #e9e6ff;
}

.ww-panel h3 {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 800;
}

.ww-panel p {
  margin: 4px 0;
  font-size: 11px;
  line-height: 1.6;
}

.ww-hint {
  color: #89869b;
  font-size: 10px;
}

.ww-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.ww-inline-button {
  min-height: 38px;
  margin-top: 6px;
  padding: 0 14px;
  font-size: 12px;
}

.ww-actions .ww-inline-button {
  margin-top: 0;
}

.ww-notice {
  margin: 0;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 11px;
}

.ww-notice-dead {
  background: #f1f0f6;
  color: #6c6982;
}

.ww-role-guess-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.ww-role-guess-heading p {
  color: #77738e;
}

.ww-role-guess-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(82px, 1fr));
  gap: 6px;
  margin-top: 10px;
}

.ww-role-guess-card {
  display: flex;
  min-width: 0;
  min-height: 78px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 7px 5px;
  border: 1px solid #eae8f2;
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 10px;
  cursor: grab;
  touch-action: manipulation;
}

.ww-role-guess-card:active {
  cursor: grabbing;
}

.ww-role-guess-card.is-selected {
  border-color: var(--purple);
  background: #eeebff;
  box-shadow: 0 0 0 2px rgb(104 84 177 / 14%);
}

.ww-role-guess-card:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ww-role-guess-card strong {
  color: var(--purple-dark);
  font-size: 10px;
}

.ww-guess-status {
  margin: 8px 0 0;
  color: #77738e;
  font-size: 10px;
  line-height: 1.5;
}

.ww-tally {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.ww-tally li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f1efff;
  font-size: 11px;
}

.ww-tally span {
  color: #77738e;
  font-size: 10px;
}

.ww-speaker {
  margin: 8px 0;
  font-size: 15px;
}

.ww-speech-order {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
  padding: 0;
  list-style: none;
  counter-reset: speech;
}

.ww-speech-order li {
  counter-increment: speech;
  padding: 4px 10px;
  border-radius: 999px;
  background: #f1efff;
  color: #5c5875;
  font-size: 11px;
}

.ww-speech-order li::before {
  content: counter(speech) '. ';
}

.ww-speech-order li.is-current {
  background: var(--purple, #6f5cff);
  color: #fff;
  font-weight: 700;
}

.ww-speech-order li.is-done, .ww-speech-order li.is-dead {
  opacity: 0.45;
}

.ww-speech-order li.is-dead {
  text-decoration: line-through;
}
</style>
