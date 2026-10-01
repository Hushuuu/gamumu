import { isRecord } from '../../shared/protocol'

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const BETA_SESSION_TTL_MS = 6 * 60 * 60 * 1000
const BETA_CODE_PATTERN = /^[A-Z0-9]{12,64}$/
const BETA_WEBSOCKET_PROTOCOL_PREFIX = 'gamumu-beta.'
const textEncoder = new TextEncoder()

export function createRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('')
}

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface BetaSessionCredentials {
  token: string
  expiresAt: number
}

export function parseBetaCodes(value: string | undefined): string[] | null {
  if (!value?.trim()) {
    return null
  }

  const codes = value
    .split(/[\r\n,]+/)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)

  if (codes.length === 0 || codes.some((code) => !BETA_CODE_PATTERN.test(code))) {
    return null
  }

  return [...new Set(codes)]
}

export function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization')
  const match = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(authorization ?? '')
  return match?.[1] ?? null
}

export function readWebSocketBetaToken(request: Request): string | null {
  const protocols = request.headers.get('Sec-WebSocket-Protocol')
  if (!protocols) {
    return null
  }

  for (const protocol of protocols.split(',')) {
    const value = protocol.trim()
    if (value.startsWith(BETA_WEBSOCKET_PROTOCOL_PREFIX)) {
      const token = value.slice(BETA_WEBSOCKET_PROTOCOL_PREFIX.length)
      return /^[A-Za-z0-9._-]+$/.test(token) ? token : null
    }
  }

  return null
}

export async function createBetaSessionToken(
  code: string,
  secret: string,
  now = Date.now(),
): Promise<BetaSessionCredentials> {
  const key = await importHmacKey(secret)
  const codeTag = encodeBase64Url(
    await signHmac(key, `beta-code:${code.trim().toUpperCase()}`),
  )
  const expiresAt = now + BETA_SESSION_TTL_MS
  const payload = encodeBase64Url(
    textEncoder.encode(JSON.stringify({ codeTag, expiresAt })),
  )
  const signature = encodeBase64Url(
    await signHmac(key, `beta-session:${payload}`),
  )

  return { token: `${payload}.${signature}`, expiresAt }
}

export async function verifyBetaSessionToken(
  token: string,
  secret: string | undefined,
  activeCodes: readonly string[] | null,
  now = Date.now(),
): Promise<number | null> {
  if (!secret || !activeCodes?.length || token.length > 2_048) {
    return null
  }

  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null
  }

  const payloadBytes = decodeBase64Url(parts[0])
  const signature = decodeBase64Url(parts[1])
  if (!payloadBytes || !signature) {
    return null
  }

  const key = await importHmacKey(secret)
  const signatureIsValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    textEncoder.encode(`beta-session:${parts[0]}`),
  )
  if (!signatureIsValid) {
    return null
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch {
    return null
  }

  if (
    !isRecord(payload) ||
    typeof payload.codeTag !== 'string' ||
    typeof payload.expiresAt !== 'number' ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt <= now
  ) {
    return null
  }

  const activeCodeTags = await Promise.all(
    activeCodes.map(async (code) => {
      return encodeBase64Url(await signHmac(key, `beta-code:${code}`))
    }),
  )

  return activeCodeTags.includes(payload.codeTag) ? payload.expiresAt : null
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function signHmac(key: CryptoKey, value: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)),
  )
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null
  }

  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')

  try {
    const binary = atob(base64)
    const decoded = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      decoded[index] = binary.charCodeAt(index)
    }
    return decoded
  } catch {
    return null
  }
}
