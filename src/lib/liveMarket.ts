import type { EbayScanStats } from './ebay'
import type { ListingStatus, NormalizedListing, Opportunity, ValuationSource } from '../types'

export type LiveMarketScanType = 'bin' | 'auction'

export type LiveMarketListingPayload = {
  itemId: string
  listingKind: string
  marketplace: string
  marketplaceLabel: string
  playerName: string
  title: string
  listingUrl: string
  imageUrl: string | null
  currentPrice: number
  shippingCost: number
  allInPrice: number
  modelPrice: number | null
  fairValue: number
  edgeDollars: number
  expectedRoiPct: number
  action: string
  lane: string
  grade: string
  variationLabel: string
  matchedVariation: string | null
  valuationSource: string
  trustScore: number
  score: number
  bidCount: number
  listingStatus: string
  endTime: string | null
  raw: unknown
}

export type LiveMarketSnapshotPayload = {
  scanType: LiveMarketScanType
  scanKey: string
  searchMode: string
  playerScope: string
  releaseScope: string
  observedAt: string
  ttlSeconds?: number
  request: Record<string, unknown>
  stats?: EbayScanStats
  marketplaces?: string[]
  listings: LiveMarketListingPayload[]
}

export type LiveMarketSnapshotResponse = {
  available: boolean
  snapshotId: string
  scanType: LiveMarketScanType
  scanKey: string
  observedAt: string
  expiresAt: string
  listingCount: number
  opportunityCount: number
}

export type LiveMarketListingRecord = LiveMarketListingPayload & {
  snapshotId: string
  observedAt: string
  expiresAt: string
}

export type LiveMarketLatestResponse = {
  available: boolean
  message?: string
  snapshotCount?: number
  snapshot?: LiveMarketSnapshotResponse & {
    request?: Record<string, unknown>
    stats?: Record<string, unknown>
    createdAt?: string
  }
  listings: LiveMarketListingRecord[]
}

export type LiveMarketStatus = {
  available: boolean
  dbName?: string
  freshSnapshots: number
  freshListings: number
  freshOpportunities: number
  latestObservedAt: string
  nextExpiresAt: string
  byType: Array<{ scanType: LiveMarketScanType; snapshots: number; listings: number }>
  byMarketplace?: Array<{ marketplace: string; label: string; snapshots: number; listings: number }>
}

async function parseLiveMarketResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ({ error?: string } & T) | null
  if (!response.ok) throw new Error(payload?.error ?? `Live market request failed (${response.status})`)
  if (!payload) throw new Error('Live market returned an empty response')
  return payload
}

function listingCacheKey(opportunity: Opportunity) {
  return [
    opportunity.listing.kind,
    opportunity.listing.playerName,
    opportunity.matchedVariation ?? opportunity.listing.variationLabel,
    opportunity.listing.isEligibleGraded ? 'graded' : 'raw',
  ].join('|')
}

export function capLiveMarketOpportunities(opportunities: Opportunity[], perLaneLimit: number) {
  const laneCounts = new Map<string, number>()
  const capped: Opportunity[] = []
  for (const opportunity of opportunities) {
    const key = listingCacheKey(opportunity)
    const count = laneCounts.get(key) ?? 0
    if (count >= perLaneLimit) continue
    laneCounts.set(key, count + 1)
    capped.push(opportunity)
  }
  return capped
}

