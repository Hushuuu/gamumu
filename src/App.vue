<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ROOM_CAPACITY, type ClientMessage } from '../shared/protocol'
import { useGameRoom } from './composables/useGameRoom'
import { createRoomRequest, joinRoomRequest } from './services/api'
import { loadRoomToken, removeRoomToken, saveRoomToken } from './services/session'

const {
  snapshot,
  connectionStatus,
  errorMessage,
  guessFeedback,
  playerId,
  connect,
  send,
  leaveRoom: leaveGameRoom,
} = useGameRoom()

const playerName = ref('')
const roomCodeInput = ref('')
const activeRoomCode = ref('')
const answer = ref('')
const isLoading = ref(false)
const pageError = ref('')
const pageNotice = ref('')
const now = ref(Date.now())

let clockTimer: number | undefined
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
const sortedPlayers = computed(() => {
  const players = snapshot.value?.players ?? []
  return [...players].sort((left, right) => right.score - left.score)
})
const answeredCount = computed(() => {
  return snapshot.value?.players.filter((player) => player.answered).length ?? 0
})
const remainingSeconds = computed(() => {
  const deadline = snapshot.value?.game?.roundEndsAt
  if (!deadline) {
    return 0
  }
  return Math.max(0, Math.ceil((deadline - now.value) / 1_000))
})
const canSubmitAnswer = computed(() => {
  return Boolean(
    connectionStatus.value === 'connected' &&
    snapshot.value?.status === 'playing' &&
    snapshot.value.game?.phase === 'guessing' &&
    !currentPlayer.value?.answered &&
    answer.value.trim(),
  )
})
const winner = computed(() => sortedPlayers.value[0] ?? null)
const shareUrl = computed(() => {
  if (!activeRoomCode.value) {
    return ''
  }
  const url = new URL(window.location.href)
  url.searchParams.set('room', activeRoomCode.value)
  return url.toString()
})

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 250)

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
  if (clockTimer !== undefined) {
    window.clearInterval(clockTimer)
  }
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
  answer.value = ''
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
  answer.value = ''
  removeRoomFromUrl()
  if (storageWarning) {
    showNotice(storageWarning)
  }
}

function startGame(): void {
  send({ type: 'start_game' })
}

