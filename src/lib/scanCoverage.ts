export type ScanCoverageStatusKey = 'live_opportunity' | 'live_hits' | 'scanned_no_hits' | 'failed' | 'not_scanned'

export type ScanCoverageTargetPayload = {
  targetKey?: string
  playerName: string
  playerKey?: string
  releaseKey?: string
  releaseYear?: number
  releaseName?: string
  modelKey?: string
  teamCode?: string
  targetType?: string
  status?: ScanCoverageStatusKey
  listingCount?: number
  opportunityCount?: number
  bestEdgeDollars?: number | null
  bestScore?: number | null
  marketplaces?: Array<{ marketplace: string; label: string; listings: number }>
  error?: string
}

export type ScanCoverageRunPayload = {
  runId?: string
  scanType: 'bin' | 'auction' | 'superfractor'
  scanKey: string
  teamCode?: string
  teamLabel?: string
  targetType?: string
  searchMode?: string
  playerScope?: string
  releaseScope?: string
  observedAt?: string
  status?: 'complete' | 'partial' | 'failed' | 'running'
  marketplaces?: string[]
  request?: Record<string, unknown>
  stats?: Record<string, unknown>
  targets: ScanCoverageTargetPayload[]
}

export type ScanCoverageTargetRecord = Required<
  Pick<ScanCoverageTargetPayload, 'playerName' | 'targetKey' | 'status' | 'listingCount' | 'opportunityCount'>
> &
  Omit<ScanCoverageTargetPayload, 'playerName' | 'targetKey' | 'status' | 'listingCount' | 'opportunityCount'> & {
    runId: string
    observedAt: string
  }

export type ScanCoverageStatus = {
  available: boolean
  message?: string
  dbName?: string
  filters?: {
    teamCode?: string
    scanType?: string
    targetType?: string
    limit?: number
  }
  summary: {
    totalTargets: number
    scannedTargets: number
    liveHitTargets: number
    opportunityTargets: number
    noHitTargets: number
    failedTargets: number
    listingCount: number
    opportunityCount: number
    latestObservedAt: string
    byStatus: Array<{ status: string; targets: number; listingCount: number; opportunityCount: number; latestObservedAt: string }>
    byScanType: Array<{ scanType: string; targets: number; listingCount: number; opportunityCount: number; latestObservedAt: string }>
  }
  latestRuns: Array<{
    runId: string
    scanType: string
    scanKey: string
    teamCode: string
    teamLabel: string
    targetType: string
    searchMode: string
    playerScope: string
    releaseScope: string
    status: string
    observedAt: string
    targetCount: number
    listingCount: number
    opportunityCount: number
    queriesRun: number
    queriesSucceeded: number
    queriesFailed: number
    marketplaces: unknown
    createdAt: string
  }>
  targets: ScanCoverageTargetRecord[]
}

async function parseScanCoverageResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ({ error?: string } & T) | null
  if (!response.ok) throw new Error(payload?.error ?? `Scan coverage request failed (${response.status})`)
  if (!payload) throw new Error('Scan coverage returned an empty response')
  return payload
}

export async function saveScanCoverageRun(payload: ScanCoverageRunPayload, signal?: AbortSignal) {
  const response = await fetch('/api/scan-coverage/run', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })
  return parseScanCoverageResponse<{
    available: boolean
    runId: string
    scanType: string
    scanKey: string
    observedAt: string
    targetCount: number
    listingCount: number
    opportunityCount: number
    status: string
  }>(response)
}

export async function fetchScanCoverageStatus(
  options: { teamCode?: string; scanType?: string; targetType?: string; limit?: number } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (options.teamCode) params.set('teamCode', options.teamCode)
  if (options.scanType) params.set('scanType', options.scanType)
  if (options.targetType) params.set('targetType', options.targetType)
  if (options.limit) params.set('limit', String(options.limit))
  const response = await fetch(`/api/scan-coverage/status${params.size ? `?${params}` : ''}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  return parseScanCoverageResponse<ScanCoverageStatus>(response)
}
