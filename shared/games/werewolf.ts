export type WerewolfCamp = 'good' | 'wolf'
export type WerewolfRoleId = 'werewolf' | 'villager' | 'seer' | 'witch' | 'hunter'
export type WerewolfScriptId = 'classic'

export type WerewolfPhase =
  | 'role-reveal'
  | 'night'
  | 'dawn'
  | 'hunter-shot'
  | 'day-discussion'
  | 'vote'
  | 'vote-result'
  | 'finished'

export interface WerewolfRoleInfo {
  id: WerewolfRoleId
  name: string
  camp: WerewolfCamp
  icon: string
  description: string
}

export const WEREWOLF_ROLES: Record<WerewolfRoleId, WerewolfRoleInfo> = {
  werewolf: {
    id: 'werewolf',
    name: '狼人',
    camp: 'wolf',
    icon: '🐺',
    description: '每晚與同伴選擇一名玩家襲擊。殺光所有好人即可獲勝。',
  },
  villager: {
    id: 'villager',
    name: '村民',
    camp: 'good',
    icon: '🧑‍🌾',
    description: '沒有特殊能力。白天靠討論與投票找出狼人。',
  },
  seer: {
    id: 'seer',
    name: '預言家',
    camp: 'good',
    icon: '🔮',
    description: '每晚可查驗一名玩家是好人還是狼人。',
  },
  witch: {
    id: 'witch',
    name: '女巫',
    camp: 'good',
    icon: '🧪',
    description: '擁有一瓶解藥與一瓶毒藥，同一晚只能使用其中一瓶。',
  },
  hunter: {
    id: 'hunter',
    name: '獵人',
    camp: 'good',
    icon: '🏹',
    description: '被狼人殺死或被放逐時可開槍帶走一人；被毒死則不能開槍。',
  },
}

export function isWerewolfRoleId(value: unknown): value is WerewolfRoleId {
  return typeof value === 'string' && value in WEREWOLF_ROLES
}

export interface WerewolfScriptInfo {
  id: WerewolfScriptId
  name: string
  description: string
  minPlayers: number
  maxPlayers: number
  roles: WerewolfRoleId[]
}

export const WEREWOLF_SCRIPTS: WerewolfScriptInfo[] = [
  {
    id: 'classic',
    name: '經典版',
    description: '狼人、村民、預言家、女巫、獵人，屠城規則。',
    minPlayers: 6,
    maxPlayers: 12,
    roles: ['werewolf', 'villager', 'seer', 'witch', 'hunter'],
  },
]

export function isWerewolfScriptId(value: unknown): value is WerewolfScriptId {
  return WEREWOLF_SCRIPTS.some((script) => script.id === value)
}

export interface WerewolfSettings {
  scriptId: WerewolfScriptId
  discussionSeconds: number
  voteSeconds: number
  nightStepSeconds: number
}

export const DEFAULT_WEREWOLF_SETTINGS: WerewolfSettings = {
  scriptId: 'classic',
  discussionSeconds: 120,
  voteSeconds: 45,
  nightStepSeconds: 20,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

export function isWerewolfSettings(value: unknown): value is WerewolfSettings {
  return (
    isRecord(value) &&
    isWerewolfScriptId(value.scriptId) &&
    isIntegerInRange(value.discussionSeconds, 30, 600) &&
    isIntegerInRange(value.voteSeconds, 15, 180) &&
    isIntegerInRange(value.nightStepSeconds, 10, 60)
  )
}

export interface WerewolfHunterShot {
  shooterId: string
  targetId: string | null
}

export interface WerewolfView {
  gameId: 'werewolf'
  phase: WerewolfPhase
  day: number
  nightStep: number
  nightStepCount: number
  phaseEndsAt: number
  stateVersion: number
  settings: WerewolfSettings
  seatIds: string[]
  aliveIds: string[]
  lastDeathIds: string[]
  exiledId: string | null
  votes: Record<string, string | null> | null
  votedIds: string[]
  shooterId: string | null
  hunterShot: WerewolfHunterShot | null
  winner: WerewolfCamp | null
  roles: Record<string, WerewolfRoleId> | null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isWerewolfView(value: unknown): value is WerewolfView {
  if (!isRecord(value) || value.gameId !== 'werewolf') {
    return false
  }

  const phases: WerewolfPhase[] = [
    'role-reveal',
    'night',
    'dawn',
    'hunter-shot',
    'day-discussion',
    'vote',
    'vote-result',
    'finished',
  ]
  const votesValid =
    value.votes === null ||
    (isRecord(value.votes) && Object.values(value.votes).every(isNullableString))
  const hunterShotValid =
    value.hunterShot === null ||
    (isRecord(value.hunterShot) &&
      typeof value.hunterShot.shooterId === 'string' &&
      isNullableString(value.hunterShot.targetId))
  const rolesValid =
    value.roles === null ||
    (isRecord(value.roles) && Object.values(value.roles).every(isWerewolfRoleId))

  return (
    phases.includes(value.phase as WerewolfPhase) &&
    isIntegerInRange(value.day, 0, 1_000) &&
    isIntegerInRange(value.nightStep, 0, 100) &&
    isIntegerInRange(value.nightStepCount, 0, 100) &&
    typeof value.phaseEndsAt === 'number' &&
    typeof value.stateVersion === 'number' &&
    isWerewolfSettings(value.settings) &&
    isStringArray(value.seatIds) &&
    isStringArray(value.aliveIds) &&
    isStringArray(value.lastDeathIds) &&
    isNullableString(value.exiledId) &&
    votesValid &&
    isStringArray(value.votedIds) &&
    isNullableString(value.shooterId) &&
    hunterShotValid &&
    (value.winner === null || value.winner === 'good' || value.winner === 'wolf') &&
    rolesValid
  )
}

export interface WerewolfSeerResult {
  playerId: string
  camp: WerewolfCamp
}

export interface WerewolfWitchState {
  antidote: boolean
  poison: boolean
  victimId: string | null
  saving: boolean
  poisonTargetId: string | null
}

export interface WerewolfPrivateState {
  stateVersion: number
  role: WerewolfRoleId
  camp: WerewolfCamp
  alive: boolean
  acting: boolean
  teammates: string[]
  wolfPicks: Record<string, string | null>
  myTarget: string | null
  seerResults: WerewolfSeerResult[]
  witch: WerewolfWitchState | null
  canShoot: boolean
  myVote: string | null
  hasVoted: boolean
}

export const WEREWOLF_PRIVATE_EVENT = 'private-state'

export function isWerewolfPrivateState(value: unknown): value is WerewolfPrivateState {
  return (
    isRecord(value) &&
    typeof value.stateVersion === 'number' &&
    isWerewolfRoleId(value.role) &&
    (value.camp === 'good' || value.camp === 'wolf') &&
    typeof value.alive === 'boolean' &&
    typeof value.acting === 'boolean' &&
    isStringArray(value.teammates) &&
    isRecord(value.wolfPicks) &&
    isNullableString(value.myTarget) &&
    Array.isArray(value.seerResults) &&
    (value.witch === null || isRecord(value.witch)) &&
    typeof value.canShoot === 'boolean' &&
    isNullableString(value.myVote) &&
    typeof value.hasVoted === 'boolean'
  )
}
