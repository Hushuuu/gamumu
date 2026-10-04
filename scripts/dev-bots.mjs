// 本機測試用：讓機器人加入既有房間、自動 Ready 並自動遊玩阿瓦隆、狼人殺與拉密。
// npm run dev:bots -- <房間代碼> <機器人數量=5> <API_URL> <BETA_CODE>
// 打包 Windows EXE：npm run build:dev-bots:exe -- <API_URL>；EXE 啟動後會互動輸入房間代碼、數量與封測碼。
// Ctrl+C 會讓機器人離開房間。

import { createInterface } from 'node:readline/promises'

const PACKAGED_API_URL = ''
const isPackagedExecutable = typeof process.pkg !== 'undefined'

async function promptForBotOptions() {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const roomCode = (await prompt.question('房間代碼：')).trim()
    const countArg = (await prompt.question('機器人數量（空白使用 5）：')).trim() || '5'
    const betaCode = (await prompt.question('封測碼：')).trim()
    return { roomCode, countArg, betaCode }
  } finally {
    prompt.close()
  }
}

const interactiveOptions = isPackagedExecutable ? await promptForBotOptions() : null
const code = isPackagedExecutable ? interactiveOptions.roomCode : process.argv[2]
const countArg = isPackagedExecutable ? interactiveOptions.countArg : process.argv[3]
const count = Number(countArg ?? 5)
const API = (
  isPackagedExecutable
    ? PACKAGED_API_URL
    : process.env.API_URL || process.argv[4] || 'http://127.0.0.1:8787'
).replace(/\/$/, '')
const BETA_CODE = isPackagedExecutable
  ? interactiveOptions.betaCode
  : process.env.BETA_CODE || process.argv[5]?.trim()

//console.log(`API URL: ${API}`)
console.log(`房間代碼: ${code}, 機器人數量: ${count}`)

if (isPackagedExecutable && !PACKAGED_API_URL) {
  console.error('EXE 未寫入 API_URL，請重新打包並指定 API_URL。')
  process.exit(1)
}
if (!code) {
  console.error('請輸入房間代碼。')
  process.exit(1)
}
if (!Number.isInteger(count) || count < 1) {
  console.error('機器人數量必須是大於 0 的整數。')
  process.exit(1)
}
if (!BETA_CODE) {
  console.error('未提供封測碼，請互動輸入、設定 BETA_CODE 或傳入最後一個位置參數。')
  process.exit(1)
}

const pick = (items) => items[Math.floor(Math.random() * items.length)]
const later = (fn, min = 300, max = 1500) => setTimeout(fn, min + Math.random() * (max - min))
const AVALON_PRIVATE_EVENT = 'avalon-private-state'
const AVALON_MISSION_FAILURE_RATES = {
  '0-0': 0.4,
  '1-0': 0.55,
  '2-0': 0.85,
  '0-1': 0.3,
  '0-2': 0.2,
  '1-1': 0.5,
  '1-2': 0.15,
  '2-1': 0.75,
  '2-2': 1,
}
const RUMMIKUB_COLORS = ['red', 'blue', 'black', 'yellow']
const RUMMIKUB_SEARCH_LIMIT = 50000
const RUMMIKUB_FACES = RUMMIKUB_COLORS.flatMap((color) =>
  Array.from({ length: 13 }, (_value, index) => ({ color, value: index + 1 })),
)
const RUMMIKUB_SHAPES_BY_FACE = new Map()

function rummikubFaceKey(face) {
  return `${face.color}/${face.value}`
}

function pickUnique(items, count) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[otherIndex]
    shuffled[otherIndex] = current
  }
  return shuffled.slice(0, count)
}

function getAvalonKnownEvilIds(playerId, priv) {
  const evilIds = new Set(
    (priv.knownPlayers ?? [])
      .filter((player) => player.knowledge === 'evil')
      .map((player) => player.playerId),
  )
  if (priv.camp === 'evil') {
    evilIds.add(playerId)
  }
  return evilIds
}

function getAvalonMissionFailureRate(game) {
  const successCount = game.missions.filter((mission) => mission.outcome === 'success').length
  const failureCount = game.missions.filter((mission) => mission.outcome === 'failure').length
  const rate = AVALON_MISSION_FAILURE_RATES[`${successCount}-${failureCount}`]
  if (rate === undefined) {
    throw new Error(`阿瓦隆任務失敗率未設定：${successCount} 成功 / ${failureCount} 失敗`)
  }
  return rate
}

