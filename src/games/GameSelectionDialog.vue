<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import {
  getGameOption,
  getPlayerRange,
  type GameId,
  type GameOption,
} from '../../shared/games'

interface GamePromo {
  category: string
  headline: string
  description: string
  stamp: string
}

const GAME_PROMOS: Record<GameId, GamePromo> = {
  'word-guess': {
    category: '限時腦力對決',
    headline: '提示一出，搶答的直覺就是你的得分。',
    description: '五道快問快答，讀懂提示、猜中關鍵詞，在倒數結束前把派對氣氛推到最高點。',
    stamp: 'READY, SET, GUESS',
  },
  // blank: {
  //   category: '開發測試場',
  //   headline: '新遊戲的第一站，邀你一起試玩。',
  //   description: '這是驗證遊戲流程的測試項目，目前沒有正式競賽玩法；適合檢查房間與遊戲啟動流程。',
  //   stamp: 'PLAYTEST LAB',
  // },
  'draw-guess': {
    category: '創意接力派對',
    headline: '畫得越出乎意料，猜中就越有成就感。',
    description: '輪流抽題、盡情作畫，再看朋友能不能讀懂你的神來一筆。每一輪都是新的笑點。',
    stamp: 'DRAW THE FUN',
  },
  werewolf: {
    category: '夜幕推理劇場',
    headline: '天亮之前，找出藏在你們之中的狼人。',
    description: '閉眼聽見夜色降臨，睜眼迎來一場心理攻防。交換線索、觀察反應，用每一票改寫村莊命運。',
    stamp: 'WHO IS THE WOLF?',
  },
}

const props = defineProps<{
  games: readonly GameOption[]
  selectedGameId: GameId
  selectionConfirmed: boolean
  gameSettings: Record<string, unknown>
  playerCount: number
  canSelect: boolean
  canConfirm: boolean
}>()

const emit = defineEmits<{
  select: [gameId: GameId]
}>()

const isOpen = ref(false)
const selectedIndex = ref(0)
const triggerButton = ref<HTMLButtonElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
const carouselTrack = ref<HTMLDivElement | null>(null)
const activeGame = computed(() => props.games[selectedIndex.value] ?? props.games[0]!)
const committedGame = computed(() => getGameOption(props.selectedGameId))

function playerCountFits(game: GameOption): boolean {
  const range = getPlayerRange(game.id, props.gameSettings)
  return props.playerCount >= range.min && props.playerCount <= range.max
}

function open(): void {
  const selectedIndexInCatalog = props.games.findIndex((game) => game.id === props.selectedGameId)
  selectedIndex.value = Math.max(0, selectedIndexInCatalog)
  isOpen.value = true
  void nextTick(() => {
    scrollToSlide(selectedIndex.value, 'auto')
    closeButton.value?.focus()
  })
}

function close(): void {
  isOpen.value = false
  void nextTick(() => triggerButton.value?.focus())
}

