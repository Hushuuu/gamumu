import {
  AVALON_PRIVATE_EVENT,
  AVALON_ROLES,
  DEFAULT_AVALON_SETTINGS,
  getAvalonMissionFailThreshold,
  getAvalonMissionTeamSize,
  getAvalonRoleCounts,
  isAvalonSettings,
  type AvalonCamp,
  type AvalonMissionCard,
  type AvalonMissionResult,
  type AvalonPrivateState,
  type AvalonRoleId,
  type AvalonSettings,
  type AvalonVoteResult,
  type AvalonView,
} from '../../../../shared/games/avalon'
import type { GameActionResult, GameModule, GameRoomContext } from '../types'
import type { StoredAvalon } from './types'

const WIN_SCORE = 100

function failure(code: string, message: string): GameActionResult {
  return { ok: false, changed: false, code, message }
}

function normalizeSettings(settings: AvalonSettings): AvalonSettings {
  return {
    includePercival: settings.includePercival,
    includeMorgana: settings.includeMorgana,
    includeMordred: settings.includeMordred,
    includeOberon: settings.includeOberon,
    ladyOfTheLake: settings.ladyOfTheLake,
  }
}

function shuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex]!, shuffled[index]!]
  }
  return shuffled
}

function currentSettings(room: GameRoomContext): AvalonSettings {
  const settings = room.gameSettings
  return isAvalonSettings(settings)
    ? normalizeSettings(settings)
    : { ...DEFAULT_AVALON_SETTINGS }
}

function activeGame(room: GameRoomContext): StoredAvalon | null {
  if (room.status !== 'playing' || room.game?.gameId !== 'avalon') {
    return null
  }
  return room.game
}

function nextPlayerId(game: StoredAvalon, playerId: string): string {
  const index = game.playerIds.indexOf(playerId)
  return game.playerIds[(index + 1) % game.playerIds.length]!
}

function missionCount(game: StoredAvalon, outcome: 'success' | 'failure'): number {
  return game.missions.filter((mission) => mission.outcome === outcome).length
}

function roleList(playerCount: number, settings: AvalonSettings): AvalonRoleId[] {
  const counts = getAvalonRoleCounts(playerCount, settings)
  if (!counts) {
    throw new Error(`No Avalon role setup exists for ${playerCount} players.`)
  }

  return Object.keys(counts)
    .filter(isAvalonRoleId)
    .flatMap((roleId) => Array.from({ length: counts[roleId] }, () => roleId))
}