function pickAvalonTeam(game, playerId, priv) {
  const teamIds = []
  const knownEvilIds = getAvalonKnownEvilIds(playerId, priv)
  const eligiblePlayerIds = new Set(
    game.seatIds.filter((id) => priv.camp === 'evil' || !knownEvilIds.has(id)),
  )
  const previousSuccessfulMission = [...game.missions]
    .reverse()
    .find((mission) => mission.outcome === 'success')

  function addRandomPlayer(candidates) {
    const available = candidates.filter((id) => eligiblePlayerIds.has(id) && !teamIds.includes(id))
    if (available.length) {
      teamIds.push(pick(available))
    }
  }

  if (previousSuccessfulMission) {
    addRandomPlayer(previousSuccessfulMission.teamIds)
  }

  if (priv.camp === 'evil') {
    addRandomPlayer(game.seatIds.filter((id) => knownEvilIds.has(id)))
  }

  const remaining = game.seatIds.filter((id) => eligiblePlayerIds.has(id) && !teamIds.includes(id))
  teamIds.push(...pickUnique(remaining, game.teamSize - teamIds.length))
  return teamIds
}

function shouldApproveAvalonTeam(game, playerId, priv) {
  if (game.leaderId === playerId) {
    return true
  }

  const knownEvilIds = getAvalonKnownEvilIds(playerId, priv)
  if (priv.roleId === 'merlin' && !game.teamIds.some((id) => knownEvilIds.has(id))) {
    return true
  }

  return Math.random() < 0.6
}

function addRummikubShape(faces) {
  for (const face of faces) {
    const key = rummikubFaceKey(face)
    const shapes = RUMMIKUB_SHAPES_BY_FACE.get(key) ?? []
    shapes.push(faces)
    RUMMIKUB_SHAPES_BY_FACE.set(key, shapes)
  }
}

for (let value = 1; value <= 13; value += 1) {
  for (let colorMask = 0; colorMask < 1 << RUMMIKUB_COLORS.length; colorMask += 1) {
    const colors = RUMMIKUB_COLORS.filter((_color, index) => colorMask & (1 << index))
    if (colors.length >= 3) {
      addRummikubShape(colors.map((color) => ({ color, value })))
    }
  }
}

for (const color of RUMMIKUB_COLORS) {
  for (let start = 1; start <= 11; start += 1) {
    for (let end = start + 2; end <= 13; end += 1) {
      addRummikubShape(
        Array.from({ length: end - start + 1 }, (_value, index) => ({
          color,
          value: start + index,
        })),
      )
    }
  }
}

function rummikubTileMask(tileId) {
  return 1n << BigInt(tileId)
}

function rummikubHandMask(handIndex) {
  return 1n << BigInt(handIndex)
}

function spendRummikubSearchBudget(budget) {
  if (!budget) {
    return true
  }

  budget.work += 1
  if (budget.work > budget.max) {
    budget.exhausted = true
    return false
  }
  return true
}

