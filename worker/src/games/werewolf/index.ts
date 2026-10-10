import {
  DEFAULT_WEREWOLF_SETTINGS,
  WEREWOLF_HUNTER_SHOT_MS,
  WEREWOLF_PRIVATE_EVENT,
  WEREWOLF_ROLE_REVEAL_MS,
  WEREWOLF_ROLES,
  isWerewolfSettings,
  isWerewolfWinCondition,
  type WerewolfCamp,
  type WerewolfPrivateState,
  type WerewolfRoleCounts,
  type WerewolfRoleId,
  type WerewolfPublicEvent,
  type WerewolfReplayEvent,
  type WerewolfReview,
  type WerewolfSettings,
  type WerewolfView,
} from '../../../../shared/games/werewolf'
import type { GameActionResult, GameModule, GameRoomContext, GameStartOptions } from '../types'
import { aliveIds, isAlive, isTargetId, shuffle } from './helpers'
import { getRole } from './roles'
import { getScript } from './scripts'
import type { DeathCause, NightState, StoredWerewolf } from './types'

const WIN_SCORE = 100
const MAX_CATCH_UP_STEPS = 24

function countRoles(roles: Record<string, WerewolfRoleId>): WerewolfRoleCounts {
  const counts: WerewolfRoleCounts = {
    werewolf: 0,
    wolfKing: 0,
    villager: 0,
    seer: 0,
    witch: 0,
    hunter: 0,
    guard: 0,
  }
  for (const roleId of Object.values(roles)) {
    counts[roleId] += 1
  }
  return counts
}

function replayLog(game: StoredWerewolf): WerewolfReplayEvent[] {
  if (!Array.isArray(game.replay)) {
    game.replay = []
  }
  return game.replay
}

function recordReplayEvent(game: StoredWerewolf, event: WerewolfReplayEvent): void {
  replayLog(game).push(event)
}

function publicHistoryFor(game: StoredWerewolf): WerewolfPublicEvent[] {
  const history: WerewolfPublicEvent[] = []
  for (const event of replayLog(game)) {
    switch (event.type) {
      case 'night-death':
        history.push({ type: event.type, day: event.day, playerId: event.playerId })
        break
      case 'night-peace':
      case 'day-vote':
      case 'vote-result':
      case 'hunter-shot':
      case 'player-left':
      case 'game-end':
        history.push({ ...event })
        break
      default:
        break
    }
  }
  return history
}

function playerWithRole(game: StoredWerewolf, roleId: WerewolfRoleId): string | null {
  return game.playerIds.find((playerId) => game.roles[playerId] === roleId) ?? null
}

function recordNightChoices(game: StoredWerewolf, roleIds: WerewolfRoleId[]): void {
  if (roleIds.includes('werewolf') || roleIds.includes('wolfKing')) {
    for (const playerId of game.playerIds) {
      const targetId = game.night.wolfPicks[playerId]
      if (targetId !== undefined) {
        recordReplayEvent(game, { type: 'wolf-choice', day: game.day, playerId, targetId })
      }
    }
    recordReplayEvent(game, {
      type: 'wolf-attack',
      day: game.day,
      targetId: game.night.wolfVictimId,
    })
  }

  if (roleIds.includes('seer') && game.night.seerTargetId !== null) {
    const playerId = playerWithRole(game, 'seer')
    const targetRole = game.roles[game.night.seerTargetId]
    if (playerId !== null && targetRole) {
      recordReplayEvent(game, {
        type: 'seer-check',
        day: game.day,
        playerId,
        targetId: game.night.seerTargetId,
        camp: WEREWOLF_ROLES[targetRole].camp,
      })
    }
  }

  if (roleIds.includes('guard')) {
    const playerId = playerWithRole(game, 'guard')
    if (
      playerId !== null &&
      (game.night.guardTargetId !== null || isAlive(game, playerId))
    ) {
      recordReplayEvent(game, {
        type: 'guard-protect',
        day: game.day,
        playerId,
        targetId: game.night.guardTargetId,
      })
    }
  }

  if (roleIds.includes('witch')) {
    const playerId = playerWithRole(game, 'witch')
    if (playerId !== null && game.night.witchSave && game.night.wolfVictimId !== null) {
      recordReplayEvent(game, {
        type: 'witch-save',
        day: game.day,
        playerId,
        targetId: game.night.wolfVictimId,
      })
    }
    if (playerId !== null && game.night.witchPoisonId !== null) {
      recordReplayEvent(game, {
        type: 'witch-poison',
        day: game.day,
        playerId,
        targetId: game.night.witchPoisonId,
      })
    }
  }
}

