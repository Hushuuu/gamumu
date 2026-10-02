<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  getGameOption,
  getWerewolfRoleCounts,
  WEREWOLF_ROLES,
  WEREWOLF_SCRIPTS,
  type GameId,
} from '../../shared/games'

interface RuleSection {
  title: string
  items: string[]
}

interface RulesContent {
  title: string
  description: string
  sections: RuleSection[]
}

const props = defineProps<{
  gameId: GameId
  gameSettings: Record<string, unknown>
  playerCount: number
}>()

const isOpen = ref(false)
const gameName = computed(() => getGameOption(props.gameId).name)
const werewolfScript = computed(() => {
  return WEREWOLF_SCRIPTS.find((script) => script.id === props.gameSettings.scriptId) ??
    WEREWOLF_SCRIPTS[0]!
})
const werewolfRoleCounts = computed(() => {
  return getWerewolfRoleCounts(werewolfScript.value.id, props.playerCount)
})
const content = computed<RulesContent>(() => {
  switch (props.gameId) {
    case 'word-guess':
      return {
        title: `${gameName.value}規則`,
        description: '在倒數時間內猜出提示代表的詞語，與其他玩家一起累積分數。',
        sections: [
          {
            title: '遊戲流程',
            items: [
              '全場共 5 題，每題作答時間為 20 秒；時間到或所有人作答後公布答案。',
              '每位玩家每題只能提交一次答案，公布後自動進入下一題。',
            ],
          },
          {
            title: '得分方式',
            items: ['答對一題可得 100 分；答錯不扣分。'],
          },
        ],
      }
    // case 'blank':
    //   return {
    //     title: `${gameName.value}規則`,
    //     description: '這是用來驗證共用房間流程的測試遊戲，目前沒有競賽或計分玩法。',
    //     sections: [
    //       {
    //         title: '遊戲流程',
    //         items: ['所有玩家準備後由房主開始測試。', '測試期間所有玩家會收到相同的遊戲狀態。'],
    //       },
    //       {
    //         title: '結束遊戲',
    //         items: ['只有房主可以按下「結束測試遊戲」。'],
    //       },
    //     ],
    //   }
    case 'draw-guess': {
      const roundsPerPlayer = settingNumber('roundsPerPlayer', 1)
      const drawTimeSeconds = settingNumber('drawTimeSeconds', 60)
      const guessTimeSeconds = settingNumber('guessTimeSeconds', 30)
      return {
        title: `${gameName.value}規則`,
        description: '玩家輪流設定題目並作畫，其餘玩家看畫猜答案。',
        sections: [
          {
            title: '遊戲流程',
            items: [
              `每位玩家輪流當繪圖者 ${roundsPerPlayer} 輪；每輪有 30 秒設定題目，再於 ${drawTimeSeconds} 秒內作畫，逾時會跳過。`,
              `作畫完成後，其他玩家有 ${guessTimeSeconds} 秒猜答案；繪圖者不能猜自己的題目。`,
              '繪圖者離線或跳過時，該回合會跳過並輪到下一位玩家。',
            ],
          },
          {
            title: '得分方式',
            items: [
              '每位猜中的玩家得 50 分；該輪第一位玩家猜中時，繪圖者也得 50 分。',
              '猜錯不扣分，可在猜答案階段繼續嘗試。',
            ],
          },
        ],
      }
    }
    case 'werewolf': {
      const script = werewolfScript.value
      const counts = werewolfRoleCounts.value
      const composition = counts
        ? script.roles
            .filter((roleId) => counts[roleId] > 0)
            .map((roleId) => `${WEREWOLF_ROLES[roleId].name} × ${counts[roleId]}`)
            .join('、')
        : `目前 ${props.playerCount} 人不適用此劇本的人數配置。`
      const rolesInThisGame = counts
        ? script.roles.filter((roleId) => counts[roleId] > 0)
        : script.roles
      const roleDescriptions = rolesInThisGame.map(
        (roleId) => `${WEREWOLF_ROLES[roleId].name}：${WEREWOLF_ROLES[roleId].description}`,
      )
      const scriptRules =
        script.id === 'wolf-guard'
          ? [
              '本劇本至少 10 人，額外加入狼王與守衛；狼人陣營由狼人及狼王組成。',
              '狼王在被狼人襲擊或被白天放逐時可開槍，遭女巫毒殺時不能開槍。',
              '守衛每晚守護一名存活玩家，不能連續兩晚守護同一人；守衛與女巫同晚救同一位狼隊目標時，該玩家仍會出局。',
            ]
          : [
              '本劇本使用狼人、村民、預言家、女巫與獵人，不包含狼王及守衛。',
              '獵人在被狼人襲擊或被白天放逐時可開槍，遭女巫毒殺時不能開槍。',
            ]

      return {
        title: `${script.name}規則`,
        description: `${script.description}適用人數：${script.minPlayers}–${script.maxPlayers} 人。`,
        sections: [
          {
            title: '勝負條件',
            items: ['所有狼人出局，好人陣營獲勝。', '所有好人出局，狼人陣營獲勝。'],
          },
          {
            title: '遊戲流程',
            items: [
              '查看身分後進入夜晚，依序執行角色行動；天亮公布出局結果，再進行討論及投票。',
              '投票票數最高者被放逐；若最高票平手或沒有有效投票，則無人被放逐。',
            ],
          },
          {
            title: `本局配置（${props.playerCount} 人）`,
            items: [composition],
          },
          {
            title: '本劇本角色',
            items: roleDescriptions,
          },
          {
            title: '劇本規則',
            items: [
              ...scriptRules,
              '狼人陣營可選擇任何存活的其他玩家作為襲擊目標，包含同陣營玩家；不能選自己。',
              '預言家每晚可查驗一名存活玩家，每名玩家整局只能查驗一次。',
              '女巫各有一瓶解藥及毒藥，同一晚最多使用其中一瓶。',
            ],
          },
        ],
      }
    }
  }
})