function getRummikubMeldOptions(anchor, pool, context) {
  const {
    handIndexById,
    remainingTableMask,
    usedHandMask,
    protectedTableMasks = [],
    budget = null,
  } = context
  const targetFaces = anchor.kind === 'number'
    ? [{ color: anchor.color, value: anchor.value }]
    : anchor.source === 'table'
      ? [anchor.representedAs]
      : RUMMIKUB_FACES
  const options = new Map()

  for (const targetFace of targetFaces) {
    const shapes = RUMMIKUB_SHAPES_BY_FACE.get(rummikubFaceKey(targetFace)) ?? []
    for (const faces of shapes) {
      if (budget?.exhausted) {
        return [...options.values()]
      }

      const anchorIndex = faces.findIndex((face) => rummikubFaceKey(face) === rummikubFaceKey(targetFace))
      const choices = faces.map((face, index) => {
        if (index === anchorIndex) {
          return [anchor]
        }

        return pool
          .filter((tile) => {
            if (tile.id === anchor.id) {
              return false
            }

            if (tile.source === 'table') {
              if ((remainingTableMask & rummikubTileMask(tile.id)) === 0n) {
                return false
              }
              return tile.kind === 'number'
                ? tile.color === face.color && tile.value === face.value
                : tile.representedAs.color === face.color &&
                  tile.representedAs.value === face.value
            }

            const handIndex = handIndexById.get(tile.id)
            if (
              handIndex === undefined ||
              (usedHandMask & rummikubHandMask(handIndex)) !== 0n
            ) {
              return false
            }
            return tile.kind === 'number'
              ? tile.color === face.color && tile.value === face.value
              : true
          })
          .sort((left, right) => Number(right.source === 'hand') - Number(left.source === 'hand'))
      })

      if (choices.some((items) => items.length === 0)) {
        continue
      }

      const selectedIds = new Set([anchor.id])
      const selected = [{ tile: anchor, face: targetFace }]

      function addOption() {
        const tableMask = selected.reduce((mask, item) => {
          return item.tile.source === 'table'
            ? mask | rummikubTileMask(item.tile.id)
            : mask
        }, 0n)
        if (protectedTableMasks.some((mask) => {
          const overlap = tableMask & mask
          return overlap !== 0n && overlap !== mask
        })) {
          return
        }

        const handMask = selected.reduce((mask, item) => {
          if (item.tile.source !== 'hand') {
            return mask
          }
          const handIndex = handIndexById.get(item.tile.id)
          return handIndex === undefined ? mask : mask | rummikubHandMask(handIndex)
        }, 0n)
        const tiles = selected.map(({ tile, face }) => {
          return tile.kind === 'joker'
            ? { id: tile.id, kind: 'joker', representedAs: { ...face } }
            : { id: tile.id, kind: 'number', color: tile.color, value: tile.value }
        })
        const tileIds = tiles.map((tile) => tile.id).sort((left, right) => left - right)
        const jokers = tiles
          .filter((tile) => tile.kind === 'joker')
          .map((tile) => `${tile.id}:${rummikubFaceKey(tile.representedAs)}`)
          .sort()
        const key = `${tileIds.join(',')}|${jokers.join(',')}`
        if (options.has(key) || !spendRummikubSearchBudget(budget)) {
          return
        }

        const points = tiles.reduce((total, tile) => {
          return total + (tile.kind === 'joker' ? tile.representedAs.value : tile.value)
        }, 0)
        options.set(key, {
          tiles,
          tableMask,
          handMask,
          handCount: selected.filter((item) => item.tile.source === 'hand').length,
          tileCount: tiles.length,
          points,
        })
      }

      function chooseFace(index) {
        if (budget?.exhausted) {
          return
        }
        if (index === faces.length) {
          addOption()
          return
        }
        if (index === anchorIndex) {
          chooseFace(index + 1)
          return
        }

        for (const tile of choices[index]) {
          if (selectedIds.has(tile.id)) {
            continue
          }
          selectedIds.add(tile.id)
          selected.push({ tile, face: faces[index] })
          chooseFace(index + 1)
          selected.pop()
          selectedIds.delete(tile.id)
          if (budget?.exhausted) {
            return
          }
        }
      }

      chooseFace(0)
    }
  }

  return [...options.values()].sort((left, right) => {
    return (
      right.handCount - left.handCount ||
      right.tileCount - left.tileCount ||
      right.points - left.points
    )
  })
}