function reviewFor(room: GameRoomContext, game: StoredWerewolf): WerewolfReview | null {
  if (game.phase !== 'finished') {
    return null
  }

  if (!game.playerNames) {
    game.playerNames = Object.fromEntries(room.players.map((player) => [player.id, player.name]))
  }

  return {
    events: replayLog(game).map((event) => ({ ...event })),
    playerNames: { ...game.playerNames },
  }
}

function failure(code: string, message: string, changed = false): GameActionResult {
  return { ok: false, code, message, changed }
}

function emptyNight(): NightState {
  return {
    wolfPicks: {},
    wolfVictimId: null,
    seerTargetId: null,
    guardTargetId: null,
    witchSave: false,
    witchPoisonId: null,
  }
}

function currentSettings(room: GameRoomContext): WerewolfSettings {
  const settings = { ...DEFAULT_WEREWOLF_SETTINGS, ...(room.gameSettings ?? {}) }
  return isWerewolfSettings(settings) ? settings : { ...DEFAULT_WEREWOLF_SETTINGS }
}

function ensureStoredGameDefaults(game: StoredWerewolf): void {
  if (!game.voteSelections) {
    game.voteSelections = { ...game.votes }
  }

  if (!isWerewolfWinCondition(game.settings.winCondition)) {
    game.settings.winCondition = DEFAULT_WEREWOLF_SETTINGS.winCondition
  }

  const announcementSeconds = game.settings.announcementSeconds
  if (
    !Number.isInteger(announcementSeconds) ||
    announcementSeconds < 5 ||
    announcementSeconds > 60
  ) {
    game.settings.announcementSeconds = DEFAULT_WEREWOLF_SETTINGS.announcementSeconds
  }
}

function activeGame(room: GameRoomContext): StoredWerewolf | null {
  if (room.status !== 'playing' || room.game?.gameId !== 'werewolf') {
    return null
  }

  ensureStoredGameDefaults(room.game)
  return room.game
}

function killPlayer(game: StoredWerewolf, playerId: string, cause: DeathCause): void {
  const roleId = game.roles[playerId]
  if (!isAlive(game, playerId) || !roleId) {
    return
  }

  game.alive[playerId] = false
  if (getRole(roleId).triggersShotOnDeath?.(cause) && game.pendingShooterId === null) {
    game.pendingShooterId = playerId
  }
}

function beginNight(game: StoredWerewolf, now: number): void {
  game.day += 1
  game.phase = 'night'
  game.nightStep = 0
  game.night = emptyNight()
  game.votes = {}
  game.voteSelections = {}
  game.pkCandidateIds = []
  game.exiledId = null
  game.lastDeathIds = []
  game.hunterShot = null
  game.phaseEndsAt = now + game.settings.nightStepSeconds * 1_000
}

function finishGame(room: GameRoomContext, game: StoredWerewolf, winner: WerewolfCamp): void {
  game.winner = winner
  game.phase = 'finished'
  game.phaseEndsAt = 0
  game.pendingShooterId = null
  room.status = 'finished'
  recordReplayEvent(game, { type: 'game-end', day: game.day, winner })

  for (const player of room.players) {
    const roleId = game.roles[player.id]
    if (roleId && WEREWOLF_ROLES[roleId].camp === winner) {
      player.score += WIN_SCORE
    }
  }
}

function wolvesOutnumberGood(game: StoredWerewolf): boolean {
  let wolfCount = 0
  let goodCount = 0
  for (const playerId of aliveIds(game)) {
    if (WEREWOLF_ROLES[game.roles[playerId]!].camp === 'wolf') {
      wolfCount += 1
    } else {
      goodCount += 1
    }
  }
  return wolfCount > goodCount
}

