import {
  DRAW_GUESS_PEN_COLORS,
  DRAW_GUESS_QUESTION_BANK,
  isDrawGuessQuestionCategory,
  isDrawGuessSettings,
  type DrawGuessPrompt,
  type DrawGuessSettings,
  type DrawGuessView,
} from '../../../../shared/games/draw-guess'
import type { GameActionResult, GameModule, GameRoomContext } from '../types'
import type { StoredDrawGuess } from './types'

const ANSWER_SETUP_MS = 30_000
const REVEAL_DURATION_MS = 3_000
const MAX_ANSWER_LENGTH = 60
const MAX_HINT_LENGTH = 100
const MAX_STROKE_POINTS = 24

const DEFAULT_SETTINGS: DrawGuessSettings = {
  drawTimeSeconds: 60,
  roundsPerPlayer: 1,
  guessTimeSeconds: 30,
  questionMode: 'free',
  questionCategory: 'all',
}

type DrawTool = 'pen' | 'eraser'
type DrawPoint = [number, number]

interface StrokePayload extends Record<string, unknown> {
  strokeId: string
  tool: DrawTool
  color: string
  width: number
  points: DrawPoint[]
  startsStroke: boolean
  endsStroke: boolean
}

function currentSettings(room: GameRoomContext): DrawGuessSettings {
  return normalizeSettings(room.gameSettings)
}

function normalizeSettings(value: unknown): DrawGuessSettings {
  const source = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const numberSetting = (key: string, fallback: number, min: number, max: number): number => {
    const candidate = source[key]
    return typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= min && candidate <= max
      ? candidate
      : fallback
  }

  return {
    drawTimeSeconds: numberSetting('drawTimeSeconds', DEFAULT_SETTINGS.drawTimeSeconds, 15, 180),
    roundsPerPlayer: numberSetting('roundsPerPlayer', DEFAULT_SETTINGS.roundsPerPlayer, 1, 5),
    guessTimeSeconds: numberSetting('guessTimeSeconds', DEFAULT_SETTINGS.guessTimeSeconds, 10, 120),
    questionMode: source.questionMode === 'bank' ? 'bank' : 'free',
    questionCategory: isDrawGuessQuestionCategory(source.questionCategory)
      ? source.questionCategory
      : 'all',
  }
}

function upgradeStoredGame(game: StoredDrawGuess): void {
  game.settings = normalizeSettings(game.settings)
  if (!Number.isInteger(game.answerLength) || Number(game.answerLength) < 0) {
    game.answerLength = game.answer === null ? null : answerLength(game.answer)
  }
  if (typeof game.hint !== 'string') {
    game.hint = null
  }
  if (!Array.isArray(game.usedPromptIds)) {
    game.usedPromptIds = []
  }
}

function failure(code: string, message: string, changed = false): GameActionResult {
  return { ok: false, code, message, changed }
}

function beginTurn(room: GameRoomContext, game: StoredDrawGuess, turnIndex: number, now: number): boolean {
  const totalTurns = game.playerIds.length * game.settings.roundsPerPlayer
  let nextTurnIndex = turnIndex

  while (nextTurnIndex < totalTurns) {
    const drawerId = game.playerIds[nextTurnIndex % game.playerIds.length]
    if (drawerId && room.players.some((player) => player.id === drawerId)) {
      game.turnIndex = nextTurnIndex
      game.round = Math.floor(nextTurnIndex / game.playerIds.length) + 1
      game.drawerId = drawerId
      game.phase = 'answering'
      game.phaseEndsAt = now + ANSWER_SETUP_MS
      game.answer = null
      game.answerLength = null
      game.hint = null
      if (game.settings.questionMode === 'bank') {
        const prompt = chooseBankPrompt(game)
        game.answer = prompt.answer
        game.answerLength = answerLength(prompt.answer)
        game.hint = prompt.hint
      }
      game.correctPlayerIds = []
      game.drawerScored = false
      return true
    }
    nextTurnIndex += 1
  }

  room.status = 'finished'
  room.game = null
  return true
}