function isAvalonRoleId(value: string): value is AvalonRoleId {
  return Object.prototype.hasOwnProperty.call(AVALON_ROLES, value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function knownPlayersFor(game: StoredAvalon, playerId: string): AvalonPrivateState['knownPlayers'] {
  const roleId = game.roles[playerId]
  if (!roleId) {
    return []
  }

  if (roleId === 'merlin') {
    return game.playerIds.flatMap((knownPlayerId) => {
      const knownRole = game.roles[knownPlayerId]
      return knownRole && AVALON_ROLES[knownRole].camp === 'evil' &&
        knownRole !== 'mordred' && knownRole !== 'oberon'
        ? [{ playerId: knownPlayerId, knowledge: 'evil' as const }]
        : []
    })
  }

  if (roleId === 'percival') {
    return game.playerIds.flatMap((knownPlayerId) => {
      const knownRole = game.roles[knownPlayerId]
      return knownRole === 'merlin' || knownRole === 'morgana'
        ? [{ playerId: knownPlayerId, knowledge: 'merlin-or-morgana' as const }]
        : []
    })
  }

  if (AVALON_ROLES[roleId].camp === 'evil' && roleId !== 'oberon') {
    return game.playerIds.flatMap((knownPlayerId) => {
      const knownRole = game.roles[knownPlayerId]
      return knownPlayerId !== playerId && knownRole &&
        AVALON_ROLES[knownRole].camp === 'evil' && knownRole !== 'oberon'
        ? [{ playerId: knownPlayerId, knowledge: 'evil' as const }]
        : []
    })
  }

  return []
}

function finishGame(
  room: GameRoomContext,
  game: StoredAvalon,
  winner: AvalonCamp,
  assassinationTargetId: string | null = null,
  assassinationHit: boolean | null = null,
): void {
  game.phase = 'finished'
  game.winner = winner
  game.endReason = 'completed'
  game.departedPlayerId = null
  game.assassinationTargetId = assassinationTargetId
  game.assassinationHit = assassinationHit
  game.voteSelections = {}
  game.missionSelections = {}
  game.lakeAfterPhase = null
  room.status = 'finished'

  for (const player of room.players) {
    const roleId = game.roles[player.id]
    if (roleId && AVALON_ROLES[roleId].camp === winner) {
      player.score += WIN_SCORE
    }
  }
}

function beginNextMission(game: StoredAvalon): void {
  if (game.missionNumber >= 5) {
    const winner = missionCount(game, 'success') >= 3 ? 'good' : 'evil'
    game.phase = 'finished'
    game.winner = winner
    game.endReason = 'completed'
    return
  }

  game.missionNumber += 1
  game.leaderId = nextPlayerId(game, game.leaderId)
  game.teamIds = []
  game.rejectedTeams = 0
  game.voteSelections = {}
  game.missionSelections = {}
  game.phase = 'team-selection'
}

function continueAfterMission(
  room: GameRoomContext,
  game: StoredAvalon,
  nextPhase: 'team-selection' | 'assassination',
): void {
  if (nextPhase === 'assassination') {
    game.phase = 'assassination'
    return
  }

  beginNextMission(game)
  if (game.phase === 'finished') {
    finishGame(room, game, game.winner ?? 'evil')
  }
}

function resolveMission(room: GameRoomContext, game: StoredAvalon): void {
  const failCount = Object.values(game.missionSelections).filter((card) => card === 'fail').length
  const successCount = game.teamIds.length - failCount
  const failThreshold = getAvalonMissionFailThreshold(game.playerIds.length, game.missionNumber)
  const outcome = failCount >= failThreshold ? 'failure' : 'success'
  const mission: AvalonMissionResult = {
    missionNumber: game.missionNumber,
    leaderId: game.leaderId,
    teamIds: [...game.teamIds],
    outcome,
    successCount,
    failCount,
    failThreshold,
    failPlayerIds: Object.entries(game.missionSelections)
      .filter(([, card]) => card === 'fail')
      .map(([playerId]) => playerId),
  }
  game.missions.push(mission)
  game.missionSelections = {}

  if (missionCount(game, 'failure') >= 3) {
    finishGame(room, game, 'evil')
    return
  }

  const nextPhase = missionCount(game, 'success') >= 3
    ? 'assassination'
    : 'team-selection'
  if (
    game.settings.ladyOfTheLake &&
    game.missionNumber >= 2 &&
    game.missionNumber <= 4
  ) {
    game.phase = 'lake-check'
    game.lakeAfterPhase = nextPhase
    return
  }

  continueAfterMission(room, game, nextPhase)
}

function finishTeamVote(room: GameRoomContext, game: StoredAvalon): void {
  const approveCount = Object.values(game.voteSelections).filter(Boolean).length
  const rejectCount = game.playerIds.length - approveCount
  const accepted = approveCount > game.playerIds.length / 2
  const vote: AvalonVoteResult = {
    missionNumber: game.missionNumber,
    leaderId: game.leaderId,
    teamIds: [...game.teamIds],
    votes: { ...game.voteSelections },
    approveCount,
    rejectCount,
    accepted,
  }
  game.lastVote = vote
  game.voteHistory.push(vote)
  game.voteSelections = {}

  if (!accepted) {
    game.rejectedTeams += 1
    if (game.rejectedTeams >= 5) {
      finishGame(room, game, 'evil')
      return
    }

    game.leaderId = nextPlayerId(game, game.leaderId)
    game.teamIds = []
    game.phase = 'team-selection'
    return
  }

  game.phase = 'mission'
  game.missionSelections = {}
}

function dispatchAction(
  room: GameRoomContext,
  game: StoredAvalon,
  playerId: string,
  action: string,
  payload: Record<string, unknown>,
): GameActionResult {
  if (!game.playerIds.includes(playerId)) {
    return failure('PLAYER_NOT_IN_GAME', '你不在這場阿瓦隆遊戲中。')
  }

  switch (action) {
    case 'confirm-role': {
      if (game.phase !== 'role-reveal') {
        return failure('WRONG_PHASE', '目前不是確認角色的階段。')
      }
      if (game.readyIds.includes(playerId)) {
        return { ok: true, changed: false }
      }

      game.readyIds.push(playerId)
      if (game.readyIds.length === game.playerIds.length) {
        game.phase = 'team-selection'
      }
      return { ok: true, changed: true }
    }
    case 'propose-team': {
      if (game.phase !== 'team-selection') {
        return failure('WRONG_PHASE', '目前不能提出任務隊伍。')
      }
      if (playerId !== game.leaderId) {
        return failure('NOT_CURRENT_LEADER', '只有目前隊長可以組隊。')
      }
      if (!isStringArray(payload.teamIds)) {
        return failure('INVALID_TEAM', '請選擇正確的任務隊伍。')
      }

      const teamIds = payload.teamIds
      const teamSize = getAvalonMissionTeamSize(game.playerIds.length, game.missionNumber)
      if (
        teamSize === null ||
        teamIds.length !== teamSize ||
        new Set(teamIds).size !== teamIds.length ||
        teamIds.some((id) => !game.playerIds.includes(id))
      ) {
        return failure('INVALID_TEAM', `第 ${game.missionNumber} 個任務需要選出 ${teamSize ?? '指定'} 位不同玩家。`)
      }

      game.teamIds = [...teamIds]
      game.lastVote = null
      game.voteSelections = {}
      game.phase = 'team-vote'
      return { ok: true, changed: true }
    }
    case 'vote-team': {
      if (game.phase !== 'team-vote') {
        return failure('WRONG_PHASE', '目前不是隊伍投票階段。')
      }
      if (typeof payload.approve !== 'boolean') {
        return failure('INVALID_VOTE', '請選擇同意或反對。')
      }

      game.voteSelections[playerId] = payload.approve
      if (Object.keys(game.voteSelections).length === game.playerIds.length) {
        finishTeamVote(room, game)
      }
      return { ok: true, changed: true }
    }
    case 'submit-mission': {
      if (game.phase !== 'mission') {
        return failure('WRONG_PHASE', '目前不是執行任務的階段。')
      }
      if (!game.teamIds.includes(playerId)) {
        return failure('NOT_ON_TEAM', '只有任務隊伍中的玩家可以出任務牌。')
      }
      if (payload.card !== 'success' && payload.card !== 'fail') {
        return failure('INVALID_MISSION_CARD', '請選擇任務成功或失敗。')
      }
      const card: AvalonMissionCard = payload.card

      const roleId = game.roles[playerId]
      if (!roleId) {
        return failure('PLAYER_ROLE_NOT_FOUND', '找不到你的角色，無法執行任務。')
      }
      if (AVALON_ROLES[roleId].camp === 'good' && card === 'fail') {
        return failure('GOOD_CANNOT_FAIL', '正義陣營只能出任務成功牌。')
      }

      game.missionSelections[playerId] = card
      if (Object.keys(game.missionSelections).length === game.teamIds.length) {
        resolveMission(room, game)
      }
      return { ok: true, changed: true }
    }
    case 'check-lake': {
      if (game.phase !== 'lake-check' || !game.settings.ladyOfTheLake) {
        return failure('WRONG_PHASE', '目前沒有湖中女神查驗。')
      }
      if (playerId !== game.lakeHolderId) {
        return failure('NOT_LAKE_HOLDER', '只有湖中女神標記持有人可以查驗。')
      }
      if (typeof payload.targetId !== 'string' || !game.playerIds.includes(payload.targetId)) {
        return failure('INVALID_LAKE_TARGET', '請選擇一位有效玩家查驗。')
      }
      if (game.lakeVisitedIds.includes(payload.targetId)) {
        return failure('PLAYER_ALREADY_HELD_LAKE', '不能查驗曾經持有過湖中女神標記的玩家。')
      }

      const targetRole = game.roles[payload.targetId]
      if (!targetRole) {
        return failure('PLAYER_ROLE_NOT_FOUND', '找不到這位玩家的角色，無法查驗。')
      }
      const nextPhase = game.lakeAfterPhase
      if (!nextPhase) {
        return failure('INVALID_LAKE_STATE', '湖中女神查驗流程狀態不正確。')
      }

      game.lakeResults.push({
        holderId: playerId,
        missionNumber: game.missionNumber,
        targetId: payload.targetId,
        camp: targetRole === 'oberon' ? 'good' : AVALON_ROLES[targetRole].camp,
      })
      game.lakeVisitedIds.push(payload.targetId)
      game.lakeHolderId = payload.targetId
      game.lakeAfterPhase = null
      continueAfterMission(room, game, nextPhase)
      return { ok: true, changed: true }
    }
    case 'assassinate': {
      if (game.phase !== 'assassination') {
        return failure('WRONG_PHASE', '目前不是刺殺梅林階段。')
      }
      if (game.roles[playerId] !== 'assassin') {
        return failure('NOT_ASSASSIN', '只有刺客可以指定刺殺目標。')
      }
      if (typeof payload.targetId !== 'string' || !game.playerIds.includes(payload.targetId)) {
        return failure('INVALID_ASSASSINATION_TARGET', '請選擇一位有效玩家作為刺殺目標。')
      }

      const hit = game.roles[payload.targetId] === 'merlin'
      finishGame(room, game, hit ? 'evil' : 'good', payload.targetId, hit)
      return { ok: true, changed: true }
    }
    default:
      return failure('UNKNOWN_GAME_ACTION', '阿瓦隆不支援這個操作。')
  }
}

function toPrivateState(game: StoredAvalon, playerId: string): AvalonPrivateState | null {
  const roleId = game.roles[playerId]
  if (!roleId) {
    return null
  }

  return {
    stateVersion: game.stateVersion,
    roleId,
    camp: AVALON_ROLES[roleId].camp,
    knownPlayers: knownPlayersFor(game, playerId),
    voteSelection:
      game.phase === 'team-vote'
        ? (game.voteSelections[playerId] ?? null)
        : null,
    missionSelection:
      game.phase === 'mission' && game.teamIds.includes(playerId)
        ? (game.missionSelections[playerId] ?? null)
        : null,
    lakeResults: game.lakeResults
      .filter((result) => result.holderId === playerId)
      .map(({ missionNumber, targetId, camp }) => ({ missionNumber, targetId, camp })),
  }
}

export const avalonGame: GameModule = {
  id: 'avalon',
  pushPrivateState: true,
  defaultSettings: () => ({ ...DEFAULT_AVALON_SETTINGS }),
  configure(room, _playerId, settings) {
    if (!isAvalonSettings(settings)) {
      return failure('INVALID_GAME_SETTINGS', '阿瓦隆角色與湖中女神設定格式不正確。')
    }

    const current = currentSettings(room)
    const changed =
      current.includePercival !== settings.includePercival ||
      current.includeMorgana !== settings.includeMorgana ||
      current.includeMordred !== settings.includeMordred ||
      current.includeOberon !== settings.includeOberon ||
      current.ladyOfTheLake !== settings.ladyOfTheLake
    if (!changed) {
      return { ok: true, changed: false }
    }

    room.gameSettings = { ...normalizeSettings(settings) }
    return { ok: true, changed: true }
  },
  publicSettings: (room) => ({ ...currentSettings(room) }),
  privateState(room, playerId) {
    const game = room.game
    if (game?.gameId !== 'avalon') {
      return null
    }

    const state = toPrivateState(game, playerId)
    return state ? { name: AVALON_PRIVATE_EVENT, payload: { ...state } } : null
  },
  start(room) {
    const settings = currentSettings(room)
    const playerIds = room.players.map((player) => player.id)
    const roles = shuffle(roleList(playerIds.length, settings))
    if (roles.length !== playerIds.length) {
      throw new Error('Avalon role setup does not match the room player count.')
    }

    const firstLeaderIndex = Math.floor(Math.random() * playerIds.length)
    const initialLeaderId = playerIds[firstLeaderIndex]!
    const lakeHolderId = settings.ladyOfTheLake
      ? playerIds[(firstLeaderIndex + 1) % playerIds.length]!
      : null
    room.status = 'playing'
    room.game = {
      gameId: 'avalon',
      settings,
      playerIds,
      roles: Object.fromEntries(playerIds.map((playerId, index) => [playerId, roles[index]!])),
      phase: 'role-reveal',
      stateVersion: 1,
      initialLeaderId,
      leaderId: initialLeaderId,
      missionNumber: 1,
      teamIds: [],
      readyIds: [],
      rejectedTeams: 0,
      voteSelections: {},
      lastVote: null,
      voteHistory: [],
      missionSelections: {},
      missions: [],
      lakeHolderId,
      lakeVisitedIds: lakeHolderId ? [lakeHolderId] : [],
      lakeResults: [],
      lakeAfterPhase: null,
      winner: null,
      endReason: null,
      departedPlayerId: null,
      assassinationTargetId: null,
      assassinationHit: null,
    }
  },
  handleAction(room, playerId, action, payload) {
    const game = activeGame(room)
    if (!game) {
      return failure('GAME_NOT_IN_PROGRESS', '目前沒有進行中的阿瓦隆遊戲。')
    }

    const result = dispatchAction(room, game, playerId, action, payload)
    if (result.changed) {
      game.stateVersion += 1
    }
    return result
  },
  nextAlarmAt: () => null,
  handleAlarm: () => false,
  onPlayerLeave(room, playerId) {
    const game = activeGame(room)
    if (!game || !game.playerIds.includes(playerId)) {
      return false
    }

    game.phase = 'finished'
    game.winner = null
    game.endReason = 'player-left'
    game.departedPlayerId = playerId
    game.voteSelections = {}
    game.missionSelections = {}
    game.lakeAfterPhase = null
    game.stateVersion += 1
    room.status = 'finished'
    return true
  },
  playerFlags(room, _playerId) {
    const game = room.game
    if (game?.gameId !== 'avalon') {
      return { answered: false, correct: false }
    }

    return { answered: false, correct: false }
  },
  toView(room): AvalonView | null {
    const game = room.game
    if (game?.gameId !== 'avalon') {
      return null
    }

    return {
      gameId: 'avalon',
      phase: game.phase,
      settings: { ...game.settings },
      stateVersion: game.stateVersion,
      seatIds: [...game.playerIds],
      initialLeaderId: game.initialLeaderId,
      leaderId: game.leaderId,
      missionNumber: game.missionNumber,
      teamSize: getAvalonMissionTeamSize(game.playerIds.length, game.missionNumber) ?? 0,
      teamIds: [...game.teamIds],
      readyIds: [...game.readyIds],
      rejectedTeams: game.rejectedTeams,
      votesSubmitted: Object.keys(game.voteSelections).length,
      missionCardsSubmitted: Object.keys(game.missionSelections).length,
      lastVote: game.lastVote ? { ...game.lastVote, teamIds: [...game.lastVote.teamIds], votes: { ...game.lastVote.votes } } : null,
      voteHistory: game.voteHistory.map((vote) => ({
        ...vote,
        teamIds: [...vote.teamIds],
        votes: { ...vote.votes },
      })),
      missions: game.missions.map(({ failPlayerIds, ...mission }) => ({
        ...mission,
        teamIds: [...mission.teamIds],
        ...(game.phase === 'finished' && failPlayerIds !== undefined
          ? { failPlayerIds: [...failPlayerIds] }
          : {}),
      })),
      lakeHolderId: game.lakeHolderId,
      lakeVisitedIds: [...game.lakeVisitedIds],
      winner: game.winner,
      endReason: game.endReason,
      departedPlayerId: game.departedPlayerId,
      roles: game.phase === 'finished' ? { ...game.roles } : null,
      assassinationTargetId: game.assassinationTargetId,
      assassinationHit: game.assassinationHit,
    }
  },
}