function finishBeforeVoting(room: GameRoomContext, game: StoredWerewolf): boolean {
  const winner =
    getScript(game.scriptId).checkWin(game) ??
    (wolvesOutnumberGood(game) ? 'wolf' : null)
  if (!winner) {
    return false
  }

  finishGame(room, game, winner)
  return true
}

function proceedAfterDeaths(
  room: GameRoomContext,
  game: StoredWerewolf,
  now: number,
  next: 'day-discussion' | 'night',
): void {
  game.pkCandidateIds = []
  if (game.pendingShooterId !== null) {
    game.phase = 'hunter-shot'
    game.afterHunter = next
    game.phaseEndsAt = now + WEREWOLF_HUNTER_SHOT_MS
    return
  }

  const winner = getScript(game.scriptId).checkWin(game)
  if (winner) {
    finishGame(room, game, winner)
    return
  }

  if (next === 'night') {
    beginNight(game, now)
    return
  }

  enterDiscussion(game, now)
}

function enterDiscussion(game: StoredWerewolf, now: number): void {
  game.phase = 'day-discussion'
  game.pkCandidateIds = []
  if (game.settings.speechMode) {
    game.speechOrder = shuffle(aliveIds(game))
    game.speakerIndex = 0
    game.phaseEndsAt = now + game.settings.speechSeconds * 1_000
  } else {
    game.speechOrder = []
    game.speakerIndex = 0
    game.phaseEndsAt = now + game.settings.discussionSeconds * 1_000
  }
}

function nextSpeaker(room: GameRoomContext, game: StoredWerewolf, now: number): void {
  let index = game.speakerIndex + 1
  while (index < game.speechOrder.length && !isAlive(game, game.speechOrder[index]!)) {
    index += 1
  }

  if (index >= game.speechOrder.length) {
    if (game.phase === 'pk-discussion') {
      enterPkVote(room, game, now)
    } else {
      enterVote(room, game, now)
    }
    return
  }

  game.speakerIndex = index
  const seconds = game.phase === 'pk-discussion'
    ? game.settings.speechSeconds / 2
    : game.settings.speechSeconds
  game.phaseEndsAt = now + seconds * 1_000
}

function currentSpeakerId(game: StoredWerewolf): string | null {
  const speakingPhase =
    (game.phase === 'day-discussion' && game.settings.speechMode) ||
    game.phase === 'pk-discussion'
  return speakingPhase
    ? (game.speechOrder[game.speakerIndex] ?? null)
    : null
}

function validateVoteTarget(
  game: StoredWerewolf,
  playerId: string,
  targetId: unknown,
  isPkVote: boolean,
): { targetId: string | null } | { message: string } {
  if (!isTargetId(targetId)) {
    return { message: '投票目標格式不正確。' }
  }
  if (targetId !== null && (!isAlive(game, targetId) || targetId === playerId)) {
    return { message: '請選擇一位存活的其他玩家，或選擇棄票。' }
  }
  if (isPkVote && targetId !== null && !(game.pkCandidateIds ?? []).includes(targetId)) {
    return { message: 'PK 投票只能選擇同票候選人。' }
  }
  return { targetId }
}

function resolveHunterShot(game: StoredWerewolf, targetId: string | null, now: number): void {
  const shooterId = game.pendingShooterId
  if (shooterId === null) {
    return
  }

  recordReplayEvent(game, {
    type: 'hunter-shot',
    day: game.day,
    playerId: shooterId,
    roleId: game.roles[shooterId]!,
    targetId,
  })
  game.pendingShooterId = null
  game.hunterShot = { shooterId, roleId: game.roles[shooterId]!, targetId }
  if (targetId !== null) {
    killPlayer(game, targetId, 'shot')
  }
  game.phaseEndsAt = now + game.settings.announcementSeconds * 1_000
}

