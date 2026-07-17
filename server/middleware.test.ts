import { afterEach, describe, expect, it } from 'vitest'
import middleware from '../middleware.js'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

function configureGate() {
  process.env.APP_ACCESS_CODE = 'invite-code'
  process.env.APP_SESSION_SECRET = 'session-secret-that-is-long-enough'
  process.env.CRON_SECRET = 'cron-secret'
}

describe('access middleware cron boundary', () => {
  it('allows an authenticated Vercel cron request through the private gate', async () => {
    configureGate()
    const response = await middleware(
      new Request('https://backstopcards.com/api/card-hedge/refresh', {
        headers: { Authorization: 'Bearer cron-secret' },
      }),
    )

    expect(response).toBeUndefined()
  })

  it('keeps an unauthenticated refresh request behind the access gate', async () => {
    configureGate()
    const response = await middleware(new Request('https://backstopcards.com/api/card-hedge/refresh'))

    expect(response?.status).toBe(303)
    expect(response?.headers.get('location')).toContain('/access.html')
  })

  it('does not treat POST refresh requests as trusted cron traffic', async () => {
    configureGate()
    const response = await middleware(
      new Request('https://backstopcards.com/api/card-hedge/refresh', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret' },
      }),
    )

    expect(response?.status).toBe(303)
  })

  it('lets the versioned application API enforce its own API-key boundary', async () => {
    configureGate()
    const response = await middleware(new Request('https://backstopcards.com/api/v1/player-models'))

    expect(response).toBeUndefined()
  })
})
