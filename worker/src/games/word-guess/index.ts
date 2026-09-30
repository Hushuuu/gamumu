import type { GameActionResult, GameModule, GameRoomContext } from '../types'
import type { WordGuessView } from '../../../../shared/games/word-guess'
import type { StoredWordGuess } from './types'

const ROUND_DURATION_MS = 20_000
const REVEAL_DURATION_MS = 3_000
const TOTAL_ROUNDS = 5

const WORDS = [
  { answer: 'APPLE', hint: '一種常見、紅色或綠色的水果' },
  { answer: 'BANANA', hint: '外皮是黃色，常被猴子喜歡的水果' },
  { answer: 'PIZZA', hint: '有餅皮、起司和各種配料的圓形料理' },
  { answer: 'PANDA', hint: '黑白相間、喜歡吃竹子的動物' },
  { answer: 'RAINBOW', hint: '雨後天空可能出現的七彩弧線' },
  { answer: 'GUITAR', hint: '用手指撥弦演奏的樂器' },
  { answer: 'CASTLE', hint: '有高塔和城牆的古老建築' },
  { answer: 'ROBOT', hint: '可以依照程式或指令行動的機器' },
  { answer: 'DOLPHIN', hint: '生活在海裡、聰明又會跳躍的哺乳動物' },
  { answer: 'POPCORN', hint: '看電影時常吃、由玉米膨起來的小點心' },
  { answer: 'UMBRELLA', hint: '下雨天拿在手上用來遮雨的物品' },
  { answer: 'KANGAROO', hint: '澳洲有名、會用強壯後腿跳躍的動物' },
  { answer: 'BUTTERFLY', hint: '有彩色翅膀、由毛毛蟲變來的昆蟲' },
  { answer: 'TELESCOPE', hint: '用來觀察月亮、行星和遙遠星星的工具' },
  { answer: 'SANDWICH', hint: '把餡料夾在兩片麵包中間的食物' },
]

export type SubmitAnswerResult =
  | { ok: true; correct: boolean; changed: true }
  | { ok: false; code: string; message: string; changed: boolean }

function chooseWord(): (typeof WORDS)[number] {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
  return WORDS[value % WORDS.length]!
}

function createRound(round: number, now: number): StoredWordGuess {
  const word = chooseWord()
  return {
    gameId: 'word-guess',
    round,
    totalRounds: TOTAL_ROUNDS,
    phase: 'guessing',
    answer: word.answer,
    hint: word.hint,
    roundEndsAt: now + ROUND_DURATION_MS,
    answeredPlayerIds: [],
    correctPlayerIds: [],
  }
}

export function startWordGuess(room: GameRoomContext, now: number): void {
  room.status = 'playing'
  room.game = createRound(1, now)
}

export function submitWordGuess(
  room: GameRoomContext,
  playerId: string,
  answer: string,
  now: number,
): SubmitAnswerResult {
  const game = room.game
  if (room.status !== 'playing' || !game || game.gameId !== 'word-guess') {
    return { ok: false, code: 'GAME_NOT_STARTED', message: '遊戲尚未開始。', changed: false }
  }

  if (game.phase !== 'guessing') {
    return { ok: false, code: 'ROUND_CLOSED', message: '本回合已結束，請等下一題。', changed: false }
  }

  if (game.roundEndsAt <= now) {
    revealWordGuess(room, now)
    return { ok: false, code: 'ROUND_ENDED', message: '時間到，答案即將公布。', changed: true }
  }

  const player = room.players.find((candidate) => candidate.id === playerId)
  if (!player) {
    return { ok: false, code: 'PLAYER_NOT_FOUND', message: '你已不在這個房間。', changed: false }
  }

  if (game.answeredPlayerIds.includes(playerId)) {
    return { ok: false, code: 'ALREADY_ANSWERED', message: '你已經送出這題的答案。', changed: false }
  }

  const normalizedAnswer = answer.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase()
  const correct = normalizedAnswer === game.answer
  game.answeredPlayerIds.push(playerId)

  if (correct) {
    player.score += 100
    game.correctPlayerIds.push(playerId)
  }

  if (game.answeredPlayerIds.length >= room.players.length) {
    revealWordGuess(room, now)
  }

  return { ok: true, correct, changed: true }
}

