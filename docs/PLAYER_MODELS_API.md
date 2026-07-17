# Backstop Player Models API

The Player Models API is the supported way for another Backstop application to consume the same canonical Bowman base-auto model used by the value board, calculator, and live-deal scanner.

It deliberately does **not** expose Card Hedge rows, marketplace credentials, raw licensed sales, or internal database tables. Consumer apps receive Backstop's derived valuation contract and enough evidence, freshness, and provenance to decide how prominently to display it.

## Endpoints

Production base URL:

```text
https://backstopcards.com
```

| Endpoint | Purpose | Authentication |
| --- | --- | --- |
| `GET /api/v1/player-models` | Player/release base-auto models | Bearer API key |
| `GET /api/v1/meta` | Coverage and contract metadata | Bearer API key |
| `GET /api/v1/openapi.json` | OpenAPI 3.1 discovery document | Public |

The private website invite code is not an API credential. Use a separately generated `BACKSTOP_API_KEY` in each consumer application's **server** environment.

```http
Authorization: Bearer YOUR_BACKSTOP_API_KEY
```

`X-API-Key` is accepted for systems that cannot set Bearer authentication, but Bearer is preferred.

## Recommended Lookup

Resolve a rankings page in one request by repeating `player` or using a pipe-delimited `players` parameter:

```http
GET /api/v1/player-models?player=Aiva%20Arquette&player=Marek%20Houston&priced=true&limit=100
Authorization: Bearer ...
```

```http
GET /api/v1/player-models?players=Aiva%20Arquette%7CMarek%20Houston&priced=true&limit=100
Authorization: Bearer ...
```

If the ranking app knows the card release, include `release=2026 Bowman`. A player can have multiple Bowman releases, so the durable join key is:

```text
normalized player name + release
```

Use `modelId` as the stable identifier after the first successful match. Do not join on display name alone when a release is known.

## Query Parameters

| Parameter | Description |
| --- | --- |
| `player` | Exact player name. Repeat up to 100 times for batch lookup. |
| `players` | Pipe-delimited exact player names. |
| `q` | Search player, release, or current team. |
| `release` | Release name filter, such as `2026 Bowman`. |
| `year` | Release year. |
| `team` | Current or checklist team search. |
| `priced` | `true` (default), `false`, or `all`. |
| `include` | Set to `ladder` to include modeled variation prices. |
| `limit` | Page size, 1-100. Default 50. |
| `cursor` | Opaque `nextCursor` from the previous response. |

## Response Contract

```json
{
  "schemaVersion": "player-models.v1",
  "contractVersion": "backstop-public-api/v1",
  "modelVersion": "backstop-fv-v3",
  "generatedAt": "2026-07-17T12:00:00.000Z",
  "snapshotGeneratedAt": "2026-07-17T08:00:00.000Z",
  "count": 1,
  "totalCandidates": 1,
  "nextCursor": null,
  "warnings": [],
  "items": [
    {
      "modelId": "aiva-arquette:2026-bowman:raw-base-auto",
      "player": {
        "name": "Aiva Arquette",
        "normalizedName": "aiva arquette",
        "currentTeamCode": "MIA",
        "currentTeamName": "Miami Marlins",
        "checklistTeam": "Miami Marlins"
      },
      "card": {
        "release": "2026 Bowman",
        "releaseYear": 2026,
        "category": "bowman",
        "productFamily": "Bowman Chrome",
        "cardType": "Base Auto",
        "grade": "Raw"
      },
      "valuation": {
        "amount": 106.46,
        "currency": "USD",
        "low": 81.29,
        "high": 139.44,
        "source": "weighted-sales",
        "method": "Backstop FV 3",
        "confidence": 0.865,
        "confidenceScore": 87,
        "evidenceTier": "observed",
        "evidenceQuality": "strong",
        "actionable": true
      },
      "evidence": {
        "sales": 10,
        "effectiveSales": 8.85,
        "sales30": 10,
        "sales90": 10,
        "auctionSales": 7,
        "binSales": 3,
        "volatility": 0.18,
        "latestSaleAt": "2026-06-22T12:00:00.000Z"
      },
      "freshness": {
        "modelGeneratedAt": "2026-07-17T08:00:00.000Z",
        "modelAgeDays": 0,
        "latestSaleAgeDays": 25,
        "stale": false
      },
      "rankings": {
        "source": "baseball-oracle",
        "oraclePlayerId": "optional-provider-id",
        "oracleMlbamId": null,
        "prospectRank": 10,
        "overallRank": null,
        "careerOutlook": 72,
        "movement30d": 3,
        "asOf": "2026-07-17"
      },
      "provenance": {
        "contractVersion": "backstop-public-api/v1",
        "modelVersion": "backstop-fv-v3",
        "snapshotGeneratedAt": "2026-07-17T08:00:00.000Z",
        "compLayer": "hosted-canonical-comps",
        "rawThirdPartyDataIncluded": false
      }
    }
  ]
}
```