function endNightStep(game: StoredWerewolf, now: number): void {
  const script = getScript(game.scriptId)
  const roles = script.nightSteps[game.nightStep] ?? []
  for (const roleId of roles) {
    getRole(roleId).nightAction?.onStepEnd?.(game)
  }
  recordNightChoices(game, roles)

  if (game.nightStep + 1 < script.nightSteps.length) {
    game.nightStep += 1
    game.phaseEndsAt = now + game.settings.nightStepSeconds * 1_000
    return
  }

  game.lastDeathIds = []
  for (const death of script.resolveNight(game)) {
    if (isAlive(game, death.playerId)) {
      killPlayer(game, death.playerId, death.cause)
      game.lastDeathIds.push(death.playerId)
      if (death.cause === 'wolf' || death.cause === 'poison') {
        recordReplayEvent(game, {
          type: 'night-death',
          day: game.day,
          playerId: death.playerId,
          cause: death.cause,
        })
      }
    }
  }
  if (game.lastDeathIds.length === 0) {
    recordReplayEvent(game, { type: 'night-peace', day: game.day })
  }
  game.phase = 'dawn'
  game.phaseEndsAt = now + game.settings.announcementSeconds * 1_000
}

function enterVote(room: GameRoomContext, game: StoredWerewolf, now: number): void {
  if (finishBeforeVoting(room, game)) {
    return
  }

  game.phase = 'vote'
  game.votes = {}
  game.voteSelections = {}
  game.pkCandidateIds = []
  game.speechOrder = []
  game.speakerIndex = 0
  game.phaseEndsAt = now + game.settings.voteSeconds * 1_000
}

function enterPkDiscussion(game: StoredWerewolf, tiedIds: string[], now: number): void {
  const tiedSet = new Set(tiedIds)
  game.pkCandidateIds = game.playerIds.filter((playerId) => tiedSet.has(playerId) && isAlive(game, playerId))
  game.votes = {}
  game.voteSelections = {}
  game.phase = 'pk-discussion'
  game.speechOrder = [...game.pkCandidateIds]
  game.speakerIndex = 0
  game.phaseEndsAt = now + game.settings.speechSeconds * 500
}

function enterPkVote(room: GameRoomContext, game: StoredWerewolf, now: number): void {
  if (finishBeforeVoting(room, game)) {
    return
  }

  game.pkCandidateIds = game.playerIds.filter(
    (playerId) => (game.pkCandidateIds ?? []).includes(playerId) && isAlive(game, playerId),
  )
  game.speechOrder = []
  game.speakerIndex = 0
  game.votes = {}
  game.voteSelections = {}

  if (game.pkCandidateIds.length === 0) {
    game.phase = 'vote-result'
    game.exiledId = null
    game.lastDeathIds = []
    game.phaseEndsAt = now + game.settings.announcementSeconds * 1_000
    return
  }

  game.phase = 'pk-vote'
  game.phaseEndsAt = now + game.settings.voteSeconds * 1_000
}

function tallyVotes(game: StoredWerewolf, now: number, useUnconfirmedSelections = false): void {
  const isPkVote = game.phase === 'pk-vote'
  const pkCandidates = new Set(game.pkCandidateIds ?? [])
  if (useUnconfirmedSelections) {
    for (const playerId of game.playerIds) {
      if (isAlive(game, playerId)) {
        game.votes[playerId] = game.voteSelections[playerId] ?? null
      }
    }
  }

  for (const [playerId, targetId] of Object.entries(game.votes)) {
    recordReplayEvent(game, {
      type: 'day-vote',
      day: game.day,
      playerId,
      targetId,
      ...(isPkVote ? { round: 'pk' } : {}),
    })
  }

  const counts = new Map<string, number>()
  for (const [voterId, targetId] of Object.entries(game.votes)) {
    if (
      targetId !== null &&
      isAlive(game, voterId) &&
      isAlive(game, targetId) &&
      (!isPkVote || pkCandidates.has(targetId))
    ) {
      counts.set(targetId, (counts.get(targetId) ?? 0) + 1)
    }
  }

  const highest = Math.max(0, ...counts.values())
  const leaders = [...counts.entries()].filter(([, count]) => count === highest && highest > 0)
  game.exiledId = leaders.length === 1 ? leaders[0]![0] : null
  if (game.exiledId !== null) {
    recordReplayEvent(game, {
      type: 'vote-result',
      day: game.day,
      targetId: game.exiledId,
      result: 'exiled',
      ...(isPkVote ? { round: 'pk' } : {}),
    })
  } else {
    recordReplayEvent(game, {
      type: 'vote-result',
      day: game.day,
      targetId: null,
      result: highest > 0 ? 'tie' : 'no-votes',
      ...(isPkVote ? { round: 'pk' } : {}),
    })
  }
  game.lastDeathIds = []
  if (game.exiledId !== null) {
    killPlayer(game, game.exiledId, 'vote')
    game.lastDeathIds.push(game.exiledId)
  }

  if (!isPkVote && highest > 0 && leaders.length > 1) {
    enterPkDiscussion(game, leaders.map(([playerId]) => playerId), now)
    return
  }

  game.phase = 'vote-result'
  game.phaseEndsAt = now + game.settings.announcementSeconds * 1_000
}

