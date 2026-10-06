<script setup lang="ts">
import { computed } from 'vue'
import { AVALON_ROLES } from '../../../shared/games/avalon'
import type { GameView, PlayerView } from '../../../shared/protocol'
import AvalonPlayerIdentity from './AvalonPlayerIdentity.vue'
import {
  avalonAssetUrl,
  avalonCampIconUrl,
  avalonMissionIconUrl,
  avalonPhaseIconUrl,
  avalonRoleIconUrl,
} from './visualAssets'

const props = defineProps<{ players: PlayerView[]; game?: GameView | null }>()

type AvalonResultPlayer = {
  id: string
  name: string
  avatarId: PlayerView['avatarId'] | null
  isEvil?: boolean
  missionFailed?: boolean
}

type Explanation = {
  text: string
  before: string
  player: AvalonResultPlayer | null
  after: string
}

const view = computed(() => (props.game?.gameId === 'avalon' ? props.game : null))
const resultArtworkStyle = computed(() => {
  const winner = view.value?.winner
  return {
    '--avalon-result-art': winner
      ? `url("${avalonAssetUrl(`avalon-${winner}-victory.webp`)}")`
      : 'none',
  }
})
function playerInfoOf(playerId: string): AvalonResultPlayer {
  const player = props.players.find((candidate) => candidate.id === playerId)
  return {
    id: playerId,
    name: player ? player.name : playerId ? '已離開的玩家' : '玩家',
    avatarId: player?.avatarId ?? null,
  }
}
function missionPlayerInfoOf(playerId: string, failPlayerIds: string[] = []): AvalonResultPlayer {
  const roleId = view.value?.roles?.[playerId]
  return {
    ...playerInfoOf(playerId),
    isEvil: roleId ? AVALON_ROLES[roleId].camp === 'evil' : false,
    missionFailed: failPlayerIds.includes(playerId),
  }
}

const winnerText = computed(() => {
  if (view.value?.endReason === 'player-left') {
    return '牌局提前結束'
  }
  if (view.value?.winner === 'good') {
    return '正義陣營獲勝！'
  }
  if (view.value?.winner === 'evil') {
    return '邪惡陣營獲勝！'
  }
  return '阿瓦隆結束'
})
const explanation = computed<Explanation>(() => {
  const current = view.value
  if (!current) {
    return { text: '', before: '', player: null, after: '' }
  }
  if (current.endReason === 'player-left') {
    return {
      text: '',
      before: '',
      player: playerInfoOf(current.departedPlayerId ?? ''),
      after: '離開房間，本局未計分。',
    }
  }
  if (current.assassinationHit === true) {
    return {
      text: '',
      before: '刺客成功刺殺梅林（',
      player: playerInfoOf(current.assassinationTargetId ?? ''),
      after: '），邪惡陣營反敗為勝。',
    }
  }
  if (current.assassinationHit === false) {
    return {
      text: '',
      before: '刺客刺殺了 ',
      player: playerInfoOf(current.assassinationTargetId ?? ''),
      after: '，但他不是梅林。',
    }
  }
  if (current.missions.filter((mission) => mission.outcome === 'success').length >= 3) {
    return { text: '正義陣營完成三個任務，刺客未能成功刺殺梅林。', before: '', player: null, after: '' }
  }
  if (current.missions.filter((mission) => mission.outcome === 'failure').length >= 3) {
    return { text: '邪惡陣營讓三個任務失敗。', before: '', player: null, after: '' }
  }
  if (current.lastVote && !current.lastVote.accepted && current.phase === 'finished') {
    return { text: '同一個任務的隊伍提案連續五次遭到否決。', before: '', player: null, after: '' }
  }
  return { text: '本局依阿瓦隆勝負規則結束。', before: '', player: null, after: '' }
})
const roleRows = computed(() => {
  const current = view.value
  const roles = current?.roles
  if (!current || !roles) {
    return []
  }
  return current.seatIds.map((id) => {
    const roleId = roles[id]
    if (!roleId) {
      return null
    }
    const role = AVALON_ROLES[roleId]
    return {
      ...playerInfoOf(id),
      role,
      won: current.winner !== null && role.camp === current.winner,
      isEvil: role.camp === 'evil',
    }
  }).filter((row) => row !== null)
})
const playerRows = computed(() => view.value?.seatIds.map(playerInfoOf) ?? [])
const missionRows = computed(() => {
  const current = view.value
  return current
    ? current.missions.map((mission) => ({
      mission,
      leader: missionPlayerInfoOf(mission.leaderId),
      team: mission.teamIds.map((playerId) => missionPlayerInfoOf(playerId, mission.failPlayerIds)),
    }))
    : []
})
const voteHistoryRows = computed(() => {
  const current = view.value
  return current
    ? current.voteHistory.map((vote, index) => ({
      key: `${vote.missionNumber}-${index}`,
      vote,
      leader: playerInfoOf(vote.leaderId),
      team: vote.teamIds.map(playerInfoOf),
    }))
    : []
})
</script>

