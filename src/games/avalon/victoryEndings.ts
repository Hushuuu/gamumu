import type { AvalonCamp, AvalonView } from '../../../shared/games/avalon'

export type AvalonVictoryEndingId =
  | 'GE1'
  | 'GE2'
  | 'GE3'
  | 'BE1'
  | 'BE2'
  | 'BE3'
  | 'BE4'
  | 'BE5'

type AvalonVictoryEndingConfig = {
  camp: AvalonCamp
  title: string
  description: string
  artwork: string | null
}

// Set artwork to a filename under public/games/avalon/ when each illustration is ready.
export const AVALON_VICTORY_ENDINGS: Record<AvalonVictoryEndingId, AvalonVictoryEndingConfig> = {
  GE1: { //3:0
    camp: 'good',
    title: 'GE1｜正義陣營大勝',
    description: '不損一兵一卒就完成了任務，王國大獲全勝。',
    artwork: 'ge1.webp',
  },
  GE2: { //3:1
    camp: 'good',
    title: 'GE2｜正義陣營獲勝',
    description: '梅林詠唱著古老咒語，召喚了巨石陣阻止莫德雷德軍，正義陣營最終獲勝。',
    artwork: 'ge2_4.webp',
  },
  GE3: { //3:2
    camp: 'good',
    title: 'GE3｜王國險勝',
    description: '派西維爾在最後一刻守護了王國，正義陣營驚險獲勝。',
    artwork: 'ge3.webp',
  },
  BE1: { //3:0 with assassination hit
    camp: 'evil',
    title: 'BE1｜梅林中箭',
    description: '在凱旋歸途，刺客從暗處射出一支威力強大的箭，擊中了梅林，邪惡陣營反敗為勝。',
    artwork: 'be1.webp',
  },
  BE2: { //3:1 or 3:2 with assassination hit
    camp: 'evil',
    title: 'BE2｜失去梅林',
    description: '梅林為了拯救人質自願被擄走，王國失去了指引，邪惡陣營反敗為勝。',
    artwork: 'be2.webp',
  },
  BE3: { //1:3 or vote failed 5 times
    camp: 'evil',
    title: 'BE3｜邪惡陣營獲勝',
    description: '莫甘娜使用邪惡魔法滲透王國，掌握了大權，邪惡陣營獲勝。',
    artwork: 'be3.webp',
  },
  BE4: { //0:3
    camp: 'evil',
    title: 'BE4｜邪惡陣營大勝',
    description: '莫德雷德軍勢如破竹，正義毫無反擊之力，邪惡陣營完全佔領王國。',
    artwork: 'be4_3.webp',
  },
  BE5: { //2:3
    camp: 'evil',
    title: 'BE5｜邪惡陣營獲勝',
    description: '莫德雷德擊破了王國之盾，莫甘娜以強力束縛魔法限制了梅林，王國軍已無力反抗。',
    artwork: 'be5.webp',
  }
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
    id = successCount === 0 ? 'BE4' : successCount === 2 ? 'BE5' : 'BE3'
  } else {
    id = 'BE3'
  }

  return { id, ...AVALON_VICTORY_ENDINGS[id] }
}
