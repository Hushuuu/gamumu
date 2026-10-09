import {
  canPlayExplodingKittensAlone,
  EXPLODING_KITTENS_ANNOUNCEMENT_LIMIT,
  EXPLODING_KITTENS_CARD_NAMES,
  EXPLODING_KITTENS_MAX_PLAYERS,
  isExplodingKittensCardType,
  isExplodingKittensComboType,
} from '../../../../shared/games/exploding-kittens'
import type {
  ExplodingKittensCardType,
  ExplodingKittensPlayKind,
  ExplodingKittensSettings,
} from '../../../../shared/games/exploding-kittens'
import type { GameActionResult } from '../types'
import { randomIndex, removeRandom, shuffle } from './random'
import type {
  StoredExplodingKittens,
  StoredExplodingKittensCard,
  StoredExplodingKittensPending,
  StoredExplodingKittensSeat,
} from './types'

const DECK_COPIES: ReadonlyArray<readonly [ExplodingKittensCardType, number]> = [
  ['exploding-kitten', 4],
  ['defuse', 6],
  ['nope', 5],
  ['attack', 4],
  ['skip', 4],
  ['favor', 4],
  ['shuffle', 4],
  ['see-the-future', 5],
  ['cat-pudding', 4],
  ['cat-taro', 4],
  ['cat-matcha', 4],
  ['cat-peach', 4],
  ['cat-mochi', 4],
]
const SINGLE_DECK_MAX_PLAYERS = 5
const DEAL_SIZE = 7
const MAX_PLAY_CARDS = 5
const MAX_TIMER_STEPS = 16

function fail(code: string, message: string, changed = false): GameActionResult {
  return { ok: false, changed, code, message }
}

function succeed(): GameActionResult {
  return { ok: true, changed: true }
}

function label(type: ExplodingKittensCardType): string {
  return EXPLODING_KITTENS_CARD_NAMES[type]
}

function turnDurationMs(game: StoredExplodingKittens): number {
  return game.settings.turnTimeSeconds * 1000
}

function nopeWindowMs(game: StoredExplodingKittens): number {
  return game.settings.nopeWindowSeconds * 1000
}

function mintCard(game: StoredExplodingKittens, type: ExplodingKittensCardType): StoredExplodingKittensCard {
  game.cardSeq += 1
  return { id: `card-${game.cardSeq}`, type }
}

function announce(game: StoredExplodingKittens, message: string): void {
  game.announcements.push(message)
  if (game.announcements.length > EXPLODING_KITTENS_ANNOUNCEMENT_LIMIT) {
    game.announcements.splice(0, game.announcements.length - EXPLODING_KITTENS_ANNOUNCEMENT_LIMIT)
  }
}

function findSeat(game: StoredExplodingKittens, playerId: string): StoredExplodingKittensSeat | undefined {
  return game.seats.find((seat) => seat.id === playerId)
}

function requireSeat(game: StoredExplodingKittens, playerId: string): StoredExplodingKittensSeat {
  const seat = findSeat(game, playerId)
  if (!seat) {
    throw new Error(`Exploding Kittens seat ${playerId} is missing.`)
  }
  return seat
}

function nameOf(game: StoredExplodingKittens, playerId: string): string {
  return findSeat(game, playerId)?.name ?? '玩家'
}

function isAlive(game: StoredExplodingKittens, playerId: string): boolean {
  return findSeat(game, playerId)?.status === 'alive'
}

function aliveTarget(game: StoredExplodingKittens, targetId: string | null): StoredExplodingKittensSeat | null {
  if (targetId === null) {
    return null
  }
  const seat = findSeat(game, targetId)
  return seat && seat.status === 'alive' ? seat : null
}

function nextAliveId(game: StoredExplodingKittens, fromId: string): string {
  const fromIndex = game.seats.findIndex((seat) => seat.id === fromId)
  if (fromIndex === -1) {
    throw new Error(`Exploding Kittens seat ${fromId} is missing.`)
  }
  for (let step = 1; step <= game.seats.length; step += 1) {
    const seat = game.seats[(fromIndex + step) % game.seats.length]
    if (seat && seat.status === 'alive') {
      return seat.id
    }
  }
  throw new Error('Exploding Kittens has no alive seat left.')
}

