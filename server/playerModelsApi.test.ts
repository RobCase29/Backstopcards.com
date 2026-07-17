import { describe, expect, it } from 'vitest'
import { FAIR_VALUE_MODEL_VERSION } from '../shared/fairValueEngine.js'
import { handlePlayerModelsApiRoute } from './playerModelsApi.js'

const API_KEY = 'test-backstop-api-key'
const ENV = { BACKSTOP_API_KEY: API_KEY, BACKSTOP_API_RATE_LIMIT: '1000' }

function request(path: string, options: RequestInit = {}) {
  return new Request(`https://backstopcards.com/api/v1/${path}`, options)
}

function authorizedRequest(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${API_KEY}`)
  return request(path, { ...options, headers })
}

describe('Backstop player models API', () => {
  it('publishes OpenAPI discovery without exposing the private application', async () => {
    const response = await handlePlayerModelsApiRoute('openapi.json', request('openapi.json'), {})
    const payload = (await response.json()) as { openapi: string; paths: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(payload.openapi).toBe('3.1.0')
    expect(payload.paths['/api/v1/player-models']).toBeTruthy()
  })

  it('requires an independent server-to-server API key', async () => {
    const response = await handlePlayerModelsApiRoute('player-models', request('player-models'), ENV)
    const payload = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(401)
    expect(payload.error.code).toBe('unauthorized')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('returns the canonical modeled base-auto contract for an exact player', async () => {
    const response = await handlePlayerModelsApiRoute(
      'player-models',
      authorizedRequest('player-models?player=Aiva%20Arquette&priced=true&include=ladder'),
      ENV,
    )
    const payload = (await response.json()) as {
      modelVersion: string
      count: number
      items: Array<{
        modelId: string
        player: { name: string; normalizedName: string }
        card: { release: string; cardType: string; grade: string }
        valuation: { amount: number | null; low: number | null; high: number | null; actionable: boolean }
        provenance: { rawThirdPartyDataIncluded: boolean }
        variationLadder?: Array<{ label: string; amount: number | null }>
      }>
    }

    expect(response.status).toBe(200)
    expect(payload.modelVersion).toBe(FAIR_VALUE_MODEL_VERSION)
    expect(payload.count).toBeGreaterThan(0)
    const model = payload.items.find((item) => item.card.release === '2026 Bowman') ?? payload.items[0]
    expect(model.player.name).toBe('Aiva Arquette')
    expect(model.player.normalizedName).toBe('aiva arquette')
    expect(model.modelId).toContain('2026-bowman')
    expect(model.card.cardType).toBe('Base Auto')
    expect(model.card.grade).toBe('Raw')
    expect(model.valuation.amount).toBeGreaterThan(0)
    expect(model.valuation.low).toBeGreaterThan(0)
    expect(model.valuation.high).toBeGreaterThan(model.valuation.low ?? 0)
    expect(model.valuation.actionable).toBe(true)
    expect(model.provenance.rawThirdPartyDataIncluded).toBe(false)
    expect(
      model.variationLadder?.some((quote) => /base/i.test(quote.label) && quote.amount === model.valuation.amount),
    ).toBe(true)
  })

  it('supports batch lookup, pagination metadata, and stable conditional requests', async () => {
    const first = await handlePlayerModelsApiRoute(
      'player-models',
      authorizedRequest('player-models?players=Aiva%20Arquette%7CMarek%20Houston&limit=1'),
      ENV,
    )
    const payload = (await first.json()) as { count: number; totalCandidates: number; nextCursor: string | null }

    expect(first.status).toBe(200)
    expect(payload.count).toBe(1)
    expect(payload.totalCandidates).toBeGreaterThanOrEqual(2)
    expect(payload.nextCursor).toBeTruthy()
    expect(first.headers.get('x-ratelimit-limit')).toBe('1000')

    const etag = first.headers.get('etag')
    expect(etag).toBeTruthy()
    const conditional = await handlePlayerModelsApiRoute(
      'player-models',
      authorizedRequest('player-models?players=Aiva%20Arquette%7CMarek%20Houston&limit=1', {
        headers: { 'If-None-Match': etag ?? '' },
      }),
      ENV,
    )
    expect(conditional.status).toBe(304)
  })

  it('fails closed for unapproved browser origins and invalid filters', async () => {
    const denied = await handlePlayerModelsApiRoute(
      'player-models',
      authorizedRequest('player-models', { headers: { Origin: 'https://unknown.example' } }),
      ENV,
    )
    expect(denied.status).toBe(403)

    const invalidFilter = await handlePlayerModelsApiRoute(
      'player-models',
      authorizedRequest('player-models?priced=maybe'),
      ENV,
    )
    const payload = (await invalidFilter.json()) as { error: { code: string } }
    expect(invalidFilter.status).toBe(400)
    expect(payload.error.code).toBe('invalid_priced_filter')
  })
})
