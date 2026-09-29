import { isRecord, type RoomCredentials } from '../../shared/protocol'

const API_BASE = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')

export async function createRoomRequest(name: string): Promise<RoomCredentials> {
  return requestRoomCredentials('/api/rooms', { name })
}

export async function joinRoomRequest(code: string, name: string): Promise<RoomCredentials> {
  return requestRoomCredentials(`/api/rooms/${encodeURIComponent(code)}/join`, { name })
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
): Promise<RoomCredentials> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
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
    const message = isRecord(data) && typeof data.message === 'string'
      ? data.message
      : `連線失敗（${response.status}），請稍後再試。`
    throw new Error(message)
  }

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