function chooseBankPrompt(game: StoredDrawGuess): DrawGuessPrompt {
  const categoryPrompts = DRAW_GUESS_QUESTION_BANK.filter((prompt) => {
    return game.settings.questionCategory === 'all' || prompt.category === game.settings.questionCategory
  })
  const candidates = categoryPrompts.length > 0 ? categoryPrompts : DRAW_GUESS_QUESTION_BANK
  let available = candidates.filter((prompt) => !game.usedPromptIds.includes(prompt.id))
  if (available.length === 0) {
    game.usedPromptIds = game.usedPromptIds.filter((id) => !candidates.some((prompt) => prompt.id === id))
    available = candidates
  }

  const prompt = available[Math.floor(Math.random() * available.length)] ?? candidates[0]!
  game.usedPromptIds.push(prompt.id)
  return prompt
}

function answerLength(value: string): number {
  return Array.from(value.normalize('NFKC').replace(/\s+/g, '')).length
}

function startDrawing(game: StoredDrawGuess, now: number): void {
  game.phase = 'drawing'
  game.phaseEndsAt = now + game.settings.drawTimeSeconds * 1_000
}

function finishDrawing(room: GameRoomContext, game: StoredDrawGuess, now: number): void {
  if (allOnlineGuessersCorrect(room, game)) {
    enterReveal(game, now)
  } else {
    enterGuessing(game, now)
  }
}

function enterGuessing(game: StoredDrawGuess, now: number): void {
  game.phase = 'guessing'
  game.phaseEndsAt = now + game.settings.guessTimeSeconds * 1_000
}

function enterReveal(game: StoredDrawGuess, now: number): void {
  game.phase = 'reveal'
  game.phaseEndsAt = now + REVEAL_DURATION_MS
}

function advanceExpiredPhase(room: GameRoomContext, game: StoredDrawGuess, now: number): boolean {
  switch (game.phase) {
    case 'answering':
    case 'reveal':
      return beginTurn(room, game, game.turnIndex + 1, now)
    case 'drawing':
      finishDrawing(room, game, now)
      return true
    case 'guessing':
      enterReveal(game, now)
      return true
  }
}

function normalizeAnswer(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase()
}

function isPoint(value: unknown): value is DrawPoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= 0 &&
    value[0] <= 1 &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1]) &&
    value[1] >= 0 &&
    value[1] <= 1
  )
}

function isStrokePayload(payload: Record<string, unknown>): payload is StrokePayload {
  return (
    typeof payload.strokeId === 'string' &&
    payload.strokeId.length > 0 &&
    payload.strokeId.length <= 80 &&
    (payload.tool === 'pen' || payload.tool === 'eraser') &&
    typeof payload.color === 'string' &&
    DRAW_GUESS_PEN_COLORS.some((color) => color.value === payload.color) &&
    typeof payload.width === 'number' &&
    Number.isFinite(payload.width) &&
    payload.width >= 1 &&
    payload.width <= 32 &&
    Array.isArray(payload.points) &&
    payload.points.length > 0 &&
    payload.points.length <= MAX_STROKE_POINTS &&
    payload.points.every(isPoint) &&
    typeof payload.startsStroke === 'boolean' &&
    typeof payload.endsStroke === 'boolean'
  )
}

function allOnlineGuessersCorrect(room: GameRoomContext, game: StoredDrawGuess): boolean {
  const guessers = room.players.filter((player) => player.online && player.id !== game.drawerId)
  return guessers.length > 0 && guessers.every((player) => game.correctPlayerIds.includes(player.id))
}

