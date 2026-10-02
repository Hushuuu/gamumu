<script setup lang="ts">
import type { WerewolfPhase } from '../../../../shared/games/werewolf'

type ActiveWerewolfPhase = Exclude<WerewolfPhase, 'finished'>

const props = defineProps<{
  phase: ActiveWerewolfPhase
}>()
</script>

<template>
  <svg
    class="ww-phase-art"
    viewBox="0 0 48 48"
    aria-hidden="true"
    focusable="false"
  >
    <g v-if="props.phase === 'role-reveal'">
      <g class="role-card">
        <rect x="12" y="6" width="24" height="36" rx="5" fill="#fff" stroke="#7564dc" stroke-width="1.7" />
        <rect x="16" y="11" width="16" height="19" rx="3" fill="#f0edff" />
        <path d="M21 17.5c.3-1.5 1.4-2.3 3-2.3 1.8 0 3 1 3 2.6 0 2.1-2.7 2.7-2.7 4.9" fill="none" stroke="#7564dc" stroke-linecap="round" stroke-width="1.8" />
        <circle cx="24.3" cy="26.2" r="1" fill="#7564dc" />
        <path d="M18 34h12" stroke="#c4bdf0" stroke-linecap="round" stroke-width="2" />
        <path class="role-sheen" d="M14 14h4l13 24h-4z" fill="#fff" opacity=".65" />
      </g>
      <path class="role-star" d="m37 7 1.2 2.8L41 11l-2.8 1.2L37 15l-1.2-2.8L33 11l2.8-1.2z" fill="#f2bd58" />
    </g>

    <g v-else-if="props.phase === 'night'">
      <path class="night-moon" d="M29.1 7.8a15.4 15.4 0 1 0 11 26.4A13.2 13.2 0 0 1 29.1 7.8Z" fill="#f3c96b" />
      <circle class="night-star night-star-one" cx="13" cy="14" r="1.6" fill="#fff" />
      <circle class="night-star night-star-two" cx="12" cy="27" r="1.2" fill="#bdb4ff" />
      <circle class="night-star night-star-three" cx="37" cy="19" r="1.1" fill="#fff" />
      <path class="night-spark" d="m18 8 .8 1.8 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill="#d6d0ff" />
    </g>

    <g v-else-if="props.phase === 'dawn'">
      <g class="dawn-rays" fill="none" stroke="#e4ae52" stroke-linecap="round" stroke-width="1.7">
        <path d="M24 7v4M12 12l2.8 2.8M36 12l-2.8 2.8M7 25h4M37 25h4" />
      </g>
      <path class="dawn-sun" d="M15 32a9 9 0 0 1 18 0z" fill="#f3bd57" />
      <path d="M7 33.5h34" stroke="#d6a453" stroke-linecap="round" stroke-width="2" />
      <path d="M11 38h26" stroke="#e8d6b2" stroke-linecap="round" stroke-width="1.5" />
    </g>

    <g v-else-if="props.phase === 'hunter-shot'">
      <circle class="hunter-target hunter-target-outer" cx="26" cy="21" r="13" fill="none" stroke="#e88a7b" stroke-width="1.7" />
      <circle class="hunter-target hunter-target-inner" cx="26" cy="21" r="6.5" fill="none" stroke="#e88a7b" stroke-width="1.7" />
      <circle cx="26" cy="21" r="1.7" fill="#e88a7b" />
      <path class="hunter-arrow" d="M8 40 28 20m-7 0h7v7" fill="none" stroke="#61568f" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" />
      <path d="M8 40 6.5 35.5 12.5 39z" fill="#61568f" />
    </g>

    <g v-else-if="props.phase === 'day-discussion'">
      <path class="talk-bubble talk-bubble-back" d="M7.5 11a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4h-6l-4 4v-4h-4a4 4 0 0 1-4-4z" fill="#eeebff" stroke="#7b6ddd" stroke-linejoin="round" stroke-width="1.6" />
      <circle class="talk-dot talk-dot-one" cx="14" cy="14.5" r="1.2" fill="#7b6ddd" />
      <circle class="talk-dot talk-dot-two" cx="19" cy="14.5" r="1.2" fill="#7b6ddd" />
      <circle class="talk-dot talk-dot-three" cx="24" cy="14.5" r="1.2" fill="#7b6ddd" />
      <path class="talk-bubble talk-bubble-front" d="M19 26a4 4 0 0 1 4-4h13a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-4v4l-4-4h-5a4 4 0 0 1-4-4z" fill="#fff" stroke="#6e9db5" stroke-linejoin="round" stroke-width="1.6" />
      <circle class="talk-dot talk-dot-four" cx="25.5" cy="29.5" r="1.1" fill="#6e9db5" />
      <circle class="talk-dot talk-dot-five" cx="30" cy="29.5" r="1.1" fill="#6e9db5" />
      <circle class="talk-dot talk-dot-six" cx="34.5" cy="29.5" r="1.1" fill="#6e9db5" />
    </g>

    <g v-else-if="props.phase === 'vote'">
      <g class="ballot-paper">
        <rect x="10" y="6" width="28" height="36" rx="5" fill="#fff" stroke="#7564dc" stroke-width="1.7" />
        <rect x="15" y="13" width="7" height="7" rx="1.5" fill="#eeebff" stroke="#988bdf" stroke-width="1.2" />
        <path d="M25 15h8M25 19h6" stroke="#c4bdf0" stroke-linecap="round" stroke-width="1.5" />
        <path class="vote-check" d="m15.5 29 4 4 7-8" fill="none" stroke="#59a982" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" />
        <path d="M29 29h4M29 33h3" stroke="#c4bdf0" stroke-linecap="round" stroke-width="1.5" />
      </g>
    </g>

    <g v-else-if="props.phase === 'vote-result'">
      <path d="M8 39h32" stroke="#c9c4de" stroke-linecap="round" stroke-width="1.6" />
      <rect class="result-bar result-bar-one" x="11" y="28" width="6" height="11" rx="2" fill="#b8afea" />
      <rect class="result-bar result-bar-two" x="21" y="21" width="6" height="18" rx="2" fill="#9588db" />
      <rect class="result-bar result-bar-three" x="31" y="13" width="6" height="26" rx="2" fill="#6f60c9" />
      <path class="result-trend" d="m10 23 9-5 7 2 12-10" fill="none" stroke="#e59d67" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
      <path d="m34 10 4-.5-.5 4" fill="none" stroke="#e59d67" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
    </g>
  </svg>
