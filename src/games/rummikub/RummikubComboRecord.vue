<script setup lang="ts">
import { computed } from 'vue'
import { getRummikubComboTier } from '../../../shared/games/rummikub'
import type { RummikubComboState } from '../../../shared/games/rummikub'

const props = defineProps<{
  combo: RummikubComboState
  playerName: string
}>()

const tier = computed(() => getRummikubComboTier(props.combo.count))
const message = computed(() => {
  switch (tier.value) {
    case 'spark':
      return `${props.playerName} 剛剛打出 ${props.combo.count} Hit，漂亮出牌！`
    case 'surge':
      return `${props.playerName} 攻勢大爆發，剛剛打出 ${props.combo.count} Hit！`
    case 'overdrive':
      return `${props.playerName} 火力全開，剛剛創下 ${props.combo.count} Hit！！！`
  }
})
</script>

<template>
  <aside
    class="rummikub-combo-record"
    :class="`is-${tier}`"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <span>上一回合戰績</span>
    <strong>{{ message }}</strong>
  </aside>
</template>

<style scoped>
.rummikub-combo-record {
  display: grid;
  width: min(100%, 540px);
  justify-self: center;
  gap: 4px;
  padding: 10px 14px;
  border: 1px solid #e9dfc2;
  border-radius: 12px;
  background: linear-gradient(135deg, #fffefa, #f6f3e7);
  box-shadow: 0 5px 16px rgb(64 57 37 / 7%);
  animation: rummikub-combo-record-arrive 320ms cubic-bezier(0.2, 1.3, 0.4, 1) both;
  text-align: center;
}

.rummikub-combo-record span {
  color: #82866f;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.rummikub-combo-record strong {
  color: #45483f;
  font-size: 12px;
  line-height: 1.45;
}

.rummikub-combo-record.is-spark {
  border-color: #e9d79d;
  background: linear-gradient(135deg, #fffdf2, #fff2cd);
}

.rummikub-combo-record.is-surge {
  border-color: #edb17a;
  background: linear-gradient(135deg, #fff8eb, #ffe5c6);
}

.rummikub-combo-record.is-overdrive {
  border-color: #d8b1ea;
  background: linear-gradient(135deg, #fff4fb, #f0dfff);
}

@keyframes rummikub-combo-record-arrive {
  0% {
    opacity: 0;
    transform: translateY(-7px) scale(0.96);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rummikub-combo-record {
    animation: none;
  }
}
</style>
