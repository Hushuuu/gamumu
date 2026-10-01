import type { BetaSessionCredentials } from './api'

const BETA_SESSION_STORAGE_KEY = 'gamumu:beta-session'

export interface LoadedBetaSession {
  session: BetaSessionCredentials | null
  error: string | null
}

export function loadBetaSession(): LoadedBetaSession {
  try {
    const raw = window.sessionStorage.getItem(BETA_SESSION_STORAGE_KEY)
    if (!raw) {
      return { session: null, error: null }
    }

    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      window.sessionStorage.removeItem(BETA_SESSION_STORAGE_KEY)
      return { session: null, error: '封測驗證資料無法讀取，請重新輸入封測碼。' }
    }

    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      !('token' in value) ||
      typeof value.token !== 'string' ||
      !('expiresAt' in value) ||
      typeof value.expiresAt !== 'number' ||
      !Number.isSafeInteger(value.expiresAt)
    ) {
      window.sessionStorage.removeItem(BETA_SESSION_STORAGE_KEY)
      return { session: null, error: '封測驗證資料無效，請重新輸入封測碼。' }
    }

    if (value.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(BETA_SESSION_STORAGE_KEY)
      return { session: null, error: '封測驗證已到期，請重新輸入封測碼。' }
    }

    return {
      session: { token: value.token, expiresAt: value.expiresAt },
      error: null,
    }
  } catch {
    return {
      session: null,
      error: '瀏覽器儲存空間目前無法使用，請重新輸入封測碼。',
    }
  }
}

export function saveBetaSession(session: BetaSessionCredentials): string | null {
  try {
    window.sessionStorage.setItem(BETA_SESSION_STORAGE_KEY, JSON.stringify(session))
    return null
  } catch {
    return '瀏覽器無法保存封測驗證；重新整理後需要再次輸入封測碼。'
  }
}

export function removeBetaSession(): string | null {
  try {
    window.sessionStorage.removeItem(BETA_SESSION_STORAGE_KEY)
    return null
  } catch {
    return '瀏覽器無法清除封測驗證資料。'
  }
}
