export type ScanQueueJobPayload = {
  queueKey?: string
  teamCode?: string
  teamLabel?: string
  scanType?: 'bin' | 'auction' | 'superfractor'
  targetType?: string
  playerName?: string
  playerKey?: string
  releaseKey?: string
  releaseYear?: number
  releaseName?: string
  modelKey?: string
  searchMode?: string
  playerScope?: string
  priority?: number
  runAfter?: string
  maxAttempts?: number
  payload?: unknown
}

export type ScanQueueJobRecord = Required<
  Pick<ScanQueueJobPayload, 'queueKey' | 'playerName' | 'playerKey' | 'targetType' | 'priority' | 'runAfter'>
> &
  Omit<ScanQueueJobPayload, 'queueKey' | 'playerName' | 'playerKey' | 'targetType' | 'priority' | 'runAfter'> & {
    jobId: string
    teamCode: string
    teamLabel: string
    scanType: string
    status: 'queued' | 'leased' | 'done' | 'failed' | 'cancelled'
    releaseKey: string
    releaseYear: number | null
    releaseName: string
    modelKey: string
    searchMode: string
    playerScope: string
    leaseOwner: string
    leaseExpiresAt: string | null
    attempts: number
    maxAttempts: number
    lastError: string
    payload: unknown
    createdAt: string
    updatedAt: string
    completedAt: string | null
  }

export type ScanQueueStatus = {
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
    totalJobs: number
    queuedJobs: number
    dueJobs: number
    leasedJobs: number
    doneJobs: number
    failedJobs: number
    cancelledJobs: number
    nextRunAfter: string
    latestUpdatedAt: string
    byStatus: Array<{ status: string; jobs: number; nextRunAfter: string; latestUpdatedAt: string }>
    byScanType: Array<{ scanType: string; targetType: string; jobs: number; dueJobs: number; nextRunAfter: string; latestUpdatedAt: string }>
  }
  recentJobs: ScanQueueJobRecord[]
}

export type ScanQueueSchedulePayload = {
  source?: string
  teamCode?: string
  teamLabel?: string
  scanType?: 'bin' | 'auction' | 'superfractor'
  targetType?: string
  runAfter?: string
  jobs?: ScanQueueJobPayload[]
}

async function parseScanQueueResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ({ error?: string } & T) | null
  if (!response.ok) throw new Error(payload?.error ?? `Scan queue request failed (${response.status})`)
  if (!payload) throw new Error('Scan queue returned an empty response')
  return payload
}

export async function fetchScanQueueStatus(
  options: { teamCode?: string; scanType?: string; targetType?: string; limit?: number } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (options.teamCode) params.set('teamCode', options.teamCode)
  if (options.scanType) params.set('scanType', options.scanType)
  if (options.targetType) params.set('targetType', options.targetType)
  if (options.limit) params.set('limit', String(options.limit))
  const response = await fetch(`/api/scan-queue/status${params.size ? `?${params}` : ''}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  return parseScanQueueResponse<ScanQueueStatus>(response)
}

export async function scheduleScanQueueJobs(payload: ScanQueueSchedulePayload, signal?: AbortSignal) {
  const response = await fetch('/api/scan-queue/schedule', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })
  return parseScanQueueResponse<{
    available: boolean
    queued: number
    updated: number
    skipped: number
    jobs: ScanQueueJobRecord[]
  }>(response)
}