function everyOnlineAliveVoted(room: GameRoomContext, game: StoredWerewolf): boolean {
  const voters = room.players.filter((player) => player.online && isAlive(game, player.id))
  return voters.length > 0 && voters.every((player) => player.id in game.votes)
}

function advancePhase(room: GameRoomContext, game: StoredWerewolf, now: number): void {
  switch (game.phase) {
    case 'role-reveal':
      beginNight(game, now)
      return
    case 'night':
      endNightStep(game, now)
      return
    case 'dawn':
      proceedAfterDeaths(room, game, now, 'day-discussion')
      return
    case 'hunter-shot':
      if (game.pendingShooterId !== null) {
        resolveHunterShot(game, null, now)
      } else {
        proceedAfterDeaths(room, game, now, game.afterHunter)
      }
      return
    case 'day-discussion':
      if (game.settings.speechMode) {
        nextSpeaker(room, game, now)
      } else {
        enterVote(room, game, now)
      }
      return
    case 'vote':
    case 'pk-vote':
      tallyVotes(game, now, true)
      return
    case 'pk-discussion':
      nextSpeaker(room, game, now)
      return
    case 'vote-result':
      proceedAfterDeaths(room, game, now, 'night')
      return
    case 'finished':
      return
  }
}

function advanceExpired(room: GameRoomContext, game: StoredWerewolf, now: number): boolean {
  let changed = false
  for (let step = 0; step < MAX_CATCH_UP_STEPS; step += 1) {
    if (game.phase === 'finished' || game.phaseEndsAt > now) {
      break
    }
    // 補跑逾時階段時，以該階段的期限而非目前時間起算下一階段，避免 alarm 延遲吃掉玩家的時間。
    advancePhase(room, game, Math.min(now, game.phaseEndsAt))
    changed = true
  }
  return changed
}

