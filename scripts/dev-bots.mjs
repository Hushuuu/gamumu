// 本機測試用：讓機器人加入既有房間、自動 Ready 並自動遊玩狼人殺。
// 用法：設定 BETA_CODE 後執行 npm run dev:bots -- <房間代碼> <機器人數量=5> <APIURL> <BETA_CODE>
// 環境變數 API_URL 可指定 Worker 位置（預設 http://127.0.0.1:8787）。Ctrl+C 會讓機器人離開房間。

const API = (process.env.API_URL ?? process.argv[4] ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const BETA_CODE = process.argv[5]?.trim()
const [code, countArg] = process.argv.slice(2)
const count = Number(countArg ?? 5)

console.log(`API URL: ${API}`)
console.log(`房間代碼: ${code}, 機器人數量: ${count}`)

if (!code || !Number.isInteger(count) || count < 1 || !BETA_CODE) {
  console.error('未提供BETA_CODE，請在命令列中指定。')
  process.exit(1)
}

const pick = (items) => items[Math.floor(Math.random() * items.length)]
const later = (fn, min = 300, max = 1500) => setTimeout(fn, min + Math.random() * (max - min))

class Bot {
  constructor(name, credentials, betaToken) {
    this.name = name
    this.id = credentials.playerId
    this.state = null
    this.priv = null
    this.lastKey = ''
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
    } else if (message.type === 'game_event' && message.event === 'private-state') {
      this.priv = message.payload
      this.think()
    } else if (message.type === 'kicked' || message.type === 'room_expired') {
      console.log(`[${this.name}] ${message.type}`)
      this.ws.close()
    }
  }

  think() {
    const state = this.state
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
    } else if (game.gameId === 'werewolf') {
      this.thinkWerewolf(game)
    }
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
    } else if (game.phase === 'day-discussion' && speaker === this.id) {
      later(() => act('end_speech'), 1500, 5000)
    } else if (game.phase === 'vote' && priv.alive) {
      const targets = priv.camp === 'wolf' ? others.filter((id) => !priv.teammates.includes(id)) : others
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
