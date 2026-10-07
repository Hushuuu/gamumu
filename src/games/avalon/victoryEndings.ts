import type { AvalonCamp, AvalonView } from '../../../shared/games/avalon'

export type AvalonVictoryEndingId =
  | 'good-merlin-safe'
  | 'evil-assassination'
  | 'evil-missions'
  | 'evil-rejections'
  | 'good-fallback'
  | 'evil-fallback'

type AvalonVictoryEndingConfig = {
  camp: AvalonCamp
  title: string
  description: string
  artwork: string | null
}

// Set artwork to a filename under public/games/avalon/ when each illustration is ready.
export const AVALON_VICTORY_ENDINGS: Record<AvalonVictoryEndingId, AvalonVictoryEndingConfig> = {
  'good-merlin-safe': {
    camp: 'good',
    title: '梅林守住了秘密',
    description: '正義陣營完成三項任務，刺客未能刺殺梅林，亞瑟王國迎來勝利。',
    artwork: null,
  },
  'evil-assassination': {
    camp: 'evil',
    title: '刺客識破梅林',
    description: '任務雖然成功，刺客最後一擊命中梅林，邪惡陣營反敗為勝。',
    artwork: null,
  },
  'evil-missions': {
    camp: 'evil',
    title: '三項任務遭到破壞',
    description: '邪惡陣營使三項任務失敗，亞瑟王國陷入混亂。',
    artwork: null,
  },
  'evil-rejections': {
    camp: 'evil',
    title: '議會決議陷入僵局',
    description: '同一任務的隊伍提案連續五次遭否決，邪惡陣營趁勢取得勝利。',
    artwork: null,
  },
  'good-fallback': {
    camp: 'good',
    title: '正義陣營獲勝',
    description: '正義陣營依據本局結果守住了亞瑟王國。',
    artwork: null,
  },
  'evil-fallback': {
    camp: 'evil',
    title: '邪惡陣營獲勝',
    description: '邪惡陣營依據本局結果取得了亞瑟王國的控制權。',
    artwork: null,
  },
}

export function getAvalonVictoryEnding(view: AvalonView) {
  if (view.phase !== 'finished' || view.endReason !== 'completed' || view.winner === null) {
    return null
  }

  let id: AvalonVictoryEndingId
  if (view.assassinationHit === true) {
    id = 'evil-assassination'
  } else if (view.assassinationHit === false) {
    id = 'good-merlin-safe'
  } else if (
    view.winner === 'evil' &&
    view.missions.filter((mission) => mission.outcome === 'failure').length >= 3
  ) {
    id = 'evil-missions'
  } else if (
    view.winner === 'evil' &&
    view.rejectedTeams >= 5 &&
    view.lastVote !== null &&
    !view.lastVote.accepted
  ) {
    id = 'evil-rejections'
  } else {
    id = view.winner === 'good' ? 'good-fallback' : 'evil-fallback'
  }

  return { id, ...AVALON_VICTORY_ENDINGS[id] }
}
