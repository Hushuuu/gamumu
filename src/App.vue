<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { AVATARS, type AvatarId } from '../shared/avatars'
import {
  DEFAULT_GAME_ID,
  GAME_OPTIONS,
  getGameOption,
  getPlayerRange,
  getWerewolfRoleCounts,
  ROOM_CAPACITY,
  WEREWOLF_ROLES,
  WEREWOLF_SCRIPTS,
  isWerewolfScriptId,
  type GameId,
  type WerewolfRoleId,
} from '../shared/games'
import type { ClientMessage } from '../shared/protocol'
import { useGameRoom } from './composables/useGameRoom'
import { GAME_COMPONENTS } from './games/registry'
import GameSelectionDialog from './games/GameSelectionDialog.vue'
import GameRulesDialog from './games/GameRulesDialog.vue'
import {
  ApiError,
  createRoomRequest,
  getBetaSession,
  joinRoomRequest,
  redeemBetaCode,
} from './services/api'
import {
  loadBetaSession,
  removeBetaSession,
  saveBetaSession,
} from './services/betaSession'
import { loadRoomToken, removeRoomToken, saveRoomToken } from './services/session'

const {
  snapshot,
  connectionStatus,
  errorMessage,
  gameEvent,
  gameAbortedCount,
  playerId,
  removedFromRoom,
  betaAccessExpired,
  connect,
  disconnect,
  send,
  leaveRoom: leaveGameRoom,
} = useGameRoom()

const playerName = ref('')
const roomCodeInput = ref('')
const activeRoomCode = ref('')
const betaCode = ref('')
const betaSessionToken = ref('')
const betaSessionExpiresAt = ref(0)
const betaStatus = ref<'checking' | 'locked' | 'authorized' | 'error'>('checking')
const betaError = ref('')
const isBetaLoading = ref(false)
const isInviteJoinPromptOpen = ref(false)
const shouldPromptForInviteJoin = ref(false)
const inviteJoinDialog = ref<HTMLDialogElement | null>(null)
const inviteJoinNameInput = ref<HTMLInputElement | null>(null)
const isLoading = ref(false)
const pageError = ref('')
const pageNotice = ref('')
const devRoleId = ref<WerewolfRoleId | ''>('')
const isDevelopmentBuild = import.meta.env.DEV

let noticeTimer: number | undefined
let betaExpiryTimer: number | undefined

const normalizedName = computed(() => playerName.value.trim())
const hasBetaAccess = computed(() => {
  return betaStatus.value === 'authorized' && betaSessionExpiresAt.value > Date.now()
})
const betaExpiryLabel = computed(() => {
  return betaSessionExpiresAt.value > 0
    ? new Date(betaSessionExpiresAt.value).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
    : ''
})
const validName = computed(() => {
  const length = Array.from(normalizedName.value).length
  return length >= 1 && length <= 20
})
const normalizedRoomCode = computed(() => normalizeRoomCode(roomCodeInput.value))
const canJoin = computed(() => {
  return validName.value && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(normalizedRoomCode.value)
})
const currentPlayer = computed(() => {
  return snapshot.value?.players.find((player) => player.id === playerId.value) ?? null
})
const isHost = computed(() => {
  return Boolean(snapshot.value && playerId.value && snapshot.value.hostId === playerId.value)
})
const readyCount = computed(() => snapshot.value?.players.filter((player) => player.ready).length ?? 0)
const selectedGame = computed(() => {
  return getGameOption(snapshot.value?.selectedGameId ?? DEFAULT_GAME_ID)
})
const gameComponents = computed(() => {
  return GAME_COMPONENTS[snapshot.value?.selectedGameId ?? DEFAULT_GAME_ID]
})
const devRoleOptions = computed(() => {
  const room = snapshot.value
  if (room?.selectedGameId !== 'werewolf' || !isWerewolfScriptId(room.gameSettings.scriptId)) {
    return []
  }

  const script = WEREWOLF_SCRIPTS.find((candidate) => candidate.id === room.gameSettings.scriptId)
  const counts = getWerewolfRoleCounts(room.gameSettings.scriptId, room.players.length)
  if (!script || !counts) {
    return []
  }

  return script.roles
    .filter((roleId) => counts[roleId] > 0)
    .map((roleId) => ({ id: roleId, name: WEREWOLF_ROLES[roleId].name, count: counts[roleId] }))
})
const playerRange = computed(() => {
  return getPlayerRange(selectedGame.value.id, snapshot.value?.gameSettings)
})
const playerCountIssue = computed(() => {
  const count = snapshot.value?.players.length ?? 0
  if (count < playerRange.value.min) {
    return `此遊戲至少需要 ${playerRange.value.min} 位玩家。`
  }
  if (count > playerRange.value.max) {
    return `此遊戲最多允許 ${playerRange.value.max} 位玩家，請房主移除多出的玩家或更換遊戲。`
  }
  return ''
})
const allPlayersReady = computed(() => {
  const players = snapshot.value?.players ?? []
  return players.length > 0 && players.every((player) => player.online && player.ready)
})
const canStartGame = computed(() => {
  return Boolean(
    isHost.value &&
    connectionStatus.value === 'connected' &&
    snapshot.value?.status === 'waiting' &&
    snapshot.value.gameSelectionConfirmed &&
    !playerCountIssue.value &&
    allPlayersReady.value,
  )
})
const startHint = computed(() => {
  if (!snapshot.value?.gameSelectionConfirmed) {
    return '請先選擇本局遊戲。'
  }
  if (playerCountIssue.value) {
    return playerCountIssue.value
  }
  return allPlayersReady.value ? '' : '所有玩家（包含房主）都在線並準備好後才能開始。'
})
const sortedPlayers = computed(() => {
  const players = snapshot.value?.players ?? []
  return [...players].sort((left, right) => right.score - left.score)
})
const shareUrl = computed(() => {
  if (!activeRoomCode.value) {
    return ''
  }
  const url = new URL(window.location.href)
  url.searchParams.set('room', activeRoomCode.value)
  return url.toString()
})

watch(
  [
    () => snapshot.value?.selectedGameId,
    () => snapshot.value?.gameSettings.scriptId,
  ],
  () => {
    devRoleId.value = ''
  },
)
watch(devRoleOptions, (options) => {
  if (devRoleId.value && !options.some((role) => role.id === devRoleId.value)) {
    devRoleId.value = ''
  }
})
watch(() => snapshot.value?.status, (status) => {
  if (status === 'playing') {
    devRoleId.value = ''
  }
})
watch(gameAbortedCount, (count, previousCount) => {
  if (count > previousCount) {
    window.alert('室長已提前結束本局遊戲。')
  }
})

watch(removedFromRoom, (removed) => {
  if (!removed) {
    return
  }

  const code = activeRoomCode.value
  disconnect()
  const storageWarning = code ? removeRoomToken(code) : null
  activeRoomCode.value = ''
  roomCodeInput.value = ''
  removeRoomFromUrl()
  showNotice(storageWarning
    ? `房主已將你移出房間。${storageWarning}`
    : '房主已將你移出房間。')
})

watch(betaAccessExpired, (expired) => {
  if (expired) {
    lockBetaSession('驗證已失效，請重新輸入封測碼。')
  }
})

