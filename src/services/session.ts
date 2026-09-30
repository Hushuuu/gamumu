const ROOM_TOKEN_PREFIX = 'gamumu:room:'

// 開發模式改用 sessionStorage，同一個瀏覽器的每個分頁可各自扮演不同玩家。
function roomStorage(): Storage {
  return import.meta.env.DEV ? window.sessionStorage : window.localStorage
}

export interface StoredRoomToken {
  token: string | null
  error: string | null
}

export function loadRoomToken(code: string): StoredRoomToken {
  try {
    return {
      token: roomStorage().getItem(`${ROOM_TOKEN_PREFIX}${code}`),
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
    roomStorage().setItem(`${ROOM_TOKEN_PREFIX}${code}`, token)
    return null
  } catch {
    return '無法在這個瀏覽器保存房間連線資料，重新整理後可能需要重新加入。'
  }
}

export function removeRoomToken(code: string): string | null {
  try {
    roomStorage().removeItem(`${ROOM_TOKEN_PREFIX}${code}`)
    return null
  } catch {
    return '瀏覽器無法清除舊的連線資料；若重新加入失敗，請清除此網站的儲存資料。'
  }
}
