export type AvalonCamp = 'good' | 'evil'
export type AvalonMissionCard = 'success' | 'fail'
export type AvalonMissionOutcome = 'success' | 'failure'
export type AvalonRoleId =
  | 'merlin'
  | 'percival'
  | 'loyal-servant'
  | 'assassin'
  | 'minion'
  | 'morgana'
  | 'mordred'
  | 'oberon'
export type AvalonPhase =
  | 'role-reveal'
  | 'team-selection'
  | 'team-vote'
  | 'mission'
  | 'lake-check'
  | 'assassination'
  | 'finished'
export type AvalonEndReason = 'completed' | 'player-left'
export type AvalonKnowledge = 'evil' | 'merlin-or-morgana'
export const AVALON_PRIVATE_EVENT = 'avalon-private-state'

export interface AvalonRoleInfo {
  id: AvalonRoleId
  name: string
  camp: AvalonCamp
  description: string
}

export const AVALON_ROLES: Record<AvalonRoleId, AvalonRoleInfo> = {
  merlin: {
    id: 'merlin',
    name: '梅林',
    camp: 'good',
    description: '知道大部分邪惡玩家是誰，但看不到莫德雷德與奧伯倫；完成三個任務後可能被刺客刺殺。',
  },
  percival: {
    id: 'percival',
    name: '派西維爾',
    camp: 'good',
    description: '知道梅林與莫甘娜（若有加入）可能是誰，但不知道兩人各自的身分。',
  },
  'loyal-servant': {
    id: 'loyal-servant',
    name: '亞瑟的忠臣',
    camp: 'good',
    description: '沒有特殊能力，透過組隊投票與任務結果找出邪惡玩家。',
  },
  assassin: {
    id: 'assassin',
    name: '刺客',
    camp: 'evil',
    description: '若正義陣營完成三個任務，可指定一名玩家刺殺；刺中梅林即可反敗為勝。',
  },
  minion: {
    id: 'minion',
    name: '邪惡爪牙',
    camp: 'evil',
    description: '沒有額外特殊能力；組隊任務時可以選擇出成功或失敗。',
  },
  morgana: {
    id: 'morgana',
    name: '莫甘娜',
    camp: 'evil',
    description: '在派西維爾眼中偽裝成梅林；只有派西維爾也加入時才會產生混淆。',
  },
  mordred: {
    id: 'mordred',
    name: '莫德雷德',
    camp: 'evil',
    description: '邪惡陣營成員，但不會被梅林看見。',
  },
  oberon: {
    id: 'oberon',
    name: '奧伯倫',
    camp: 'evil',
    description: '不知道其他邪惡玩家是誰，其他邪惡玩家也看不到你；湖中女神會把你查成好人。',
  },
}

export const AVALON_EVIL_COUNTS: Record<number, number> = {
  5: 2,
  6: 2,
  7: 3,
  8: 3,
  9: 3,
  10: 4,
}

export const AVALON_MISSION_TEAM_SIZES: Record<number, readonly number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
}

export function getAvalonMissionTeamSizes(playerCount: number): readonly number[] | null {
  return AVALON_MISSION_TEAM_SIZES[playerCount] ?? null
}

export function getAvalonMissionTeamSize(playerCount: number, missionNumber: number): number | null {
  return getAvalonMissionTeamSizes(playerCount)?.[missionNumber - 1] ?? null
}

export function getAvalonMissionFailThreshold(playerCount: number, missionNumber: number): number {
  return playerCount >= 7 && missionNumber === 4 ? 2 : 1
}

export interface AvalonSettings {
  includePercival: boolean
  includeMorgana: boolean
  includeMordred: boolean
  includeOberon: boolean
  ladyOfTheLake: boolean
}

export const DEFAULT_AVALON_SETTINGS: AvalonSettings = {
  includePercival: false,
  includeMorgana: false,
  includeMordred: false,
  includeOberon: false,
  ladyOfTheLake: false,
}

export function isAvalonRoleId(value: unknown): value is AvalonRoleId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AVALON_ROLES, value)
}

export function isAvalonSettings(value: unknown): value is AvalonSettings {
  return (
    isRecord(value) &&
    typeof value.includePercival === 'boolean' &&
    typeof value.includeMorgana === 'boolean' &&
    typeof value.includeMordred === 'boolean' &&
    typeof value.includeOberon === 'boolean' &&
    typeof value.ladyOfTheLake === 'boolean'
  )
}