export function opportunityToLiveMarketListing(opportunity: Opportunity): LiveMarketListingPayload {
  const listing = opportunity.listing
  return {
    itemId: listing.id,
    listingKind: listing.kind,
    marketplace: listing.marketplace ?? 'unknown',
    marketplaceLabel: listing.marketplaceLabel ?? 'Unknown',
    playerName: listing.playerName,
    title: listing.title,
    listingUrl: listing.listingUrl ?? '',
    imageUrl: listing.imageUrl ?? null,
    currentPrice: listing.currentPrice,
    shippingCost: listing.shippingCost,
    allInPrice: listing.allInPrice,
    modelPrice: opportunity.modelPrice ?? null,
    fairValue: opportunity.fairValue,
    edgeDollars: opportunity.edgeDollars,
    expectedRoiPct: opportunity.expectedRoiPct,
    action: opportunity.action,
    lane: opportunity.lane,
    grade: opportunity.grade,
    variationLabel: listing.variationLabel,
    matchedVariation: opportunity.matchedVariation ?? null,
    valuationSource: opportunity.valuationSource,
    trustScore: opportunity.trustScore,
    score: opportunity.score,
    bidCount: listing.bidCount,
    listingStatus: listing.status,
    endTime: listing.endTime ?? null,
    raw: {
      reasons: opportunity.reasons,
      warnings: opportunity.warnings,
      tags: opportunity.tags,
      releaseYear: listing.releaseYear,
      releaseLabel: listing.releaseLabel,
      serialDenominator: listing.serialDenominator ?? null,
      isGraded: listing.isGraded,
      gradingCompany: listing.gradingCompany ?? null,
      gradeNumber: listing.gradeNumber ?? null,
      marketplace: listing.marketplace ?? 'unknown',
      marketplaceLabel: listing.marketplaceLabel ?? 'Unknown',
    },
  }
}

function liveMarketListingKind(kind: string): NormalizedListing['kind'] {
  return kind === 'bin' ? 'bin' : 'live'
}

function liveMarketListingStatus(status: string): ListingStatus {
  if (status === 'active' || status === 'ended' || status === 'sold' || status === 'unknown') return status
  return 'active'
}

function liveMarketLane(lane: string): Opportunity['lane'] {
  if (lane === 'buy' || lane === 'watch' || lane === 'risk') return lane
  return 'watch'
}

function liveMarketGrade(grade: string): Opportunity['grade'] {
  if (grade === 'A+' || grade === 'A' || grade === 'B' || grade === 'C' || grade === 'Watch') return grade
  return 'Watch'
}

function liveMarketAction(action: string): Opportunity['action'] {
  if (action === 'Buy now' || action === 'Make offer' || action === 'Bid window' || action === 'Watchlist' || action === 'Pass') return action
  return 'Watchlist'
}

function liveMarketValuationSource(source: string): ValuationSource {
  if (
    source === 'base-twma-blend' ||
    source === 'player-variation' ||
    source === 'player-base-curve' ||
    source === 'release-curve' ||
    source === 'listing-comps'
  ) {
    return source
  }
  return 'player-variation'
}

