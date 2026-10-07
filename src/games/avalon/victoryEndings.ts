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
    title: 'GE1｜正義陣營大勝',
    description: '不損一兵一卒就完成了所有任務，王國大獲全勝。',
    artwork: 'ge1.png',
  },
  GE2: {
    camp: 'good',
    title: 'GE2｜正義陣營獲勝',
    description: '梅林在關鍵時刻指引王國，正義陣營最終獲勝。',
    artwork: 'ge2.png',
  },
  GE3: {
    camp: 'good',
    title: 'GE3｜王國險勝',
    description: '派西維爾在最後一刻守護了王國，正義陣營驚險獲勝。',
    artwork: 'ge3.png',
  },
  BE1: {
    camp: 'evil',
    title: 'BE1｜梅林中箭',
    description: '正義陣營完成三項任務，但刺客成功刺殺梅林，邪惡陣營反敗為勝。',
    artwork: 'be1.png',
  },
  BE2: {
    camp: 'evil',
    title: 'BE2｜失去梅林',
    description: '梅林被邪惡陣營擄走，王國失去了指引，邪惡陣營反敗為勝。',
    artwork: 'be2.png',
  },
  BE3: {
    camp: 'evil',
    title: 'BE3｜邪惡陣營獲勝',
    description: '成功任務未達三次，莫甘娜滲透王國，掌握了大權。',
    artwork: 'be3.png',
  },
  BE4: {
    camp: 'evil',
    title: 'BE4｜邪惡陣營大勝',
    description: '三項任務全數失敗，正義毫無反擊之力，邪惡陣營完全佔領王國。',
    artwork: 'be4.png',
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