function scrollToSlide(index: number, behavior: ScrollBehavior = 'smooth'): void {
  const lastIndex = props.games.length - 1
  const nextIndex = Math.min(Math.max(index, 0), lastIndex)
  selectedIndex.value = nextIndex
  const track = carouselTrack.value
  if (!track) {
    return
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  track.scrollTo({
    left: nextIndex * track.clientWidth,
    behavior: reduceMotion ? 'auto' : behavior,
  })
}

function syncSelectedSlide(event: Event): void {
  const track = event.currentTarget
  if (!(track instanceof HTMLDivElement) || track.clientWidth === 0) {
    return
  }

  const nextIndex = Math.round(track.scrollLeft / track.clientWidth)
  selectedIndex.value = Math.min(Math.max(nextIndex, 0), props.games.length - 1)
}

function confirmSelection(): void {
  if (!props.canSelect || !props.canConfirm) {
    return
  }

  emit('select', activeGame.value.id)
  close()
}

function handleKeydown(event: KeyboardEvent): void {
  if (!isOpen.value) {
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    scrollToSlide(selectedIndex.value - 1)
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    scrollToSlide(selectedIndex.value + 1)
    return
  }

  if (event.key !== 'Tab') {
    return
  }

  const focusable = dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  if (!focusable?.length) {
    event.preventDefault()
    return
  }

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && (document.activeElement === first || !dialog.value?.contains(document.activeElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

let previousBodyOverflow = ''
watch(isOpen, (open) => {
  if (open) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeydown)
  } else {
    document.body.style.overflow = previousBodyOverflow
    window.removeEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  document.body.style.overflow = previousBodyOverflow
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <button
    ref="triggerButton"
    class="game-selection-trigger"
    type="button"
    aria-haspopup="dialog"
    :aria-expanded="isOpen"
    @click="open"
  >
    <span class="game-selection-trigger-icon" aria-hidden="true">
      {{ canSelect ? committedGame.icon : '✦' }}
    </span>
    <span class="game-selection-trigger-copy">
      <small>{{ canSelect ? '房主遊戲選擇' : '派對遊戲圖鑑' }}</small>
      <strong>{{ canSelect ? '選擇本局遊戲' : '瀏覽遊戲列表' }}</strong>
      <span v-if="canSelect">
        {{ selectionConfirmed ? `目前：${committedGame.name}` : '還沒有選定遊戲' }}
      </span>
    </span>
    <span class="game-selection-trigger-arrow" aria-hidden="true">↗</span>
  </button>

  <Teleport to="body">
    <div v-if="isOpen" class="game-selection-overlay" @click.self="close">
      <section
        ref="dialog"
        class="game-selection-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-selection-title"
        tabindex="-1"
      >
        <header class="game-selection-header">
          <div>
            <p class="game-selection-overline">GAMUMU · THE PARTY COLLECTION</p>
            <h2 id="game-selection-title">
              {{ canSelect ? '下一場派對，玩點什麼？' : '找到今晚的派對主題' }}
            </h2>
            <p class="game-selection-subtitle">
              {{ canSelect ? '左右滑動探索，選好後再與大家同步。' : '左右滑動卡片，看看有哪些遊戲等著開場。' }}
            </p>
          </div>
          <div class="game-selection-header-actions">
            <span v-if="!canSelect" class="game-selection-readonly">唯讀瀏覽</span>
            <button
              ref="closeButton"
              class="game-selection-close"
              type="button"
              aria-label="關閉遊戲列表"
              @click="close"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </header>

        <div class="game-selection-carousel">
          <button
            class="game-selection-arrow"
            type="button"
            aria-label="上一款遊戲"
            :disabled="selectedIndex === 0"
            @click="scrollToSlide(selectedIndex - 1)"
          >
            <span aria-hidden="true">←</span>
          </button>

          <div
            ref="carouselTrack"
            class="game-selection-track"
            role="region"
            aria-roledescription="carousel"
            aria-label="派對遊戲卡片"
            @scroll.passive="syncSelectedSlide"
          >
            <article
              v-for="(game, index) in games"
              :key="game.id"
              class="game-selection-slide"
              :class="`theme-${game.id}`"
              role="group"
              aria-roledescription="slide"
              :aria-hidden="selectedIndex !== index"
              :aria-label="`${index + 1} / ${games.length}：${game.name}`"
            >
              <div class="game-selection-poster" aria-hidden="true">
                <span class="game-poster-edition">GAMUMU / PLAY SERIES</span>
                <span class="game-poster-orbit game-poster-orbit-one"></span>
                <span class="game-poster-orbit game-poster-orbit-two"></span>
                <span class="game-poster-glow"></span>
                <span class="game-poster-spark poster-spark-one">✦</span>
                <span class="game-poster-spark poster-spark-two">✧</span>
                <span class="game-poster-icon">{{ game.icon }}</span>
                <span class="game-poster-stamp">{{ GAME_PROMOS[game.id].stamp }}</span>
                <span class="game-poster-index">{{ String(index + 1).padStart(2, '0') }}</span>
              </div>

              <div class="game-selection-copy">
                <div class="game-selection-badges">
                  <span class="game-selection-category">{{ GAME_PROMOS[game.id].category }}</span>
                  <span
                    v-if="selectionConfirmed && game.id === selectedGameId"
                    class="game-selection-current"
                  >
                    房間目前選擇
                  </span>
                </div>
                <h3>{{ game.name }}</h3>
                <p class="game-selection-headline">{{ GAME_PROMOS[game.id].headline }}</p>
                <p class="game-selection-description">{{ GAME_PROMOS[game.id].description }}</p>
                <p class="game-selection-catalog-copy">{{ game.description }}</p>
                <div class="game-selection-facts">
                  <span><strong>{{ getPlayerRange(game.id, gameSettings).min }}–{{ getPlayerRange(game.id, gameSettings).max }}</strong> 位玩家</span>
                  <span :class="{ 'is-out-of-range': !playerCountFits(game) }">
                    <strong>目前 {{ playerCount }} 位</strong>
                  </span>
                </div>
              </div>
            </article>
          </div>

          <button
            class="game-selection-arrow"
            type="button"
            aria-label="下一款遊戲"
            :disabled="selectedIndex === games.length - 1"
            @click="scrollToSlide(selectedIndex + 1)"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <div class="game-selection-pagination">
          <span class="game-selection-page-count">
            {{ String(selectedIndex + 1).padStart(2, '0') }}
            <span>/ {{ String(games.length).padStart(2, '0') }}</span>
          </span>
          <div class="game-selection-dots" role="group" aria-label="選擇遊戲卡片">
            <button
              v-for="(game, index) in games"
              :key="game.id"
              type="button"
              class="game-selection-dot"
              :class="{ 'is-active': selectedIndex === index }"
              :aria-label="`顯示第 ${index + 1} 款：${game.name}`"
              :aria-current="selectedIndex === index ? 'step' : undefined"
              @click="scrollToSlide(index)"
            />
          </div>
          <span class="game-selection-swipe-hint">
            <span aria-hidden="true">↔</span> 滑動探索
          </span>
        </div>

        <footer class="game-selection-footer">
          <p v-if="canSelect">
            {{ canConfirm
              ? (selectionConfirmed
                ? `確認後會使用「${activeGame.name}」${activeGame.id === selectedGameId ? '繼續準備' : '開始準備'}。`
                : `確認「${activeGame.name}」後，房間裡的所有人就會看到本局遊戲。`)
              : '重新連線後即可確認本局遊戲。' }}
          </p>
          <p v-else>瀏覽模式不會更改房間遊戲，由室長決定本局玩法。</p>
          <button
            v-if="canSelect"
            class="game-selection-confirm"
            type="button"
            :disabled="!canConfirm"
            @click="confirmSelection"
          >
            {{ canConfirm ? `選擇 ${activeGame.name}` : '等待連線' }}
            <span aria-hidden="true">→</span>
          </button>
          <button v-else class="game-selection-confirm game-selection-done" type="button" @click="close">
            完成瀏覽
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.game-selection-trigger {
  display: flex;
  width: 100%;
  min-height: 74px;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e7e2fb;
  border-radius: 16px;
  background:
    radial-gradient(ellipse at 10% 0%, rgb(222 215 255 / 58%), transparent 60%),
    linear-gradient(110deg, #fff 4%, #f5f2ff 100%);
  color: var(--ink);
  text-align: left;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.game-selection-trigger:hover {
  transform: translateY(-1px);
  border-color: #c6bcf4;
  box-shadow: 0 9px 24px rgb(76 64 147 / 12%);
}

.game-selection-trigger-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(145deg, #7868e7, #5141c4);
  box-shadow: 0 7px 14px rgb(81 65 196 / 22%);
  color: #fff;
  font-size: 17px;
  font-weight: 900;
}

.game-selection-trigger-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.game-selection-trigger-copy small {
  color: #89849f;
  font-size: 9px;
  font-weight: 700;
}

.game-selection-trigger-copy strong {
  color: #393451;
  font-size: 13px;
  font-weight: 800;
}

.game-selection-trigger-copy > span {
  overflow: hidden;
  color: #77738e;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-selection-trigger-arrow {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: #eae6ff;
  color: #5b4bc9;
  font-size: 16px;
}

.game-selection-overlay {
  position: fixed;
  z-index: 12000;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 10% 12%, rgb(105 87 232 / 24%), transparent 38%),
    radial-gradient(ellipse at 92% 88%, rgb(69 179 151 / 15%), transparent 34%),
    linear-gradient(135deg, #181629, #211d3b 55%, #171626);
  color: #fff;
  animation: game-selection-enter 260ms ease-out both;
}

.game-selection-overlay::before,
.game-selection-overlay::after {
  position: absolute;
  width: min(66vw, 700px);
  aspect-ratio: 1;
  border: 1px solid rgb(255 255 255 / 5%);
  border-radius: 50%;
  content: '';
  pointer-events: none;
}

.game-selection-overlay::before {
  top: -38%;
  left: -20%;
}

.game-selection-overlay::after {
  right: -22%;
  bottom: -48%;
  width: min(78vw, 850px);
}

.game-selection-dialog {
  position: relative;
  z-index: 1;
  display: grid;
  width: min(100%, 1480px);
  height: 100%;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: clamp(10px, 1.7vh, 18px);
  padding: clamp(16px, 3vh, 32px) clamp(18px, 4vw, 58px);
  outline: none;
}

.game-selection-header,
.game-selection-header-actions,
.game-selection-footer,
.game-selection-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.game-selection-header {
  gap: 20px;
}

.game-selection-overline {
  margin: 0 0 6px;
  color: #b9b1ff;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.17em;
}

.game-selection-header h2 {
  margin: 0;
  color: #fff;
  font-size: clamp(22px, 3.2vw, 36px);
  font-weight: 850;
  letter-spacing: -0.045em;
}

.game-selection-subtitle {
  margin: 5px 0 0;
  color: #b9b5ce;
  font-size: 11px;
}

.game-selection-header-actions {
  flex: 0 0 auto;
  gap: 12px;
}

.game-selection-readonly {
  padding: 7px 10px;
  border: 1px solid rgb(199 191 255 / 20%);
  border-radius: 999px;
  background: rgb(255 255 255 / 6%);
  color: #d0cbeb;
  font-size: 9px;
  font-weight: 700;
}

.game-selection-close {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 14px;
  background: rgb(255 255 255 / 7%);
  color: #fff;
  font-size: 28px;
  line-height: 1;
  transition: background 160ms ease, transform 160ms ease;
}

.game-selection-close:hover {
  transform: rotate(90deg);
  background: rgb(255 255 255 / 14%);
}

.game-selection-carousel {
  display: grid;
  min-height: 0;
  grid-template-columns: 48px minmax(0, 1fr) 48px;
  align-items: stretch;
  gap: clamp(8px, 1.5vw, 20px);
}

.game-selection-arrow {
  align-self: center;
  width: 46px;
  height: 46px;
  border: 1px solid rgb(255 255 255 / 17%);
  border-radius: 16px;
  background: rgb(255 255 255 / 7%);
  color: #fff;
  font-size: 19px;
  transition: background 150ms ease, transform 150ms ease;
}

.game-selection-arrow:not(:disabled):hover {
  transform: scale(1.05);
  background: rgb(255 255 255 / 15%);
}

.game-selection-arrow:disabled {
  opacity: 0.28;
  cursor: default;
}

.game-selection-track {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: clamp(20px, 2.5vw, 34px);
  background: #211f36;
  box-shadow:
    0 22px 80px rgb(0 0 0 / 25%),
    inset 0 0 0 5px rgb(255 255 255 / 3%);
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  touch-action: pan-x pan-y;
}

.game-selection-track::-webkit-scrollbar {
  display: none;
}

.game-selection-slide {
  display: grid;
  width: 100%;
  height: 100%;
  min-width: 100%;
  min-height: 0;
  flex: 0 0 100%;
  grid-template-columns: minmax(230px, 0.88fr) minmax(0, 1.12fr);
  align-items: center;
  gap: clamp(22px, 5vw, 76px);
  padding: clamp(20px, 4vw, 58px);
  scroll-snap-align: start;
}

.theme-word-guess {
  background:
    radial-gradient(ellipse at 10% 0%, rgb(177 158 255 / 16%), transparent 48%),
    linear-gradient(120deg, #22203c, #292548 60%, #22213b);
}

.theme-blank {
  background:
    radial-gradient(ellipse at 10% 0%, rgb(97 212 182 / 14%), transparent 48%),
    linear-gradient(120deg, #1c2931, #22333a 60%, #20313a);
}

.theme-draw-guess {
  background:
    radial-gradient(ellipse at 10% 0%, rgb(255 177 126 / 16%), transparent 48%),
    linear-gradient(120deg, #30253a, #382943 60%, #29223c);
}

.theme-werewolf {
  background:
    radial-gradient(ellipse at 10% 0%, rgb(145 139 255 / 18%), transparent 48%),
    linear-gradient(120deg, #211f3b, #302746 60%, #25213a);
}

.game-selection-poster {
  position: relative;
  display: grid;
  width: min(100%, 430px);
  height: min(100%, 500px);
  min-height: 260px;
  justify-self: center;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 26%);
  border-radius: clamp(22px, 3vw, 34px);
  background: linear-gradient(145deg, #7969e6, #403596);
  box-shadow:
    0 24px 54px rgb(0 0 0 / 26%),
    inset 0 0 0 6px rgb(255 255 255 / 7%);
  isolation: isolate;
}

.theme-word-guess .game-selection-poster {
  background:
    radial-gradient(circle at 80% 22%, #ffcf75 0 4%, transparent 4.5%),
    radial-gradient(circle at 24% 80%, rgb(117 229 199 / 76%) 0 7%, transparent 7.5%),
    linear-gradient(145deg, #8979f1, #4c40bd 72%);
}

.theme-blank .game-selection-poster {
  background:
    radial-gradient(circle at 76% 25%, #ffd57d 0 5%, transparent 5.5%),
    radial-gradient(circle at 26% 78%, rgb(112 228 192 / 80%) 0 7%, transparent 7.5%),
    linear-gradient(145deg, #55bca1, #286c76 72%);
}

.theme-draw-guess .game-selection-poster {
  background:
    radial-gradient(circle at 76% 24%, #ffd17b 0 5%, transparent 5.5%),
    radial-gradient(circle at 22% 76%, rgb(255 157 137 / 76%) 0 7%, transparent 7.5%),
    linear-gradient(145deg, #ef9d8e, #a95386 72%);
}

.theme-werewolf .game-selection-poster {
  background:
    radial-gradient(circle at 74% 22%, #f3d47c 0 8%, transparent 8.5%),
    radial-gradient(circle at 20% 85%, rgb(158 148 255 / 55%) 0 12%, transparent 12.5%),
    linear-gradient(145deg, #655ab4, #29294f 72%);
}

.game-selection-poster::before,
.game-selection-poster::after {
  position: absolute;
  z-index: -1;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 50%;
  content: '';
}

.game-selection-poster::before {
  width: 88%;
  aspect-ratio: 1;
}

.game-selection-poster::after {
  width: 66%;
  aspect-ratio: 1;
}

.game-poster-edition {
  position: absolute;
  top: 21px;
  left: 22px;
  color: rgb(255 255 255 / 74%);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.17em;
}

.game-poster-orbit {
  position: absolute;
  width: 115%;
  aspect-ratio: 1;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 50%;
  transform: rotate(-22deg) scaleY(0.48);
}

.game-poster-orbit-one {
  animation: poster-orbit 14s linear infinite;
}

.game-poster-orbit-two {
  width: 95%;
  transform: rotate(38deg) scaleY(0.62);
  animation: poster-orbit 18s linear infinite reverse;
}

.game-poster-glow {
  position: absolute;
  width: 52%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgb(255 255 255 / 12%);
  filter: blur(28px);
}

.game-poster-icon {
  position: relative;
  z-index: 1;
  display: grid;
  width: min(54%, 190px);
  aspect-ratio: 1;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 44%);
  border-radius: 32%;
  background: linear-gradient(145deg, rgb(255 255 255 / 30%), rgb(255 255 255 / 8%));
  box-shadow:
    0 26px 46px rgb(20 16 62 / 24%),
    inset 0 0 0 8px rgb(255 255 255 / 8%);
  color: #fff;
  font-size: clamp(55px, 9vw, 112px);
  font-weight: 900;
  text-shadow: 0 6px 25px rgb(35 24 91 / 30%);
  transform: rotate(-7deg);
  backdrop-filter: blur(5px);
}

.theme-werewolf .game-poster-icon {
  border-radius: 50%;
  font-size: clamp(68px, 10vw, 126px);
  transform: rotate(0);
}

.theme-draw-guess .game-poster-icon {
  transform: rotate(-12deg);
}

.game-poster-spark {
  position: absolute;
  z-index: 1;
  color: #ffe391;
  font-size: 25px;
  text-shadow: 0 2px 15px rgb(255 228 151 / 45%);
  animation: poster-sparkle 2.4s ease-in-out infinite alternate;
}

.poster-spark-one {
  top: 24%;
  right: 19%;
}

.poster-spark-two {
  bottom: 25%;
  left: 18%;
  color: rgb(255 255 255 / 85%);
  font-size: 19px;
  animation-delay: 450ms;
}

.game-poster-stamp {
  position: absolute;
  right: 20px;
  bottom: 22px;
  padding: 8px 11px;
  border: 1px solid rgb(255 255 255 / 30%);
  border-radius: 999px;
  background: rgb(25 22 53 / 20%);
  color: #fff;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.13em;
  backdrop-filter: blur(8px);
}

.game-poster-index {
  position: absolute;
  bottom: 22px;
  left: 22px;
  color: rgb(255 255 255 / 54%);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.game-selection-copy {
  display: flex;
  min-width: 0;
  max-height: 100%;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  padding: 6px 4px;
  text-align: left;
  overscroll-behavior: contain;
}

.game-selection-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.game-selection-category,
.game-selection-current {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 4px 9px;
  border: 1px solid rgb(215 207 255 / 23%);
  border-radius: 999px;
  background: rgb(255 255 255 / 7%);
  color: #ded9ff;
  font-size: 9px;
  font-weight: 700;
}

.game-selection-current {
  border-color: rgb(121 218 181 / 24%);
  background: rgb(102 207 162 / 10%);
  color: #a9f1d3;
}

.game-selection-copy h3 {
  margin: 13px 0 0;
  color: #fff;
  font-size: clamp(27px, 4.6vw, 51px);
  font-weight: 850;
  letter-spacing: -0.06em;
  line-height: 1.13;
}

.game-selection-headline {
  max-width: 590px;
  margin: 12px 0 0;
  color: #f6d98d;
  font-size: clamp(15px, 2vw, 22px);
  font-weight: 750;
  letter-spacing: -0.025em;
  line-height: 1.45;
}

.game-selection-description {
  max-width: 560px;
  margin: 10px 0 0;
  color: #d0ccdf;
  font-size: clamp(11px, 1.2vw, 14px);
  line-height: 1.8;
}

.game-selection-catalog-copy {
  margin: 11px 0 0;
  color: #9792ac;
  font-size: 10px;
  line-height: 1.6;
}

.game-selection-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}

.game-selection-facts span {
  padding: 8px 11px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 10px;
  background: rgb(255 255 255 / 5%);
  color: #a9a4bb;
  font-size: 9px;
}

.game-selection-facts strong {
  color: #fff;
  font-size: 10px;
}

.game-selection-facts span.is-out-of-range {
  border-color: rgb(255 150 145 / 24%);
  background: rgb(255 150 145 / 8%);
  color: #ffc3bc;
}

.game-selection-facts span.is-out-of-range strong {
  color: #ffc3bc;
}

.game-selection-pagination {
  min-height: 27px;
  justify-content: center;
  gap: 22px;
}

.game-selection-page-count {
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.game-selection-page-count span {
  color: #817b9a;
  font-size: 10px;
}

.game-selection-dots {
  display: flex;
  align-items: center;
  gap: 7px;
}

.game-selection-dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: 0;
  border-radius: 99px;
  background: rgb(255 255 255 / 27%);
  transition: width 180ms ease, background 180ms ease;
}

.game-selection-dot.is-active {
  width: 24px;
  background: #c7bfff;
}

.game-selection-swipe-hint {
  color: #a6a1ba;
  font-size: 9px;
}

.game-selection-swipe-hint span {
  margin-right: 4px;
  color: #d2cbff;
  font-size: 13px;
}

.game-selection-footer {
  min-height: 50px;
  gap: 16px;
}

.game-selection-footer p {
  max-width: 680px;
  margin: 0;
  color: #b1acc2;
  font-size: 10px;
  line-height: 1.6;
}

.game-selection-confirm {
  display: flex;
  min-width: 188px;
  min-height: 46px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 16px;
  border: 1px solid rgb(255 255 255 / 36%);
  border-radius: 14px;
  background: linear-gradient(115deg, #8b7af3, #6756df);
  box-shadow: 0 9px 26px rgb(105 87 232 / 26%);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  transition: filter 150ms ease, transform 150ms ease;
}

.game-selection-confirm:not(:disabled):hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
}

.game-selection-confirm:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.game-selection-done {
  justify-content: center;
  background: rgb(255 255 255 / 9%);
  box-shadow: none;
}

@keyframes game-selection-enter {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes poster-orbit {
  to {
    rotate: 360deg;
  }
}

@keyframes poster-sparkle {
  from {
    opacity: 0.55;
    transform: scale(0.85) rotate(-8deg);
  }

  to {
    opacity: 1;
    transform: scale(1.08) rotate(8deg);
  }
}

@media (max-width: 760px) {
  .game-selection-dialog {
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    gap: 10px;
    padding: max(13px, env(safe-area-inset-top)) 12px max(14px, env(safe-area-inset-bottom));
  }

  .game-selection-header {
    gap: 9px;
  }

  .game-selection-overline {
    font-size: 7px;
  }

  .game-selection-header h2 {
    font-size: clamp(20px, 5vw, 28px);
  }

  .game-selection-subtitle {
    max-width: 270px;
    font-size: 9px;
    line-height: 1.45;
  }

  .game-selection-header-actions {
    gap: 7px;
  }

  .game-selection-readonly {
    padding: 6px 7px;
    font-size: 8px;
  }

  .game-selection-close {
    width: 38px;
    height: 38px;
    border-radius: 12px;
  }

  .game-selection-carousel {
    grid-template-columns: minmax(0, 1fr);
  }

  .game-selection-arrow {
    display: none;
  }

  .game-selection-slide {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: 14px;
    padding: 14px;
  }

  .game-selection-poster {
    min-height: 170px;
    max-height: 270px;
    border-radius: 20px;
  }

  .game-poster-edition {
    top: 13px;
    left: 13px;
    font-size: 6px;
  }

  .game-poster-stamp {
    right: 10px;
    bottom: 12px;
    padding: 6px 7px;
    font-size: 6px;
  }

  .game-poster-index {
    bottom: 13px;
    left: 13px;
    font-size: 8px;
  }

  .game-selection-copy h3 {
    margin-top: 8px;
    font-size: clamp(22px, 5vw, 35px);
  }

  .game-selection-headline {
    margin-top: 8px;
    font-size: clamp(12px, 2.8vw, 17px);
  }

  .game-selection-description {
    margin-top: 6px;
    font-size: 10px;
    line-height: 1.6;
  }

  .game-selection-catalog-copy {
    margin-top: 7px;
    font-size: 8px;
  }

  .game-selection-facts {
    gap: 5px;
    margin-top: 10px;
  }

  .game-selection-facts span {
    padding: 6px 7px;
    font-size: 8px;
  }

  .game-selection-pagination {
    justify-content: space-between;
    gap: 8px;
  }

  .game-selection-swipe-hint {
    font-size: 8px;
  }

  .game-selection-footer {
    align-items: stretch;
    gap: 9px;
  }

  .game-selection-footer p {
    align-self: center;
    font-size: 8px;
  }

  .game-selection-confirm {
    min-width: 132px;
    min-height: 43px;
    gap: 8px;
    padding-inline: 11px;
    font-size: 9px;
  }
}

@media (max-width: 430px) {
  .game-selection-dialog {
    padding-inline: 8px;
  }

  .game-selection-readonly {
    display: none;
  }

  .game-selection-slide {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(130px, 0.38fr) minmax(0, 0.62fr);
    align-content: stretch;
    gap: 10px;
    padding: 12px;
  }

  .game-selection-poster {
    width: min(100%, 310px);
    min-height: 0;
    height: 100%;
    max-height: none;
  }

  .game-poster-icon {
    width: min(35%, 110px);
    font-size: clamp(40px, 14vw, 68px);
  }

  .theme-werewolf .game-poster-icon {
    font-size: clamp(48px, 16vw, 82px);
  }

  .game-selection-copy {
    align-self: stretch;
    justify-content: flex-start;
    padding: 0 3px;
  }

  .game-selection-category,
  .game-selection-current {
    min-height: 21px;
    padding: 3px 7px;
    font-size: 7px;
  }

  .game-selection-copy h3 {
    margin-top: 5px;
    font-size: clamp(22px, 7vw, 30px);
  }

  .game-selection-headline {
    margin-top: 4px;
    font-size: 11px;
  }

  .game-selection-description {
    font-size: 9px;
  }

  .game-selection-catalog-copy {
    display: none;
  }

  .game-selection-facts {
    margin-top: 7px;
  }

  .game-selection-footer {
    flex-direction: column;
  }

  .game-selection-footer p {
    min-height: 24px;
    text-align: center;
  }

  .game-selection-confirm {
    width: 100%;
    min-height: 42px;
    justify-content: center;
  }
}

@media (max-height: 520px) and (min-width: 761px) {
  .game-selection-dialog {
    gap: 7px;
    padding-block: 10px;
  }

  .game-selection-header h2 {
    font-size: 22px;
  }

  .game-selection-subtitle {
    margin-top: 2px;
  }

  .game-selection-slide {
    gap: 22px;
    padding-block: 12px;
  }

  .game-selection-poster {
    min-height: 0;
  }

  .game-selection-copy h3 {
    margin-top: 6px;
    font-size: 29px;
  }

  .game-selection-headline,
  .game-selection-description {
    margin-top: 5px;
  }

  .game-selection-facts {
    margin-top: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .game-selection-overlay,
  .game-poster-orbit,
  .game-poster-spark {
    animation: none;
  }

  .game-selection-track {
    scroll-behavior: auto;
  }
}
</style>
