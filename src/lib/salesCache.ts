export type SalesCacheBucket = {
  bucketKey: string
  playerName: string
  releaseYear: number | null
  productFamily: string
  cardClass: string
  variationLabel: string
  gradeBucket: string
  serialDenominator: number | null
  saleCount: number
  sales30: number
  sales90: number
  auctionCount: number
  binCount: number
  minPrice: number
  q1Price: number
  medianPrice: number
  avgPrice: number
  q3Price: number
  maxPrice: number
  modelPrice: number
  modelLow?: number | null
  modelHigh?: number | null
  modelConfidence?: number | null
  modelEffectiveSales?: number | null
  modelMethod?: string
  modelVersion?: string
  baseAutoMultiple: number | null
  latestSoldAt: string
  generatedAt: string
}

export type SalesCacheExclusion = {
  reason: string
  count: number
}

export type SalesCacheSale = {
  itemId: string
  playerName: string
  title: string
  salePriceText: string
  salePrice: number
  soldAt: string
  saleType: string
  channel: string
  seller: string
  sourcePage: number | null
  sourceOffset: number
  releaseYear: number | null
  productFamily: string
  cardClass: string
  variationLabel: string
  serialDenominator: number | null
  gradeCompany: string | null
  gradeValue: number | null
  gradeBucket: string
  insertName: string | null
  bucketKey: string
  sourceBucketKey?: string
  sourceProductFamily?: string
  sourceCardClass?: string
  sourceVariationLabel?: string
  sourceSerialDenominator?: number | null
  sourceGradeBucket?: string
  sourceInsertName?: string | null
  sourceIsAuto?: boolean
  sourceIsBowman?: boolean
  sourceIsChrome?: boolean
  sourceIsPaper?: boolean
  sourceIsCaseHit?: boolean
  sourceIsInsert?: boolean
  bucketMergeNote?: string
  bucketMergeUpdatedAt?: string
  modelEligible: boolean
  exclusionReason: string | null
  isAuto: boolean
  isBowman: boolean
  isChrome: boolean
  isPaper: boolean
  isCaseHit: boolean
  isInsert: boolean
  isRedemption: boolean
  isRedeemed: boolean
  isDigital: boolean
  isLot: boolean
  erroneous: boolean
  erroneousNote: string
  flagUpdatedAt: string
  saleUrl?: string
}

export type SalesCachePlayerModel = {
  available: boolean
  playerName: string
  message?: string
  generatedAt?: string
  totalRows?: number
  modelEligibleRows?: number
  excludedRows?: number
  bucketCount?: number
  modeledSales?: number
  baseAutoPrice?: number | null
  baseAutoBucket?: SalesCacheBucket | null
  buckets?: SalesCacheBucket[]
  sales?: SalesCacheSale[]
  exclusions?: SalesCacheExclusion[]
}

export type SalesCacheStatus = {
  available: boolean
  dbName?: string
  configured?: boolean
  message?: string
  playerCount?: number
  bucketCount?: number
  modeledSales?: number
  generatedAt?: string
  raw?: {
    rows: number
    players: number
    earliestSoldAt: string
    latestSoldAt: string
    latestImportedAt: string
  }
  normalized?: {
    rows: number
    modelEligibleRows: number
    excludedRows: number
  }
  canonical?: {
    cards: number
    players: number
    summaries: number
    summarizedSales: number
    latestSoldAt: string
    updatedAt: string
  }
  cardHedge?: {
    cards: number
    players: number
    sales: number
    latestSoldAt: string
    latestImportedAt: string
  }
  cleanup?: {
    reviewedRows: number
    flaggedRows: number
    bucketOverrides: number
    latestOverrideAt: string
  }
  hosted?: {
    queueSeeds: number
    laneSeeds: number
    currentModelLanes?: number
    freshFmvLanes: number
    freshCompLanes: number
    queue: Array<{ status: string; players: number }>
    queueByRelease?: Array<{
      releaseYear: number
      players: number
      done: number
      queued: number
      errors: number
      noMatch: number
      waitingSales: number
    }>
    latestRun: {
      runId?: string
      status?: string
      startedAt?: string
      completedAt?: string
      claimedPlayers?: number
      completedPlayers?: number
      matchedPlayers?: number
      missingPlayers?: number
      failedPlayers?: number
      compSalesUpserted?: number
      fmvCardsRefreshed?: number
      dailyExportDate?: string
      dailyExportRows?: number
      dailyExportMatchedSales?: number
      apiCalls?: number
      error?: string
    } | null
  }
}

export type SalesCachePlayersResponse = {
  available: boolean
  dbName?: string
  requested?: number
  missing?: string[]
  players: SalesCachePlayerModel[]
}

export type SalesCacheMergeTargetMetadata = {
  targetReleaseYear?: number | null
  targetProductFamily?: string
  targetCardClass?: string
  targetVariationLabel?: string
  targetSerialDenominator?: number | null
  targetGradeBucket?: string
  targetInsertName?: string | null
}

async function parseSalesCacheResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ({ error?: string } & T) | null
  if (!response.ok) throw new Error(payload?.error ?? `Sales cache request failed (${response.status})`)
  if (!payload) throw new Error('Sales cache returned an empty response')
  return payload
}

export async function fetchSalesCacheStatus(signal?: AbortSignal) {
  const response = await fetch('/api/sales-cache/status', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })
  return parseSalesCacheResponse<SalesCacheStatus>(response)
}

export async function fetchSalesCachePlayer(playerName: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ player: playerName })
  const response = await fetch(`/api/sales-cache/player?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })
  return parseSalesCacheResponse<SalesCachePlayerModel>(response)
}

export async function fetchSalesCachePlayers(playerNames: string[], signal?: AbortSignal) {
  const uniqueNames = [...new Set(playerNames.map((playerName) => playerName.trim()).filter(Boolean))]
  if (uniqueNames.length === 0) {
    return { available: true, requested: 0, missing: [], players: [] } satisfies SalesCachePlayersResponse
  }

  const params = new URLSearchParams({ players: uniqueNames.join('|') })
  const response = await fetch(`/api/sales-cache/players?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  })
  return parseSalesCacheResponse<SalesCachePlayersResponse>(response)
}

export async function flagSalesCacheSale(payload: { itemId: string; erroneous: boolean; note?: string }, signal?: AbortSignal) {
  const response = await fetch('/api/sales-cache/flag-sale', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })
  return parseSalesCacheResponse<{
    itemId: string
    erroneous: boolean
    note: string
    updatedAt: string
  }>(response)
}

export async function mergeSalesCacheBucket(
  payload: {
    sourceBucketKey: string
    targetBucketKey: string
    note?: string
  } & SalesCacheMergeTargetMetadata,
  signal?: AbortSignal,
) {
  const response = await fetch('/api/sales-cache/merge-bucket', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })
  return parseSalesCacheResponse<{
    sourceBucketKey: string
    targetBucketKey: string
    playerName: string
    note: string
    targetSynthetic?: boolean
    restored?: boolean
    targetRestored?: boolean
    updatedAt: string
  }>(response)
}
