<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { gsap } from 'gsap'
import DawnDoodle from './DawnDoodle.vue'
import DeathDoodle from './DeathDoodle.vue'
import GoodWinDoodle from './GoodWinDoodle.vue'
import NightDoodle from './NightDoodle.vue'
import WolfWinDoodle from './WolfWinDoodle.vue'
import type { WerewolfMoment } from './types'

const props = defineProps<{
  moment: WerewolfMoment
}>()

const emit = defineEmits<{
  complete: [id: number]
}>()

const MOMENT_LABELS: Record<WerewolfMoment['kind'], string> = {
  night: '夜間消息',
  day: '晨間快報',
  death: '出局通知',
  'wolf-win': '狼人勝利',
  'good-win': '好人勝利',
}

const root = ref<HTMLDivElement | null>(null)
let context: gsap.Context | null = null
let completionTimer: number | undefined

onMounted(() => {
  const scope = root.value
  if (!scope) {
    return
  }

  context = gsap.context(() => {
    const complete = () => emit('complete', props.moment.id)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(
        '.ww-moment-card, .ww-moment-art, .ww-moment-heading, .ww-moment-detail',
        { autoAlpha: 1, clearProps: 'transform' },
      )
      completionTimer = window.setTimeout(complete, 1_350)
      return
    }

    const timeline = gsap.timeline({ onComplete: complete })
    timeline
      .fromTo(
        '.ww-moment-card',
        { autoAlpha: 0, y: 14, scale: 0.9 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.38, ease: 'power3.out' },
      )
      .fromTo(
        '.ww-moment-art',
        { autoAlpha: 0, y: 8, scale: 0.92 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.36, ease: 'power2.out' },
        '-=0.2',
      )
      .fromTo(
        '.ww-moment-heading',
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.26, ease: 'power2.out' },
        '-=0.08',
      )
      .fromTo(
        '.ww-moment-detail',
        { autoAlpha: 0, y: 5 },
        { autoAlpha: 1, y: 0, duration: 0.24, ease: 'power2.out' },
        '-=0.1',
      )

    switch (props.moment.kind) {
      case 'night':
        timeline
          .fromTo(
            '.ww-moment-spark',
            { autoAlpha: 0, scale: 0.55, transformOrigin: '50% 50%' },
            { autoAlpha: 1, scale: 1, duration: 0.28, stagger: 0.07, ease: 'back.out(1.6)' },
            0.18,
          )
          .to(
            '.ww-moment-moon',
            { y: -4, duration: 0.35, repeat: 1, yoyo: true, ease: 'sine.inOut' },
            0.48,
          )
          .to(
            '.ww-moment-zzz',
            { y: -7, autoAlpha: 0.35, duration: 0.4, repeat: 1, yoyo: true, ease: 'sine.inOut' },
            0.38,
          )
        break
      case 'day':
        timeline
          .fromTo(
            '.ww-moment-rays',
            { autoAlpha: 0, scale: 0.82, rotation: -4, transformOrigin: '50% 50%' },
            { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.34, ease: 'power2.out' },
            0.15,
          )
          .fromTo(
            '.ww-moment-sun',
            { autoAlpha: 0, scale: 0.86, y: 8, transformOrigin: '50% 50%' },
            { autoAlpha: 1, scale: 1, y: 0, duration: 0.38, ease: 'back.out(1.5)' },
            0.22,
          )
          .to(
            '.ww-moment-sun',
            { y: -3, duration: 0.26, repeat: 1, yoyo: true, ease: 'sine.inOut' },
            0.62,
          )
          .to(
            '.ww-moment-cloud',
            { x: 4, duration: 0.34, repeat: 1, yoyo: true, ease: 'sine.inOut' },
            0.46,
          )
        break
      case 'death':
        timeline
          .fromTo(
            '.ww-moment-ghost',
            { autoAlpha: 0, y: 14, scale: 0.82, transformOrigin: '50% 100%' },
            { autoAlpha: 1, y: 0, scale: 1, duration: 0.38, ease: 'back.out(1.4)' },
            0.18,
          )
          .fromTo(
            '.ww-moment-death-spark',
            { autoAlpha: 0, scale: 0.55, rotation: -10, transformOrigin: '50% 50%' },
            { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.28, stagger: 0.08, ease: 'back.out(1.5)' },
            0.32,
          )
          .to(
            '.ww-moment-ghost',
            { y: -3, duration: 0.28, repeat: 1, yoyo: true, ease: 'sine.inOut' },
            0.62,
          )
        break
      case 'wolf-win':
      case 'good-win': {
        const character = props.moment.kind === 'wolf-win' ? '.ww-moment-wolf' : '.ww-moment-villager'
        timeline
          .fromTo(
            character,
            { autoAlpha: 0, y: 12, scale: 0.88, transformOrigin: '50% 100%' },
            { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.5)' },
            0.16,
          )
          .fromTo(
            '.ww-moment-trophy',
            { autoAlpha: 0, y: 9, scale: 0.78, rotation: -6, transformOrigin: '50% 80%' },
            { autoAlpha: 1, y: 0, scale: 1, rotation: 0, duration: 0.42, ease: 'back.out(1.6)' },
            0.3,
          )
          .fromTo(
            '.ww-moment-confetti',
            { autoAlpha: 0, y: -5, scale: 0.6, transformOrigin: '50% 50%' },
            { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, stagger: 0.06, ease: 'power2.out' },
            0.12,
          )
        break
      }
    }

    timeline.to(
      '.ww-moment-card',
      { autoAlpha: 0, y: -5, scale: 0.98, duration: 0.24, ease: 'power2.in' },
      '+=0.42',
    )
  }, scope)
})