function getBestRummikubHandMelds(hand, minimumPoints = 0) {
  const handTiles = hand.map((tile) => ({ ...tile, source: 'hand' }))
  if (handTiles.length === 0) {
    return null
  }

  const handIndexById = new Map(handTiles.map((tile, index) => [tile.id, index]))
  const candidateMap = new Map()
  const budget = { work: 0, max: RUMMIKUB_SEARCH_LIMIT, exhausted: false }
  const context = {
    handIndexById,
    remainingTableMask: 0n,
    usedHandMask: 0n,
    protectedTableMasks: [],
    budget,
  }

  for (const anchor of handTiles) {
    for (const option of getRummikubMeldOptions(anchor, handTiles, context)) {
      if (option.tableMask === 0n && option.handMask !== 0n) {
        const key = `${option.handMask}/${option.tiles
          .filter((tile) => tile.kind === 'joker')
          .map((tile) => `${tile.id}:${rummikubFaceKey(tile.representedAs)}`)
          .sort()
          .join(',')}`
        candidateMap.set(key, option)
      }
    }
  }

  const optionsByIndex = Array.from({ length: handTiles.length }, () => [])
  for (const option of candidateMap.values()) {
    for (let index = 0; index < handTiles.length; index += 1) {
      if ((option.handMask & rummikubHandMask(index)) !== 0n) {
        optionsByIndex[index].push(option)
      }
    }
  }
  for (const options of optionsByIndex) {
    options.sort((left, right) => right.tileCount - left.tileCount || right.points - left.points)
  }

  const memo = new Map()
  function solve(remainingMask, pointsNeeded) {
    const key = `${remainingMask}/${pointsNeeded}`
    if (memo.has(key)) {
      return memo.get(key)
    }
    if (remainingMask === 0n) {
      const result = pointsNeeded === 0
        ? { melds: [], tileCount: 0, points: 0 }
        : null
      memo.set(key, result)
      return result
    }

    let firstIndex = 0
    while ((remainingMask & rummikubHandMask(firstIndex)) === 0n) {
      firstIndex += 1
    }

    const firstMask = rummikubHandMask(firstIndex)
    let best = solve(remainingMask ^ firstMask, pointsNeeded)
    for (const option of optionsByIndex[firstIndex]) {
      if ((option.handMask & remainingMask) !== option.handMask) {
        continue
      }
      const rest = solve(
        remainingMask ^ option.handMask,
        Math.max(0, pointsNeeded - option.points),
      )
      if (!rest) {
        continue
      }

      const candidate = {
        melds: [option, ...rest.melds],
        tileCount: option.tileCount + rest.tileCount,
        points: option.points + rest.points,
      }
      if (
        !best ||
        candidate.tileCount > best.tileCount ||
        (candidate.tileCount === best.tileCount && candidate.points > best.points)
      ) {
        best = candidate
      }
    }

    memo.set(key, best)
    return best
  }

  return solve(
    (1n << BigInt(handTiles.length)) - 1n,
    minimumPoints,
  )
}

function* rummikubCombinations(items, size, start = 0, selected = []) {
  if (selected.length === size) {
    yield [...selected]
    return
  }

  for (let index = start; index <= items.length - (size - selected.length); index += 1) {
    selected.push(items[index])
    yield* rummikubCombinations(items, size, index + 1, selected)
    selected.pop()
  }
}

function findRummikubRearrangement(game, hand) {
  const handTiles = hand.map((tile) => ({ ...tile, source: 'hand' }))
  const handIndexById = new Map(handTiles.map((tile, index) => [tile.id, index]))
  const tableIndices = game.table.map((_meld, index) => index)
  const budget = { work: 0, max: RUMMIKUB_SEARCH_LIMIT, exhausted: false }

  // Rearranging one or two existing melds keeps the local bot's search bounded.
  for (let subsetSize = 1; subsetSize <= Math.min(2, tableIndices.length); subsetSize += 1) {
    for (const selectedIndices of rummikubCombinations(tableIndices, subsetSize)) {
      if (budget.exhausted) {
        return null
      }

      const selectedSet = new Set(selectedIndices)
      const selectedMelds = selectedIndices.map((index) => game.table[index])
      const tableTiles = selectedMelds.flatMap((meld) => {
        return meld.tiles.map((tile) => ({ ...tile, source: 'table' }))
      })
      const pool = [...tableTiles, ...handTiles]
      // Keep table Joker melds together to satisfy the server's replacement rule.
      const protectedTableMasks = selectedMelds
        .filter((meld) => meld.tiles.some((tile) => tile.kind === 'joker'))
        .map((meld) => {
          return meld.tiles.reduce((mask, tile) => mask | rummikubTileMask(tile.id), 0n)
        })
      const initialTableMask = tableTiles.reduce((mask, tile) => {
        return mask | rummikubTileMask(tile.id)
      }, 0n)
      const optionCache = new Map()
      const visited = new Set()

      function solve(remainingTableMask, usedHandMask, melds) {
        if (remainingTableMask === 0n) {
          return usedHandMask === 0n ? null : melds
        }
        if (budget.exhausted || !spendRummikubSearchBudget(budget)) {
          return null
        }

        const key = `${remainingTableMask}/${usedHandMask}`
        if (visited.has(key)) {
          return null
        }
        visited.add(key)

        const anchor = tableTiles.find((tile) => {
          return (remainingTableMask & rummikubTileMask(tile.id)) !== 0n
        })
        if (!anchor) {
          return null
        }

        let options = optionCache.get(key)
        if (!options) {
          options = getRummikubMeldOptions(anchor, pool, {
            handIndexById,
            remainingTableMask,
            usedHandMask,
            protectedTableMasks,
            budget,
          })
          optionCache.set(key, options)
        }
        if (budget.exhausted) {
          return null
        }

        for (const option of options) {
          if (
            option.tableMask === 0n ||
            (option.tableMask & remainingTableMask) !== option.tableMask ||
            (option.handMask & usedHandMask) !== 0n
          ) {
            continue
          }

          const result = solve(
            remainingTableMask ^ option.tableMask,
            usedHandMask | option.handMask,
            [...melds, option],
          )
          if (result) {
            return result
          }
          if (budget.exhausted) {
            return null
          }
        }
        return null
      }

      const rearrangedMelds = solve(initialTableMask, 0n, [])
      if (rearrangedMelds) {
        return game.table
          .filter((_meld, index) => !selectedSet.has(index))
          .concat(rearrangedMelds.map((option) => ({ tiles: option.tiles })))
      }
    }
  }
  return null
}