function maxDefusePosition(game: StoredExplodingKittens): number {
  return Math.min(game.startingPlayerCount, game.drawPile.length + 1)
}

function beginTurn(game: StoredExplodingKittens, playerId: string, turnsLeft: number, now: number): void {
  game.lastTurnPlays = game.turnPlays
  game.turnPlays = []
  game.peek = null
  game.pending = null
  game.phase = 'turn'
  game.currentPlayerId = playerId
  game.turnsLeft = turnsLeft
  game.phaseEndsAt = now + turnDurationMs(game)
}

function resumeTurn(game: StoredExplodingKittens, now: number): void {
  game.phase = 'turn'
  game.pending = null
  game.phaseEndsAt = now + turnDurationMs(game)
}

function endTurn(game: StoredExplodingKittens, actorId: string, now: number): void {
  if (game.turnsLeft > 1 && isAlive(game, actorId)) {
    beginTurn(game, actorId, game.turnsLeft - 1, now)
    return
  }
  beginTurn(game, nextAliveId(game, actorId), 1, now)
}

function finishIfOver(game: StoredExplodingKittens): boolean {
  const alive = game.seats.filter((seat) => seat.status === 'alive')
  if (alive.length > 1) {
    return false
  }

  const winner = alive.length === 1 ? alive[0] : undefined
  game.phase = 'finished'
  game.currentPlayerId = null
  game.turnsLeft = 0
  game.pending = null
  game.peek = null
  game.phaseEndsAt = null
  game.winnerId = winner?.id ?? null
  if (winner) {
    announce(game, `${winner.name} 是最後的倖存者，獲得勝利！`)
  }
  return true
}

function isNopeEligible(pending: StoredExplodingKittensPending, playerId: string): boolean {
  if (playerId === pending.actorId) {
    return pending.nopedBy.some((id) => id !== pending.actorId)
  }
  return !pending.nopedBy.includes(playerId)
}

export function canPlayerNope(game: StoredExplodingKittens, playerId: string): boolean {
  const pending = game.pending
  if (game.phase !== 'nope' || !pending || !isAlive(game, playerId)) {
    return false
  }
  const seat = requireSeat(game, playerId)
  return seat.hand.some((card) => card.type === 'nope') && isNopeEligible(pending, playerId)
}

function requireCurrentTurn(game: StoredExplodingKittens, actorId: string): GameActionResult | null {
  if (game.phase === 'finished') {
    return fail('GAME_FINISHED', '本局已經結束。')
  }
  if (game.phase === 'nope') {
    return fail('NOPE_WINDOW_OPEN', '正在等待休想卡判定，請稍候。')
  }
  if (game.phase === 'favor') {
    return fail('FAVOR_PENDING', '正在等待恩惠對象選擇要給的牌。')
  }
  if (game.phase === 'defuse') {
    return fail('DEFUSE_PENDING', '正在等待拆除爆炸貓。')
  }
  return game.currentPlayerId === actorId ? null : fail('NOT_YOUR_TURN', '還沒輪到你。')
}

function classifyPlay(types: ExplodingKittensCardType[]): ExplodingKittensPlayKind | null {
  if (types.length === 0) {
    return null
  }
  if (types.length === 1) {
    return canPlayExplodingKittensAlone(types[0]) ? 'card' : null
  }
  if (!types.every(isExplodingKittensComboType)) {
    return null
  }

  const distinctCount = new Set(types).size
  if (types.length === 5 && distinctCount === 5) {
    return 'five'
  }
  if (distinctCount !== 1) {
    return null
  }
  if (types.length === 2) {
    return 'pair'
  }
  if (types.length === 3) {
    return 'triple'
  }
  return null
}

function readCardIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PLAY_CARDS) {
    return null
  }
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || ids.includes(item)) {
      return null
    }
    ids.push(item)
  }
  return ids
}