function submitAnswer(): void {
  if (!canSubmitAnswer.value) {
    return
  }

  const message: ClientMessage = { type: 'submit_answer', answer: answer.value.trim() }
  if (send(message)) {
    answer.value = ''
  }
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
            <span>最多 10 人</span>
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
        <section class="game-panel">
          <div class="game-panel-heading">
            <span class="game-type"><span aria-hidden="true">✦</span> 猜詞派對</span>
            <span class="player-count">{{ snapshot.players.length }} / {{ ROOM_CAPACITY }} 人</span>
          </div>

          <div v-if="snapshot.status === 'waiting'" class="waiting-state">
            <div class="waiting-illustration" aria-hidden="true">
              <span class="waiting-star star-a">✦</span>
              <span class="waiting-star star-b">✧</span>
              <span class="waiting-circle"></span>
              <span class="waiting-face">☺</span>
            </div>
            <template v-if="isHost">
              <h2>{{ snapshot.players.length < 2 ? '再等一位朋友' : '人到齊了嗎？' }}</h2>
              <p>
                {{ snapshot.players.length < 2
                  ? '分享房間代碼，至少兩位玩家就能開始。'
                  : '準備好了就開始猜詞派對！' }}
              </p>
              <button
                class="button button-primary start-button"
                :disabled="snapshot.players.length < 2 || connectionStatus !== 'connected'"
                @click="startGame"
              >
                開始猜詞派對 <span aria-hidden="true">→</span>
              </button>
            </template>
            <template v-else>
              <h2>等房主開始派對</h2>
              <p>你已經在房間裡了，準備好你的直覺！</p>
              <div class="waiting-status"><span class="status-dot"></span> 等待房主開始</div>
            </template>
          </div>

          <div v-else-if="snapshot.status === 'playing' && snapshot.game" class="playing-state">
            <div class="round-heading">
              <div>
                <span class="round-kicker">第 {{ snapshot.game.round }} / {{ snapshot.game.totalRounds }} 題</span>
                <h2>{{ snapshot.game.phase === 'guessing' ? '猜猜看是什麼？' : '公布答案' }}</h2>
              </div>
              <div v-if="snapshot.game.roundEndsAt" class="timer-badge" :class="{ 'timer-low': remainingSeconds <= 5 }">
                <strong>{{ remainingSeconds }}</strong>
                <span>{{ snapshot.game.phase === 'guessing' ? '秒' : '秒後下一題' }}</span>
              </div>
            </div>

            <div class="hint-card">
              <span class="hint-label">小提示</span>
              <p>{{ snapshot.game.hint }}</p>
            </div>

            <template v-if="snapshot.game.phase === 'guessing'">
              <div class="answer-area">
                <label class="field-label" for="answer-input">想到答案了嗎？</label>
                <form class="answer-form" @submit.prevent="submitAnswer">
                  <input
                    id="answer-input"
                    v-model="answer"
                    class="text-input answer-input"
                    type="text"
                    autocomplete="off"
                    autocapitalize="characters"
                    maxlength="80"
                    placeholder="輸入你的答案…"
                    :disabled="currentPlayer?.answered || connectionStatus !== 'connected'"
                  />
                  <button class="button button-primary answer-button" type="submit" :disabled="!canSubmitAnswer">
                    送出
                  </button>
                </form>
                <p v-if="guessFeedback" class="guess-feedback" :class="{ 'guess-correct': currentPlayer?.correct }" role="status">
                  {{ guessFeedback }}
                </p>
                <p v-else-if="currentPlayer?.answered" class="guess-feedback" role="status">
                  已送出答案，等其他玩家完成這題。
                </p>
                <p v-else class="guess-helper">每題只能送出一次，答對可得 100 分。</p>
              </div>
              <div class="answer-progress">
                <span>作答進度</span>
                <strong>{{ answeredCount }} / {{ snapshot.players.length }}</strong>
                <div class="progress-track">
                  <span :style="{ width: `${snapshot.players.length ? (answeredCount / snapshot.players.length) * 100 : 0}%` }"></span>
                </div>
              </div>
            </template>

            <div v-else class="reveal-card">
              <span class="reveal-label">這題的答案是</span>
              <strong>{{ snapshot.game.answer }}</strong>
              <p>準備好，下一題馬上開始。</p>
            </div>
          </div>

          <div v-else class="finished-state">
            <div class="finish-icon" aria-hidden="true">🏆</div>
            <p class="eyebrow">派對完成</p>
            <h2>{{ winner ? `${winner.name} 是猜詞王！` : '精彩的一局！' }}</h2>
            <p>五題結束，感謝大家一起玩。</p>
            <div v-if="winner" class="winner-score">
              <span>最高分</span>
              <strong>{{ winner.score }} <small>分</small></strong>
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
            <li v-for="(player, index) in sortedPlayers" :key="player.id" class="player-row">
              <span class="player-avatar" :class="`avatar-${index % 5}`">{{ Array.from(player.name)[0] }}</span>
              <div class="player-info">
                <div class="player-name-row">
                  <strong>{{ player.name }}</strong>
                  <span v-if="player.id === snapshot.hostId" class="host-tag">房主</span>
                  <span v-if="player.id === playerId" class="you-tag">你</span>
                </div>
                <span class="player-subtitle">
                  <span class="player-online-dot" :class="{ 'is-offline': !player.online }"></span>
                  {{ player.online ? (player.answered ? '本題已作答' : '在線') : '等待重新連線' }}
                  <span v-if="player.correct" class="correct-tag">答對</span>
                </span>
              </div>
              <strong v-if="snapshot.status !== 'waiting'" class="player-score">{{ player.score }}<small>分</small></strong>
              <span v-else class="player-number">{{ String(index + 1).padStart(2, '0') }}</span>
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