export type AvalonRoleCounts = Record<AvalonRoleId, number>

export function getAvalonRoleCounts(
  playerCount: number,
  settings: unknown,
): AvalonRoleCounts | null {
  if (!isAvalonSettings(settings)) {
    return null
  }

  const evilCount = AVALON_EVIL_COUNTS[playerCount]
  if (evilCount === undefined) {
    return null
  }

  const optionalEvilCount = Number(settings.includeMorgana) +
    Number(settings.includeMordred) +
    Number(settings.includeOberon)
  const goodCount = playerCount - evilCount
  if (evilCount < 1 + optionalEvilCount || goodCount < 1 + Number(settings.includePercival)) {
    return null
  }

  return {
    merlin: 1,
    percival: Number(settings.includePercival),
    'loyal-servant': goodCount - 1 - Number(settings.includePercival),
    assassin: 1,
    minion: evilCount - 1 - optionalEvilCount,
    morgana: Number(settings.includeMorgana),
    mordred: Number(settings.includeMordred),
    oberon: Number(settings.includeOberon),
  }
}

export function getAvalonPlayerRange(settings: unknown): { min: number; max: number } | null {
  if (!isAvalonSettings(settings)) {
    return null
  }

  const min = Object.keys(AVALON_EVIL_COUNTS)
    .map(Number)
    .sort((left, right) => left - right)
    .find((playerCount) => {
      return (
        (!settings.ladyOfTheLake || playerCount >= 7) &&
        getAvalonRoleCounts(playerCount, settings) !== null
      )
    })
  return min === undefined ? null : { min, max: 10 }
}

export interface AvalonVoteResult {
  missionNumber: number
  leaderId: string
  teamIds: string[]
  votes: Record<string, boolean>
  approveCount: number
  rejectCount: number
  accepted: boolean
}

export interface AvalonMissionResult {
  missionNumber: number
  leaderId: string
  teamIds: string[]
  outcome: AvalonMissionOutcome
  successCount: number
  failCount: number
  failThreshold: number
}

export interface AvalonKnownPlayer {
  playerId: string
  knowledge: AvalonKnowledge
}

export interface AvalonLakeResult {
  missionNumber: number
  targetId: string
  camp: AvalonCamp
}

export interface AvalonPrivateState {
  stateVersion: number
  roleId: AvalonRoleId
  camp: AvalonCamp
  knownPlayers: AvalonKnownPlayer[]
  voteSelection: boolean | null
  missionSelection: AvalonMissionCard | null
  lakeResults: AvalonLakeResult[]
}

export interface AvalonView {
  gameId: 'avalon'
  phase: AvalonPhase
  settings: AvalonSettings
  stateVersion: number
  seatIds: string[]
  initialLeaderId: string
  leaderId: string
  missionNumber: number
  teamSize: number
  teamIds: string[]
  readyIds: string[]
  rejectedTeams: number
  votesSubmitted: number
  missionCardsSubmitted: number
  lastVote: AvalonVoteResult | null
  voteHistory: AvalonVoteResult[]
  missions: AvalonMissionResult[]
  lakeHolderId: string | null
  lakeVisitedIds: string[]
  winner: AvalonCamp | null
  endReason: AvalonEndReason | null
  departedPlayerId: string | null
  roles: Record<string, AvalonRoleId> | null
  assassinationTargetId: string | null
  assassinationHit: boolean | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isUniqueStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string') &&
    new Set(value).size === value.length
  )
}

function isPlayerIdArray(value: unknown, seatIds: Set<string>): value is string[] {
  return isUniqueStringArray(value) && value.every((playerId) => seatIds.has(playerId))
}

function isAvalonVoteResult(
  value: unknown,
  seatIds: Set<string>,
  playerCount: number,
): value is AvalonVoteResult {
  if (
    !isRecord(value) ||
    !isIntegerInRange(value.missionNumber, 1, 5) ||
    typeof value.leaderId !== 'string' ||
    !seatIds.has(value.leaderId) ||
    !isPlayerIdArray(value.teamIds, seatIds) ||
    value.teamIds.length !== getAvalonMissionTeamSize(playerCount, value.missionNumber) ||
    !isRecord(value.votes) ||
    !Object.entries(value.votes).every(
      ([playerId, vote]) => seatIds.has(playerId) && typeof vote === 'boolean',
    ) ||
    Object.keys(value.votes).length !== playerCount ||
    !isIntegerInRange(value.approveCount, 0, playerCount) ||
    !isIntegerInRange(value.rejectCount, 0, playerCount) ||
    typeof value.accepted !== 'boolean'
  ) {
    return false
  }

  const approveCount = Object.values(value.votes).filter((vote) => vote).length
  const rejectCount = playerCount - approveCount
  return (
    value.approveCount === approveCount &&
    value.rejectCount === rejectCount &&
    value.accepted === (approveCount > playerCount / 2)
  )
}

