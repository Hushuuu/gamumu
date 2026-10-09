export function randomIndex(maxExclusive: number): number {
  const range = 0x1_0000_0000
  const limit = Math.floor(range / maxExclusive) * maxExclusive
  const value = new Uint32Array(1)
  do {
    crypto.getRandomValues(value)
  } while (value[0]! >= limit)
  return value[0]! % maxExclusive
}

export function shuffle<T>(values: T[]): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const otherIndex = randomIndex(index + 1)
    const current = values[index]!
    values[index] = values[otherIndex]!
    values[otherIndex] = current
  }
}

export function removeRandom<T>(values: T[]): T {
  const [removed] = values.splice(randomIndex(values.length), 1)
  if (removed === undefined) {
    throw new Error('Cannot remove a random item from an empty list.')
  }
  return removed
}