function playAnnouncement(
  game: StoredExplodingKittens,
  actorName: string,
  kind: ExplodingKittensPlayKind,
  types: ExplodingKittensCardType[],
  targetId: string | null,
  namedType: ExplodingKittensCardType | null,
): string {
  const targetName = targetId ? nameOf(game, targetId) : ''
  if (kind === 'pair') {
    return `${actorName} 使用成雙成對，要從 ${targetName} 偷一張手牌`
  }
  if (kind === 'triple') {
    return `${actorName} 使用三條，指定${namedType ? label(namedType) : ''}，要從 ${targetName} 取走`
  }
  if (kind === 'five') {
    return `${actorName} 使用五彩繽紛，要從棄牌區取回${namedType ? label(namedType) : ''}`
  }
  if (types[0] === 'favor' && targetId) {
    return `${actorName} 打出恩惠，要求 ${targetName} 交出一張牌`
  }
  return `${actorName} 打出了${types.map(label).join('、')}`
}

function playCards(
  game: StoredExplodingKittens,
  actorId: string,
  payload: Record<string, unknown>,
  now: number,
): GameActionResult {
  const turnError = requireCurrentTurn(game, actorId)
  if (turnError) {
    return turnError
  }

  const cardIds = readCardIds(payload.cardIds)
  if (!cardIds) {
    return fail('INVALID_CARD_SELECTION', '請選擇 1 到 5 張不重複的手牌。')
  }

  const actor = requireSeat(game, actorId)
  const selected: StoredExplodingKittensCard[] = []
  for (const cardId of cardIds) {
    const card = actor.hand.find((candidate) => candidate.id === cardId)
    if (!card) {
      return fail('CARD_NOT_IN_HAND', '這張牌不在你的手牌中。')
    }
    selected.push(card)
  }

  const types = selected.map((card) => card.type)
  const kind = classifyPlay(types)
  if (!kind) {
    return fail('INVALID_COMBO', '這組牌不能這樣打出。')
  }

  let targetId: string | null = null
  if (kind === 'pair' || kind === 'triple' || (kind === 'card' && types[0] === 'favor')) {
    const requested = payload.targetId
    if (typeof requested !== 'string' || requested === actorId || !aliveTarget(game, requested)) {
      return fail('INVALID_TARGET', '請選擇其他仍在場的玩家。')
    }
    targetId = requested
  }

  let namedType: ExplodingKittensCardType | null = null
  if (kind === 'triple' || kind === 'five') {
    const requested = payload.namedType
    if (!isExplodingKittensCardType(requested) || !isExplodingKittensComboType(requested)) {
      return fail('INVALID_NAMED_TYPE', '請指定一種可以被組合取得的牌。')
    }
    if (kind === 'five' && !game.discard.includes(requested)) {
      return fail('NAMED_CARD_MISSING', '棄牌區沒有指定的牌，無法使用五彩繽紛。')
    }
    namedType = requested
  }

  const chosenIds = new Set(cardIds)
  actor.hand = actor.hand.filter((card) => !chosenIds.has(card.id))
  game.discard.push(...types)
  game.turnPlays.push({ playerId: actorId, kind, cardTypes: [...types], targetId })
  game.pending = {
    kind: 'nope',
    actorId,
    targetId,
    playKind: kind,
    cardTypes: [...types],
    namedType,
    nopeCount: 0,
    nopedBy: [],
    kitten: null,
  }
  game.phase = 'nope'
  game.phaseEndsAt = now + nopeWindowMs(game)
  announce(game, playAnnouncement(game, actor.name, kind, types, targetId, namedType))
  return succeed()
}

