import { isRecord, type RoomCredentials } from '../../shared/protocol'

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')

export interface BetaSessionCredentials {
  token: string
  expiresAt: number
}

export class ApiError extends Error {
  readonly code: string | null

  constructor(message: string, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

export async function redeemBetaCode(code: string): Promise<BetaSessionCredentials> {
  const data = await readApiResponse(await fetch(`${API_BASE}/api/beta/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  }))

  if (
    !isRecord(data) ||
    typeof data.token !== 'string' ||
    typeof data.expiresAt !== 'number' ||
    !Number.isSafeInteger(data.expiresAt)
  ) {
    throw new Error('驗證回應資料不完整，請稍後再試。')
  }

  return { token: data.token, expiresAt: data.expiresAt }
}

export async function getBetaSession(token: string): Promise<number> {
  const data = await readApiResponse(await fetch(`${API_BASE}/api/beta/session`, {
    headers: { Authorization: `Bearer ${token}` },
  }))

  if (!isRecord(data) || typeof data.expiresAt !== 'number' || !Number.isSafeInteger(data.expiresAt)) {
    throw new Error('驗證回應資料不完整，請稍後再試。')
  }

  return data.expiresAt
}

export async function createRoomRequest(name: string, betaToken: string): Promise<RoomCredentials> {
  return requestRoomCredentials('/api/rooms', { name }, betaToken)
}

export async function joinRoomRequest(
  code: string,
  name: string,
  betaToken: string,
): Promise<RoomCredentials> {
  return requestRoomCredentials(`/api/rooms/${encodeURIComponent(code)}/join`, { name }, betaToken)
}

export function createWebSocketUrl(code: string): string {
  const url = new URL(
    `${API_BASE}/api/rooms/${encodeURIComponent(code)}/ws`,
    window.location.origin,
  )
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

async function requestRoomCredentials(
  path: string,
  payload: Record<string, string>,
  betaToken: string,
): Promise<RoomCredentials> {
  const data = await readApiResponse(await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${betaToken}`,
    },
    body: JSON.stringify(payload),
  }))

  if (
    !isRecord(data) ||
    typeof data.code !== 'string' ||
    typeof data.playerId !== 'string' ||
    typeof data.token !== 'string'
  ) {
    throw new Error('伺服器回應資料不完整，請稍後再試。')
  }

  return {
    code: data.code,
    playerId: data.playerId,
    token: data.token,
  }
}

async function readApiResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  let data: unknown = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      if (response.ok) {
        throw new Error('伺服器回應格式錯誤，請稍後再試。')
      }
    }
  }

  if (!response.ok) {
    const code = isRecord(data) && typeof data.code === 'string'
      ? data.code
      : null
    const message = isRecord(data) && typeof data.message === 'string'
      ? data.message
      : `連線失敗（${response.status}），請稍後再試。`
    throw new ApiError(message, code)
  }

  return data
}
