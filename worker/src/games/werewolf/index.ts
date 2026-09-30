import {
  DEFAULT_WEREWOLF_SETTINGS,
  WEREWOLF_PRIVATE_EVENT,
  WEREWOLF_ROLES,
  isWerewolfSettings,
  type WerewolfCamp,
  type WerewolfPrivateState,
  type WerewolfSettings,
  type WerewolfView,
} from '../../../../shared/games/werewolf'
import type { GameActionResult, GameModule, GameRoomContext } from '../types'
import { aliveIds, isAlive, isTargetId, shuffle } from './helpers'
import { getRole } from './roles'
import { getScript } from './scripts'
import type { DeathCause, NightState, StoredWerewolf } from './types'

const ROLE_REVEAL_MS = 12_000
const DAWN_MS = 6_000
const HUNTER_SHOT_MS = 20_000
const HUNTER_RESULT_MS = 4_000
const VOTE_RESULT_MS = 6_000
const WIN_SCORE = 100
const MAX_CATCH_UP_STEPS = 24

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
  return isWerewolfSettings(room.gameSettings)
    ? { ...room.gameSettings }
    : { ...DEFAULT_WEREWOLF_SETTINGS }
}

function activeGame(room: GameRoomContext): StoredWerewolf | null {
  return room.status === 'playing' && room.game?.gameId === 'werewolf' ? room.game : null
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

  for (const player of room.players) {
    const roleId = game.roles[player.id]
    if (roleId && WEREWOLF_ROLES[roleId].camp === winner) {
      player.score += WIN_SCORE
    }
  }
}

function proceedAfterDeaths(
  room: GameRoomContext,
  game: StoredWerewolf,
  now: number,
  next: 'day-discussion' | 'night',
): void {
  if (game.pendingShooterId !== null) {
    game.phase = 'hunter-shot'
    game.afterHunter = next
    game.phaseEndsAt = now + HUNTER_SHOT_MS
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

function nextSpeaker(game: StoredWerewolf, now: number): void {
  let index = game.speakerIndex + 1
  while (index < game.speechOrder.length && !isAlive(game, game.speechOrder[index]!)) {
    index += 1
  }

  if (index >= game.speechOrder.length) {
    enterVote(game, now)
    return
  }

  game.speakerIndex = index
  game.phaseEndsAt = now + game.settings.speechSeconds * 1_000
}

function currentSpeakerId(game: StoredWerewolf): string | null {
  return game.phase === 'day-discussion' && game.settings.speechMode
    ? (game.speechOrder[game.speakerIndex] ?? null)
    : null
}

function resolveHunterShot(game: StoredWerewolf, targetId: string | null, now: number): void {
  const shooterId = game.pendingShooterId
  if (shooterId === null) {
    return
  }

  game.pendingShooterId = null
  game.hunterShot = { shooterId, roleId: game.roles[shooterId]!, targetId }
  if (targetId !== null) {
    killPlayer(game, targetId, 'shot')
  }
  game.phaseEndsAt = now + HUNTER_RESULT_MS
}

function endNightStep(game: StoredWerewolf, now: number): void {
  const script = getScript(game.scriptId)
  for (const roleId of script.nightSteps[game.nightStep] ?? []) {
    getRole(roleId).nightAction?.onStepEnd?.(game)
  }

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
    }
  }
  game.phase = 'dawn'
  game.phaseEndsAt = now + DAWN_MS
}

function enterVote(game: StoredWerewolf, now: number): void {
  game.phase = 'vote'
  game.votes = {}
  game.phaseEndsAt = now + game.settings.voteSeconds * 1_000
}