function dispatchAction(
  room: GameRoomContext,
  playerId: string,
  action: string,
  payload: Record<string, unknown>,
  now: number,
): GameActionResult {
  const game = activeGame(room)
  if (!game) {
    return failure('GAME_NOT_STARTED', '狼人殺尚未開始。')
  }
  if (!game.playerIds.includes(playerId)) {
    return failure('NOT_IN_GAME', '你不在這局遊戲中。')
  }

  if (advanceExpired(room, game, now)) {
    return failure('PHASE_EXPIRED', '本階段時間已到。', true)
  }

  const roleId = game.roles[playerId]!
  const role = getRole(roleId)
  if (role.nightAction && role.nightAction.action === action) {
    if (game.phase !== 'night') {
      return failure('NOT_NIGHT', '現在不是夜晚。')
    }
    if (!isAlive(game, playerId)) {
      return failure('PLAYER_DEAD', '你已經死亡，不能行動。')
    }
    if (!getScript(game.scriptId).nightSteps[game.nightStep]?.includes(roleId)) {
      return failure('NOT_YOUR_TURN', '還沒輪到你行動。')
    }

    const result = role.nightAction.handle(game, playerId, payload)
    return result.ok
      ? { ok: true, changed: true }
      : failure('INVALID_NIGHT_ACTION', result.message)
  }

  switch (action) {
    case 'hunter_shoot': {
      if (game.phase !== 'hunter-shot' || game.pendingShooterId !== playerId) {
        return failure('CANNOT_SHOOT', '現在不能開槍。')
      }

      const targetId = payload.targetId
      if (!isTargetId(targetId)) {
        return failure('INVALID_TARGET', '開槍目標格式不正確。')
      }
      if (targetId !== null && (!isAlive(game, targetId) || targetId === playerId)) {
        return failure('INVALID_TARGET', '請選擇一位存活的其他玩家。')
      }

      resolveHunterShot(game, targetId, now)
      return { ok: true, changed: true }
    }
    case 'end_speech': {
      const speakerId = currentSpeakerId(game)
      if (speakerId === null) {
        return failure('NOT_SPEECH_TURN', '現在不是輪流發言階段。')
      }
      if (playerId !== speakerId && playerId !== room.hostId) {
        return failure('NOT_SPEAKER', '只有發言者或房主可以結束這段發言。')
      }

      nextSpeaker(room, game, now)
      return { ok: true, changed: true }
    }
    case 'end_discussion': {
      if (playerId !== room.hostId) {
        return failure('HOST_ONLY', '只有房主可以提早結束討論。')
      }
      if (game.phase !== 'day-discussion') {
        return failure('NOT_DISCUSSING', '現在不是討論階段。')
      }

      enterVote(room, game, now)
      return { ok: true, changed: true }
    }
    case 'end_announcement': {
      if (playerId !== room.hostId) {
        return failure('HOST_ONLY', '只有房主可以提早結束結果公告。')
      }

      switch (game.phase) {
        case 'dawn':
          proceedAfterDeaths(room, game, now, 'day-discussion')
          break
        case 'vote-result':
          proceedAfterDeaths(room, game, now, 'night')
          break
        case 'hunter-shot':
          if (game.pendingShooterId !== null) {
            return failure('INVALID_PHASE', '獵人尚未完成開槍。')
          }
          proceedAfterDeaths(room, game, now, game.afterHunter)
          break
        default:
          return failure('INVALID_PHASE', '現在不是結果公告階段。')
      }

      return { ok: true, changed: true }
    }
    case 'select_vote':
    case 'cast_vote': {
      const isPkVote = game.phase === 'pk-vote'
      if (game.phase !== 'vote' && !isPkVote) {
        return failure('VOTING_CLOSED', '現在不是投票階段。')
      }
      if (!isAlive(game, playerId)) {
        return failure('PLAYER_DEAD', '你已經死亡，不能投票。')
      }

      const validation = validateVoteTarget(game, playerId, payload.targetId, isPkVote)
      if ('message' in validation) {
        return failure('INVALID_TARGET', validation.message)
      }

      const targetId = validation.targetId
      if (action === 'select_vote') {
        if (targetId === null) {
          return failure('INVALID_TARGET', '投票選擇需為一位存活的其他玩家。')
        }
        if (game.voteSelections[playerId] === targetId) {
          return { ok: true, changed: false }
        }
        game.voteSelections[playerId] = targetId
        return { ok: true, changed: true }
      }

      game.votes[playerId] = targetId
      game.voteSelections[playerId] = targetId
      if (everyOnlineAliveVoted(room, game)) {
        tallyVotes(game, now)
      }
      return { ok: true, changed: true }
    }
    default:
      return failure('UNKNOWN_GAME_ACTION', '狼人殺不支援這個操作。')
  }
}

function bumpVersion(room: GameRoomContext): void {
  if (room.game?.gameId === 'werewolf') {
    room.game.stateVersion += 1
  }
}