watch(isInviteJoinPromptOpen, (isOpen) => {
  if (!isOpen) {
    return
  }

  void nextTick(() => {
    if (!isInviteJoinPromptOpen.value) {
      return
    }

    const dialog = inviteJoinDialog.value
    if (!dialog) {
      return
    }
    if (!dialog.open) {
      dialog.showModal()
    }
    inviteJoinNameInput.value?.focus()
  })
})

onMounted(() => {
  void initializeBetaSession()
})

onUnmounted(() => {
  if (noticeTimer !== undefined) {
    window.clearTimeout(noticeTimer)
  }
  if (betaExpiryTimer !== undefined) {
    window.clearTimeout(betaExpiryTimer)
  }
})

async function initializeBetaSession(): Promise<void> {
  const url = new URL(window.location.href)
  const roomCode = normalizeRoomCode(url.searchParams.get('room') ?? '')
  const hasValidRoomCode = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(roomCode)
  const betaCodeFromUrl = (
    url.searchParams.get('beta')?.trim() ||
    url.searchParams.get('betaCode')?.trim() ||
    ''
  )
  const hasBetaCodeQuery = url.searchParams.has('beta') || url.searchParams.has('betaCode')

  if (hasValidRoomCode) {
    roomCodeInput.value = roomCode
  }
  if (hasBetaCodeQuery) {
    url.searchParams.delete('beta')
    url.searchParams.delete('betaCode')
    window.history.replaceState(null, '', url)
  }
  if (betaCodeFromUrl) {
    shouldPromptForInviteJoin.value = hasValidRoomCode
    betaCode.value = betaCodeFromUrl
    await unlockBeta()
    return
  }

  const storedBetaSession = loadBetaSession()
  if (storedBetaSession.error) {
    betaError.value = storedBetaSession.error
  }
  if (!storedBetaSession.session) {
    betaStatus.value = 'locked'
    return
  }

  betaStatus.value = 'checking'
  try {
    const expiresAt = await getBetaSession(storedBetaSession.session.token)
    activateBetaSession({ token: storedBetaSession.session.token, expiresAt })
    resumeRoomFromUrl()
  } catch (error) {
    if (error instanceof ApiError && error.code === 'BETA_ACCESS_REQUIRED') {
      removeBetaSession()
      betaStatus.value = 'locked'
      betaError.value = error.message
      return
    }

    betaStatus.value = 'error'
    betaError.value = errorMessageFrom(error)
  }
}

async function unlockBeta(): Promise<void> {
  if (isBetaLoading.value) {
    return
  }
  if (!betaCode.value.trim()) {
    betaError.value = '請輸入封測碼。'
    return
  }

  betaError.value = ''
  betaStatus.value = 'checking'
  isBetaLoading.value = true
  try {
    const session = await redeemBetaCode(betaCode.value.trim())
    const storageWarning = saveBetaSession(session)
    activateBetaSession(session)
    betaCode.value = ''
    if (storageWarning) {
      showNotice(storageWarning)
    }
    resumeRoomFromUrl()
  } catch (error) {
    betaStatus.value = 'locked'
    betaError.value = errorMessageFrom(error)
  } finally {
    isBetaLoading.value = false
  }
}

function activateBetaSession(session: { token: string; expiresAt: number }): void {
  betaSessionToken.value = session.token
  betaSessionExpiresAt.value = session.expiresAt
  betaStatus.value = 'authorized'
  betaError.value = ''
  if (betaExpiryTimer !== undefined) {
    window.clearTimeout(betaExpiryTimer)
  }
  betaExpiryTimer = window.setTimeout(() => {
    betaExpiryTimer = undefined
    lockBetaSession('驗證已到期，請重新輸入封測碼。')
  }, Math.max(0, session.expiresAt - Date.now()))
}

function lockBetaSession(message: string): void {
  if (betaExpiryTimer !== undefined) {
    window.clearTimeout(betaExpiryTimer)
    betaExpiryTimer = undefined
  }

  cancelInviteJoinPrompt()
  const roomCode = activeRoomCode.value
  betaSessionToken.value = ''
  betaSessionExpiresAt.value = 0
  betaStatus.value = 'locked'
  betaError.value = message
  pageError.value = ''

  const storageWarning = removeBetaSession()
  if (storageWarning) {
    betaError.value = `${message} ${storageWarning}`
  }

  if (roomCode) {
    disconnect()
    activeRoomCode.value = ''
    roomCodeInput.value = roomCode
    showNotice(message)
  }
}

function resumeRoomFromUrl(): void {
  const code = normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '')
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)) {
    return
  }

  roomCodeInput.value = code
  const stored = loadRoomToken(code)
  if (stored.error) {
    showNotice(stored.error)
  }
  if (stored.token) {
    enterRoom(code, stored.token)
    return
  }

  if (shouldPromptForInviteJoin.value) {
    shouldPromptForInviteJoin.value = false
    pageError.value = ''
    isInviteJoinPromptOpen.value = true
  }
}

function cancelInviteJoinPrompt(): void {
  shouldPromptForInviteJoin.value = false
  isInviteJoinPromptOpen.value = false
}

async function createRoom(): Promise<void> {
  if (!hasBetaAccess.value) {
    pageError.value = '請先輸入有效的封測碼。'
    return
  }
  if (isLoading.value || !validName.value) {
    pageError.value = '暱稱請填 1 到 20 個字元。'
    return
  }

  pageError.value = ''
  isLoading.value = true
  try {
    const credentials = await createRoomRequest(normalizedName.value, betaSessionToken.value)
    const storageWarning = saveRoomToken(credentials.code, credentials.token)
    enterRoom(credentials.code, credentials.token)
    if (storageWarning) {
      showNotice(storageWarning)
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'BETA_ACCESS_REQUIRED') {
      lockBetaSession(error.message)
      return
    }
    pageError.value = errorMessageFrom(error)
  } finally {
    isLoading.value = false
  }
}

async function joinRoom(): Promise<void> {
  if (!hasBetaAccess.value) {
    pageError.value = '請先輸入有效的封測碼。'
    return
  }
  if (isLoading.value) {
    return
  }
  if (!validName.value) {
    pageError.value = '暱稱請填 1 到 20 個字元。'
    return
  }
  if (!canJoin.value) {
    pageError.value = '請輸入 6 碼有效房間代碼。'
    return
  }

  pageError.value = ''
  isLoading.value = true
  try {
    const credentials = await joinRoomRequest(
      normalizedRoomCode.value,
      normalizedName.value,
      betaSessionToken.value,
    )
    const storageWarning = saveRoomToken(credentials.code, credentials.token)
    enterRoom(credentials.code, credentials.token)
    if (storageWarning) {
      showNotice(storageWarning)
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'BETA_ACCESS_REQUIRED') {
      lockBetaSession(error.message)
      return
    }
    pageError.value = errorMessageFrom(error)
  } finally {
    isLoading.value = false
  }
}

function enterRoom(code: string, token: string): void {
  shouldPromptForInviteJoin.value = false
  isInviteJoinPromptOpen.value = false
  activeRoomCode.value = code
  roomCodeInput.value = code
  pageError.value = ''
  updateRoomUrl(code)
  connect(code, token, betaSessionToken.value)
}

