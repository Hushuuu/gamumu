export interface DrawGuessSettings {
  drawTimeSeconds: number
  roundsPerPlayer: number
  guessTimeSeconds: number
}

export type DrawGuessPhase = 'answering' | 'drawing' | 'guessing' | 'reveal'

export interface DrawGuessView {
  gameId: 'draw-guess'
  phase: DrawGuessPhase
  round: number
  roundsPerPlayer: number
  turnNumber: number
  totalTurns: number
  drawerId: string
  phaseEndsAt: number
  answer: string | null
  settings: DrawGuessSettings
  correctPlayerIds: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isDrawGuessSettings(value: unknown): value is DrawGuessSettings {
  return (
    isRecord(value) &&
    Number.isInteger(value.drawTimeSeconds) &&
    Number(value.drawTimeSeconds) >= 15 &&
    Number(value.drawTimeSeconds) <= 180 &&
    Number.isInteger(value.roundsPerPlayer) &&
    Number(value.roundsPerPlayer) >= 1 &&
    Number(value.roundsPerPlayer) <= 5 &&
    Number.isInteger(value.guessTimeSeconds) &&
    Number(value.guessTimeSeconds) >= 10 &&
    Number(value.guessTimeSeconds) <= 120
  )
}

export function isDrawGuessView(value: unknown): value is DrawGuessView {
  return (
    isRecord(value) &&
    value.gameId === 'draw-guess' &&
    ['answering', 'drawing', 'guessing', 'reveal'].includes(String(value.phase)) &&
    Number.isInteger(value.round) &&
    typeof value.roundsPerPlayer === 'number' &&
    Number.isInteger(value.turnNumber) &&
    Number.isInteger(value.totalTurns) &&
    typeof value.drawerId === 'string' &&
    typeof value.phaseEndsAt === 'number' &&
    (value.answer === null || typeof value.answer === 'string') &&
    isDrawGuessSettings(value.settings) &&
    Array.isArray(value.correctPlayerIds) &&
    value.correctPlayerIds.every((playerId) => typeof playerId === 'string')
  )
}