function isAvalonMissionResult(
  value: unknown,
  seatIds: Set<string>,
  playerCount: number,
  expectedMissionNumber: number,
): value is AvalonMissionResult {
  if (
    !isRecord(value) ||
    value.missionNumber !== expectedMissionNumber ||
    typeof value.leaderId !== 'string' ||
    !seatIds.has(value.leaderId) ||
    !isPlayerIdArray(value.teamIds, seatIds) ||
    value.teamIds.length !== getAvalonMissionTeamSize(playerCount, expectedMissionNumber) ||
    !isIntegerInRange(value.successCount, 0, value.teamIds.length) ||
    !isIntegerInRange(value.failCount, 0, value.teamIds.length) ||
    value.successCount + value.failCount !== value.teamIds.length ||
    value.failThreshold !== getAvalonMissionFailThreshold(playerCount, expectedMissionNumber) ||
    !['success', 'failure'].includes(String(value.outcome))
  ) {
    return false
  }

  return value.outcome === (value.failCount >= value.failThreshold ? 'failure' : 'success')
}

function isAvalonLakeResult(value: unknown): value is AvalonLakeResult {
  return (
    isRecord(value) &&
    isIntegerInRange(value.missionNumber, 2, 4) &&
    typeof value.targetId === 'string' &&
    (value.camp === 'good' || value.camp === 'evil')
  )
}

export function isAvalonPrivateState(value: unknown): value is AvalonPrivateState {
  return (
    isRecord(value) &&
    isIntegerInRange(value.stateVersion, 1, Number.MAX_SAFE_INTEGER) &&
    isAvalonRoleId(value.roleId) &&
    value.camp === AVALON_ROLES[value.roleId].camp &&
    Array.isArray(value.knownPlayers) &&
    value.knownPlayers.every((knownPlayer) => {
      return (
        isRecord(knownPlayer) &&
        typeof knownPlayer.playerId === 'string' &&
        (knownPlayer.knowledge === 'evil' || knownPlayer.knowledge === 'merlin-or-morgana')
      )
    }) &&
    (value.voteSelection === null || typeof value.voteSelection === 'boolean') &&
    (
      value.missionSelection === null ||
      value.missionSelection === 'success' ||
      value.missionSelection === 'fail'
    ) &&
    Array.isArray(value.lakeResults) &&
    value.lakeResults.every(isAvalonLakeResult)
  )
}

