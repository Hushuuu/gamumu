import type { RoundPhase } from '../protocol'

export interface WordGuessView {
  gameId: 'word-guess'
  round: number
  totalRounds: number
  phase: RoundPhase
  hint: string
  answer: string | null
  roundEndsAt: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isWordGuessView(value: unknown): value is WordGuessView {
  return (
    isRecord(value) &&
    value.gameId === 'word-guess' &&
    typeof value.round === 'number' &&
    typeof value.totalRounds === 'number' &&
    ['guessing', 'reveal'].includes(String(value.phase)) &&
    typeof value.hint === 'string' &&
    (value.answer === null || typeof value.answer === 'string') &&
    (value.roundEndsAt === null || typeof value.roundEndsAt === 'number')
  )
}
