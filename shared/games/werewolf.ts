export type WerewolfCamp = 'good' | 'wolf'
export type WerewolfRoleId =
  | 'werewolf'
  | 'wolfKing'
  | 'villager'
  | 'seer'
  | 'witch'
  | 'hunter'
  | 'guard'
export type WerewolfScriptId = 'classic' | 'wolf-guard'
export type WerewolfRoleCounts = Record<WerewolfRoleId, number>

export type WerewolfPhase =
  | 'role-reveal'
  | 'night'
  | 'dawn'
  | 'hunter-shot'
  | 'day-discussion'
  | 'vote'
  | 'pk-discussion'
  | 'pk-vote'
  | 'vote-result'
  | 'finished'

export interface WerewolfRoleInfo {
  id: WerewolfRoleId
  name: string
  camp: WerewolfCamp
  description: string
}

export const WEREWOLF_ROLES: Record<WerewolfRoleId, WerewolfRoleInfo> = {
  werewolf: {
    id: 'werewolf',
    name: '狼人',
    camp: 'wolf',
    description: '每晚與同伴選擇一名玩家襲擊。殺光所有好人即可獲勝。',
  },
  wolfKing: {
    id: 'wolfKing',
    name: '狼王',
    camp: 'wolf',
    description: '與狼人同陣營並一起襲擊。被狼人殺死或被放逐時可開槍帶走一人；被毒死則不能開槍。',
  },
  villager: {
    id: 'villager',
    name: '村民',
    camp: 'good',
    description: '沒有特殊能力。白天靠討論與投票找出狼人。',
  },
  seer: {
    id: 'seer',
    name: '預言家',
    camp: 'good',
    description: '每晚可查驗一名玩家是好人還是狼人。',
  },
  witch: {
    id: 'witch',
    name: '女巫',
    camp: 'good',
    description: '擁有一瓶解藥與一瓶毒藥，同一晚只能使用其中一瓶。',
  },
  hunter: {
    id: 'hunter',
    name: '獵人',
    camp: 'good',
    description: '被狼人殺死或被放逐時可開槍帶走一人；被毒死則不能開槍。',
  },
  guard: {
    id: 'guard',
    name: '守衛',
    camp: 'good',
    description: '每晚可守護一人（含自己），使其免於狼人襲擊；不能連續兩晚守護同一人。守護的人若同晚被解藥救起，反而會死亡。',
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
  {
    id: 'wolf-guard',
    name: '狼王守衛版',
    description: '在經典版加入狼王與守衛：預言家、女巫、獵人、守衛四神對抗狼王與狼人，屠城規則。',
    minPlayers: 10,
    maxPlayers: 12,
    roles: ['werewolf', 'wolfKing', 'villager', 'seer', 'witch', 'hunter', 'guard'],
  },
]

export const WEREWOLF_ROLE_COUNTS_BY_SCRIPT: Record<
  WerewolfScriptId,
  Record<number, Partial<Record<WerewolfRoleId, number>>>
> = {
  classic: {
    6: { werewolf: 2, villager: 2, seer: 1, witch: 1 },
    7: { werewolf: 2, villager: 2, seer: 1, witch: 1, hunter: 1 },
    8: { werewolf: 3, villager: 2, seer: 1, witch: 1, hunter: 1 },
    9: { werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1 },
    10: { werewolf: 3, villager: 4, seer: 1, witch: 1, hunter: 1 },
    11: { werewolf: 4, villager: 4, seer: 1, witch: 1, hunter: 1 },
    12: { werewolf: 4, villager: 5, seer: 1, witch: 1, hunter: 1 },
  },
  'wolf-guard': {
    10: { werewolf: 2, wolfKing: 1, villager: 3, seer: 1, witch: 1, hunter: 1, guard: 1 },
    11: { werewolf: 3, wolfKing: 1, villager: 3, seer: 1, witch: 1, hunter: 1, guard: 1 },
    12: { werewolf: 3, wolfKing: 1, villager: 4, seer: 1, witch: 1, hunter: 1, guard: 1 },
  },
}

export function getWerewolfRoleCounts(
  scriptId: WerewolfScriptId,
  playerCount: number,
): WerewolfRoleCounts | null {
  const composition = WEREWOLF_ROLE_COUNTS_BY_SCRIPT[scriptId][playerCount]
  if (!composition) {
    return null
  }

  const counts: WerewolfRoleCounts = {
    werewolf: 0,
    wolfKing: 0,
    villager: 0,
    seer: 0,
    witch: 0,
    hunter: 0,
    guard: 0,
  }
  for (const roleId of Object.keys(composition) as WerewolfRoleId[]) {
    counts[roleId] = composition[roleId] ?? 0
  }
  return counts
}

export function getWerewolfPlayerRange(settings: unknown): { min: number; max: number } | null {
  const scriptId = isRecord(settings) ? settings.scriptId : undefined
  const script = WEREWOLF_SCRIPTS.find((candidate) => candidate.id === scriptId)
  return script ? { min: script.minPlayers, max: script.maxPlayers } : null
}

export function isWerewolfScriptId(value: unknown): value is WerewolfScriptId {
  return WEREWOLF_SCRIPTS.some((script) => script.id === value)
}

export interface WerewolfSettings {
  scriptId: WerewolfScriptId
  discussionSeconds: number
  speechMode: boolean
  speechSeconds: number
  voteSeconds: number
  nightStepSeconds: number
  announcementSeconds: number
}

export const DEFAULT_WEREWOLF_SETTINGS: WerewolfSettings = {
  scriptId: 'classic',
  discussionSeconds: 120,
  speechMode: false,
  speechSeconds: 60,
  voteSeconds: 45,
  nightStepSeconds: 20,
  announcementSeconds: 10,
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
    typeof value.speechMode === 'boolean' &&
    isIntegerInRange(value.speechSeconds, 10, 180) &&
    isIntegerInRange(value.voteSeconds, 15, 180) &&
    isIntegerInRange(value.nightStepSeconds, 10, 60) &&
    isIntegerInRange(value.announcementSeconds, 5, 60)
  )
}