onUnmounted(() => {
  context?.revert()
  if (completionTimer !== undefined) {
    window.clearTimeout(completionTimer)
  }
})
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="ww-moment-layer">
      <section
        class="ww-moment-card"
        :class="`is-${moment.kind}`"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <NightDoodle v-if="moment.kind === 'night'" />
        <DawnDoodle v-else-if="moment.kind === 'day'" />
        <DeathDoodle v-else-if="moment.kind === 'death'" />
        <WolfWinDoodle v-else-if="moment.kind === 'wolf-win'" />
        <GoodWinDoodle v-else />

        <span class="ww-moment-label">{{ MOMENT_LABELS[moment.kind] }}</span>
        <h2 class="ww-moment-heading">{{ moment.title }}</h2>
        <p class="ww-moment-detail">{{ moment.detail }}</p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.ww-moment-layer {
  position: fixed;
  z-index: 10010;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgb(41 37 71 / 13%);
  pointer-events: none;
}

.ww-moment-card {
  width: min(350px, 100%);
  padding: 16px 22px 21px;
  border: 1px solid #eceaf3;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 16px 44px rgb(41 37 71 / 14%);
  text-align: center;
  transform-origin: center;
}

.ww-moment-card,
.ww-moment-art,
.ww-moment-heading,
.ww-moment-detail {
  opacity: 0;
  visibility: hidden;
}

.ww-moment-art {
  display: block;
  width: min(210px, 78%);
  height: 140px;
  margin: 0 auto 2px;
  overflow: visible;
}

.ww-moment-label {
  display: inline-flex;
  align-items: center;
  min-height: 23px;
  margin-bottom: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #f0eeff;
  color: #6258c3;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.ww-moment-card.is-day .ww-moment-label {
  background: #fff4dd;
  color: #a36f27;
}

.ww-moment-card.is-death .ww-moment-label {
  background: #fff0ef;
  color: #ad5c63;
}

.ww-moment-card.is-wolf-win .ww-moment-label {
  background: #fff0e7;
  color: #a65e42;
}

.ww-moment-card.is-good-win .ww-moment-label {
  background: #e9f7ef;
  color: #468269;
}

.ww-moment-heading {
  margin: 3px 0 6px;
  color: #292547;
  font-size: 23px;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.ww-moment-detail {
  margin: 0;
  color: #77738e;
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
</style>
