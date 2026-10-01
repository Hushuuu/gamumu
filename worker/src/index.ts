import { isRecord } from '../../shared/protocol'
import type { Env } from './env'
import {
  createBetaSessionToken,
  createRoomCode,
  createSessionToken,
  hashSessionToken,
  parseBetaCodes,
  readBearerToken,
  readWebSocketBetaToken,
  verifyBetaSessionToken,
} from './security'
import { GameRoom } from './rooms/GameRoom'

export { GameRoom }

const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/
const MAX_BODY_LENGTH = 2_048
const MIN_BETA_SESSION_SECRET_LENGTH = 32

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    if (origin && !isOriginAllowed(origin, env.ALLOWED_ORIGINS)) {
      return jsonResponse({ code: 'ORIGIN_NOT_ALLOWED', message: '此網站來源尚未設定為允許的遊戲前端。' }, 403)
    }

    if (request.method === 'OPTIONS') {
      return addCorsHeaders(new Response(null, { status: 204 }), origin)
    }

    const response = await routeRequest(request, env)
    return response.status === 101 ? response : addCorsHeaders(response, origin)
  },
}

async function routeRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/api/beta/redeem') {
    if (request.method !== 'POST') {
      return jsonResponse({ code: 'METHOD_NOT_ALLOWED', message: '此路徑只接受 POST。' }, 405)
    }

    const betaConfig = getBetaConfig(env)
    if (!betaConfig) {
      return betaNotConfiguredResponse()
    }

    const body = await readJsonObject(request)
    if (!body) {
      return jsonResponse({ code: 'INVALID_BODY', message: '請求內容必須是 JSON 物件。' }, 400)
    }

    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    if (!betaConfig.codes.includes(code)) {
      return jsonResponse({ code: 'BETA_CODE_INVALID', message: '封測碼不正確，請確認後再試。' }, 401)
    }

    return jsonResponse(await createBetaSessionToken(code, betaConfig.secret))
  }

  if (url.pathname === '/api/beta/session') {
    if (request.method !== 'GET') {
      return jsonResponse({ code: 'METHOD_NOT_ALLOWED', message: '此路徑只接受 GET。' }, 405)
    }

    const betaConfig = getBetaConfig(env)
    if (!betaConfig) {
      return betaNotConfiguredResponse()
    }

    const token = readBearerToken(request)
    const expiresAt = token
      ? await verifyBetaSessionToken(token, betaConfig.secret, betaConfig.codes)
      : null
    if (!expiresAt) {
      return betaAccessRequiredResponse()
    }

    return jsonResponse({ expiresAt })
  }

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return jsonResponse({ status: 'ok' })
  }

  const roomRoute = /^\/api\/rooms\/([^/]+)\/(join|ws)$/.exec(url.pathname)
  if (url.pathname === '/api/rooms' || roomRoute) {
    const betaConfig = getBetaConfig(env)
    if (!betaConfig) {
      return betaNotConfiguredResponse()
    }

    const token = roomRoute?.[2] === 'ws'
      ? readWebSocketBetaToken(request)
      : readBearerToken(request)
    const expiresAt = token
      ? await verifyBetaSessionToken(token, betaConfig.secret, betaConfig.codes)
      : null
    if (!expiresAt) {
      return betaAccessRequiredResponse()
    }
  }

  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    const body = await readJsonObject(request)
    if (!body) {
      return jsonResponse({ code: 'INVALID_BODY', message: '請求內容必須是 JSON 物件。' }, 400)
    }

    const name = normalizePlayerName(body.name)
    if (!name) {
      return jsonResponse({ code: 'INVALID_NAME', message: '暱稱請填 1 到 20 個字元。' }, 400)
    }

    return createRoom(env, name)
  }

  if (!roomRoute) {
    return jsonResponse({ code: 'NOT_FOUND', message: '找不到這個 API 路徑。' }, 404)
  }

  const code = roomRoute[1]!.toUpperCase()
  if (!ROOM_CODE_PATTERN.test(code)) {
    return jsonResponse({ code: 'INVALID_ROOM_CODE', message: '房間代碼格式不正確。' }, 400)
  }

  const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code))
  if (roomRoute[2] === 'ws') {
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return jsonResponse({ code: 'WEBSOCKET_REQUIRED', message: '此路徑需要 WebSocket 連線。' }, 426)
    }
    return stub.fetch(request)
  }

  if (request.method !== 'POST') {
    return jsonResponse({ code: 'METHOD_NOT_ALLOWED', message: '此路徑只接受 POST。' }, 405)
  }

  const body = await readJsonObject(request)
  if (!body) {
    return jsonResponse({ code: 'INVALID_BODY', message: '請求內容必須是 JSON 物件。' }, 400)
  }

  const name = normalizePlayerName(body.name)
  if (!name) {
    return jsonResponse({ code: 'INVALID_NAME', message: '暱稱請填 1 到 20 個字元。' }, 400)
  }

  const playerId = crypto.randomUUID()
  const token = createSessionToken()
  const tokenHash = await hashSessionToken(token)
  const roomResponse = await stub.fetch(
    new Request('https://game-room/internal/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, name, tokenHash }),
    }),
  )

  if (!roomResponse.ok) {
    return roomResponse
  }

  return jsonResponse({ code, playerId, token }, 201)
}

async function createRoom(env: Env, name: string): Promise<Response> {
  const playerId = crypto.randomUUID()
  const token = createSessionToken()
  const tokenHash = await hashSessionToken(token)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRoomCode()
    const stub = env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code))
    const roomResponse = await stub.fetch(
      new Request('https://game-room/internal/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, playerId, name, tokenHash }),
      }),
    )

    if (roomResponse.status === 409) {
      continue
    }

    if (!roomResponse.ok) {
      return roomResponse
    }

    return jsonResponse({ code, playerId, token }, 201)
  }

  return jsonResponse(
    { code: 'ROOM_CODE_UNAVAILABLE', message: '目前無法產生房間代碼，請稍後再試。' },
    503,
  )
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (contentLength > MAX_BODY_LENGTH) {
    return null
  }

  try {
    const value: unknown = await request.json()
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function normalizePlayerName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const name = value.trim().replace(/\s+/g, ' ')
  const length = Array.from(name).length
  return length >= 1 && length <= 20 ? name : null
}

function isOriginAllowed(origin: string, allowedOrigins: string | undefined): boolean {
  return (allowedOrigins ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(origin)
}

function getBetaConfig(env: Env): { codes: string[]; secret: string } | null {
  const codes = parseBetaCodes(env.BETA_CODES)
  const secret = env.BETA_SESSION_SECRET?.trim()
  if (!codes || !secret || secret.length < MIN_BETA_SESSION_SECRET_LENGTH) {
    return null
  }

  return { codes, secret }
}

function betaNotConfiguredResponse(): Response {
  return jsonResponse(
    { code: 'BETA_NOT_CONFIGURED', message: '封測驗證尚未完成設定，請稍後再試。' },
    503,
  )
}

function betaAccessRequiredResponse(): Response {
  return jsonResponse(
    { code: 'BETA_ACCESS_REQUIRED', message: '封測驗證已失效，請重新輸入封測碼。' },
    401,
  )
}

function addCorsHeaders(response: Response, origin: string | null): Response {
  if (!origin) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  headers.set('Vary', 'Origin')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