export interface WerewolfHunterShot {
  shooterId: string
  roleId: WerewolfRoleId
  targetId: string | null
}

export interface WerewolfSpeech {
  order: string[]
  index: number
}

export type WerewolfReplayEvent =
  | { type: 'wolf-choice'; day: number; playerId: string; targetId: string | null }
  | { type: 'wolf-attack'; day: number; targetId: string | null }
  | { type: 'seer-check'; day: number; playerId: string; targetId: string; camp: WerewolfCamp }
  | { type: 'guard-protect'; day: number; playerId: string; targetId: string | null }
  | { type: 'witch-save'; day: number; playerId: string; targetId: string }
  | { type: 'witch-poison'; day: number; playerId: string; targetId: string }
  | { type: 'night-death'; day: number; playerId: string; cause: 'wolf' | 'poison' }
  | { type: 'night-peace'; day: number }
  | { type: 'day-vote'; day: number; playerId: string; targetId: string | null; round?: 'pk' }
  | { type: 'vote-result'; day: number; targetId: string; result: 'exiled'; round?: 'pk' }
  | { type: 'vote-result'; day: number; targetId: null; result: 'tie' | 'no-votes'; round?: 'pk' }
  | { type: 'hunter-shot'; day: number; playerId: string; roleId: WerewolfRoleId; targetId: string | null }
  | { type: 'player-left'; day: number; playerId: string }
  | { type: 'game-end'; day: number; winner: WerewolfCamp }

export type WerewolfPublicEvent =
  | { type: 'night-death'; day: number; playerId: string }
  | { type: 'night-peace'; day: number }
  | { type: 'day-vote'; day: number; playerId: string; targetId: string | null; round?: 'pk' }
  | { type: 'vote-result'; day: number; targetId: string; result: 'exiled'; round?: 'pk' }
  | { type: 'vote-result'; day: number; targetId: null; result: 'tie' | 'no-votes'; round?: 'pk' }
  | { type: 'hunter-shot'; day: number; playerId: string; roleId: WerewolfRoleId; targetId: string | null }
  | { type: 'player-left'; day: number; playerId: string }
  | { type: 'game-end'; day: number; winner: WerewolfCamp }