function playNope(
  game: StoredExplodingKittens,
  actorId: string,
  payload: Record<string, unknown>,
  now: number,
): GameActionResult {
  const pending = game.pending
  if (game.phase !== 'nope' || !pending) {
    return fail('NOPE_NOT_OPEN', '目前沒有可以反制的效果。')
  }
  if (!isAlive(game, actorId)) {
    return fail('NOT_IN_GAME', '你已不在這局遊戲中。')
  }

  const actor = requireSeat(game, actorId)
  const card = actor.hand.find(
    (candidate) =>
      candidate.type === 'nope' && (payload.cardId === undefined || candidate.id === payload.cardId),
  )
  if (!card) {
    return fail('NO_NOPE_CARD', '你沒有可以使用的休想卡。')
  }
  if (!isNopeEligible(pending, actorId)) {
    return fail(
      'NOPE_NOT_ALLOWED',
      actorId === pending.actorId
        ? '需要等其他玩家先使用休想卡，你才能反制。'
        : '你已經在這個效果中使用過休想卡了。',
    )
  }

  actor.hand = actor.hand.filter((candidate) => candidate.id !== card.id)
  game.discard.push('nope')
  pending.nopeCount += 1
  pending.nopedBy.push(actorId)
  game.turnPlays.push({ playerId: actorId, kind: 'nope', cardTypes: ['nope'], targetId: null })
  game.phaseEndsAt = now + nopeWindowMs(game)
  announce(game, `${actor.name} 打出休想卡反制`)
  return succeed()
}

function eliminate(
  game: StoredExplodingKittens,
  actor: StoredExplodingKittensSeat,
  kitten: StoredExplodingKittensCard,
  now: number,
): void {
  actor.status = 'eliminated'
  game.discard.push(...actor.hand.map((card) => card.type), kitten.type)
  actor.hand = []
  game.eliminationOrder.push(actor.id)
  announce(game, `${actor.name} 被淘汰了`)
  if (finishIfOver(game)) {
    return
  }
  beginTurn(game, nextAliveId(game, actor.id), 1, now)
}

function drawCard(game: StoredExplodingKittens, actorId: string, now: number, timedOut: boolean): void {
  const actor = requireSeat(game, actorId)
  const top = game.drawPile.shift()
  if (!top) {
    throw new Error('Exploding Kittens draw pile is unexpectedly empty.')
  }

  if (top.type !== 'exploding-kitten') {
    actor.hand.push(top)
    announce(
      game,
      timedOut ? `${actor.name} 超時，自動抽牌並結束回合` : `${actor.name} 抽牌並結束回合`,
    )
    endTurn(game, actorId, now)
    return
  }

  announce(game, `${actor.name} 抽到了爆炸貓！`)
  const defuseIndex = actor.hand.findIndex((card) => card.type === 'defuse')
  if (defuseIndex === -1) {
    eliminate(game, actor, top, now)
    return
  }

  actor.hand.splice(defuseIndex, 1)
  game.discard.push('defuse')
  announce(game, `${actor.name} 使用拆除化解危機`)
  game.pending = {
    kind: 'defuse',
    actorId,
    targetId: null,
    playKind: null,
    cardTypes: [],
    namedType: null,
    nopeCount: 0,
    nopedBy: [],
    kitten: top,
  }
  game.phase = 'defuse'
  game.phaseEndsAt = now + turnDurationMs(game)
}

function drawAction(game: StoredExplodingKittens, actorId: string, now: number): GameActionResult {
  const turnError = requireCurrentTurn(game, actorId)
  if (turnError) {
    return turnError
  }
  drawCard(game, actorId, now, false)
  return succeed()
}

function giveCard(
  game: StoredExplodingKittens,
  actorId: string,
  payload: Record<string, unknown>,
  now: number,
): GameActionResult {
  const pending = game.pending
  if (game.phase !== 'favor' || !pending || pending.targetId === null) {
    return fail('FAVOR_NOT_OPEN', '目前沒有等待中的恩惠。')
  }
  if (pending.targetId !== actorId) {
    return fail('NOT_FAVOR_TARGET', '只有恩惠的對象可以選擇要給的牌。')
  }

  const giver = requireSeat(game, actorId)
  const index = giver.hand.findIndex((card) => card.id === payload.cardId)
  if (index === -1) {
    return fail('CARD_NOT_IN_HAND', '請選擇你手牌中的一張牌。')
  }

  const [card] = giver.hand.splice(index, 1)
  const receiver = requireSeat(game, pending.actorId)
  receiver.hand.push(card)
  announce(game, `${giver.name} 交出一張牌給 ${receiver.name}`)
  resumeTurn(game, now)
  return succeed()
}