</template>

<style scoped>
.ww-phase-art {
  display: block;
  float: right;
  width: 44px;
  height: 44px;
  margin: 0 0 4px 12px;
  overflow: visible;
}

.role-card {
  transform-box: fill-box;
  transform-origin: center;
  animation: role-card-reveal 650ms cubic-bezier(0.2, 0.75, 0.3, 1) both;
}

.role-sheen {
  opacity: 0;
  animation: role-card-sheen 850ms 180ms ease-out both;
}

.role-star {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: role-star-pop 380ms 420ms cubic-bezier(0.2, 0.75, 0.3, 1) both;
}

.night-moon {
  opacity: 0;
  animation: night-moon-rise 650ms cubic-bezier(0.2, 0.75, 0.3, 1) both;
}

.night-star,
.night-spark {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: night-star-twinkle 420ms ease-out both;
}

.night-star-two {
  animation-delay: 120ms;
}

.night-star-three {
  animation-delay: 220ms;
}

.night-spark {
  animation-delay: 300ms;
}

.dawn-rays {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: dawn-rays-appear 650ms 90ms ease-out both;
}

.dawn-sun {
  opacity: 0;
  animation: dawn-sun-rise 620ms cubic-bezier(0.2, 0.75, 0.3, 1) both;
}

.hunter-target {
  transform-box: fill-box;
  transform-origin: center;
  animation: hunter-lock 520ms cubic-bezier(0.2, 0.75, 0.3, 1) both;
}