function numberMeta(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function rawMeta(record: LiveMarketListingRecord) {
  return record.raw && typeof record.raw === 'object' ? (record.raw as Record<string, unknown>) : {}
}

export function liveMarketListingToOpportunity(record: LiveMarketListingRecord): Opportunity {
  const meta = rawMeta(record)
  const isGraded = Boolean(meta.isGraded)
  const gradeNumber = numberMeta(meta.gradeNumber)
  const serialDenominator = numberMeta(meta.serialDenominator)
  const title = record.title || `${record.playerName} ${record.variationLabel}`.trim()
  const listing: NormalizedListing = {
    id: record.itemId,
    kind: liveMarketListingKind(record.listingKind),
    title,
    playerName: record.playerName,
    currentPrice: record.currentPrice,
    shippingCost: record.shippingCost,
    allInPrice: record.allInPrice,
    marketPrice: record.fairValue,
    compCount: 0,
    comps: [],
    status: liveMarketListingStatus(record.listingStatus),
    isSold: false,
    listingUrl: record.listingUrl,
    marketplace: record.marketplace ?? 'unknown',
    marketplaceLabel: record.marketplaceLabel ?? undefined,
    imageUrl: record.imageUrl,
    watchCount: 0,
    endTime: record.endTime,
    bidCount: record.bidCount,
    releaseYear: numberMeta(meta.releaseYear),
    releaseLabel: String(meta.releaseLabel ?? ''),
    variationLabel: record.variationLabel,
    serialDenominator,
    isGraded,
    grader: typeof meta.gradingCompany === 'string' ? meta.gradingCompany : null,
    grade: gradeNumber ?? null,
    gradingCompany:
      meta.gradingCompany === 'PSA' || meta.gradingCompany === 'BGS' || meta.gradingCompany === 'SGC' || meta.gradingCompany === 'CGC'
        ? meta.gradingCompany
        : null,
    gradeNumber,
    isEligibleGraded: Boolean(isGraded && gradeNumber !== null && gradeNumber >= 9),
    isBowman: /\bbowman\b/i.test(title) || Boolean(meta.releaseLabel),
    isAutograph: /\b(auto|autograph|redemption)\b/i.test(title),
    isFirstBowman: /\b(1st|first)\b/i.test(title),
    isTargetAuto: /\b(auto|autograph|redemption)\b/i.test(title),
    isLowSerialNonAuto: Boolean(
      serialDenominator &&
        serialDenominator <= 99 &&
        !/\b(auto|autograph|redemption|signed|signature)\b/i.test(title) &&
        /\bbowman\b/i.test(title) &&
        /\b(1st|first)\b/i.test(title),
    ),
    isHandSigned: Boolean(meta.isHandSigned),
    universeScore: record.trustScore,
    hoursToClose: record.endTime ? Math.max(0, (Date.parse(record.endTime) - Date.now()) / 3_600_000) : null,
  }

  const edgeDollars = record.edgeDollars
  const fairValue = record.fairValue
  const allInPrice = record.allInPrice
  return {
    listing,
    score: record.score,
    grade: liveMarketGrade(record.grade),
    action: liveMarketAction(record.action),
    lane: liveMarketLane(record.lane),
    fairValue,
    rawFairValue: fairValue,
    modelPrice: record.modelPrice,
    variationPrice: fairValue,
    modelConfidence: record.trustScore,
    matchedVariation: record.matchedVariation,
    valuationSource: liveMarketValuationSource(record.valuationSource),
    discountPct: fairValue > 0 ? edgeDollars / fairValue : 0,
    edgeDollars,
    rawEdgeDollars: edgeDollars,
    maxEntry: fairValue,
    expectedRoiPct: record.expectedRoiPct,
    confidence: record.trustScore,
    trustScore: record.trustScore,
    compQualityScore: 0,
    availabilityScore: 0,
    universeScore: record.trustScore,
    executionScore: 0,
    liquidityScore: 0,
    urgencyScore: record.endTime ? 1 : 0,
    riskScore: 0,
    scoreComponents: {
      rawEdge: edgeDollars,
      percentEdge: allInPrice > 0 ? edgeDollars / allInPrice : 0,
      compQuality: 0,
      targetFit: record.trustScore,
      availability: 0,
      variationModel: fairValue,
      prospect: 0,
      riskPenalty: 0,
    },
    thesis: record.action,
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    reasons: Array.isArray(meta.reasons) ? meta.reasons.map(String) : [],
    warnings: Array.isArray(meta.warnings) ? meta.warnings.map(String) : [],
  }
}

export async function saveLiveMarketSnapshot(payload: LiveMarketSnapshotPayload, signal?: AbortSignal) {
  const response = await fetch('/api/live-market/snapshot', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })
  return parseLiveMarketResponse<LiveMarketSnapshotResponse>(response)
}

export async function fetchLiveMarketStatus(signal?: AbortSignal) {
  const response = await fetch('/api/live-market/status', {
    headers: { Accept: 'application/json' },
    signal,
  })
  return parseLiveMarketResponse<LiveMarketStatus>(response)
}

export async function fetchLatestLiveMarketSnapshot(
  options: { scanType?: LiveMarketScanType; scanKey?: string; limit?: number; snapshotScope?: 'latest' | 'all' } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (options.scanType) params.set('scanType', options.scanType)
  if (options.scanKey) params.set('scanKey', options.scanKey)
  if (options.limit) params.set('limit', String(options.limit))
  if (options.snapshotScope === 'all') params.set('snapshotScope', 'all')
  const response = await fetch(`/api/live-market/latest${params.size ? `?${params}` : ''}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  return parseLiveMarketResponse<LiveMarketLatestResponse>(response)
}