function createRummikubPayload(melds) {
  return {
    melds: melds.map((meld) => meld.tiles.map((tile) => tile.id)),
    jokers: melds.flatMap((meld) => {
      return meld.tiles
        .filter((tile) => tile.kind === 'joker')
        .map((tile) => ({
          tileId: tile.id,
          representedAs: { ...tile.representedAs },
        }))
    }),
  }
}

function findRummikubMove(game, hand) {
  const ownPlayer = game.players.find((player) => player.id === game.currentPlayerId)
  if (!ownPlayer) {
    return null
  }

  const handMelds = getBestRummikubHandMelds(hand, ownPlayer.hasOpened ? 0 : 30)
  if (handMelds?.tileCount > 0) {
    return createRummikubPayload([
      ...game.table,
      ...handMelds.melds.map((option) => ({ tiles: option.tiles })),
    ])
  }

  if (!ownPlayer.hasOpened) {
    return null
  }

  const rearrangedMelds = findRummikubRearrangement(game, hand)
  return rearrangedMelds ? createRummikubPayload(rearrangedMelds) : null
}

class Bot {
  constructor(name, credentials, betaToken) {
    this.name = name
    this.id = credentials.playerId
    this.state = null
    this.priv = null
    this.avalonPriv = null
    this.lastKey = ''
    this.lastAvalonKey = ''
    this.lastRummikubTurnKey = ''
    this.ws = new WebSocket(
      `${API.replace(/^http/, 'ws')}/api/rooms/${credentials.code}/ws`,
      ['gamumu-beta', `gamumu-beta.${betaToken}`],
    )
    this.ws.onopen = () => this.send({ type: 'authenticate', token: credentials.token })
    this.ws.onmessage = (event) => this.onMessage(JSON.parse(event.data))
    this.ws.onclose = () => console.log(`[${this.name}] 連線中斷`)
  }