function updateRoomCodeInput(event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    roomCodeInput.value = normalizeRoomCode(target.value)
  }
}

function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

function updateRoomUrl(code: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set('room', code)
  window.history.replaceState(null, '', url)
}

function removeRoomFromUrl(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('room')
  window.history.replaceState(null, '', url)
}

async function copyInviteLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    showNotice('邀請連結已複製，可以傳給朋友了。')
  } catch {
    showNotice(`無法使用剪貼簿，請直接分享房間代碼 ${activeRoomCode.value}。`)
  }
}

async function leaveRoom(): Promise<void> {
  if (!window.confirm('確定離開房間嗎？離開後會從玩家列表移除。')) {
    return
  }

  const code = activeRoomCode.value
  await leaveGameRoom()
  const storageWarning = removeRoomToken(code)
  activeRoomCode.value = ''
  roomCodeInput.value = ''
  removeRoomFromUrl()
  if (storageWarning) {
    showNotice(storageWarning)
  }
}

function startGame(): void {
  if (
    isDevelopmentBuild &&
    snapshot.value?.selectedGameId === 'werewolf' &&
    devRoleId.value
  ) {
    send({ type: 'start_game', devRoleId: devRoleId.value })
    return
  }
  send({ type: 'start_game' })
}

function toggleReady(): void {
  if (!currentPlayer.value) {
    return
  }

  send({ type: 'set_ready', ready: !currentPlayer.value.ready })
}

function selectAvatar(avatarId: AvatarId): void {
  send({ type: 'select_avatar', avatarId })
}

function avatarUrl(avatarId: AvatarId): string {
  return `${import.meta.env.BASE_URL}avatars/${avatarId}.svg`
}

function selectGame(gameId: GameId): void {
  send({ type: 'select_game', gameId })
}

function configureGame(settings: Record<string, unknown>): void {
  const gameId = snapshot.value?.selectedGameId
  if (!gameId) {
    return
  }

  send({ type: 'configure_game', gameId, settings })
}

function kickPlayer(playerIdToKick: string, name: string): void {
  if (!window.confirm(`確定要將「${name}」移出房間嗎？`)) {
    return
  }

  send({ type: 'kick_player', playerId: playerIdToKick })
}

function sendGameAction(action: string, payload: Record<string, unknown>): void {
  const gameId = snapshot.value?.selectedGameId
  if (!gameId) {
    return
  }

  const message: ClientMessage = { type: 'game_action', gameId, action, payload }
  send(message)
}

function abortGame(): void {
  if (!isHost.value || snapshot.value?.status !== 'playing') {
    return
  }

  const confirmed = window.confirm(
    '確定要提前結束本局嗎？本局將作廢、不結算，期間累積的分數也會回復到開局前，並回到選擇遊戲階段。',
  )
  if (!confirmed) {
    return
  }

  send({ type: 'abort_game' })
}

function prepareNextGame(): void {
  send({ type: 'prepare_next_game' })
}

function showNotice(message: string): void {
  pageNotice.value = message
  if (noticeTimer !== undefined) {
    window.clearTimeout(noticeTimer)
  }
  noticeTimer = window.setTimeout(() => {
    pageNotice.value = ''
    noticeTimer = undefined
  }, 5_000)
}

function errorMessageFrom(error: unknown): string {
  return error instanceof Error ? error.message : '發生未預期的錯誤，請稍後再試。'
}