export function revealWordGuess(room: GameRoomContext, now: number): boolean {
  const game = room.game
  if (room.status !== 'playing' || !game || game.gameId !== 'word-guess' || game.phase !== 'guessing') {
    return false
  }

  game.phase = 'reveal'
  game.roundEndsAt = now + REVEAL_DURATION_MS
  return true
}

export function advanceWordGuess(room: GameRoomContext, now: number): boolean {
  const game = room.game
  if (room.status !== 'playing' || !game || game.gameId !== 'word-guess' || game.phase !== 'reveal') {
    return false
  }

  if (game.round >= game.totalRounds) {
    room.status = 'finished'
    room.game = null
    return true
  }

  room.game = createRound(game.round + 1, now)
  return true
}

function handleWordGuessAction(
  room: GameRoomContext,
  playerId: string,
  action: string,
  payload: Record<string, unknown>,
  now: number,
): GameActionResult {
  if (action !== 'submit_answer') {
    return {
      ok: false,
      changed: false,
      code: 'UNKNOWN_GAME_ACTION',
      message: '猜詞派對不支援這個操作。',
    }
  }

  const answer = payload.answer
  if (typeof answer !== 'string' || answer.trim().length === 0 || Array.from(answer).length > 80) {
    return {
      ok: false,
      changed: false,
      code: 'INVALID_ANSWER',
      message: '答案請填 1 到 80 個字元。',
    }
  }

  const result = submitWordGuess(room, playerId, answer, now)
  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    changed: true,
    event: {
      name: 'answer-result',
      payload: { correct: result.correct },
      legacyMessage: { type: 'guess_result', correct: result.correct },
    },
  }
}

export const wordGuessGame: GameModule = {
  id: 'word-guess',
  defaultSettings: () => ({}),
  configure: () => ({
    ok: false,
    changed: false,
    code: 'GAME_NOT_CONFIGURABLE',
    message: '猜詞派對沒有可調整的設定。',
  }),
  publicSettings: () => ({}),
  privateState: () => null,
  start: startWordGuess,
  handleAction: handleWordGuessAction,
  nextAlarmAt(room) {
    return room.status === 'playing' && room.game?.gameId === 'word-guess'
      ? room.game.roundEndsAt
      : null
  },
  handleAlarm(room, now) {
    const game = room.game
    if (room.status !== 'playing' || game?.gameId !== 'word-guess' || game.roundEndsAt > now) {
      return false
    }
    return game.phase === 'guessing'
      ? revealWordGuess(room, now)
      : advanceWordGuess(room, now)
  },
  onPlayerLeave(room, _playerId, now) {
    const game = room.game
    return (
      room.status === 'playing' &&
      game?.gameId === 'word-guess' &&
      game.phase === 'guessing' &&
      game.answeredPlayerIds.length >= room.players.length &&
      revealWordGuess(room, now)
    )
  },
  playerFlags(room, playerId) {
    const game = room.game
    return {
      answered: game?.gameId === 'word-guess' && game.answeredPlayerIds.includes(playerId),
      correct: game?.gameId === 'word-guess' && game.correctPlayerIds.includes(playerId),
    }
  },
  toView(room): WordGuessView | null {
    const game = room.game
    if (game?.gameId !== 'word-guess') {
      return null
    }

    return {
      gameId: 'word-guess',
      round: game.round,
      totalRounds: game.totalRounds,
      phase: game.phase,
      hint: game.hint,
      answer: game.phase === 'reveal' ? game.answer : null,
      roundEndsAt: room.status === 'finished' ? null : game.roundEndsAt,
    }
  },
}