function defuseIndexFor(game: StoredExplodingKittens, position: unknown): number | null {
  if (position === 'random') {
    return randomIndex(game.drawPile.length + 1)
  }
  if (
    typeof position === 'number' &&
    Number.isInteger(position) &&
    position >= 1 &&
    position <= maxDefusePosition(game)
  ) {
    return position - 1
  }
  return null
}

function placeDefuse(
  game: StoredExplodingKittens,
  actorId: string,
  payload: Record<string, unknown>,
  now: number,
): GameActionResult {
  const pending = game.pending
  if (game.phase !== 'defuse' || !pending || !pending.kitten) {
    return fail('DEFUSE_NOT_OPEN', '目前不需要拆除。')
  }
  if (pending.actorId !== actorId) {
    return fail('NOT_DEFUSE_ACTOR', '只有抽到爆炸貓的玩家可以拆除。')
  }

  const index = defuseIndexFor(game, payload.position)
  if (index === null) {
    return fail('INVALID_DEFUSE_POSITION', '請選擇有效的放回位置。')
  }

  game.drawPile.splice(index, 0, pending.kitten)
  announce(game, `${nameOf(game, actorId)} 把爆炸貓放回牌堆`)
  endTurn(game, actorId, now)
  return succeed()
}

function effectName(pending: StoredExplodingKittensPending): string {
  if (pending.playKind === 'pair') {
    return '成雙成對'
  }
  if (pending.playKind === 'triple') {
    return '三條'
  }
  if (pending.playKind === 'five') {
    return '五彩繽紛'
  }
  const type = pending.cardTypes[0]
  return type ? label(type) : '效果'
}

function resolveFavor(game: StoredExplodingKittens, pending: StoredExplodingKittensPending, now: number): void {
  const actorId = pending.actorId
  const target = aliveTarget(game, pending.targetId)
  if (target && target.hand.length > 0) {
    game.phase = 'favor'
    game.pending = {
      kind: 'favor',
      actorId,
      targetId: target.id,
      playKind: 'card',
      cardTypes: ['favor'],
      namedType: null,
      nopeCount: 0,
      nopedBy: [],
      kitten: null,
    }
    game.phaseEndsAt = now + turnDurationMs(game)
    return
  }

  announce(game, `${target?.name ?? '對方'} 沒有手牌，恩惠無效`)
  resumeTurn(game, now)
}

function resolvePair(game: StoredExplodingKittens, pending: StoredExplodingKittensPending, now: number): void {
  const actor = requireSeat(game, pending.actorId)
  const target = aliveTarget(game, pending.targetId)
  if (target && target.hand.length > 0) {
    actor.hand.push(removeRandom(target.hand))
    announce(game, `${actor.name} 從 ${target.name} 偷走一張手牌`)
  } else {
    announce(game, `${target?.name ?? '對方'} 沒有手牌，成雙成對無效`)
  }
  resumeTurn(game, now)
}

function resolveTriple(game: StoredExplodingKittens, pending: StoredExplodingKittensPending, now: number): void {
  const actor = requireSeat(game, pending.actorId)
  const target = aliveTarget(game, pending.targetId)
  const named = pending.namedType
  if (target && named) {
    const index = target.hand.findIndex((card) => card.type === named)
    if (index !== -1) {
      const [card] = target.hand.splice(index, 1)
      actor.hand.push(card)
      announce(game, `${actor.name} 從 ${target.name} 取走一張${label(named)}`)
      resumeTurn(game, now)
      return
    }
  }

  announce(game, `${target?.name ?? '對方'} 沒有指定的牌，三條無效`)
  resumeTurn(game, now)
}