function connectionLabel(): string {
  switch (connectionStatus.value) {
    case 'connected':
      return '已連線'
    case 'connecting':
      return '連線中'
    case 'reconnecting':
      return '重新連線中'
    default:
      return '未連線'
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <a class="brand" href="./" aria-label="GAMUMU 首頁">
        <span class="brand-mark" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
        <span class="brand-name">GAMUMU</span>
      </a>
      <div class="header-status">
        <span class="status-dot"></span>
        <span>派對現在開始</span>
      </div>
    </header>

    <main v-if="!activeRoomCode" class="home-main">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow"><span></span> 不用下載，開了就能玩</p>
          <h1>好玩的事，<br /><span>一起發生。</span></h1>
          <p class="hero-description">
            隨時隨地開啟你的小小派對，笑聲開始了。
          </p>
          <div class="hero-tags" aria-label="遊戲特色">
            <span>即時連線</span>
            <span>最多 12 人</span>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="confetti confetti-one">✦</div>
          <div class="confetti confetti-two">✳</div>
          <div class="game-card game-card-back"></div>
          <div class="game-card game-card-front">
            <span class="card-spark">✦</span>
            <span class="card-caption">你的派對<br />已就緒</span>
            <span class="card-emoji">🎉</span>
          </div>
          <span class="art-orbit orbit-one"></span>
          <span class="art-orbit orbit-two"></span>
        </div>
      </section>

      <section class="entry-card" aria-labelledby="entry-title">
        <div class="entry-heading">
          <div>
            <p class="eyebrow">第一步</p>
            <h2 id="entry-title">先取個暱稱</h2>
          </div>
          <span class="entry-number">01</span>
        </div>

        <div v-if="betaStatus === 'checking'" class="beta-checking" role="status">
          正在確認資格…
        </div>
        <form v-else-if="betaStatus !== 'authorized'" class="beta-gate" @submit.prevent="unlockBeta">
          <label class="field-label" for="beta-code">封測驗證碼</label>
          <div class="beta-code-row">
            <input
              id="beta-code"
              v-model="betaCode"
              class="text-input beta-code-input"
              type="text"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              maxlength="64"
              placeholder="輸入封測碼"
              :disabled="isBetaLoading"
            />
            <button class="button button-primary beta-verify-button" type="submit" :disabled="isBetaLoading">
              {{ isBetaLoading ? '驗證中…' : '驗證' }}
            </button>
          </div>
          <p class="beta-hint">驗證通過後，此分頁可使用 6 小時。</p>
          <p v-if="betaError" class="inline-message error-message" role="alert">{{ betaError }}</p>
        </form>
        <div v-else class="beta-session-banner" role="status">
          <span class="beta-session-dot" aria-hidden="true"></span>
          <span>驗證有效至 {{ betaExpiryLabel }}</span>
        </div>

        <label class="field-label" for="player-name">大家會怎麼稱呼你？</label>
        <input
          id="player-name"
          v-model="playerName"
          class="text-input"
          type="text"
          autocomplete="nickname"
          maxlength="20"
          placeholder="輸入暱稱，最多 20 個字"
          @keydown.enter.prevent="createRoom"
        />

        <button
          class="button button-primary create-button"
          :disabled="isLoading || !validName || !hasBetaAccess"
          @click="createRoom"
        >
          <span>{{ isLoading ? '準備房間中…' : '建立新房間' }}</span>
          <span class="button-icon" aria-hidden="true">↗</span>
        </button>

        <div class="separator"><span>或加入朋友的房間</span></div>

        <label class="field-label" for="room-code">輸入 6 碼房間代碼</label>
        <div class="join-row">
          <input
            id="room-code"
            class="text-input code-input"
            type="text"
            inputmode="text"
            autocomplete="off"
            maxlength="6"
            :value="roomCodeInput"
            placeholder="例如 A7K2MP"
            aria-label="房間代碼"
            @input="updateRoomCodeInput"
            @keydown.enter.prevent="joinRoom"
          />
          <button
            class="button button-secondary join-button"
            :disabled="isLoading || !canJoin || !hasBetaAccess"
            @click="joinRoom"
          >
            {{ isLoading ? '加入中…' : '加入' }}
          </button>
        </div>

        <p v-if="pageError" class="inline-message error-message" role="alert">{{ pageError }}</p>
        <p v-else-if="pageNotice" class="inline-message notice-message" role="status">{{ pageNotice }}</p>
        <p class="privacy-note"><span aria-hidden="true">✦</span> 不用註冊，也不需要帳號</p>
      </section>

      <section class="how-it-works" aria-label="遊戲流程">
        <div><span class="how-number">01</span><span>開一間房</span></div>
        <span class="how-arrow" aria-hidden="true">→</span>
        <div><span class="how-number">02</span><span>分享給朋友</span></div>
        <span class="how-arrow" aria-hidden="true">→</span>
        <div><span class="how-number">03</span><span>開始玩樂</span></div>
      </section>
    </main>

    <main v-else class="room-main">
      <div class="room-toolbar">
        <button class="back-button" type="button" @click="leaveRoom">
          <span aria-hidden="true">←</span>
          <span>離開房間</span>
        </button>
        <div class="connection-pill" :class="`connection-${connectionStatus}`">
          <span class="status-dot"></span>
          {{ connectionLabel() }}
        </div>
      </div>

      <section class="room-intro">
        <div>
          <p class="eyebrow">你的派對房間</p>
          <h1>{{ activeRoomCode.slice(0, 3) }} <span>{{ activeRoomCode.slice(3) }}</span></h1>
          <p class="room-subtitle">邀請朋友加入，湊齊人就開始玩。</p>
        </div>
        <div class="room-sticker" aria-hidden="true">✦</div>
      </section>

      <div class="invite-row">
        <div class="invite-copy">
          <span class="invite-icon" aria-hidden="true">↗</span>
          <span>分享邀請連結</span>
        </div>
        <button class="copy-button" type="button" @click="copyInviteLink">
          <span aria-hidden="true">▢</span>
          複製
        </button>
      </div>

      <p v-if="pageNotice" class="room-notice" role="status">{{ pageNotice }}</p>
      <p v-if="errorMessage" class="room-error" role="alert">{{ errorMessage }}</p>

      <section v-if="!snapshot" class="game-panel loading-panel" aria-live="polite">
        <span class="loading-spinner" aria-hidden="true"></span>
        <h2>{{ connectionStatus === 'reconnecting' ? '正在重新連線' : '正在進入房間' }}</h2>
        <p>請稍等一下，馬上就好。</p>
      </section>

      <template v-else>
        <section v-if="snapshot.status !== 'playing'" class="avatar-panel" aria-labelledby="avatar-panel-title">
          <div class="avatar-panel-heading">
            <div>
              <p class="eyebrow">你的識別</p>
              <h2 id="avatar-panel-title">選擇你的頭像</h2>
              <p>房間裡的玩家都看得到，也可以隨時更換。</p>
            </div>
          </div>
          <div class="avatar-grid" role="group" aria-label="可選頭像">
            <button
              v-for="avatar in AVATARS"
              :key="avatar.id"
              class="avatar-choice"
              :class="{ 'is-selected': currentPlayer?.avatarId === avatar.id }"
              type="button"
              :aria-pressed="currentPlayer?.avatarId === avatar.id"
              :aria-label="`選擇${avatar.label}頭像`"
              :disabled="connectionStatus !== 'connected' || !currentPlayer"
              @click="selectAvatar(avatar.id)"
            >
              <img :src="avatarUrl(avatar.id)" :alt="avatar.label" />
              <span>{{ avatar.label }}</span>
            </button>
          </div>
        </section>

        <section class="game-panel">
          <div class="game-panel-heading">
            <span class="game-type">
              <span aria-hidden="true">✦</span>
              {{
                snapshot.status === 'waiting' &&
                !snapshot.gameSelectionConfirmed
                  ? isHost ? '尚未選擇遊戲' : '等待室長選擇遊戲'
                  : selectedGame.name
              }}
            </span>
            <div class="game-panel-heading-actions">
              <GameRulesDialog
                v-if="snapshot.status !== 'waiting' || isHost || snapshot.gameSelectionConfirmed"
                :game-id="selectedGame.id"
                :game-settings="snapshot.gameSettings"
                :player-count="snapshot.players.length"
              />
              <span class="player-count">{{ snapshot.players.length }} / {{ ROOM_CAPACITY }} 人</span>
            </div>
          </div>

          <div v-if="snapshot.status === 'waiting'" class="waiting-state">
            <div class="waiting-illustration" aria-hidden="true">
              <span class="waiting-star star-a">✦</span>
              <span class="waiting-star star-b">✧</span>
              <span class="waiting-circle"></span>
              <span class="waiting-face">☺</span>
            </div>
            <h2>
              {{
                !snapshot.gameSelectionConfirmed
                  ? isHost ? '先選擇本局遊戲' : '等待室長選擇遊戲'
                  : playerCountIssue
                    ? '確認本局人數'
                    : allPlayersReady
                      ? '大家準備好了！'
                      : '準備好了嗎？'
              }}
            </h2>
            <p>
              {{
                !snapshot.gameSelectionConfirmed
                  ? isHost
                    ? '滑動遊戲卡挑選玩法，確認後才會同步給房間裡的所有人。'
                    : '室長選好遊戲後，就能一起查看玩法並準備開局。'
                  : playerCountIssue || '每位玩家都按下準備後，房主就可以開始。'
              }}
            </p>

            <div class="game-choice-panel">
              <div v-if="isHost" class="game-choice-intro">
                <p class="game-choice-heading">挑選今晚的派對主題</p>
                <p>
                  {{
                    snapshot.gameSelectionConfirmed
                      ? `目前房間選擇：${selectedGame.name}。確認另一款遊戲後才會同步給大家。`
                      : '你可以先瀏覽卡片；確認遊戲後，房間裡的所有人才會看到你的選擇。'
                  }}
                </p>
              </div>
              <div v-else class="game-choice-wait" role="status">
                <span class="game-choice-wait-icon" aria-hidden="true">
                  {{ snapshot.gameSelectionConfirmed ? selectedGame.icon : '…' }}
                </span>
                <span>
                  <strong>
                    {{
                      snapshot.gameSelectionConfirmed
                        ? `室長選擇了${selectedGame.name}`
                        : '等待室長選擇遊戲'
                    }}
                  </strong>
                  <small>
                    {{
                      snapshot.gameSelectionConfirmed
                        ? '你可以先瀏覽遊戲卡，房間設定只由室長修改。'
                        : '也可以先開啟遊戲列表瀏覽玩法，這不會更改房間選擇。'
                    }}
                  </small>
                </span>
              </div>
              <GameSelectionDialog
                :games="GAME_OPTIONS"
                :selected-game-id="snapshot.selectedGameId"
                :selection-confirmed="snapshot.gameSelectionConfirmed"
                :game-settings="snapshot.gameSettings"
                :player-count="snapshot.players.length"
                :can-select="isHost"
                :can-confirm="connectionStatus === 'connected'"
                @select="selectGame"
              />
              <p v-if="isHost" class="game-choice-note">
                更換已確認的遊戲會清除所有人的準備狀態；各款遊戲的人數需求會顯示在卡片上。
              </p>
            </div>

            <section
              v-if="isDevelopmentBuild && isHost && snapshot.selectedGameId === 'werewolf'"
              class="dev-role-selection"
              aria-labelledby="dev-role-selection-title"
            >
              <label for="dev-role-selection">
                <span id="dev-role-selection-title">開發測試：房主角色自選</span>
                <select
                  id="dev-role-selection"
                  v-model="devRoleId"
                  :disabled="connectionStatus !== 'connected' || devRoleOptions.length === 0"
                >
                  <option value="">隨機分配</option>
                  <option v-for="role in devRoleOptions" :key="role.id" :value="role.id">
                    {{ role.name }}（本局 {{ role.count }} 位）
                  </option>
                </select>
              </label>
              <p>只指定房主自己的身分，其他玩家仍依本局劇本隨機分配；正式部署的 Worker 不接受此選角。</p>
              <p v-if="devRoleOptions.length === 0" class="dev-role-selection-warning">
                目前人數不適用所選劇本，請先調整劇本或玩家人數。
              </p>
            </section>

            <component
              v-if="gameComponents.setup && (isHost || snapshot.gameSelectionConfirmed)"
              :is="gameComponents.setup"
              :settings="snapshot.gameSettings"
              :is-host="isHost"
              :can-configure="connectionStatus === 'connected'"
              @configure-game="configureGame"
            />

            <div class="ready-controls">
              <button
                class="button button-secondary ready-button"
                type="button"
                :disabled="connectionStatus !== 'connected' || !currentPlayer"
                @click="toggleReady"
              >
                {{ currentPlayer?.ready ? '取消準備' : '我已準備好' }}
              </button>
              <span class="ready-count" role="status">{{ readyCount }} / {{ snapshot.players.length }} 人已準備</span>
              <button
                v-if="isHost"
                class="button button-primary start-button"
                type="button"
                :disabled="!canStartGame"
                @click="startGame"
              >
                開始 {{ selectedGame.name }} <span aria-hidden="true">→</span>
              </button>
            </div>
            <p v-if="isHost && !canStartGame" class="start-hint">
              {{ startHint }}
            </p>
          </div>

          <div v-else-if="snapshot.status === 'playing' && snapshot.game">
            <div v-if="isHost" class="game-host-actions">
              <button
                class="button button-secondary abort-game-button"
                type="button"
                :disabled="connectionStatus !== 'connected'"
                @click="abortGame"
              >
                提前結束本局
              </button>
            </div>
            <component
              :is="gameComponents.playing"
              :game="snapshot.game"
              :game-event="gameEvent"
              :players="snapshot.players"
              :player-id="playerId"
              :game-name="selectedGame.name"
              :is-host="isHost"
              :can-interact="connectionStatus === 'connected'"
              @game-action="sendGameAction"
            />
          </div>

          <div v-else class="finished-state">
            <component :is="gameComponents.finished" :players="sortedPlayers" :game="snapshot.game" />
            <button
              v-if="isHost"
              class="button button-primary start-button"
              type="button"
              :disabled="connectionStatus !== 'connected'"
              @click="prepareNextGame"
            >
              準備下一局 <span aria-hidden="true">→</span>
            </button>
            <div v-else class="waiting-status">
              <span class="status-dot"></span>
              等待房主準備下一局
            </div>
          </div>
        </section>

        <section class="players-panel" aria-labelledby="players-heading">
          <div class="players-heading">
            <div>
              <p class="eyebrow">同場玩家</p>
              <h2 id="players-heading">大家都在這裡</h2>
            </div>
            <span class="capacity-pill">{{ snapshot.players.length }} / {{ snapshot.capacity }}</span>
          </div>

          <ol class="player-list">
            <li v-for="player in sortedPlayers" :key="player.id" class="player-row">
              <span class="player-avatar">
                <img :src="avatarUrl(player.avatarId)" alt="" />
              </span>
              <div class="player-info">
                <div class="player-name-row">
                  <strong>{{ player.name }}</strong>
                  <span v-if="player.id === snapshot.hostId" class="host-tag">房主</span>
                  <span v-if="player.id === playerId" class="you-tag">你</span>
                </div>
                <span class="player-subtitle">
                  <span class="player-online-dot" :class="{ 'is-offline': !player.online }"></span>
                  {{ player.online ? (player.answered ? '本題已作答' : '在線') : '等待重新連線' }}
                  <span
                    v-if="snapshot.status === 'waiting'"
                    class="ready-tag"
                    :class="{ 'is-ready': player.ready }"
                  >
                    {{ player.ready ? '已準備' : '未準備' }}
                  </span>
                  <span v-if="player.correct" class="correct-tag">答對</span>
                </span>
              </div>
              <strong class="player-score">
                {{ player.score }}<small>分</small>
              </strong>
              <button
                v-if="isHost && snapshot.status === 'waiting' && player.id !== playerId"
                class="kick-button"
                type="button"
                :aria-label="`將${player.name}移出房間`"
                @click="kickPlayer(player.id, player.name)"
              >
                移除
              </button>
            </li>
          </ol>

          <p class="room-capacity-note">房間最多 {{ ROOM_CAPACITY }} 位玩家</p>
        </section>
      </template>
    </main>

    <Teleport to="body">
      <dialog
        v-if="isInviteJoinPromptOpen"
        ref="inviteJoinDialog"
        class="invite-join-dialog"
        aria-labelledby="invite-join-title"
        @cancel.prevent="cancelInviteJoinPrompt"
        @click.self="cancelInviteJoinPrompt"
      >
        <form class="invite-join-content" @submit.prevent="joinRoom">
          <p class="eyebrow">加入朋友的房間</p>
          <h2 id="invite-join-title">先留個稱呼</h2>
          <p class="invite-join-description">
            輸入暱稱後，就會加入房間 <strong>{{ normalizedRoomCode }}</strong>。
          </p>
          <label class="field-label" for="invite-player-name">大家會怎麼稱呼你？</label>
          <input
            id="invite-player-name"
            ref="inviteJoinNameInput"
            v-model="playerName"
            class="text-input"
            type="text"
            autocomplete="nickname"
            maxlength="20"
            placeholder="輸入暱稱，最多 20 個字"
            :disabled="isLoading"
          />
          <p v-if="pageError" class="inline-message error-message" role="alert">{{ pageError }}</p>
          <div class="invite-join-actions">
            <button
              class="button button-secondary"
              type="button"
              :disabled="isLoading"
              @click="cancelInviteJoinPrompt"
            >
              取消
            </button>
            <button
              class="button button-primary"
              type="submit"
              :disabled="isLoading || !validName || !hasBetaAccess"
            >
              {{ isLoading ? '加入中…' : '確定加入' }}
            </button>
          </div>
        </form>
      </dialog>
    </Teleport>

    <footer class="site-footer">
      <span>GAMUMU <span aria-hidden="true">✦</span> 把日常變成派對</span>
      <span>一起玩，才好玩。</span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  overflow: hidden;
}

.site-header, .site-footer {
  width: min(100% - 40px, 1120px);
  margin-inline: auto;
}

.site-header {
  display: flex;
  min-height: 78px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(65, 56, 111, 0.08);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  text-decoration: none;
}

.brand-mark {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: 10px;
  background: var(--purple);
  transform: rotate(-7deg);
}

.brand-mark span {
  width: 3px;
  height: 10px;
  border-radius: 3px;
  background: #fff;
}

.brand-mark span:first-child {
  height: 6px;
}

.brand-mark span:last-child {
  height: 13px;
}

.brand-name {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.header-status, .connection-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.status-dot, .player-online-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #53c89b;
  box-shadow: 0 0 0 3px rgba(83, 200, 155, 0.14);
}

.home-main {
  display: grid;
  width: min(100% - 40px, 1040px);
  flex: 1;
  grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.78fr);
  align-items: center;
  gap: clamp(36px, 7vw, 88px);
  margin: 0 auto;
  padding-block: 48px 44px;
}