.hunter-target-inner {
  animation-delay: 100ms;
}

.hunter-arrow {
  opacity: 0;
  animation: hunter-arrow-shot 460ms 180ms ease-out both;
}

.talk-bubble {
  transform-box: fill-box;
  transform-origin: center;
  animation: talk-pop 420ms cubic-bezier(0.2, 0.75, 0.3, 1) both;
}

.talk-bubble-front {
  animation-delay: 160ms;
}

.talk-dot {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: talk-dot-appear 260ms 240ms ease-out both;
}

.talk-dot-two,
.talk-dot-five {
  animation-delay: 300ms;
}

.talk-dot-three,
.talk-dot-six {
  animation-delay: 360ms;
}

.ballot-paper {
  transform-box: fill-box;
  transform-origin: center;
  animation: ballot-enter 600ms cubic-bezier(0.2, 0.75, 0.3, 1) both;
}

.vote-check {
  stroke-dasharray: 18;
  stroke-dashoffset: 18;
  animation: vote-check-draw 420ms 280ms ease-out both;
}

.result-bar {
  transform-box: fill-box;
  transform-origin: center bottom;
  animation: result-bar-rise 520ms cubic-bezier(0.2, 0.75, 0.3, 1) both;
}

.result-bar-two {
  animation-delay: 100ms;
}

.result-bar-three {
  animation-delay: 200ms;
}

.result-trend {
  stroke-dasharray: 40;
  stroke-dashoffset: 40;
  animation: result-trend-draw 580ms 220ms ease-out both;
}

@keyframes role-card-reveal {
  from {
    opacity: 0;
    transform: translateY(4px) rotate(-8deg) scale(0.88);
  }

  to {
    opacity: 1;
    transform: translateY(0) rotate(0) scale(1);
  }
}

@keyframes role-card-sheen {
  0%, 100% {
    opacity: 0;
    transform: translateX(-5px);
  }

  45% {
    opacity: 0.55;
  }

  80% {
    opacity: 0.18;
    transform: translateX(4px);
  }
}

@keyframes role-star-pop {
  from {
    opacity: 0;
    transform: scale(0.45);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes night-moon-rise {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes night-star-twinkle {
  from {
    opacity: 0;
    transform: scale(0.45);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes dawn-rays-appear {
  from {
    opacity: 0;
    transform: scale(0.82);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes dawn-sun-rise {
  from {
    opacity: 0;
    transform: translateY(7px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes hunter-lock {
  from {
    opacity: 0;
    transform: scale(0.78);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes hunter-arrow-shot {
  from {
    opacity: 0;
    transform: translate(-5px, 5px);
  }

  to {
    opacity: 1;
    transform: translate(0, 0);
  }
}

@keyframes talk-pop {
  from {
    opacity: 0;
    transform: translateY(3px) scale(0.92);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes talk-dot-appear {
  from {
    opacity: 0;
    transform: scale(0.4);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes ballot-enter {
  from {
    opacity: 0;
    transform: translateY(4px) rotate(-4deg) scale(0.94);
  }

  to {
    opacity: 1;
    transform: translateY(0) rotate(0) scale(1);
  }
}

@keyframes vote-check-draw {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes result-bar-rise {
  from {
    transform: scaleY(0.1);
  }

  to {
    transform: scaleY(1);
  }
}

@keyframes result-trend-draw {
  to {
    stroke-dashoffset: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ww-phase-art,
  .ww-phase-art * {
    animation: none;
  }

  .role-star,
  .night-moon,
  .night-star,
  .night-spark,
  .dawn-rays,
  .dawn-sun,
  .hunter-arrow,
  .talk-dot {
    opacity: 1;
  }

  .vote-check,
  .result-trend {
    stroke-dashoffset: 0;
  }
}
</style>