export function isAvalonView(value: unknown): value is AvalonView {
  if (
    !isRecord(value) ||
    value.gameId !== 'avalon' ||
    !isAvalonSettings(value.settings) ||
    !isIntegerInRange(value.stateVersion, 1, Number.MAX_SAFE_INTEGER) ||
    !isUniqueStringArray(value.seatIds) ||
    value.seatIds.length < 5 ||
    value.seatIds.length > 10 ||
    !['role-reveal', 'team-selection', 'team-vote', 'mission', 'lake-check', 'assassination', 'finished']
      .includes(String(value.phase)) ||
    typeof value.initialLeaderId !== 'string' ||
    typeof value.leaderId !== 'string' ||
    !isIntegerInRange(value.missionNumber, 1, 5) ||
    !isIntegerInRange(value.teamSize, 2, 5) ||
    !isPlayerIdArray(value.teamIds, new Set(value.seatIds)) ||
    !isPlayerIdArray(value.readyIds, new Set(value.seatIds)) ||
    !isIntegerInRange(value.rejectedTeams, 0, 5) ||
    !isIntegerInRange(value.votesSubmitted, 0, value.seatIds.length) ||
    !isIntegerInRange(value.missionCardsSubmitted, 0, 5) ||
    !Array.isArray(value.voteHistory) ||
    value.voteHistory.length > 25 ||
    !Array.isArray(value.missions) ||
    value.missions.length > 5 ||
    (value.lakeHolderId !== null && typeof value.lakeHolderId !== 'string') ||
    !isPlayerIdArray(value.lakeVisitedIds, new Set(value.seatIds)) ||
    (value.winner !== null && value.winner !== 'good' && value.winner !== 'evil') ||
    (
      value.endReason !== null &&
      value.endReason !== 'completed' &&
      value.endReason !== 'player-left'
    ) ||
    (value.departedPlayerId !== null && typeof value.departedPlayerId !== 'string') ||
    (
      value.assassinationTargetId !== null &&
      typeof value.assassinationTargetId !== 'string'
    ) ||
    (
      value.assassinationHit !== null &&
      typeof value.assassinationHit !== 'boolean'
    )
  ) {
    return false
  }

  const seatIds = new Set(value.seatIds)
  const playerCount = value.seatIds.length
  const teamSize = getAvalonMissionTeamSize(playerCount, value.missionNumber)
  const roleCounts = getAvalonRoleCounts(playerCount, value.settings)
  if (
    !seatIds.has(value.initialLeaderId) ||
    !seatIds.has(value.leaderId) ||
    teamSize === null ||
    value.teamSize !== teamSize ||
    roleCounts === null ||
    value.teamIds.length > teamSize ||
    (
      (value.phase === 'team-vote' || value.phase === 'mission') &&
      value.teamIds.length !== teamSize
    ) ||
    (value.phase === 'role-reveal' && value.teamIds.length !== 0) ||
    (
      value.phase === 'team-vote'
        ? value.votesSubmitted >= playerCount
        : value.votesSubmitted !== 0
    ) ||
    (
      value.phase === 'mission'
        ? value.missionCardsSubmitted > value.teamIds.length
        : value.missionCardsSubmitted !== 0
    ) ||
    !value.missions.every((mission, index) => {
      return isAvalonMissionResult(mission, seatIds, playerCount, index + 1)
    }) ||
    !value.voteHistory.every((vote) => isAvalonVoteResult(vote, seatIds, playerCount)) ||
    (
      value.lastVote !== null &&
      !isAvalonVoteResult(value.lastVote, seatIds, playerCount)
    )
  ) {
    return false
  }

  if (
    value.settings.ladyOfTheLake
      ? (
        playerCount < 7 ||
        value.lakeHolderId === null ||
        !seatIds.has(value.lakeHolderId) ||
        value.lakeVisitedIds.length < 1 ||
        value.lakeVisitedIds.length > 4 ||
        !value.lakeVisitedIds.includes(value.lakeHolderId)
      )
      : value.lakeHolderId !== null || value.lakeVisitedIds.length !== 0
  ) {
    return false
  }

  if (value.phase === 'finished') {
    if (
      value.endReason === null ||
      (value.endReason === 'completed' && value.winner === null) ||
      (value.endReason === 'player-left' && value.winner !== null) ||
      (value.endReason === 'player-left'
        ? value.departedPlayerId === null || !seatIds.has(value.departedPlayerId)
        : value.departedPlayerId !== null) ||
      (value.roles === null) ||
      !isRecord(value.roles) ||
      Object.keys(value.roles).length !== playerCount ||
      !Object.entries(value.roles).every(
        ([playerId, roleId]) => seatIds.has(playerId) && isAvalonRoleId(roleId),
      ) ||
      value.assassinationTargetId !== null &&
        (!seatIds.has(value.assassinationTargetId) || value.assassinationHit === null) ||
      value.assassinationTargetId === null && value.assassinationHit !== null ||
      value.assassinationHit === true && value.winner !== 'evil' ||
      value.assassinationHit === false && value.winner !== 'good'
    ) {
      return false
    }

    const actualCounts: Partial<AvalonRoleCounts> = {}
    for (const roleId of Object.values(value.roles)) {
      if (!isAvalonRoleId(roleId)) {
        return false
      }
      actualCounts[roleId] = (actualCounts[roleId] ?? 0) + 1
    }
    if (Object.entries(roleCounts).some(([roleId, count]) => {
      return !isAvalonRoleId(roleId) || (actualCounts[roleId] ?? 0) !== count
    })) {
      return false
    }
  } else if (
    value.winner !== null ||
    value.endReason !== null ||
    value.departedPlayerId !== null ||
    value.roles !== null ||
    value.assassinationTargetId !== null ||
    value.assassinationHit !== null
  ) {
    return false
  }

  return true
}