function tallyVotes(game: StoredWerewolf, now: number): void {
  const counts = new Map<string, number>()
  for (const [voterId, targetId] of Object.entries(game.votes)) {
    if (targetId !== null && isAlive(game, voterId) && isAlive(game, targetId)) {
      counts.set(targetId, (counts.get(targetId) ?? 0) + 1)
    }
  }

  const highest = Math.max(0, ...counts.values())
  const leaders = [...counts.entries()].filter(([, count]) => count === highest && highest > 0)
  game.exiledId = leaders.length === 1 ? leaders[0]![0] : null
  game.lastDeathIds = []
  if (game.exiledId !== null) {
    killPlayer(game, game.exiledId, 'vote')
    game.lastDeathIds.push(game.exiledId)
  }

  game.phase = 'vote-result'
  game.phaseEndsAt = now + VOTE_RESULT_MS
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
        nextSpeaker(game, now)
      } else {
        enterVote(game, now)
      }
      return
    case 'vote':
      tallyVotes(game, now)
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

      nextSpeaker(game, now)
      return { ok: true, changed: true }
    }
    case 'end_discussion': {
      if (playerId !== room.hostId) {
        return failure('HOST_ONLY', '只有房主可以提早結束討論。')
      }
      if (game.phase !== 'day-discussion') {
        return failure('NOT_DISCUSSING', '現在不是討論階段。')
      }

      enterVote(game, now)
      return { ok: true, changed: true }
    }
    case 'cast_vote': {
      if (game.phase !== 'vote') {
        return failure('VOTING_CLOSED', '現在不是投票階段。')
      }
      if (!isAlive(game, playerId)) {
        return failure('PLAYER_DEAD', '你已經死亡，不能投票。')
      }

      const targetId = payload.targetId
      if (!isTargetId(targetId)) {
        return failure('INVALID_TARGET', '投票目標格式不正確。')
      }
      if (targetId !== null && (!isAlive(game, targetId) || targetId === playerId)) {
        return failure('INVALID_TARGET', '請選擇一位存活的其他玩家，或選擇棄票。')
      }

      game.votes[playerId] = targetId
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
    myVote: game.phase === 'vote' ? (game.votes[playerId] ?? null) : null,
    hasVoted: game.phase === 'vote' && playerId in game.votes,
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
        '討論時間需為 30–600 秒、每人發言需為 10–180 秒、投票時間需為 15–180 秒、夜間每步驟需為 10–60 秒。',
      )
    }

    const current = currentSettings(room)
    if (
      current.scriptId === settings.scriptId &&
      current.discussionSeconds === settings.discussionSeconds &&
      current.speechMode === settings.speechMode &&
      current.speechSeconds === settings.speechSeconds &&
      current.voteSeconds === settings.voteSeconds &&
      current.nightStepSeconds === settings.nightStepSeconds
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

    const state = buildPrivateState(game, playerId)
    return state ? { name: WEREWOLF_PRIVATE_EVENT, payload: { ...state } } : null
  },
  start(room, now) {
    const settings = currentSettings(room)
    const script = getScript(settings.scriptId)
    const playerIds = room.players.map((player) => player.id)
    const roleList = shuffle(script.roleSetup(playerIds.length))

    const game: StoredWerewolf = {
      gameId: 'werewolf',
      settings,
      scriptId: settings.scriptId,
      playerIds,
      roles: Object.fromEntries(playerIds.map((playerId, index) => [playerId, roleList[index]!])),
      alive: Object.fromEntries(playerIds.map((playerId) => [playerId, true])),
      phase: 'role-reveal',
      day: 0,
      nightStep: 0,
      phaseEndsAt: now + ROLE_REVEAL_MS,
      stateVersion: 1,
      night: emptyNight(),
      witchPotions: { antidote: true, poison: true },
      seerResults: [],
      votes: {},
      lastDeathIds: [],
      exiledId: null,
      pendingShooterId: null,
      afterHunter: 'day-discussion',
      lastGuardTargetId: null,
      speechOrder: [],
      speakerIndex: 0,
      hunterShot: null,
      winner: null,
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
      killPlayer(game, playerId, 'left')
      if (wasSpeaking) {
        nextSpeaker(game, now)
      }
      delete game.night.wolfPicks[playerId]
      delete game.votes[playerId]
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
      game.phase === 'vote' &&
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
      game.phase === 'vote' &&
      isAlive(game, playerId) &&
      playerId in game.votes
    return { answered, correct: false }
  },
  toView(room): WerewolfView | null {
    const game = room.game
    if (game?.gameId !== 'werewolf') {
      return null
    }

    return {
      gameId: 'werewolf',
      phase: game.phase,
      day: game.day,
      nightStep: game.nightStep,
      nightStepCount: getScript(game.scriptId).nightSteps.length,
      phaseEndsAt: game.phaseEndsAt,
      stateVersion: game.stateVersion,
      settings: { ...game.settings },
      seatIds: [...game.playerIds],
      aliveIds: aliveIds(game),
      lastDeathIds: [...game.lastDeathIds],
      exiledId: game.exiledId,
      votes: game.phase === 'vote-result' ? { ...game.votes } : null,
      votedIds: game.phase === 'vote' ? Object.keys(game.votes) : [],
      shooterId: game.pendingShooterId ?? game.hunterShot?.shooterId ?? null,
      shooterRoleId: game.pendingShooterId
        ? (game.roles[game.pendingShooterId] ?? null)
        : (game.hunterShot?.roleId ?? null),
      hunterShot: game.hunterShot ? { ...game.hunterShot } : null,
      speech:
        game.phase === 'day-discussion' && game.settings.speechMode
          ? { order: [...game.speechOrder], index: game.speakerIndex }
          : null,
      winner: game.winner,
      roles: game.phase === 'finished' ? { ...game.roles } : null,
    }
  },
}
