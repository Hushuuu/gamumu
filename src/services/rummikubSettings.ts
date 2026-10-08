const RUMMIKUB_SETTINGS_STORAGE_KEY = 'gamumu:rummikub-settings'

export type RummikubHandTheme = 'arcane' | 'royal'

type LegacyRummikubHandTheme = 'sage' | 'mist'

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
  handTheme: 'arcane',
}

const LEGACY_HAND_THEME_MAP: Record<LegacyRummikubHandTheme, RummikubHandTheme> = {
  sage: 'arcane',
  mist: 'royal',
}

function settingsStorage(): Storage {
  return import.meta.env.DEV ? window.sessionStorage : window.localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRummikubHandTheme(value: unknown): RummikubHandTheme | null {
  if (value === 'arcane' || value === 'royal') {
    return value
  }

  if (value === 'sage' || value === 'mist') {
    return LEGACY_HAND_THEME_MAP[value]
  }

  return null
}

function parseRummikubPersonalSettings(value: unknown): RummikubPersonalSettings | null {
  if (!isRecord(value)) {
    return null
  }

  const handTheme = normalizeRummikubHandTheme(value.handTheme)
  if (
    typeof value.hitVolume !== 'number' ||
    !Number.isInteger(value.hitVolume) ||
    value.hitVolume < 0 ||
    value.hitVolume > 100 ||
    handTheme === null
  ) {
    return null
  }

  return { hitVolume: value.hitVolume, handTheme }
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

    const settings = parseRummikubPersonalSettings(value)
    if (!settings) {
      storage.removeItem(RUMMIKUB_SETTINGS_STORAGE_KEY)
      return {
        settings: defaultSettings(),
        error: '儲存的拉密設定格式無效，已恢復預設值。',
      }
    }

    return {
      settings,
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