function resolveFive(game: StoredExplodingKittens, pending: StoredExplodingKittensPending, now: number): void {
  const actor = requireSeat(game, pending.actorId)
  const named = pending.namedType
  if (named) {
    const ownCopies = pending.cardTypes.includes(named) ? 1 : 0
    const available = game.discard.filter((type) => type === named).length - ownCopies
    if (available > 0) {
      game.discard.splice(game.discard.indexOf(named), 1)
      actor.hand.push(mintCard(game, named))
      announce(game, `${actor.name} 從棄牌區取回一張${label(named)}`)
      resumeTurn(game, now)
      return
    }
  }

  announce(game, '棄牌區沒有指定的牌，五彩繽紛無效')
  resumeTurn(game, now)
}

function resolveCard(game: StoredExplodingKittens, pending: StoredExplodingKittensPending, now: number): void {
  const actorId = pending.actorId
  const actorName = nameOf(game, actorId)
  switch (pending.cardTypes[0]) {
    case 'attack': {
      const nextId = nextAliveId(game, actorId)
      announce(game, `${actorName} 攻擊！${nameOf(game, nextId)} 需要進行兩回合`)
      beginTurn(game, nextId, 2, now)
      return
    }
    case 'skip':
      announce(game, `${actorName} 使用跳過`)
      endTurn(game, actorId, now)
      return
    case 'favor':
      resolveFavor(game, pending, now)
      return
    case 'shuffle':
      shuffle(game.drawPile)
      game.peek = null
      announce(game, `${actorName} 洗混了牌堆`)
      resumeTurn(game, now)
      return
    case 'see-the-future':
      game.peek = game.drawPile.slice(0, 3).map((card) => card.type)
      announce(game, `${actorName} 預見了未來`)
      resumeTurn(game, now)
      return
    default:
      resumeTurn(game, now)
  }
}

function resolveNopeWindow(game: StoredExplodingKittens, now: number): void {
  const pending = game.pending
  if (!pending) {
    throw new Error('Exploding Kittens nope window has no pending play.')
  }

  if (pending.nopeCount % 2 === 1) {
    announce(game, `${nameOf(game, pending.actorId)} 的${effectName(pending)}被休想取消`)
    resumeTurn(game, now)
    return
  }

  switch (pending.playKind) {
    case 'pair':
      resolvePair(game, pending, now)
      return
    case 'triple':
      resolveTriple(game, pending, now)
      return
    case 'five':
      resolveFive(game, pending, now)
      return
    default:
      resolveCard(game, pending, now)
  }
}

function randomGive(game: StoredExplodingKittens, now: number): void {
  const pending = game.pending
  if (!pending || pending.targetId === null) {
    resumeTurn(game, now)
    return
  }

  const target = aliveTarget(game, pending.targetId)
  const receiver = requireSeat(game, pending.actorId)
  if (target && target.hand.length > 0) {
    receiver.hand.push(removeRandom(target.hand))
    announce(game, `${target.name} 超時，系統隨機給出一張牌`)
  } else {
    announce(game, '恩惠對象沒有可給的牌')
  }
  resumeTurn(game, now)
}

function randomDefuse(game: StoredExplodingKittens, now: number): void {
  const pending = game.pending
  if (!pending || !pending.kitten) {
    throw new Error('Exploding Kittens defuse has no kitten to place.')
  }

  const actorId = pending.actorId
  game.drawPile.splice(randomIndex(game.drawPile.length + 1), 0, pending.kitten)
  announce(game, `${nameOf(game, actorId)} 超時，系統隨機放回爆炸貓`)
  endTurn(game, actorId, now)
}

export function processExplodingKittensTimers(game: StoredExplodingKittens, now: number): boolean {
  let changed = false
  for (let step = 0; step < MAX_TIMER_STEPS; step += 1) {
    if (game.phaseEndsAt === null || now < game.phaseEndsAt) {
      break
    }

    changed = true
    if (game.phase === 'turn') {
      if (game.currentPlayerId === null) {
        throw new Error('Exploding Kittens turn has no current player.')
      }
      drawCard(game, game.currentPlayerId, now, true)
    } else if (game.phase === 'nope') {
      resolveNopeWindow(game, now)
    } else if (game.phase === 'favor') {
      randomGive(game, now)
    } else if (game.phase === 'defuse') {
      randomDefuse(game, now)
    } else {
      break
    }
  }
  return changed
}

