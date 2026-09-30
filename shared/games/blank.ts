export interface BlankGameView {
  gameId: 'blank'
  startedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isBlankGameView(value: unknown): value is BlankGameView {
  return isRecord(value) && value.gameId === 'blank' && typeof value.startedAt === 'number'
}
