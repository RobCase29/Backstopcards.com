export type AccessEnv = {
  APP_ACCESS_CODE?: string
  APP_SESSION_SECRET?: string
}

export const ACCESS_COOKIE_NAME = 'backstop_access'

const ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60

function envSecret(env: AccessEnv) {
  return (env.APP_SESSION_SECRET || '').trim()
}

function envCode(env: AccessEnv) {
  return (env.APP_ACCESS_CODE || '').trim()
}

export function accessGateReady(env: AccessEnv) {
  return Boolean(envCode(env) && envSecret(env))
}

export function accessConfigMessage(env: AccessEnv) {
  if (!envCode(env)) return 'Set APP_ACCESS_CODE in Vercel to enable private access.'
  if (!envSecret(env)) return 'Set APP_SESSION_SECRET in Vercel to sign private access sessions.'
  return 'Access gate configured.'
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlRandom(bytes = 16) {
  const random = new Uint8Array(bytes)
  crypto.getRandomValues(random)
  return base64UrlEncode(random)
}

async function hmacSha256(message: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return base64UrlEncode(new Uint8Array(signature))
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return result === 0
}

function sessionPayload(expiresAt: number, nonce: string) {
  return `${expiresAt}.${nonce}`
}

export async function createAccessSession(env: AccessEnv, now = Date.now()) {
  const secret = envSecret(env)
  if (!accessGateReady(env)) throw new Error(accessConfigMessage(env))

  const expiresAt = Math.floor(now / 1000) + ACCESS_TTL_SECONDS
  const nonce = base64UrlRandom()
  const signature = await hmacSha256(sessionPayload(expiresAt, nonce), secret)
  return `v1.${expiresAt}.${nonce}.${signature}`
}

export async function verifyAccessSession(value: string | null | undefined, env: AccessEnv, now = Date.now()) {
  const secret = envSecret(env)
  if (!value || !accessGateReady(env)) return false

  const [version, expiresAtRaw, nonce, signature] = value.split('.')
  const expiresAt = Number(expiresAtRaw)
  if (version !== 'v1' || !Number.isFinite(expiresAt) || !nonce || !signature) return false
  if (expiresAt * 1000 <= now) return false

  const expected = await hmacSha256(sessionPayload(expiresAt, nonce), secret)
  return constantTimeEqual(signature, expected)
}

export function accessCookie(session: string) {
  return [
    `${ACCESS_COOKIE_NAME}=${session}`,
    `Max-Age=${ACCESS_TTL_SECONDS}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ')
}

export function expiredAccessCookie() {
  return [`${ACCESS_COOKIE_NAME}=`, 'Max-Age=0', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'].join('; ')
}

export function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null
  const prefix = `${name}=`
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length)
  }
  return null
}

export function safeNextPath(value: string | null | undefined, fallback = '/') {
  const next = (value || '').trim()
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback
  if (next.startsWith('/api/access-login') || next.startsWith('/api/access-logout')) return fallback
  if (next.startsWith('/access.html')) return fallback
  return next
}

export function accessCodeMatches(candidate: string, env: AccessEnv) {
  const expected = envCode(env)
  if (!expected || candidate.length !== expected.length) return false
  return constantTimeEqual(candidate, expected)
}