<template>
  <div class="avalon-results">
    <section
      class="avalon-result-hero"
      :class="view?.winner ? `is-${view.winner}` : 'is-neutral'"
      :style="resultArtworkStyle"
      aria-live="polite"
    >
      <div class="avalon-finish-icon" aria-hidden="true">
        <img
          :src="view?.winner ? avalonCampIconUrl(view.winner) : avalonPhaseIconUrl('finished')"
          alt=""
        />
      </div>
      <p class="eyebrow">遊戲結束</p>
      <h2>{{ winnerText }}</h2>
      <p class="avalon-result-explanation">
        <template v-if="explanation.player">
          {{ explanation.before }}
          <AvalonPlayerIdentity :player="explanation.player" compact />
          {{ explanation.after }}
        </template>
        <template v-else>{{ explanation.text }}</template>
      </p>
      <p v-if="view?.winner" class="avalon-result-score">
        勝利陣營每位玩家獲得 100 分
      </p>
    </section>

    <section v-if="missionRows.length" class="avalon-results-section">
      <h3>任務紀錄</h3>
      <ol class="avalon-result-missions">
        <li
          v-for="entry in missionRows"
          :key="entry.mission.missionNumber"
          :class="entry.mission.outcome === 'success' ? 'is-success' : 'is-failure'"
        >
          <div>
            <strong class="avalon-result-mission-heading">
              <img :src="avalonMissionIconUrl(entry.mission.outcome)" alt="" />
              <span>
                任務 {{ entry.mission.missionNumber }}
              </span>
              <span>·{{ entry.mission.outcome === 'success' ? '成功' : '失敗' }}</span>
            </strong>
            <small class="avalon-result-players">
              <span>隊長</span>
              <AvalonPlayerIdentity :player="entry.leader" compact />
            </small>
            <small class="avalon-result-players">
              <span>隊伍</span>
              <AvalonPlayerIdentity
                v-for="player in entry.team"
                :key="player.id"
                :player="player"
                compact
                is-on-team
              />
            </small>
          </div>
          <span>{{ entry.mission.successCount }} 成功 / {{ entry.mission.failCount }} 失敗</span>
        </li>
      </ol>
    </section>

    <section v-if="view?.lastVote && !view.lastVote.accepted" class="avalon-results-section">
      <h3>最後一次隊伍提案</h3>
      <p>
        第 {{ view.lastVote.missionNumber }} 個任務的提案遭否決，
        {{ view.lastVote.approveCount }} 人同意、{{ view.lastVote.rejectCount }} 人反對。
      </p>
    </section>

    <section v-if="view?.voteHistory.length" class="avalon-results-section">
      <h3>隊伍投票紀錄</h3>
      <ol class="avalon-result-votes">
        <li v-for="entry in voteHistoryRows" :key="entry.key">
          <strong class="avalon-result-vote-heading">
            <span>任務 {{ entry.vote.missionNumber }} ·</span>
            <AvalonPlayerIdentity :player="entry.leader" compact />
            <span>提案</span>
            <span
              class="avalon-vote-stamp"
              :class="entry.vote.accepted ? 'is-accepted' : 'is-rejected'"
            >
              <span aria-hidden="true">{{ entry.vote.accepted ? '✓' : '×' }}</span>
              {{ entry.vote.accepted ? '通過' : '否決' }}
            </span>
          </strong>
          <small class="avalon-result-players">
            <span>隊伍：</span>
            <AvalonPlayerIdentity
              v-for="player in entry.team"
              :key="player.id"
              :player="player"
              compact
            />
          </small>
          <details>
            <summary>
              查看投票（{{ entry.vote.approveCount }} 同意 / {{ entry.vote.rejectCount }} 反對）
            </summary>
            <ul>
              <li v-for="player in playerRows" :key="player.id">
                <AvalonPlayerIdentity :player="player" compact />
                <span>{{ entry.vote.votes[player.id] ? '同意' : '反對' }}</span>
              </li>
            </ul>
          </details>
        </li>
      </ol>
    </section>

    <section v-if="roleRows.length" class="avalon-results-section">
      <h3>角色公開</h3>
      <ul class="avalon-results-list">
        <li v-for="row in roleRows" :key="row.id" :class="{ 'is-winner': row.won }">
          <div class="avalon-result-player">
            <img class="avalon-result-role-icon" :src="avalonRoleIconUrl(row.role.id)" alt="" />
            <AvalonPlayerIdentity
              :player="row"
              compact
            />
          </div>
          <strong>{{ row.role.name }}</strong>
          <small class="avalon-result-camp">
            <img :src="avalonCampIconUrl(row.role.camp)" alt="" />
            <span>{{ row.role.camp === 'good' ? '正義陣營' : '邪惡陣營' }}</span>
            <span v-if="row.won" class="avalon-result-win">勝利 +100</span>
          </small>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.avalon-results {
  --avalon-parchment: #f4f0e4;
  --avalon-paper: #fffdf7;
  --avalon-ink: #302d3d;
  --avalon-good: #3e7659;
  --avalon-good-soft: #e3f0e7;
  --avalon-evil: #853f4c;
  --avalon-evil-soft: #f5e5e3;
  --avalon-gold: #d5aa58;
  --avalon-lake: #4a9aa0;
  --avalon-lake-soft: #e1f1f0;
  display: grid;
  justify-items: center;
  width: 100%;
  text-align: center;
  color: var(--avalon-ink);
}