export interface WerewolfReview {
  events: WerewolfReplayEvent[]
  playerNames: Record<string, string>
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
  roleCounts: WerewolfRoleCounts
  seatIds: string[]
  aliveIds: string[]
  lastDeathIds: string[]
  exiledId: string | null
  votes: Record<string, string | null> | null
  votedIds: string[]
  pkCandidateIds: string[]
  shooterId: string | null
  shooterRoleId: WerewolfRoleId | null
  hunterShot: WerewolfHunterShot | null
  speech: WerewolfSpeech | null
  winner: WerewolfCamp | null
  roles: Record<string, WerewolfRoleId> | null
  publicHistory: WerewolfPublicEvent[]
  review: WerewolfReview | null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isWerewolfRoleCounts(value: unknown): value is WerewolfRoleCounts {
  if (!isRecord(value)) {
    return false
  }

  const roleIds = Object.keys(WEREWOLF_ROLES)
  return (
    Object.keys(value).length === roleIds.length &&
    roleIds.every((roleId) => {
      const count = value[roleId]
      return typeof count === 'number' && Number.isInteger(count) && count >= 0
    })
  )
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isWerewolfReplayEvent(value: unknown): value is WerewolfReplayEvent {
  if (!isRecord(value) || !isIntegerInRange(value.day, 0, 1_000)) {
    return false
  }

  switch (value.type) {
    case 'wolf-choice':
    case 'guard-protect':
      return typeof value.playerId === 'string' && isNullableString(value.targetId)
    case 'day-vote':
      return (
        typeof value.playerId === 'string' &&
        isNullableString(value.targetId) &&
        (value.round === undefined || value.round === 'pk')
      )
    case 'wolf-attack':
      return isNullableString(value.targetId)
    case 'seer-check':
      return (
        typeof value.playerId === 'string' &&
        typeof value.targetId === 'string' &&
        (value.camp === 'good' || value.camp === 'wolf')
      )
    case 'witch-save':
    case 'witch-poison':
      return typeof value.playerId === 'string' && typeof value.targetId === 'string'
    case 'night-death':
      return (
        typeof value.playerId === 'string' &&
        (value.cause === 'wolf' || value.cause === 'poison')
      )
    case 'night-peace':
      return true
    case 'vote-result':
      return (
        (value.round === undefined || value.round === 'pk') &&
        (value.result === 'exiled'
          ? typeof value.targetId === 'string'
          : (value.result === 'tie' || value.result === 'no-votes') && value.targetId === null)
      )
    case 'hunter-shot':
      return (
        typeof value.playerId === 'string' &&
        isWerewolfRoleId(value.roleId) &&
        isNullableString(value.targetId)
      )
    case 'player-left':
      return typeof value.playerId === 'string'
    case 'game-end':
      return value.winner === 'good' || value.winner === 'wolf'
    default:
      return false
  }
}

function isWerewolfPublicEvent(value: unknown): value is WerewolfPublicEvent {
  if (!isRecord(value) || !isIntegerInRange(value.day, 0, 1_000)) {
    return false
  }

  switch (value.type) {
    case 'night-death':
      return typeof value.playerId === 'string' && !('cause' in value)
    case 'night-peace':
      return true
    case 'day-vote':
      return (
        typeof value.playerId === 'string' &&
        isNullableString(value.targetId) &&
        (value.round === undefined || value.round === 'pk')
      )
    case 'vote-result':
      return (
        (value.round === undefined || value.round === 'pk') &&
        (value.result === 'exiled'
          ? typeof value.targetId === 'string'
          : (value.result === 'tie' || value.result === 'no-votes') && value.targetId === null)
      )
    case 'hunter-shot':
      return (
        typeof value.playerId === 'string' &&
        isWerewolfRoleId(value.roleId) &&
        isNullableString(value.targetId)
      )
    case 'player-left':
      return typeof value.playerId === 'string'
    case 'game-end':
      return value.winner === 'good' || value.winner === 'wolf'
    default:
      return false
  }
}

function isWerewolfReview(value: unknown): value is WerewolfReview {
  return (
    isRecord(value) &&
    Array.isArray(value.events) &&
    value.events.every(isWerewolfReplayEvent) &&
    isRecord(value.playerNames) &&
    Object.values(value.playerNames).every((name) => typeof name === 'string')
  )
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
    'pk-discussion',
    'pk-vote',
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
      isWerewolfRoleId(value.hunterShot.roleId) &&
      isNullableString(value.hunterShot.targetId))
  const speechValid =
    value.speech === null ||
    (isRecord(value.speech) &&
      isStringArray(value.speech.order) &&
      isIntegerInRange(value.speech.index, 0, 100))
  const rolesValid =
    value.roles === null ||
    (isRecord(value.roles) && Object.values(value.roles).every(isWerewolfRoleId))
  const seatCount = isStringArray(value.seatIds) ? value.seatIds.length : null
  const roleCountTotal = isWerewolfRoleCounts(value.roleCounts)
    ? Object.values(value.roleCounts).reduce((total, count) => total + count, 0)
    : null
  const reviewValid =
    value.phase === 'finished' ? isWerewolfReview(value.review) : value.review === null
  const publicHistoryValid =
    Array.isArray(value.publicHistory) && value.publicHistory.every(isWerewolfPublicEvent)

  return (
    phases.includes(value.phase as WerewolfPhase) &&
    isIntegerInRange(value.day, 0, 1_000) &&
    isIntegerInRange(value.nightStep, 0, 100) &&
    isIntegerInRange(value.nightStepCount, 0, 100) &&
    typeof value.phaseEndsAt === 'number' &&
    typeof value.stateVersion === 'number' &&
    isWerewolfSettings(value.settings) &&
    roleCountTotal !== null &&
    roleCountTotal === seatCount &&
    isStringArray(value.seatIds) &&
    isStringArray(value.aliveIds) &&
    isStringArray(value.lastDeathIds) &&
    isNullableString(value.exiledId) &&
    votesValid &&
    isStringArray(value.votedIds) &&
    isStringArray(value.pkCandidateIds) &&
    isNullableString(value.shooterId) &&
    (value.shooterRoleId === null || isWerewolfRoleId(value.shooterRoleId)) &&
    hunterShotValid &&
    speechValid &&
    (value.winner === null || value.winner === 'good' || value.winner === 'wolf') &&
    rolesValid &&
    publicHistoryValid &&
    reviewValid
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

export interface WerewolfGuardState {
  lastTargetId: string | null
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
  guard: WerewolfGuardState | null
  canShoot: boolean
  myVote: string | null
  voteSelection: string | null
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
    (value.guard === null || isRecord(value.guard)) &&
    typeof value.canShoot === 'boolean' &&
    isNullableString(value.myVote) &&
    isNullableString(value.voteSelection) &&
    typeof value.hasVoted === 'boolean'
  )
}