.hero {
  position: relative;
  min-width: 0;
  padding: 12px 0 24px;
}

.hero .eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero .eyebrow span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--coral);
}

.hero h1 {
  margin: 20px 0 16px;
  color: var(--ink);
  font-size: clamp(42px, 6vw, 68px);
  font-weight: 800;
  letter-spacing: -0.065em;
  line-height: 1.12;
}

.hero h1 span {
  color: var(--purple);
}

.hero-description {
  max-width: 400px;
  margin: 0;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.9;
}

.hero-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 25px;
}

.hero-tags span {
  padding: 7px 11px;
  border: 1px solid #e5e2f4;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.56);
  color: #66627c;
  font-size: 11px;
  font-weight: 600;
}

.hero-art {
  position: absolute;
  top: 24px;
  right: -4px;
  width: 175px;
  height: 186px;
  transform: translate(30%, -28%);
}

.game-card {
  position: absolute;
  width: 108px;
  height: 145px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 24px;
  box-shadow: 0 20px 45px rgba(76, 64, 147, 0.18);
}

.game-card-back {
  top: 18px;
  left: 49px;
  background: var(--mint);
  transform: rotate(13deg);
}

.game-card-front {
  top: 30px;
  left: 30px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: 16px;
  background: var(--purple);
  color: #fff;
  transform: rotate(-9deg);
}