  send(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  action(gameId, action, payload = {}) {
    this.send({ type: 'game_action', gameId, action, payload })
  }

  onMessage(message) {
    if (message.type === 'state') {
      this.state = message.state
      this.think()
    } else if (
      message.type === 'game_event' &&
      (
        message.event === 'private-state' ||
        message.event === 'rummikub-private-state' ||
        message.event === AVALON_PRIVATE_EVENT
      )
    ) {
      if (message.event === AVALON_PRIVATE_EVENT) {
        this.avalonPriv = message.payload
      } else {
        this.priv = message.payload
      }
      this.think(message.event)
    } else if (message.type === 'kicked' || message.type === 'room_expired') {
      console.log(`[${this.name}] ${message.type}`)
      this.ws.close()
    }
  }

  think(privateEvent = '') {
    const state = this.state
    if (state?.status !== 'playing' || state.game?.gameId !== 'rummikub') {
      this.lastRummikubTurnKey = ''
    }
    if (state?.status !== 'playing' || state.game?.gameId !== 'avalon') {
      this.lastAvalonKey = ''
      this.avalonPriv = null
    }
    const me = state?.players.find((player) => player.id === this.id)
    if (!me) return

    if (state.status === 'waiting') {
      if (!me.ready) later(() => this.send({ type: 'set_ready', ready: true }), 200, 1000)
      return
    }

    const game = state.game
    if (state.status !== 'playing' || !game) return

    if (game.gameId === 'word-guess' && game.phase === 'guessing' && !me.answered) {
      later(() => this.send({ type: 'submit_answer', answer: 'bot' }), 500, 4000)
    } else if (game.gameId === 'avalon') {
      this.thinkAvalon(game)
    } else if (game.gameId === 'werewolf') {
      this.thinkWerewolf(game)
    } else if (game.gameId === 'rummikub' && privateEvent === 'rummikub-private-state') {
      this.thinkRummikub(game)
    }
  }

  thinkAvalon(game) {
    const phaseKey = (currentGame) => [
      currentGame.phase,
      currentGame.missionNumber,
      currentGame.leaderId,
      currentGame.rejectedTeams,
      currentGame.teamIds.join(','),
      currentGame.lakeHolderId ?? '',
      currentGame.lakeVisitedIds.length,
    ].join('/')
    const actionKey = phaseKey(game)
    let action = ''
    let payload = {}

    if (game.phase === 'role-reveal') {
      action = 'confirm-role'
    } else if (game.phase === 'team-selection' && game.leaderId === this.id) {
      const priv = this.avalonPriv
      if (!priv || priv.stateVersion !== game.stateVersion) return
      action = 'propose-team'
      payload = { teamIds: pickAvalonTeam(game, this.id, priv) }
    } else if (game.phase === 'team-vote') {
      const priv = this.avalonPriv
      if (!priv || priv.stateVersion !== game.stateVersion) return
      action = 'vote-team'
      payload = { approve: shouldApproveAvalonTeam(game, this.id, priv) }
    } else if (game.phase === 'mission' && game.teamIds.includes(this.id)) {
      const priv = this.avalonPriv
      if (!priv || priv.stateVersion !== game.stateVersion) return
      action = 'submit-mission'

      if (priv.camp === 'evil') {
        const knownEvilIds = getAvalonKnownEvilIds(this.id, priv)
        const evilCountOnTeam = game.teamIds.filter((id) => knownEvilIds.has(id)).length
        if (evilCountOnTeam === 0) {
          throw new Error('阿瓦隆任務隊伍中找不到邪惡陣營玩家。')
        }

        const overallFailureRate = getAvalonMissionFailureRate(game)
        const individualFailureRate = overallFailureRate ** (1 / evilCountOnTeam)
        payload = {
          card: Math.random() < individualFailureRate ? 'fail' : 'success',
        }
      } else {
        payload = { card: 'success' }
      }
    } else if (game.phase === 'lake-check' && game.lakeHolderId === this.id) {
      const targets = game.seatIds.filter((id) => !game.lakeVisitedIds.includes(id))
      if (!targets.length) return
      action = 'check-lake'
      payload = { targetId: pick(targets) }
    } else if (game.phase === 'assassination') {
      const priv = this.avalonPriv
      if (!priv || priv.stateVersion !== game.stateVersion || priv.roleId !== 'assassin') return
      const targets = game.seatIds.filter((id) => id !== this.id)
      if (!targets.length) return
      action = 'assassinate'
      payload = { targetId: pick(targets) }
    }

    if (!action || actionKey === this.lastAvalonKey) return
    this.lastAvalonKey = actionKey

    later(() => {
      const currentState = this.state
      const currentGame = currentState?.game
      if (
        currentState?.status !== 'playing' ||
        currentGame?.gameId !== 'avalon' ||
        phaseKey(currentGame) !== actionKey
      ) {
        return
      }
      if (action === 'submit-mission' && !currentGame.teamIds.includes(this.id)) return
      if (action === 'check-lake' && currentGame.lakeHolderId !== this.id) return
      if (action === 'assassinate' && this.avalonPriv?.roleId !== 'assassin') return
      this.action('avalon', action, payload)
    })
  }

  thinkRummikub(game) {
    const hand = this.priv?.hand
    if (
      !Array.isArray(hand) ||
      game.currentPlayerId !== this.id
    ) {
      return
    }

    const turnKey = `${game.turnNumber}/${game.currentPlayerId}`
    if (turnKey === this.lastRummikubTurnKey) {
      return
    }
    this.lastRummikubTurnKey = turnKey

    later(() => {
      const currentGame = this.state?.game
      if (
        this.state?.status !== 'playing' ||
        currentGame?.gameId !== 'rummikub' ||
        currentGame.turnNumber !== game.turnNumber ||
        currentGame.currentPlayerId !== this.id
      ) {
        return
      }

      const move = findRummikubMove(currentGame, hand)
      if (move) {
        this.action('rummikub', 'play_turn', move)
      } else {
        this.action(
          'rummikub',
          currentGame.drawPileCount > 0 ? 'draw_tile' : 'pass_turn',
        )
      }
    }, 400, 1200)
  }

  thinkWerewolf(game) {
    const priv = this.priv
    if (!priv || priv.stateVersion !== game.stateVersion) return

    const speaker = game.speech ? game.speech.order[game.speech.index] : ''
    const key = `${game.phase}/${game.day}/${game.nightStep}/${game.shooterId ?? ''}/${speaker}`
    if (key === this.lastKey) return
    this.lastKey = key

    later(() => this.decideWerewolf(game, priv, speaker))
  }

  decideWerewolf(game, priv, speaker) {
    const act = (action, payload = {}) => this.action('werewolf', action, payload)
    const others = game.aliveIds.filter((id) => id !== this.id)

    if (game.phase === 'night' && priv.acting) {
      if (priv.role === 'werewolf') {
        const targets = others.filter((id) => !priv.teammates.includes(id))
        if (targets.length) act('wolf_target', { targetId: pick(targets) })
      } else if (priv.role === 'guard') {
        const targets = game.aliveIds.filter((id) => id !== priv.guard?.lastTargetId)
        act('guard_protect', { targetId: Math.random() < 0.9 ? pick(targets) : null })
      } else if (priv.role === 'seer' && priv.myTarget === null) {
        const targets = others.filter((id) => !priv.seerResults.some((result) => result.playerId === id))
        if (targets.length) act('seer_check', { targetId: pick(targets) })
      } else if (priv.role === 'witch' && priv.witch) {
        if (priv.witch.victimId && priv.witch.antidote && Math.random() < 0.6) {
          act('witch_action', { choice: 'save' })
        } else if (priv.witch.poison && Math.random() < 0.3) {
          act('witch_action', { choice: 'poison', targetId: pick(others) })
        } else {
          act('witch_action', { choice: 'skip' })
        }
      }
    } else if (game.phase === 'hunter-shot' && priv.canShoot) {
      act('hunter_shoot', { targetId: Math.random() < 0.8 ? pick(others) : null })
    } else if (
      (game.phase === 'day-discussion' || game.phase === 'pk-discussion') &&
      speaker === this.id
    ) {
      const minDelay = game.phase === 'pk-discussion' ? 400 : 1500
      const maxDelay = game.phase === 'pk-discussion' ? 1200 : 5000
      later(() => act('end_speech'), minDelay, maxDelay)
    } else if ((game.phase === 'vote' || game.phase === 'pk-vote') && priv.alive) {
      const eligibleTargets = game.phase === 'pk-vote'
        ? (game.pkCandidateIds ?? []).filter((id) => id !== this.id && game.aliveIds.includes(id))
        : others
      const targets = priv.camp === 'wolf'
        ? eligibleTargets.filter((id) => !priv.teammates.includes(id))
        : eligibleTargets
      act('cast_vote', { targetId: targets.length && Math.random() < 0.9 ? pick(targets) : null })
    }
  }
}

async function join(name) {
  const response = await fetch(`${API}/api/rooms/${code}/join`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${betaSession.token}`,
    },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) {
    throw new Error(`${name} 加入失敗：${response.status} ${await response.text()}`)
  }
  return response.json()
}

const betaResponse = await fetch(`${API}/api/beta/redeem`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: BETA_CODE }),
})
if (!betaResponse.ok) {
  throw new Error(`封測碼驗證失敗：${betaResponse.status} ${await betaResponse.text()}`)
}
const betaSession = await betaResponse.json()

const bots = []
for (let index = 1; index <= count; index += 1) {
  const name = `Bot${index}`
  try {
    bots.push(new Bot(name, await join(name), betaSession.token))
    console.log(`[${name}] 已加入房間 ${code}`)
  } catch (error) {
    console.error(error.message)
    break
  }
}

console.log('機器人會自動 Ready；請在瀏覽器中選擇遊戲並開始。Ctrl+C 結束並離開房間。')

process.on('SIGINT', () => {
  for (const bot of bots) bot.send({ type: 'leave_room' })
  setTimeout(() => process.exit(0), 400)
})
