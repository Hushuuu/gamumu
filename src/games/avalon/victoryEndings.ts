import type { AvalonCamp, AvalonView } from '../../../shared/games/avalon'

export type AvalonVictoryEndingId =
  | 'GE1'
  | 'GE2'
  | 'GE3'
  | 'BE1'
  | 'BE2'
  | 'BE3'
  | 'BE4'

type AvalonVictoryEndingConfig = {
  camp: AvalonCamp
  title: string
  description: string
  artwork: string | null
}

// Set artwork to a filename under public/games/avalon/ when each illustration is ready.
export const AVALON_VICTORY_ENDINGS: Record<AvalonVictoryEndingId, AvalonVictoryEndingConfig> = {
  GE1: {
    camp: 'good',
    title: 'GE1｜正義陣營 3:0 獲勝',
    description: '三項任務全數成功，沒有任務失敗；梅林守住身分，正義陣營獲勝。',
    artwork: 'GE1.png',
  },
  GE2: {
    camp: 'good',
    title: 'GE2｜正義陣營 3:1 獲勝',
    description: '正義陣營完成三項任務，僅一項任務失敗；梅林守住身分，正義陣營獲勝。',
    artwork: 'GE2.png',
  },
  GE3: {
    camp: 'good',
    title: 'GE3｜正義陣營 3:2 獲勝',
    description: '正義陣營完成三項任務，另有兩項任務失敗；梅林守住身分，正義陣營獲勝。',
    artwork: 'GE3.png',
  },
  BE1: {
    camp: 'evil',
    title: 'BE1｜刺客命中梅林（3:0）',
    description: '正義陣營完成三項任務且沒有任務失敗，但刺客成功刺殺梅林，邪惡陣營反敗為勝。',
    artwork: 'BE1.png',
  },
  BE2: {
    camp: 'evil',
    title: 'BE2｜刺客命中梅林（3:1／3:2）',
    description: '正義陣營完成三項任務（另有一至兩項任務失敗），但刺客成功刺殺梅林，邪惡陣營反敗為勝。',
    artwork: 'BE2.png',
  },
  BE3: {
    camp: 'evil',
    title: 'BE3｜邪惡陣營獲勝',
    description: '任務結果為 1:3 或 2:3，或同一任務的隊伍提案連續五次遭否決；邪惡陣營獲勝。',
    artwork: 'BE3.png',
  },
  BE4: {
    camp: 'evil',
    title: 'BE4｜邪惡陣營 0:3 獲勝',
    description: '三項任務全數失敗，正義陣營未能完成任何任務；邪惡陣營獲勝。',
    artwork: 'BE4.png',
  },
}

export function getAvalonVictoryEnding(view: AvalonView) {
  if (view.phase !== 'finished' || view.endReason !== 'completed' || view.winner === null) {
    return null
  }

  const successCount = view.missions.filter((mission) => mission.outcome === 'success').length
  const failureCount = view.missions.filter((mission) => mission.outcome === 'failure').length
  let id: AvalonVictoryEndingId
  if (view.winner === 'good') {
    id = failureCount === 0 ? 'GE1' : failureCount === 1 ? 'GE2' : 'GE3'
  } else if (view.assassinationHit === true) {
    id = failureCount === 0 ? 'BE1' : 'BE2'
  } else if (
    view.rejectedTeams >= 5 &&
    view.lastVote !== null &&
    !view.lastVote.accepted
  ) {
    id = 'BE3'
  } else if (failureCount >= 3) {
    id = successCount === 0 ? 'BE4' : 'BE3'
  } else {
    id = 'BE3'
  }

  return { id, ...AVALON_VICTORY_ENDINGS[id] }
}