.game-card-front::after {
  position: absolute;
  right: -27px;
  bottom: -39px;
  width: 112px;
  height: 112px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  content: '';
}

.card-spark {
  align-self: flex-end;
  color: var(--yellow);
  font-size: 22px;
}

.card-caption {
  z-index: 1;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.45;
}

.card-emoji {
  z-index: 1;
  align-self: flex-end;
  font-size: 26px;
}

.confetti {
  position: absolute;
  z-index: 2;
  color: var(--coral);
  font-size: 22px;
}

.confetti-one {
  top: 2px;
  left: 15px;
}

.confetti-two {
  right: 0;
  bottom: 12px;
  color: #efb83f;
  font-size: 27px;
}

.art-orbit {
  position: absolute;
  border: 1px solid rgba(105, 87, 232, 0.15);
  border-radius: 50%;
}

.orbit-one {
  top: -1px;
  left: 6px;
  width: 174px;
  height: 174px;
}

.orbit-two {
  top: 19px;
  left: -10px;
  width: 152px;
  height: 152px;
}

.entry-card, .game-panel, .avatar-panel, .players-panel {
  border: 1px solid rgba(94, 83, 153, 0.1);
  border-radius: 26px;
  background: var(--surface);
  box-shadow: 0 16px 42px rgba(60, 50, 127, 0.08);
}

.invite-join-dialog {
  width: min(420px, calc(100vw - 32px));
  max-width: none;
  padding: 0;
  border: 1px solid rgba(94, 83, 153, 0.14);
  border-radius: 24px;
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 24px 80px rgba(21, 18, 38, 0.24);
}

.invite-join-dialog::backdrop {
  background: rgb(25 22 39 / 64%);
  backdrop-filter: blur(3px);
}

.invite-join-content {
  display: grid;
  gap: 10px;
  padding: 28px;
}

.invite-join-content .eyebrow,
.invite-join-content h2,
.invite-join-description {
  margin: 0;
}

.invite-join-content h2 {
  font-size: 24px;
  letter-spacing: -0.04em;
}

.invite-join-description {
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.invite-join-description strong {
  color: var(--purple);
  letter-spacing: 0.08em;
}

.invite-join-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.entry-card {
  padding: 30px;
}

.beta-gate, .beta-checking, .beta-session-banner {
  margin-bottom: 22px;
  padding: 15px;
  border: 1px solid #e8e6f1;
  border-radius: 17px;
  background: #fbfaff;
}

.beta-gate .field-label {
  margin-bottom: 8px;
}

.beta-code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 9px;
}