function settingNumber(key: string, fallback: number): number {
  const value = props.gameSettings[key]
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}

function close(): void {
  isOpen.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    close()
  }
}

watch(isOpen, (open) => {
  if (open) {
    window.addEventListener('keydown', handleKeydown)
  } else {
    window.removeEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <button
    class="button button-secondary game-rules-trigger"
    type="button"
    :aria-expanded="isOpen"
    aria-haspopup="dialog"
    @click="isOpen = true"
  >
    規則說明
  </button>

  <Teleport to="body">
    <div v-if="isOpen" class="game-rules-backdrop" @click.self="close">
      <section
        class="game-rules-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-rules-title"
      >
        <header class="game-rules-header">
          <div>
            <p class="eyebrow">遊戲說明</p>
            <h2 id="game-rules-title">{{ content.title }}</h2>
          </div>
          <button
            class="button button-secondary game-rules-close"
            type="button"
            aria-label="關閉規則說明"
            @click="close"
          >
            關閉
          </button>
        </header>
        <div class="game-rules-content">
          <p class="game-rules-description">{{ content.description }}</p>
          <section v-for="section in content.sections" :key="section.title" class="game-rules-section">
            <h3>{{ section.title }}</h3>
            <ul>
              <li v-for="(item, index) in section.items" :key="index">{{ item }}</li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.game-rules-trigger {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  font-size: 10px;
  white-space: nowrap;
}

.game-rules-backdrop {
  position: fixed;
  inset: 0;
  z-index: 11000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(25 22 39 / 64%);
  color: var(--ink);
}

.game-rules-dialog {
  display: grid;
  width: min(100%, 720px);
  max-height: min(84vh, 850px);
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 24px 80px rgb(21 18 38 / 24%);
}

.game-rules-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid #eceaf3;
}

.game-rules-header .eyebrow {
  margin: 0 0 4px;
}

.game-rules-header h2 {
  margin: 0;
  color: var(--ink);
  font-size: 19px;
}

.game-rules-close {
  min-height: 36px;
  flex: 0 0 auto;
  padding: 0 12px;
  border-radius: 9px;
  font-size: 11px;
}

.game-rules-content {
  min-height: 0;
  overflow: auto;
  padding: 18px 22px 24px;
  overscroll-behavior: contain;
  text-align: left;
}

.game-rules-description {
  margin: 0 0 18px;
  color: #5c5875;
  font-size: 13px;
  line-height: 1.6;
}

.game-rules-section {
  margin-top: 18px;
}

.game-rules-section h3 {
  margin: 0 0 8px;
  color: var(--purple-dark);
  font-size: 12px;
}

.game-rules-section ul {
  display: grid;
  gap: 7px;
  margin: 0;
  padding-left: 20px;
  color: #55516b;
  font-size: 11px;
  line-height: 1.6;
}

@media (max-width: 520px) {

  .game-rules-trigger {
    min-height: 30px;
    padding-inline: 8px;
    font-size: 9px;
  }

  .game-rules-backdrop {
    padding: 0;
  }

  .game-rules-dialog {
    width: 100%;
    height: 100%;
    max-height: none;
    border-radius: 0;
  }

  .game-rules-header {
    padding: max(14px, env(safe-area-inset-top)) 14px 12px;
  }

  .game-rules-header h2 {
    font-size: 17px;
  }

  .game-rules-content {
    padding: 14px 16px 22px;
  }
}
</style>