function handleAction(
  room: GameRoomContext,
  playerId: string,
  action: string,
  payload: Record<string, unknown>,
  now: number,
): GameActionResult {
  const game = room.game
  if (room.status !== 'playing' || game?.gameId !== 'draw-guess') {
    return failure('GAME_NOT_STARTED', '你畫我猜尚未開始。')
  }
  upgradeStoredGame(game)

  if (game.phaseEndsAt <= now) {
    advanceExpiredPhase(room, game, now)
    return failure('TURN_EXPIRED', '本階段時間已到。', true)
  }

  if (action === 'set_answer') {
    if (
      playerId !== game.drawerId ||
      game.phase !== 'answering' ||
      game.settings.questionMode !== 'free'
    ) {
      return failure('NOT_SETTING_ANSWER', '目前不是你的設定題目階段。')
    }

    const answer = payload.answer
    if (
      typeof answer !== 'string' ||
      Array.from(answer.trim()).length === 0 ||
      Array.from(answer.trim()).length > MAX_ANSWER_LENGTH
    ) {
      return failure('INVALID_ANSWER', `題目請填 1 到 ${MAX_ANSWER_LENGTH} 個字元。`)
    }

    const hint = payload.hint === undefined ? '' : payload.hint
    if (typeof hint !== 'string' || Array.from(hint.trim()).length > MAX_HINT_LENGTH) {
      return failure('INVALID_HINT', `提示不可超過 ${MAX_HINT_LENGTH} 個字元。`)
    }

    game.answer = answer.normalize('NFKC').trim().replace(/\s+/g, ' ')
    game.answerLength = answerLength(game.answer)
    game.hint = hint.normalize('NFKC').trim() || null
    startDrawing(game, now)
    return { ok: true, changed: true }
  }

  if (action === 'start_drawing') {
    if (
      playerId !== game.drawerId ||
      game.phase !== 'answering' ||
      game.settings.questionMode !== 'bank' ||
      game.answer === null
    ) {
      return failure('CANNOT_START_DRAWING', '目前不能開始繪圖。')
    }

    startDrawing(game, now)
    return { ok: true, changed: true }
  }

  if (action === 'skip_turn') {
    if (
      playerId !== game.drawerId ||
      (game.phase !== 'answering' && game.phase !== 'drawing')
    ) {
      return failure('CANNOT_SKIP_TURN', '目前不能跳過這個回合。')
    }

    beginTurn(room, game, game.turnIndex + 1, now)
    return { ok: true, changed: true }
  }

  if (action === 'finish_drawing') {
    if (playerId !== game.drawerId || game.phase !== 'drawing') {
      return failure('NOT_DRAWING', '目前不能結束繪圖階段。')
    }

    finishDrawing(room, game, now)
    return { ok: true, changed: true }
  }

  if (action === 'stroke') {
    if (playerId !== game.drawerId || game.phase !== 'drawing') {
      return failure('NOT_DRAWING', '目前不是你的繪圖階段。')
    }
    if (!isStrokePayload(payload)) {
      return failure('INVALID_STROKE', '筆畫資料格式不正確。')
    }

    return {
      ok: true,
      changed: false,
      event: {
        name: 'stroke',
        audience: 'room',
        payload: {
          strokeId: payload.strokeId,
          tool: payload.tool,
          color: payload.color,
          width: payload.width,
          points: payload.points,
          startsStroke: payload.startsStroke,
          endsStroke: payload.endsStroke,
        },
      },
    }
  }

  if (action === 'submit_guess') {
    if (game.phase !== 'drawing' && game.phase !== 'guessing') {
      return failure('GUESSING_CLOSED', '目前不是猜答案階段。')
    }
    if (playerId === game.drawerId) {
      return failure('DRAWER_CANNOT_GUESS', '繪圖者不能猜自己的題目。')
    }
    if (game.correctPlayerIds.includes(playerId)) {
      return failure('ALREADY_GUESSED', '你已經猜中這題了。')
    }

    const guess = payload.answer
    if (
      typeof guess !== 'string' ||
      Array.from(guess.trim()).length === 0 ||
      Array.from(guess.trim()).length > MAX_ANSWER_LENGTH
    ) {
      return failure('INVALID_ANSWER', `答案請填 1 到 ${MAX_ANSWER_LENGTH} 個字元。`)
    }

    const correct = game.answer !== null && normalizeAnswer(guess) === normalizeAnswer(game.answer)
    if (!correct) {
      return {
        ok: true,
        changed: false,
        event: {
          name: 'guess-result',
          payload: { correct: false },
        },
      }
    }

    const guesser = room.players.find((player) => player.id === playerId)
    if (!guesser) {
      return failure('PLAYER_NOT_FOUND', '你已不在這個房間。')
    }

    guesser.score += 50
    game.correctPlayerIds.push(playerId)
    if (!game.drawerScored) {
      const drawer = room.players.find((player) => player.id === game.drawerId)
      if (drawer) {
        drawer.score += 50
      }
      game.drawerScored = true
    }

    if (game.phase === 'guessing' && allOnlineGuessersCorrect(room, game)) {
      enterReveal(game, now)
    }

    return {
      ok: true,
      changed: true,
      event: {
        name: 'guess-result',
        payload: { correct: true },
      },
    }
  }

  return failure('UNKNOWN_GAME_ACTION', '你畫我猜不支援這個操作。')
}

