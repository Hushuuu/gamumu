<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  AVALON_ROLES,
  getGameOption,
  getAvalonMissionTeamSizes,
  getAvalonPlayerRange,
  getAvalonRoleCounts,
  isAvalonRoleId,
  getWerewolfRoleCounts,
  WEREWOLF_ROLES,
  WEREWOLF_SCRIPTS,
  type GameId,
} from '../../shared/games'
import { gameAssetUrl } from './gameAssets'

interface RuleSection {
  title: string
  items: string[]
  cards?: RuleCard[]
}

interface RuleCard {
  name: string
  effect: string
}

interface RuleImage {
  src: string
  alt: string
}

interface RulesContent {
  title: string
  description: string
  sections: RuleSection[]
  images: RuleImage[]
}

const GAME_RULE_IMAGES: Record<GameId, RuleImage[]> = {
  'word-guess': [],
  'draw-guess': [],
  rummikub: [
    { src: "games/rummikub/rummikub_rules.webp", alt: '規則圖' },
  ],
  werewolf: [],
  avalon: [
    { src: "games/avalon/avalon_rules2.webp", alt: '規則圖' },
  ],
  'exploding-kittens': [],
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
  const images = GAME_RULE_IMAGES[props.gameId]
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
        images,
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
      const revealTimeSeconds = settingNumber('revealTimeSeconds', 10)
      const isQuestionBank = props.gameSettings.questionMode === 'bank'
      const showHints = props.gameSettings.showHints !== false
      return {
        title: `${gameName.value}規則`,
        description: '玩家輪流作畫，其餘玩家看畫猜答案；可使用自由出題或分類題庫。',
        sections: [
          {
            title: '遊戲流程',
            items: [
              isQuestionBank
                ? `每位玩家輪流當繪圖者 ${roundsPerPlayer} 輪；題目從已選分類的題庫抽出，查看固定提示後開始作畫。`
                : `每位玩家輪流當繪圖者 ${roundsPerPlayer} 輪；繪圖者先輸入題目與選填提示，再於 ${drawTimeSeconds} 秒內作畫。`,
              `繪畫期間即可猜題，${showHints ? '畫面會顯示提示和答案字數' : '不顯示提示，但答案字數一律會顯示'}；猜中會立即加分，完成繪圖後公布本題結果。`,
              `繪圖完成後，仍未猜中的玩家可再用 ${guessTimeSeconds} 秒猜答案；繪圖者不能猜自己的題目。`,
              `答案公布 ${revealTimeSeconds} 秒後自動進入下一題；房主可以提前結束公布。`,
              '猜題者可以放棄本題，放棄後不會再看到猜題輸入。',
              '繪圖者離線或跳過時，該回合會跳過並輪到下一位玩家。',
            ],
          },
          {
            title: '得分方式',
            items: [
              '每位猜中的玩家得 50 分；第一位玩家猜中時，繪圖者也得 50 分。',
              '猜錯不扣分，可在繪圖期間和後續猜題時間繼續嘗試。',
            ],
          },
        ],
        images,
      }
    }
    case 'exploding-kittens':
      return {
        title: `${gameName.value}規則`,
        description: '避開爆炸貓、適時使用拆除牌，成為最後存活的玩家。',
        sections: [
          {
            title: '回合與勝利',
            items: [
              '每位玩家取得 7 張手牌及 1 張拆除牌；牌堆加入比玩家數少 1 張的爆炸貓。',
              '2–5 人使用一副牌；6–9 人使用兩副牌。最後存活的玩家獲勝。',
              '輪到你時，可打出任意張可用手牌；抽一張牌便結束本回合。',
            ],
          },
          {
            title: '生存與反制牌',
            items: [],
            cards: [
              { name: '爆炸貓', effect: '抽到時立刻觸發爆炸；若沒有拆除牌，就會淘汰。' },
              { name: '拆除', effect: '抽到爆炸貓時使用，避免淘汰，並把爆炸貓放回牌堆指定位置或隨機位置。' },
              { name: '休想', effect: '取消一般卡牌或連擊效果；不能取消爆炸貓與拆除。休想也能反制另一張休想。' },
            ],
          },
          {
            title: '行動牌',
            items: [],
            cards: [
              { name: '攻擊', effect: '結束自己的回合，讓下一位玩家連續進行兩個回合。' },
              { name: '跳過', effect: '立即結束自己的回合；受到攻擊時，每張跳過只抵銷一個回合。' },
              { name: '恩惠', effect: '指定一位玩家，由對方選一張手牌交給你。' },
              { name: '洗混', effect: '重新洗混抽牌堆。' },
              { name: '預見未來', effect: '私下查看抽牌堆頂端三張牌。' },
            ],
          },
          {
            title: '貓咪牌',
            items: [],
            cards: [
              { name: '布丁貓', effect: '單張沒有特殊效果，可與其他可組合牌一起打出連擊。' },
              { name: '芋頭貓', effect: '單張沒有特殊效果，可與其他可組合牌一起打出連擊。' },
              { name: '抹茶貓', effect: '單張沒有特殊效果，可與其他可組合牌一起打出連擊。' },
              { name: '蜜桃貓', effect: '單張沒有特殊效果，可與其他可組合牌一起打出連擊。' },
              { name: '麻糬貓', effect: '單張沒有特殊效果，可與其他可組合牌一起打出連擊。' },
            ],
          },
          {
            title: '特殊連擊',
            items: [
              '兩張相同：隨機取得目標玩家一張手牌；三張相同：指定牌名向目標索取，對方沒有該牌時效果無效。',
              '五張不同：從棄牌區取回一張指定牌。連擊可使用除爆炸貓與拆除外的牌種，不限貓咪牌。',
            ],
          },
          {
            title: '休想判定',
            items: [
              '出牌者以外的存活玩家都要回覆：有休想卡可打出或跳過，沒有的人確認即可。全員回覆後立即結算，逾時也會自動處理。',
              '每次打出休想都會重新倒數；奇數張休想會取消原效果，偶數張則讓原效果生效。',
            ],
          },
          {
            title: '計時',
            items: [
              `每回合限時 ${settingNumber('turnTimeSeconds', 20)} 秒；休想判定時間為 ${settingNumber('nopeWindowSeconds', 5)} 秒；回合通知顯示 ${settingNumber('turnNoticeSeconds', 5)} 秒。逾時會由系統自動處理。`,
            ],
          },
        ],
        images,
      }
    case 'rummikub':
      return {
        title: `${gameName.value}規則`,
        description: '2–4 人使用 106 張數字牌與 Joker 組牌，目標是搶先打完自己的手牌。',
        sections: [
          {
            title: '合法組合與登錄',
            items: [
              '每人起手 14 張；Group 是 3–4 張同數字、不同顏色，Run 是 3 張以上同色連號，1 不可接在 13 後面。',
              '第一次出牌必須只用自己的手牌，並以一組或多組合法牌合計至少 30 分完成登錄。',
              '登錄後可以拆解、合併及重排桌面牌組，但每回合至少要打出一張手牌，回合結束時每張桌面牌都必須在合法組合中。',
            ],
          },
          {
            title: '回合與 Joker',
            items: [
              '系統隨機選出先手，之後依房間玩家順序輪流。',
              '房主可在開局前設定每回合 15–300 秒或不限時；限時逾時時，合法且有出牌會自動確認，否則還原編輯並自動抽牌，牌堆已空時則自動跳過。',
              '無法或選擇不出牌時，從牌堆抽一張並結束回合；牌堆抽完後可選擇跳過，所有人連續跳過一輪時結束遊戲。',
              '重新排列桌面時，可以改變 Joker 的代表牌並把它放入其他合法組合；回合結束時，原桌面每張牌都必須留在合法組合中。',
              '玩家斷線時保留位置；限時模式的倒數不會暫停。若玩家明確離房，該局提前結束且不計分。',
            ],
          },
          {
            title: '勝負與計分',
            items: [
              '最先打完手牌者獲勝；牌堆抽完且全員跳過時，剩餘牌值最低者獲勝。',
              '其他玩家手牌數字總和為負分，獲勝者取得其他玩家負分絕對值的總和；留在手牌上的 Joker 算 30 分。',
              '遊戲結束後會保留最後牌面供檢視，房主確認後才結算分數。',
            ],
          },
        ],
        images,
      }
    case 'avalon': {
      const roleCounts = getAvalonRoleCounts(props.playerCount, props.gameSettings)
      const missionTeams = getAvalonMissionTeamSizes(props.playerCount)
      const playerRange = getAvalonPlayerRange(props.gameSettings)
      const roleEntries = roleCounts
        ? Object.entries(roleCounts).flatMap(([roleId, count]) => {
            return isAvalonRoleId(roleId) && count > 0
              ? [{ role: AVALON_ROLES[roleId], count }]
              : []
          })
        : []
      const composition = roleCounts
        ? roleEntries.map(({ role, count }) => `${role.name} × ${count}`).join('、')
        : `目前 ${props.playerCount} 人不適用這組角色配置${playerRange ? `，至少需要 ${playerRange.min} 人` : ''}。`
      const roleDescriptions = roleEntries.map(({ role }) => `${role.name}：${role.description}`)
      const missionSizes = missionTeams
        ? missionTeams.map((teamSize, index) => `第 ${index + 1} 個任務 ${teamSize} 人`).join('、')
        : '任務隊伍人數依 5–10 人配置表決定。'

      return {
        title: `${gameName.value}規則`,
        description: '正義陣營完成任務並保護梅林；邪惡陣營阻止任務，或在最後刺殺梅林。',
        sections: [
          {
            title: '勝負條件',
            items: [
              '邪惡陣營讓三個任務失敗，或同一任務的隊伍提案連續五次遭否決，即獲勝。',
              '完成三個任務後不會立即獲勝；刺客若成功刺殺梅林，邪惡陣營獲勝，否則正義陣營獲勝。',
            ],
          },
          {
            title: '隊長、投票與任務',
            items: [
              `每個任務需要的人數：${missionSizes}隊長提案後全員同時投票，必須嚴格過半同意才通過，平票視為否決。`,
              '隊伍通過後，隊員私下出任務牌；好人只能出成功，壞人可選成功或失敗。只公布成功與失敗牌數，不會揭露誰出哪張牌。',
              '7–10 人局的第四個任務需要至少兩張失敗牌才會失敗；其他任務出現一張失敗牌即失敗。',
            ],
          },
          {
            title: `本局角色配置（${props.playerCount} 人）`,
            items: [
              composition,
              ...roleDescriptions,
              '派西維爾替換一名忠臣；莫甘娜、莫德雷德與奧伯倫各替換一名普通爪牙，不會增加陣營人數。',
            ],
          },
          ...(props.gameSettings.ladyOfTheLake === true
            ? [{
                title: '湖中女神',
                items: [
                  '第 2、3、4 個任務後，持有人查驗一名從未持有過標記的玩家，只會私下得知好人或邪惡陣營，之後標記交給被查驗者。',
                  '查驗結果不能公開展示；奧伯倫會顯示為好人。每位玩家最多持有一次，因此全局最多查驗三次。',
                ],
              }]
            : []),
        ],
        images,
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
      const wolfWinCondition =
        props.gameSettings.winCondition === 'side'
          ? '屠邊：村民或神職其中一方全數出局，且好人出局總數達好人總數的一半。'
          : '屠城：所有好人出局時，狼人陣營獲勝。'
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
            items: [
              '所有狼人出局，好人陣營獲勝。',
              wolfWinCondition,
              '若存活狼人數量大於存活好人，會在進入投票前判定狼人獲勝。',
            ],
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
              '狼人陣營可選擇任何存活的其他玩家作為襲擊目標。',
              '預言家每晚可查驗一名存活玩家，每名玩家整局只能查驗一次。',
              '女巫各有一瓶解藥及毒藥，同一晚最多使用其中一瓶。',
            ],
          },
        ],
        images,
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
            <ul v-if="section.items.length">
              <li v-for="(item, index) in section.items" :key="index">{{ item }}</li>
            </ul>
            <div v-if="section.cards?.length" class="game-rules-cards" role="list">
              <article
                v-for="card in section.cards"
                :key="card.name"
                class="game-rules-card"
                role="listitem"
              >
                <h4>{{ card.name }}</h4>
                <p>{{ card.effect }}</p>
              </article>
            </div>
          </section>
          <div v-if="content.images.length" class="game-rules-images" role="group" aria-label="規則插圖">
            <img
              v-for="image in content.images"
              :key="image.src"
              :src="gameAssetUrl(image.src)"
              :alt="image.alt"
            />
          </div>
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

.game-rules-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 8px;
}

.game-rules-card {
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid #eceaf3;
  border-radius: 12px;
  background: #fbfaff;
}

.game-rules-card h4 {
  margin: 0 0 4px;
  color: var(--ink);
  font-size: 11px;
}

.game-rules-card p {
  margin: 0;
  color: #55516b;
  font-size: 10px;
  line-height: 1.6;
}

.game-rules-images {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 24px;
}

.game-rules-images img {
  width: min(100%, 500px);
  aspect-ratio: 1;
  flex: 0 1 500px;
  padding: 12px;
  border: 1px solid #eceaf3;
  border-radius: 16px;
  background: linear-gradient(145deg, #fff, #f8f7fc);
  object-fit: contain;
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

  .game-rules-images {
    gap: 8px;
    margin-top: 20px;
  }
}
</style>