Fields can be `null` when evidence is unavailable. A consumer must not turn `null` into `$0`, infer a missing price, or present `actionable: false` as a market comp.

`nextCursor` is opaque and should be passed back unchanged. `totalCandidates` counts
player-release rows matching the identity filters before `priced` is applied; `count`
is the number of models returned on the current page.

## TypeScript Server Integration

```ts
type BackstopModelsResponse = {
  schemaVersion: 'player-models.v1'
  count: number
  totalCandidates: number
  nextCursor: string | null
  items: Array<{
    modelId: string
    player: { name: string; normalizedName: string }
    card: { release: string; releaseYear: number; cardType: 'Base Auto'; grade: 'Raw' }
    valuation: {
      amount: number | null
      low: number | null
      high: number | null
      confidenceScore: number
      evidenceQuality: 'strong' | 'moderate' | 'thin' | 'unpriced'
      actionable: boolean
    }
    freshness: { stale: boolean; modelGeneratedAt: string | null }
  }>
}

export async function fetchBackstopModels(playerNames: string[]) {
  const params = new URLSearchParams({ priced: 'true', limit: '100' })
  for (const name of playerNames.slice(0, 100)) params.append('player', name)

  const response = await fetch(`https://backstopcards.com/api/v1/player-models?${params}`, {
    headers: {
      Authorization: `Bearer ${process.env.BACKSTOP_API_KEY}`,
      Accept: 'application/json',
    },
    next: { revalidate: 300 }
  })

  if (response.status === 429) {
    throw new Error(`Backstop rate limit reached; retry after ${response.headers.get('retry-after') ?? '60'} seconds`)
  }
  if (!response.ok) throw new Error(`Backstop API failed with ${response.status}`)
  return response.json() as Promise<BackstopModelsResponse>
}
```

Call this from a server route, server component, background job, or backend service. Never ship the key in client JavaScript or a `NEXT_PUBLIC_`/`VITE_` variable.

## Caching, Limits, and Errors

- Default rate limit: 120 requests per key per minute.
- Batch size: 100 exact player names.
- Page size: 100 models.
- Successful responses: private five-minute cache with one-hour stale revalidation.
- Conditional requests: send `If-None-Match` with the prior `ETag`.
- Error body: `{ "schemaVersion": "...", "requestId": "...", "error": { "code": "...", "message": "..." } }`.
- Common statuses: `400`, `401`, `403`, `429`, and `503`.

Every consumer should cache by query/ETag, honor `Retry-After`, preserve the last known good response during a short outage, and expose model freshness rather than silently presenting stale data as current.

## Versioning and Security

- `/api/v1` is additive within v1. Breaking field or semantic changes require `/api/v2`.
- `modelVersion` may change when Backstop ships a new pricing model. Store it with any persisted value.
- Rotate keys by temporarily placing both old and new values in `BACKSTOP_API_KEYS`, updating consumers, then removing the old key.
- Prefer one key per application once per-key audit/revocation is needed.
- Browser CORS is denied by default. `BACKSTOP_API_ALLOWED_ORIGINS` exists for exceptional direct-browser integrations, but a server-side adapter is safer.

## Current Boundary and Next Step

The API exports canonical raw base-auto values, optional variation ladders, model evidence, freshness, team, release, and optional ranking context. It intentionally does not export active marketplace listings, opportunity scores, user rejects, or raw comp rows yet.

The next useful addition is a first-party client package and a stable Backstop player identity registry. Until that exists, `modelId` plus normalized player name and release is the supported join contract.
