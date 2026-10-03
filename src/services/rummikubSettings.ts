const RUMMIKUB_SETTINGS_STORAGE_KEY = 'gamumu:rummikub-settings'

export type RummikubHandTheme = 'sage' | 'mist'

export interface RummikubPersonalSettings {
  hitVolume: number
  handTheme: RummikubHandTheme
}

export interface LoadedRummikubSettings {
  settings: RummikubPersonalSettings
  error: string | null
}

export const DEFAULT_RUMMIKUB_SETTINGS: Readonly<RummikubPersonalSettings> = {
  hitVolume: 50,
  handTheme: 'sage',
}

function settingsStorage(): Storage {
  return import.meta.env.DEV ? window.sessionStorage : window.localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRummikubPersonalSettings(value: unknown): value is RummikubPersonalSettings {
  return (
    isRecord(value) &&
    typeof value.hitVolume === 'number' &&
    Number.isInteger(value.hitVolume) &&
    value.hitVolume >= 0 &&
    value.hitVolume <= 100 &&
    (value.handTheme === 'sage' || value.handTheme === 'mist')
  )
}

function defaultSettings(): RummikubPersonalSettings {
  return { ...DEFAULT_RUMMIKUB_SETTINGS }
}

export function loadRummikubSettings(): LoadedRummikubSettings {
  try {
    const storage = settingsStorage()
    const raw = storage.getItem(RUMMIKUB_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return { settings: defaultSettings(), error: null }
    }

    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      storage.removeItem(RUMMIKUB_SETTINGS_STORAGE_KEY)
      return {
        settings: defaultSettings(),
        error: '儲存的拉密設定無法讀取，已恢復預設值。',
      }
    }

    if (!isRummikubPersonalSettings(value)) {
      storage.removeItem(RUMMIKUB_SETTINGS_STORAGE_KEY)
      return {
        settings: defaultSettings(),
        error: '儲存的拉密設定格式無效，已恢復預設值。',
      }
    }

    return {
      settings: { hitVolume: value.hitVolume, handTheme: value.handTheme },
      error: null,
    }
  } catch {
    return {
      settings: defaultSettings(),
      error: '目前無法讀取裝置上的拉密設定；本次調整仍可使用。',
    }
  }
}

export function saveRummikubSettings(settings: RummikubPersonalSettings): string | null {
  try {
    settingsStorage().setItem(RUMMIKUB_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    return null
  } catch {
    return '無法保存拉密設定；重新載入後設定會還原。'
  }
}