export function applyExplodingKittensAction(
  game: StoredExplodingKittens,
  playerId: string,
  action: string,
  payload: Record<string, unknown>,
  now: number,
): GameActionResult {
  switch (action) {
    case 'play':
      return playCards(game, playerId, payload, now)
    case 'draw':
      return drawAction(game, playerId, now)
    case 'nope':
      return playNope(game, playerId, payload, now)
    case 'give':
      return giveCard(game, playerId, payload, now)
    case 'defuse':
      return placeDefuse(game, playerId, payload, now)
    default:
      return fail('UNKNOWN_GAME_ACTION', '爆炸貓不支援這個操作。')
  }
}

export function leaveExplodingKittens(game: StoredExplodingKittens, playerId: string, now: number): boolean {
  const seat = findSeat(game, playerId)
  if (!seat || seat.status !== 'alive' || game.phase === 'finished') {
    return false
  }

  seat.status = 'left'
  game.discard.push(...seat.hand.map((card) => card.type))
  seat.hand = []
  game.eliminationOrder.push(playerId)
  announce(game, `${seat.name} 離開了遊戲`)

  const pending = game.pending
  if (game.currentPlayerId === playerId) {
    if (pending?.kind === 'defuse' && pending.kitten) {
      game.drawPile.splice(randomIndex(game.drawPile.length + 1), 0, pending.kitten)
    }
    if (!finishIfOver(game)) {
      beginTurn(game, nextAliveId(game, playerId), 1, now)
    }
    return true
  }

  if (game.phase === 'favor' && pending?.targetId === playerId) {
    resumeTurn(game, now)
  }
  finishIfOver(game)
  return true
}

export function createExplodingKittensGame(
  players: Array<{ id: string; name: string }>,
  settings: ExplodingKittensSettings,
  now: number,
): StoredExplodingKittens {
  const count = players.length
  if (count < 2 || count > EXPLODING_KITTENS_MAX_PLAYERS) {
    throw new Error(`Exploding Kittens requires between 2 and ${EXPLODING_KITTENS_MAX_PLAYERS} players.`)
  }

  const deckCount = count > SINGLE_DECK_MAX_PLAYERS ? 2 : 1
  const game: StoredExplodingKittens = {
    gameId: 'exploding-kittens',
    phase: 'turn',
    startingPlayerCount: count,
    seats: players.map(
      (player): StoredExplodingKittensSeat => ({
        id: player.id,
        name: player.name,
        status: 'alive',
        hand: [],
      }),
    ),
    currentPlayerId: null,
    turnsLeft: 0,
    drawPile: [],
    discard: [],
    turnPlays: [],
    lastTurnPlays: [],
    pending: null,
    peek: null,
    announcements: [],
    phaseEndsAt: null,
    settings: { ...settings },
    eliminationOrder: [],
    winnerId: null,
    cardSeq: 0,
  }

  const pool: ExplodingKittensCardType[] = []
  for (let deck = 0; deck < deckCount; deck += 1) {
    for (const [type, copies] of DECK_COPIES) {
      for (let copy = 0; copy < copies; copy += 1) {
        pool.push(type)
      }
    }
  }

  const defuseTypes = pool.filter((type) => type === 'defuse')
  const otherTypes = pool.filter((type) => type !== 'defuse' && type !== 'exploding-kitten')
  shuffle(otherTypes)

  for (const seat of game.seats) {
    const dealt = otherTypes.splice(0, DEAL_SIZE).map((type) => mintCard(game, type))
    seat.hand = [...dealt, mintCard(game, 'defuse')]
  }

  const pileTypes: ExplodingKittensCardType[] = [...otherTypes]
  for (let index = count; index < defuseTypes.length; index += 1) {
    pileTypes.push('defuse')
  }
  for (let index = 1; index < count; index += 1) {
    pileTypes.push('exploding-kitten')
  }
  shuffle(pileTypes)
  game.drawPile = pileTypes.map((type) => mintCard(game, type))

  const starter = game.seats[randomIndex(count)]
  beginTurn(game, starter.id, 1, now)
  return game
}

export { maxDefusePosition }
