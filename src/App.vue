<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { AVATARS, type AvatarId } from '../shared/avatars'
import {
  DEFAULT_GAME_ID,
  GAME_OPTIONS,
  getGameOption,
  getPlayerRange,
  ROOM_CAPACITY,
  type GameId,
} from '../shared/games'
import type { ClientMessage } from '../shared/protocol'
import { useGameRoom } from './composables/useGameRoom'
import { GAME_COMPONENTS } from './games/registry'
import { createRoomRequest, joinRoomRequest } from './services/api'
import { loadRoomToken, removeRoomToken, saveRoomToken } from './services/session'

const {
  snapshot,
  connectionStatus,
  errorMessage,
  gameEvent,
  playerId,
  removedFromRoom,
  connect,
  disconnect,
  send,
  leaveRoom: leaveGameRoom,
} = useGameRoom()

const playerName = ref('')
const roomCodeInput = ref('')
const activeRoomCode = ref('')
const isLoading = ref(false)
const pageError = ref('')
const pageNotice = ref('')

let noticeTimer: number | undefined

const normalizedName = computed(() => playerName.value.trim())
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
    !playerCountIssue.value &&
    allPlayersReady.value,
  )
})
const startHint = computed(() => {
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

onMounted(() => {
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
  }
})

onUnmounted(() => {
  if (noticeTimer !== undefined) {
    window.clearTimeout(noticeTimer)
  }
})

async function createRoom(): Promise<void> {
  if (isLoading.value || !validName.value) {
    pageError.value = '暱稱請填 1 到 20 個字元。'
    return
  }

  pageError.value = ''
  isLoading.value = true
  try {
    const credentials = await createRoomRequest(normalizedName.value)
    const storageWarning = saveRoomToken(credentials.code, credentials.token)
    enterRoom(credentials.code, credentials.token)
    if (storageWarning) {
      showNotice(storageWarning)
    }
  } catch (error) {
    pageError.value = errorMessageFrom(error)
  } finally {
    isLoading.value = false
  }
}

async function joinRoom(): Promise<void> {
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
    const credentials = await joinRoomRequest(normalizedRoomCode.value, normalizedName.value)
    const storageWarning = saveRoomToken(credentials.code, credentials.token)
    enterRoom(credentials.code, credentials.token)
    if (storageWarning) {
      showNotice(storageWarning)
    }
  } catch (error) {
    pageError.value = errorMessageFrom(error)
  } finally {
    isLoading.value = false
  }
}

function enterRoom(code: string, token: string): void {
  activeRoomCode.value = code
  roomCodeInput.value = code
  pageError.value = ''
  updateRoomUrl(code)
  connect(code, token)
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
            開一間小小派對房，找朋友一起猜詞、搶分數。把手機傳一傳，笑聲就開始了。
          </p>
          <div class="hero-tags" aria-label="遊戲特色">
            <span>即時連線</span>
            <span>最多 12 人</span>
            <span>手機優先</span>
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

        <button class="button button-primary create-button" :disabled="isLoading || !validName" @click="createRoom">
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
          <button class="button button-secondary join-button" :disabled="isLoading || !canJoin" @click="joinRoom">
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
        <div><span class="how-number">03</span><span>開始猜詞</span></div>
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
            <span class="game-type"><span aria-hidden="true">✦</span> {{ selectedGame.name }}</span>
            <span class="player-count">{{ snapshot.players.length }} / {{ ROOM_CAPACITY }} 人</span>
          </div>

          <div v-if="snapshot.status === 'waiting'" class="waiting-state">
            <div class="waiting-illustration" aria-hidden="true">
              <span class="waiting-star star-a">✦</span>
              <span class="waiting-star star-b">✧</span>
              <span class="waiting-circle"></span>
              <span class="waiting-face">☺</span>
            </div>
            <h2>{{ playerCountIssue ? '確認本局人數' : allPlayersReady ? '大家準備好了！' : '準備好了嗎？' }}</h2>
            <p>{{ playerCountIssue || '每位玩家都按下準備後，房主就可以開始。' }}</p>

            <div class="game-choice-panel">
              <p class="game-choice-heading">{{ isHost ? '選擇本局遊戲' : '房主選擇的遊戲' }}</p>
              <div class="game-choice-list">
                <button
                  v-for="game in GAME_OPTIONS"
                  :key="game.id"
                  class="game-choice"
                  :class="{ 'is-selected': snapshot.selectedGameId === game.id }"
                  type="button"
                  :aria-pressed="snapshot.selectedGameId === game.id"
                  :disabled="!isHost || connectionStatus !== 'connected' || snapshot.selectedGameId === game.id"
                  @click="selectGame(game.id)"
                >
                  <span class="game-choice-indicator" aria-hidden="true">{{ game.icon }}</span>
                  <span class="game-choice-copy">
                    <strong>{{ game.name }}</strong>
                    <small>{{ game.minPlayers }}–{{ game.maxPlayers }} 位玩家 · {{ game.description }}</small>
                  </span>
                  <span v-if="snapshot.selectedGameId === game.id" class="game-choice-current">已選</span>
                </button>
              </div>
              <p class="game-choice-note">
                {{ isHost ? '更換遊戲會清除所有人的準備狀態。' : '只有房主可以更換遊戲。' }}
                本局人數須為 {{ playerRange.min }}–{{ playerRange.max }} 位。
              </p>
            </div>

            <component
              v-if="gameComponents.setup"
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

    <footer class="site-footer">
      <span>GAMUMU <span aria-hidden="true">✦</span> 把日常變成派對</span>
      <span>一起玩，才好玩。</span>
    </footer>
  </div>
</template>