.beta-code-input {
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.beta-verify-button {
  padding-inline: 17px;
}

.beta-hint {
  margin: 9px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

.beta-gate .inline-message {
  margin-top: 9px;
}

.beta-checking, .beta-session-banner {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 9px;
  color: #5c5875;
  font-size: 12px;
  font-weight: 700;
}

.beta-session-banner {
  border-color: rgba(83, 200, 155, 0.24);
  background: rgba(191, 242, 223, 0.35);
  color: #34775f;
}

.beta-session-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #53c89b;
  box-shadow: 0 0 0 3px rgba(83, 200, 155, 0.14);
}

.entry-heading, .players-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.entry-heading h2, .players-heading h2 {
  margin: 5px 0 0;
  color: var(--ink);
  font-size: 23px;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.entry-number {
  color: #e5e1fb;
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
}

.create-button {
  width: 100%;
  justify-content: space-between;
  margin-top: 14px;
  padding: 0 17px;
}

.button-icon {
  display: inline-flex;
  width: 25px;
  height: 25px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 17px;
}

.separator {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 21px 0;
  color: #aaa7bb;
  font-size: 11px;
}

.separator::before, .separator::after {
  height: 1px;
  flex: 1;
  background: #eeedf4;
  content: '';
}

.join-row {
  display: flex;
  gap: 9px;
}

.code-input {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.join-button {
  min-width: 79px;
  padding-inline: 15px;
  background: #efedff;
  color: var(--purple-dark);
}

.join-button:not(:disabled):hover {
  background: #e2ddff;
}

.inline-message, .room-notice, .room-error {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.error-message, .room-error {
  color: #c24d55;
}

.notice-message, .room-notice {
  color: #4c9278;
}

.privacy-note {
  margin: 20px 0 0;
  color: #a09db1;
  font-size: 10px;
  text-align: center;
}

.privacy-note span {
  margin-right: 4px;
  color: #e3b543;
}

.how-it-works {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: center;
  gap: 19px;
  margin-top: -23px;
  color: #827f98;
  font-size: 11px;
  font-weight: 600;
}

.how-it-works > div {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.how-number {
  color: #b4a9f1;
  font-size: 10px;
  font-weight: 800;
}

.how-arrow {
  color: #c5c1d5;
}

.site-footer {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(65, 56, 111, 0.08);
  color: #9a97aa;
  font-size: 10px;
}

.site-footer span span {
  margin-inline: 3px;
  color: var(--purple);
}

.room-main {
  width: min(100% - 36px, 690px);
  flex: 1;
  margin-inline: auto;
  padding: 21px 0 48px;
}

.room-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 22px;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border: 0;
  background: none;
  color: #77738e;
  font-size: 12px;
  font-weight: 700;
}

.back-button span:first-child {
  font-size: 19px;
  line-height: 1;
}

.connection-pill {
  padding: 7px 10px;
  border: 1px solid #eae8f3;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.76);
  font-size: 10px;
}

.connection-pill .status-dot {
  width: 7px;
  height: 7px;
}

.connection-connecting .status-dot,
.connection-reconnecting .status-dot {
  background: #efb83f;
  box-shadow: 0 0 0 3px rgba(239, 184, 63, 0.16);
}

.connection-offline .status-dot {
  background: #db747b;
  box-shadow: 0 0 0 3px rgba(219, 116, 123, 0.14);
}

.room-intro {
  position: relative;
  display: flex;
  min-height: 128px;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  padding: 21px 27px;
  border-radius: 25px;
  background: #332d62;
  color: #fff;
}

.room-intro::after {
  position: absolute;
  top: -98px;
  right: 29px;
  width: 240px;
  height: 240px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 50%;
  content: '';
}

.room-intro .eyebrow {
  color: #c5bbff;
}

.room-intro h1 {
  position: relative;
  z-index: 1;
  margin: 4px 0 4px;
  color: #fff;
  font-size: clamp(32px, 8vw, 42px);
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1.1;
}

.room-intro h1 span {
  color: #d3cdfd;
}

.room-subtitle {
  position: relative;
  z-index: 1;
  margin: 0;
  color: #d3cfe6;
  font-size: 11px;
}

.room-sticker {
  position: relative;
  z-index: 1;
  display: flex;
  width: 58px;
  height: 58px;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  border: 1px solid rgba(255, 255, 255, 0.27);
  border-radius: 19px;
  color: #ffdb75;
  font-size: 30px;
  transform: rotate(12deg);
}

.invite-row {
  display: flex;
  min-height: 50px;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0 17px;
  padding: 0 14px;
  border: 1px solid #eae8f2;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
}

.invite-copy {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #77738e;
  font-size: 11px;
  font-weight: 600;
}

.invite-icon {
  display: inline-flex;
  width: 25px;
  height: 25px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--purple-light);
  color: var(--purple);
  font-size: 15px;
}

.copy-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: #f1efff;
  color: var(--purple-dark);
  font-size: 10px;
  font-weight: 700;
}

.copy-button:hover {
  background: #e5e0ff;
}

.room-notice, .room-error {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff;
}

.room-error {
  background: #fff4f3;
}

.game-panel {
  min-height: 306px;
  padding: 22px;
}

.game-host-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.abort-game-button {
  min-height: 36px;
  padding-inline: 12px;
  font-size: 11px;
}

.game-panel-heading, .players-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.game-type {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
}

.game-type span {
  color: var(--purple);
  font-size: 15px;
}

.game-panel-heading-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-count, .capacity-pill {
  color: #9c98af;
  font-size: 10px;
  font-weight: 700;
}

.waiting-state, .finished-state {
  display: flex;
  min-height: 236px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 0 0;
  text-align: center;
}

.waiting-illustration {
  position: relative;
  display: flex;
  width: 78px;
  height: 69px;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.waiting-circle {
  width: 58px;
  height: 58px;
  border-radius: 22px;
  background: #f0edff;
  transform: rotate(-8deg);
}

.waiting-face {
  position: absolute;
  color: var(--purple);
  font-size: 38px;
  font-weight: 700;
  transform: rotate(-8deg);
}

.waiting-star {
  position: absolute;
  z-index: 1;
  color: #f0b947;
  font-size: 19px;
}

.star-a {
  top: 2px;
  right: 2px;
}

.star-b {
  bottom: 4px;
  left: 0;
  color: var(--coral);
}

.waiting-state h2 {
  margin: 8px 0 6px;
  color: var(--ink);
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.waiting-state > p {
  margin: 0;
  color: #89869b;
  font-size: 11px;
  line-height: 1.6;
}

.start-button {
  min-width: 205px;
  margin-top: 17px;
  padding-inline: 18px;
}

.start-button span {
  font-size: 17px;
}

.waiting-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 17px;
  padding: 9px 13px;
  border-radius: 999px;
  background: #f4f2ff;
  color: #8179b5;
  font-size: 10px;
  font-weight: 700;
}

.waiting-status .status-dot {
  width: 7px;
  height: 7px;
  background: #9c8cf1;
  box-shadow: none;
}

.finished-state {
  padding-top: 8px;
}

.loading-panel {
  display: flex;
  min-height: 306px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #e8e4ff;
  border-top-color: var(--purple);
  border-radius: 50%;
  animation: spin 800ms linear infinite;
}

.loading-panel h2 {
  margin: 13px 0 5px;
  color: var(--ink);
  font-size: 17px;
}

.loading-panel p {
  margin: 0;
  color: #9692a7;
  font-size: 11px;
}

.players-panel {
  margin-top: 13px;
  padding: 21px 22px 15px;
}

.players-heading {
  align-items: center;
  margin-bottom: 15px;
}

.players-heading h2 {
  font-size: 17px;
}

.capacity-pill {
  padding: 7px 10px;
  border-radius: 999px;
  background: #f4f2ff;
  color: #8379c7;
}

.player-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.player-row {
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 11px;
  border-bottom: 1px solid #f1eff6;
}

.player-row:last-child {
  border-bottom: 0;
}

.player-avatar {
  display: flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12px;
  background: #eeebff;
  color: #6957d4;
  font-size: 14px;
  font-weight: 800;
}

.player-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-info {
  min-width: 0;
  flex: 1;
}

.player-name-row, .player-subtitle {
  display: flex;
  align-items: center;
}

.player-name-row {
  flex-wrap: wrap;
  gap: 5px;
}

.player-name-row strong {
  overflow: hidden;
  color: #49455f;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.host-tag, .you-tag, .correct-tag {
  padding: 2px 5px;
  border-radius: 5px;
  background: #f2efff;
  color: #8577d5;
  font-size: 8px;
  font-weight: 700;
}

.you-tag {
  background: #fff5dc;
  color: #a48027;
}

.correct-tag {
  margin-left: 2px;
  background: #e8f7f0;
  color: #419876;
}

.player-subtitle {
  gap: 6px;
  margin-top: 4px;
  color: #a09caf;
  font-size: 9px;
}

.player-online-dot {
  width: 6px;
  height: 6px;
  box-shadow: none;
}

.player-online-dot.is-offline {
  background: #c6c3d0;
}

.player-score {
  color: var(--purple-dark);
  font-size: 15px;
  font-weight: 800;
}

.player-score small {
  margin-left: 2px;
  color: #9995aa;
  font-size: 9px;
  font-weight: 600;
}

.room-capacity-note {
  margin: 12px 0 0;
  color: #aaa7b8;
  font-size: 9px;
  text-align: center;
}

.room-main + .site-footer {
  width: min(100% - 40px, 690px);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .site-header, .site-footer {
    width: min(100% - 32px, 520px);
  }

  .site-header {
    min-height: 66px;
  }

  .home-main {
    width: min(100% - 32px, 480px);
    grid-template-columns: 1fr;
    gap: 27px;
    padding-block: 35px 28px;
  }

  .hero {
    padding: 3px 0 0;
  }

  .hero h1 {
    margin: 15px 0 11px;
    font-size: clamp(39px, 11vw, 54px);
  }

  .hero-description {
    max-width: 340px;
    font-size: 13px;
  }

  .hero-tags {
    margin-top: 17px;
  }

  .hero-art {
    top: 10px;
    right: 0;
    width: 105px;
    height: 124px;
    transform: scale(0.77);
    transform-origin: top right;
  }

  .entry-card {
    padding: 23px 21px;
    border-radius: 22px;
  }

  .entry-heading {
    margin-bottom: 18px;
  }

  .entry-heading h2 {
    font-size: 21px;
  }

  .how-it-works {
    gap: clamp(7px, 2.5vw, 17px);
    margin-top: 0;
    font-size: 9px;
  }

  .how-it-works > div {
    gap: 4px;
  }

  .site-footer {
    min-height: 50px;
    font-size: 9px;
  }

  .room-main {
    width: min(100% - 28px, 520px);
    padding-top: 14px;
  }

  .room-intro {
    min-height: 116px;
    padding: 19px 20px;
    border-radius: 21px;
  }

  .room-sticker {
    width: 48px;
    height: 48px;
    margin-right: 5px;
    border-radius: 16px;
    font-size: 25px;
  }

  .game-panel {
    padding: 19px 17px;
    border-radius: 21px;
  }

  .players-panel {
    padding: 19px 17px 14px;
    border-radius: 21px;
  }
}

@media (max-width: 390px) {
  .hero-art {
    right: -13px;
    transform: scale(0.66);
  }

  .hero h1 {
    font-size: 39px;
  }

  .header-status {
    font-size: 10px;
  }

  .room-main {
    width: calc(100% - 24px);
  }

  .game-panel, .players-panel {
    padding-inline: 14px;
  }
}

.avatar-panel {
  margin-bottom: 13px;
  padding: 17px 20px 15px;
}

.avatar-panel-heading {
  margin-bottom: 12px;
}

.avatar-panel-heading h2 {
  margin: 3px 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: 800;
}

.avatar-panel-heading p:last-child {
  margin: 0;
  color: #89869b;
  font-size: 10px;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 7px;
}

.avatar-choice {
  display: flex;
  min-width: 0;
  min-height: 68px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 2px;
  border: 1px solid transparent;
  border-radius: 13px;
  background: #faf9ff;
  color: #77738e;
  font-size: 9px;
  font-weight: 700;
}

.avatar-choice img {
  width: 38px;
  height: 38px;
  border-radius: 11px;
}

.avatar-choice.is-selected {
  border-color: #a79af1;
  background: #f1efff;
  color: var(--purple-dark);
  box-shadow: 0 0 0 2px rgba(105, 87, 232, 0.08);
}

.avatar-choice:disabled {
  cursor: default;
}

.game-choice-panel {
  display: grid;
  width: 100%;
  gap: 10px;
  margin-top: 18px;
  text-align: left;
}

.game-choice-intro {
  display: grid;
  gap: 4px;
}

.game-choice-heading {
  margin: 0;
  color: #5c5875;
  font-size: 11px;
  font-weight: 800;
}

.game-choice-intro > p:last-child {
  margin: 0;
  color: #89869b;
  font-size: 9px;
  line-height: 1.6;
}

.game-choice-wait {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px;
  border: 1px solid #e9e6f3;
  border-radius: 14px;
  background: linear-gradient(110deg, #fff, #f8f6ff);
}

.game-choice-wait-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 13px;
  background: #efedff;
  color: var(--purple-dark);
  font-size: 17px;
  font-weight: 800;
}

.game-choice-wait > span:last-child {
  display: grid;
  gap: 3px;
}

.game-choice-wait strong {
  color: #49455f;
  font-size: 11px;
}

.game-choice-wait small {
  color: #89869b;
  font-size: 9px;
  line-height: 1.5;
}

.game-choice-note {
  margin: 0;
  color: #9a96ad;
  font-size: 9px;
  line-height: 1.5;
  text-align: left;
}

.dev-role-selection {
  width: 100%;
  margin-top: 12px;
  padding: 12px;
  border: 1px dashed #c5baf5;
  border-radius: 12px;
  background: #faf9ff;
  text-align: left;
}

.dev-role-selection label {
  display: grid;
  gap: 6px;
  color: var(--purple-dark);
  font-size: 10px;
  font-weight: 800;
}

.dev-role-selection select {
  width: 100%;
  min-height: 38px;
  padding: 0 9px;
  border: 1px solid #e7e4f0;
  border-radius: 9px;
  background: #fff;
  color: var(--ink);
  font: inherit;
}

.dev-role-selection p {
  margin: 7px 0 0;
  color: #77738e;
  font-size: 9px;
  line-height: 1.5;
}

.dev-role-selection .dev-role-selection-warning {
  color: #9a5b22;
}

.ready-controls {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 13px;
}

.ready-button, .ready-controls .start-button {
  min-height: 44px;
  margin-top: 0;
  padding-inline: 14px;
}

.ready-count {
  padding: 7px 9px;
  border-radius: 999px;
  background: #f4f2ff;
  color: #8179b5;
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}

.start-hint {
  margin: 8px 0 0;
  color: #9a96ad;
  font-size: 9px;
}

.ready-tag {
  padding: 2px 5px;
  border-radius: 5px;
  background: #f2f0f6;
  color: #9692a7;
  font-size: 8px;
  font-weight: 700;
  white-space: nowrap;
}

.ready-tag.is-ready {
  background: #e8f7f0;
  color: #419876;
}

.kick-button {
  min-height: 32px;
  flex: 0 0 auto;
  padding: 0 8px;
  border: 1px solid #f1d9d9;
  border-radius: 8px;
  background: #fff8f7;
  color: #bd6668;
  font-size: 9px;
  font-weight: 700;
}

.kick-button:hover {
  background: #fff0ee;
}

@media (max-width: 600px) {
  .avatar-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .avatar-choice {
    min-height: 62px;
  }

  .ready-controls {
    flex-wrap: wrap;
  }
}

@media (max-width: 390px) {
  .avatar-panel {
    padding-inline: 14px;
  }

  .ready-controls {
    gap: 7px;
  }

  .ready-controls .start-button {
    width: 100%;
  }

  .player-row {
    gap: 7px;
  }
}

@media (max-width: 520px) {
  .game-panel-heading-actions {
    gap: 6px;
  }
}
</style>
