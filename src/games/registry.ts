import { defineAsyncComponent, type Component } from 'vue'
import type { GameId } from '../../shared/games'

export interface GameComponents {
  setup?: Component
  playing: Component
  finished: Component
}

export const GAME_COMPONENTS: Record<GameId, GameComponents> = {
  'word-guess': {
    playing: defineAsyncComponent(() => import('./word-guess/WordGuessGame.vue')),
    finished: defineAsyncComponent(() => import('./word-guess/WordGuessResults.vue')),
  },
  // blank: {
  //   playing: defineAsyncComponent(() => import('./blank/BlankGame.vue')),
  //   finished: defineAsyncComponent(() => import('./blank/BlankResults.vue')),
  // },
  'draw-guess': {
    setup: defineAsyncComponent(() => import('./draw-guess/DrawGuessSetup.vue')),
    playing: defineAsyncComponent(() => import('./draw-guess/DrawGuessGame.vue')),
    finished: defineAsyncComponent(() => import('./draw-guess/DrawGuessResults.vue')),
  },
  rummikub: {
    setup: defineAsyncComponent(() => import('./rummikub/RummikubSetup.vue')),
    playing: defineAsyncComponent(() => import('./rummikub/RummikubGame.vue')),
    finished: defineAsyncComponent(() => import('./rummikub/RummikubResults.vue')),
  },
  werewolf: {
    setup: defineAsyncComponent(() => import('./werewolf/WerewolfSetup.vue')),
    playing: defineAsyncComponent(() => import('./werewolf/WerewolfGame.vue')),
    finished: defineAsyncComponent(() => import('./werewolf/WerewolfResults.vue')),
  },
}