export const drawGuessGame: GameModule = {
  id: 'draw-guess',
  defaultSettings: () => ({ ...DEFAULT_SETTINGS }),
  configure(room, _playerId, settings) {
    if (!isDrawGuessSettings(settings)) {
      return failure(
        'INVALID_GAME_SETTINGS',
        '繪畫時間需為 15–180 秒、每人輪數需為 1–5、猜答案時間需為 10–120 秒。',
      )
    }

    const current = currentSettings(room)
    if (
      current.drawTimeSeconds === settings.drawTimeSeconds &&
      current.roundsPerPlayer === settings.roundsPerPlayer &&
      current.guessTimeSeconds === settings.guessTimeSeconds &&
      current.questionMode === settings.questionMode &&
      current.questionCategory === settings.questionCategory
    ) {
      return { ok: true, changed: false }
    }

    room.gameSettings = { ...settings }
    return { ok: true, changed: true }
  },
  publicSettings: (room) => ({ ...currentSettings(room) }),
  pushPrivateState: true,
  privateState(room, playerId) {
    const game = room.game
    if (game?.gameId !== 'draw-guess') {
      return null
    }
    upgradeStoredGame(game)
    if (
      game.drawerId !== playerId ||
      game.answer === null ||
      game.phase === 'reveal'
    ) {
      return null
    }

    return {
      name: 'answer-prompt',
      payload: {
        answer: game.answer,
        hint: game.hint ?? '',
        answerLength: game.answerLength ?? answerLength(game.answer),
      },
    }
  },
  start(room, now) {
    const settings = currentSettings(room)
    const game: StoredDrawGuess = {
      gameId: 'draw-guess',
      settings,
      playerIds: room.players.map((player) => player.id),
      turnIndex: -1,
      round: 0,
      drawerId: '',
      phase: 'answering',
      phaseEndsAt: now,
      answer: null,
      answerLength: null,
      hint: null,
      usedPromptIds: [],
      correctPlayerIds: [],
      drawerScored: false,
    }
    room.status = 'playing'
    room.game = game
    beginTurn(room, game, 0, now)
  },
  handleAction,
  nextAlarmAt(room) {
    return room.status === 'playing' && room.game?.gameId === 'draw-guess'
      ? room.game.phaseEndsAt
      : null
  },
  handleAlarm(room, now) {
    const game = room.game
    if (
      room.status !== 'playing' ||
      game?.gameId !== 'draw-guess' ||
      game.phaseEndsAt > now
    ) {
      return false
    }
    upgradeStoredGame(game)
    return advanceExpiredPhase(room, game, now)
  },
  onPlayerLeave(room, playerId, now) {
    const game = room.game
    if (room.status !== 'playing' || game?.gameId !== 'draw-guess') {
      return false
    }
    upgradeStoredGame(game)

    if (
      game.drawerId === playerId &&
      (game.phase === 'answering' || game.phase === 'drawing')
    ) {
      return beginTurn(room, game, game.turnIndex + 1, now)
    }

    if (game.phase === 'guessing' && allOnlineGuessersCorrect(room, game)) {
      enterReveal(game, now)
      return true
    }
    return false
  },
  playerFlags(room, playerId) {
    const game = room.game
    const correct = game?.gameId === 'draw-guess' && game.correctPlayerIds.includes(playerId)
    return { answered: correct, correct }
  },
  toView(room): DrawGuessView | null {
    const game = room.game
    if (game?.gameId !== 'draw-guess') {
      return null
    }
    upgradeStoredGame(game)

    return {
      gameId: 'draw-guess',
      phase: game.phase,
      round: game.round,
      roundsPerPlayer: game.settings.roundsPerPlayer,
      turnNumber: game.turnIndex + 1,
      totalTurns: game.playerIds.length * game.settings.roundsPerPlayer,
      drawerId: game.drawerId,
      phaseEndsAt: game.phaseEndsAt,
      answer: game.phase === 'reveal' ? game.answer : null,
      answerLength: game.phase === 'answering' ? null : game.answerLength,
      hint: game.phase === 'answering' ? null : game.hint,
      settings: game.settings,
      correctPlayerIds: [...game.correctPlayerIds],
    }
  },
}