.avalon-result-hero {
  display: grid;
  min-height: 214px;
  width: 100%;
  align-content: center;
  justify-items: center;
  padding: 18px 16px;
  overflow: hidden;
  border: 1px solid #ded4bc;
  border-radius: 20px;
  background-color: var(--avalon-parchment);
  background-position: center;
  background-size: cover;
  text-align: center;
  animation: avalon-result-reveal 360ms ease-out both;
}

.avalon-result-hero.is-good {
  background-image:
    linear-gradient(180deg, rgb(255 253 247 / 92%), rgb(255 253 247 / 74%) 62%, rgb(255 253 247 / 25%)),
    var(--avalon-result-art),
    radial-gradient(circle at 75% 20%, #d9eadb, #f4f0e4 68%);
}

.avalon-result-hero.is-evil {
  background-image:
    linear-gradient(180deg, rgb(255 253 247 / 92%), rgb(255 253 247 / 76%) 62%, rgb(245 229 227 / 25%)),
    var(--avalon-result-art),
    radial-gradient(circle at 75% 20%, #edd5d4, #f4f0e4 68%);
}

.avalon-result-hero.is-neutral {
  background-image: radial-gradient(circle at 75% 20%, #e7e2d5, #f4f0e4 68%);
}

.avalon-finish-icon {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border: 1px solid #e2d3af;
  border-radius: 17px;
  background: rgb(255 253 247 / 88%);
}

.avalon-finish-icon img {
  display: block;
  width: 46px;
  height: 46px;
}

.avalon-result-hero .eyebrow {
  margin-top: 7px;
  color: var(--avalon-good);
}

.avalon-result-hero.is-evil .eyebrow {
  color: var(--avalon-evil);
}

.avalon-result-hero h2 {
  margin: 6px 0 5px;
  color: var(--avalon-ink);
  font-size: clamp(19px, 4vw, 25px);
}

.avalon-result-explanation,
.avalon-result-score {
  max-width: 500px;
  margin: 0;
  color: #514e5b;
  font-size: 11px;
  line-height: 1.55;
}

.avalon-result-score {
  margin-top: 5px;
  color: var(--avalon-good);
  font-weight: 700;
}

.avalon-results-section {
  width: 100%;
  margin-top: 18px;
  text-align: left;
}

.avalon-results-section h3 {
  margin: 0 0 8px;
  color: var(--avalon-ink);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.avalon-results-section > p {
  margin: 0;
  color: #514e5b;
  font-size: 10px;
  line-height: 1.5;
}

.avalon-results-section > ol,
.avalon-results-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.avalon-result-missions > li,
.avalon-result-votes > li,
.avalon-results-list > li {
  display: grid;
  gap: 3px 10px;
  padding: 9px 11px;
  border-radius: 10px;
  background: var(--avalon-paper);
  font-size: 10px;
}

.avalon-result-missions > li,
.avalon-results-list > li {
  grid-template-columns: minmax(0, 1fr) auto;
}

.avalon-result-missions > li.is-success,
.avalon-results-list > li.is-winner {
  background: var(--avalon-good-soft);
}

.avalon-result-missions > li.is-failure {
  background: var(--avalon-evil-soft);
}

.avalon-result-missions > li > div {
  display: grid;
  gap: 3px;
}

.avalon-results-list > li > .avalon-result-player {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.avalon-result-mission-heading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.avalon-result-mission-heading img {
  display: block;
  width: 25px;
  height: 25px;
}

.avalon-results-section ol strong,
.avalon-results-list strong {
  color: var(--avalon-ink);
  font-size: 10px;
}

.avalon-results-section ol small,
.avalon-result-missions > li > span,
.avalon-results-list small {
  color: #696575;
  font-size: 9px;
  line-height: 1.45;
}

.avalon-results-list small {
  grid-column: 1 / -1;
}

.avalon-result-role-icon {
  display: block;
  width: 35px;
  height: 35px;
  flex: 0 0 auto;
}

.avalon-result-camp {
  display: flex;
  align-items: center;
  gap: 4px;
}

.avalon-result-camp img {
  display: block;
  width: 20px;
  height: 20px;
}

.avalon-result-win {
  margin-left: auto;
  color: var(--avalon-good);
  font-weight: 800;
}

.avalon-result-vote-heading,
.avalon-result-players {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.avalon-result-players {
  line-height: 1.5;
}

.avalon-result-votes {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.avalon-result-votes > li {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  padding: 9px;
  border-radius: 9px;
  background: var(--avalon-paper);
}

.avalon-result-votes strong,
.avalon-result-votes small {
  color: #514e5b;
  font-size: 9px;
}

.avalon-vote-stamp {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 7px;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 800;
}

.avalon-vote-stamp.is-accepted {
  background: var(--avalon-good-soft);
  color: var(--avalon-good);
}

.avalon-vote-stamp.is-rejected {
  background: var(--avalon-evil-soft);
  color: var(--avalon-evil);
}

.avalon-result-votes details {
  font-size: 9px;
}

.avalon-result-votes summary {
  color: #725820;
  cursor: pointer;
}

.avalon-result-votes ul {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.avalon-result-votes ul li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: #514e5b;
  font-size: 8px;
}

@keyframes avalon-result-reveal {
  from {
    opacity: 0.9;
    transform: translateY(5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 520px) {
  .avalon-result-hero {
    min-height: 190px;
    padding: 14px 10px;
  }

  .avalon-result-missions > li,
  .avalon-results-list > li {
    grid-template-columns: minmax(0, 1fr);
  }

  .avalon-result-missions > li > span {
    padding-left: 31px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .avalon-result-hero {
    animation: none;
  }
}
</style>
