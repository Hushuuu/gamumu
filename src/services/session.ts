const ROOM_TOKEN_PREFIX = 'gamumu:room:'

export interface StoredRoomToken {
  token: string | null
  error: string | null
}

export function loadRoomToken(code: string): StoredRoomToken {
  try {
    return {
      token: window.localStorage.getItem(`${ROOM_TOKEN_PREFIX}${code}`),
      error: null,
    }
  } catch {
    return {
      token: null,
      error: '瀏覽器儲存空間目前無法使用，重新整理後可能需要重新加入房間。',
    }
  }
}

export function saveRoomToken(code: string, token: string): string | null {
  try {
    window.localStorage.setItem(`${ROOM_TOKEN_PREFIX}${code}`, token)
    return null
  } catch {
    return '無法在這個瀏覽器保存房間連線資料，重新整理後可能需要重新加入。'
  }
}

export function removeRoomToken(code: string): string | null {
  try {
    window.localStorage.removeItem(`${ROOM_TOKEN_PREFIX}${code}`)
    return null
  } catch {
    return '瀏覽器無法清除舊的連線資料；若重新加入失敗，請清除此網站的儲存資料。'
  }
}
