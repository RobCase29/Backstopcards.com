export type RankingSourceStatus = {
  population: string
  file: string
  available: boolean
  rows: number
  matchedRows: number
  lowCoverageRows: number
  latestUpdated: string
  fileUpdatedAt: string
}

export type RankingDataSource = RankingSourceStatus & {
  type?: string
  csv: string
}

export type RankingsStatus = {
  available: boolean
  source: string
  rows: number
  matchedRows: number
  lowCoverageRows: number
  latestUpdated: string
  fileUpdatedAt?: string
  freshWithin24h: boolean
  refreshable: boolean
  refreshedAt?: string
  output?: string
  message?: string
  sources?: RankingSourceStatus[]
  cache?: string
}

export type RankingsData = Omit<RankingsStatus, 'sources'> & {
  sources: RankingDataSource[]
}

async function parseRankingsResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as ({ error?: string } & RankingsStatus) | null
  if (!response.ok) throw new Error(payload?.error ?? `Rankings request failed (${response.status})`)
  if (!payload) throw new Error('Rankings request returned an empty response')
  return payload
}

export async function fetchRankingsStatus(signal?: AbortSignal) {
  const response = await fetch('/api/rankings/status', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  return parseRankingsResponse(response)
}

export async function refreshRankings(signal?: AbortSignal) {
  const response = await fetch('/api/rankings/refresh', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal,
  })
  return parseRankingsResponse(response) as Promise<RankingsData>
}

export async function fetchRankingsData(signal?: AbortSignal) {
  const response = await fetch('/api/rankings/data', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  return parseRankingsResponse(response) as Promise<RankingsData>
}