function buildPrivateState(game: StoredWerewolf, playerId: string): WerewolfPrivateState | null {
  const roleId = game.roles[playerId]
  if (!roleId) {
    return null
  }

  const role = getRole(roleId)
  const alive = isAlive(game, playerId)
  const acting =
    game.phase === 'night' &&
    alive &&
    role.nightAction !== undefined &&
    (getScript(game.scriptId).nightSteps[game.nightStep]?.includes(roleId) ?? false)
  const voting = game.phase === 'vote' || game.phase === 'pk-vote'
  const voteSelection = playerId in game.voteSelections
    ? game.voteSelections[playerId]!
    : (game.votes[playerId] ?? null)

  return {
    stateVersion: game.stateVersion,
    role: roleId,
    camp: role.camp,
    alive,
    acting,
    teammates: [],
    wolfPicks: {},
    myTarget: null,
    seerResults: [],
    witch: null,
    guard: null,
    canShoot: game.phase === 'hunter-shot' && game.pendingShooterId === playerId,
    myVote: voting ? (game.votes[playerId] ?? null) : null,
    voteSelection: voting ? voteSelection : null,
    hasVoted: voting && playerId in game.votes,
    ...role.privateState?.(game, playerId, acting),
  }
}

export const werewolfGame: GameModule = {
  id: 'werewolf',
  pushPrivateState: true,
  defaultSettings: () => ({ ...DEFAULT_WEREWOLF_SETTINGS }),
  configure(room, _playerId, settings) {
    if (!isWerewolfSettings(settings)) {
      return failure(
        'INVALID_GAME_SETTINGS',
        '勝利條件需為屠城或屠邊；討論時間需為 30–600 秒、每人發言需為 10–180 秒、投票時間需為 15–180 秒、夜間每步驟需為 10–60 秒、結果公告需為 5–60 秒。',
      )
    }

    const current = currentSettings(room)
    if (
      current.scriptId === settings.scriptId &&
      current.winCondition === settings.winCondition &&
      current.discussionSeconds === settings.discussionSeconds &&
      current.speechMode === settings.speechMode &&
      current.speechSeconds === settings.speechSeconds &&
      current.voteSeconds === settings.voteSeconds &&
      current.nightStepSeconds === settings.nightStepSeconds &&
      current.announcementSeconds === settings.announcementSeconds
    ) {
      return { ok: true, changed: false }
    }

    room.gameSettings = { ...settings }
    return { ok: true, changed: true }
  },
  publicSettings: (room) => ({ ...currentSettings(room) }),
  privateState(room, playerId) {
    const game = room.game
    if (game?.gameId !== 'werewolf') {
      return null
    }

    ensureStoredGameDefaults(game)
    const state = buildPrivateState(game, playerId)
    return state ? { name: WEREWOLF_PRIVATE_EVENT, payload: { ...state } } : null
  },
  start(room, now, options?: GameStartOptions) {
    const settings = currentSettings(room)
    const script = getScript(settings.scriptId)
    const playerIds = room.players.map((player) => player.id)
    const roleList = shuffle(script.roleSetup(playerIds.length))
    if (options?.devWerewolfRole) {
      const hostIndex = playerIds.indexOf(room.hostId)
      if (hostIndex < 0) {
        throw new Error('Cannot assign a development role because the host is not in the room.')
      }

      if (roleList[hostIndex] !== options.devWerewolfRole) {
        const roleIndex = roleList.findIndex(
          (roleId, index) => index !== hostIndex && roleId === options.devWerewolfRole,
        )
        if (roleIndex < 0) {
          throw new Error(`Development role ${options.devWerewolfRole} is not in the selected script.`)
        }
        const previousRole = roleList[hostIndex]!
        roleList[hostIndex] = roleList[roleIndex]!
        roleList[roleIndex] = previousRole
      }
    }

    const game: StoredWerewolf = {
      gameId: 'werewolf',
      settings,
      scriptId: settings.scriptId,
      playerIds,
      playerNames: Object.fromEntries(room.players.map((player) => [player.id, player.name])),
      roles: Object.fromEntries(playerIds.map((playerId, index) => [playerId, roleList[index]!])),
      alive: Object.fromEntries(playerIds.map((playerId) => [playerId, true])),
      phase: 'role-reveal',
      day: 0,
      nightStep: 0,
      phaseEndsAt: now + WEREWOLF_ROLE_REVEAL_MS,
      stateVersion: 1,
      night: emptyNight(),
      witchPotions: { antidote: true, poison: true },
      seerResults: [],
      votes: {},
      voteSelections: {},
      pkCandidateIds: [],
      lastDeathIds: [],
      exiledId: null,
      pendingShooterId: null,
      afterHunter: 'day-discussion',
      lastGuardTargetId: null,
      speechOrder: [],
      speakerIndex: 0,
      hunterShot: null,
      winner: null,
      replay: [],
    }
    room.status = 'playing'
    room.game = game
  },
  handleAction(room, playerId, action, payload, now) {
    const result = dispatchAction(room, playerId, action, payload, now)
    if (result.changed) {
      bumpVersion(room)
    }
    return result
  },
  nextAlarmAt(room) {
    const game = activeGame(room)
    return game && game.phase !== 'finished' ? game.phaseEndsAt : null
  },
  handleAlarm(room, now) {
    const game = activeGame(room)
    if (!game || !advanceExpired(room, game, now)) {
      return false
    }

    bumpVersion(room)
    return true
  },
  onPlayerLeave(room, playerId, now) {
    const game = activeGame(room)
    if (!game || !game.playerIds.includes(playerId)) {
      return false
    }

    let changed = false
    if (isAlive(game, playerId)) {
      const wasSpeaking = currentSpeakerId(game) === playerId
      recordReplayEvent(game, { type: 'player-left', day: game.day, playerId })
      killPlayer(game, playerId, 'left')
      if (wasSpeaking) {
        nextSpeaker(room, game, now)
      }
      delete game.night.wolfPicks[playerId]
      delete game.votes[playerId]
      delete game.voteSelections[playerId]
      changed = true
    }

    if (game.pendingShooterId === playerId) {
      game.pendingShooterId = null
      changed = true
      if (game.phase === 'hunter-shot') {
        proceedAfterDeaths(room, game, now, game.afterHunter)
      }
    }

    if (!changed) {
      return false
    }

    const winner = game.phase === 'finished' ? null : getScript(game.scriptId).checkWin(game)
    if (winner) {
      finishGame(room, game, winner)
    } else if (
      (game.phase === 'vote' || game.phase === 'pk-vote') &&
      Object.keys(game.votes).length > 0 &&
      everyOnlineAliveVoted(room, game)
    ) {
      tallyVotes(game, now)
    }

    bumpVersion(room)
    return true
  },
  playerFlags(room, playerId) {
    const game = room.game
    const answered =
      game?.gameId === 'werewolf' &&
      (game.phase === 'vote' || game.phase === 'pk-vote') &&
      isAlive(game, playerId) &&
      playerId in game.votes
    return { answered, correct: false }
  },
  toView(room): WerewolfView | null {
    const game = room.game
    if (game?.gameId !== 'werewolf') {
      return null
    }

    ensureStoredGameDefaults(game)
    return {
      gameId: 'werewolf',
      phase: game.phase,
      day: game.day,
      nightStep: game.nightStep,
      nightStepCount: getScript(game.scriptId).nightSteps.length,
      phaseEndsAt: game.phaseEndsAt,
      stateVersion: game.stateVersion,
      settings: { ...game.settings },
      roleCounts: countRoles(game.roles),
      seatIds: [...game.playerIds],
      aliveIds: aliveIds(game),
      lastDeathIds: [...game.lastDeathIds],
      exiledId: game.exiledId,
      votes: game.phase === 'vote-result' ? { ...game.votes } : null,
      votedIds:
        (game.phase === 'vote' || game.phase === 'pk-vote') ? Object.keys(game.votes) : [],
      pkCandidateIds: [...(game.pkCandidateIds ?? [])],
      shooterId: game.pendingShooterId ?? game.hunterShot?.shooterId ?? null,
      shooterRoleId: game.pendingShooterId
        ? (game.roles[game.pendingShooterId] ?? null)
        : (game.hunterShot?.roleId ?? null),
      hunterShot: game.hunterShot ? { ...game.hunterShot } : null,
      speech:
        ((game.phase === 'day-discussion' && game.settings.speechMode) ||
          game.phase === 'pk-discussion')
          ? { order: [...game.speechOrder], index: game.speakerIndex }
          : null,
      winner: game.winner,
      roles: game.phase === 'finished' ? { ...game.roles } : null,
      publicHistory: publicHistoryFor(game),
      review: reviewFor(room, game),
    }
  },
}
