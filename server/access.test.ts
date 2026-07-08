import { describe, expect, it } from 'vitest'
import { accessCodeMatches, createAccessSession, safeNextPath, verifyAccessSession } from './access'

const accessEnv = {
  APP_ACCESS_CODE: 'friend-code-123',
  APP_SESSION_SECRET: 'session-secret-456',
}

describe('private access gate', () => {
  it('checks access codes without accepting partial matches', () => {
    expect(accessCodeMatches('friend-code-123', accessEnv)).toBe(true)
    expect(accessCodeMatches('friend-code', accessEnv)).toBe(false)
    expect(accessCodeMatches('wrong-code-1234', accessEnv)).toBe(false)
  })

  it('creates signed sessions that expire', async () => {
    const now = Date.UTC(2026, 5, 21)
    const session = await createAccessSession(accessEnv, now)

    await expect(verifyAccessSession(session, accessEnv, now + 60_000)).resolves.toBe(true)
    await expect(verifyAccessSession(session.replace(/.$/, 'x'), accessEnv, now + 60_000)).resolves.toBe(false)
    await expect(verifyAccessSession(session, accessEnv, now + 8 * 24 * 60 * 60 * 1_000)).resolves.toBe(false)
  })

  it('keeps redirects same-origin and out of access endpoints', () => {
    expect(safeNextPath('/')).toBe('/')
    expect(safeNextPath('/deals?player=Eli')).toBe('/deals?player=Eli')
    expect(safeNextPath('https://example.com')).toBe('/')
    expect(safeNextPath('//example.com')).toBe('/')
    expect(safeNextPath('/api/access-login')).toBe('/')
    expect(safeNextPath('/api/access/login')).toBe('/')
    expect(safeNextPath('/api/access/logout')).toBe('/')
    expect(safeNextPath('/access.html?next=/')).toBe('/')
  })
})
