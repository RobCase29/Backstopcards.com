import {
  Activity,
  Ban,
  BarChart3,
  BookOpenCheck,
  Brain,
  Calculator,
  Database,
  Download,
  ExternalLink,
  Gem,
  KeyRound,
  Package,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Store,
  TableProperties,
  Undo2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import './BackstopV2.css'
import {
  fetchChecklistCatalog,
  fetchChecklistModel,
} from './lib/prospectPulse'
import {
  fetchEbayAuctionListings,
  fetchEbayBinListings,
  fetchEbayStatus,
  isEbayRateLimitError,
  type EbayBinScanResult,
  type EbayBinSearchMode,
  type EbayStatus,
} from './lib/ebay'
import { fetchFanaticsCollectBinListings } from './lib/fanaticsCollect'
import { impliedDynastyBasePrice, scoreDynastyValueOpportunity } from './lib/dynastyValue'
import {
  capLiveMarketOpportunities,
  fetchLiveMarketStatus,
  fetchLatestLiveMarketSnapshot,
  liveMarketListingToOpportunity,
  opportunityToLiveMarketListing,
  saveLiveMarketSnapshot,
  type LiveMarketScanType,
  type LiveMarketStatus,
} from './lib/liveMarket'
import {
  fetchScanCoverageStatus,
  saveScanCoverageRun,
  type ScanCoverageStatus,
  type ScanCoverageStatusKey,
  type ScanCoverageTargetPayload,
} from './lib/scanCoverage'
import {
  fetchScanQueueStatus,
  scheduleScanQueueJobs,
  type ScanQueueJobPayload,
  type ScanQueueStatus,
} from './lib/scanQueue'
import {
  fetchSalesCacheStatus,
  fetchSalesCachePlayers,
  fetchSalesCachePlayer,
  flagSalesCacheSale,
  mergeSalesCacheBucket,
  type SalesCacheBucket,
  type SalesCacheMergeTargetMetadata,
  type SalesCachePlayerModel,
  type SalesCacheSale,
  type SalesCacheStatus,
} from './lib/salesCache'
import {
  findStsRanking,
  getStsLeaderboard,
  hydrateStsLeaderboard,
  primaryStsRank,
  primaryStsRankLabel,
  scoreStsMomentum,
} from './lib/stsRankings'
import { compareTeamLabels, normalizeTeamCode, teamDisplayName } from './lib/teams'
import { fetchCardHedgeStatus, refreshHostedCardHedgeComps, type CardHedgeStatus } from './lib/cardHedge'
import { fetchRankingsData, fetchRankingsStatus, refreshRankings, type RankingsData, type RankingsStatus } from './lib/rankings'
import {
  CASE_HIT_FAMILIES,
  CASE_HIT_TOTAL_CARDS,
  buildCaseHitAutoEquivalent,
  fetchCaseHits,
  type CaseHitInsertKey,
  type CaseHitOpportunity,
  type CaseHitScanResult,
} from './lib/caseHits'
import {
  SEALED_WAX_PRODUCTS,
  buildWaxMarketModel,
  fetchSealedWaxListings,
  parseDaveAdamsQuotes,
  parseWaxComps,
  rankWaxOpportunities,
  sealedWaxProductLabel,
  type WaxComp,
  type WaxMarketModel,
  type WaxOpportunity,
  type WaxScanResult,
} from './lib/sealedWax'
import {
  buildPricingMatrix,
  filterPricingRows,
  formatMultiplier,
  variationKey,
  type BasePriceSource,
  type PricingRow,
  type VariationQuote,
} from './lib/matrix'
import { DEFAULT_SETTINGS, estimateGradedPremium, rankOpportunities } from './lib/scoring'
import {
  auctionBidShipLabel,
  closeTimeLabel,
  compactDate,
  medianValue,
  money,
  parseMoneyInput,
  percent,
  saleTime,
  salesLogTrend,
  weightedSoldModelPrice,
} from './lib/display'
import {
  titleCanUseBowmanSuperfractorAutoProxy,
  titleLooksLikeSuperfractor,
} from './lib/cardTitleGuards'
import { listingGradingLabel, liveCompCheckForOpportunity, liveCompVerdict, normalizeLiveCompText } from './lib/liveComps'
import {
  createListingRejection,
  isListingRejected,
  listingRejectionKeySet,
  readListingRejections,
  removeListingRejection,
  upsertListingRejection,
  writeListingRejections,
  type ListingRejection,
} from './lib/listingExclusions'
import {
  SALES_LAB_DAY_MS,
  SALES_LAB_GRADE_LABELS,
  SALES_LAB_PRIOR_DAYS,
  SALES_LAB_RECENT_DAYS,
  SALES_LAB_SCOPE_LABELS,
  compareSalesBucketsByScarcity,
  inferredCanonicalSerialDenominator,
  saleBucketShortLabel,
  saleMatchesGrade,
  saleMatchesLabScope,
  saleOriginalBucketKey,
  saleSourceBucketShortLabel,
  saleSourceTypeLabel,
  saleTaxonomyLabel,
  saleToneClass,
  saleTypeLabel,
  salesAgeLabel,
  salesBucketKeyForParts,
  salesScarcityModel,
  salesTrendClass,
  salesTrendLabel,
  serialDenominatorFromLabel,
  soldSaleUrl,
  type SalesLabGrade,
  type SalesLabScope,
  variationLabelWithSerial,
} from './lib/salesLab'
import { summarizeProximityMultiplier } from './lib/proximityMultiples'
import type { ChecklistModel, GradingCompany, NormalizedListing, Opportunity, MarketplaceListing, ScoreSettings } from './types'

type CategoryFilter = 'all' | ChecklistModel['category']
type BaseSourceFilter = 'decision-ready' | 'all' | 'research' | BasePriceSource
type StsFilter = 'all' | 'ranked' | 'prospects' | 'mlb' | 'unmatched'
type TeamFilter = 'all' | string
type SortMode =
  | 'base-desc'
  | 'sts-rank'
  | 'prospect-rank'
  | 'dynasty-score'
  | 'dynasty-value'
  | 'momentum-desc'
  | 'riser-value'
  | 'bin-target'
  | 'player-asc'
  | 'release-desc'
type BinPlayerScope = 'all' | 'top-40' | 'target-50' | 'value-25' | 'prospect-100'
type BinSearchMode = EbayBinSearchMode
type BinResultSort =
  | 'conviction-desc'
  | 'edge-desc'
  | 'score-desc'
  | 'sts-rank'
  | 'prospect-rank'
  | 'trend-desc'
  | 'price-asc'
  | 'price-desc'
  | 'roi-desc'
type QuickGradeKey =
  | 'raw'
  | 'psa-8'
  | 'psa-9'
  | 'psa-10'
  | 'bgs-9'
  | 'bgs-95'
  | 'bgs-10'
  | 'sgc-9'
  | 'sgc-10'
  | 'cgc-9'
  | 'cgc-10'
type WorkMode = 'lookup' | 'deals' | 'price' | 'health' | 'case-hits' | 'wax'
type FreshnessTone = 'fresh' | 'watch' | 'stale' | 'empty' | 'offline'
type AppRoute = 'desk' | 'marlins'
type BinVariationOption = {
  key: string
  label: string
  detail: string
  sortOrder: number
  avgMultiplier: number
}

type ChecklistStatusPayload = {
  available: boolean
  message?: string
  release?: {
    releaseKey: string
    releaseYear: number
    releaseName: string
    importedAt: string
  }
  cards?: {
    total: number
    players: number
    autos: number
    flagshipAutos: number
  }
  universe?: {
    total: number
    players: number
  }
  templates?: number
  firstStatuses?: Array<{ status: string; players: number }>
  cardFirstStatuses?: Array<{ status: string; cards: number }>
  queue?: Array<{ status: string; players: number }>
}

type ChecklistCoverageRow = {
  playerName: string
  playerKey: string
  releaseYear: number
  releaseName: string
  releaseKey: string
  team: string | null
  checklistRows: number
  queueStatus: string
  queueError: string
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  basePrice: number
  baseSaleCount: number
  baseSales30: number
  baseSales90: number
  latestSoldAt: string | null
  ageDays: number | null
  laneState: string
  confidenceTier: string
  priorityScore: number
  action: string
  reason: string
}

type ChecklistCoveragePayload = {
  available: boolean
  message?: string
  filters?: {
    minYear: number
    staleDays: number
    retryCooldownDays?: number
    release: string
    source: string
    team: string
    playerCount: number
    limit: number
  }
  summary: {
    totalPlayers: number
    pricedPlayers: number
    missingPriceLanePlayers: number
    stalePlayers: number
    thinPlayers: number
    retryPlayers: number
    coveragePct: number
    healthyPct: number
    latestCompAt: string
    byState: Array<{ state: string; players: number }>
    byTier: Array<{ tier: string; players: number }>
    byQueue: Array<{ status: string; players: number }>
  }
  cadence: {
    hot: string
    priority: string
    longTail: string
    retry: string
  }
  releases: Array<{
    releaseKey: string
    releaseYear: number
    releaseName: string
    players: number
    pricedPlayers: number
    missingPriceLanePlayers: number
    stalePlayers: number
  }>
  nextRefresh: ChecklistCoverageRow[]
  players: ChecklistCoverageRow[]
}

type ObservabilitySnapshot = {
  checkedAt: string
  salesCache: SalesCacheStatus | null
  liveMarket: LiveMarketStatus | null
  checklist: ChecklistStatusPayload | null
  cardHedge: CardHedgeStatus | null
  ranking: RankingsStatus
}

const CATEGORY_LABELS: Record<ChecklistModel['category'], string> = {
  bowman: 'Bowman',
  chrome: 'Chrome',
  draft: 'Draft',
}

const SOURCE_LABELS: Record<BasePriceSource, string> = {
  'weighted-sales': 'Weighted',
  'blended-sales': 'Blended',
  'variation-implied': 'Implied',
  'twma-fallback': 'Baseline',
  unpriced: 'Needs comps',
}

const BASE_FILTER_LABELS: Array<{ value: BaseSourceFilter; label: string }> = [
  { value: 'decision-ready', label: 'Decision-ready' },
  { value: 'all', label: 'All model quality' },
  { value: 'research', label: 'Needs review' },
  { value: 'weighted-sales', label: 'Recent weighted' },
  { value: 'blended-sales', label: 'Blended sales' },
  { value: 'variation-implied', label: 'Variation implied' },
  { value: 'twma-fallback', label: 'Comp summary' },
  { value: 'unpriced', label: 'Needs comps' },
]

const SORT_LABELS: Record<SortMode, string> = {
  'base-desc': 'Model Base',
  'sts-rank': 'Dynasty Rank',
  'prospect-rank': 'Prospect / MLB Rank',
  'dynasty-score': 'Dynasty Score',
  'dynasty-value': 'Undervalued',
  'momentum-desc': 'Momentum',
  'riser-value': 'Riser Value',
  'bin-target': 'BIN Target',
  'player-asc': 'Player A-Z',
  'release-desc': 'Release',
}

const STS_FILTER_LABELS: Record<StsFilter, string> = {
  all: 'All players',
  ranked: 'Ranked',
  prospects: 'Prospects',
  mlb: 'MLB level',
  unmatched: 'Unmatched',
}

type TeamOption = {
  code: string
  label: string
  count: number
}

function buildTeamOptions(rows: PricingRow[]): TeamOption[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const code = normalizeTeamCode(row.currentTeam)
    if (!code) continue
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, label: teamDisplayName(code), count }))
    .sort((left, right) => compareTeamLabels(left.code, right.code))
}

function rowMatchesTeam(row: PricingRow, teamFilter: TeamFilter) {
  if (teamFilter === 'all') return true
  return normalizeTeamCode(row.currentTeam) === normalizeTeamCode(teamFilter)
}

function rowMatchesStsFilter(row: PricingRow, stsFilter: StsFilter) {
  if (stsFilter === 'ranked') return Boolean(row.stsRank)
  if (stsFilter === 'prospects') return Boolean(row.stsProspectRank)
  if (stsFilter === 'mlb') return row.stsLevel?.toUpperCase() === 'MLB'
  if (stsFilter === 'unmatched') return !row.stsName
  return true
}

const BIN_RESULT_SORT_LABELS: Record<BinResultSort, string> = {
  'conviction-desc': 'Conviction',
  'edge-desc': 'Spread',
  'score-desc': 'Model score',
  'sts-rank': 'Dynasty rank',
  'prospect-rank': 'Prospect / MLB rank',
  'trend-desc': 'Trend',
  'price-asc': 'Price low',
  'price-desc': 'Price high',
  'roi-desc': 'Edge %',
}

function binVariationOptionsForModels(models: ChecklistModel[]): BinVariationOption[] {
  const options = new Map<string, BinVariationOption>()
  for (const model of models) {
    for (const variation of model.multipliers) {
      const key = variationKey(variation.variation)
      if (!key || key === 'base' || key === 'base-auto') continue
      const current = options.get(key)
      const sortOrder = Number.isFinite(variation.sortOrder ?? Number.NaN) ? Number(variation.sortOrder) : 9_999
      const avgMultiplier = Number.isFinite(variation.avgMultiplier) ? variation.avgMultiplier : 0
      const detailParts = [
        `${formatMultiplier(avgMultiplier)} base`,
        variation.playerCount ? `${variation.playerCount.toLocaleString()} players` : '',
        variation.totalSales ? `${variation.totalSales.toLocaleString()} sales` : '',
      ].filter(Boolean)
      const next = {
        key,
        label: variation.variation,
        detail: detailParts.join(' / '),
        sortOrder,
        avgMultiplier,
      }
      if (!current || sortOrder < current.sortOrder || (sortOrder === current.sortOrder && avgMultiplier < current.avgMultiplier)) {
        options.set(key, next)
      }
    }
  }
  return [...options.values()].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.avgMultiplier - right.avgMultiplier || left.label.localeCompare(right.label),
  )
}

const QUICK_GRADE_OPTIONS: Array<{ key: QuickGradeKey; label: string; company?: GradingCompany; grade?: number }> = [
  { key: 'raw', label: 'Raw' },
  { key: 'psa-8', label: 'PSA 8', company: 'PSA', grade: 8 },
  { key: 'psa-9', label: 'PSA 9', company: 'PSA', grade: 9 },
  { key: 'psa-10', label: 'PSA 10', company: 'PSA', grade: 10 },
  { key: 'bgs-9', label: 'BGS 9', company: 'BGS', grade: 9 },
  { key: 'bgs-95', label: 'BGS 9.5', company: 'BGS', grade: 9.5 },
  { key: 'bgs-10', label: 'BGS 10', company: 'BGS', grade: 10 },
  { key: 'sgc-9', label: 'SGC 9', company: 'SGC', grade: 9 },
  { key: 'sgc-10', label: 'SGC 10', company: 'SGC', grade: 10 },
  { key: 'cgc-9', label: 'CGC 9', company: 'CGC', grade: 9 },
  { key: 'cgc-10', label: 'CGC 10', company: 'CGC', grade: 10 },
]

function rankOrInfinity(value: number | null) {
  return value ?? Number.POSITIVE_INFINITY
}

function rankSignalBucket(row: Pick<PricingRow, 'stsLevel' | 'stsProspectRank' | 'stsRank'>) {
  if (row.stsProspectRank !== null) return 0
  if (row.stsRank !== null && row.stsLevel?.toUpperCase() === 'MLB') return 1
  if (row.stsRank !== null) return 2
  return 3
}

function primaryRankOrInfinity(row: Pick<PricingRow, 'stsRank' | 'stsProspectRank'>) {
  return rankOrInfinity(primaryStsRank({ rank: row.stsRank, prospectRank: row.stsProspectRank }))
}

function comparePrimaryRank(left: Pick<PricingRow, 'stsLevel' | 'stsProspectRank' | 'stsRank'>, right: Pick<PricingRow, 'stsLevel' | 'stsProspectRank' | 'stsRank'>) {
  return rankSignalBucket(left) - rankSignalBucket(right) || primaryRankOrInfinity(left) - primaryRankOrInfinity(right)
}

function primaryRankLabel(row: Pick<PricingRow, 'stsLevel' | 'stsRank' | 'stsProspectRank'>) {
  return primaryStsRankLabel({ level: row.stsLevel ?? '', rank: row.stsRank, prospectRank: row.stsProspectRank })
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const scoreDynastyBaseValue = scoreDynastyValueOpportunity

function dynastyValueMultiple(row: PricingRow) {
  const impliedBase = impliedDynastyBasePrice(row)
  if (!positiveNumber(row.baseTwmaPrice) || !positiveNumber(impliedBase)) return -1
  return impliedBase / row.baseTwmaPrice
}

function rowHasModel(row: Pick<PricingRow, 'basePriceSource' | 'baseTwmaPrice'>) {
  return row.basePriceSource !== 'unpriced' && row.baseTwmaPrice > 0
}

function dynastyValueSortScore(row: PricingRow) {
  if (!rowHasModel(row)) return -1
  const multiple = dynastyValueMultiple(row)
  const valueScore = scoreDynastyBaseValue(row)
  if (multiple <= 0 || valueScore < 0) return -1
  const investableBaseFloor =
    row.baseTwmaPrice < 6 ? 0.08 : row.baseTwmaPrice < 10 ? 0.5 : row.baseTwmaPrice < 14 && row.baseConfidence < 0.45 ? 0.72 : 1
  const multipleSignal = clampNumber(Math.log(Math.max(1, multiple)) / Math.log(30), 0, 1) * 18
  const dollarGapSignal = clampNumber((impliedDynastyBasePrice(row) - row.baseTwmaPrice) / 650, 0, 1) * 5
  return (valueScore + multipleSignal + dollarGapSignal) * investableBaseFloor
}

function sortRows(rows: PricingRow[], sortMode: SortMode) {
  const sorted = [...rows]
  if (sortMode === 'sts-rank') {
    return sorted.sort((left, right) => rankOrInfinity(left.stsRank) - rankOrInfinity(right.stsRank) || right.baseTwmaPrice - left.baseTwmaPrice)
  }
  if (sortMode === 'prospect-rank') {
    return sorted.sort(
      (left, right) =>
        comparePrimaryRank(left, right) ||
        rankOrInfinity(left.stsRank) - rankOrInfinity(right.stsRank) ||
        right.baseTwmaPrice - left.baseTwmaPrice,
    )
  }
  if (sortMode === 'dynasty-score') {
    return sorted.sort(
      (left, right) =>
        (right.stsDynastyScore ?? -1) - (left.stsDynastyScore ?? -1) ||
        rankOrInfinity(left.stsRank) - rankOrInfinity(right.stsRank) ||
        right.baseTwmaPrice - left.baseTwmaPrice,
    )
  }
  if (sortMode === 'dynasty-value') {
    return sorted.sort(
      (left, right) =>
        dynastyValueSortScore(right) - dynastyValueSortScore(left) ||
        dynastyValueMultiple(right) - dynastyValueMultiple(left) ||
        rankOrInfinity(left.stsRank) - rankOrInfinity(right.stsRank) ||
        left.baseTwmaPrice - right.baseTwmaPrice,
    )
  }
  if (sortMode === 'momentum-desc') {
    return sorted.sort(
      (left, right) =>
        (right.stsMomentumScore ?? -1) - (left.stsMomentumScore ?? -1) ||
        (right.stsRiserValueScore ?? -1) - (left.stsRiserValueScore ?? -1) ||
        rankOrInfinity(left.stsRank) - rankOrInfinity(right.stsRank),
    )
  }
  if (sortMode === 'riser-value') {
    return sorted.sort(
      (left, right) =>
        (right.stsRiserValueScore ?? -1) - (left.stsRiserValueScore ?? -1) ||
        (right.stsMomentumScore ?? -1) - (left.stsMomentumScore ?? -1) ||
        comparePrimaryRank(left, right),
    )
  }
  if (sortMode === 'bin-target') {
    return sorted.sort(
      (left, right) =>
        (right.stsBinTargetScore ?? -1) - (left.stsBinTargetScore ?? -1) ||
        (right.stsRiserValueScore ?? -1) - (left.stsRiserValueScore ?? -1) ||
        comparePrimaryRank(left, right),
    )
  }
  if (sortMode === 'player-asc') {
    return sorted.sort((left, right) => left.playerName.localeCompare(right.playerName) || right.baseTwmaPrice - left.baseTwmaPrice)
  }
  if (sortMode === 'release-desc') {
    return sorted.sort((left, right) => right.releaseYear - left.releaseYear || left.release.localeCompare(right.release) || right.baseTwmaPrice - left.baseTwmaPrice)
  }
  return sorted.sort((left, right) => right.baseTwmaPrice - left.baseTwmaPrice || right.topVariationPrice - left.topVariationPrice)
}

type ReleaseOption = {
  id: string
  label: string
  category: ChecklistModel['category']
  categoryLabel?: string
  year: number
  release: string
  totalPlayers?: number | null
  firstChromeAutos?: number | null
  activeChecklistPlayers?: number | null
}

const FALLBACK_RELEASE_OPTIONS: ReleaseOption[] = [
  {
    id: '2026-bowman',
    label: '2026 Bowman',
    category: 'bowman',
    categoryLabel: 'Bowman',
    year: 2026,
    release: '2026-Bowman',
  },
  {
    id: '2025-bowman-draft',
    label: '2025 Bowman Draft',
    category: 'draft',
    categoryLabel: 'Bowman Draft',
    year: 2025,
    release: '2025-Bowman-Draft',
  },
]

const CHECKLIST_CATEGORIES: ChecklistModel['category'][] = ['bowman', 'chrome', 'draft']
const CHECKLIST_MIN_YEAR = 2020
const CHECKLIST_LOAD_CONCURRENCY = 6
const BIN_SCAN_CONCURRENCY = 2
const LEADERBOARD_RENDER_LIMIT = 25
const FILTERED_LEADERBOARD_RENDER_LIMIT = 120
const BOARD_DEAL_SCAN_LIMIT = 25
const TEAM_DEAL_SCAN_LIMIT = 50
const BIN_RENDER_LIMIT = 40
const AUCTION_RENDER_LIMIT = 30
const LIVE_MODEL_WINDOW_PCT = 1
const LIVE_MODEL_WINDOW_LABEL = `${Math.round(LIVE_MODEL_WINDOW_PCT * 100)}%`
const SHOW_LOOKUP_MODEL_LAB = false
const SHOW_LOOKUP_SUPPORT_PANELS = false
const AUCTION_MAX_HOURS_TO_CLOSE = 24
const CASE_HIT_RENDER_LIMIT = 24
const BIN_ALL_MODELS_KEY = 'all-checklists'
const MARLINS_TEAM_CODE = 'MIA'
const MARLINS_ROUTE_PATH = '/teams/marlins'

const WORK_MODE_PATHS: Record<WorkMode, string> = {
  lookup: '/',
  deals: '/deals',
  price: '/price',
  health: '/health',
  'case-hits': '/case-hits',
  wax: '/sealed-wax',
}

function appRouteFromPath(pathname: string): AppRoute {
  return pathname.replace(/\/+$/, '').toLowerCase() === MARLINS_ROUTE_PATH ? 'marlins' : 'desk'
}

function pathForAppRoute(route: AppRoute) {
  return route === 'marlins' ? MARLINS_ROUTE_PATH : '/'
}

function workModeFromPath(pathname: string): WorkMode {
  const normalizedPath = pathname.replace(/\/+$/, '').toLowerCase() || '/'
  const match = Object.entries(WORK_MODE_PATHS).find(([, path]) => path === normalizedPath)
  return (match?.[0] as WorkMode | undefined) ?? 'lookup'
}

function pathForWorkMode(mode: WorkMode) {
  return WORK_MODE_PATHS[mode]
}

function scoreSettingsForSearchMode(settings: ScoreSettings, searchMode: BinSearchMode): ScoreSettings {
  return {
    ...settings,
    targetUniverse:
      searchMode === 'low-serial-non-auto' ? 'low-serial-non-auto' : searchMode === 'superfractor' ? 'expanded' : 'strict',
  }
}

function pricingVerdict(spread: number | null, modelValue: number, askPrice: number | null) {
  if (!askPrice) return { label: 'No Ask', tone: 'neutral' as const }
  if (askPrice <= modelValue * 0.78) return { label: 'Target Price', tone: 'good' as const }
  if (spread !== null && spread >= 0) return { label: 'Under Model', tone: 'good' as const }
  if (askPrice <= modelValue * (1 + LIVE_MODEL_WINDOW_PCT)) return { label: 'Near Model', tone: 'watch' as const }
  return { label: 'Rich', tone: 'risk' as const }
}

function ebayRateLimitMessage(message: string | null) {
  return Boolean(message && /(?:^|\D)429(?:\D|$)|rate.?limit|too many requests|cooling/i.test(message))
}

function friendlyBinError(error: unknown) {
  if (isEbayRateLimitError(error)) {
    return 'eBay is cooling down our search access. Wait a minute, then retry this player or use a smaller scan scope.'
  }
  return error instanceof Error ? error.message : 'eBay BIN scan failed'
}

function friendlyAuctionError(error: unknown) {
  if (isEbayRateLimitError(error)) {
    return 'eBay is cooling down auction search access. Wait a minute, then retry this player or use a smaller scan scope.'
  }
  return error instanceof Error ? error.message : 'eBay auction scan failed'
}

function binScanErrorSummary(scan: EbayBinScanResult) {
  if (scan.errors.length === 0) return null
  if (scan.errors.some((error) => ebayRateLimitMessage(error.error))) {
    return 'eBay throttled some queries; showing successful results. Wait a minute before another broad scan.'
  }
  const firstReason = scan.errors.find((error) => error.error?.trim())?.error?.trim()
  const providers = new Set(
    scan.errors
      .map((error) => String(error.query ?? '').split('/').at(-1)?.trim())
      .filter(Boolean),
  )
  const providerLabel = providers.size > 0 ? ` (${[...providers].join(', ')})` : ''
  const reason = firstReason ? ` ${firstReason}` : ''
  return `${scan.errors.length.toLocaleString()} marketplace quer${scan.errors.length === 1 ? 'y' : 'ies'} failed${providerLabel}; ranked successful results.${reason}`
}

function listingMarketplaceLabel(listing: Pick<NormalizedListing, 'marketplace' | 'marketplaceLabel'>) {
  if (listing.marketplaceLabel) return listing.marketplaceLabel
  if (listing.marketplace === 'fanatics-collect') return 'Fanatics Collect'
  if (listing.marketplace === 'comc') return 'COMC'
  if (listing.marketplace === 'ebay') return 'eBay'
  return 'Listing'
}

function rawListingMarketplaceLabel(listing: MarketplaceListing) {
  if (listing.marketplace_label) return listing.marketplace_label
  if (listing.marketplace === 'fanatics-collect') return 'Fanatics Collect'
  if (listing.marketplace === 'comc') return 'COMC'
  if (listing.marketplace === 'ebay') return 'eBay'
  return 'Marketplace'
}

function marketplaceCountsFromLabels(labels: string[]) {
  const counts = new Map<string, number>()
  for (const label of labels) {
    const cleanLabel = label.trim() || 'Marketplace'
    counts.set(cleanLabel, (counts.get(cleanLabel) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

function marketplaceCountsFromListings(listings: MarketplaceListing[]) {
  return marketplaceCountsFromLabels(listings.map(rawListingMarketplaceLabel))
}

function marketplaceCountsFromOpportunities(opportunities: Opportunity[]) {
  return marketplaceCountsFromLabels(opportunities.map((opportunity) => listingMarketplaceLabel(opportunity.listing)))
}

function compactVariation(label: string) {
  return label
    .replace(/\b(autograph|autographs|autographed|auto)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanModelLanguage(value: string) {
  return value
    .replace(/ProspectPulse/gi, 'Market')
    .replace(/\bPulse\b/g, 'Market')
    .replace(/\bTWMA\b/g, 'weighted avg')
    .replace(/\bfallback\b/gi, 'baseline')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatBaseMethod(method: string) {
  return cleanModelLanguage(method)
}

function formatBasePrice(row: Pick<PricingRow, 'baseTwmaPrice' | 'basePriceSource'>) {
  return row.basePriceSource === 'unpriced' || row.baseTwmaPrice <= 0 ? 'Needs comps' : money(row.baseTwmaPrice)
}

function formatBaseSource(source: BasePriceSource) {
  return SOURCE_LABELS[source]
}

function formatModelSource(source: string) {
  const labels: Record<string, string> = {
    'sales-cache-exact': 'sold lane',
    'sales-cache-blend': 'sold blend',
    'base-auto': 'base auto',
    'hand-signed-base': 'hand signed',
    'listing-comps': 'comp-led model',
    'base-twma-blend': 'base blend',
    'player-variation': 'player comp',
    'player-base-curve': 'base ladder',
    'release-curve': 'set curve',
  }
  return labels[source] ?? cleanModelLanguage(source.replaceAll('-', ' '))
}

function salesCacheRecordKey(playerName: string) {
  return normalizeLiveCompText(playerName)
}

function salesCacheModelsToRecord(models: SalesCachePlayerModel[]) {
  return Object.fromEntries(
    models
      .filter((model) => model.available && model.playerName)
      .map((model) => [salesCacheRecordKey(model.playerName), model]),
  )
}

function salesCacheDatasetVersion(status: SalesCacheStatus | null | undefined) {
  if (!status?.available) return ''
  return [
    status.generatedAt ?? '',
    status.canonical?.updatedAt ?? '',
    status.hosted?.latestRun?.completedAt ?? '',
    status.playerCount ?? 0,
    status.bucketCount ?? 0,
    status.modeledSales ?? 0,
  ].join('|')
}

function positiveNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function quoteIsBaseAnchor(quote: VariationQuote) {
  const key = variationKey(quote.label || quote.key)
  return key === 'base'
}

function soldCacheBucketKey(bucket: SalesCacheBucket) {
  return variationKey(bucket.variationLabel || 'Base Auto')
}

function normalizedSalesCacheCardClass(bucket: SalesCacheBucket) {
  const normalized = normalizeLiveCompText(bucket.cardClass)
  return normalized === 'autos' ? 'auto' : normalized
}

function salesCacheBucketIsRawBaseAuto(bucket: SalesCacheBucket) {
  return normalizedSalesCacheCardClass(bucket) === 'auto' && bucket.gradeBucket === 'Raw' && soldCacheBucketKey(bucket) === 'base'
}

function salesBucketMatchesRowRelease(bucket: SalesCacheBucket, row: PricingRow | undefined) {
  return !row || bucket.releaseYear === row.releaseYear
}

function preferredAutoFamilyScore(bucket: SalesCacheBucket) {
  const family = normalizeLiveCompText(bucket.productFamily)
  if (family === 'bowman chrome') return 34
  if (family.includes('chrome')) return 20
  if (family.includes('bowman')) return 10
  return 0
}

function scoreSoldCacheBucketForRow(bucket: SalesCacheBucket, row: PricingRow | undefined) {
  if (row && bucket.releaseYear && bucket.releaseYear !== row.releaseYear) return Number.NEGATIVE_INFINITY
  return (
    (row && bucket.releaseYear === row.releaseYear ? 120 : 0) +
    preferredAutoFamilyScore(bucket) +
    Math.min(32, bucket.saleCount) +
    Math.log(Math.max(1, bucket.modelPrice))
  )
}

function soldBaseBucketForRow(row: PricingRow | undefined, model: SalesCachePlayerModel | null) {
  if (!model?.available) return null
  const preferredBaseBucket = model.baseAutoBucket
  if (
    preferredBaseBucket &&
    salesCacheBucketIsRawBaseAuto(preferredBaseBucket) &&
    positiveNumber(preferredBaseBucket.modelPrice) &&
    salesBucketMatchesRowRelease(preferredBaseBucket, row)
  ) {
    return preferredBaseBucket
  }

  const candidates = (model.buckets ?? []).filter(
    (bucket) =>
      salesCacheBucketIsRawBaseAuto(bucket) &&
      positiveNumber(bucket.modelPrice) &&
      salesBucketMatchesRowRelease(bucket, row),
  )

  return (
    candidates.sort(
      (left, right) =>
        scoreSoldCacheBucketForRow(right, row) - scoreSoldCacheBucketForRow(left, row) ||
        right.saleCount - left.saleCount ||
        right.modelPrice - left.modelPrice,
    )[0] ?? null
  )
}

function soldCacheAdjustedRow(row: PricingRow | undefined, model: SalesCachePlayerModel | null) {
  const baseAutoBucket = soldBaseBucketForRow(row, model)
  if (!row || !model?.available || !baseAutoBucket || !positiveNumber(baseAutoBucket.modelPrice)) return row
  if (salesCacheRecordKey(row.playerName) !== salesCacheRecordKey(model.playerName)) return row

  const soldBase = Number(baseAutoBucket.modelPrice.toFixed(2))
  const rawAutoBuckets = new Map<string, SalesCacheBucket>()
  for (const bucket of model.buckets ?? []) {
    if (normalizedSalesCacheCardClass(bucket) !== 'auto' || bucket.gradeBucket !== 'Raw' || !positiveNumber(bucket.modelPrice)) continue
    if (!salesBucketMatchesRowRelease(bucket, row)) continue
    const key = soldCacheBucketKey(bucket)
    const existing = rawAutoBuckets.get(key)
    if (
      !existing ||
      scoreSoldCacheBucketForRow(bucket, row) > scoreSoldCacheBucketForRow(existing, row) ||
      (scoreSoldCacheBucketForRow(bucket, row) === scoreSoldCacheBucketForRow(existing, row) && bucket.modelPrice > existing.modelPrice)
    ) {
      rawAutoBuckets.set(key, bucket)
    }
  }

  const ladder = row.ladder.map((quote) => {
    if (quoteIsBaseAnchor(quote)) {
      return {
        ...quote,
        price: soldBase,
        multiplier: 1,
      }
    }

    const bucket = rawAutoBuckets.get(variationKey(quote.label || quote.key))
    const price = bucket && positiveNumber(bucket.modelPrice) ? bucket.modelPrice : soldBase * quote.multiplier
    return {
      ...quote,
      price: Number(price.toFixed(2)),
      multiplier: Number((price / soldBase).toFixed(4)),
    }
  })

  return {
    ...row,
    baseTwmaPrice: soldBase,
    basePriceSource: 'weighted-sales' as const,
    baseConfidence: Math.min(0.98, 0.52 + Math.log1p(baseAutoBucket.saleCount ?? 0) * 0.12),
    baseSales: baseAutoBucket.saleCount ?? row.baseSales,
    rawBaseSales: baseAutoBucket.saleCount ?? row.rawBaseSales,
    baseSales30: baseAutoBucket.sales30 ?? row.baseSales30,
    baseSales90: baseAutoBucket.sales90 ?? row.baseSales90,
    baseAuctionSales: baseAutoBucket.auctionCount ?? row.baseAuctionSales,
    baseBinSales: baseAutoBucket.binCount ?? row.baseBinSales,
    baseEffectiveSales: baseAutoBucket.saleCount ?? row.baseEffectiveSales,
    latestBaseSaleAt: baseAutoBucket.latestSoldAt ?? row.latestBaseSaleAt,
    baseMethod: 'Sold comp base',
    topVariationPrice: ladder.reduce((best, quote) => Math.max(best, quote.price), soldBase),
    ladder,
  }
}

function playerNamesFromListings(listings: MarketplaceListing[], limit = 160) {
  return [
    ...new Set(
      listings
        .map((listing) => String(listing.player_name ?? listing.prospect?.name ?? '').trim())
        .filter(Boolean),
    ),
  ].slice(0, limit)
}

function formatStsLine(row: PricingRow) {
  const parts = []
  const rankLabel = primaryRankLabel(row)
  if (rankLabel) parts.push(rankLabel)
  if (row.stsProspectRank && row.stsRank) parts.push(`Overall #${row.stsRank.toLocaleString()}`)
  if (row.stsDynastyScore !== null || row.stsRank !== null || row.stsProspectRank !== null) {
    const impliedBase = impliedDynastyBasePrice(row)
    const multiple = impliedBase > 0 && row.baseTwmaPrice > 0 ? impliedBase / row.baseTwmaPrice : 0
    const valueScore = scoreDynastyBaseValue(row)
    if (valueScore > 0) parts.push(`${valueScore.toFixed(0)} value`)
    if (multiple > 0) parts.push(`${money(impliedBase)} implied / ${multiple.toFixed(multiple >= 10 ? 1 : 2)}x base`)
    else if (impliedBase > 0 && !rowHasModel(row)) parts.push(`${money(impliedBase)} implied base`)
  }
  if (row.stsBinTargetScore !== null) parts.push(`${row.stsBinTargetScore.toFixed(1)} target`)
  return parts.join(' / ')
}

function formatSigned(value: number | null) {
  if (value === null) return '--'
  if (value > 0) return `+${value.toLocaleString()}`
  return value.toLocaleString()
}

function changeClassName(value: number | null) {
  if (value === null || value === 0) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

function compactSummary(summary: string | null) {
  return summary?.replace(/\s+/g, ' ').trim() ?? ''
}

function latestFetchedAt(models: ChecklistModel[]) {
  const timestamps = models.map((model) => Date.parse(model.fetchedAt)).filter(Number.isFinite)
  if (timestamps.length === 0) return null
  return new Date(Math.max(...timestamps)).toISOString()
}

function numericTimestamp(value?: string | null) {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(time) ? time : null
}

function ageLabel(value?: string | null, now = Date.now()) {
  const time = numericTimestamp(value)
  if (!time) return 'never'
  const minutes = Math.max(0, Math.round((now - time) / 60_000))
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes.toLocaleString()}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours.toLocaleString()}h ago`
  const days = Math.round(hours / 24)
  return `${days.toLocaleString()}d ago`
}

type ModelTrustTone = 'strong' | 'solid' | 'watch' | 'thin'

function modelTrustSignal(row: PricingRow) {
  if (row.basePriceSource === 'unpriced' || row.baseTwmaPrice <= 0) {
    const rankLabel = primaryRankLabel(row) ?? 'checklist player'
    return {
      tone: 'thin' as ModelTrustTone,
      label: 'Needs comps',
      detail: `${rankLabel} loaded`,
      action: 'Seed sold data',
    }
  }
  const source = row.baseMethod.toLowerCase().includes('sold comp')
    ? 'sold-comp'
    : row.basePriceSource
  const sourceWeight =
    source === 'sold-comp'
      ? 36
      : source === 'weighted-sales'
        ? 32
        : source === 'blended-sales'
          ? 24
          : source === 'variation-implied'
            ? 14
            : 6
  const compDepth = Math.min(22, Math.log1p(Math.max(0, row.rawBaseSales)) * 7)
  const confidence = clampNumber(row.baseConfidence, 0, 1) * 24
  const freshness =
    row.baseSales30 >= 3
      ? 12
      : row.baseSales90 >= 5
        ? 9
        : numericTimestamp(row.latestBaseSaleAt) !== null
          ? freshnessTone(row.latestBaseSaleAt, 72, 360) === 'fresh'
            ? 8
            : 4
          : 0
  const rankSignal = row.stsProspectRank !== null ? 8 : row.stsRank !== null ? 5 : 0
  const score = Math.round(clampNumber(sourceWeight + compDepth + confidence + freshness + rankSignal, 0, 100))
  const valueScore = scoreDynastyValueOpportunity(row)
  const tone: ModelTrustTone =
    score >= 78 && row.rawBaseSales >= 8
      ? 'strong'
      : score >= 58 && row.rawBaseSales >= 3
        ? 'solid'
        : score >= 36 || row.basePriceSource === 'variation-implied'
          ? 'watch'
          : 'thin'
  const label =
    tone === 'strong'
      ? 'Strong comps'
      : tone === 'solid'
        ? 'Comp backed'
        : row.basePriceSource === 'variation-implied'
          ? 'Implied base'
          : row.basePriceSource === 'twma-fallback' && row.rawBaseSales >= 5
            ? 'Comp summary'
          : 'Thin base'
  const sourceLabel =
    source === 'sold-comp'
      ? 'sold lane'
      : row.basePriceSource === 'weighted-sales'
        ? 'recent sales'
        : row.basePriceSource === 'blended-sales'
          ? 'blended sales'
      : row.basePriceSource === 'variation-implied'
            ? 'variation anchors'
            : row.basePriceSource === 'twma-fallback' && row.rawBaseSales >= 5
              ? 'cached summary'
              : 'baseline'
  const salesLabel =
    row.rawBaseSales > 0
      ? `${row.rawBaseSales.toLocaleString()} comp${row.rawBaseSales === 1 ? '' : 's'}`
      : row.baseEffectiveSales > 0
        ? `${row.baseEffectiveSales.toFixed(1)} effective`
        : 'no direct comps'
  const freshnessLabel =
    numericTimestamp(row.latestBaseSaleAt) !== null
      ? ageLabel(row.latestBaseSaleAt)
      : row.basePriceSource === 'twma-fallback' && row.rawBaseSales >= 5
        ? 'aggregate snapshot'
        : 'no dated comps'
  const rankLabel = primaryRankLabel(row) ?? (row.stsRank !== null ? `Rank #${row.stsRank.toLocaleString()}` : 'no rank')
  const action =
    valueScore >= 45 && (tone === 'strong' || tone === 'solid')
      ? 'Scan now'
      : valueScore >= 25 && tone !== 'thin'
        ? 'Scan next'
        : tone === 'thin'
          ? 'Verify base'
          : 'Watch'

  return {
    score,
    tone,
    label,
    action,
    detail: `${sourceLabel} / ${salesLabel} / ${freshnessLabel} / ${rankLabel}`,
  }
}

function rowMatchesBaseFilter(row: PricingRow, filter: BaseSourceFilter) {
  if (filter === 'all') return true
  const trust = modelTrustSignal(row)
  if (filter === 'decision-ready') {
    if (!rowHasModel(row)) return false
    if (trust.tone === 'strong' || trust.tone === 'solid') return true
    return trust.tone === 'watch' && row.rawBaseSales >= 5 && row.baseConfidence >= 0.48
  }
  if (filter === 'research') return trust.tone === 'thin' || (trust.tone === 'watch' && row.rawBaseSales < 5)
  return row.basePriceSource === filter
}

function freshnessTone(value?: string | null, freshHours = 24, staleHours = 168): FreshnessTone {
  const time = numericTimestamp(value)
  if (!time) return 'empty'
  const hours = (Date.now() - time) / 3_600_000
  if (hours <= freshHours) return 'fresh'
  if (hours <= staleHours) return 'watch'
  return 'stale'
}

function latestIso(values: Array<string | null | undefined>) {
  const times = values.map(numericTimestamp).filter((time): time is number => time !== null)
  return times.length ? new Date(Math.max(...times)).toISOString() : ''
}

async function fetchChecklistStatus(signal?: AbortSignal) {
  const response = await fetch('/api/checklist/status', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  const payload = (await response.json().catch(() => null)) as ({ error?: string } & ChecklistStatusPayload) | null
  if (!response.ok) throw new Error(payload?.error ?? `Checklist status failed (${response.status})`)
  if (!payload) throw new Error('Checklist status returned an empty response')
  return payload
}

async function fetchChecklistCoverage(options: {
  minYear?: number
  staleDays?: number
  retryCooldownDays?: number
  source?: string
  team?: string
  players?: string[]
  limit?: number
  signal?: AbortSignal
} = {}) {
  const url = new URL('/api/checklist/coverage', window.location.origin)
  url.searchParams.set('minYear', String(options.minYear ?? CHECKLIST_MIN_YEAR))
  url.searchParams.set('staleDays', String(options.staleDays ?? 60))
  if (options.retryCooldownDays != null) url.searchParams.set('retryCooldownDays', String(options.retryCooldownDays))
  if (options.source) url.searchParams.set('source', options.source)
  if (options.team) url.searchParams.set('team', options.team)
  if (options.players?.length) url.searchParams.set('players', options.players.join('|'))
  if (options.limit) url.searchParams.set('limit', String(options.limit))
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  })
  const payload = (await response.json().catch(() => null)) as ({ error?: string } & ChecklistCoveragePayload) | null
  if (!response.ok) throw new Error(payload?.error ?? `Checklist coverage failed (${response.status})`)
  if (!payload) throw new Error('Checklist coverage returned an empty response')
  if (!payload.available) throw new Error(payload.message ?? 'Checklist coverage is not available')
  if (!payload.summary || !payload.releases || !payload.nextRefresh || !payload.players) {
    throw new Error('Checklist coverage returned an incomplete response')
  }
  return payload
}

function checklistCoverageReleaseKey(model: ChecklistModel) {
  return model.release
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function checklistSaleTimestamp(sale: NonNullable<ChecklistModel['players'][number]['baseSales']>[number]) {
  const raw = sale.soldAt ?? sale.sold_at ?? sale.saleDate ?? sale.sale_date ?? sale.date ?? sale.created_at
  const parsed = raw ? Date.parse(String(raw)) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function checklistSaleCountsByWindow(
  sales: NonNullable<ChecklistModel['players'][number]['baseSales']> | undefined,
  nowMs = Date.now(),
) {
  let latest = 0
  let sales30 = 0
  let sales90 = 0
  for (const sale of sales ?? []) {
    const timestamp = checklistSaleTimestamp(sale)
    if (timestamp === null) continue
    latest = Math.max(latest, timestamp)
    const ageDays = Math.max(0, (nowMs - timestamp) / 86_400_000)
    if (ageDays <= 30) sales30 += 1
    if (ageDays <= 90) sales90 += 1
  }
  return {
    latestSoldAt: latest ? new Date(latest).toISOString() : null,
    sales30,
    sales90,
  }
}

function coverageRowAgeDays(value: string | null, nowMs = Date.now()) {
  const parsed = value ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.round((nowMs - parsed) / 86_400_000))
}

function coverageRowState(row: Pick<ChecklistCoverageRow, 'basePrice' | 'baseSaleCount' | 'latestSoldAt' | 'queueStatus' | 'queueError'>, staleDays: number) {
  const stale = coverageRowAgeDays(row.latestSoldAt) !== null && (coverageRowAgeDays(row.latestSoldAt) ?? 0) > staleDays
  if (row.basePrice > 0 && stale) return 'stale'
  if (row.basePrice > 0 && row.baseSaleCount > 0 && row.baseSaleCount < 5) return 'thin'
  if (row.basePrice > 0) return 'priced'
  if (row.queueStatus === 'running') return 'running'
  if (/timeout/i.test(row.queueError) || row.queueStatus === 'timeout') return 'timeout'
  if (row.queueStatus === 'error') return 'error'
  if (row.queueStatus === 'done') return 'no-clean-base'
  if (row.queueStatus === 'queued') return 'queued'
  return 'missing'
}

function coverageRowConfidenceTier(row: Pick<ChecklistCoverageRow, 'basePrice' | 'baseSaleCount' | 'baseSales30' | 'baseSales90' | 'latestSoldAt'>, staleDays: number) {
  if (row.basePrice <= 0) return 'Unpriced'
  const ageDays = coverageRowAgeDays(row.latestSoldAt)
  if (row.baseSaleCount >= 40 && (ageDays === null || ageDays <= staleDays) && row.baseSales30 >= 3) return 'A'
  if (row.baseSaleCount >= 15 && (ageDays === null || ageDays <= staleDays * 2) && row.baseSales90 >= 4) return 'B'
  if (row.baseSaleCount >= 4 || row.baseSales90 > 0) return 'C'
  return 'D'
}

function coverageRowPriorityScore(row: ChecklistCoverageRow, staleDays: number) {
  const state = coverageRowState(row, staleDays)
  const stateScore: Record<string, number> = {
    timeout: 96,
    error: 92,
    missing: 88,
    queued: 84,
    'no-clean-base': 74,
    running: 62,
    stale: 58,
    thin: 48,
    priced: 8,
  }
  return Math.round((stateScore[state] ?? 0) + Math.max(0, row.releaseYear - 2020) * 1.5 + Math.min(8, row.baseSaleCount / 6))
}

function coverageRowAction(state: string) {
  if (state === 'timeout' || state === 'error') return 'Retry smaller comp sync'
  if (state === 'missing' || state === 'queued') return 'Run comp sync'
  if (state === 'no-clean-base') return 'Try alternate query'
  if (state === 'stale') return 'Refresh sold comps'
  if (state === 'thin') return 'Add comp depth'
  if (state === 'running') return 'Let current sync finish'
  return 'Monitor'
}

function coverageRowReason(row: ChecklistCoverageRow, staleDays: number) {
  const state = coverageRowState(row, staleDays)
  const ageDays = coverageRowAgeDays(row.latestSoldAt)
  if (state === 'stale' && ageDays !== null) return `Latest modeled comp is ${ageDays.toLocaleString()}d old`
  if (state === 'thin') return `${row.baseSaleCount.toLocaleString()} strict base-auto sale${row.baseSaleCount === 1 ? '' : 's'}`
  if (state === 'timeout') return 'Previous comp search timed out'
  if (state === 'error') return row.queueError || 'Previous comp search errored'
  if (state === 'no-clean-base') return 'Sales imported, but no trusted raw base-auto lane'
  if (state === 'queued') return 'Waiting in the comp refresh queue'
  if (state === 'missing') return 'No trusted raw base-auto lane in bundled snapshot'
  if (state === 'running') return 'Comp refresh currently running'
  return 'Modeled price lane is usable'
}

function coverageTierOrder(tier: string) {
  if (tier === 'A') return 0
  if (tier === 'B') return 1
  if (tier === 'C') return 2
  if (tier === 'D') return 3
  return 4
}

function summarizeCoverageRows(rows: ChecklistCoverageRow[]): ChecklistCoveragePayload['summary'] {
  const byState = new Map<string, number>()
  const byTier = new Map<string, number>()
  const byQueue = new Map<string, number>()
  for (const row of rows) {
    byState.set(row.laneState, (byState.get(row.laneState) ?? 0) + 1)
    byTier.set(row.confidenceTier, (byTier.get(row.confidenceTier) ?? 0) + 1)
    byQueue.set(row.queueStatus, (byQueue.get(row.queueStatus) ?? 0) + 1)
  }
  const pricedPlayers = rows.filter((row) => row.basePrice > 0).length
  const stalePlayers = rows.filter((row) => row.laneState === 'stale').length
  const latestCompAt = rows
    .map((row) => (row.latestSoldAt ? Date.parse(row.latestSoldAt) : Number.NaN))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0]

  return {
    totalPlayers: rows.length,
    pricedPlayers,
    missingPriceLanePlayers: rows.filter((row) => row.basePrice <= 0).length,
    stalePlayers,
    thinPlayers: rows.filter((row) => row.laneState === 'thin').length,
    retryPlayers: rows.filter((row) => row.laneState === 'timeout' || row.laneState === 'error').length,
    coveragePct: rows.length ? Number(((pricedPlayers / rows.length) * 100).toFixed(1)) : 0,
    healthyPct: rows.length ? Number((((pricedPlayers - stalePlayers) / rows.length) * 100).toFixed(1)) : 0,
    latestCompAt: Number.isFinite(latestCompAt) ? new Date(latestCompAt).toISOString() : '',
    byState: [...byState.entries()].map(([state, players]) => ({ state, players })).sort((left, right) => right.players - left.players),
    byTier: [...byTier.entries()].map(([tier, players]) => ({ tier, players })).sort((left, right) => coverageTierOrder(left.tier) - coverageTierOrder(right.tier)),
    byQueue: [...byQueue.entries()].map(([status, players]) => ({ status, players })).sort((left, right) => right.players - left.players),
  }
}

function coverageReleases(rows: ChecklistCoverageRow[]): ChecklistCoveragePayload['releases'] {
  const releases = new Map<string, ChecklistCoveragePayload['releases'][number]>()
  for (const row of rows) {
    const current = releases.get(row.releaseKey) ?? {
      releaseKey: row.releaseKey,
      releaseYear: row.releaseYear,
      releaseName: row.releaseName,
      players: 0,
      pricedPlayers: 0,
      missingPriceLanePlayers: 0,
      stalePlayers: 0,
    }
    current.players += 1
    if (row.basePrice > 0) current.pricedPlayers += 1
    else current.missingPriceLanePlayers += 1
    if (row.laneState === 'stale') current.stalePlayers += 1
    releases.set(row.releaseKey, current)
  }
  return [...releases.values()].sort((left, right) => right.releaseYear - left.releaseYear || left.releaseName.localeCompare(right.releaseName))
}

function buildStaticChecklistCoverage(
  models: ChecklistModel[],
  playerNames: string[],
  options: { minYear?: number; staleDays?: number; limit?: number } = {},
): ChecklistCoveragePayload {
  const minYear = options.minYear ?? CHECKLIST_MIN_YEAR
  const staleDays = options.staleDays ?? 60
  const playerKeys = new Set(playerNames.map(scanNameKey).filter(Boolean))
  const rowsByKey = new Map<string, ChecklistCoverageRow>()

  for (const model of sortChecklistModels(models).filter((candidate) => candidate.releaseYear >= minYear)) {
    const releaseKey = checklistCoverageReleaseKey(model)
    for (const player of model.players) {
      const playerKey = scanNameKey(player.playerName)
      if (!playerKey || (playerKeys.size > 0 && !playerKeys.has(playerKey))) continue
      const key = `${releaseKey}:${playerKey}`
      const existing = rowsByKey.get(key)
      const baseSales = player.baseSales ?? player.base_sales ?? player.sales ?? player.saleHistory ?? player.sale_history ?? []
      const saleWindows = checklistSaleCountsByWindow(baseSales)
      const saleCount = Math.max(0, player.baseSalesCount || baseSales.length || 0)
      const basePrice = positiveNumber(player.baseAvgPrice) ? Number(player.baseAvgPrice.toFixed(2)) : 0
      const queueStatus = basePrice > 0 ? 'snapshot' : 'missing'
      const draftRow: ChecklistCoverageRow = {
        playerName: player.playerName,
        playerKey,
        releaseYear: model.releaseYear,
        releaseName: checklistModelLabel(model),
        releaseKey,
        team: player.team ?? findStsRanking(player.playerName)?.team ?? null,
        checklistRows: (existing?.checklistRows ?? 0) + 1,
        queueStatus,
        queueError: '',
        lastAttemptAt: null,
        lastSuccessAt: model.fetchedAt || null,
        basePrice,
        baseSaleCount: saleCount,
        baseSales30: saleWindows.sales30,
        baseSales90: saleWindows.sales90,
        latestSoldAt: saleWindows.latestSoldAt,
        ageDays: coverageRowAgeDays(saleWindows.latestSoldAt),
        laneState: 'missing',
        confidenceTier: 'Unpriced',
        priorityScore: 0,
        action: 'Run comp sync',
        reason: 'No trusted raw base-auto lane in bundled snapshot',
      }
      const laneState = coverageRowState(draftRow, staleDays)
      const completeRow = {
        ...draftRow,
        laneState,
        confidenceTier: coverageRowConfidenceTier(draftRow, staleDays),
        priorityScore: coverageRowPriorityScore({ ...draftRow, laneState }, staleDays),
        action: coverageRowAction(laneState),
        reason: coverageRowReason({ ...draftRow, laneState }, staleDays),
      }
      rowsByKey.set(key, completeRow)
    }
  }

  const rows = [...rowsByKey.values()].sort(
    (left, right) =>
      right.priorityScore - left.priorityScore ||
      right.releaseYear - left.releaseYear ||
      left.playerName.localeCompare(right.playerName),
  )
  const nextRefresh = rows.filter((row) => row.laneState !== 'priced').slice(0, options.limit ?? Math.max(160, rows.length))
  return {
    available: true,
    message: 'Using bundled checklist snapshot coverage.',
    filters: {
      minYear,
      staleDays,
      release: '',
      source: 'static-snapshot',
      team: '',
      playerCount: playerNames.length,
      limit: options.limit ?? Math.max(160, rows.length),
    },
    summary: summarizeCoverageRows(rows),
    cadence: {
      hot: 'Hourly for live-hit gaps once the local comp worker is connected.',
      priority: 'Nightly for ranked, team-page, and recently listed players.',
      longTail: 'Weekly for the remaining 2020+ checklist backlog.',
      retry: 'Timeout/error rows retry with smaller Card Hedge searches and alternate query wording.',
    },
    releases: coverageReleases(rows),
    nextRefresh,
    players: rows,
  }
}

function rankingObservability() {
  const rows = getStsLeaderboard()
  const latestUpdated = latestIso(rows.map((row) => row.updated))
  return {
    available: rows.length > 0,
    source: 'Bundled rankings',
    rows: rows.length,
    matchedRows: rows.filter((row) => row.rank !== null).length,
    lowCoverageRows: rows.filter((row) => row.lowCoverage).length,
    latestUpdated,
    freshWithin24h: freshnessTone(latestUpdated, 24, 48) === 'fresh',
    refreshable: false,
  }
}

function checklistModelKey(model: ChecklistModel) {
  return `${model.category}:${model.releaseYear}:${model.release}`
}

function pricingRowModelKey(row: PricingRow) {
  return `${row.category}:${row.releaseYear}:${row.release}`
}

function scanNameKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function checklistModelLabel(model: ChecklistModel) {
  const label = model.release.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  return label || `${model.releaseYear} ${CATEGORY_LABELS[model.category]}`
}

function sortChecklistModels(models: ChecklistModel[]) {
  const categoryOrder = new Map<ChecklistModel['category'], number>([
    ['bowman', 0],
    ['draft', 1],
    ['chrome', 2],
  ])
  return [...models].sort(
    (left, right) =>
      right.releaseYear - left.releaseYear ||
      (categoryOrder.get(left.category) ?? 9) - (categoryOrder.get(right.category) ?? 9) ||
      checklistModelLabel(left).localeCompare(checklistModelLabel(right)),
  )
}

function groupPricingRows(rows: PricingRow[]) {
  return rows.reduce((groups, row) => {
    const key = pricingRowModelKey(row)
    const modelRows = groups.get(key) ?? []
    modelRows.push(row)
    groups.set(key, modelRows)
    return groups
  }, new Map<string, PricingRow[]>())
}

function rowsForModels(rows: PricingRow[], models: ChecklistModel[]) {
  const modelKeys = new Set(models.map(checklistModelKey))
  return rows.filter((row) => modelKeys.has(pricingRowModelKey(row)))
}

function rowsBySelectedModels(rows: PricingRow[], models: ChecklistModel[]) {
  return groupPricingRows(rowsForModels(rows, models))
}

function modelsForPricingRows(rows: PricingRow[], models: ChecklistModel[]) {
  const rowModelKeys = new Set(rows.map(pricingRowModelKey))
  return models.filter((model) => rowModelKeys.has(checklistModelKey(model)))
}

function playerNamesForPricingRows(rows: PricingRow[]) {
  const seen = new Set<string>()
  const names: string[] = []
  for (const row of rows) {
    const key = scanNameKey(row.playerName)
    if (!key || seen.has(key)) continue
    seen.add(key)
    names.push(row.playerName)
  }
  return names
}

function listingTitleMentionsTeam(title: string, teamCode: string) {
  if (normalizeTeamCode(teamCode) === MARLINS_TEAM_CODE) return /\b(?:miami|marlins)\b/i.test(title)
  return false
}

function opportunityMatchesTeamUniverse(opportunity: Opportunity, teamCode: string, playerKeys: Set<string>) {
  const canonicalTeam = normalizeTeamCode(teamCode)
  if (normalizeTeamCode(opportunity.listing.prospect?.team) === canonicalTeam) return true
  if (playerKeys.has(scanNameKey(opportunity.listing.playerName))) return true
  return listingTitleMentionsTeam(opportunity.listing.title, canonicalTeam)
}

function modelsContainingPlayerNames(models: ChecklistModel[], playerNames: string[]) {
  if (playerNames.length === 0) return models
  const queuedNames = new Set(playerNames.map(scanNameKey))
  return models.filter((model) => model.players.some((player) => queuedNames.has(scanNameKey(player.playerName))))
}

function flattenPricingRowGroups(groups: Map<string, PricingRow[]>) {
  const rows: PricingRow[] = []
  for (const group of groups.values()) rows.push(...group)
  return rows
}

function targetRowsByModelFromGroups(groups: Map<string, PricingRow[]>, limit = 50) {
  const targets = new Map<string, PricingRow[]>()
  for (const [key, rows] of groups) {
    targets.set(key, targetRowsFromRows(rows, limit))
  }
  return targets
}

function targetRowsFromRows(rows: PricingRow[], limit = 50) {
  return rows
    .filter((row) => rowHasModel(row) && row.stsBinTargetScore !== null)
    .sort(
      (left, right) =>
        (right.stsBinTargetScore ?? -1) - (left.stsBinTargetScore ?? -1) ||
        (right.stsMomentumScore ?? -1) - (left.stsMomentumScore ?? -1) ||
        comparePrimaryRank(left, right) ||
        right.baseTwmaPrice - left.baseTwmaPrice,
    )
    .slice(0, limit)
}

function valueRowsFromRows(rows: PricingRow[], limit = 25) {
  const selectedRows = rows
    .map((row) => ({ row, score: scoreDynastyValueOpportunity(row) }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.row.stsMomentumScore ?? -1) - (left.row.stsMomentumScore ?? -1) ||
        comparePrimaryRank(left.row, right.row) ||
        left.row.baseTwmaPrice - right.row.baseTwmaPrice,
    )
    .slice(0, limit)
    .map(({ row }) => row)

  return groupPricingRows(selectedRows)
}

function prospectRowsFromRows(rows: PricingRow[], limit = 100) {
  const selectedRows = rows
    .filter((row) => rowHasModel(row) && row.stsProspectRank !== null)
    .sort(
      (left, right) =>
        rankOrInfinity(left.stsProspectRank) - rankOrInfinity(right.stsProspectRank) ||
        rankOrInfinity(left.stsRank) - rankOrInfinity(right.stsRank) ||
        (right.stsMomentumScore ?? -1) - (left.stsMomentumScore ?? -1) ||
        (right.stsDynastyScore ?? -1) - (left.stsDynastyScore ?? -1) ||
        right.baseTwmaPrice - left.baseTwmaPrice,
    )
    .slice(0, limit)

  return groupPricingRows(selectedRows)
}

function scopedRowsForScan(
  rows: PricingRow[],
  models: ChecklistModel[],
  playerScope: BinPlayerScope,
  searchMode: BinSearchMode,
) {
  const rowsByModel = rowsBySelectedModels(rows, models)
  if (searchMode === 'player') return new Map<string, PricingRow[]>()
  if (playerScope === 'value-25') return valueRowsFromRows(flattenPricingRowGroups(rowsByModel), 25)
  if (playerScope === 'prospect-100') return prospectRowsFromRows(flattenPricingRowGroups(rowsByModel), 100)
  if (playerScope === 'target-50') return targetRowsByModelFromGroups(rowsByModel, 50)
  return new Map<string, PricingRow[]>()
}

function opportunityStsContext(opportunity: Opportunity) {
  const ranking = findStsRanking(opportunity.listing.playerName)
  return {
    ranking,
    rank: ranking?.rank ?? null,
    prospectRank: ranking?.prospectRank ?? null,
    primaryRank: ranking ? primaryStsRank(ranking) : null,
    primaryRankLabel: ranking ? primaryStsRankLabel(ranking) : null,
    change30d: ranking?.change30d ?? null,
    momentumScore: ranking ? scoreStsMomentum(ranking) : null,
  }
}

function binConvictionScore(opportunity: Opportunity, sts = opportunityStsContext(opportunity)) {
  const roiSignal = clampNumber((opportunity.expectedRoiPct + 0.05) / 0.75, 0, 1) * 27
  const dollarSignal = clampNumber(Math.log1p(Math.max(0, opportunity.edgeDollars)) / Math.log1p(2_500), 0, 1) * 24
  const trustSignal = clampNumber(opportunity.trustScore / 100, 0, 1) * 22
  const momentumSignal = clampNumber(((sts.momentumScore ?? 50) - 38) / 42, 0, 1) * 14
  const rankSignal = sts.primaryRank ? clampNumber((1_200 - Math.min(sts.primaryRank, 1_200)) / 1_200, 0, 1) * 7 : 0
  const slabSignal = opportunity.gradingMultiplier ? clampNumber((opportunity.gradingMultiplier - 1) / 1.55, 0, 1) * 6 : 0
  return Math.round(roiSignal + dollarSignal + trustSignal + momentumSignal + rankSignal + slabSignal)
}

type OpportunityStsContext = ReturnType<typeof opportunityStsContext>

type TeamDealEntry = {
  opportunity: Opportunity
  type: 'BIN' | 'Auction'
  sts: OpportunityStsContext
  modelRow: PricingRow | null
  dealScore: number
  dynastyValueScore: number
  momentumScore: number | null
  rankLabel: string | null
}

type TeamChecklistModelSummary = {
  key: string
  label: string
  playerCount: number
}

type TeamChecklistOpportunity = {
  playerName: string
  checklistCount: number
  modelLabels: string[]
  ranking: ReturnType<typeof findStsRanking>
  bestRow: PricingRow | null
  score: number
  rankLabel: string | null
  reasons: string[]
}

type TeamPlayerScanStatusTone = 'buy' | 'watch' | 'listed' | 'gap' | 'empty' | 'error'

type TeamPlayerScanCoverage = {
  playerName: string
  opportunity: TeamChecklistOpportunity
  bestEntry: TeamDealEntry | null
  buyGradeEntry: TeamDealEntry | null
  modelTrust: ReturnType<typeof modelTrustSignal> | null
  confidenceTier: string
  binListingCount: number
  auctionListingCount: number
  modeledListingCount: number
  totalListingCount: number
  scanIssueCount: number
  statusLabel: string
  statusTone: TeamPlayerScanStatusTone
  detail: string
  modelState: string
}

function pricingRowsByPlayer(rows: PricingRow[]) {
  const byPlayer = new Map<string, PricingRow[]>()
  for (const row of rows) {
    const key = scanNameKey(row.playerName)
    if (!key) continue
    const playerRows = byPlayer.get(key) ?? []
    playerRows.push(row)
    byPlayer.set(key, playerRows)
  }
  return byPlayer
}

function rowOpportunityMatchScore(row: PricingRow, opportunity: Opportunity) {
  const listingYear = opportunity.listing.releaseYear
  const listingText = scanNameKey(`${opportunity.listing.releaseLabel} ${opportunity.listing.title}`)
  let score = 0

  if (listingYear && row.releaseYear === listingYear) score += 36
  if (listingText.includes(String(row.releaseYear))) score += 8
  if (row.category === 'chrome' && listingText.includes('chrome')) score += 8
  if (row.category === 'draft' && listingText.includes('draft')) score += 8
  if (row.category === 'bowman' && listingText.includes('bowman') && !listingText.includes('draft')) score += 5

  const releaseKey = scanNameKey(row.release)
  if (releaseKey && listingText.includes(releaseKey)) score += 10

  return score
}

function bestPricingRowForOpportunity(opportunity: Opportunity, rowsByPlayer: Map<string, PricingRow[]>) {
  const playerRows = (rowsByPlayer.get(scanNameKey(opportunity.listing.playerName)) ?? []).filter(rowHasModel)
  if (playerRows.length === 0) return null

  return [...playerRows].sort(
    (left, right) =>
      rowOpportunityMatchScore(right, opportunity) - rowOpportunityMatchScore(left, opportunity) ||
      scoreDynastyValueOpportunity(right) - scoreDynastyValueOpportunity(left) ||
      (right.stsBinTargetScore ?? -1) - (left.stsBinTargetScore ?? -1) ||
      (right.stsMomentumScore ?? -1) - (left.stsMomentumScore ?? -1) ||
      comparePrimaryRank(left, right) ||
      right.baseTwmaPrice - left.baseTwmaPrice,
  )[0] ?? null
}

function marlinsModeledDealScore(opportunity: Opportunity, modelRow: PricingRow | null, sts = opportunityStsContext(opportunity)) {
  const convictionSignal = binConvictionScore(opportunity, sts) * 0.82
  const edgeSignal = clampNumber(opportunity.edgeDollars / Math.max(60, opportunity.fairValue * 0.45), 0, 1) * 14
  const roiSignal = clampNumber((opportunity.expectedRoiPct - 0.04) / 0.56, 0, 1) * 12
  const trustSignal = clampNumber((opportunity.trustScore - 48) / 44, 0, 1) * 8
  const dynastySignal = modelRow ? clampNumber(scoreDynastyValueOpportunity(modelRow) / 72, 0, 1) * 16 : 0
  const targetSignal = modelRow?.stsBinTargetScore != null ? clampNumber(modelRow.stsBinTargetScore / 100, 0, 1) * 11 : 0
  const momentumSource = modelRow?.stsMomentumScore ?? sts.momentumScore
  const momentumSignal = momentumSource != null ? clampNumber((momentumSource - 40) / 40, 0, 1) * 8 : 0
  const primaryRank = modelRow ? primaryStsRank({ rank: modelRow.stsRank, prospectRank: modelRow.stsProspectRank }) : sts.primaryRank
  const rankSignal = primaryRank ? clampNumber((650 - Math.min(primaryRank, 650)) / 650, 0, 1) * 8 : 0
  const prospectRank = modelRow?.stsProspectRank ?? sts.prospectRank
  const prospectSignal = prospectRank ? clampNumber((175 - Math.min(prospectRank, 175)) / 175, 0, 1) * 5 : 0
  const auctionSignal = opportunity.listing.kind === 'live' && opportunity.listing.hoursToClose ? clampNumber((24 - opportunity.listing.hoursToClose) / 24, 0, 1) * 3 : 0
  const gradeSignal = opportunity.grade === 'A+' ? 4 : opportunity.grade === 'A' ? 2 : 0

  return Math.round(
    convictionSignal +
      edgeSignal +
      roiSignal +
      trustSignal +
      dynastySignal +
      targetSignal +
      momentumSignal +
      rankSignal +
      prospectSignal +
      auctionSignal +
      gradeSignal,
  )
}

function buildTeamDealEntries(binOpportunities: Opportunity[], auctionOpportunities: Opportunity[], pricingRows: PricingRow[]) {
  const rowsByPlayer = pricingRowsByPlayer(pricingRows)
  const entries: TeamDealEntry[] = [
    ...binOpportunities.map((opportunity) => ({ opportunity, type: 'BIN' as const })),
    ...auctionOpportunities.map((opportunity) => ({ opportunity, type: 'Auction' as const })),
  ].map(({ opportunity, type }) => {
    const sts = opportunityStsContext(opportunity)
    const modelRow = bestPricingRowForOpportunity(opportunity, rowsByPlayer)
    const momentumScore = modelRow?.stsMomentumScore ?? sts.momentumScore
    return {
      opportunity,
      type,
      sts,
      modelRow,
      dealScore: marlinsModeledDealScore(opportunity, modelRow, sts),
      dynastyValueScore: modelRow ? scoreDynastyValueOpportunity(modelRow) : 0,
      momentumScore,
      rankLabel: modelRow ? primaryRankLabel(modelRow) : sts.primaryRankLabel,
    }
  })

  return entries.sort(
    (left, right) =>
      right.dealScore - left.dealScore ||
      right.opportunity.edgeDollars - left.opportunity.edgeDollars ||
      right.opportunity.expectedRoiPct - left.opportunity.expectedRoiPct ||
      right.opportunity.trustScore - left.opportunity.trustScore ||
      right.opportunity.score - left.opportunity.score,
  )
}

function buildTeamChecklistOpportunities(
  playerNames: string[],
  playerNamesByModel: Map<string, string[]>,
  models: ChecklistModel[],
  rows: PricingRow[],
) {
  const modelLabelsByPlayer = new Map<string, string[]>()
  const canonicalNameByKey = new Map<string, string>()
  const rowsByPlayer = pricingRowsByPlayer(rows)
  const modelByKey = new Map(models.map((model) => [checklistModelKey(model), model]))

  for (const playerName of playerNames) {
    const key = scanNameKey(playerName)
    if (key && !canonicalNameByKey.has(key)) canonicalNameByKey.set(key, playerName)
  }

  for (const [modelKey, names] of playerNamesByModel) {
    const model = modelByKey.get(modelKey)
    const label = model ? checklistModelLabel(model) : modelKey
    for (const playerName of names) {
      const key = scanNameKey(playerName)
      if (!key) continue
      if (!canonicalNameByKey.has(key)) canonicalNameByKey.set(key, playerName)
      const labels = modelLabelsByPlayer.get(key) ?? []
      labels.push(label)
      modelLabelsByPlayer.set(key, labels)
    }
  }

  return [...canonicalNameByKey.entries()]
    .map(([key, playerName]) => {
      const playerRows = rowsByPlayer.get(key) ?? []
      const pricedRows = playerRows.filter(rowHasModel)
      const bestRow =
        [...pricedRows].sort(
          (left, right) =>
            scoreDynastyValueOpportunity(right) - scoreDynastyValueOpportunity(left) ||
            (right.stsBinTargetScore ?? -1) - (left.stsBinTargetScore ?? -1) ||
            (right.stsMomentumScore ?? -1) - (left.stsMomentumScore ?? -1) ||
            comparePrimaryRank(left, right) ||
            right.baseTwmaPrice - left.baseTwmaPrice,
        )[0] ?? null
      const contextRow =
        bestRow ??
        [...playerRows].sort(
          (left, right) =>
            comparePrimaryRank(left, right) ||
            (right.stsMomentumScore ?? -1) - (left.stsMomentumScore ?? -1) ||
            right.releaseYear - left.releaseYear,
        )[0] ??
        null
      const ranking = findStsRanking(playerName)
      const rankLabel = contextRow ? primaryRankLabel(contextRow) : ranking ? primaryStsRankLabel(ranking) : null
      const primaryRank = contextRow ? primaryStsRank({ rank: contextRow.stsRank, prospectRank: contextRow.stsProspectRank }) : ranking ? primaryStsRank(ranking) : null
      const prospectRank = contextRow?.stsProspectRank ?? ranking?.prospectRank ?? null
      const dynastyValueScore = bestRow ? scoreDynastyValueOpportunity(bestRow) : 0
      const targetScore = bestRow?.stsBinTargetScore ?? 0
      const momentumScore = contextRow?.stsMomentumScore ?? (ranking ? scoreStsMomentum(ranking) : null)
      const modelLabels = [...new Set(modelLabelsByPlayer.get(key) ?? [])]
      const rankSignal = primaryRank ? clampNumber((700 - Math.min(primaryRank, 700)) / 700, 0, 1) * 24 : 0
      const prospectSignal = prospectRank ? clampNumber((180 - Math.min(prospectRank, 180)) / 180, 0, 1) * 14 : 0
      const dynastySignal = clampNumber(dynastyValueScore / 75, 0, 1) * 22
      const targetSignal = clampNumber(targetScore / 100, 0, 1) * 16
      const momentumSignal = momentumScore != null ? clampNumber((momentumScore - 40) / 40, 0, 1) * 9 : 0
      const coverageSignal = clampNumber(modelLabels.length / 4, 0, 1) * 7
      const pricedSignal = bestRow ? 8 : ranking ? 2 : 0
      const currentTeamSignal = normalizeTeamCode(ranking?.team) === MARLINS_TEAM_CODE ? 4 : 0
      const score = Math.round(rankSignal + prospectSignal + dynastySignal + targetSignal + momentumSignal + coverageSignal + pricedSignal + currentTeamSignal)
      const reasons = [
        rankLabel,
        dynastyValueScore > 0 ? `Dynasty value ${dynastyValueScore.toFixed(0)}` : null,
        targetScore > 0 ? `Target ${targetScore.toFixed(1)}` : null,
        momentumScore != null ? `Momentum ${momentumScore.toFixed(1)}` : null,
        bestRow ? `${formatBasePrice(bestRow)} modeled base` : 'Needs priced lane',
        `${modelLabels.length.toLocaleString()} checklist${modelLabels.length === 1 ? '' : 's'}`,
      ].filter(Boolean) as string[]

      return {
        playerName,
        checklistCount: modelLabels.length,
        modelLabels,
        ranking,
        bestRow,
        score,
        rankLabel,
        reasons,
      }
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.bestRow ? scoreDynastyValueOpportunity(right.bestRow) : 0) - (left.bestRow ? scoreDynastyValueOpportunity(left.bestRow) : 0) ||
        rankOrInfinity(left.bestRow ? primaryStsRank({ rank: left.bestRow.stsRank, prospectRank: left.bestRow.stsProspectRank }) : left.ranking ? primaryStsRank(left.ranking) : null) -
          rankOrInfinity(right.bestRow ? primaryStsRank({ rank: right.bestRow.stsRank, prospectRank: right.bestRow.stsProspectRank }) : right.ranking ? primaryStsRank(right.ranking) : null) ||
        left.playerName.localeCompare(right.playerName),
  )
}

function isTeamBuyGradeEntry(entry: TeamDealEntry) {
  return entry.opportunity.edgeDollars > 0 && entry.opportunity.expectedRoiPct > 0 && entry.opportunity.lane !== 'risk'
}

function teamDealEntryPlayerKey(entry: TeamDealEntry) {
  return scanNameKey(entry.opportunity.listing.playerName)
}

function playerFirstTeamDealEntries(entries: TeamDealEntry[]) {
  const seen = new Set<string>()
  const leaders: TeamDealEntry[] = []
  const repeats: TeamDealEntry[] = []

  for (const entry of entries) {
    const key = teamDealEntryPlayerKey(entry)
    if (key && !seen.has(key)) {
      seen.add(key)
      leaders.push(entry)
    } else {
      repeats.push(entry)
    }
  }

  return [...leaders, ...repeats]
}

function rawListingPlayerName(listing: MarketplaceListing) {
  return String(listing.player_name ?? listing.prospect?.name ?? listing.prospect?.normalized_name ?? '').trim()
}

function normalizedWordSet(value: string) {
  return new Set(scanNameKey(value).split(' ').filter(Boolean))
}

function rawListingMatchesPlayer(listing: MarketplaceListing, playerName: string) {
  const playerKey = scanNameKey(playerName)
  if (!playerKey) return false

  const listingNameKey = scanNameKey(rawListingPlayerName(listing))
  if (listingNameKey === playerKey) return true

  const listingWords = normalizedWordSet(`${rawListingPlayerName(listing)} ${listing.title ?? ''}`)
  const playerWords = playerKey.split(' ').filter(Boolean)
  return playerWords.length > 0 && playerWords.every((word) => listingWords.has(word))
}

function scanErrorMatchesPlayer(error: { query?: string }, playerName: string) {
  const playerWords = scanNameKey(playerName).split(' ').filter(Boolean)
  if (playerWords.length === 0) return false
  const queryWords = normalizedWordSet(error.query ?? '')
  return playerWords.every((word) => queryWords.has(word))
}

function buildTeamPlayerScanCoverage(
  checklistOpportunities: TeamChecklistOpportunity[],
  dealEntries: TeamDealEntry[],
  binScan: EbayBinScanResult | null,
  auctionScan: EbayBinScanResult | null,
) {
  const entriesByPlayer = new Map<string, TeamDealEntry[]>()
  for (const entry of dealEntries) {
    const key = teamDealEntryPlayerKey(entry)
    if (!key) continue
    entriesByPlayer.set(key, [...(entriesByPlayer.get(key) ?? []), entry])
  }

  const hasScanSource = Boolean(binScan || auctionScan)
  const coverage = checklistOpportunities.map((opportunity) => {
    const key = scanNameKey(opportunity.playerName)
    const playerEntries = entriesByPlayer.get(key) ?? []
    const bestEntry = playerEntries[0] ?? null
    const buyGradeEntry = playerEntries.find(isTeamBuyGradeEntry) ?? null
    const binListingCount = binScan?.listings.filter((listing) => rawListingMatchesPlayer(listing, opportunity.playerName)).length ?? 0
    const auctionListingCount = auctionScan?.listings.filter((listing) => rawListingMatchesPlayer(listing, opportunity.playerName)).length ?? 0
    const scanIssueCount =
      (binScan?.errors.filter((error) => scanErrorMatchesPlayer(error, opportunity.playerName)).length ?? 0) +
      (auctionScan?.errors.filter((error) => scanErrorMatchesPlayer(error, opportunity.playerName)).length ?? 0)
    const totalListingCount = binListingCount + auctionListingCount
    const modelState = opportunity.bestRow
      ? `${formatBasePrice(opportunity.bestRow)} priced lane`
      : opportunity.ranking
        ? `${opportunity.rankLabel ?? 'Ranked'} / needs price lane`
        : 'Needs price lane'
    const modelTrust = opportunity.bestRow ? modelTrustSignal(opportunity.bestRow) : null
    const confidenceTier = modelTrust
      ? modelTrust.tone === 'strong'
        ? 'A'
        : modelTrust.tone === 'solid'
          ? 'B'
          : modelTrust.tone === 'watch'
            ? 'C'
            : 'D'
      : 'Unpriced'

    let statusLabel = opportunity.bestRow ? 'Model ready' : 'Needs price lane'
    let statusTone: TeamPlayerScanStatusTone = opportunity.bestRow ? 'listed' : 'gap'
    let detail = opportunity.bestRow ? 'Ready for live sweep' : 'Price lane pending'
    if (hasScanSource) {
      statusLabel = 'No live listing'
      statusTone = opportunity.bestRow ? 'empty' : 'gap'
      detail = opportunity.bestRow ? 'No live auto listing found' : 'Scanned, price lane still pending'
    }

    if (buyGradeEntry) {
      statusLabel = 'Buy-grade live'
      statusTone = 'buy'
      detail = `${money(buyGradeEntry.opportunity.edgeDollars)} edge / ${money(buyGradeEntry.opportunity.listing.allInPrice)} ask`
    } else if (bestEntry) {
      statusLabel = bestEntry.opportunity.edgeDollars >= 0 ? 'Modeled watch' : 'Above model'
      statusTone = 'watch'
      detail = `${money(bestEntry.opportunity.listing.allInPrice)} ask / ${percent(bestEntry.opportunity.expectedRoiPct)} edge`
    } else if (totalListingCount > 0 && opportunity.bestRow) {
      statusLabel = 'Live inventory'
      statusTone = 'listed'
      detail = `${totalListingCount.toLocaleString()} live listing${totalListingCount === 1 ? '' : 's'} found`
    } else if (totalListingCount > 0) {
      statusLabel = 'Needs price lane'
      statusTone = 'gap'
      detail = `${totalListingCount.toLocaleString()} live listing${totalListingCount === 1 ? '' : 's'} found`
    } else if (scanIssueCount > 0) {
      statusLabel = 'Coverage warning'
      statusTone = 'error'
      detail = `${scanIssueCount.toLocaleString()} query issue${scanIssueCount === 1 ? '' : 's'}`
    } else if (hasScanSource && opportunity.bestRow) {
      statusLabel = 'No live listing'
      statusTone = 'empty'
    } else if (hasScanSource) {
      statusLabel = 'No live listing'
      statusTone = 'gap'
      detail = 'Scanned, price lane still pending'
    }

    return {
      playerName: opportunity.playerName,
      opportunity,
      bestEntry,
      buyGradeEntry,
      modelTrust,
      confidenceTier,
      binListingCount,
      auctionListingCount,
      modeledListingCount: playerEntries.length,
      totalListingCount,
      scanIssueCount,
      statusLabel,
      statusTone,
      detail,
      modelState,
    }
  })

  const toneRank: Record<TeamPlayerScanStatusTone, number> = {
    buy: 0,
    watch: 1,
    listed: 2,
    gap: 3,
    error: 4,
    empty: 5,
  }

  return coverage.sort(
    (left, right) =>
      toneRank[left.statusTone] - toneRank[right.statusTone] ||
      right.totalListingCount - left.totalListingCount ||
      right.modeledListingCount - left.modeledListingCount ||
      right.opportunity.score - left.opportunity.score ||
      left.playerName.localeCompare(right.playerName),
  )
}

function sortBinOpportunities(opportunities: Opportunity[], sortMode: BinResultSort) {
  const sorted = opportunities.map((opportunity) => ({
    opportunity,
    sts: opportunityStsContext(opportunity),
  }))

  sorted.sort((left, right) => {
    if (sortMode === 'conviction-desc') {
      return (
        binConvictionScore(right.opportunity, right.sts) - binConvictionScore(left.opportunity, left.sts) ||
        right.opportunity.edgeDollars - left.opportunity.edgeDollars ||
        right.opportunity.score - left.opportunity.score
      )
    }
    if (sortMode === 'score-desc') {
      return right.opportunity.score - left.opportunity.score || right.opportunity.edgeDollars - left.opportunity.edgeDollars
    }
    if (sortMode === 'sts-rank') {
      return (
        rankOrInfinity(left.sts.rank) - rankOrInfinity(right.sts.rank) ||
        rankOrInfinity(left.sts.prospectRank) - rankOrInfinity(right.sts.prospectRank) ||
        right.opportunity.edgeDollars - left.opportunity.edgeDollars
      )
    }
    if (sortMode === 'prospect-rank') {
      return (
        rankSignalBucket({
          stsLevel: left.sts.ranking?.level ?? null,
          stsProspectRank: left.sts.prospectRank,
          stsRank: left.sts.rank,
        }) -
          rankSignalBucket({
            stsLevel: right.sts.ranking?.level ?? null,
            stsProspectRank: right.sts.prospectRank,
            stsRank: right.sts.rank,
          }) ||
        rankOrInfinity(left.sts.primaryRank) - rankOrInfinity(right.sts.primaryRank) ||
        rankOrInfinity(left.sts.rank) - rankOrInfinity(right.sts.rank) ||
        right.opportunity.edgeDollars - left.opportunity.edgeDollars
      )
    }
    if (sortMode === 'trend-desc') {
      return (
        (right.sts.momentumScore ?? -1) - (left.sts.momentumScore ?? -1) ||
        (right.sts.change30d ?? Number.NEGATIVE_INFINITY) - (left.sts.change30d ?? Number.NEGATIVE_INFINITY) ||
        right.opportunity.edgeDollars - left.opportunity.edgeDollars
      )
    }
    if (sortMode === 'price-asc') {
      return left.opportunity.listing.allInPrice - right.opportunity.listing.allInPrice || right.opportunity.edgeDollars - left.opportunity.edgeDollars
    }
    if (sortMode === 'price-desc') {
      return right.opportunity.listing.allInPrice - left.opportunity.listing.allInPrice || right.opportunity.edgeDollars - left.opportunity.edgeDollars
    }
    if (sortMode === 'roi-desc') {
      return right.opportunity.expectedRoiPct - left.opportunity.expectedRoiPct || right.opportunity.edgeDollars - left.opportunity.edgeDollars
    }
    return right.opportunity.edgeDollars - left.opportunity.edgeDollars || right.opportunity.score - left.opportunity.score
  })

  return sorted.map(({ opportunity }) => opportunity)
}

function isWithinBinModelWindow(opportunity: Opportunity) {
  return opportunity.fairValue > 0 && opportunity.listing.allInPrice <= opportunity.fairValue * (1 + LIVE_MODEL_WINDOW_PCT)
}

function isUrgentAuctionOpportunity(opportunity: Opportunity) {
  const hoursToClose = opportunity.listing.hoursToClose
  return (
    opportunity.listing.kind === 'live' &&
    opportunity.fairValue > 0 &&
    opportunity.listing.allInPrice <= opportunity.fairValue * (1 + LIVE_MODEL_WINDOW_PCT) &&
    hoursToClose !== null &&
    hoursToClose !== undefined &&
    hoursToClose > 0 &&
    hoursToClose <= AUCTION_MAX_HOURS_TO_CLOSE
  )
}

function dedupeBinListings(listings: MarketplaceListing[]) {
  const seen = new Set<string>()
  const deduped: MarketplaceListing[] = []
  for (const listing of listings) {
    const key = String(listing.item_id ?? listing.id ?? listing.listing_url ?? listing.url ?? listing.title ?? '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(listing)
  }
  return deduped
}

function mergeBinScans(results: EbayBinScanResult[], failedErrors: Array<{ query?: string; error: string }> = []): EbayBinScanResult {
  const fetchedAt =
    results
      .map((result) => Date.parse(result.fetchedAt))
      .filter(Number.isFinite)
      .sort((left, right) => right - left)[0] ?? Date.now()

  return {
    listings: dedupeBinListings(results.flatMap((result) => result.listings)),
    fetchedAt: new Date(fetchedAt).toISOString(),
    errors: [...results.flatMap((result) => result.errors), ...failedErrors],
    stats: results.reduce(
      (stats, result) => ({
        queriesRun: stats.queriesRun + result.stats.queriesRun,
        queriesSucceeded: stats.queriesSucceeded + result.stats.queriesSucceeded,
        queriesFailed: stats.queriesFailed + result.stats.queriesFailed,
        pagesFetched: stats.pagesFetched + result.stats.pagesFetched,
        upstreamTotal: stats.upstreamTotal + result.stats.upstreamTotal,
        dedupedItems: stats.dedupedItems + result.stats.dedupedItems,
        mappedListings: stats.mappedListings + result.stats.mappedListings,
        rejectedPlayerMismatches: stats.rejectedPlayerMismatches + result.stats.rejectedPlayerMismatches,
        cacheHits: stats.cacheHits + result.stats.cacheHits,
        cacheMisses: stats.cacheMisses + result.stats.cacheMisses,
        cacheWrites: stats.cacheWrites + result.stats.cacheWrites,
        cacheSkips: stats.cacheSkips + result.stats.cacheSkips,
        redisCacheHits: stats.redisCacheHits + result.stats.redisCacheHits,
        runtimeCacheHits: stats.runtimeCacheHits + result.stats.runtimeCacheHits,
        sqliteCacheHits: stats.sqliteCacheHits + result.stats.sqliteCacheHits,
        upstreamPagesFetched: stats.upstreamPagesFetched + result.stats.upstreamPagesFetched,
      }),
      {
        queriesRun: 0,
        queriesSucceeded: 0,
        queriesFailed: 0,
        pagesFetched: 0,
        upstreamTotal: 0,
        dedupedItems: 0,
        mappedListings: 0,
        rejectedPlayerMismatches: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheWrites: 0,
        cacheSkips: 0,
        redisCacheHits: 0,
        runtimeCacheHits: 0,
        sqliteCacheHits: 0,
        upstreamPagesFetched: 0,
      },
    ),
  }
}

function filterRejectedScanResult(scan: EbayBinScanResult, rejectedKeys: Set<string>): EbayBinScanResult {
  if (rejectedKeys.size === 0) return scan
  return {
    ...scan,
    listings: scan.listings.filter((listing) => !isListingRejected(listing, rejectedKeys)),
  }
}

function liveMarketScanKey(options: {
  scanType: LiveMarketScanType
  models: ChecklistModel[]
  playerScope: BinPlayerScope
  playerNames?: string[]
  searchMode: BinSearchMode
  searchTerm: string
}) {
  const modelLabel =
    options.models.length === 1
      ? checklistModelLabel(options.models[0])
      : options.models.length > 1
        ? `${options.models.length} checklists`
        : 'no checklist'
  const playerFocus = options.playerNames?.length
    ? `board:${options.playerNames.length}:${options.playerNames.slice(0, 4).map(scanNameKey).join('|')}`
    : null
  const focus = playerFocus ?? (options.searchMode === 'checklist' ? options.playerScope : `${options.searchMode}:${options.searchTerm.trim()}`)
  return `${options.scanType}:${modelLabel}:${focus}`.replace(/\s+/g, ' ').trim()
}

function scanCoverageListingPlayerKey(listing: MarketplaceListing) {
  return scanNameKey(String(listing.player_name ?? listing.prospect?.name ?? ''))
}

function scanCoverageOpportunityPlayerKey(opportunity: Opportunity) {
  return scanNameKey(opportunity.listing.playerName)
}

function scanCoverageListingReleaseYear(listing: MarketplaceListing) {
  const parsed = Number(String(listing.release_year ?? '').replace(/[^0-9]/g, ''))
  if (Number.isFinite(parsed) && parsed >= 1900 && parsed <= 2100) return parsed
  const titleYear = String(listing.title ?? '').match(/\b(20[0-9]{2}|19[0-9]{2})\b/)
  return titleYear ? Number(titleYear[1]) : null
}

function scanCoverageOpportunityReleaseYear(opportunity: Opportunity) {
  return opportunity.listing.releaseYear ?? null
}

function scanCoverageTargetPlayers(model: ChecklistModel, playerScope: BinPlayerScope, playerNames: string[]) {
  const requestedKeys = new Set(playerNames.map(scanNameKey).filter(Boolean))
  const players = [...model.players].sort(
    (left, right) => right.baseAvgPrice - left.baseAvgPrice || left.playerName.localeCompare(right.playerName),
  )
  if (requestedKeys.size > 0) return players.filter((player) => requestedKeys.has(scanNameKey(player.playerName)))
  if (playerScope === 'top-40') return players.slice(0, 40)
  return players
}

function scanCoverageMarketplaceHits(listings: MarketplaceListing[]) {
  const counts = new Map<string, { marketplace: string; label: string; listings: number }>()
  for (const listing of listings) {
    const marketplace = String(listing.marketplace ?? 'unknown')
    const label = rawListingMarketplaceLabel(listing)
    const existing = counts.get(marketplace) ?? { marketplace, label, listings: 0 }
    existing.listings += 1
    counts.set(marketplace, existing)
  }
  return [...counts.values()].sort((left, right) => right.listings - left.listings || left.label.localeCompare(right.label))
}

function scanCoverageTargetStatus(listingCount: number, opportunityCount: number): ScanCoverageStatusKey {
  if (opportunityCount > 0) return 'live_opportunity'
  if (listingCount > 0) return 'live_hits'
  return 'scanned_no_hits'
}

function buildScanCoverageTargets(options: {
  models: ChecklistModel[]
  playerNames?: string[]
  playerScope: BinPlayerScope
  scanResult: EbayBinScanResult
  opportunities?: Opportunity[]
  teamCode?: string
  targetType?: string
}) {
  const playerNames = [...new Set((options.playerNames ?? []).map((name) => name.trim()).filter(Boolean))]
  const targetType = options.targetType ?? 'listing'
  const targets: ScanCoverageTargetPayload[] = []

  for (const model of options.models) {
    for (const player of scanCoverageTargetPlayers(model, options.playerScope, playerNames)) {
      const playerKey = scanNameKey(player.playerName)
      if (!playerKey) continue
      const matchingListings = options.scanResult.listings.filter((listing) => {
        if (scanCoverageListingPlayerKey(listing) !== playerKey) return false
        const listingYear = scanCoverageListingReleaseYear(listing)
        return listingYear === null || listingYear === model.releaseYear
      })
      const matchingOpportunities = (options.opportunities ?? []).filter((opportunity) => {
        if (scanCoverageOpportunityPlayerKey(opportunity) !== playerKey) return false
        const listingYear = scanCoverageOpportunityReleaseYear(opportunity)
        return listingYear === null || listingYear === model.releaseYear
      })
      const bestOpportunity = [...matchingOpportunities].sort(
        (left, right) =>
          right.edgeDollars - left.edgeDollars ||
          right.score - left.score,
      )[0] ?? null
      targets.push({
        targetKey: `${targetType}:${checklistModelKey(model)}:${playerKey}`,
        playerName: player.playerName,
        playerKey,
        releaseKey: model.release,
        releaseYear: model.releaseYear,
        releaseName: checklistModelLabel(model),
        modelKey: checklistModelKey(model),
        teamCode: options.teamCode,
        targetType,
        status: scanCoverageTargetStatus(matchingListings.length, matchingOpportunities.length),
        listingCount: matchingListings.length,
        opportunityCount: matchingOpportunities.length,
        bestEdgeDollars: bestOpportunity?.edgeDollars ?? null,
        bestScore: bestOpportunity?.score ?? null,
        marketplaces: scanCoverageMarketplaceHits(matchingListings),
      })
    }
  }

  return targets
}

function scanCoverageStatsPayload(stats: EbayBinScanResult['stats']) {
  return { ...stats } as Record<string, unknown>
}

function scanQueueRefreshMinutesForTarget(scanType: LiveMarketScanType | 'superfractor', targetType: string, status?: ScanCoverageStatusKey) {
  if (scanType === 'auction') return status === 'live_opportunity' || status === 'live_hits' ? 10 : 90
  if (scanType === 'superfractor' || targetType === 'superfractor') {
    return status === 'live_opportunity' || status === 'live_hits' ? 6 * 60 : 24 * 60
  }
  if (status === 'live_opportunity') return 45
  if (status === 'live_hits') return 2 * 60
  return 8 * 60
}

function scanQueuePriorityForTarget(scanType: LiveMarketScanType | 'superfractor', targetType: string, target: ScanCoverageTargetPayload) {
  let priority = target.status === 'live_opportunity' ? 95 : target.status === 'live_hits' ? 75 : 45
  if (scanType === 'auction') priority += 5
  if (scanType === 'superfractor' || targetType === 'superfractor') priority += 8
  return Math.min(100, priority)
}

function buildScanQueueJobsFromTargets(options: {
  targets: ScanCoverageTargetPayload[]
  scanType: LiveMarketScanType | 'superfractor'
  teamCode: string
  teamLabel: string
  targetType: string
  searchMode: BinSearchMode | 'superfractor'
  playerScope: BinPlayerScope
  observedAt?: string
}) {
  const observedMs = Date.parse(options.observedAt ?? '')
  const baseMs = Number.isFinite(observedMs) ? observedMs : Date.now()
  return options.targets.map((target): ScanQueueJobPayload => {
    const refreshMinutes = scanQueueRefreshMinutesForTarget(options.scanType, options.targetType, target.status)
    const runAfter = new Date(baseMs + refreshMinutes * 60_000).toISOString()
    return {
      queueKey: target.targetKey ? `coverage:${options.scanType}:${target.targetKey}` : undefined,
      teamCode: options.teamCode,
      teamLabel: options.teamLabel,
      scanType: options.scanType,
      targetType: options.targetType,
      playerName: target.playerName,
      playerKey: target.playerKey,
      releaseKey: target.releaseKey,
      releaseYear: target.releaseYear,
      releaseName: target.releaseName,
      modelKey: target.modelKey,
      searchMode: options.searchMode,
      playerScope: options.playerScope,
      priority: scanQueuePriorityForTarget(options.scanType, options.targetType, target),
      runAfter,
      payload: {
        source: 'marlins-page',
        coverageStatus: target.status,
        listingCount: target.listingCount ?? 0,
        opportunityCount: target.opportunityCount ?? 0,
        bestEdgeDollars: target.bestEdgeDollars ?? null,
        bestScore: target.bestScore ?? null,
        observedAt: options.observedAt,
      },
    }
  })
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results: R[] = []
  let cursor = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        results[index] = await worker(items[index], index)
      }
    }),
  )

  return results
}

function downloadMatrixCsv(rows: PricingRow[]) {
  const headers = [
    'Rank',
    'Player',
    'Release',
    'Dynasty Rank',
    'Prospect Rank',
    'Dynasty Score',
    'Rank vs Price Score',
    'Expected Base From Rank',
    'Momentum Score',
    'Riser Value Score',
    'BIN Target Score',
    'Team',
    'Pos',
    'Age',
    'Level',
    'WAR',
    '3D Change',
    '7D Change',
    '14D Change',
    '30D Change',
    'Modeled Base',
    'Market Base',
    'Base Source',
    '30D Base Sales',
    '90D Base Sales',
    'Raw Base Sales',
    'Auction Base Sales',
    'BIN Base Sales',
    'Unknown Base Sales',
    'Effective Base Sales',
    'Base Volatility',
    'Variation',
    'Multiplier',
    'Modeled Price',
  ]
  const csvRows = rows.flatMap((row) => {
    const hasDynastySignal = row.stsDynastyScore !== null || row.stsRank !== null || row.stsProspectRank !== null
    const dynastyValueScore = scoreDynastyValueOpportunity(row)
    const hasModel = rowHasModel(row)
    return row.ladder.map((quote) => [
      row.rank,
      row.playerName,
      row.release,
      row.stsRank ?? '',
      row.stsProspectRank ?? '',
      row.stsDynastyScore?.toFixed(1) ?? '',
      hasDynastySignal && dynastyValueScore > 0 ? dynastyValueScore.toFixed(1) : '',
      hasDynastySignal ? impliedDynastyBasePrice(row).toFixed(2) : '',
      row.stsMomentumScore?.toFixed(1) ?? '',
      row.stsRiserValueScore?.toFixed(1) ?? '',
      row.stsBinTargetScore?.toFixed(1) ?? '',
      row.stsTeam ?? '',
      row.stsPosition ?? '',
      row.stsAge ?? '',
      row.stsLevel ?? '',
      row.stsWar ?? '',
      row.stsChange3d ?? '',
      row.stsChange7d ?? '',
      row.stsChange14d ?? '',
      row.stsChange30d ?? '',
      hasModel ? row.baseTwmaPrice.toFixed(2) : '',
      row.pulseBasePrice.toFixed(2),
      formatBaseSource(row.basePriceSource),
      row.baseSales30,
      row.baseSales90,
      row.rawBaseSales,
      row.baseAuctionSales,
      row.baseBinSales,
      row.baseUnknownSales,
      row.baseEffectiveSales.toFixed(2),
      row.baseVolatility.toFixed(3),
      quote.label,
      quote.multiplier.toFixed(4),
      quote.price.toFixed(2),
    ])
  })
  const csv = [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `backstop-card-finder-valuations-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function WorkflowCommand({
  mode,
  onModeChange,
  totalRows,
  pricedRows,
  topBase,
  dealCount,
  listingCount,
  modelReady,
}: {
  mode: WorkMode
  onModeChange: (mode: WorkMode) => void
  totalRows: number
  pricedRows: number
  topBase: number
  dealCount: number
  listingCount: number
  modelReady: boolean
}) {
  const navigationItems = [
    {
      mode: 'lookup' as const,
      tier: 'primary',
      eyebrow: 'Discover',
      title: 'Value Board',
      description: 'Best rank-to-price gaps',
      value: totalRows.toLocaleString(),
      icon: <Search size={19} />,
    },
    {
      mode: 'deals' as const,
      tier: 'primary',
      eyebrow: 'Shop',
      title: 'Live Deals',
      description: `${listingCount.toLocaleString()} listings checked`,
      value: dealCount.toLocaleString(),
      icon: <Radio size={19} />,
    },
    {
      mode: 'price' as const,
      tier: 'primary',
      eyebrow: 'Value',
      title: 'Price a Card',
      description: 'Player, parallel, grade',
      value: money(topBase),
      icon: <Calculator size={19} />,
    },
    {
      mode: 'case-hits' as const,
      tier: 'secondary',
      eyebrow: 'Rare',
      title: 'Case Hits',
      description: 'Print runs and live value',
      value: 'Beta',
      icon: <Gem size={19} />,
    },
    {
      mode: 'wax' as const,
      tier: 'secondary',
      eyebrow: 'Sealed',
      title: 'Sealed Wax',
      description: 'Hobby and Jumbo boxes',
      value: 'New',
      icon: <Package size={19} />,
    },
    {
      mode: 'health' as const,
      tier: 'secondary',
      eyebrow: 'System',
      title: 'Data Health',
      description: 'Freshness and coverage',
      value: modelReady ? 'OK' : '--',
      icon: <Activity size={19} />,
    },
  ]

  return (
    <section className="workflow-command" aria-label="Primary navigation">
      <div className="workflow-command-copy">
        <span className="workflow-kicker">
          <Activity size={14} />
          Market Desk
        </span>
        <h2>Backstop Market Desk</h2>
        <p>Find a player worth buying, check the live market, or price a card.</p>
        <div className="workflow-mini-tape">
          <span>{modelReady ? 'Model live' : 'Model loading'}</span>
          <span>{totalRows.toLocaleString()} players</span>
          <span>{pricedRows.toLocaleString()} priced lanes</span>
          <span>
            {mode === 'lookup'
              ? 'Value first'
              : mode === 'price'
                ? 'Calculator'
                : mode === 'health'
                  ? 'Freshness'
                  : mode === 'wax'
                    ? 'Hobby + Jumbo'
                    : `Top base ${money(topBase)}`}
          </span>
        </div>
      </div>

      <div className="workflow-mode-grid">
        {navigationItems.map((item) => (
          <button
            className={`workflow-mode-card ${item.tier} ${mode === item.mode ? 'active' : ''}`}
            type="button"
            onClick={() => onModeChange(item.mode)}
            aria-pressed={mode === item.mode}
            key={item.mode}
          >
            <span className="workflow-icon">{item.icon}</span>
            <span className="workflow-card-copy">
              <span>{item.eyebrow}</span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
            <span className="workflow-value">{item.value}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function MiniFreshnessLine({ values, tone }: { values: number[]; tone: FreshnessTone }) {
  const cleaned = values.filter((value) => Number.isFinite(value)).map((value) => Math.max(0, value))
  const series = cleaned.length >= 2 ? cleaned : [0, cleaned[0] ?? 0]
  const max = Math.max(1, ...series)
  const min = Math.min(...series)
  const range = Math.max(1, max - min)
  const points = series
    .map((value, index) => {
      const x = 8 + (index / Math.max(1, series.length - 1)) * 104
      const y = 38 - ((value - min) / range) * 26
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className={`freshness-sparkline ${tone}`} viewBox="0 0 120 46" aria-hidden="true">
      <line x1="8" x2="112" y1="38" y2="38" />
      <polyline points={points} />
      {points.split(' ').map((point, index) => {
        const [x, y] = point.split(',')
        return <circle cx={x} cy={y} r={index === series.length - 1 ? 3.4 : 2.6} key={`${point}:${index}`} />
      })}
    </svg>
  )
}

function ObservabilityBoard({
  snapshot,
  loading,
  error,
  onRefresh,
  onRefreshRankings,
  onRefreshComps,
  rankingsRefreshing,
  compsRefreshing,
  fallbackChecklistReleases,
  fallbackChecklistPlayers,
}: {
  snapshot: ObservabilitySnapshot | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onRefreshRankings: () => void
  onRefreshComps: () => void
  rankingsRefreshing: boolean
  compsRefreshing: boolean
  fallbackChecklistReleases: number
  fallbackChecklistPlayers: number
}) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 60_000)
    return () => window.clearInterval(timer)
  }, [snapshot?.checkedAt])
  const sales = snapshot?.salesCache
  const live = snapshot?.liveMarket
  const checklist = snapshot?.checklist
  const cardHedge = snapshot?.cardHedge
  const ranking = snapshot?.ranking
  const checklistQueuePending = checklist?.queue?.find((row) => row.status === 'queued')?.players ?? 0
  const checklistQueueDone = checklist?.queue?.find((row) => row.status === 'done')?.players ?? 0
  const hostedQueue = sales?.hosted?.queue ?? []
  const compQueuePending = hostedQueue
    .filter((row) => row.status !== 'done')
    .reduce((sum, row) => sum + row.players, 0)
  const compQueueDone = hostedQueue.find((row) => row.status === 'done')?.players ?? sales?.playerCount ?? 0
  const compCoverageTarget = sales?.hosted?.queueSeeds ?? compQueueDone + compQueuePending
  const compRunError = sales?.hosted?.latestRun?.error?.trim() ?? ''
  const confirmedFirstPlayers = checklist?.firstStatuses?.find((row) => row.status === 'confirmed_1st')?.players ?? 0
  const salesUpdatedAt = latestIso([
    sales?.canonical?.updatedAt,
    sales?.generatedAt,
    sales?.raw?.latestImportedAt,
    sales?.hosted?.latestRun?.completedAt,
  ])
  const salesTone = sales?.available ? freshnessTone(salesUpdatedAt, 24, 48) : ('offline' as FreshnessTone)
  const liveTone = live?.freshSnapshots ? freshnessTone(live.latestObservedAt, 24, 48) : ('empty' as FreshnessTone)
  const rankingTone = ranking?.rows ? freshnessTone(ranking.latestUpdated, 24, 48) : ('empty' as FreshnessTone)
  const checklistAvailable = Boolean(checklist?.available || fallbackChecklistReleases > 0)
  const checklistTone: FreshnessTone = checklistAvailable ? 'fresh' : 'offline'
  const cardHedgeRemainingDay = cardHedge?.usage?.remainingDay ?? 0
  const cardHedgeTone: FreshnessTone = !cardHedge?.configured
    ? 'offline'
    : cardHedgeRemainingDay <= 0
      ? 'stale'
      : cardHedgeRemainingDay < Math.max(1, (cardHedge.limits?.perDay ?? 0) * 0.15)
        ? 'watch'
        : 'fresh'
  const statusLabel: Record<FreshnessTone, string> = {
    fresh: 'Fresh',
    watch: 'Aging',
    stale: 'Stale',
    empty: 'Missing',
    offline: 'Offline',
  }
  const cards = [
    {
      key: 'sales',
      label: 'Sold Model',
      value: statusLabel[salesTone],
      metric: compCoverageTarget
        ? `${(sales?.playerCount ?? 0).toLocaleString()} / ${compCoverageTarget.toLocaleString()} players`
        : `${(sales?.canonical?.summarizedSales ?? sales?.modeledSales ?? 0).toLocaleString()} comps`,
      sub: sales?.hosted
        ? `${sales.hosted.freshCompLanes.toLocaleString()} fresh comp lanes / ${compQueuePending.toLocaleString()} queued`
        : `${(sales?.canonical?.cards ?? sales?.bucketCount ?? 0).toLocaleString()} lanes / ${ageLabel(salesUpdatedAt, now)}`,
      tone: salesTone,
      critical: true,
      values: [
        sales?.raw?.rows ?? 0,
        sales?.normalized?.modelEligibleRows ?? 0,
        sales?.canonical?.summarizedSales ?? 0,
        sales?.modeledSales ?? 0,
      ],
    },
    {
      key: 'live',
      label: 'Live Market',
      value: statusLabel[liveTone],
      metric: `${(live?.freshListings ?? 0).toLocaleString()} listings`,
      sub: `${(live?.freshOpportunities ?? 0).toLocaleString()} edges / ${ageLabel(live?.latestObservedAt, now)}`,
      tone: liveTone,
      critical: true,
      values: [live?.freshSnapshots ?? 0, live?.freshListings ?? 0, live?.freshOpportunities ?? 0],
    },
    {
      key: 'checklist',
      label: 'Checklist',
      value: statusLabel[checklistTone],
      metric: checklist?.available
        ? `${(checklist.universe?.total ?? checklist.cards?.total ?? 0).toLocaleString()} cards`
        : `${fallbackChecklistReleases.toLocaleString()} releases`,
      sub: checklist?.available
        ? `${confirmedFirstPlayers.toLocaleString()} confirmed 1sts / ${checklistQueuePending.toLocaleString()} pending review`
        : `${fallbackChecklistPlayers.toLocaleString()} modeled players / bundled snapshot`,
      tone: checklistTone,
      critical: false,
      values: checklist?.available
        ? [checklist.cards?.total ?? 0, checklist.universe?.total ?? 0, checklistQueueDone, checklistQueuePending]
        : [fallbackChecklistReleases, fallbackChecklistPlayers],
    },
    {
      key: 'rankings',
      label: 'Rankings',
      value: statusLabel[rankingTone],
      metric: `${(ranking?.matchedRows ?? 0).toLocaleString()} ranked`,
      sub: `${(ranking?.lowCoverageRows ?? 0).toLocaleString()} low coverage / ${ageLabel(ranking?.latestUpdated, now)}`,
      tone: rankingTone,
      critical: true,
      values: [ranking?.rows ?? 0, ranking?.matchedRows ?? 0, ranking?.lowCoverageRows ?? 0],
    },
    {
      key: 'api',
      label: 'Comp API',
      value: cardHedge?.configured ? cardHedgeRemainingDay.toLocaleString() : 'Off',
      metric: cardHedge?.configured ? 'requests left' : 'not connected',
      sub: cardHedge?.configured
        ? `${(cardHedge.usage?.day ?? 0).toLocaleString()} used today / ${cardHedge.plan || 'plan'}`
        : cardHedge?.message ?? 'Not configured',
      tone: cardHedgeTone,
      critical: false,
      values: [cardHedge?.limits?.perDay ?? 0, cardHedgeRemainingDay, cardHedge?.usage?.day ?? 0],
    },
  ]
  const unhealthyCriticalCards = cards.filter(
    (card) => card.critical && (card.tone === 'stale' || card.tone === 'empty' || card.tone === 'offline'),
  )
  const watchCriticalCards = cards.filter((card) => card.critical && card.tone === 'watch')
  const attention = [
    rankingTone !== 'fresh' ? `Rankings ${ageLabel(ranking?.latestUpdated, now)}: refresh` : '',
    salesTone !== 'fresh' ? `Sold model ${ageLabel(salesUpdatedAt, now)}` : '',
    !live?.freshSnapshots ? 'Run market scan' : liveTone !== 'fresh' ? `Market scan ${ageLabel(live.latestObservedAt, now)}` : '',
    compQueuePending > 0 ? `${compQueuePending.toLocaleString()} players awaiting fresh comps` : '',
    compRunError ? `Comp sync needs attention: ${cleanModelLanguage(compRunError).slice(0, 120)}` : '',
    sales?.cleanup?.bucketOverrides ? `${sales.cleanup.bucketOverrides.toLocaleString()} bucket fixes` : '',
    sales?.cleanup?.flaggedRows ? `${sales.cleanup.flaggedRows.toLocaleString()} flagged sales` : '',
  ].filter(Boolean)
  const boardSummary = !snapshot
    ? loading
      ? 'Checking sources'
      : 'No snapshot'
    : unhealthyCriticalCards.length > 0
      ? `${unhealthyCriticalCards.length.toLocaleString()} source${unhealthyCriticalCards.length === 1 ? '' : 's'} need refresh`
      : watchCriticalCards.length > 0
        ? `${watchCriticalCards.length.toLocaleString()} source${watchCriticalCards.length === 1 ? '' : 's'} aging`
        : 'All critical feeds under 24h'

  return (
    <section className="observability-board" aria-label="Data freshness">
      <div className="observability-head">
        <div>
          <span>
            <Activity size={14} />
            Freshness
          </span>
          <strong>{boardSummary}</strong>
          {snapshot ? <small>Checked {ageLabel(snapshot.checkedAt, now)} / 24h target for comps, market, and rankings</small> : null}
        </div>
        <div className="observability-actions">
          <button className="ghost-button" type="button" onClick={onRefreshComps} disabled={compsRefreshing || !cardHedge?.configured}>
            <RefreshCw size={15} className={compsRefreshing ? 'spin' : undefined} />
            Refresh comps
          </button>
          <button className="ghost-button" type="button" onClick={onRefreshRankings} disabled={rankingsRefreshing || !ranking?.refreshable}>
            <RefreshCw size={15} className={rankingsRefreshing ? 'spin' : undefined} />
            Refresh rankings
          </button>
          <button className="ghost-button" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : undefined} />
            Refresh status
          </button>
        </div>
      </div>
      {error ? <div className="observability-error">{error}</div> : null}
      <div className="observability-grid">
        {cards.map((card) => (
          <div className={`observability-card ${card.tone}`} key={card.key}>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <em>{card.metric}</em>
              <small>{card.sub}</small>
            </div>
            <MiniFreshnessLine values={card.values} tone={card.tone} />
          </div>
        ))}
      </div>
      {attention.length > 0 ? (
        <div className="observability-attention">
          {attention.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function Leaderboard({
  rows,
  rankById,
  selectedId,
  onSelect,
  onScanPlayer,
  onRefreshPlayer,
  refreshingPlayerId,
  emptyTitle = 'No priced players loaded.',
  emptyText = 'Connect market data to load player base prices.',
}: {
  rows: PricingRow[]
  rankById?: Map<string, number>
  selectedId?: string
  onSelect: (rowId: string) => void
  onScanPlayer: (row: PricingRow) => void
  onRefreshPlayer?: (row: PricingRow) => void
  refreshingPlayerId?: string | null
  emptyTitle?: string
  emptyText?: string
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state board-empty">
        <BarChart3 size={28} />
        <strong>{emptyTitle}</strong>
        <span>{emptyText}</span>
      </div>
    )
  }

  return (
    <div className="leaderboard-shell">
      <div className="leaderboard-head">
        <span>#</span>
        <span>Player</span>
        <span>Base Auto</span>
        <span>Value Signal</span>
        <span>Model Trust</span>
      </div>
      <div className="leaderboard-list">
        {rows.map((row, index) => {
          const displayRank = rankById?.get(row.id) ?? index + 1
          const hasModel = rowHasModel(row)
          const refreshingModel = refreshingPlayerId === row.id
          const valueScore = scoreDynastyValueOpportunity(row)
          const impliedBase = impliedDynastyBasePrice(row)
          const valueGapPct = impliedBase > 0 && row.baseTwmaPrice > 0 ? impliedBase / row.baseTwmaPrice - 1 : null
          const valueMultiple = dynastyValueMultiple(row)
          const valueDetails = [
            impliedBase > 0 ? `${money(impliedBase)} implied` : 'no rank base',
            valueMultiple > 0 ? `${valueMultiple.toFixed(valueMultiple >= 10 ? 1 : 2)}x` : null,
            valueGapPct !== null ? `${valueGapPct >= 0 ? '+' : ''}${Math.round(valueGapPct * 100)}% gap` : null,
          ].filter(Boolean)
          const trustSignal = modelTrustSignal(row)
          return (
            <article
              className={`leaderboard-row ${selectedId === row.id ? 'selected' : ''}`}
              key={row.id}
              onClick={() => onSelect(row.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onSelect(row.id)
              }}
              tabIndex={0}
              aria-selected={selectedId === row.id}
              aria-label={`Select ${row.playerName}`}
            >
              <span className="rank-chip">{displayRank}</span>
              <span className="player-chip">
                <button
                  className={`leaderboard-player-button ${hasModel ? '' : 'needs-model'}`}
                  type="button"
                  disabled={refreshingModel || (!hasModel && !onRefreshPlayer)}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(row.id)
                    if (hasModel) onScanPlayer(row)
                    else onRefreshPlayer?.(row)
                  }}
                  aria-label={
                    hasModel
                      ? `Scan live listings for ${row.playerName}`
                      : `Build a sold comp model for ${row.playerName}`
                  }
                >
                  <strong>{row.playerName}</strong>
                  <span>
                    {refreshingModel ? <RefreshCw size={12} className="spin" /> : hasModel ? <Radio size={12} /> : <Database size={12} />}
                    {refreshingModel ? 'Building model' : hasModel ? 'Scan deals' : 'Build comps'}
                  </span>
                </button>
                <small>
                  {row.release}
                  {row.currentTeamName ? ` / ${row.currentTeamName}` : ''}
                </small>
                {row.stsName ? (
                  <span className="sts-inline">
                    <span>{formatStsLine(row)}</span>
                    {row.stsChange30d !== null ? (
                      <span className={`change-pill ${changeClassName(row.stsChange30d)}`}>30D {formatSigned(row.stsChange30d)}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="sts-inline muted">Unranked</span>
                )}
              </span>
              <span className="money-chip">
                <strong>{formatBasePrice(row)}</strong>
                <small>{formatBaseMethod(row.baseMethod)}</small>
              </span>
              <span className="value-signal-cell">
                <strong>{valueScore > 0 ? `${valueScore.toFixed(0)} value` : '--'}</strong>
                <small>{valueDetails.length > 0 ? valueDetails.join(' / ') : 'ranking unavailable'}</small>
              </span>
              <span className={`model-trust-cell ${trustSignal.tone}`}>
                <strong>
                  <ShieldCheck size={13} />
                  {trustSignal.label}
                </strong>
                <small>{trustSignal.detail}</small>
                <em>{trustSignal.action}</em>
              </span>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function TeamOpportunityQueue({
  entries,
  binCount,
  auctionCount,
  loading,
  auctionLoading,
  error,
  auctionError,
  hasLiveSource,
  liveListingCount,
  modelCount,
  checklistPlayerCount,
  lastRejectedListing,
  onRejectListing,
  onUndoRejectListing,
}: {
  entries: TeamDealEntry[]
  binCount: number
  auctionCount: number
  loading: boolean
  auctionLoading: boolean
  error: string | null
  auctionError: string | null
  hasLiveSource: boolean
  liveListingCount: number
  modelCount: number
  checklistPlayerCount: number
  lastRejectedListing: ListingRejection | null
  onRejectListing: (opportunity: Opportunity) => void
  onUndoRejectListing: () => void
}) {
  const busy = loading || auctionLoading
  const buyGradeEntries = entries.filter(isTeamBuyGradeEntry)
  const buyGradePlayerCount = new Set(buyGradeEntries.map(teamDealEntryPlayerKey).filter(Boolean)).size
  const liveDealPlayerCount = new Set(entries.map(teamDealEntryPlayerKey).filter(Boolean)).size
  const sourceEntries = buyGradeEntries.length > 0 ? buyGradeEntries : entries
  const visibleEntries = playerFirstTeamDealEntries(sourceEntries).slice(0, 28)
  const topScore = entries[0]?.dealScore ?? null

  return (
    <section className="team-opportunity-panel" aria-label="Best active Marlins deals">
      <div className="team-section-head">
        <div>
          <span>Best Live Marlins Buys</span>
          <strong>
            {buyGradeEntries.length
              ? `${buyGradePlayerCount.toLocaleString()} Marlins with buy-grade live deals`
              : entries.length
                ? 'No buy-grade live deals yet'
                : 'Miami live board waiting'}
          </strong>
          <small>
            {buyGradeEntries.length
              ? 'Positive modeled edge only, ranked by deal score, dynasty value, prospect rank, momentum, trust, and auction timing.'
              : 'Showing the closest modeled live listings below while the full checklist scan keeps searching for better Miami edges.'}
          </small>
        </div>
        <div className="team-section-pills">
          {topScore !== null ? <span>Top score {topScore}</span> : null}
          <span>{buyGradeEntries.length.toLocaleString()} buy-grade</span>
          <span>{buyGradePlayerCount.toLocaleString()} buy players</span>
          <span>{liveDealPlayerCount.toLocaleString()} live players</span>
          <span>{binCount.toLocaleString()} BINs</span>
          <span>{auctionCount.toLocaleString()} auctions</span>
          <span>{liveListingCount.toLocaleString()} live dots</span>
          <span>{checklistPlayerCount.toLocaleString()} players / {modelCount.toLocaleString()} sets</span>
        </div>
      </div>

      {error ? (
        <div className="bin-radar-alert">
          <ShieldCheck size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {auctionError ? (
        <div className="bin-radar-alert">
          <ShieldCheck size={16} />
          <span>{auctionError}</span>
        </div>
      ) : null}

      {lastRejectedListing ? (
        <div className="bin-radar-alert bin-radar-alert-success">
          <Ban size={16} />
          <span>
            Rejected: {lastRejectedListing.playerName || 'listing'}
            {lastRejectedListing.title ? ` / ${lastRejectedListing.title}` : ''}
          </span>
          <button className="inline-undo-button" type="button" onClick={onUndoRejectListing}>
            <Undo2 size={14} />
            Undo
          </button>
        </div>
      ) : null}

      {busy && visibleEntries.length === 0 ? (
        <div className="bin-empty-state ready compact-empty">
          <RefreshCw size={24} className="spin" />
          <div>
            <strong>Modeling Miami listings now.</strong>
            <span>The page will fill in as active listings clear the Marlins deal score.</span>
          </div>
        </div>
      ) : !hasLiveSource ? (
        <div className="bin-empty-state ready compact-empty">
          <Radio size={24} />
          <div>
            <strong>Run a Miami sweep to build the modeled deal board.</strong>
            <span>Fresh results are scored across the stored Marlins checklist universe, then cached briefly for this page.</span>
          </div>
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="bin-empty-state muted compact-empty">
          <Activity size={24} />
          <div>
            <strong>No active Marlins listing is inside the model window.</strong>
            <span>Try refreshing the page scan or lowering the minimum price if you want a wider review set.</span>
          </div>
        </div>
      ) : (
        <div className="bin-opportunity-list team-opportunity-list">
          <div className="bin-opportunity-head">
            <span>Rank</span>
            <span>Listing</span>
            <span>All In</span>
            <span>Model</span>
            <span>Spread</span>
            <span>Signal</span>
          </div>
          {visibleEntries.map(({ opportunity, type, sts, modelRow, dealScore, dynastyValueScore, momentumScore, rankLabel }, index) => {
            const gradingLabel = listingGradingLabel(opportunity.listing)
            const signal = type === 'Auction' ? closeTimeLabel(opportunity.listing.hoursToClose) : opportunity.action
            const releaseLabel = modelRow ? `${modelRow.releaseYear} ${CATEGORY_LABELS[modelRow.category]}` : null
            return (
              <article className={`bin-opportunity-row lane-${opportunity.lane}`} key={`team:${type}:${opportunity.listing.id}:${index}`}>
                <div className="bin-rank-cell">
                  <strong>#{index + 1}</strong>
                  <span>{type}</span>
                </div>
                <div className="bin-listing-cell">
                  <strong>{opportunity.listing.playerName}</strong>
                  <span>{opportunity.listing.title}</span>
                  <div className="bin-evidence-strip">
                    <small>{opportunity.matchedVariation ?? opportunity.listing.variationLabel}</small>
                    <small className="deal-score-chip">Deal Score {dealScore}</small>
                    {dynastyValueScore > 0 ? <small className="dynasty-chip">Dynasty value {dynastyValueScore.toFixed(0)}</small> : null}
                    {modelRow?.stsBinTargetScore != null ? <small className="target-chip">Target {modelRow.stsBinTargetScore.toFixed(1)}</small> : null}
                    {momentumScore != null ? <small className="sts-chip">Momentum {momentumScore.toFixed(1)}</small> : null}
                    <small className={opportunity.trustScore >= 72 ? 'trust-chip good' : opportunity.trustScore >= 58 ? 'trust-chip' : 'trust-chip warning'}>
                      Trust {opportunity.trustScore}
                    </small>
                    {gradingLabel ? <small className="graded-chip">{gradingLabel}</small> : null}
                    {releaseLabel ? <small>{releaseLabel}</small> : null}
                    <small>{formatModelSource(opportunity.valuationSource)}</small>
                    {opportunity.compSaleCount ? <small className="sold-lane-chip">{opportunity.compSaleCount.toLocaleString()} sold lane</small> : null}
                    {opportunity.compLast5Avg ? <small className="sold-lane-chip">Last 5 {money(opportunity.compLast5Avg)}</small> : null}
                    {rankLabel ? <small className="sts-chip">{rankLabel}</small> : sts.primaryRankLabel ? <small className="sts-chip">{sts.primaryRankLabel}</small> : <small className="warning">Unranked</small>}
                    {modelRow?.stsChange30d !== null && modelRow?.stsChange30d !== undefined ? (
                      <small className={`sts-chip ${changeClassName(modelRow.stsChange30d)}`}>30D {formatSigned(modelRow.stsChange30d)}</small>
                    ) : sts.change30d !== null ? (
                      <small className={`sts-chip ${changeClassName(sts.change30d)}`}>30D {formatSigned(sts.change30d)}</small>
                    ) : null}
                    {opportunity.warnings[0] ? <small className="warning">{opportunity.warnings[0]}</small> : null}
                  </div>
                </div>
                <div className="bin-money-cell">
                  <strong>{money(opportunity.listing.allInPrice)}</strong>
                  <span>{type === 'Auction' ? auctionBidShipLabel(opportunity.listing) : 'BIN + ship'}</span>
                </div>
                <div className="bin-money-cell">
                  <strong>{money(opportunity.fairValue)}</strong>
                  <span>{formatModelSource(opportunity.valuationSource)}</span>
                </div>
                <div className={`bin-money-cell ${opportunity.edgeDollars >= 0 ? 'edge' : 'near-model'}`}>
                  <strong>{money(opportunity.edgeDollars)}</strong>
                  <span>{percent(opportunity.expectedRoiPct)} model edge</span>
                </div>
                <div className="bin-signal-cell">
                  <span>{signal}</span>
                  {opportunity.listing.listingUrl ? (
                    <a href={opportunity.listing.listingUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} />
                      {listingMarketplaceLabel(opportunity.listing)}
                    </a>
                  ) : null}
                  <button
                    className="listing-reject-button"
                    type="button"
                    onClick={() => onRejectListing(opportunity)}
                    title="Hide this incorrect listing from future Miami runs"
                  >
                    <Ban size={14} />
                    Reject
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function TeamChecklistOpportunityBoard({
  opportunities,
  liveDealEntries,
  onScanPlayer,
}: {
  opportunities: TeamChecklistOpportunity[]
  liveDealEntries: TeamDealEntry[]
  onScanPlayer: (playerName: string) => void
}) {
  const visibleOpportunities = opportunities.slice(0, 24)
  const pricedCount = opportunities.filter((opportunity) => opportunity.bestRow).length
  const rankedCount = opportunities.filter(
    (opportunity) => opportunity.ranking || opportunity.bestRow?.stsRank != null || opportunity.bestRow?.stsProspectRank != null,
  ).length
  const livePlayerKeys = new Set(liveDealEntries.map((entry) => scanNameKey(entry.opportunity.listing.playerName)))

  return (
    <section className="team-opportunity-board" aria-label="Marlins opportunity board">
      <div className="team-section-head">
        <div>
          <span>Marlins Opportunity Board</span>
          <strong>Best Miami targets across the full checklist universe</strong>
          <small>Ranked before the live marketplace layer, so thin pricing coverage cannot hide better Marlins targets.</small>
        </div>
        <div className="team-section-pills">
          <span>{opportunities.length.toLocaleString()} players</span>
          <span>{rankedCount.toLocaleString()} ranked</span>
          <span>{pricedCount.toLocaleString()} priced</span>
          <span>{Math.max(0, opportunities.length - pricedCount).toLocaleString()} need price lanes</span>
        </div>
      </div>

      {visibleOpportunities.length === 0 ? (
        <div className="bin-empty-state ready compact-empty">
          <Database size={24} />
          <div>
            <strong>Marlins checklist universe is still loading.</strong>
            <span>Once the checklist feed resolves, this board will rank every Miami player we know about.</span>
          </div>
        </div>
      ) : (
        <div className="team-target-grid">
          {visibleOpportunities.map((opportunity, index) => {
            const liveActive = livePlayerKeys.has(scanNameKey(opportunity.playerName))
            return (
              <article className={`team-target-card ${opportunity.bestRow ? 'priced' : 'unpriced'}`} key={`marlins-target:${scanNameKey(opportunity.playerName)}`}>
                <div className="team-target-rank">
                  <strong>#{index + 1}</strong>
                  <span>{opportunity.score}</span>
                </div>
                <div className="team-target-main">
                  <div className="team-target-title">
                    <div>
                      <strong>{opportunity.playerName}</strong>
                      <small>
                        {opportunity.rankLabel ?? 'Rank pending'} / {opportunity.checklistCount.toLocaleString()} checklist
                        {opportunity.checklistCount === 1 ? '' : 's'}
                      </small>
                    </div>
                    <button className="ghost-button icon-lite-button" type="button" onClick={() => onScanPlayer(opportunity.playerName)}>
                      <Radio size={14} />
                      Scan
                    </button>
                  </div>
                  <div className="bin-evidence-strip team-target-evidence">
                    <small className="deal-score-chip">Opportunity {opportunity.score}</small>
                    {liveActive ? <small className="sold-lane-chip good">Live lead active</small> : null}
                    {opportunity.reasons.map((reason) => (
                      <small className={reason === 'Needs priced lane' ? 'warning' : reason.startsWith('Dynasty') ? 'dynasty-chip' : 'sts-chip'} key={`${opportunity.playerName}:${reason}`}>
                        {reason}
                      </small>
                    ))}
                  </div>
                  <div className="team-target-sets">
                    {opportunity.modelLabels.slice(0, 4).map((label) => (
                      <span key={`${opportunity.playerName}:${label}`}>{label}</span>
                    ))}
                    {opportunity.modelLabels.length > 4 ? <span>+{(opportunity.modelLabels.length - 4).toLocaleString()} more</span> : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function TeamScanCoveragePanel({
  coverage,
  busy,
  hasLiveSource,
  onScanPlayer,
}: {
  coverage: TeamPlayerScanCoverage[]
  busy: boolean
  hasLiveSource: boolean
  onScanPlayer: (playerName: string) => void
}) {
  const buyGradePlayerCount = coverage.filter((item) => item.buyGradeEntry).length
  const liveInventoryPlayerCount = coverage.filter((item) => item.totalListingCount > 0 || item.modeledListingCount > 0).length
  const pricedPlayerCount = coverage.filter((item) => item.opportunity.bestRow).length
  const priceLaneGapCount = coverage.filter((item) => !item.opportunity.bestRow).length
  const warningCount = coverage.filter((item) => item.scanIssueCount > 0).length
  const listingCount = coverage.reduce((total, item) => total + item.totalListingCount, 0)
  const modeledCoverage = coverage.filter((item) => item.opportunity.bestRow || item.bestEntry || item.buyGradeEntry)
  const modeledKeys = new Set(modeledCoverage.map((item) => scanNameKey(item.playerName)))
  const pricingBacklog = coverage.filter((item) => !modeledKeys.has(scanNameKey(item.playerName)))
  const backlogLiveHits = pricingBacklog.reduce((total, item) => total + item.totalListingCount, 0)

  const renderCoverageRow = (item: TeamPlayerScanCoverage) => {
    const liveHitLabel =
      item.totalListingCount > 0
        ? `${item.binListingCount.toLocaleString()} BIN / ${item.auctionListingCount.toLocaleString()} auc`
        : item.modeledListingCount > 0
          ? `${item.modeledListingCount.toLocaleString()} modeled`
          : '0 live'
    const bestUrl = item.bestEntry?.opportunity.listing.listingUrl
    return (
      <article className={`team-scan-player-row ${item.statusTone}`} key={`scan-coverage:${scanNameKey(item.playerName)}`}>
        <div className="team-scan-player-main">
          <strong>{item.playerName}</strong>
          <small>
            {item.opportunity.rankLabel ?? 'Rank pending'} / {item.opportunity.checklistCount.toLocaleString()} checklist
            {item.opportunity.checklistCount === 1 ? '' : 's'}
          </small>
        </div>
        <div className="team-scan-player-status">
          <span>{item.statusLabel}</span>
          <small>{item.detail}</small>
        </div>
        <div className="team-scan-player-counts">
          <strong>{liveHitLabel}</strong>
          <small>{item.buyGradeEntry ? `Deal score ${item.buyGradeEntry.dealScore}` : `Opportunity ${item.opportunity.score}`}</small>
        </div>
        <div className="team-scan-player-model">
          <strong>{item.modelState}</strong>
          {item.modelTrust ? (
            <small className={`team-confidence-chip ${item.modelTrust.tone}`}>
              Tier {item.confidenceTier} / {item.modelTrust.label}
            </small>
          ) : (
            <small>{item.opportunity.modelLabels.slice(0, 2).join(' / ') || 'Checklist source pending'}</small>
          )}
        </div>
        <div className="team-scan-player-actions">
          {bestUrl ? (
            <a className="ghost-button icon-lite-button" href={bestUrl} target="_blank" rel="noreferrer" title={`Open best ${item.playerName} listing`}>
              <ExternalLink size={14} />
              Open
            </a>
          ) : null}
          <button className="ghost-button icon-lite-button" type="button" onClick={() => onScanPlayer(item.playerName)}>
            <Radio size={14} />
            Scan
          </button>
        </div>
      </article>
    )
  }

  const coverageHead = (
    <div className="team-scan-coverage-head">
      <span>Player</span>
      <span>Status</span>
      <span>Live Hits</span>
      <span>Model</span>
      <span>Action</span>
    </div>
  )

  return (
    <section className="team-scan-coverage" aria-label="Full Marlins scan coverage">
      <div className="team-section-head">
        <div>
          <span>Full Player Scan Coverage</span>
          <strong>
            {hasLiveSource
              ? `${coverage.length.toLocaleString()} Marlins checked across live marketplaces`
              : `${pricedPlayerCount.toLocaleString()} / ${coverage.length.toLocaleString()} Marlins model-ready`}
          </strong>
          <small>Every loaded checklist player has a row; buy-grade requires positive modeled edge and a trusted card match.</small>
        </div>
        <div className="team-section-pills">
          <span>{buyGradePlayerCount.toLocaleString()} buy players</span>
          <span>{pricedPlayerCount.toLocaleString()} priced players</span>
          <span>{liveInventoryPlayerCount.toLocaleString()} with live hits</span>
          <span>{listingCount.toLocaleString()} scanned listings</span>
          <span>{priceLaneGapCount.toLocaleString()} need price lanes</span>
          {warningCount > 0 ? <span>{warningCount.toLocaleString()} warnings</span> : null}
        </div>
      </div>

      {busy ? (
        <div className="team-coverage-banner">
          <RefreshCw size={16} className="spin" />
          <span>Full Miami sweep running.</span>
        </div>
      ) : !hasLiveSource ? (
        <div className="team-coverage-banner muted">
          <Radio size={16} />
          <span>Run the live sweep to populate marketplace hits for every Marlins checklist player.</span>
        </div>
      ) : null}

      <div className="team-scan-coverage-list">
        {coverageHead}
        {(modeledCoverage.length > 0 ? modeledCoverage : coverage).map(renderCoverageRow)}
      </div>

      {pricingBacklog.length > 0 && modeledCoverage.length > 0 ? (
        <details className="team-pricing-backlog">
          <summary>
            <span>Pricing Backlog</span>
            <strong>{pricingBacklog.length.toLocaleString()} players still need price lanes</strong>
            <small>{backlogLiveHits.toLocaleString()} scanned listings waiting on sold-comp models</small>
          </summary>
          <div className="team-scan-coverage-list team-pricing-backlog-list">
            {coverageHead}
            {pricingBacklog.map(renderCoverageRow)}
          </div>
        </details>
      ) : null}
    </section>
  )
}

function coverageStateLabel(state: string) {
  if (state === 'no-clean-base') return 'No clean base'
  if (state === 'missing') return 'Missing lane'
  if (state === 'queued') return 'Queued'
  if (state === 'running') return 'Running'
  if (state === 'timeout') return 'Timeout'
  if (state === 'error') return 'Error'
  if (state === 'stale') return 'Stale'
  if (state === 'thin') return 'Thin'
  if (state === 'priced') return 'Priced'
  return state.replace(/-/g, ' ')
}

function coverageStateTone(state: string) {
  if (state === 'priced') return 'priced'
  if (state === 'stale' || state === 'thin' || state === 'no-clean-base') return 'watch'
  if (state === 'timeout' || state === 'error') return 'error'
  if (state === 'queued' || state === 'running') return 'queued'
  return 'missing'
}

function TeamCoverageEnginePanel({
  coverage,
  loading,
  error,
  checklistPlayerCount,
  onRefresh,
  onScanPlayer,
}: {
  coverage: ChecklistCoveragePayload | null
  loading: boolean
  error: string | null
  checklistPlayerCount: number
  onRefresh: () => void
  onScanPlayer: (playerName: string) => void
}) {
  const summary = coverage?.summary
  const totalPlayers = summary?.totalPlayers ?? checklistPlayerCount
  const pricedPlayers = summary?.pricedPlayers ?? 0
  const missingPlayers = summary?.missingPriceLanePlayers ?? Math.max(0, totalPlayers - pricedPlayers)
  const coveragePct = summary?.coveragePct ?? (totalPlayers ? Number(((pricedPlayers / totalPlayers) * 100).toFixed(1)) : 0)
  const healthyPct = summary?.healthyPct ?? coveragePct
  const nextRefresh = coverage?.nextRefresh ?? []
  const tierRows = summary?.byTier ?? []
  const stateRows = summary?.byState ?? []
  const releaseRows = coverage?.releases.slice(0, 8) ?? []
  const latestCompLabel = summary?.latestCompAt ? ageLabel(summary.latestCompAt) : 'never'

  return (
    <section className="team-coverage-engine" aria-label="Pricing coverage engine">
      <div className="team-section-head">
        <div>
          <span>Pricing Coverage Engine</span>
          <strong>{coverage ? `${pricedPlayers.toLocaleString()} / ${totalPlayers.toLocaleString()} modeled lanes` : 'Coverage state loading'}</strong>
          <small>{coverage ? `${missingPlayers.toLocaleString()} players in comp backlog / latest comp ${latestCompLabel}` : 'Reading checklist queue and modeled lane health.'}</small>
        </div>
        <div className="team-section-pills">
          <span>{coveragePct.toFixed(1)}% priced</span>
          <span>{healthyPct.toFixed(1)}% healthy</span>
          <span>{(summary?.retryPlayers ?? 0).toLocaleString()} retries</span>
          <span>{(summary?.stalePlayers ?? 0).toLocaleString()} stale</span>
        </div>
      </div>

      {error ? (
        <div className="team-coverage-banner error">
          <Ban size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="team-coverage-engine-grid">
        <div className="coverage-engine-card main">
          <span>Modeled Coverage</span>
          <strong>{coveragePct.toFixed(1)}%</strong>
          <div className="coverage-engine-meter" aria-label="Modeled coverage meter">
            <i style={{ width: `${clampNumber(coveragePct, 0, 100)}%` }} />
          </div>
          <small>{pricedPlayers.toLocaleString()} priced / {missingPlayers.toLocaleString()} backlog / {totalPlayers.toLocaleString()} total</small>
        </div>
        <div className="coverage-engine-card">
          <span>Lane Quality</span>
          <div className="coverage-state-list">
            {tierRows.length > 0 ? (
              tierRows.map((row) => (
                <small className={`coverage-state-chip tier-${row.tier.toLowerCase()}`} key={`tier:${row.tier}`}>
                  Tier {row.tier}: {row.players.toLocaleString()}
                </small>
              ))
            ) : (
              <small className="coverage-state-chip missing">No tiers yet</small>
            )}
          </div>
        </div>
        <div className="coverage-engine-card">
          <span>Queue State</span>
          <div className="coverage-state-list">
            {stateRows.slice(0, 5).map((row) => (
              <small className={`coverage-state-chip ${coverageStateTone(row.state)}`} key={`state:${row.state}`}>
                {coverageStateLabel(row.state)}: {row.players.toLocaleString()}
              </small>
            ))}
          </div>
        </div>
      </div>

      <div className="coverage-cadence" aria-label="Refresh cadence">
        <div>
          <span>Hot</span>
          <small>{coverage?.cadence.hot ?? 'Hourly for live-hit gaps'}</small>
        </div>
        <div>
          <span>Priority</span>
          <small>{coverage?.cadence.priority ?? 'Nightly for ranked and team-page players'}</small>
        </div>
        <div>
          <span>Long Tail</span>
          <small>{coverage?.cadence.longTail ?? 'Weekly for remaining checklist players'}</small>
        </div>
      </div>

      <div className="coverage-next-list" aria-label="Next comp refresh candidates">
        <div className="coverage-next-head">
          <div>
            <span>Next Comp Refresh Queue</span>
            <strong>{nextRefresh.length.toLocaleString()} priority candidates</strong>
          </div>
          <button className="ghost-button icon-lite-button" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : undefined} />
            Refresh
          </button>
        </div>
        {nextRefresh.slice(0, 10).map((row) => (
          <article className="coverage-next-row" key={`coverage-next:${row.releaseYear}:${scanNameKey(row.playerName)}`}>
            <div>
              <strong>{row.playerName}</strong>
              <small>{row.releaseYear} / {row.releaseName}</small>
            </div>
            <span className={`coverage-state-chip ${coverageStateTone(row.laneState)}`}>{coverageStateLabel(row.laneState)}</span>
            <div>
              <strong>{row.action}</strong>
              <small>{row.reason}</small>
            </div>
            <button className="ghost-button icon-lite-button" type="button" onClick={() => onScanPlayer(row.playerName)}>
              <Radio size={14} />
              Scan
            </button>
          </article>
        ))}
        {!loading && nextRefresh.length === 0 ? (
          <div className="empty-state compact">
            <strong>Coverage backlog is clear.</strong>
            <span>Modeled lanes are available for the selected checklist universe.</span>
          </div>
        ) : null}
      </div>

      {releaseRows.length > 0 ? (
        <div className="coverage-release-bars" aria-label="Coverage by release">
          {releaseRows.map((release) => {
            const pct = release.players ? (release.pricedPlayers / release.players) * 100 : 0
            return (
              <div key={`coverage-release:${release.releaseKey}`}>
                <span>{release.releaseName}</span>
                <strong>{release.pricedPlayers.toLocaleString()} / {release.players.toLocaleString()}</strong>
                <i><b style={{ width: `${clampNumber(pct, 0, 100)}%` }} /></i>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

function teamOpportunityProspectRank(opportunity: TeamChecklistOpportunity) {
  return opportunity.bestRow?.stsProspectRank ?? opportunity.ranking?.prospectRank ?? null
}

function teamOpportunityPrimaryRank(opportunity: TeamChecklistOpportunity) {
  return opportunity.bestRow
    ? primaryStsRank({ rank: opportunity.bestRow.stsRank, prospectRank: opportunity.bestRow.stsProspectRank })
    : opportunity.ranking
      ? primaryStsRank(opportunity.ranking)
      : null
}

type TeamSuperfractorEntry = {
  listing: MarketplaceListing
  type: 'BIN' | 'Auction'
  modelRow: PricingRow | null
  modelValue: number | null
  modelLabel: string
  modelSource: 'exact' | 'proxy' | 'missing'
  modelMatchScore: number
  allInPrice: number
  edgeDollars: number | null
  roiPct: number | null
  score: number
  rankLabel: string | null
}

function rawListingNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = parseMoneyInput(String(value ?? ''))
  return parsed ?? 0
}

function rawListingAllInPrice(listing: MarketplaceListing) {
  return rawListingNumber(listing.current_price ?? listing.price ?? listing.sold_price) + rawListingNumber(listing.shipping_cost)
}

function rawListingUrl(listing: MarketplaceListing) {
  return String(listing.listing_url ?? listing.url ?? '').trim()
}

function rawListingTitle(listing: MarketplaceListing) {
  return String(listing.title ?? '').trim()
}

function rawListingSearchText(listing: MarketplaceListing) {
  return `${listing.title ?? ''} ${listing.variation ?? ''} ${listing.product_type ?? ''} ${listing.release ?? ''}`.toLowerCase()
}

function rawListingLooksLikeSuperfractor(listing: MarketplaceListing) {
  const text = `${listing.title ?? ''} ${listing.variation ?? ''} ${listing.base_color ?? ''} ${listing.product_type ?? ''} ${listing.release ?? ''}`
  return titleLooksLikeSuperfractor(text, { requireBowman: false })
}

function rawListingCanUseSuperfractorProxy(listing: MarketplaceListing) {
  return titleCanUseBowmanSuperfractorAutoProxy(rawListingSearchText(listing))
}

function superfractorQuoteForRow(row: PricingRow) {
  return (
    row.ladder.find((quote) => /\bsuperfractor\b|\bsuper\s+fractor\b|\/1\b/i.test(quote.label) && quote.price > 0) ?? null
  )
}

function rawListingReleaseYear(listing: MarketplaceListing) {
  const fieldYear = Number(String(listing.release_year ?? '').replace(/[^0-9]/g, ''))
  if (Number.isFinite(fieldYear) && fieldYear >= 1990 && fieldYear <= 2100) return fieldYear
  const titleYear = rawListingSearchText(listing).match(/\b(20[0-9]{2}|19[0-9]{2})\b/)
  return titleYear ? Number(titleYear[1]) : null
}

function rawListingRowMatchScore(row: PricingRow, listing: MarketplaceListing) {
  const listingYear = rawListingReleaseYear(listing)
  const listingText = scanNameKey(rawListingSearchText(listing))
  let score = 0

  if (listingYear && row.releaseYear === listingYear) score += 36
  if (listingText.includes(String(row.releaseYear))) score += 8
  if (row.category === 'chrome' && listingText.includes('chrome')) score += 8
  if (row.category === 'draft' && listingText.includes('draft')) score += 8
  if (row.category === 'bowman' && listingText.includes('bowman') && !listingText.includes('draft')) score += 5

  const releaseKey = scanNameKey(row.release)
  if (releaseKey && listingText.includes(releaseKey)) score += 10

  return score
}

function bestSuperfractorModelForListing(listing: MarketplaceListing, rowsByPlayer: Map<string, PricingRow[]>) {
  const playerRows = (rowsByPlayer.get(scanNameKey(rawListingPlayerName(listing))) ?? []).filter(rowHasModel)
  if (playerRows.length === 0) return { row: null, value: null, label: 'Needs exact lane', source: 'missing' as const, matchScore: 0 }

  const canUseProxy = rawListingCanUseSuperfractorProxy(listing)
  const modeledRows = playerRows
    .map((row) => {
      const matchScore = rawListingRowMatchScore(row, listing)
      const quote = superfractorQuoteForRow(row)
      const fallbackValue = canUseProxy && matchScore > 0 && row.baseTwmaPrice > 0 ? row.baseTwmaPrice * 40 : null
      return {
        row,
        value: quote?.price ?? fallbackValue,
        label: quote ? quote.label : fallbackValue ? 'Auto proxy (base x40)' : 'Needs exact lane',
        source: quote ? ('exact' as const) : fallbackValue ? ('proxy' as const) : ('missing' as const),
        matchScore,
      }
    })
    .filter((entry) => entry.value !== null && entry.value > 0)

  const fallbackRow = [...playerRows].sort(
    (left, right) =>
      rawListingRowMatchScore(right, listing) - rawListingRowMatchScore(left, listing) ||
      scoreDynastyValueOpportunity(right) - scoreDynastyValueOpportunity(left) ||
      (right.stsBinTargetScore ?? -1) - (left.stsBinTargetScore ?? -1) ||
      right.baseTwmaPrice - left.baseTwmaPrice,
  )[0] ?? null

  if (modeledRows.length === 0) {
    return {
      row: fallbackRow,
      value: null,
      label: 'Needs exact lane',
      source: 'missing' as const,
      matchScore: fallbackRow ? rawListingRowMatchScore(fallbackRow, listing) : 0,
    }
  }

  const bestModeledRow = modeledRows.sort(
    (left, right) =>
      right.matchScore - left.matchScore ||
      (right.source === 'exact' ? 1 : 0) - (left.source === 'exact' ? 1 : 0) ||
      scoreDynastyValueOpportunity(right.row) - scoreDynastyValueOpportunity(left.row) ||
      (right.row.stsBinTargetScore ?? -1) - (left.row.stsBinTargetScore ?? -1) ||
      (right.value ?? 0) - (left.value ?? 0),
  )[0]
  return bestModeledRow ?? { row: fallbackRow, value: null, label: 'Needs exact lane', source: 'missing' as const, matchScore: 0 }
}

function rawListingHoursToClose(listing: MarketplaceListing) {
  const endTime = listing.end_time ? new Date(listing.end_time).getTime() : Number.NaN
  if (!Number.isFinite(endTime)) return null
  const hours = (endTime - Date.now()) / (1000 * 60 * 60)
  return Number.isFinite(hours) ? hours : null
}

function buildTeamSuperfractorEntries(
  binScan: EbayBinScanResult | null,
  auctionScan: EbayBinScanResult | null,
  rows: PricingRow[],
) {
  const rowsByPlayer = pricingRowsByPlayer(rows)
  const rawEntries = [
    ...(binScan?.listings ?? []).map((listing) => ({ listing, type: 'BIN' as const })),
    ...(auctionScan?.listings ?? []).map((listing) => ({ listing, type: 'Auction' as const })),
  ]

  return rawEntries
    .filter(({ listing }) => rawListingLooksLikeSuperfractor(listing))
    .map<TeamSuperfractorEntry>(({ listing, type }) => {
      const model = bestSuperfractorModelForListing(listing, rowsByPlayer)
      const allInPrice = rawListingAllInPrice(listing)
      const edgeDollars = model.value !== null ? model.value - allInPrice : null
      const roiPct = edgeDollars !== null && allInPrice > 0 ? edgeDollars / allInPrice : null
      const ranking = findStsRanking(rawListingPlayerName(listing))
      const rankLabel = model.row ? primaryRankLabel(model.row) : ranking ? primaryStsRankLabel(ranking) : null
      const primaryRank = model.row ? primaryStsRank({ rank: model.row.stsRank, prospectRank: model.row.stsProspectRank }) : ranking ? primaryStsRank(ranking) : null
      const edgeSignal = edgeDollars !== null ? clampNumber(edgeDollars / Math.max(80, (model.value ?? 0) * 0.4), -0.25, 1) * 42 : 0
      const roiSignal = roiPct !== null ? clampNumber((roiPct + 0.08) / 0.7, 0, 1) * 18 : 0
      const rankSignal = primaryRank ? clampNumber((700 - Math.min(primaryRank, 700)) / 700, 0, 1) * 18 : 0
      const dynastySignal = model.row ? clampNumber(scoreDynastyValueOpportunity(model.row) / 80, 0, 1) * 14 : 0
      const auctionHours = type === 'Auction' ? rawListingHoursToClose(listing) : null
      const auctionSignal = auctionHours !== null && auctionHours > 0 ? clampNumber((24 - Math.min(auctionHours, 24)) / 24, 0, 1) * 8 : 0
      const modelConfidenceSignal = model.source === 'exact' ? 8 : model.source === 'proxy' ? 3 : -12
      const releaseSignal = model.matchScore > 0 ? 4 : 0
      return {
        listing,
        type,
        modelRow: model.row,
        modelValue: model.value,
        modelLabel: model.label,
        modelSource: model.source,
        modelMatchScore: model.matchScore,
        allInPrice,
        edgeDollars,
        roiPct,
        score: Math.max(0, Math.round(edgeSignal + roiSignal + rankSignal + dynastySignal + auctionSignal + modelConfidenceSignal + releaseSignal)),
        rankLabel,
      }
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.edgeDollars ?? Number.NEGATIVE_INFINITY) - (left.edgeDollars ?? Number.NEGATIVE_INFINITY) ||
        left.allInPrice - right.allInPrice,
    )
}

function TeamSuperfractorWatch({
  rows,
  binScan,
  auctionScan,
  loading,
  error,
  canScan,
  checklistPlayerCount,
  onScan,
}: {
  rows: PricingRow[]
  binScan: EbayBinScanResult | null
  auctionScan: EbayBinScanResult | null
  loading: boolean
  error: string | null
  canScan: boolean
  checklistPlayerCount: number
  onScan: () => void
}) {
  const entries = useMemo(() => buildTeamSuperfractorEntries(binScan, auctionScan, rows), [auctionScan, binScan, rows])
  const hasScan = Boolean(binScan || auctionScan)
  const queryCount = (binScan?.stats.queriesRun ?? 0) + (auctionScan?.stats.queriesRun ?? 0)
  const rawListingCount = (binScan?.listings.length ?? 0) + (auctionScan?.listings.length ?? 0)
  const latestScanTime = [binScan?.fetchedAt, auctionScan?.fetchedAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0]
  const latestLabel = latestScanTime ? new Date(latestScanTime).toLocaleTimeString() : 'Not scanned'

  return (
    <section className="team-superfractor-watch" aria-label="Marlins Superfractor watch">
      <div className="team-section-head">
        <div>
          <span>Superfractor Watch</span>
          <strong>All Marlins Bowman /1s we can see</strong>
          <small>Player-wide search across Superfractor, Super Fractor, and Bowman /1 language. Release/year text is allowed to float.</small>
        </div>
        <div className="team-section-pills">
          <span>{entries.length.toLocaleString()} /1 hits</span>
          <span>{rawListingCount.toLocaleString()} raw listings</span>
          <span>{queryCount.toLocaleString()} queries</span>
          <span>{checklistPlayerCount.toLocaleString()} players</span>
          <span>{latestLabel}</span>
        </div>
      </div>

      <div className="team-superfractor-actions">
        <button className="primary-button" type="button" onClick={onScan} disabled={!canScan}>
          <Gem size={15} />
          {loading ? 'Scanning /1s' : 'Scan Marlins Superfractors'}
        </button>
        <small>Broad /1 sweep, separate from the normal buy-grade board.</small>
      </div>

      {error ? (
        <div className="bin-radar-alert superfractor-alert">
          <ShieldCheck size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && entries.length === 0 ? (
        <div className="bin-empty-state ready compact-empty">
          <RefreshCw size={24} className="spin" />
          <div>
            <strong>Sweeping the Marlins /1 market.</strong>
            <span>Checking every loaded Miami checklist player against active Superfractor and Bowman /1 language.</span>
          </div>
        </div>
      ) : !hasScan ? (
        <div className="bin-empty-state ready compact-empty">
          <Gem size={24} />
          <div>
            <strong>Run the Marlins Superfractor sweep.</strong>
            <span>This is intentionally broader than the normal auto model so odd release text does not hide a /1.</span>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="bin-empty-state muted compact-empty">
          <Activity size={24} />
          <div>
            <strong>No active Marlins Superfractors surfaced.</strong>
            <span>The latest sweep returned raw listings, but none cleared the /1 title guard.</span>
          </div>
        </div>
      ) : (
        <div className="team-superfractor-list">
          <div className="team-superfractor-head">
            <span>Rank</span>
            <span>Listing</span>
            <span>All In</span>
            <span>Model</span>
            <span>Action</span>
          </div>
          {entries.slice(0, 18).map((entry, index) => {
            const url = rawListingUrl(entry.listing)
            const signal =
              entry.edgeDollars !== null
                ? entry.edgeDollars >= 0
                  ? `${money(entry.edgeDollars)} under`
                  : `${money(Math.abs(entry.edgeDollars))} over`
                : 'Needs lane'
            return (
              <article className="team-superfractor-row" key={`superfractor:${entry.type}:${entry.listing.item_id ?? entry.listing.listing_url ?? index}`}>
                <div className="team-superfractor-rank">
                  <strong>#{index + 1}</strong>
                  <span>{entry.score}</span>
                </div>
                <div className="team-superfractor-main">
                  <strong>{rawListingPlayerName(entry.listing) || 'Marlins player'}</strong>
                  <span>{rawListingTitle(entry.listing)}</span>
                  <div className="bin-evidence-strip">
                    <small>{entry.type}</small>
                    <small className="deal-score-chip">/1 Watch</small>
                    {entry.modelSource === 'exact' ? (
                      <small className="sold-lane-chip good">Exact /1 lane</small>
                    ) : entry.modelSource === 'proxy' ? (
                      <small className="auto-lens-chip fair">Auto proxy</small>
                    ) : (
                      <small className="warning">Exact lane needed</small>
                    )}
                    {entry.modelMatchScore > 0 ? <small>Release matched</small> : null}
                    {entry.rankLabel ? <small className="sts-chip">{entry.rankLabel}</small> : null}
                    <small>{rawListingMarketplaceLabel(entry.listing)}</small>
                    {entry.roiPct !== null ? <small className={entry.roiPct >= 0 ? 'sold-lane-chip good' : 'warning'}>{percent(entry.roiPct)} edge</small> : null}
                  </div>
                </div>
                <div className="team-superfractor-money">
                  <strong>{money(entry.allInPrice)}</strong>
                  <span>{entry.type === 'Auction' ? 'current bid + ship' : 'ask + ship'}</span>
                </div>
                <div className="team-superfractor-money">
                  <strong>{entry.modelValue !== null ? money(entry.modelValue) : '--'}</strong>
                  <span>{entry.modelLabel}</span>
                </div>
                <div className="team-superfractor-action">
                  <strong>{signal}</strong>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} />
                      Open
                    </a>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function TeamDealCommandCenter({
  checklistOpportunities,
  dealEntries,
  canScan,
  busy,
  onScanTeam,
  onScanPlayer,
}: {
  checklistOpportunities: TeamChecklistOpportunity[]
  dealEntries: TeamDealEntry[]
  canScan: boolean
  busy: boolean
  onScanTeam: () => void
  onScanPlayer: (playerName: string) => void
}) {
  const buyGradeEntries = dealEntries.filter(
    (entry) => entry.opportunity.edgeDollars > 0 && entry.opportunity.expectedRoiPct > 0 && entry.opportunity.lane !== 'risk',
  )
  const topBuy = buyGradeEntries[0] ?? null
  const topTarget = checklistOpportunities[0] ?? null
  const topProspect =
    checklistOpportunities.find((opportunity) => {
      const prospectRank = teamOpportunityProspectRank(opportunity)
      return prospectRank != null && prospectRank <= 100
    }) ?? null
  const topValue =
    checklistOpportunities.find((opportunity) => opportunity.bestRow && scoreDynastyValueOpportunity(opportunity.bestRow) > 0) ?? null
  const coverageGap =
    checklistOpportunities.find((opportunity) => !opportunity.bestRow && (teamOpportunityPrimaryRank(opportunity) ?? Number.POSITIVE_INFINITY) <= 400) ??
    checklistOpportunities.find((opportunity) => !opportunity.bestRow) ??
    null
  const huntQueue = checklistOpportunities
    .filter((opportunity) => scanNameKey(opportunity.playerName) !== scanNameKey(topBuy?.opportunity.listing.playerName ?? ''))
    .slice(0, 8)

  const primaryTitle = topBuy?.opportunity.listing.playerName ?? topTarget?.playerName ?? 'Marlins checklist loading'
  const primarySubtitle = topBuy
    ? `${money(topBuy.opportunity.edgeDollars)} modeled edge / ${percent(topBuy.opportunity.expectedRoiPct)} below model / ${listingMarketplaceLabel(topBuy.opportunity.listing)}`
    : topTarget
      ? `${topTarget.rankLabel ?? 'Rank pending'} / opportunity ${topTarget.score} / ${topTarget.checklistCount.toLocaleString()} checklist${topTarget.checklistCount === 1 ? '' : 's'}`
      : 'Waiting on Miami targets'
  const primaryChips = topBuy
    ? [
        `Deal Score ${topBuy.dealScore}`,
        `Ask ${money(topBuy.opportunity.listing.allInPrice)}`,
        `Model ${money(topBuy.opportunity.fairValue)}`,
        topBuy.rankLabel,
        topBuy.dynastyValueScore > 0 ? `Dynasty ${topBuy.dynastyValueScore.toFixed(0)}` : null,
      ].filter(Boolean)
    : topTarget?.reasons ?? []

  return (
    <section className="team-command-center" aria-label="Marlins deal command center">
      <div className="team-command-primary">
        <div className="team-command-copy">
          <span>{topBuy ? 'Best Live Buy' : 'Best Marlins Play'}</span>
          <strong>{primaryTitle}</strong>
          <small>{primarySubtitle}</small>
        </div>
        <div className="team-command-chip-row">
          {primaryChips.slice(0, 6).map((chip) => (
            <span key={`primary-chip:${chip}`}>{chip}</span>
          ))}
        </div>
        <div className="team-command-actions">
          {topBuy?.opportunity.listing.listingUrl ? (
            <a className="primary-button" href={topBuy.opportunity.listing.listingUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              Open Best Listing
            </a>
          ) : topTarget ? (
            <button className="primary-button" type="button" onClick={() => onScanPlayer(topTarget.playerName)}>
              <Radio size={15} />
              Scan {topTarget.playerName}
            </button>
          ) : null}
          <button className="ghost-button" type="button" onClick={onScanTeam} disabled={!canScan}>
            <RefreshCw size={15} className={busy ? 'spin' : undefined} />
            Full Sweep
          </button>
        </div>
      </div>

      <div className="team-command-lanes">
        <div className="team-command-lane buy">
          <span>Buy-Grade Live</span>
          <strong>{buyGradeEntries.length.toLocaleString()}</strong>
          <small>{topBuy ? `${topBuy.opportunity.listing.playerName} leads` : 'No live buy clears the edge bar'}</small>
        </div>
        <div className="team-command-lane target">
          <span>Best Target</span>
          <strong>{topTarget?.playerName ?? '--'}</strong>
          <small>{topTarget ? `Opportunity ${topTarget.score}` : 'Checklist loading'}</small>
        </div>
        <div className="team-command-lane prospect">
          <span>Prospect Bet</span>
          <strong>{topProspect?.playerName ?? '--'}</strong>
          <small>{topProspect ? topProspect.rankLabel ?? `Prospect #${teamOpportunityProspectRank(topProspect)}` : 'No ranked prospect yet'}</small>
        </div>
        <div className="team-command-lane gap">
          <span>Price Gap</span>
          <strong>{coverageGap?.playerName ?? topValue?.playerName ?? '--'}</strong>
          <small>{coverageGap ? 'Needs priced lane' : topValue?.bestRow ? `Dynasty value ${scoreDynastyValueOpportunity(topValue.bestRow).toFixed(0)}` : 'Coverage clean'}</small>
        </div>
      </div>

      {huntQueue.length > 0 ? (
        <div className="team-hunt-strip" aria-label="Marlins hunt queue">
          <span>Hunt Queue</span>
          <div>
            {huntQueue.map((opportunity) => (
              <button type="button" onClick={() => onScanPlayer(opportunity.playerName)} key={`hunt:${scanNameKey(opportunity.playerName)}`}>
                <strong>{opportunity.playerName}</strong>
                <small>{opportunity.rankLabel ?? `Opportunity ${opportunity.score}`}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function MarlinsTeamPage({
  rows,
  selectedId,
  rankById,
  binOpportunities,
  auctionOpportunities,
  binScan,
  auctionScan,
  superfractorBinScan,
  superfractorAuctionScan,
  cachedObservedAt,
  checklistLoading,
  binLoading,
  auctionLoading,
  superfractorLoading,
  binError,
  auctionError,
  superfractorError,
  ebayStatus,
  modelCount,
  checklistPlayerCount,
  checklistPlayers,
  checklistModelSummaries,
  checklistOpportunities,
  coverageEngine,
  coverageLoading,
  coverageError,
  scanLedger,
  scanLedgerLoading,
  scanLedgerError,
  scanQueue,
  scanQueueLoading,
  scanQueueError,
  lastRejectedListing,
  resultsRef,
  onScanTeam,
  onScanSuperfractors,
  onRefreshCoverage,
  onRefreshScanLedger,
  onRefreshScanQueue,
  onOpenDesk,
  onSelectRow,
  onScanPlayer,
  onScanChecklistPlayer,
  onRejectListing,
  onUndoRejectListing,
}: {
  rows: PricingRow[]
  selectedId?: string
  rankById: Map<string, number>
  binOpportunities: Opportunity[]
  auctionOpportunities: Opportunity[]
  binScan: EbayBinScanResult | null
  auctionScan: EbayBinScanResult | null
  superfractorBinScan: EbayBinScanResult | null
  superfractorAuctionScan: EbayBinScanResult | null
  cachedObservedAt?: string | null
  checklistLoading: boolean
  binLoading: boolean
  auctionLoading: boolean
  superfractorLoading: boolean
  binError: string | null
  auctionError: string | null
  superfractorError: string | null
  ebayStatus: EbayStatus | null
  modelCount: number
  checklistPlayerCount: number
  checklistPlayers: string[]
  checklistModelSummaries: TeamChecklistModelSummary[]
  checklistOpportunities: TeamChecklistOpportunity[]
  coverageEngine: ChecklistCoveragePayload | null
  coverageLoading: boolean
  coverageError: string | null
  scanLedger: ScanCoverageStatus | null
  scanLedgerLoading: boolean
  scanLedgerError: string | null
  scanQueue: ScanQueueStatus | null
  scanQueueLoading: boolean
  scanQueueError: string | null
  lastRejectedListing: ListingRejection | null
  resultsRef: RefObject<HTMLDivElement | null>
  onScanTeam: () => void
  onScanSuperfractors: () => void
  onRefreshCoverage: () => void
  onRefreshScanLedger: () => void
  onRefreshScanQueue: () => void
  onOpenDesk: () => void
  onSelectRow: (rowId: string) => void
  onScanPlayer: (row: PricingRow) => void
  onScanChecklistPlayer: (playerName: string) => void
  onRejectListing: (opportunity: Opportunity) => void
  onUndoRejectListing: () => void
}) {
  const pricedPlayerCount = new Set(rows.map((row) => scanNameKey(row.playerName))).size
  const rankedCount = rows.filter((row) => row.stsRank !== null || row.stsProspectRank !== null).length
  const checklistRankedCount = checklistPlayers.filter((playerName) => findStsRanking(playerName)).length
  const sortedChecklistPlayers = useMemo(() => [...checklistPlayers].sort((left, right) => left.localeCompare(right)), [checklistPlayers])
  const baseSales30 = rows.reduce((total, row) => total + row.baseSales30, 0)
  const rawCompCount = rows.reduce((total, row) => total + row.rawBaseSales, 0)
  const bestTarget = rows[0] ?? null
  const liveEntries = [...binOpportunities, ...auctionOpportunities]
  const dealEntries = useMemo(() => buildTeamDealEntries(binOpportunities, auctionOpportunities, rows), [auctionOpportunities, binOpportunities, rows])
  const scanCoverage = useMemo(
    () => buildTeamPlayerScanCoverage(checklistOpportunities, dealEntries, binScan, auctionScan),
    [auctionScan, binScan, checklistOpportunities, dealEntries],
  )
  const topDeal = dealEntries[0] ?? null
  const topLive = topDeal?.opportunity
  const latestScanTime = [binScan?.fetchedAt, auctionScan?.fetchedAt, cachedObservedAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0]
  const latestLabel = latestScanTime ? new Date(latestScanTime).toLocaleTimeString() : 'No live scan'
  const marketplaceCounts = marketplaceCountsFromOpportunities(liveEntries)
  const configured = Boolean(ebayStatus?.configured)
  const busy = binLoading || auctionLoading
  const superfractorBusy = superfractorLoading
  const canScan = configured && checklistPlayerCount > 0 && !busy && !checklistLoading
  const canScanSuperfractors = configured && checklistPlayerCount > 0 && !superfractorBusy && !checklistLoading
  const scanButtonLabel = busy
    ? 'Scanning Full Miami Checklist'
    : checklistLoading
      ? 'Checklist loading'
      : configured
        ? 'Scan All Marlins Checklists'
        : 'eBay offline'
  const hasLiveSource = Boolean(binScan || auctionScan || cachedObservedAt)
  const liveListingCount = binOpportunities.length + auctionOpportunities.length
  const scanQueryCount = (binScan?.stats.queriesRun ?? 0) + (auctionScan?.stats.queriesRun ?? 0)
  const ledgerSummary = scanLedger?.summary ?? null
  const ledgerLatestLabel = ledgerSummary?.latestObservedAt
    ? ageLabel(ledgerSummary.latestObservedAt)
    : scanLedgerLoading
      ? 'loading'
      : 'not recorded'
  const ledgerHitLabel = ledgerSummary
    ? `${ledgerSummary.liveHitTargets.toLocaleString()} with hits / ${ledgerSummary.noHitTargets.toLocaleString()} no-hit`
    : scanLedgerError
      ? 'ledger unavailable'
      : 'ledger ready'
  const queueSummary = scanQueue?.summary ?? null
  const queueNextLabel = queueSummary?.nextRunAfter
    ? `next ${new Date(queueSummary.nextRunAfter).toLocaleTimeString()}`
    : scanQueueLoading
      ? 'loading'
      : 'no queued scans'
  const queueHealthLabel = queueSummary
    ? `${queueSummary.dueJobs.toLocaleString()} due / ${queueSummary.queuedJobs.toLocaleString()} queued`
    : scanQueueError
      ? 'queue unavailable'
      : 'queue ready'

  return (
    <section className="team-page marlins-page" aria-label="Miami Marlins team deals">
      <div className="team-page-nav">
        <button className="ghost-button" type="button" onClick={onOpenDesk}>
          <Search size={15} />
          Daily Board
        </button>
      </div>

      <section className="team-hero" aria-label="Miami Marlins live deal desk">
        <div className="team-hero-copy">
          <span className="workflow-kicker">
            <Store size={14} />
            Team Deal Desk
          </span>
          <h2>Miami Marlins Deals</h2>
          <p>
            The best active Marlins buys we can model right now. The scan uses every loaded Miami checklist player across Bowman, Bowman Chrome,
            and Draft, then ranks live BINs and auctions with dynasty value, prospect rank, sold comp lanes, and modeled edge.
          </p>
          <div className="team-hero-actions">
            <button className="primary-button" type="button" onClick={onScanTeam} disabled={!canScan}>
              <RefreshCw size={16} className={busy ? 'spin' : undefined} />
              {scanButtonLabel}
            </button>
            <button className="ghost-button" type="button" onClick={onScanSuperfractors} disabled={!canScanSuperfractors}>
              <Gem size={15} className={superfractorBusy ? 'spin' : undefined} />
              {superfractorBusy ? 'Scanning /1s' : 'Superfractor Sweep'}
            </button>
            {topLive?.listing.listingUrl ? (
              <a className="ghost-button" href={topLive.listing.listingUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} />
                Top Listing
              </a>
            ) : null}
          </div>
        </div>

        <div className="team-hero-scoreboard" aria-label="Marlins model coverage">
          <div>
            <span>Checklist Players</span>
            <strong>{checklistPlayerCount.toLocaleString()}</strong>
            <small>{rows.length.toLocaleString()} priced rows</small>
          </div>
          <div>
            <span>Ranked Signals</span>
            <strong>{checklistRankedCount.toLocaleString()}</strong>
            <small>{rankedCount.toLocaleString()} priced rows with rank</small>
          </div>
          <div>
            <span>Ranked Deals</span>
            <strong>{dealEntries.length.toLocaleString()}</strong>
            <small>{topDeal ? `Top deal score ${topDeal.dealScore}` : latestLabel}</small>
          </div>
          <div>
            <span>Comp Depth</span>
            <strong>{rawCompCount.toLocaleString()}</strong>
            <small>{baseSales30.toLocaleString()} base comps in 30D lanes</small>
          </div>
        </div>
      </section>

      <div className="team-signal-grid" aria-label="Miami deal signals">
        <div>
          <span>Best Modeled Deal</span>
          <strong>{topLive?.listing.playerName ?? 'Model loading'}</strong>
          <small>
            {topDeal
              ? `Score ${topDeal.dealScore} / ${money(topDeal.opportunity.edgeDollars)} edge / ${money(topDeal.opportunity.listing.allInPrice)} ask`
              : 'Waiting on active Miami listings'}
          </small>
        </div>
        <div>
          <span>Best Priced Target</span>
          <strong>{bestTarget?.playerName ?? 'Target loading'}</strong>
          <small>{bestTarget ? `${formatBasePrice(bestTarget)} base auto / ${formatStsLine(bestTarget) || 'rank pending'}` : 'Waiting on checklist rows'}</small>
        </div>
        <div>
          <span>Marketplaces</span>
          <strong>{marketplaceCounts.length ? marketplaceCounts.map((marketplace) => marketplace.label).join(' / ') : 'Ready to scan'}</strong>
          <small>{marketplaceCounts.length ? marketplaceCounts.map((marketplace) => `${marketplace.count} ${marketplace.label}`).join(' / ') : 'eBay, Fanatics Collect, and auctions when available'}</small>
        </div>
        <div>
          <span>Loaded Checklists</span>
          <strong>{modelCount.toLocaleString()}</strong>
          <small>{configured ? 'Live marketplace access configured' : ebayStatus?.message ?? 'Live marketplace access pending'}</small>
        </div>
        <div>
          <span>Coverage Ledger</span>
          <strong>{ledgerSummary ? `${ledgerSummary.scannedTargets.toLocaleString()} / ${ledgerSummary.totalTargets.toLocaleString()}` : 'Waiting'}</strong>
          <small>{ledgerHitLabel}</small>
        </div>
        <div>
          <span>Scan Queue</span>
          <strong>{queueSummary ? queueSummary.totalJobs.toLocaleString() : 'Waiting'}</strong>
          <small>{queueHealthLabel}</small>
        </div>
      </div>

      <section className="team-scan-console" aria-label="Marlins full checklist scan">
        <div className="team-scan-copy">
          <span>Full Checklist Sweep</span>
          <strong>{checklistPlayerCount.toLocaleString()} Marlins players in sweep universe</strong>
          <small>
            This button scans every loaded Miami checklist player we know about, not just the {pricedPlayerCount.toLocaleString()} priced
            player{pricedPlayerCount === 1 ? '' : 's'} on the target board.
          </small>
        </div>
        <div className="team-scan-actions">
          <button className="primary-button" type="button" onClick={onScanTeam} disabled={!canScan}>
            <RefreshCw size={16} className={busy ? 'spin' : undefined} />
            {scanButtonLabel}
          </button>
          <button className="ghost-button" type="button" onClick={onScanSuperfractors} disabled={!canScanSuperfractors}>
            <Gem size={15} className={superfractorBusy ? 'spin' : undefined} />
            {superfractorBusy ? 'Scanning /1s' : 'Scan /1 Watch'}
          </button>
          <button className="ghost-button" type="button" onClick={onRefreshScanLedger} disabled={scanLedgerLoading}>
            <Database size={15} className={scanLedgerLoading ? 'spin' : undefined} />
            Ledger
          </button>
          <button className="ghost-button" type="button" onClick={onRefreshScanQueue} disabled={scanQueueLoading}>
            <Radio size={15} className={scanQueueLoading ? 'spin' : undefined} />
            Queue
          </button>
          <small>
            {scanQueryCount > 0
              ? `${scanQueryCount.toLocaleString()} latest marketplace queries`
              : checklistModelSummaries.length
                ? `${checklistModelSummaries.length.toLocaleString()} loaded checklist lanes`
                : 'Waiting on checklist coverage'}
          </small>
        </div>
        <div className="team-scan-models" aria-label="Loaded Marlins checklist lanes">
          <span>
            Ledger {ledgerSummary ? `${ledgerSummary.scannedTargets.toLocaleString()} scanned` : 'not recorded'} / {ledgerLatestLabel}
          </span>
          {ledgerSummary ? (
            <span>
              {ledgerSummary.listingCount.toLocaleString()} raw hits / {ledgerSummary.opportunityCount.toLocaleString()} modeled windows
            </span>
          ) : null}
          <span>
            Queue {queueSummary ? `${queueSummary.totalJobs.toLocaleString()} jobs` : 'not scheduled'} / {queueNextLabel}
          </span>
          {queueSummary ? <span>{queueHealthLabel}</span> : null}
          {scanLedgerError ? <span>Ledger note: {scanLedgerError}</span> : null}
          {scanQueueError ? <span>Queue note: {scanQueueError}</span> : null}
          {checklistModelSummaries.map((summary) => (
            <span key={summary.key}>
              {summary.label} / {summary.playerCount.toLocaleString()}
            </span>
          ))}
        </div>
        <div className="team-checklist-chip-list" aria-label="Marlins checklist players">
          {sortedChecklistPlayers.map((playerName) => (
            <span key={`marlins-checklist:${scanNameKey(playerName)}`}>{playerName}</span>
          ))}
        </div>
      </section>

      <TeamCoverageEnginePanel
        coverage={coverageEngine}
        loading={coverageLoading}
        error={coverageError}
        checklistPlayerCount={checklistPlayerCount}
        onRefresh={onRefreshCoverage}
        onScanPlayer={onScanChecklistPlayer}
      />

      <TeamDealCommandCenter
        checklistOpportunities={checklistOpportunities}
        dealEntries={dealEntries}
        canScan={canScan}
        busy={busy}
        onScanTeam={onScanTeam}
        onScanPlayer={onScanChecklistPlayer}
      />

      <TeamSuperfractorWatch
        rows={rows}
        binScan={superfractorBinScan}
        auctionScan={superfractorAuctionScan}
        loading={superfractorLoading}
        error={superfractorError}
        canScan={canScanSuperfractors}
        checklistPlayerCount={checklistPlayerCount}
        onScan={onScanSuperfractors}
      />

      <TeamChecklistOpportunityBoard
        opportunities={checklistOpportunities}
        liveDealEntries={dealEntries}
        onScanPlayer={onScanChecklistPlayer}
      />

      <TeamScanCoveragePanel
        coverage={scanCoverage}
        busy={busy}
        hasLiveSource={hasLiveSource}
        onScanPlayer={onScanChecklistPlayer}
      />

      <div ref={resultsRef} className="bin-results-anchor team-results-anchor" tabIndex={-1} aria-label="Miami live deal results" />

      <div className="team-live-layout">
        <TeamOpportunityQueue
          entries={dealEntries}
          binCount={binOpportunities.length}
          auctionCount={auctionOpportunities.length}
          loading={binLoading}
          auctionLoading={auctionLoading}
          error={binError}
          auctionError={auctionError}
          hasLiveSource={hasLiveSource}
          liveListingCount={liveListingCount}
          modelCount={modelCount}
          checklistPlayerCount={checklistPlayerCount}
          lastRejectedListing={lastRejectedListing}
          onRejectListing={onRejectListing}
          onUndoRejectListing={onUndoRejectListing}
        />
        <LiveMarketMap
          binOpportunities={binOpportunities}
          auctionOpportunities={auctionOpportunities}
          binScan={binScan}
          auctionScan={auctionScan}
          cachedObservedAt={cachedObservedAt}
          compact
        />
      </div>

      <section className="team-board-band" aria-label="Marlins target board">
        <div className="team-section-head">
          <div>
            <span>Miami Target Board</span>
            <strong>Priced Marlins card rows</strong>
            <small>These are the Marlins with full base-auto pricing. The scan universe above is larger.</small>
          </div>
          <div className="team-section-pills">
            <span>{rows.length.toLocaleString()} rows</span>
            <span>{pricedPlayerCount.toLocaleString()} priced players</span>
            <span>{checklistPlayerCount.toLocaleString()} checklist players</span>
            <span>{modelCount.toLocaleString()} sets</span>
          </div>
        </div>
        <Leaderboard
          rows={rows.slice(0, 36)}
          rankById={rankById}
          selectedId={selectedId}
          onSelect={onSelectRow}
          onScanPlayer={onScanPlayer}
          emptyTitle="No Marlins card rows are loaded yet."
          emptyText="Refresh the checklist universe to load Miami Bowman targets."
        />
      </section>
    </section>
  )
}

function RankingOnlyMatch({ ranking }: { ranking: NonNullable<ReturnType<typeof findStsRanking>> }) {
  return (
    <div className="ranking-only-card">
      <Brain size={18} />
      <div>
        <span>Ranking found, no priced card lane yet</span>
        <strong>{ranking.name}</strong>
        <small>
          {[ranking.team, ranking.pos, ranking.level, ranking.age ? `Age ${ranking.age}` : null].filter(Boolean).join(' / ')}
        </small>
        <small className="ranking-only-note">
          This player is in the rankings feed, but the current modeled-card board does not have a loaded Bowman lane for them.
        </small>
      </div>
      <div className="ranking-only-stats">
        <span>{primaryStsRankLabel(ranking) ?? 'Unranked'}</span>
        {ranking.prospectRank && ranking.rank ? <span>Overall #{ranking.rank.toLocaleString()}</span> : null}
        <span className={changeClassName(ranking.change30d)}>30D {formatSigned(ranking.change30d)}</span>
      </div>
    </div>
  )
}

function LadderDetail({ row }: { row?: PricingRow }) {
  if (!row) {
    return (
      <section className="detail-card">
        <div className="empty-state compact">
          <TableProperties size={24} />
          <strong>No player selected.</strong>
        </div>
      </section>
    )
  }

  const hasModel = rowHasModel(row)
  const fallbackQuote: VariationQuote = {
    key: 'base',
    label: 'Base Auto',
    multiplier: 1,
    price: row.baseTwmaPrice,
    sortOrder: null,
    synthesizedBase: true,
  }
  const topQuote = row.ladder.reduce((best, quote) => (quote.price > best.price ? quote : best), row.ladder[0] ?? fallbackQuote)
  const stsChangeItems: Array<[string, number | null]> = [
    ['3D', row.stsChange3d],
    ['7D', row.stsChange7d],
    ['14D', row.stsChange14d],
    ['30D', row.stsChange30d],
  ]
  const stsSummary = compactSummary(row.stsSummary)

  return (
    <section className="detail-card ladder-detail">
      <div className="detail-title">
        <TableProperties size={18} />
        <div>
          <span>Selected Player</span>
          <h2>{row.playerName}</h2>
          <small>{row.release}</small>
        </div>
      </div>

      <div className="formula-strip">
        <div>
          <span>Base Auto Model</span>
          <strong>{formatBasePrice(row)}</strong>
        </div>
        <div>
          <span>Method</span>
          <strong>{formatBaseMethod(row.baseMethod)}</strong>
        </div>
        <div>
          <span>Ladder</span>
          <strong>{row.variationCount.toLocaleString()}</strong>
        </div>
        <div>
          <span>30D / 90D</span>
          <strong>{row.baseSales30} / {row.baseSales90}</strong>
        </div>
        {row.stsName ? (
          <div>
            <span>Expected Base</span>
            <strong>{money(impliedDynastyBasePrice(row))}</strong>
          </div>
        ) : null}
      </div>

      {row.stsName ? (
        <div className="sts-context-panel">
          <div className="sts-context-head">
            <div>
              <span>Rank vs Price</span>
              <strong>{formatStsLine(row)}</strong>
              <small>
                {[row.stsTeam, row.stsPosition, row.stsLevel, row.stsAge ? `Age ${row.stsAge}` : null].filter(Boolean).join(' / ')}
              </small>
            </div>
            <div className="sts-score-stack">
              <span>BIN Target</span>
              <strong>{row.stsBinTargetScore?.toFixed(1) ?? '--'}</strong>
              <small>
                {row.stsMomentumScore?.toFixed(1) ?? '--'} momentum / {row.stsRiserValueScore?.toFixed(1) ?? '--'} riser
              </small>
            </div>
          </div>
          {stsChangeItems.some(([, value]) => value !== null) ? (
            <div className="sts-change-grid" aria-label="Rank changes">
              {stsChangeItems.map(([label, value]) => (
                <span className={`change-pill ${changeClassName(value)}`} key={label}>
                  {label} {formatSigned(value)}
                </span>
              ))}
            </div>
          ) : null}
          {stsSummary ? <p>{stsSummary}</p> : null}
        </div>
      ) : (
        <div className="sts-context-panel muted">
          <span>Rank vs Price</span>
          <strong>No ranking match for this checklist name.</strong>
        </div>
      )}

      <div className="base-source-note">
        {row.pulseBasePrice > 0 ? <span>Checklist baseline {money(row.pulseBasePrice)}</span> : <span>No base comp baseline yet</span>}
        <span>{formatBaseMethod(row.baseMethod)}</span>
        {row.baseAuctionSales + row.baseBinSales > 0 ? (
          <span>
            Auction/BIN {row.baseAuctionSales}/{row.baseBinSales}
          </span>
        ) : null}
        {row.baseEffectiveSales > 0 ? <span>{row.baseEffectiveSales.toFixed(1)} effective sales</span> : null}
      </div>

      {hasModel ? (
        <div className="variation-grid">
          {row.ladder.map((quote) => (
            <div className={`variation-card ${quote.key === topQuote.key ? 'top' : ''}`} key={`${row.id}:detail:${quote.key}`}>
              <span>{compactVariation(quote.label)}</span>
              <strong>{money(quote.price)}</strong>
              <small>
                {formatBasePrice(row)} x {formatMultiplier(quote.multiplier)}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">
          <Database size={22} />
          <strong>Sold comps needed before price lanes unlock.</strong>
          <span>This checklist player is visible for coverage, but we do not have a trusted raw base-auto anchor yet.</span>
        </div>
      )}
    </section>
  )
}

function QuickPriceModule({
  row,
  onScanPlayer,
  pickerRows,
  onPickRow,
  onRefreshPlayer,
  refreshState,
  className,
}: {
  row?: PricingRow
  onScanPlayer: (row: PricingRow) => void
  pickerRows?: PricingRow[]
  onPickRow?: (rowId: string) => void
  onRefreshPlayer?: (row: PricingRow) => void
  refreshState?: { rowId: string; status: 'loading' | 'success' | 'missing' | 'error'; message: string } | null
  className?: string
}) {
  const [cardInput, setCardInput] = useState<{
    rowId: string
    variationKey: string
    gradeKey: QuickGradeKey
    askInput: string
  }>({
    rowId: '',
    variationKey: '',
    gradeKey: 'raw',
    askInput: '',
  })

  if (!row) {
    return (
      <section className={`detail-card quick-price-card ${className ?? ''}`.trim()}>
        <div className="empty-state compact">
          <Calculator size={24} />
          <strong>No player selected.</strong>
        </div>
      </section>
    )
  }

  const activeRow = row
  const calculatorPickerRows = pickerRows
    ? [activeRow, ...pickerRows.filter((candidate) => candidate.id !== activeRow.id && rowHasModel(candidate))]
    : [activeRow]
  const canPickPlayer = Boolean(calculatorPickerRows.length > 1 && onPickRow)

  if (!rowHasModel(activeRow)) {
    const activeRefreshState = refreshState?.rowId === activeRow.id ? refreshState : null
    const refreshing = activeRefreshState?.status === 'loading'
    return (
      <section className={`detail-card quick-price-card quick-price-card--missing-model ${className ?? ''}`.trim()}>
        <div className="detail-title quick-price-title">
          <Calculator size={18} />
          <div>
            <span>Card Price Calculator</span>
            <h2 className="quick-price-missing">Pricing pending</h2>
            <small>{activeRow.playerName}</small>
          </div>
          <span className="quick-verdict neutral">No model</span>
        </div>

        {canPickPlayer ? (
          <label className="quick-player-picker">
            <span>Player</span>
            <select value={activeRow.id} onChange={(event) => onPickRow?.(event.target.value)} aria-label="Calculator player">
              {calculatorPickerRows.map((candidate) => (
                <option value={candidate.id} key={`quick-picker:${candidate.id}`}>
                  {candidate.playerName} / {candidate.release}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="empty-state compact">
          <Database size={22} />
          <strong>No verified base-auto comps yet.</strong>
          <span>Build this player now from structured sold data, or choose a covered player above.</span>
          {onRefreshPlayer ? (
            <button className="primary-button" type="button" disabled={refreshing} onClick={() => onRefreshPlayer(activeRow)}>
              <RefreshCw size={16} className={refreshing ? 'spin' : undefined} />
              {refreshing ? 'Finding sold comps...' : 'Build comp model'}
            </button>
          ) : null}
          {activeRefreshState && activeRefreshState.status !== 'loading' ? (
            <small className={`comp-refresh-feedback ${activeRefreshState.status}`} role={activeRefreshState.status === 'error' ? 'alert' : 'status'}>
              {activeRefreshState.message}
            </small>
          ) : null}
        </div>
      </section>
    )
  }

  const hasCurrentInput = cardInput.rowId === activeRow.id
  const defaultVariationKey = activeRow.ladder[0]?.key ?? ''
  const activeVariationKey =
    hasCurrentInput && activeRow.ladder.some((candidate) => candidate.key === cardInput.variationKey)
      ? cardInput.variationKey
      : defaultVariationKey
  const gradeKey = hasCurrentInput ? cardInput.gradeKey : 'raw'
  const askInput = hasCurrentInput ? cardInput.askInput : ''

  function updateCardInput(next: Partial<typeof cardInput>) {
    setCardInput({
      rowId: activeRow.id,
      variationKey: activeVariationKey,
      gradeKey,
      askInput,
      ...next,
    })
  }

  const quote = activeRow.ladder.find((candidate) => candidate.key === activeVariationKey) ?? activeRow.ladder[0]
  const rawValue = quote?.price ?? activeRow.baseTwmaPrice
  const gradeOption = QUICK_GRADE_OPTIONS.find((grade) => grade.key === gradeKey) ?? QUICK_GRADE_OPTIONS[0]
  const serialDenominator = serialDenominatorFromLabel(quote?.label ?? 'Base')
  const gradeModel = {
    ...estimateGradedPremium({
      rawPrice: rawValue,
      serialDenominator,
      gradingCompany: gradeOption.company ?? null,
      gradeNumber: gradeOption.grade ?? null,
    }),
    option: gradeOption,
    serialDenominator,
  }
  const modelValue = rawValue * gradeModel.multiplier
  const askPrice = parseMoneyInput(askInput)
  const spread = askPrice ? modelValue - askPrice : null
  const rawFloorSpread = askPrice ? rawValue - askPrice : null
  const roi = askPrice && spread !== null ? spread / askPrice : null
  const buyZone = modelValue * (1 - DEFAULT_SETTINGS.targetMarginPct / 100)
  const watchCeiling = modelValue * (1 + LIVE_MODEL_WINDOW_PCT)
  const verdict = pricingVerdict(spread, modelValue, askPrice)
  const gradeLabel = gradeModel.option.label

  return (
    <section className={`detail-card quick-price-card ${className ?? ''}`.trim()}>
      <div className="detail-title quick-price-title">
        <Calculator size={18} />
        <div>
          <span>Card Price Calculator</span>
          <h2>{money(modelValue)}</h2>
          <small>{activeRow.playerName}</small>
        </div>
        <span className={`quick-verdict ${verdict.tone}`}>{verdict.label}</span>
      </div>

      {canPickPlayer ? (
        <label className="quick-player-picker">
          <span>Player</span>
          <select value={activeRow.id} onChange={(event) => onPickRow?.(event.target.value)} aria-label="Calculator player">
            {pickerRows?.map((candidate) => (
              <option value={candidate.id} key={`quick-picker:${candidate.id}`}>
                {candidate.playerName} / {candidate.release}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="quick-price-controls">
        <label>
          <span>Variation</span>
          <select value={quote?.key ?? ''} onChange={(event) => updateCardInput({ variationKey: event.target.value })}>
            {activeRow.ladder.map((candidate) => (
              <option value={candidate.key} key={`${activeRow.id}:quick:${candidate.key}`}>
                {compactVariation(candidate.label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Grade</span>
          <select value={gradeKey} onChange={(event) => updateCardInput({ gradeKey: event.target.value as QuickGradeKey })}>
            {QUICK_GRADE_OPTIONS.map((option) => (
              <option value={option.key} key={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>All In</span>
          <input
            inputMode="decimal"
            placeholder="$0"
            value={askInput}
            onChange={(event) => updateCardInput({ askInput: event.target.value })}
            aria-label="All-in price"
          />
        </label>
      </div>

      <div className="quick-price-grid">
        <div>
          <span>Raw Model</span>
          <strong>{money(rawValue)}</strong>
          <small>{formatMultiplier(quote?.multiplier ?? 1)} multiple</small>
        </div>
        <div>
          <span>{gradeLabel}</span>
          <strong>{formatMultiplier(gradeModel.multiplier)}</strong>
          <small>{gradeModel.note}</small>
        </div>
        <div>
          <span>Target Price</span>
          <strong>{money(buyZone)}</strong>
          <small>{DEFAULT_SETTINGS.targetMarginPct}% margin</small>
        </div>
        <div>
          <span>Review Up To</span>
          <strong>{money(watchCeiling)}</strong>
          <small>{LIVE_MODEL_WINDOW_LABEL} window</small>
        </div>
      </div>

      {askPrice ? (
        <div className="quick-edge-strip">
          <span className={spread !== null && spread >= 0 ? 'good' : 'risk'}>
            Model {spread !== null ? money(spread) : '--'}
          </span>
          <span className={rawFloorSpread !== null && rawFloorSpread >= 0 ? 'good' : 'neutral'}>
            Raw floor {rawFloorSpread !== null ? money(rawFloorSpread) : '--'}
          </span>
          <span className={roi !== null && roi >= 0 ? 'good' : 'risk'}>{roi !== null ? percent(roi) : '--'} edge</span>
        </div>
      ) : null}

      <div className="quick-source-strip">
        <span>{formatBaseMethod(activeRow.baseMethod)}</span>
        {primaryRankLabel(activeRow) ? <span>{primaryRankLabel(activeRow)}</span> : null}
        {gradeModel.serialDenominator ? <span>/{gradeModel.serialDenominator}</span> : null}
      </div>

      <button className="ghost-button quick-scan-button" type="button" onClick={() => onScanPlayer(activeRow)}>
        <Radio size={15} />
        Scan now
      </button>
    </section>
  )
}

function salesCacheBucketName(bucket: SalesCacheBucket) {
  return [bucket.releaseYear, bucket.productFamily, bucket.variationLabel, bucket.gradeBucket]
    .filter(Boolean)
    .join(' / ')
}

function SalesCacheBucketList({ title, buckets }: { title: string; buckets: SalesCacheBucket[] }) {
  if (buckets.length === 0) return null
  return (
    <div className="sales-cache-bucket-group">
      <span>{title}</span>
      {buckets.map((bucket) => (
        <div className="sales-cache-bucket" key={bucket.bucketKey}>
          <div>
            <strong>{salesCacheBucketName(bucket)}</strong>
            <small>
              {bucket.saleCount.toLocaleString()} sales / {bucket.auctionCount.toLocaleString()} auction /{' '}
              {bucket.binCount.toLocaleString()} BIN
            </small>
          </div>
          <div>
            <strong>{money(bucket.modelPrice)}</strong>
            <small>
              {bucket.baseAutoMultiple ? `${formatMultiplier(bucket.baseAutoMultiple)} base` : `Latest ${compactDate(bucket.latestSoldAt)}`}
            </small>
          </div>
        </div>
      ))}
    </div>
  )
}

function LocalSoldModelPanel({
  playerName,
  row,
  model,
  loading,
  error,
}: {
  playerName?: string
  row?: PricingRow
  model: SalesCachePlayerModel | null
  loading: boolean
  error: string | null
}) {
  const buckets = model?.buckets ?? []
  const sales = model?.sales ?? []
  const releaseBuckets = row ? buckets.filter((bucket) => salesBucketMatchesRowRelease(bucket, row)) : buckets
  const releaseSales = row ? sales.filter((sale) => sale.releaseYear === row.releaseYear) : sales
  const releaseModeledSales = releaseSales.filter((sale) => sale.modelEligible && !sale.erroneous).length
  const panelModeledSales = row ? releaseModeledSales : (model?.modelEligibleRows ?? model?.modeledSales ?? 0)
  const panelBucketCount = row ? releaseBuckets.length : (model?.bucketCount ?? buckets.length)
  const panelUpdatedAt = latestIso(releaseBuckets.map((bucket) => bucket.generatedAt)) || model?.generatedAt
  const baseAutoBucket = soldBaseBucketForRow(row, model) ?? (!row ? (model?.baseAutoBucket ?? null) : null)
  const baseAutoPrice = baseAutoBucket?.modelPrice ?? (!row ? model?.baseAutoPrice : null)
  const topRawAutos = releaseBuckets
    .filter((bucket) => bucket.cardClass === 'auto' && bucket.gradeBucket === 'Raw')
    .slice(0, 4)
  const topGraded = releaseBuckets.filter((bucket) => bucket.gradeBucket !== 'Raw').slice(0, 3)
  const topCaseHits = releaseBuckets.filter((bucket) => bucket.cardClass === 'case-hit').slice(0, 3)

  return (
    <section className="detail-card sales-cache-card">
      <div className="detail-title">
        <Database size={18} />
        <div>
          <span>Sold Comp Model</span>
          <h2>{model?.available && baseAutoPrice ? money(baseAutoPrice) : model?.available ? 'No release base' : 'No stored comps'}</h2>
          <small>{row ? `${playerName} / ${row.release}` : playerName || 'Select a player'}</small>
        </div>
      </div>

      {loading ? (
        <div className="empty-state compact">
          <RefreshCw size={20} className="spin" />
          <strong>Checking sold comps.</strong>
        </div>
      ) : error ? (
        <div className="sales-cache-note warning">
          <ShieldCheck size={16} />
          <span>{error}</span>
        </div>
      ) : !model?.available ? (
        <div className="sales-cache-note">
          <Database size={16} />
          <span>{model?.message ?? 'No imported sold model for this player yet.'}</span>
        </div>
      ) : (
        <>
          <div className="sales-cache-facts">
            <div>
              <span>{row ? 'Release Sales' : 'Modeled Sales'}</span>
              <strong>{panelModeledSales.toLocaleString()}</strong>
            </div>
            <div>
              <span>{row ? 'Release Lanes' : 'Buckets'}</span>
              <strong>{panelBucketCount.toLocaleString()}</strong>
            </div>
            <div>
              <span>Updated</span>
              <strong>{compactDate(panelUpdatedAt)}</strong>
            </div>
          </div>

          {baseAutoBucket ? (
            <div className="sales-cache-base">
              <span>Primary base anchor</span>
              <strong>{money(baseAutoBucket.modelPrice)}</strong>
              <small>
                {baseAutoBucket.saleCount.toLocaleString()} sales / median {money(baseAutoBucket.medianPrice)} / latest{' '}
                {compactDate(baseAutoBucket.latestSoldAt)}
              </small>
            </div>
          ) : null}

          <SalesCacheBucketList title="Raw auto comps" buckets={topRawAutos} />
          <SalesCacheBucketList title="Graded comps" buckets={topGraded} />
          <SalesCacheBucketList title="Case hit comps" buckets={topCaseHits} />

          {model.exclusions?.length ? (
            <div className="sales-cache-exclusions" aria-label="Excluded sold rows">
              {model.exclusions.slice(0, 3).map((exclusion) => (
                <span key={exclusion.reason}>
                  {exclusion.reason}: {exclusion.count.toLocaleString()}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function SalesModelLab({
  row,
  model,
  loading,
  error,
  onFlagSale,
  onMergeBucket,
}: {
  row?: PricingRow
  model: SalesCachePlayerModel | null
  loading: boolean
  error: string | null
  onFlagSale: (itemId: string, erroneous: boolean, note?: string) => Promise<void>
  onMergeBucket: (
    sourceBucketKey: string,
    targetBucketKey: string,
    note?: string,
    targetMetadata?: SalesCacheMergeTargetMetadata,
  ) => Promise<void>
}) {
  const [scope, setScope] = useState<SalesLabScope>('chrome-autos')
  const [gradeFilter, setGradeFilter] = useState<SalesLabGrade>('raw')
  const [showFlagged, setShowFlagged] = useState(false)
  const [selectedBucketKey, setSelectedBucketKey] = useState('')
  const [selectedSaleId, setSelectedSaleId] = useState('')
  const [flagNote, setFlagNote] = useState('Likely misclassified')
  const [flaggingId, setFlaggingId] = useState('')
  const [flagError, setFlagError] = useState('')
  const [mergeSourceKey, setMergeSourceKey] = useState('')
  const [mergeTargetKey, setMergeTargetKey] = useState('')
  const [mergeNote, setMergeNote] = useState('Same physical card; listing title split the bucket')
  const [mergingBucketKey, setMergingBucketKey] = useState('')
  const [mergeError, setMergeError] = useState('')
  const sales = model?.available ? (model.sales ?? []) : []
  const releaseSales = row ? sales.filter((sale) => sale.releaseYear === row.releaseYear) : sales
  const selectedBaseBucket = soldBaseBucketForRow(row, model)
  const selectedBasePrice = selectedBaseBucket?.modelPrice ?? model?.baseAutoPrice ?? null
  const cleanSales = releaseSales.filter((sale) => sale.modelEligible && !sale.erroneous && sale.salePrice > 0 && saleTime(sale.soldAt) > 0)
  const flaggedSales = releaseSales.filter((sale) => sale.erroneous)
  const scopedSales = releaseSales.filter(
    (sale) =>
      sale.modelEligible &&
      sale.salePrice > 0 &&
      saleTime(sale.soldAt) > 0 &&
      saleMatchesLabScope(sale, scope) &&
      saleMatchesGrade(sale, gradeFilter),
  )
  const selectedSale = releaseSales.find((sale) => sale.itemId === selectedSaleId) ?? null
  const selectedSaleUrl = soldSaleUrl(selectedSale)

  const taxonomyCounts = [...cleanSales.reduce((counts, sale) => {
    const key = `${saleTypeLabel(sale)} / ${sale.productFamily} / ${sale.gradeBucket === 'Raw' ? 'Raw' : 'Graded'}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    return counts
  }, new Map<string, number>())]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
  const modelAsOfTime = cleanSales.length ? Math.max(...cleanSales.map((sale) => saleTime(sale.soldAt))) : saleTime(model?.generatedAt ?? '')
  const recentCutoff = modelAsOfTime - SALES_LAB_RECENT_DAYS * SALES_LAB_DAY_MS
  const priorCutoff = modelAsOfTime - SALES_LAB_PRIOR_DAYS * SALES_LAB_DAY_MS

  const bucketRows = [...scopedSales.reduce((groups, sale) => {
    const key = sale.bucketKey
    const existing = groups.get(key) ?? {
      key,
      label: saleBucketShortLabel(sale),
      type: saleTypeLabel(sale),
      tone: saleToneClass(sale),
      sales: [] as SalesCacheSale[],
    }
    existing.sales.push(sale)
    groups.set(key, existing)
    return groups
  }, new Map<string, { key: string; label: string; type: string; tone: string; sales: SalesCacheSale[] }>()).values()]
    .map((bucket) => {
      const cleanBucketSales = bucket.sales.filter((sale) => !sale.erroneous)
      const visibleBucketSales = bucket.sales.filter((sale) => showFlagged || !sale.erroneous)
      const representativeSale = cleanBucketSales[0] ?? visibleBucketSales[0] ?? bucket.sales[0] ?? null
      const scarcity = salesScarcityModel(representativeSale, bucket.label, bucket.type)
      const sortedPrices = cleanBucketSales.map((sale) => sale.salePrice).sort((left, right) => left - right)
      const recentSales = cleanBucketSales.filter((sale) => saleTime(sale.soldAt) >= recentCutoff)
      const priorSales = cleanBucketSales.filter((sale) => {
        const time = saleTime(sale.soldAt)
        return time >= priorCutoff && time < recentCutoff
      })
      const olderSales = cleanBucketSales.filter((sale) => saleTime(sale.soldAt) < recentCutoff)
      const recentModel = weightedSoldModelPrice(recentSales)
      const priorModel = weightedSoldModelPrice(priorSales.length > 0 ? priorSales : olderSales)
      const latestTime = cleanBucketSales.reduce((latest, sale) => Math.max(latest, saleTime(sale.soldAt)), 0)
      const proximityMultiple = summarizeProximityMultiplier(cleanBucketSales, cleanSales)
      return {
        ...bucket,
        sales: visibleBucketSales,
        cleanSales: cleanBucketSales,
        productFamily: representativeSale?.productFamily ?? '',
        cardClass: representativeSale?.cardClass ?? '',
        variationLabel: representativeSale?.variationLabel ?? '',
        gradeBucket: representativeSale?.gradeBucket ?? '',
        insertName: representativeSale?.insertName ?? '',
        serialDenominator: representativeSale?.serialDenominator ?? null,
        count: cleanBucketSales.length,
        visibleCount: visibleBucketSales.length,
        flaggedCount: bucket.sales.length - cleanBucketSales.length,
        median: medianValue(sortedPrices),
        q1: medianValue(sortedPrices.slice(0, Math.ceil(sortedPrices.length / 2))),
        q3: medianValue(sortedPrices.slice(Math.floor(sortedPrices.length / 2))),
        min: sortedPrices[0] ?? 0,
        max: sortedPrices.at(-1) ?? 0,
        modelPrice: weightedSoldModelPrice(cleanBucketSales),
        latest: latestTime ? new Date(latestTime).toISOString() : '',
        latestTime,
        daysSinceLatest: latestTime ? Math.max(0, Math.round((modelAsOfTime - latestTime) / SALES_LAB_DAY_MS)) : null,
        recentCount: recentSales.length,
        priorCount: priorSales.length,
        recentModel,
        priorModel,
        trendPct: recentModel > 0 && priorModel > 0 ? recentModel / priorModel - 1 : null,
        estimatedCopies: scarcity.copies,
        scarcityLabel: scarcity.label,
        numbered: scarcity.numbered,
        proximityMultiple,
      }
    })
    .filter((bucket) => bucket.count > 0 || (showFlagged && bucket.visibleCount > 0))
    .sort(compareSalesBucketsByScarcity)
  const sourceBucketRows = [...scopedSales.reduce((groups, sale) => {
    const key = saleOriginalBucketKey(sale)
    const existing = groups.get(key) ?? {
      key,
      label: saleSourceBucketShortLabel(sale),
      type: saleSourceTypeLabel(sale),
      tone: saleToneClass(sale),
      sales: [] as SalesCacheSale[],
    }
    existing.sales.push(sale)
    groups.set(key, existing)
    return groups
  }, new Map<string, { key: string; label: string; type: string; tone: string; sales: SalesCacheSale[] }>()).values()]
    .map((bucket) => {
      const cleanBucketSales = bucket.sales.filter((sale) => !sale.erroneous)
      const visibleBucketSales = bucket.sales.filter((sale) => showFlagged || !sale.erroneous)
      const representativeSale = cleanBucketSales[0] ?? visibleBucketSales[0] ?? bucket.sales[0] ?? null
      const sortedPrices = cleanBucketSales.map((sale) => sale.salePrice).sort((left, right) => left - right)
      const latestTime = cleanBucketSales.reduce((latest, sale) => Math.max(latest, saleTime(sale.soldAt)), 0)
      return {
        ...bucket,
        sales: visibleBucketSales,
        cleanSales: cleanBucketSales,
	        productFamily: representativeSale?.sourceProductFamily ?? representativeSale?.productFamily ?? '',
	        cardClass: representativeSale?.sourceCardClass ?? representativeSale?.cardClass ?? '',
	        variationLabel: representativeSale?.sourceVariationLabel ?? representativeSale?.variationLabel ?? '',
	        gradeBucket: representativeSale?.sourceGradeBucket ?? representativeSale?.gradeBucket ?? '',
	        insertName: representativeSale?.sourceInsertName ?? representativeSale?.insertName ?? '',
	        serialDenominator: representativeSale?.sourceSerialDenominator ?? representativeSale?.serialDenominator ?? null,
	        releaseYear: representativeSale?.releaseYear ?? null,
	        count: cleanBucketSales.length,
	        visibleCount: visibleBucketSales.length,
	        median: medianValue(sortedPrices),
	        modelPrice: weightedSoldModelPrice(cleanBucketSales),
        latestTime,
      }
    })
    .filter((bucket) => bucket.count > 0 || (showFlagged && bucket.visibleCount > 0))
  const defaultBucket =
    bucketRows.find((bucket) =>
      bucket.cleanSales.some(
        (sale) =>
          sale.isAuto &&
          sale.gradeBucket === 'Raw' &&
          sale.variationLabel === 'Base Auto' &&
          sale.productFamily === 'Bowman Chrome',
      ),
    ) ??
    bucketRows.find((bucket) =>
      bucket.cleanSales.some((sale) => sale.isAuto && sale.gradeBucket === 'Raw' && sale.variationLabel === 'Base Auto'),
    ) ??
    bucketRows[0]
  const effectiveBucketKey = bucketRows.some((bucket) => bucket.key === selectedBucketKey) ? selectedBucketKey : defaultBucket?.key ?? ''
  const selectedBucket = bucketRows.find((bucket) => bucket.key === effectiveBucketKey) ?? null
  const selectedCurrentMultiple =
    selectedBucket && selectedBasePrice && selectedBucket.modelPrice > 0 ? selectedBucket.modelPrice / selectedBasePrice : null
  const selectedNearSaleMultiple = selectedBucket?.proximityMultiple?.multiplier ?? null
  const selectedMultipleDeltaPct =
    selectedCurrentMultiple && selectedNearSaleMultiple ? selectedNearSaleMultiple / selectedCurrentMultiple - 1 : null
  const selectedSourceBuckets = selectedBucket
    ? sourceBucketRows.filter((sourceBucket) => selectedBucket.sales.some((sale) => saleOriginalBucketKey(sale) === sourceBucket.key))
    : []
  const selectedSaleSourceKey =
    selectedSale && selectedBucket?.sales.some((sale) => sale.itemId === selectedSale.itemId) ? saleOriginalBucketKey(selectedSale) : ''
	  const preferredMergeSourceKey = selectedSourceBuckets.some((bucket) => bucket.key === selectedSaleSourceKey)
	    ? selectedSaleSourceKey
	    : selectedSourceBuckets[0]?.key ?? ''
	  const effectiveMergeSourceKey = selectedSourceBuckets.some((bucket) => bucket.key === mergeSourceKey) ? mergeSourceKey : preferredMergeSourceKey
	  const mergeSourceBucket = selectedSourceBuckets.find((bucket) => bucket.key === effectiveMergeSourceKey) ?? selectedSourceBuckets[0] ?? null
	  type SourceBucketRow = (typeof sourceBucketRows)[number] & { synthetic?: boolean }
	  const canonicalMergeTarget = mergeSourceBucket
	    ? (() => {
	        const canonicalSerialDenominator = inferredCanonicalSerialDenominator(mergeSourceBucket.variationLabel)
	        const currentSerialDenominator =
	          mergeSourceBucket.serialDenominator ?? serialDenominatorFromLabel(mergeSourceBucket.variationLabel)
	        if (!canonicalSerialDenominator || currentSerialDenominator === canonicalSerialDenominator) return null
	        const variationLabel = variationLabelWithSerial(mergeSourceBucket.variationLabel, canonicalSerialDenominator)
	        const key = salesBucketKeyForParts({
	          releaseYear: mergeSourceBucket.releaseYear,
	          productFamily: mergeSourceBucket.productFamily,
	          cardClass: mergeSourceBucket.cardClass,
	          variationLabel,
	          gradeBucket: mergeSourceBucket.gradeBucket,
	        })
	        if (!variationLabel || key === mergeSourceBucket.key) return null
	        return { key, variationLabel, serialDenominator: canonicalSerialDenominator }
	      })()
	    : null
	  const existingMergeCandidates: SourceBucketRow[] = mergeSourceBucket
	    ? sourceBucketRows
	        .filter((bucket) => bucket.key !== mergeSourceBucket.key && bucket.gradeBucket === mergeSourceBucket.gradeBucket && bucket.type === mergeSourceBucket.type)
	        .sort((left, right) => {
	          const score = (bucket: typeof left) => {
	            let value = 0
	            if (canonicalMergeTarget?.key === bucket.key) value += 10_000
	            if (bucket.variationLabel && bucket.variationLabel === mergeSourceBucket.variationLabel) value += 34
	            if (bucket.insertName && bucket.insertName === mergeSourceBucket.insertName) value += 28
	            if (bucket.serialDenominator && mergeSourceBucket.serialDenominator) {
              value += bucket.serialDenominator === mergeSourceBucket.serialDenominator ? 24 : -42
            }
            if (bucket.productFamily === mergeSourceBucket.productFamily) value += 16
            if (bucket.cardClass === mergeSourceBucket.cardClass) value += 10
            value += Math.min(12, bucket.count)
            const selectedLog = Math.log(Math.max(1, mergeSourceBucket.modelPrice))
            const bucketLog = Math.log(Math.max(1, bucket.modelPrice))
            value -= Math.min(14, Math.abs(selectedLog - bucketLog) * 7)
            return value
          }
	          return score(right) - score(left) || right.count - left.count || right.modelPrice - left.modelPrice
	        })
	    : []
	  const syntheticMergeTargets: SourceBucketRow[] = mergeSourceBucket
	    ? (() => {
	        if (!canonicalMergeTarget || sourceBucketRows.some((bucket) => bucket.key === canonicalMergeTarget.key)) return []
	        return [
	          {
	            ...mergeSourceBucket,
	            key: canonicalMergeTarget.key,
	            label: [
	              mergeSourceBucket.productFamily,
	              mergeSourceBucket.insertName,
	              canonicalMergeTarget.variationLabel,
	              mergeSourceBucket.gradeBucket,
	            ]
	              .filter(Boolean)
	              .join(' / '),
	            variationLabel: canonicalMergeTarget.variationLabel,
	            serialDenominator: canonicalMergeTarget.serialDenominator,
	            sales: [],
	            cleanSales: [],
	            count: 0,
	            visibleCount: 0,
	            median: 0,
	            modelPrice: mergeSourceBucket.modelPrice,
	            latestTime: 0,
	            synthetic: true,
	          },
	        ]
	      })()
	    : []
	  const mergeCandidates = [...syntheticMergeTargets, ...existingMergeCandidates]
	    .filter((bucket, index, buckets) => buckets.findIndex((candidate) => candidate.key === bucket.key) === index)
	    .slice(0, 16)
	  const effectiveMergeTargetKey = mergeCandidates.some((bucket) => bucket.key === mergeTargetKey) ? mergeTargetKey : mergeCandidates[0]?.key ?? ''
	  const mergeTargetBucket = mergeCandidates.find((bucket) => bucket.key === effectiveMergeTargetKey) ?? null
  const canMergeBuckets = Boolean(mergeSourceBucket && mergeTargetBucket && mergingBucketKey !== mergeSourceBucket?.key)
  const ladderRows = bucketRows.slice(0, 36)
  const structureRows = bucketRows.slice(0, 84)
  const ladderPrices = ladderRows.flatMap((bucket) => [bucket.modelPrice, bucket.q1, bucket.q3]).filter((price) => price > 0)
  const ladderMinPrice = Math.max(
    1,
    ladderPrices.length ? Math.min(...ladderPrices, selectedBasePrice ?? Number.POSITIVE_INFINITY) : (selectedBasePrice ?? 1),
  )
  const ladderMaxPrice = Math.max(...ladderPrices, selectedBasePrice ?? 1, ladderMinPrice * 1.05)
  const ladderLowLog = Math.log(ladderMinPrice)
  const ladderHighLog = Math.log(ladderMaxPrice)
  const ladderPct = (price: number) =>
    Math.min(
      98,
      Math.max(2, ((Math.log(Math.max(1, price)) - ladderLowLog) / Math.max(0.001, ladderHighLog - ladderLowLog)) * 100),
    )
  const ladderTicks = [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000].filter(
    (tick) => tick >= ladderMinPrice * 0.9 && tick <= ladderMaxPrice * 1.12,
  )
  const baseAnchorPct = selectedBasePrice ? ladderPct(selectedBasePrice) : null
  const structurePrices = structureRows.map((bucket) => bucket.modelPrice).filter((price) => price > 0)
  const structureCopies = structureRows.map((bucket) => bucket.estimatedCopies).filter((copies) => copies > 0)
  const structureMinPrice = Math.max(
    1,
    structurePrices.length ? Math.min(...structurePrices, selectedBasePrice ?? Number.POSITIVE_INFINITY) : (selectedBasePrice ?? 1),
  )
  const structureMaxPrice = Math.max(
    structureMinPrice * 1.12,
    structurePrices.length ? Math.max(...structurePrices, selectedBasePrice ?? 1) : (selectedBasePrice ?? 100),
  )
  const structureLowLog = Math.log(structureMinPrice)
  const structureHighLog = Math.log(structureMaxPrice)
  const structureMinCopies = Math.max(1, structureCopies.length ? Math.min(...structureCopies) : 1)
  const structureMaxCopies = Math.max(structureMinCopies * 1.05, structureCopies.length ? Math.max(...structureCopies) : 50_000)
  const structureLowCopiesLog = Math.log(structureMinCopies)
  const structureHighCopiesLog = Math.log(structureMaxCopies)
  const structureChart = { width: 860, height: 178, left: 56, right: 26, top: 22, bottom: 38 }
  const structureBottomY = structureChart.height - structureChart.bottom
  const structureXForCopies = (copies: number) =>
    structureChart.left +
    (1 - (Math.log(Math.max(1, copies)) - structureLowCopiesLog) / Math.max(0.001, structureHighCopiesLog - structureLowCopiesLog)) *
      (structureChart.width - structureChart.left - structureChart.right)
  const structureYPrice = (price: number) =>
    structureChart.top +
    (1 - (Math.log(Math.max(1, price)) - structureLowLog) / Math.max(0.001, structureHighLog - structureLowLog)) *
      (structureChart.height - structureChart.top - structureChart.bottom)
  const selectedStructureIndex = structureRows.findIndex((bucket) => bucket.key === effectiveBucketKey)
  const selectedStructureBucket = selectedStructureIndex >= 0 ? structureRows[selectedStructureIndex] : null
  const structureTicks = [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000].filter(
    (tick) => tick >= structureMinPrice * 0.9 && tick <= structureMaxPrice * 1.1,
  )
  const structureCopyTicks = [50_000, 10_000, 1_880, 700, 499, 250, 150, 100, 50, 25, 10, 5, 1].filter(
    (tick) => tick >= structureMinCopies * 0.92 && tick <= structureMaxCopies * 1.08,
  )
  const structureCopyLabel = (copies: number) => {
    if (copies >= 10_000) return `~${Math.round(copies / 1000)}k`
    if (copies >= 1000) return `~${(copies / 1000).toFixed(copies % 1000 === 0 ? 0 : 1)}k`
    return copies <= 999 && copies <= 500 ? `/${copies}` : `~${copies.toLocaleString()}`
  }
  const structureLinePoints = [...structureRows]
    .sort((left, right) => right.estimatedCopies - left.estimatedCopies || left.modelPrice - right.modelPrice)
    .map((bucket) => `${structureXForCopies(bucket.estimatedCopies).toFixed(1)},${structureYPrice(bucket.modelPrice).toFixed(1)}`)
    .join(' ')
  const focusSales = [...(selectedBucket?.sales ?? [])].sort((left, right) => saleTime(left.soldAt) - saleTime(right.soldAt))
  const focusPrices = focusSales.map((sale) => sale.salePrice).filter((price) => price > 0)
  const focusMinTime = focusSales.length ? Math.min(...focusSales.map((sale) => saleTime(sale.soldAt))) : 0
  const focusMaxTime = focusSales.length ? Math.max(...focusSales.map((sale) => saleTime(sale.soldAt))) : 0
  const focusMinPrice = focusPrices.length ? Math.max(1, Math.min(...focusPrices)) : 1
  const focusMaxPrice = focusPrices.length ? Math.max(...focusPrices) : 1
  const focusLowLog = Math.log(focusMinPrice)
  const focusHighLog = Math.log(Math.max(focusMaxPrice, focusMinPrice * 1.05))
  const focusChart = { width: 420, height: 155, left: 46, right: 20, top: 18, bottom: 30 }
  const focusXTime = (time: number) =>
    focusChart.left + ((time - focusMinTime) / Math.max(1, focusMaxTime - focusMinTime)) * (focusChart.width - focusChart.left - focusChart.right)
  const focusX = (sale: SalesCacheSale) => focusXTime(saleTime(sale.soldAt))
  const focusYPrice = (price: number) =>
    focusChart.top +
    (1 - (Math.log(Math.max(1, price)) - focusLowLog) / Math.max(0.001, focusHighLog - focusLowLog)) *
      (focusChart.height - focusChart.top - focusChart.bottom)
  const focusY = (sale: SalesCacheSale) => focusYPrice(sale.salePrice)
  const focusTrend = selectedBucket ? salesLogTrend(selectedBucket.cleanSales) : null
  const focusTickPrices = Array.from(new Set([focusMinPrice, selectedBucket?.modelPrice ?? 0, focusMaxPrice].filter((price) => price > 0))).sort(
    (left, right) => left - right,
  )
  const focusSalePoints = focusSales.map((sale) => `${focusX(sale).toFixed(1)},${focusY(sale).toFixed(1)}`).join(' ')
  const focusRollingPoints = focusSales
    .map((sale, index) => {
      const window = focusSales.slice(Math.max(0, index - 4), index + 1)
      const rollingPrice = window.reduce((total, item) => total + item.salePrice, 0) / Math.max(1, window.length)
      return `${focusX(sale).toFixed(1)},${focusYPrice(rollingPrice).toFixed(1)}`
    })
    .join(' ')

  async function toggleSelectedSaleFlag(nextErroneous: boolean) {
    if (!selectedSale) return
    setFlaggingId(selectedSale.itemId)
    setFlagError('')
    try {
      await onFlagSale(selectedSale.itemId, nextErroneous, nextErroneous ? flagNote : '')
      if (nextErroneous) setSelectedSaleId('')
    } catch (flagSaleError) {
      setFlagError(flagSaleError instanceof Error ? flagSaleError.message : 'Could not update sale flag')
    } finally {
      setFlaggingId('')
    }
  }

	  async function mergeSelectedBucket() {
	    if (!mergeSourceBucket || !mergeTargetBucket || !effectiveMergeTargetKey) return
	    setMergingBucketKey(mergeSourceBucket.key)
	    setMergeError('')
	    try {
	      await onMergeBucket(mergeSourceBucket.key, effectiveMergeTargetKey, mergeNote, {
	        targetReleaseYear: mergeTargetBucket.releaseYear,
	        targetProductFamily: mergeTargetBucket.productFamily,
	        targetCardClass: mergeTargetBucket.cardClass,
	        targetVariationLabel: mergeTargetBucket.variationLabel,
	        targetSerialDenominator: mergeTargetBucket.serialDenominator,
	        targetGradeBucket: mergeTargetBucket.gradeBucket,
	        targetInsertName: mergeTargetBucket.insertName || null,
	      })
	      setSelectedBucketKey(effectiveMergeTargetKey)
	      setSelectedSaleId('')
	      setMergeSourceKey('')
    } catch (bucketMergeError) {
      setMergeError(bucketMergeError instanceof Error ? bucketMergeError.message : 'Could not merge buckets')
    } finally {
      setMergingBucketKey('')
    }
  }

  if (loading) {
    return (
      <section className="sales-model-lab">
        <div className="sales-lab-empty">
          <RefreshCw size={20} className="spin" />
          <strong>Loading sold-sale model.</strong>
        </div>
      </section>
    )
  }

  if (error || !model?.available || sales.length === 0) {
    return (
      <section className="sales-model-lab">
        <div className="sales-lab-empty">
          <BarChart3 size={22} />
          <strong>{error ?? model?.message ?? 'No sold-sale model loaded for this player yet.'}</strong>
        </div>
      </section>
    )
  }

  return (
    <section className="sales-model-lab" aria-label="Sold sale modeling lab">
      <div className="sales-lab-header">
        <div>
          <span>Sales Model Lab</span>
          <h2>{model.playerName}</h2>
          <small>
            {row
              ? `${row.release.replaceAll('-', ' ')} cached sales separated by card family, type, variation, serial, and grade.`
              : 'Every cached sale separated by card family, type, insert, variation, serial, and grade.'}
          </small>
        </div>
        <div className="sales-lab-kpis">
          <div>
            <span>Clean Dots</span>
            <strong>{cleanSales.length.toLocaleString()}</strong>
          </div>
          <div>
            <span>Flagged</span>
            <strong>{flaggedSales.length.toLocaleString()}</strong>
          </div>
          <div>
            <span>Sold Base</span>
            <strong>{selectedBasePrice ? money(selectedBasePrice) : '--'}</strong>
          </div>
        </div>
      </div>

      <div className="sales-lab-controls">
        <label>
          <span>Card Type</span>
          <select value={scope} onChange={(event) => setScope(event.target.value as SalesLabScope)}>
            {Object.entries(SALES_LAB_SCOPE_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Grade</span>
          <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value as SalesLabGrade)}>
            {Object.entries(SALES_LAB_GRADE_LABELS).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="sales-lab-check">
          <input type="checkbox" checked={showFlagged} onChange={(event) => setShowFlagged(event.target.checked)} />
          <span>Show flagged dots</span>
        </label>
      </div>

      <div className="sales-lab-body">
        <div className="sales-ladder-card">
          <div className="sales-map-head">
            <div>
              <span>Market Lanes</span>
              <strong>{bucketRows.length.toLocaleString()} lanes</strong>
            </div>
            <small>Ordered by estimated print run, then price. Use the list to inspect and clean buckets.</small>
          </div>
          {structureRows.length > 1 ? (
            <div className="sales-structure-card">
              <div className="sales-structure-copy">
                <div>
                  <span>Scarcity vs Model Price</span>
                  <strong>{selectedStructureBucket ? selectedStructureBucket.label : 'Market map'}</strong>
                </div>
                <small>
                  {selectedStructureBucket
                    ? `${money(selectedStructureBucket.modelPrice)} model / ${selectedStructureBucket.scarcityLabel} / ${selectedStructureBucket.count.toLocaleString()} comps`
                    : 'X-axis is print run or serial estimate; y-axis is weighted sold model. Bubble size shows comp depth.'}
                </small>
              </div>
              <svg className="sales-structure-chart" viewBox={`0 0 ${structureChart.width} ${structureChart.height}`} role="img" aria-label="Scarcity versus modeled sold price">
                <rect
                  x={structureChart.left}
                  y={structureChart.top}
                  width={structureChart.width - structureChart.left - structureChart.right}
                  height={structureChart.height - structureChart.top - structureChart.bottom}
                  rx="10"
                />
                {structureTicks.map((tick) => (
                  <g key={`structure-tick:${tick}`}>
                    <line
                      className="sales-structure-gridline"
                      x1={structureChart.left}
                      x2={structureChart.width - structureChart.right}
                      y1={structureYPrice(tick)}
                      y2={structureYPrice(tick)}
                    />
                    <text className="sales-structure-tick" x={structureChart.left - 8} y={structureYPrice(tick) + 4}>
                      {money(tick)}
                    </text>
                  </g>
                ))}
                {structureCopyTicks.map((tick) => (
                  <g key={`structure-copy-tick:${tick}`}>
                    <line
                      className="sales-structure-copyline"
                      x1={structureXForCopies(tick)}
                      x2={structureXForCopies(tick)}
                      y1={structureChart.top}
                      y2={structureBottomY}
                    />
                    <text className="sales-structure-copy-tick" x={structureXForCopies(tick)} y={structureBottomY + 20}>
                      {structureCopyLabel(tick)}
                    </text>
                  </g>
                ))}
                {selectedBasePrice ? (
                  <line
                    className="sales-structure-base-line"
                    x1={structureChart.left}
                    x2={structureChart.width - structureChart.right}
                    y1={structureYPrice(selectedBasePrice)}
                    y2={structureYPrice(selectedBasePrice)}
                  />
                ) : null}
                {selectedStructureBucket ? (
                  <>
                    <line
                      className="sales-structure-selected-line"
                      x1={structureXForCopies(selectedStructureBucket.estimatedCopies)}
                      x2={structureXForCopies(selectedStructureBucket.estimatedCopies)}
                      y1={structureChart.top}
                      y2={structureBottomY}
                    />
                    <line
                      className="sales-structure-selected-price-line"
                      x1={structureChart.left}
                      x2={structureChart.width - structureChart.right}
                      y1={structureYPrice(selectedStructureBucket.modelPrice)}
                      y2={structureYPrice(selectedStructureBucket.modelPrice)}
                    />
                  </>
                ) : null}
                {structureRows.length > 1 ? <polyline className="sales-structure-price-curve" points={structureLinePoints} /> : null}
                {structureRows.map((bucket) => {
                  const radius = 3.6 + Math.min(8.2, Math.sqrt(bucket.count) * 1.05)
                  return (
                    <circle
                      className={`sales-structure-dot ${bucket.tone} ${bucket.key === effectiveBucketKey ? 'selected' : ''}`}
                      cx={structureXForCopies(bucket.estimatedCopies)}
                      cy={structureYPrice(bucket.modelPrice)}
                      r={bucket.key === effectiveBucketKey ? radius + 2 : radius}
                      key={`structure:${bucket.key}`}
                      onClick={() => {
                        setSelectedBucketKey(bucket.key)
                        setSelectedSaleId('')
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          setSelectedBucketKey(bucket.key)
                          setSelectedSaleId('')
                        }
                      }}
                      tabIndex={0}
                    >
                      <title>
                        {`${bucket.label} / ${money(bucket.modelPrice)} model / ${bucket.count.toLocaleString()} comps / ${bucket.scarcityLabel}`}
                      </title>
                    </circle>
                  )
                })}
                <text className="sales-structure-axis-label" x={structureChart.left} y={structureChart.height - 9}>
                  more copies
                </text>
                <text className="sales-structure-axis-label end" x={structureChart.width - structureChart.right} y={structureChart.height - 9}>
                  scarcer
                </text>
                {selectedBasePrice ? (
                  <text className="sales-structure-base-label" x={structureChart.width - structureChart.right - 6} y={structureYPrice(selectedBasePrice) - 6}>
                    base {money(selectedBasePrice)}
                  </text>
                ) : null}
              </svg>
            </div>
          ) : null}
          <div className="sales-ladder-scale" aria-hidden="true">
            {selectedBasePrice ? <span className="sales-ladder-anchor" style={{ '--base-pct': `${baseAnchorPct}%` } as CSSProperties}>Base</span> : null}
            {ladderTicks.map((tick) => (
              <span key={`ladder-tick:${tick}`} style={{ '--tick-pct': `${ladderPct(tick)}%` } as CSSProperties}>
                {money(tick)}
              </span>
            ))}
          </div>
          <div className="sales-ladder-list">
            {ladderRows.length > 0 ? (
              <div className="sales-ladder-header-row" aria-hidden="true">
                <span />
                <span>Card lane</span>
                <span>Modeled price rail</span>
                <span>Model</span>
                <span>30d trend</span>
              </div>
            ) : null}
            {ladderRows.map((bucket, index) => {
              const q1Pct = ladderPct(bucket.q1 || bucket.modelPrice)
              const q3Pct = ladderPct(bucket.q3 || bucket.modelPrice)
              const trackStyle = {
                '--model-pct': `${ladderPct(bucket.modelPrice)}%`,
                '--range-left': `${Math.min(q1Pct, q3Pct)}%`,
                '--range-width': `${Math.max(2, Math.abs(q3Pct - q1Pct))}%`,
                '--base-pct': `${baseAnchorPct ?? 0}%`,
              } as CSSProperties
              const multiple = selectedBasePrice && bucket.modelPrice > 0 ? bucket.modelPrice / selectedBasePrice : null
              const nearSaleMultiple = bucket.proximityMultiple?.multiplier ?? null
              return (
                <button
                  className={`sales-ladder-row ${bucket.tone} ${effectiveBucketKey === bucket.key ? 'selected' : ''}`}
                  key={bucket.key}
                  type="button"
                  onClick={() => {
                    setSelectedBucketKey(bucket.key)
                    setSelectedSaleId('')
                  }}
                >
                  <span className="sales-ladder-rank">#{index + 1}</span>
                  <span className="sales-ladder-main">
                    <strong>{bucket.label}</strong>
                    <span className="sales-ladder-meta">
                      <small>
                        {bucket.type} / {bucket.count.toLocaleString()} sale{bucket.count === 1 ? '' : 's'} / latest {salesAgeLabel(bucket.daysSinceLatest)}
                      </small>
                      <i>{bucket.scarcityLabel}</i>
                    </span>
                  </span>
                  <span className="sales-ladder-track" style={trackStyle}>
                    <i className="sales-ladder-range" />
                    {selectedBasePrice ? <i className="sales-ladder-base" /> : null}
                    <i className="sales-ladder-model" />
                  </span>
                  <span className="sales-ladder-stats">
                    <strong>{money(bucket.modelPrice)}</strong>
                    <small>
                      {multiple ? `${formatMultiplier(multiple)} base` : 'weighted'}
                      {nearSaleMultiple ? ` / ${formatMultiplier(nearSaleMultiple)} near-sale` : ''}
                    </small>
                  </span>
                  <span className={`sales-ladder-trend ${salesTrendClass(bucket.trendPct)}`}>
                    <strong>{salesTrendLabel(bucket.trendPct)}</strong>
                    <small>{bucket.recentCount.toLocaleString()} in 30d</small>
                  </span>
                </button>
              )
            })}
            {ladderRows.length === 0 ? (
              <div className="sales-lab-empty compact">
                <BarChart3 size={20} />
                <strong>No modeled buckets match these filters.</strong>
              </div>
            ) : null}
          </div>
          <div className="sales-lab-legend">
            {['auto', 'chrome', 'paper', 'insert', 'case-hit', 'graded', 'flagged'].map((tone) => (
              <span key={tone}>
                <i className={`sales-dot-swatch ${tone}`} />
                {tone.replace('-', ' ')}
              </span>
            ))}
          </div>
        </div>

        <aside className="sales-inspector">
          {selectedBucket ? (
            <>
              <div className="sales-inspector-head">
                <span>Selected Lane</span>
                <strong>{money(selectedBucket.modelPrice)}</strong>
                <small>
                  {selectedBucket.type} / {selectedBucket.count.toLocaleString()} clean sales / median {money(selectedBucket.median)}
                </small>
              </div>
              <p className="sales-bucket-title">{selectedBucket.label}</p>
              <div className="sales-time-strip">
                <div>
                  <span>30d</span>
                  <strong>{selectedBucket.recentCount.toLocaleString()}</strong>
                  <small>{selectedBucket.recentModel ? money(selectedBucket.recentModel) : '--'}</small>
                </div>
                <div>
                  <span>Prior</span>
                  <strong>{selectedBucket.priorCount.toLocaleString()}</strong>
                  <small>{selectedBucket.priorModel ? money(selectedBucket.priorModel) : '--'}</small>
                </div>
                <div className={salesTrendClass(selectedBucket.trendPct)}>
                  <span>Trend</span>
                  <strong>{salesTrendLabel(selectedBucket.trendPct)}</strong>
                  <small>{compactDate(selectedBucket.latest)}</small>
                </div>
              </div>
              <div className="sales-multiple-strip">
                <div>
                  <span>Current</span>
                  <strong>{selectedCurrentMultiple ? formatMultiplier(selectedCurrentMultiple) : '--'}</strong>
                  <small>model / sold base</small>
                </div>
                <div>
                  <span>Near-sale</span>
                  <strong>{selectedNearSaleMultiple ? formatMultiplier(selectedNearSaleMultiple) : '--'}</strong>
                  <small>
                    {selectedBucket.proximityMultiple
                      ? `${selectedBucket.proximityMultiple.pointCount.toLocaleString()} variation / ${selectedBucket.proximityMultiple.anchorSaleCount.toLocaleString()} base anchors`
                      : 'no close base anchor'}
                  </small>
                </div>
                <div className={salesTrendClass(selectedMultipleDeltaPct)}>
                  <span>Delta</span>
                  <strong>{salesTrendLabel(selectedMultipleDeltaPct)}</strong>
                  <small>
                    {selectedBucket.proximityMultiple
                      ? `nearest ${selectedBucket.proximityMultiple.nearestAnchorDays.toFixed(1)}d`
                      : 'waiting for pairs'}
                  </small>
                </div>
              </div>
              <div className="sales-range-strip">
                <span>Low {money(selectedBucket.min)}</span>
                <span>Q1 {money(selectedBucket.q1)}</span>
                <span>Q3 {money(selectedBucket.q3)}</span>
                <span>High {money(selectedBucket.max)}</span>
              </div>
              <div className="sales-chart-title">
                <strong>{selectedBucket.label}</strong>
                <span>Sold comps over time. Dashed line = model; solid line = recent slope.</span>
              </div>
              <svg className="sales-focus-chart" viewBox={`0 0 ${focusChart.width} ${focusChart.height}`} role="img" aria-label="Selected bucket sale timeline">
                <rect
                  x={focusChart.left}
                  y={focusChart.top}
                  width={focusChart.width - focusChart.left - focusChart.right}
                  height={focusChart.height - focusChart.top - focusChart.bottom}
                  rx="8"
                />
                {focusTickPrices.map((tick) => (
                  <line
                    className="sales-focus-gridline"
                    x1={focusChart.left}
                    x2={focusChart.width - focusChart.right}
                    y1={focusYPrice(tick)}
                    y2={focusYPrice(tick)}
                    key={`focus-tick:${tick}`}
                  />
                ))}
                {selectedBucket.q1 > 0 && selectedBucket.q3 > 0 ? (
                  <rect
                    className="sales-focus-iqr-band"
                    x={focusChart.left}
                    y={Math.min(focusYPrice(selectedBucket.q1), focusYPrice(selectedBucket.q3))}
                    width={focusChart.width - focusChart.left - focusChart.right}
                    height={Math.max(3, Math.abs(focusYPrice(selectedBucket.q3) - focusYPrice(selectedBucket.q1)))}
                    rx="4"
                  />
                ) : null}
                <line
                  className="sales-focus-model-line"
                  x1={focusChart.left}
                  x2={focusChart.width - focusChart.right}
                  y1={focusYPrice(selectedBucket.modelPrice)}
                  y2={focusYPrice(selectedBucket.modelPrice)}
                />
                {focusTrend ? (
                  <line
                    className={`sales-focus-trend-line ${salesTrendClass(focusTrend.change30Pct)}`}
                    x1={focusXTime(focusTrend.startTime)}
                    x2={focusXTime(focusTrend.endTime)}
                    y1={focusYPrice(focusTrend.startPrice)}
                    y2={focusYPrice(focusTrend.endPrice)}
                  >
                    <title>{`Trend slope ${salesTrendLabel(focusTrend.change30Pct)} per 30 days`}</title>
                  </line>
                ) : null}
                {focusSales.length > 1 ? (
                  <>
                    <polyline className="sales-focus-sale-line" points={focusSalePoints} />
                    <polyline className="sales-focus-rolling-line" points={focusRollingPoints} />
                  </>
                ) : null}
                <text x={focusChart.left - 8} y={focusYPrice(focusMaxPrice) + 4}>
                  {money(focusMaxPrice)}
                </text>
                <text x={focusChart.left - 8} y={focusYPrice(focusMinPrice) + 4}>
                  {money(focusMinPrice)}
                </text>
                {focusSales.length ? (
                  <>
                    <text className="sales-focus-date" x={focusChart.left} y={focusChart.height - 8}>
                      {compactDate(new Date(focusMinTime).toISOString())}
                    </text>
                    <text className="sales-focus-date end" x={focusChart.width - focusChart.right} y={focusChart.height - 8}>
                      {compactDate(new Date(focusMaxTime).toISOString())}
                    </text>
                  </>
                ) : null}
                {focusSales.map((sale) => (
                  <circle
                    className={`sales-dot ${saleToneClass(sale)} ${selectedSaleId === sale.itemId ? 'selected' : ''}`}
                    cx={focusX(sale)}
                    cy={focusY(sale)}
                    r={selectedSaleId === sale.itemId ? 6.4 : sale.erroneous ? 3.4 : 4.6}
                    key={sale.itemId}
                    onClick={() => {
                      setSelectedSaleId(sale.itemId)
                      setFlagNote(sale.erroneousNote || 'Likely misclassified')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        setSelectedSaleId(sale.itemId)
                        setFlagNote(sale.erroneousNote || 'Likely misclassified')
                      }
                    }}
                    tabIndex={0}
                  >
                    <title>
                      {`${saleTaxonomyLabel(sale)} / ${money(sale.salePrice)} / ${compactDate(sale.soldAt)}`}
                    </title>
                  </circle>
                ))}
              </svg>
              <div className="sales-recent-tape">
                {focusSales.slice(-5).reverse().map((sale) => (
                  <button
                    className={selectedSaleId === sale.itemId ? 'selected' : ''}
                    type="button"
                    key={`recent:${sale.itemId}`}
                    onClick={() => {
                      setSelectedSaleId(sale.itemId)
                      setFlagNote(sale.erroneousNote || 'Likely misclassified')
                    }}
                  >
                    <strong>{money(sale.salePrice)}</strong>
                    <span>{compactDate(sale.soldAt)}</span>
                    <small>{sale.channel || 'sale'}</small>
                  </button>
                ))}
              </div>
              {mergeCandidates.length > 0 ? (
                <div className="sales-merge-panel">
                  <div className="sales-inspector-head">
                    <span>Cleanup</span>
                    <strong>Merge Bucket</strong>
                    <small>Move the original cached lane into the matching card lane.</small>
                  </div>
                  {selectedSourceBuckets.length > 1 ? (
                    <label>
                      <span>Source Bucket</span>
                      <select value={effectiveMergeSourceKey} onChange={(event) => setMergeSourceKey(event.target.value)}>
                        {selectedSourceBuckets.map((bucket) => (
                          <option value={bucket.key} key={`merge-source:${bucket.key}`}>
                            {bucket.label} · {bucket.count.toLocaleString()} sales · {money(bucket.modelPrice)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : mergeSourceBucket ? (
                    <div className="sales-merge-source">
                      <span>Source bucket</span>
                      <strong>{mergeSourceBucket.label}</strong>
                      <small>{mergeSourceBucket.count.toLocaleString()} sales · {money(mergeSourceBucket.modelPrice)}</small>
                    </div>
                  ) : null}
                  <label>
                    <span>Target Bucket</span>
                    <select value={effectiveMergeTargetKey} onChange={(event) => setMergeTargetKey(event.target.value)}>
	                      {mergeCandidates.map((bucket) => (
	                        <option value={bucket.key} key={`merge-target:${bucket.key}`}>
	                          {bucket.synthetic
	                            ? `${bucket.label} · create lane`
	                            : `${bucket.label} · ${bucket.count.toLocaleString()} sales · ${money(bucket.modelPrice)}`}
	                        </option>
	                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Review note</span>
                    <input value={mergeNote} onChange={(event) => setMergeNote(event.target.value)} />
                  </label>
                  {mergeSourceBucket && mergeTargetBucket ? (
                    <div className="sales-merge-preview">
                      <span>Will merge</span>
                      <strong>{mergeSourceBucket.label}</strong>
                      <small>into {mergeTargetBucket.label}</small>
                    </div>
                  ) : null}
                  <button className="primary-button sales-merge-button" type="button" disabled={!canMergeBuckets} onClick={() => void mergeSelectedBucket()}>
                    <ShieldCheck size={15} />
                    {mergingBucketKey === mergeSourceBucket?.key ? 'Merging' : 'Merge Buckets'}
                  </button>
                  {mergeError ? <small className="sales-flag-error">{mergeError}</small> : null}
                </div>
              ) : null}
              {selectedSale ? (
                <div className="sale-review-panel">
                  <div className="sales-inspector-head">
                    <span>{selectedSale.erroneous ? 'Flagged Sale' : 'Selected Sale'}</span>
                    <strong>{money(selectedSale.salePrice)}</strong>
                    <small>{compactDate(selectedSale.soldAt)} / {selectedSale.channel || 'unknown channel'}</small>
                  </div>
                  <p>{selectedSale.title}</p>
                  <div className="sales-inspector-taxonomy">
                    <span>{selectedSale.productFamily}</span>
                    <span>{saleTypeLabel(selectedSale)}</span>
                    {selectedSale.insertName ? <span>{selectedSale.insertName}</span> : null}
                    <span>{selectedSale.variationLabel}</span>
                    <span>{selectedSale.gradeBucket}</span>
                    {selectedSale.serialDenominator ? <span>/{selectedSale.serialDenominator}</span> : null}
                  </div>
                  <label className="sales-flag-note">
                    <span>Review note</span>
                    <input value={flagNote} onChange={(event) => setFlagNote(event.target.value)} />
                  </label>
                  <div className="sale-review-actions">
                    {selectedSaleUrl ? (
                      <a className="ghost-button" href={selectedSaleUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={15} />
                        Open sale
                      </a>
                    ) : null}
                    <button
                      className={selectedSale.erroneous ? 'ghost-button' : 'primary-button'}
                      type="button"
                      disabled={flaggingId === selectedSale.itemId}
                      onClick={() => void toggleSelectedSaleFlag(!selectedSale.erroneous)}
                    >
                      {selectedSale.erroneous ? <RefreshCw size={15} /> : <ShieldCheck size={15} />}
                      {selectedSale.erroneous ? 'Restore dot' : 'Mark erroneous'}
                    </button>
                  </div>
                  {flagError ? <small className="sales-flag-error">{flagError}</small> : null}
                </div>
              ) : (
                <div className="sales-lab-empty compact">
                  <BarChart3 size={20} />
                  <strong>Click a sale dot in this bucket to inspect or flag it.</strong>
                </div>
              )}
            </>
          ) : (
            <div className="sales-lab-empty compact">
              <BarChart3 size={20} />
              <strong>No buckets match these filters.</strong>
            </div>
          )}
        </aside>
      </div>

      <div className="sales-taxonomy-strip" aria-label="Classification coverage">
        {taxonomyCounts.map(([label, count]) => (
          <span key={label}>
            {label}: {count.toLocaleString()}
          </span>
        ))}
      </div>
    </section>
  )
}

function ModelStatus({
  models,
  loading,
  error,
  onRefresh,
}: {
  models: ChecklistModel[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}) {
  const totalPlayers = models.reduce((total, model) => total + (model.totalPlayers ?? model.players.length), 0)
  const loadedPlayers = models.reduce((total, model) => total + model.players.length, 0)
  const variationCount = models.reduce((total, model) => total + model.multipliers.length, 0)
  const playerCoverage =
    totalPlayers > 0
      ? `${loadedPlayers.toLocaleString()} / ${totalPlayers.toLocaleString()}`
      : models.length > 0
        ? loadedPlayers.toLocaleString()
        : '--'
  const sourceLabel = error
    ? error
    : loadedPlayers > 0
      ? `Canonical checklist loaded: ${loadedPlayers.toLocaleString()} players`
    : totalPlayers
        ? `Set curves only; ${totalPlayers.toLocaleString()} players need base prices`
        : 'Waiting for checklist model'

  return (
    <section className="detail-card model-status">
      <div className="section-title">
        <BookOpenCheck size={18} />
        <h2>Model Load</h2>
        <button className="icon-button" type="button" onClick={onRefresh} aria-label="Refresh model">
          <RefreshCw size={15} className={loading ? 'spin' : undefined} />
        </button>
      </div>
      <div className="model-facts">
        <div>
          <span>Sets</span>
          <strong>{models.length || '--'}</strong>
        </div>
        <div>
          <span>Players</span>
          <strong>{playerCoverage}</strong>
        </div>
        <div>
          <span>Vars</span>
          <strong>{variationCount ? variationCount.toLocaleString() : '--'}</strong>
        </div>
      </div>
      <div className={`model-source ${loadedPlayers > 0 ? 'connected' : ''}`}>
        <Brain size={16} />
        <span>{sourceLabel}</span>
      </div>
    </section>
  )
}

function SourceStackPanel({
  snapshot,
  ebayStatus,
  releaseCount,
  modelCount,
  pricedPlayers,
}: {
  snapshot: ObservabilitySnapshot | null
  ebayStatus: EbayStatus | null
  releaseCount: number
  modelCount: number
  pricedPlayers: number
}) {
  const checklist = snapshot?.checklist
  const sales = snapshot?.salesCache
  const cardHedge = snapshot?.cardHedge
  const ranking = snapshot?.ranking
  const confirmedFirstPlayers = checklist?.firstStatuses?.find((row) => row.status === 'confirmed_1st')?.players ?? 0
  const sourceRows = [
    {
      key: 'universe',
      label: 'Checklist universe',
      value: checklist?.available ? `${(checklist.universe?.total ?? checklist.cards?.total ?? pricedPlayers).toLocaleString()} cards` : `${releaseCount.toLocaleString()} releases`,
      detail: `${confirmedFirstPlayers.toLocaleString()} confirmed 1sts / ${modelCount.toLocaleString()} loaded models`,
      tone: checklist?.available || modelCount > 0 ? 'fresh' : 'watch',
      role: 'Official checklists and 1st-list evidence define what exists.',
    },
    {
      key: 'pricing',
      label: 'Pricing model',
      value: sales?.available ? `${(sales.canonical?.summarizedSales ?? sales.modeledSales ?? 0).toLocaleString()} comps` : `${pricedPlayers.toLocaleString()} priced`,
      detail: sales?.canonical?.updatedAt ? `canonical cache updated ${new Date(sales.canonical.updatedAt).toLocaleDateString()}` : 'local/canonical model first',
      tone: sales?.available || pricedPlayers > 0 ? 'fresh' : 'watch',
      role: 'Canonical sold comps anchor base autos and variation lanes.',
    },
    {
      key: 'card-hedge',
      label: 'Comp API',
      value: cardHedge?.configured ? `${(cardHedge.usage?.remainingDay ?? 0).toLocaleString()} left` : 'Optional',
      detail: cardHedge?.configured ? `${cardHedge.plan || 'plan'} / ${cardHedge.usage?.day?.toLocaleString() ?? 0} used today` : 'use only when refreshing comp cache',
      tone: cardHedge?.configured ? 'fresh' : 'watch',
      role: 'Card Hedge feeds new sold comps into the canonical cache.',
    },
    {
      key: 'live',
      label: 'Live market',
      value: ebayStatus?.configured ? 'eBay + Fanatics' : 'Offline',
      detail: ebayStatus?.cache?.enabled
        ? `eBay cache on / Fanatics fixed-price search live`
        : 'set eBay keys to scan active listings',
      tone: ebayStatus?.configured ? 'fresh' : 'offline',
      role: 'eBay powers active asks and auctions; Fanatics Collect adds fixed-price asks.',
    },
    {
      key: 'rankings',
      label: 'Player signal',
      value: ranking?.rows ? `${ranking.matchedRows.toLocaleString()} matched` : 'Bundled',
      detail: ranking?.latestUpdated ? `rankings updated ${new Date(ranking.latestUpdated).toLocaleDateString()}` : 'Formulated Consensus snapshots',
      tone: ranking?.rows ? 'fresh' : 'watch',
      role: 'Consensus rank, trend, and coverage drive the value board.',
    },
  ] satisfies Array<{
    key: string
    label: string
    value: string
    detail: string
    tone: 'fresh' | 'watch' | 'offline' | 'neutral'
    role: string
  }>

  return (
    <section className="source-stack-card">
      <div className="source-stack-head">
        <div>
          <span>
            <Database size={15} />
            Source stack
          </span>
          <strong>Canonical first, live market second</strong>
          <small>What each subscription or cache is responsible for right now.</small>
        </div>
      </div>
      <div className="source-stack-flow">
        <span>Checklist</span>
        <span>Sold comps</span>
        <span>Fair value</span>
        <span>Live scans</span>
        <span>Review loop</span>
      </div>
      <div className="source-stack-grid">
        {sourceRows.map((row) => (
          <article className={`source-stack-item ${row.tone}`} key={row.key}>
            <div>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              <small>{row.detail}</small>
            </div>
            <p>{row.role}</p>
          </article>
        ))}
      </div>
      <div className="source-stack-footer">
        <ShieldCheck size={15} />
        <span>Primary path: canonical sold comps plus live marketplace scans. Backup sources stay out of the normal user flow.</span>
      </div>
    </section>
  )
}

function BinRadar({
  models,
  modelOptions,
  selectedModelKey,
  opportunities,
  auctionOpportunities,
  listingCount,
  auctionListingCount,
  hiddenListingCount,
  lastRejectedListing,
  scan,
  auctionScan,
  ebayStatus,
  loading,
  auctionLoading,
  modelLoading,
  error,
  auctionError,
  minPrice,
  playerScope,
  targetPlayerCount,
  valuePlayerCount,
  prospectPlayerCount,
  resultSort,
  searchMode,
  searchTerm,
  variationOptions,
  onModelChange,
  onMinPriceChange,
  onPlayerScopeChange,
  onResultSortChange,
  onSearchModeChange,
  onSearchTermChange,
  onRejectListing,
  onUndoRejectListing,
  onScan,
  onScanAuctions,
  onScanValueTargets,
  onScanTopProspects,
  onScanBaseAutos,
  onScanLowSerial,
  onScanSuperfractors,
  resultsRef,
}: {
  models: ChecklistModel[]
  modelOptions: ChecklistModel[]
  selectedModelKey: string
  opportunities: Opportunity[]
  auctionOpportunities: Opportunity[]
  listingCount: number
  auctionListingCount: number
  hiddenListingCount: number
  lastRejectedListing: ListingRejection | null
  scan: EbayBinScanResult | null
  auctionScan: EbayBinScanResult | null
  ebayStatus: EbayStatus | null
  loading: boolean
  auctionLoading: boolean
  modelLoading: boolean
  error: string | null
  auctionError: string | null
  minPrice: number
  playerScope: BinPlayerScope
  targetPlayerCount: number
  valuePlayerCount: number
  prospectPlayerCount: number
  resultSort: BinResultSort
  searchMode: BinSearchMode
  searchTerm: string
  variationOptions: BinVariationOption[]
  onModelChange: (value: string) => void
  onMinPriceChange: (value: number) => void
  onPlayerScopeChange: (value: BinPlayerScope) => void
  onResultSortChange: (value: BinResultSort) => void
  onSearchModeChange: (value: BinSearchMode) => void
  onSearchTermChange: (value: string) => void
  onRejectListing: (opportunity: Opportunity) => void
  onUndoRejectListing: () => void
  onScan: () => void
  onScanAuctions: () => void
  onScanValueTargets: () => void
  onScanTopProspects: () => void
  onScanBaseAutos: () => void
  onScanLowSerial: () => void
  onScanSuperfractors: () => void
  resultsRef: RefObject<HTMLDivElement | null>
}) {
  const configured = Boolean(ebayStatus?.configured)
  const latestFetchedAt = scan?.fetchedAt ? new Date(scan.fetchedAt).toLocaleTimeString() : null
  const listingMarketplaceCounts = scan ? marketplaceCountsFromListings(scan.listings) : []
  const opportunityMarketplaceCounts = opportunities.length ? marketplaceCountsFromOpportunities(opportunities) : []
  const visibleMarketplaceCounts = opportunityMarketplaceCounts.length ? opportunityMarketplaceCounts : listingMarketplaceCounts
  const model = models[0] ?? null
  const setCount = models.length
  const playerCount = models.reduce((total, currentModel) => total + currentModel.players.length, 0)
  const hasPlayerUniverse = playerCount > 0
  const selectedSetLabel =
    selectedModelKey === BIN_ALL_MODELS_KEY
      ? setCount > 0
        ? `${setCount.toLocaleString()} loaded checklists`
        : 'All loaded checklists'
      : model
        ? checklistModelLabel(model)
        : 'No checklist selected'
  const selectedSetPill =
    selectedModelKey === BIN_ALL_MODELS_KEY ? `${setCount.toLocaleString()} sets` : model ? checklistModelLabel(model) : 'No set'
  const trimmedSearchTerm = searchTerm.trim()
  const isBaseAutoMode = searchMode === 'base-auto'
  const isLowSerialMode = searchMode === 'low-serial-non-auto'
  const isSuperfractorMode = searchMode === 'superfractor'
  const requiresFocus = searchMode === 'player' || searchMode === 'variation'
  const selectedVariationOption = variationOptions.find((option) => option.label === searchTerm)
  const hasStructuredVariationOptions = variationOptions.length > 0
  const hasFocus =
    !requiresFocus || (searchMode === 'variation' ? Boolean(selectedVariationOption) : trimmedSearchTerm.length > 0)
  const scopedPlayerCount =
    playerScope === 'target-50'
      ? targetPlayerCount
      : playerScope === 'value-25'
        ? valuePlayerCount
        : playerScope === 'prospect-100'
          ? prospectPlayerCount
          : playerCount
  const hasTargetQueue =
    (playerScope !== 'target-50' && playerScope !== 'value-25' && playerScope !== 'prospect-100') ||
    searchMode === 'player' ||
    scopedPlayerCount > 0
  const rateLimited = ebayRateLimitMessage(error)
  const browseCacheHours = Math.round((ebayStatus?.cache?.fixedPriceTtlSeconds ?? 0) / 3600)
  const browseCacheLabel =
    ebayStatus?.cache?.enabled && browseCacheHours > 0
      ? `${browseCacheHours}h Browse cache`
      : ebayStatus?.cache?.enabled
        ? 'Browse cache on'
        : 'Browse cache off'
  const busy = loading || auctionLoading
  const canScan = configured && setCount > 0 && hasPlayerUniverse && hasFocus && hasTargetQueue && !busy && !modelLoading
  const canScanBaseAutos = configured && setCount > 0 && hasPlayerUniverse && hasTargetQueue && !busy && !modelLoading
  const canScanLowSerial = configured && setCount > 0 && hasPlayerUniverse && valuePlayerCount > 0 && !busy && !modelLoading
  const canScanSuperfractors = configured && setCount > 0 && hasPlayerUniverse && !busy && !modelLoading
  const canScanValueTargets = configured && setCount > 0 && hasPlayerUniverse && valuePlayerCount > 0 && !busy && !modelLoading
  const canScanTopProspects = configured && setCount > 0 && hasPlayerUniverse && prospectPlayerCount > 0 && !busy && !modelLoading
  const queueWaitingLabel =
    playerScope === 'value-25' ? 'Value board waiting' : playerScope === 'prospect-100' ? 'Top 100 waiting' : 'Target 50 waiting'
  let readinessLabel = 'Ready'
  if (!configured) readinessLabel = 'eBay offline'
  else if (setCount === 0) readinessLabel = 'Model pending'
  else if (!hasPlayerUniverse) readinessLabel = 'Player list needed'
  else if (!hasTargetQueue) readinessLabel = queueWaitingLabel
  else if (!hasFocus) readinessLabel = searchMode === 'player' ? 'Enter player' : 'Enter variation'

  let scanButtonLabel = 'Scan Live Market'
  if (loading || auctionLoading) scanButtonLabel = 'Scanning'
  else if (isBaseAutoMode) scanButtonLabel = 'Scan Base Market'
  else if (isLowSerialMode) scanButtonLabel = 'Scan Low Serial'
  else if (isSuperfractorMode) scanButtonLabel = 'Scan Superfractors'
  else if (modelLoading) scanButtonLabel = 'Model loading'
  else if (rateLimited && !scan) scanButtonLabel = 'Retry Scan'
  else if (!configured) scanButtonLabel = 'eBay offline'
  else if (setCount === 0 || !hasPlayerUniverse) scanButtonLabel = 'Player list needed'
  else if (!hasTargetQueue) scanButtonLabel = queueWaitingLabel
  else if (!hasFocus) scanButtonLabel = searchMode === 'player' ? 'Enter player' : 'Enter variation'
  const auctionButtonLabel = auctionLoading ? 'Scanning auctions' : modelLoading ? 'Model loading' : configured ? 'Auctions only' : 'eBay offline'
  const focusPlaceholder = searchMode === 'player' ? 'Eli Willits' : 'Select variation'
  const scopeLabel =
    playerScope === 'value-25'
      ? selectedModelKey === BIN_ALL_MODELS_KEY
        ? `Value board total (${valuePlayerCount.toLocaleString()} players)`
        : `Value board (${valuePlayerCount.toLocaleString()} players)`
      : playerScope === 'prospect-100'
        ? `Top 100 prospects (${prospectPlayerCount.toLocaleString()} players)`
      : playerScope === 'target-50'
      ? selectedModelKey === BIN_ALL_MODELS_KEY
        ? `Target 50 per checklist (${targetPlayerCount.toLocaleString()} players)`
        : `Target 50 (${targetPlayerCount.toLocaleString()} players)`
      : playerScope === 'top-40'
        ? selectedModelKey === BIN_ALL_MODELS_KEY
          ? 'Top 40 per checklist'
          : 'Top 40 by base'
        : `${playerCount.toLocaleString()} players`
  const scanCopy =
    searchMode === 'player'
      ? trimmedSearchTerm
        ? `Searching checklist matches for "${trimmedSearchTerm}".`
        : 'Type a player name to rank that player only.'
      : isBaseAutoMode
        ? `Scanning true base chrome autos across ${selectedSetLabel}; parallel/color terms are rejected.`
      : isLowSerialMode
        ? `Scanning 1st Bowman non-auto parallels numbered /99 and lower across ${selectedSetLabel}; results require exact sold-lane support.`
      : isSuperfractorMode
        ? `Scanning Bowman Superfractors and Bowman /1 listings across ${selectedSetLabel}; release/year text is not required.`
      : searchMode === 'variation'
        ? selectedVariationOption
          ? `Scanning ${selectedVariationOption.label} listings across ${selectedSetLabel}.`
          : hasStructuredVariationOptions
            ? 'Choose one modeled variation lane to keep the scan structured.'
            : 'Variation lanes are loading for this set.'
        : `${scopeLabel} queued across ${selectedSetLabel}.`

  return (
    <section className="bin-radar">
      <div className="bin-radar-header">
        <div className="section-title">
          <Radio size={18} />
          <div>
            <h2>Live Deal Scanner</h2>
            <span>{selectedSetLabel} active listings compared against modeled value</span>
          </div>
        </div>
        <div className="bin-radar-pills">
          <span className={configured ? 'connected' : 'offline'}>
            {configured ? <Wifi size={14} /> : <WifiOff size={14} />}
            {configured ? 'eBay + Fanatics' : 'eBay keys needed'}
          </span>
          {configured ? <span className={ebayStatus?.cache?.enabled ? 'connected' : 'offline'}>{browseCacheLabel}</span> : null}
          <span className={hasPlayerUniverse ? 'connected' : 'offline'}>{readinessLabel}</span>
          <span>Raw + 9+ slabs</span>
          <span>{selectedSetPill}</span>
          <span>{playerCount.toLocaleString()} players</span>
          <span>
            {searchMode === 'checklist'
              ? 'Checklist scan'
              : isBaseAutoMode
                ? 'Base auto scan'
                : isLowSerialMode
                  ? 'Low serial scan'
                  : isSuperfractorMode
                    ? 'Superfractor scan'
                    : `${searchMode}: ${trimmedSearchTerm || 'focus needed'}`}
          </span>
          <span>{listingCount.toLocaleString()} BINs</span>
          {visibleMarketplaceCounts.map((provider) => (
            <span key={provider.label}>
              {provider.label}: {provider.count.toLocaleString()}
            </span>
          ))}
          <span>{auctionListingCount.toLocaleString()} auctions</span>
          {hiddenListingCount > 0 ? <span>{hiddenListingCount.toLocaleString()} hidden rejects</span> : null}
          <span>{scan ? `${opportunities.length.toLocaleString()} candidates` : 'No scan yet'}</span>
          {latestFetchedAt ? <span>Scanned {latestFetchedAt}</span> : null}
        </div>
      </div>

      <div className="bin-preset-head">
        <div>
          <span>Recommended</span>
          <strong>Scan the strongest value signals first</strong>
          <small>Checks active BINs and auctions for the 25 best rank-to-price gaps.</small>
        </div>
      </div>
      <div className="bin-preset-strip" aria-label="High value scan presets">
        <button className="preset-scan-card primary-preset" type="button" onClick={onScanValueTargets} disabled={!canScanValueTargets}>
          <Brain size={17} />
          <span>
            <strong>Scan top values</strong>
            <small>{valuePlayerCount.toLocaleString()} ranked targets</small>
          </span>
        </button>
        <button className="preset-scan-card" type="button" onClick={onScanTopProspects} disabled={!canScanTopProspects}>
          <BookOpenCheck size={17} />
          <span>
            <strong>Top 100 prospects</strong>
            <small>rank-first scan</small>
          </span>
        </button>
        <button className="preset-scan-card" type="button" onClick={onScanBaseAutos} disabled={!canScanBaseAutos}>
          <Database size={17} />
          <span>
            <strong>Base autos</strong>
            <small>sharpest model lane</small>
          </span>
        </button>
        <button className="preset-scan-card" type="button" onClick={onScanLowSerial} disabled={!canScanLowSerial}>
          <Sigma size={17} />
          <span>
            <strong>Low serial</strong>
            <small>/99 and lower only</small>
          </span>
        </button>
        <button className="preset-scan-card" type="button" onClick={onScanSuperfractors} disabled={!canScanSuperfractors}>
          <Gem size={17} />
          <span>
            <strong>Superfractors</strong>
            <small>Bowman /1 watch</small>
          </span>
        </button>
      </div>

      <details className="bin-advanced-controls">
        <summary>
          <span>
            <SlidersHorizontal size={16} />
            Build a custom scan
          </span>
          <small>Choose a set, player, parallel, or price rule</small>
        </summary>
      <div className="bin-control-board" aria-label="Custom live-market scan setup">
        <div className="bin-control-group">
          <div className="bin-control-group-head">
            <span>1 / Market</span>
            <strong>Choose the board</strong>
          </div>
          <div className="bin-control-row">
            <label className="bin-control stacked release-control">
              <span>Set</span>
              <select value={selectedModelKey} onChange={(event) => onModelChange(event.target.value)} disabled={modelOptions.length === 0}>
                <option value={BIN_ALL_MODELS_KEY}>All loaded checklists</option>
                {modelOptions.map((option) => (
                  <option value={checklistModelKey(option)} key={checklistModelKey(option)}>
                    {checklistModelLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="bin-control stacked">
              <span>Players</span>
              <select value={playerScope} onChange={(event) => onPlayerScopeChange(event.target.value as BinPlayerScope)}>
                <option value="all">{selectedModelKey === BIN_ALL_MODELS_KEY ? 'All checklist players' : 'Full checklist'}</option>
                <option value="prospect-100">Top 100 prospects</option>
                <option value="value-25">{selectedModelKey === BIN_ALL_MODELS_KEY ? 'Value board total' : 'Value board'}</option>
                <option value="top-40">{selectedModelKey === BIN_ALL_MODELS_KEY ? 'Top 40 per checklist' : 'Top 40 by base'}</option>
                <option value="target-50">{selectedModelKey === BIN_ALL_MODELS_KEY ? 'Target 50 per checklist' : 'Target 50 model'}</option>
              </select>
            </label>
          </div>
          <div className="bin-control-note">
            <span>{selectedSetPill}</span>
            <span>{scopeLabel}</span>
          </div>
        </div>

        <div className="bin-control-group">
          <div className="bin-control-group-head">
            <span>2 / Focus</span>
            <strong>Pick scan type</strong>
          </div>
          <div className="bin-control-row">
            <label className="bin-control stacked">
              <span>Mode</span>
              <select value={searchMode} onChange={(event) => onSearchModeChange(event.target.value as BinSearchMode)}>
                <option value="checklist">Full checklist</option>
                <option value="base-auto">Base autos</option>
                <option value="low-serial-non-auto">Low serial non-auto</option>
                <option value="superfractor">Superfractor /1</option>
                <option value="player">Single player</option>
                <option value="variation">Variation</option>
              </select>
            </label>
            {requiresFocus ? (
              <label className="bin-control stacked focus">
                <span>{searchMode === 'player' ? 'Player' : 'Variation'}</span>
                {searchMode === 'variation' ? (
                  <select
                    aria-label="Variation"
                    value={selectedVariationOption?.label ?? ''}
                    onChange={(event) => onSearchTermChange(event.target.value)}
                    disabled={!hasStructuredVariationOptions}
                  >
                    <option value="">{focusPlaceholder}</option>
                    {variationOptions.map((option) => (
                      <option value={option.label} key={option.key}>
                        {option.label}{option.detail ? ` - ${option.detail}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="bin-field-line">
                    <Search size={15} />
                    <input
                      aria-label="Player search"
                      placeholder={focusPlaceholder}
                      value={searchTerm}
                      onChange={(event) => onSearchTermChange(event.target.value)}
                    />
                  </div>
                )}
              </label>
            ) : (
              <div className="bin-control stacked bin-focus-placeholder">
                <span>Focus</span>
                <strong>
                  {isBaseAutoMode
                    ? 'Base autos only'
                    : isLowSerialMode
                      ? 'Numbered /99 and lower'
                      : isSuperfractorMode
                        ? 'Bowman /1 watch'
                        : 'Whole board'}
                </strong>
              </div>
            )}
          </div>
          <div className="bin-control-note">
            <span>{scanCopy}</span>
          </div>
        </div>

        <div className="bin-control-group compact">
          <div className="bin-control-group-head">
            <span>3 / Rules</span>
            <strong>Price filters</strong>
          </div>
          <div className="bin-control-row">
            <label className="bin-control stacked">
              <span>Min BIN</span>
              <input
                aria-label="Minimum BIN price"
                min="0"
                step="5"
                type="number"
                value={minPrice}
                onChange={(event) => onMinPriceChange(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>
            <label className="bin-control stacked result-sort-control">
              <span>Sort</span>
              <select value={resultSort} onChange={(event) => onResultSortChange(event.target.value as BinResultSort)}>
                {Object.entries(BIN_RESULT_SORT_LABELS).map(([sort, label]) => (
                  <option value={sort} key={sort}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="bin-control-note">
            <span>Includes raw and graded 9+ when the ask clears the model window.</span>
          </div>
        </div>

        <div className="bin-control-group action">
          <div className="bin-control-group-head">
            <span>4 / Run</span>
            <strong>{readinessLabel}</strong>
          </div>
          <div className="bin-action-stack">
            <button className="primary-button bin-scan-button" type="button" onClick={onScan} disabled={!canScan}>
              <RefreshCw size={16} className={loading || auctionLoading ? 'spin' : undefined} />
              {scanButtonLabel}
            </button>
            <button className="ghost-button value-scan-button" type="button" onClick={onScanAuctions} disabled={!canScan}>
              <Activity size={16} className={auctionLoading ? 'spin' : undefined} />
              {auctionButtonLabel}
            </button>
          </div>
          {scan ? (
            <div className="bin-scan-stats">
              <strong>{scan.stats.queriesSucceeded.toLocaleString()}</strong>
              <span>
                queries / {scan.stats.upstreamPagesFetched.toLocaleString()} live pages /{' '}
                {scan.stats.cacheHits.toLocaleString()} cached /{' '}
                {scan.stats.rejectedPlayerMismatches.toLocaleString()} rejects
              </span>
            </div>
          ) : (
            <div className="bin-control-note">
              <span>Fresh scan snapshots expire automatically.</span>
            </div>
          )}
        </div>
      </div>
      </details>

      <div ref={resultsRef} className="bin-results-anchor" tabIndex={-1} aria-label="Scan results" />

      {error ? (
        <div className="bin-radar-alert">
          <ShieldCheck size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {auctionError ? (
        <div className="bin-radar-alert">
          <ShieldCheck size={16} />
          <span>{auctionError}</span>
        </div>
      ) : null}

      {lastRejectedListing ? (
        <div className="bin-radar-alert bin-radar-alert-success">
          <Ban size={16} />
          <span>
            Rejected: {lastRejectedListing.playerName || 'listing'}{lastRejectedListing.title ? ` / ${lastRejectedListing.title}` : ''}
          </span>
          <button className="inline-undo-button" type="button" onClick={onUndoRejectListing}>
            <Undo2 size={14} />
            Undo
          </button>
        </div>
      ) : hiddenListingCount > 0 ? (
        <div className="bin-radar-alert bin-radar-alert-muted">
          <Ban size={16} />
          <span>{hiddenListingCount.toLocaleString()} rejected listing{hiddenListingCount === 1 ? '' : 's'} hidden from this view.</span>
        </div>
      ) : null}

      {setCount === 0 ? (
        <div className="bin-empty-state">
          <Database size={24} />
          <div>
            <strong>Checklist models are loading.</strong>
            <span>Pricing comes first; market scan unlocks after the model is on the board.</span>
          </div>
        </div>
      ) : !configured ? (
        <div className="bin-empty-state">
          <KeyRound size={24} />
          <div>
            <strong>eBay production keys are missing.</strong>
            <span>Browse API access is required before live BINs can be priced.</span>
          </div>
        </div>
      ) : !hasPlayerUniverse ? (
        <div className="bin-empty-state">
          <Database size={24} />
          <div>
            <strong>Checklist player list is not loaded.</strong>
            <span>Public multiples are present, but BIN scanning needs checklist player names for the selected set scope.</span>
          </div>
        </div>
      ) : error && !scan ? (
        <div className={`bin-empty-state ${rateLimited ? 'muted' : 'blocked'}`}>
          <ShieldCheck size={24} />
          <div>
            <strong>{rateLimited ? 'eBay asked us to cool down.' : 'Scan did not complete.'}</strong>
            <span>
              {rateLimited
                ? 'Wait about a minute, then retry this player or switch to a smaller scan scope.'
                : 'Adjust the scan and retry when ready.'}
            </span>
          </div>
        </div>
      ) : !scan ? (
        <div className="bin-empty-state ready">
          <Radio size={24} />
          <div>
            <strong>Ready to scan active BINs.</strong>
            <span>{scanCopy}</span>
          </div>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="bin-empty-state muted">
          <Radio size={24} />
          <div>
            <strong>No BINs cleared the model window.</strong>
            <span>
              {listingCount.toLocaleString()} active listings reviewed; none were priced at or within {LIVE_MODEL_WINDOW_LABEL} above modeled value.
            </span>
          </div>
        </div>
      ) : (
        <div className="bin-opportunity-list">
          <div className="bin-opportunity-head">
            <span>Rank</span>
            <span>Listing</span>
            <span>All In</span>
            <span>Model</span>
            <span>Spread</span>
            <span>Signal</span>
          </div>
          {opportunities.map((opportunity, index) => {
            const sts = opportunityStsContext(opportunity)
            const convictionScore = binConvictionScore(opportunity, sts)
            const gradingLabel = listingGradingLabel(opportunity.listing)
            return (
              <article className={`bin-opportunity-row lane-${opportunity.lane}`} key={opportunity.listing.id}>
                <div className="bin-rank-cell">
                  <strong>#{index + 1}</strong>
                  <span>{opportunity.grade}</span>
                </div>
                <div className="bin-listing-cell">
                  <strong>{opportunity.listing.playerName}</strong>
                  <span>{opportunity.listing.title}</span>
                  <div className="bin-evidence-strip">
                    <small>{opportunity.matchedVariation ?? opportunity.listing.variationLabel}</small>
                    <small className="conviction-chip">Conviction {convictionScore}</small>
                    <small className={opportunity.trustScore >= 72 ? 'trust-chip good' : opportunity.trustScore >= 58 ? 'trust-chip' : 'trust-chip warning'}>
                      Trust {opportunity.trustScore}
                    </small>
                    {gradingLabel ? (
                      <>
                        <small className="graded-chip">
                          {gradingLabel} {formatMultiplier(opportunity.gradingMultiplier ?? 1)} model
                        </small>
                        <small className="graded-chip">Raw floor {money(opportunity.rawFairValue)}</small>
                      </>
                    ) : null}
                    {searchMode === 'variation' && trimmedSearchTerm ? <small>Title hit: {trimmedSearchTerm}</small> : null}
                    <small>{formatModelSource(opportunity.valuationSource)}</small>
                    {opportunity.compSaleCount ? (
                      <small className="sold-lane-chip">
                        {opportunity.compSaleCount.toLocaleString()} sold lane
                      </small>
                    ) : null}
                    {opportunity.compLast5Avg ? (
                      <small className={typeof opportunity.compAskVsLast5Pct === 'number' && opportunity.compAskVsLast5Pct <= 0 ? 'sold-lane-chip good' : 'sold-lane-chip'}>
                        Last 5 {money(opportunity.compLast5Avg)}
                        {typeof opportunity.compAskVsLast5Pct === 'number' ? ` / ${percent(opportunity.compAskVsLast5Pct)}` : ''}
                      </small>
                    ) : opportunity.compTrailingModel ? (
                      <small className="sold-lane-chip">Comp rail {money(opportunity.compTrailingModel)}</small>
                    ) : null}
                    {sts.ranking ? (
                      <>
                        {sts.primaryRankLabel ? <small className="sts-chip">{sts.primaryRankLabel}</small> : null}
                        {sts.prospectRank && sts.rank ? <small className="sts-chip">Overall #{sts.rank.toLocaleString()}</small> : null}
                        {sts.change30d !== null ? (
                          <small className={`sts-chip ${changeClassName(sts.change30d)}`}>30D {formatSigned(sts.change30d)}</small>
                        ) : null}
                      </>
                    ) : (
                      <small className="warning">Unranked</small>
                    )}
                    {opportunity.warnings[0] ? <small className="warning">{opportunity.warnings[0]}</small> : null}
                  </div>
                </div>
                <div className="bin-money-cell">
                  <strong>{money(opportunity.listing.allInPrice)}</strong>
                  <span>BIN + ship</span>
                </div>
                <div className="bin-money-cell">
                  <strong>{money(opportunity.fairValue)}</strong>
                  <span>
                    {formatModelSource(opportunity.valuationSource)}
                    {opportunity.gradingNote ? ` / ${opportunity.gradingNote}` : ''}
                  </span>
                </div>
                <div className={`bin-money-cell ${opportunity.edgeDollars >= 0 ? 'edge' : 'near-model'}`}>
                  <strong>{money(opportunity.edgeDollars)}</strong>
                  <span>{percent(opportunity.expectedRoiPct)} model edge</span>
                </div>
                <div className="bin-signal-cell">
                  <span>{opportunity.action}</span>
                  {opportunity.listing.listingUrl ? (
                    <a href={opportunity.listing.listingUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} />
                      {listingMarketplaceLabel(opportunity.listing)}
                    </a>
                  ) : null}
                  <button
                    className="listing-reject-button"
                    type="button"
                    onClick={() => onRejectListing(opportunity)}
                    title="Hide this incorrect listing from future BIN runs"
                  >
                    <Ban size={14} />
                    Reject
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {auctionScan || auctionLoading || auctionError ? (
        <div className="market-radar-subsection">
          <div className="market-radar-subsection-head">
            <div>
              <span>Ending Soon</span>
              <strong>24h Auction Radar</strong>
              <small>Same filters, only live auctions closing within 24 hours and inside the {LIVE_MODEL_WINDOW_LABEL} model window.</small>
            </div>
            <div className="bin-radar-pills">
              <span>{auctionListingCount.toLocaleString()} auctions</span>
              <span>{auctionScan ? `${auctionOpportunities.length.toLocaleString()} inside window` : auctionLoading ? 'Scanning' : 'No scan yet'}</span>
              {auctionScan?.fetchedAt ? <span>Scanned {new Date(auctionScan.fetchedAt).toLocaleTimeString()}</span> : null}
            </div>
          </div>

          {auctionLoading && !auctionScan ? (
            <div className="bin-empty-state ready compact-empty">
              <Activity size={22} />
              <div>
                <strong>Scanning ending-soon auctions.</strong>
                <span>Keeping only active auctions with current all-in no more than {LIVE_MODEL_WINDOW_LABEL} above modeled value.</span>
              </div>
            </div>
          ) : auctionScan && auctionOpportunities.length === 0 ? (
            <div className="bin-empty-state muted compact-empty">
              <Activity size={22} />
              <div>
                <strong>No urgent auctions cleared the model window.</strong>
                <span>
                  {auctionListingCount.toLocaleString()} auctions reviewed; none were active, inside 24h, and within {LIVE_MODEL_WINDOW_LABEL} above modeled
                  value.
                </span>
              </div>
            </div>
          ) : auctionOpportunities.length > 0 ? (
            <div className="bin-opportunity-list compact-list">
              <div className="bin-opportunity-head auction-head">
                <span>Rank</span>
                <span>Auction</span>
                <span>Current</span>
                <span>Model</span>
                <span>Ends</span>
                <span>Signal</span>
              </div>
              {auctionOpportunities.map((opportunity, index) => {
                const sts = opportunityStsContext(opportunity)
                const convictionScore = binConvictionScore(opportunity, sts)
                const gradingLabel = listingGradingLabel(opportunity.listing)
                const hoursToClose = opportunity.listing.hoursToClose
                return (
                  <article className={`bin-opportunity-row lane-${opportunity.lane}`} key={`auction:${opportunity.listing.id}`}>
                    <div className="bin-rank-cell">
                      <strong>#{index + 1}</strong>
                      <span>{opportunity.grade}</span>
                    </div>
                    <div className="bin-listing-cell">
                      <strong>{opportunity.listing.playerName}</strong>
                      <span>{opportunity.listing.title}</span>
                      <div className="bin-evidence-strip">
                        <small>{opportunity.matchedVariation ?? opportunity.listing.variationLabel}</small>
                        <small className="conviction-chip">Conviction {convictionScore}</small>
                        <small>{opportunity.listing.bidCount.toLocaleString()} bid{opportunity.listing.bidCount === 1 ? '' : 's'}</small>
                        {opportunity.compSaleCount ? <small className="sold-lane-chip">{opportunity.compSaleCount.toLocaleString()} sold lane</small> : null}
                        {opportunity.compTrailingModel ? <small className="sold-lane-chip">Comp rail {money(opportunity.compTrailingModel)}</small> : null}
                        {gradingLabel ? <small className="graded-chip">{gradingLabel}</small> : null}
                        {sts.ranking ? (
                          <>
                            {sts.primaryRankLabel ? <small className="sts-chip">{sts.primaryRankLabel}</small> : null}
                            {sts.change30d !== null && sts.momentumScore !== null ? (
                              <small className="sts-chip">Trend {sts.momentumScore.toFixed(1)}</small>
                            ) : null}
                          </>
                        ) : (
                          <small className="warning">Unranked</small>
                        )}
                        {opportunity.warnings[0] ? <small className="warning">{opportunity.warnings[0]}</small> : null}
                      </div>
                    </div>
                    <div className="bin-money-cell">
                      <strong>{money(opportunity.listing.allInPrice)}</strong>
                      <span>{auctionBidShipLabel(opportunity.listing)}</span>
                    </div>
                    <div className="bin-money-cell">
                      <strong>{money(opportunity.fairValue)}</strong>
                      <span>{formatModelSource(opportunity.valuationSource)}</span>
                    </div>
                    <div className="bin-money-cell edge">
                      <strong>{closeTimeLabel(hoursToClose)}</strong>
                      <span>{money(opportunity.edgeDollars)} spread</span>
                    </div>
                    <div className="bin-signal-cell">
                      <span>{opportunity.action === 'Pass' ? 'Watchlist' : opportunity.action}</span>
                      {opportunity.listing.listingUrl ? (
                        <a href={opportunity.listing.listingUrl} target="_blank" rel="noreferrer">
                          <ExternalLink size={14} />
                          {listingMarketplaceLabel(opportunity.listing)}
                        </a>
                      ) : null}
                      <button
                        className="listing-reject-button"
                        type="button"
                        onClick={() => onRejectListing(opportunity)}
                        title="Hide this incorrect listing from future auction runs"
                      >
                        <Ban size={14} />
                        Reject
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function LiveMarketMap({
  binOpportunities,
  auctionOpportunities,
  binScan,
  auctionScan,
  cachedObservedAt,
  compact = false,
}: {
  binOpportunities: Opportunity[]
  auctionOpportunities: Opportunity[]
  binScan: EbayBinScanResult | null
  auctionScan: EbayBinScanResult | null
  cachedObservedAt?: string | null
  compact?: boolean
}) {
  const dots = [
    ...binOpportunities.map((opportunity) => ({ opportunity, type: 'BIN' as const })),
    ...auctionOpportunities.map((opportunity) => ({ opportunity, type: 'Auction' as const })),
  ]
    .filter(({ opportunity }) => opportunity.fairValue > 0 && opportunity.listing.allInPrice > 0)
    .sort((left, right) => right.opportunity.edgeDollars - left.opportunity.edgeDollars)
    .slice(0, 140)
  const hasScanned = Boolean(binScan || auctionScan || cachedObservedAt)
  const latestScanTime = [binScan?.fetchedAt, auctionScan?.fetchedAt, cachedObservedAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0]
  const latestLabel = latestScanTime ? new Date(latestScanTime).toLocaleTimeString() : 'No scan yet'
  const priceValues = dots.flatMap(({ opportunity }) => [opportunity.listing.allInPrice, opportunity.fairValue]).filter((price) => price > 0)
  const minPrice = Math.max(1, priceValues.length ? Math.min(...priceValues) * 0.82 : 1)
  const maxPrice = Math.max(minPrice * 1.4, priceValues.length ? Math.max(...priceValues) * 1.18 : 100)
  const lowLog = Math.log(minPrice)
  const highLog = Math.log(maxPrice)
  const chart = compact
    ? { width: 760, height: 470, left: 64, right: 28, top: 34, bottom: 62 }
    : { width: 760, height: 270, left: 58, right: 24, top: 20, bottom: 42 }
  const xPrice = (price: number) =>
    chart.left + ((Math.log(Math.max(1, price)) - lowLog) / Math.max(0.001, highLog - lowLog)) * (chart.width - chart.left - chart.right)
  const yPrice = (price: number) =>
    chart.top +
    (1 - (Math.log(Math.max(1, price)) - lowLog) / Math.max(0.001, highLog - lowLog)) * (chart.height - chart.top - chart.bottom)
  const ticks = [25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000].filter((tick) => tick >= minPrice && tick <= maxPrice)
  const activeBuyDots = dots.filter(({ opportunity }) => opportunity.edgeDollars >= 0)
  const liveMarketplaceCounts = marketplaceCountsFromOpportunities(dots.map(({ opportunity }) => opportunity))
  const mobileOpportunityRows = (activeBuyDots.length ? activeBuyDots : dots).slice(0, 10)
  const liveLineDots = [...activeBuyDots]
    .sort(
      (left, right) =>
        left.opportunity.listing.allInPrice - right.opportunity.listing.allInPrice ||
        left.opportunity.fairValue - right.opportunity.fairValue,
    )
    .slice(0, 80)
  const liveLinePoints = liveLineDots
    .map(({ opportunity }) => `${xPrice(opportunity.listing.allInPrice).toFixed(1)},${yPrice(opportunity.fairValue).toFixed(1)}`)
    .join(' ')
  const best = dots[0]?.opportunity ?? null
  const medianBuySpread = medianValue(activeBuyDots.map(({ opportunity }) => opportunity.edgeDollars).filter((spread) => spread >= 0))
  const medianBuyRoi = medianValue(activeBuyDots.map(({ opportunity }) => opportunity.expectedRoiPct).filter((roiPct) => roiPct >= 0))
  const bestPlayerName = best?.listing.playerName ?? ''
  const [focusCompModels, setFocusCompModels] = useState<Record<string, SalesCachePlayerModel>>({})
  const [focusCompErrors, setFocusCompErrors] = useState<Record<string, string>>({})
  const [hoveredDot, setHoveredDot] = useState<{
    x: number
    y: number
    opportunity: Opportunity
    type: 'BIN' | 'Auction'
    rank: number
  } | null>(null)
  const focusCompModel = bestPlayerName ? focusCompModels[bestPlayerName] ?? null : null
  const focusCompError = bestPlayerName ? focusCompErrors[bestPlayerName] ?? '' : ''
  const focusCompLoading = Boolean(bestPlayerName && !focusCompModel && !focusCompError)

  useEffect(() => {
    if (!bestPlayerName || focusCompModels[bestPlayerName] || focusCompErrors[bestPlayerName]) return

    const controller = new AbortController()
    fetchSalesCachePlayer(bestPlayerName, controller.signal)
      .then((model) => {
        setFocusCompModels((current) => ({ ...current, [bestPlayerName]: model }))
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setFocusCompErrors((current) => ({
          ...current,
          [bestPlayerName]: error instanceof Error ? error.message : 'Could not load sold comps',
        }))
      })

    return () => controller.abort()
  }, [bestPlayerName, focusCompErrors, focusCompModels])

  const bestCompCheck = liveCompCheckForOpportunity(best, focusCompModel)
  const compVerdict = liveCompVerdict(best, bestCompCheck)
  const last5WithinChart = Boolean(bestCompCheck?.last5Avg && bestCompCheck.last5Avg >= minPrice && bestCompCheck.last5Avg <= maxPrice)
  const compCheckedDots = dots
    .filter(({ opportunity }) => normalizeLiveCompText(opportunity.listing.playerName) === normalizeLiveCompText(bestPlayerName))
    .map(({ opportunity }) => ({ opportunity, comp: liveCompCheckForOpportunity(opportunity, focusCompModel) }))
  const compBackedCount = compCheckedDots.filter(({ opportunity, comp }) => comp?.last5Avg && opportunity.listing.allInPrice <= comp.last5Avg).length
  const plottedDots = dots.map(({ opportunity, type }, index) => {
    const x = xPrice(opportunity.listing.allInPrice)
    const y = yPrice(opportunity.fairValue)
    return {
      opportunity,
      type,
      rank: index + 1,
      x,
      y,
      radius: 4.2 + Math.min(7, Math.max(0, opportunity.edgeDollars) / Math.max(250, maxPrice * 0.08)),
    }
  })
  const topDot = plottedDots[0] ?? null
  const activeDetailDot = hoveredDot ?? (topDot ? { ...topDot, rank: topDot.rank } : null)
  const showHoveredDot = (dot: (typeof plottedDots)[number]) => {
    setHoveredDot({ x: dot.x, y: dot.y, opportunity: dot.opportunity, type: dot.type, rank: dot.rank })
  }
  const selectChartDot = (event: ReactMouseEvent<HTMLAnchorElement>, dot: (typeof plottedDots)[number]) => {
    const isTouchLike = typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches
    if (!isTouchLike) return
    event.preventDefault()
    showHoveredDot(dot)
  }
  const showNearestChartDot = (target: SVGSVGElement, clientX: number, clientY: number) => {
    if (!plottedDots.length) return
    const rect = target.getBoundingClientRect()
    const pointerX = ((clientX - rect.left) / Math.max(1, rect.width)) * chart.width
    const pointerY = ((clientY - rect.top) / Math.max(1, rect.height)) * chart.height
    let nearestDot: (typeof plottedDots)[number] | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const dot of plottedDots) {
      const distance = Math.hypot(pointerX - dot.x, pointerY - dot.y)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestDot = dot
      }
    }

    if (nearestDot && nearestDistance <= 24) {
      setHoveredDot((current) =>
        current?.opportunity.listing.id === nearestDot.opportunity.listing.id && current.rank === nearestDot.rank
          ? current
          : { x: nearestDot.x, y: nearestDot.y, opportunity: nearestDot.opportunity, type: nearestDot.type, rank: nearestDot.rank },
      )
    } else {
      setHoveredDot(null)
    }
  }
  const handleChartPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    showNearestChartDot(event.currentTarget, event.clientX, event.clientY)
  }
  const handleChartMouseMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    showNearestChartDot(event.currentTarget, event.clientX, event.clientY)
  }

  return (
    <section className={`live-market-map ${compact ? 'compact' : ''} ${dots.length ? 'has-dots' : 'no-dots'}`} aria-label="Live market opportunity map">
      <div className="live-market-map-head">
        <div>
          <span>{compact ? 'Scan Chart' : 'Live Market Map'}</span>
          <h2>
            {compact
              ? activeBuyDots.length
                ? `${activeBuyDots.length.toLocaleString()} buying windows`
                : `${dots.length.toLocaleString()} live listings`
              : `${dots.length.toLocaleString()} live dots vs model`}
          </h2>
          <small>
            {compact
              ? 'Ranked by all-in price against modeled value.'
              : 'Green dots above the fair-value line are active buying opportunities; focus card checks the top dot against recent sold comps.'}
          </small>
        </div>
        <div className="live-market-map-kpis">
          <span>{activeBuyDots.length.toLocaleString()} buy dots</span>
          {activeBuyDots.length ? <span>Median edge {money(medianBuySpread)} / {percent(medianBuyRoi)}</span> : null}
          <span>{binOpportunities.length.toLocaleString()} BINs</span>
          {liveMarketplaceCounts.map((provider) => (
            <span key={provider.label}>
              {provider.label}: {provider.count.toLocaleString()}
            </span>
          ))}
          <span>{auctionOpportunities.length.toLocaleString()} auctions</span>
          {focusCompModel?.available ? <span>{compBackedCount.toLocaleString()} comp-backed</span> : null}
          <span>Updated {latestLabel}</span>
        </div>
      </div>

      {!hasScanned ? (
        <div className="bin-empty-state ready live-map-empty">
          <Radio size={24} />
          <div>
            <strong>Run a BIN or auction scan to light up the market map.</strong>
            <span>Each fresh scan is cached briefly, scored against the model, and kept separate from permanent sold comps.</span>
          </div>
        </div>
      ) : dots.length === 0 ? (
        <div className="bin-empty-state muted live-map-empty">
          <Activity size={24} />
          <div>
            <strong>No priced opportunities cleared the current model window.</strong>
            <span>Try a player focus, variation focus, or lower minimum price.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="live-mobile-opportunity-list" aria-label="Ranked live buying windows">
            <div className="live-mobile-opportunity-head">
              <span>Best live values</span>
              <strong>{mobileOpportunityRows.length.toLocaleString()} ranked</strong>
            </div>
            {mobileOpportunityRows.map(({ opportunity, type }, index) => (
              <a
                className={`live-mobile-opportunity-row lane-${opportunity.lane}`}
                href={opportunity.listing.listingUrl || undefined}
                target="_blank"
                rel="noreferrer"
                key={`mobile-live:${type}:${opportunity.listing.id}:${index}`}
              >
                <span className="live-mobile-rank">#{index + 1}</span>
                <span className="live-mobile-copy">
                  <strong>{opportunity.listing.playerName}</strong>
                  <small>{opportunity.listing.title}</small>
                  <em>
                    {type} / {opportunity.matchedVariation ?? opportunity.listing.variationLabel}
                  </em>
                </span>
                <span className="live-mobile-money">
                  <strong>{money(opportunity.edgeDollars)}</strong>
                  <small>edge</small>
                </span>
                <span className="live-mobile-metrics">
                  <b>{money(opportunity.listing.allInPrice)}</b>
                  <small>ask</small>
                  <b>{money(opportunity.fairValue)}</b>
                  <small>model</small>
                  <b>{percent(opportunity.expectedRoiPct)}</b>
                  <small>Model edge</small>
                </span>
              </a>
            ))}
          </div>

          <div className="live-map-grid">
          <div className="live-map-chart-shell">
            <div className="live-map-chart-wrap">
              <div className="live-map-axis-copy">
                <span>X: all-in listing price</span>
                <span>Y: modeled value</span>
              </div>
              <svg
                className="live-opportunity-chart"
                viewBox={`0 0 ${chart.width} ${chart.height}`}
                role="img"
                aria-label="Live listings plotted by all-in price on the horizontal axis and model value on the vertical axis"
                onPointerMove={handleChartPointerMove}
                onMouseMove={handleChartMouseMove}
                onPointerLeave={() => setHoveredDot(null)}
                onMouseLeave={() => setHoveredDot(null)}
              >
            <rect
              x={chart.left}
              y={chart.top}
              width={chart.width - chart.left - chart.right}
              height={chart.height - chart.top - chart.bottom}
              rx="8"
            />
            <polygon
              className="live-map-buy-zone"
              points={`${chart.left},${chart.top} ${chart.width - chart.right},${chart.top} ${chart.left},${chart.height - chart.bottom}`}
            />
            <polygon
              className="live-map-rich-zone"
              points={`${chart.left},${chart.height - chart.bottom} ${chart.width - chart.right},${chart.top} ${chart.width - chart.right},${chart.height - chart.bottom}`}
            />
            <line
              className="live-map-diagonal"
              x1={xPrice(minPrice)}
              y1={yPrice(minPrice)}
              x2={xPrice(maxPrice)}
              y2={yPrice(maxPrice)}
            />
            <text className="live-map-zone-label buy" x={chart.left + 12} y={chart.top + 18}>
              under model
            </text>
            <text className="live-map-zone-label rich" x={chart.width - chart.right - 12} y={chart.height - chart.bottom - 12}>
              at / above model
            </text>
            <text
              className="live-map-diagonal-label"
              x={chart.width - chart.right - 70}
              y={chart.top + 16}
            >
              fair value line
            </text>
            {last5WithinChart && bestCompCheck?.last5Avg ? (
              <>
                <line
                  className="live-map-comp-line"
                  x1={xPrice(bestCompCheck.last5Avg)}
                  x2={xPrice(bestCompCheck.last5Avg)}
                  y1={chart.top}
                  y2={chart.height - chart.bottom}
                />
                <line
                  className="live-map-comp-line"
                  x1={chart.left}
                  x2={chart.width - chart.right}
                  y1={yPrice(bestCompCheck.last5Avg)}
                  y2={yPrice(bestCompCheck.last5Avg)}
                />
                <text className="live-map-comp-label" x={xPrice(bestCompCheck.last5Avg) + 7} y={chart.top + 14}>
                  last 5 comps
                </text>
              </>
            ) : null}
            {ticks.map((tick) => (
              <g key={`live-map-tick:${tick}`}>
                <line className="live-map-gridline" x1={xPrice(tick)} x2={xPrice(tick)} y1={chart.top} y2={chart.height - chart.bottom} />
                <line className="live-map-gridline" x1={chart.left} x2={chart.width - chart.right} y1={yPrice(tick)} y2={yPrice(tick)} />
                <text className="live-map-x-tick" x={xPrice(tick)} y={chart.height - 14}>
                  {money(tick)}
                </text>
                <text className="live-map-y-tick" x={chart.left - 8} y={yPrice(tick) + 4}>
                  {money(tick)}
                </text>
              </g>
            ))}
            <text className="live-map-axis" x={(chart.width + chart.left - chart.right) / 2} y={chart.height - 1}>
              all-in listing price: ask + shipping / current bid
            </text>
            <text className="live-map-axis y" x={14} y={chart.top + 9}>
              model value
            </text>
            {liveLineDots.length > 1 ? <polyline className="live-map-opportunity-line" points={liveLinePoints} /> : null}
            {plottedDots.map((dot, index) => {
              const { opportunity, type } = dot
              return (
                <g
                  className={`live-map-dot-link ${type === 'Auction' ? 'auction' : 'bin'} ${
                    opportunity.edgeDollars >= 0 ? 'buy-dot' : 'no-edge-dot'
                  } ${index === 0 ? 'top-dot' : ''} ${
                    hoveredDot?.opportunity.listing.id === opportunity.listing.id ? 'hovered' : ''
                  } lane-${opportunity.lane}`}
                  key={`${type}:${opportunity.listing.id}:${index}`}
                  onPointerEnter={() => showHoveredDot(dot)}
                  onPointerLeave={() => setHoveredDot((current) => (current?.opportunity.listing.id === opportunity.listing.id ? null : current))}
                  onMouseEnter={() => showHoveredDot(dot)}
                  onMouseLeave={() => setHoveredDot((current) => (current?.opportunity.listing.id === opportunity.listing.id ? null : current))}
                  onFocus={() => showHoveredDot(dot)}
                  onBlur={() => setHoveredDot((current) => (current?.opportunity.listing.id === opportunity.listing.id ? null : current))}
                >
                  <circle
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.radius}
                    onPointerEnter={() => showHoveredDot(dot)}
                    onMouseEnter={() => showHoveredDot(dot)}
                  />
                  <title>
                    {`${type}: ${opportunity.listing.playerName} / ${money(opportunity.listing.allInPrice)} all-in / ${money(opportunity.fairValue)} model / ${money(opportunity.edgeDollars)} spread`}
                  </title>
                </g>
              )
            })}
            </svg>
              <div className="live-map-hit-layer" aria-label="Interactive live market dots">
                {plottedDots.map((dot) => (
                  <a
                    className={`live-map-hit-dot ${dot.x > chart.width * 0.66 ? 'left' : ''} ${
                      dot.y < chart.height * 0.34 ? 'lower' : ''
                    }`}
                    href={dot.opportunity.listing.listingUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${dot.type} dot ${dot.rank}: ${dot.opportunity.listing.playerName}, ${money(dot.opportunity.listing.allInPrice)} all-in, ${money(dot.opportunity.fairValue)} model, ${money(dot.opportunity.edgeDollars)} spread`}
                    key={`hit:${dot.type}:${dot.opportunity.listing.id}:${dot.rank}`}
                    style={
                      {
                        '--dot-x': `${(dot.x / chart.width) * 100}%`,
                        '--dot-y': `${(dot.y / chart.height) * 100}%`,
                        '--dot-size': `${Math.max(18, dot.radius * 3.2)}px`,
                      } as CSSProperties
                    }
                    onPointerEnter={() => showHoveredDot(dot)}
                    onPointerLeave={() =>
                      setHoveredDot((current) => (current?.opportunity.listing.id === dot.opportunity.listing.id ? null : current))
                    }
                    onMouseEnter={() => showHoveredDot(dot)}
                    onMouseLeave={() =>
                      setHoveredDot((current) => (current?.opportunity.listing.id === dot.opportunity.listing.id ? null : current))
                    }
                    onFocus={() => showHoveredDot(dot)}
                    onBlur={() =>
                      setHoveredDot((current) => (current?.opportunity.listing.id === dot.opportunity.listing.id ? null : current))
                    }
                    onClick={(event) => selectChartDot(event, dot)}
                  >
                    <span className="live-map-hit-target" />
                    <div className={`live-map-hover-card ${dot.x > chart.width * 0.66 ? 'left' : ''} ${dot.y < chart.height * 0.34 ? 'lower' : ''}`}>
                      <span>
                        #{dot.rank} {dot.type} dot
                      </span>
                      <strong>{dot.opportunity.listing.playerName}</strong>
                      <small>{dot.opportunity.listing.title}</small>
                      <div>
                        <b>{money(dot.opportunity.listing.allInPrice)}</b>
                        <em>all in</em>
                      </div>
                      <div>
                        <b>{money(dot.opportunity.fairValue)}</b>
                        <em>model</em>
                      </div>
                      <div className={dot.opportunity.edgeDollars >= 0 ? 'edge' : ''}>
                        <b>{money(dot.opportunity.edgeDollars)}</b>
                        <em>{percent(dot.opportunity.expectedRoiPct)} model edge</em>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
            <div className="live-map-legend" aria-label="Live market map legend">
              <span><i className="buy" />Under model</span>
              <span><i className="auction" />Auction</span>
              <span><i className="comp" />Recent comp check</span>
              <span><i className="top" />Top spread</span>
            </div>
            {activeDetailDot ? (
              <div className="live-map-mobile-detail" aria-live="polite">
                <div>
                  <span>
                    #{activeDetailDot.rank} {activeDetailDot.type} dot
                  </span>
                  <strong>{activeDetailDot.opportunity.listing.playerName}</strong>
                  <small>{activeDetailDot.opportunity.listing.title}</small>
                </div>
                <div className="live-map-mobile-metrics">
                  <span>
                    <small>All in</small>
                    <strong>{money(activeDetailDot.opportunity.listing.allInPrice)}</strong>
                  </span>
                  <span>
                    <small>Model</small>
                    <strong>{money(activeDetailDot.opportunity.fairValue)}</strong>
                  </span>
                  <span className={activeDetailDot.opportunity.edgeDollars >= 0 ? 'edge' : ''}>
                    <small>Spread</small>
                    <strong>{money(activeDetailDot.opportunity.edgeDollars)}</strong>
                  </span>
                </div>
                {activeDetailDot.opportunity.listing.listingUrl ? (
                  <a href={activeDetailDot.opportunity.listing.listingUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    Open listing
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside className="live-map-focus">
            {best ? (
              <>
                <span>Best Live Spread</span>
                <strong>{money(best.edgeDollars)}</strong>
                <small>{best.listing.playerName}</small>
                <p>{best.listing.title}</p>
                <div className={`live-comp-verdict ${compVerdict.tone}`}>
                  <span>{focusCompLoading ? 'Loading comps' : compVerdict.label}</span>
                  <strong>
                    {bestCompCheck?.last5Avg
                      ? `${percent(Math.abs(bestCompCheck.askVsLast5Pct ?? 0))} ${best.listing.allInPrice <= bestCompCheck.last5Avg ? 'below' : 'above'} last 5`
                      : focusCompError
                        ? 'Comp load failed'
                        : 'Model only'}
                  </strong>
                </div>
                <div className="live-map-focus-grid">
                  <div>
                    <span>All In</span>
                    <strong>{money(best.listing.allInPrice)}</strong>
                  </div>
                  <div>
                    <span>Model</span>
                    <strong>{money(best.fairValue)}</strong>
                  </div>
                  <div>
                    <span>Last 3</span>
                    <strong>{bestCompCheck?.last3Avg ? money(bestCompCheck.last3Avg) : '--'}</strong>
                  </div>
                  <div>
                    <span>Last 5</span>
                    <strong>{bestCompCheck?.last5Avg ? money(bestCompCheck.last5Avg) : '--'}</strong>
                  </div>
                </div>
                {bestCompCheck ? (
                  <div
                    className="live-comp-rail"
                    style={
                      {
                        '--ask-pct': `${Math.min(100, (best.listing.allInPrice / Math.max(best.fairValue, bestCompCheck.last5Avg || 1)) * 100)}%`,
                        '--model-pct': `${Math.min(100, (best.fairValue / Math.max(best.fairValue, bestCompCheck.last5Avg || 1)) * 100)}%`,
                        '--last5-pct': `${Math.min(100, ((bestCompCheck.last5Avg || 0) / Math.max(best.fairValue, bestCompCheck.last5Avg || 1)) * 100)}%`,
                      } as CSSProperties
                    }
                  >
                    <i className="ask" />
                    <i className="last5" />
                    <i className="model" />
                    <div>
                      <span>Ask</span>
                      <span>Last 5</span>
                      <span>Model</span>
                    </div>
                  </div>
                ) : null}
                {bestCompCheck ? (
                  <div className="live-comp-strip">
                    <span>{bestCompCheck.bucket.productFamily} / {bestCompCheck.bucket.variationLabel} / {bestCompCheck.bucket.gradeBucket}</span>
                    <small>
                      {bestCompCheck.sales.length.toLocaleString()} clean comps · trailing model {money(bestCompCheck.trailingModel)}
                    </small>
                  </div>
                ) : null}
                {bestCompCheck?.last5.length ? (
                  <div className="live-comp-tape">
                    {bestCompCheck.last5.map((sale) => (
                      <span key={`live-comp:${sale.itemId}`}>
                        <strong>{money(sale.salePrice)}</strong>
                        <small>{compactDate(sale.soldAt)}</small>
                      </span>
                    ))}
                  </div>
                ) : null}
                {activeBuyDots.length ? (
                  <div className="live-buy-queue">
                    <span>Active buy dots</span>
                    {activeBuyDots.slice(0, 3).map(({ opportunity, type }, index) => (
                      <a href={opportunity.listing.listingUrl || undefined} target="_blank" rel="noreferrer" key={`buy-dot:${opportunity.listing.id}:${index}`}>
                        <strong>
                          #{index + 1} {money(opportunity.edgeDollars)}
                        </strong>
                        <small>
                      {type} · {opportunity.listing.playerName} · {money(opportunity.listing.allInPrice)} ask
                        </small>
                      </a>
                    ))}
                  </div>
                ) : null}
                {best.listing.listingUrl ? (
                  <a className="primary-button live-map-ebay-link" href={best.listing.listingUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} />
                    Open Listing
                  </a>
                ) : null}
              </>
            ) : null}
          </aside>
        </div>
        </>
      )}
    </section>
  )
}

function caseHitSourceLabel(source: CaseHitOpportunity['source']) {
  const labels: Record<CaseHitOpportunity['source'], string> = {
    'same-player': 'same player',
    'player-rarity': 'player rarity',
    'variation-ask': 'variation asks',
    'global-rarity': 'market rarity',
    'thin-ask': 'thin market',
  }
  return labels[source] ?? cleanModelLanguage(source.replaceAll('-', ' '))
}

function caseHitModelSourceLabel(source: CaseHitScanResult['valuationRows'][number]['source']) {
  const labels: Record<CaseHitScanResult['valuationRows'][number]['source'], string> = {
    'player-ask': 'player asks',
    'global-ask': 'market asks',
    unpriced: 'unpriced',
  }
  return labels[source] ?? cleanModelLanguage(source.replaceAll('-', ' '))
}

type CaseHitAutoLens = NonNullable<ReturnType<typeof buildCaseHitAutoEquivalent>>
type CaseHitReviewEntry = {
  opportunity: CaseHitOpportunity
  autoEquivalent: CaseHitAutoLens | null
}

function caseHitAutoSignalLabel(signal: CaseHitAutoLens['signal']) {
  if (signal === 'value') return 'value tier'
  if (signal === 'fair') return 'fair tier'
  if (signal === 'premium') return 'premium ask'
  if (signal === 'danger') return 'low-number price'
  return 'auto ladder missing'
}

function caseHitAutoBandLabel(autoEquivalent: CaseHitAutoLens) {
  const floor = autoEquivalent.floorLabel ? compactVariation(autoEquivalent.floorLabel) : null
  const ceiling = autoEquivalent.ceilingLabel ? compactVariation(autoEquivalent.ceilingLabel) : null
  if (!floor && ceiling) return `Below ${ceiling}`
  if (floor && !ceiling) return `Above ${floor}`
  if (floor && ceiling && floor !== ceiling) return `${floor} to ${ceiling}`
  return floor ? `At ${floor}` : 'No auto band'
}

function caseHitEntrySort(left: CaseHitReviewEntry, right: CaseHitReviewEntry) {
  return (
    (right.autoEquivalent?.valueScore ?? Number.NEGATIVE_INFINITY) -
      (left.autoEquivalent?.valueScore ?? Number.NEGATIVE_INFINITY) ||
    right.opportunity.edgeDollars - left.opportunity.edgeDollars ||
    right.opportunity.confidence - left.opportunity.confidence
  )
}

function CaseHitLab({
  scan,
  pricingRows,
  loading,
  error,
  ebayStatus,
  familyFilter,
  onFamilyFilterChange,
  minPrice,
  onMinPriceChange,
  onScan,
}: {
  scan: CaseHitScanResult | null
  pricingRows: PricingRow[]
  loading: boolean
  error: string | null
  ebayStatus: EbayStatus | null
  familyFilter: 'all' | CaseHitInsertKey
  onFamilyFilterChange: (value: 'all' | CaseHitInsertKey) => void
  minPrice: number
  onMinPriceChange: (value: number) => void
  onScan: () => void
}) {
  const configured = Boolean(ebayStatus?.configured)
  const activeFamilies =
    familyFilter === 'all' ? CASE_HIT_FAMILIES : CASE_HIT_FAMILIES.filter((family) => family.key === familyFilter)
  const selectedFamily = familyFilter === 'all' ? null : activeFamilies[0]
  const activeChecklistSize = activeFamilies.reduce((total, family) => total + family.cardCount, 0)
  const opportunities = scan?.opportunities ?? []
  const opportunitiesWithAutoLens = opportunities.map((opportunity) => ({
    opportunity,
    autoEquivalent: buildCaseHitAutoEquivalent(opportunity.listing, pricingRows),
  }))
  const rendered = [...opportunitiesWithAutoLens].sort(caseHitEntrySort).slice(0, CASE_HIT_RENDER_LIMIT)
  const ranking = new Map(rendered.map((entry, index) => [entry.opportunity.listing.itemId, index + 1]))
  const valuationRows = scan?.valuationRows ?? []
  const valuationByPlayerLane = new Map(valuationRows.map((row) => [`${row.caseHitKey}:${row.playerName}`, row]))
  const playerGroups = Array.from(
    rendered.reduce((groups, entry) => {
      const groupKey = `${entry.opportunity.listing.caseHitKey}:${entry.opportunity.listing.playerName}`
      const playerEntries = groups.get(groupKey) ?? []
      playerEntries.push(entry)
      groups.set(groupKey, playerEntries)
      return groups
    }, new Map<string, CaseHitReviewEntry[]>()),
  ).map(([groupKey, entries]) => {
    const sortedEntries = [...entries].sort(caseHitEntrySort)
    const best = sortedEntries[0]
    const playerName = best.opportunity.listing.playerName
    const valuation = valuationByPlayerLane.get(groupKey)
    const bestAllIn = Math.min(...sortedEntries.map((entry) => entry.opportunity.listing.allIn))
    const bestModelEdge = Math.max(...sortedEntries.map((entry) => entry.opportunity.edgeDollars))
    return { groupKey, playerName, entries: sortedEntries, best, valuation, bestAllIn, bestModelEdge }
  })
  const positiveEdges = opportunities.filter((opportunity) => opportunity.edgeDollars > 0).length
  const autoLensCount = opportunitiesWithAutoLens.filter((entry) => entry.autoEquivalent).length
  const relativeEdges = opportunitiesWithAutoLens.filter((entry) =>
    entry.autoEquivalent ? ['value', 'fair'].includes(entry.autoEquivalent.signal) : false,
  ).length
  const latestFetchedAt = scan?.fetchedAt ? new Date(scan.fetchedAt).toLocaleTimeString() : null
  const canScan = configured && !loading
  const scanButtonLabel = loading ? 'Scanning' : configured ? `Scan ${selectedFamily?.shortLabel ?? 'Case Hits'}` : 'eBay offline'

  return (
    <section className="bin-radar case-hit-lab">
      <div className="bin-radar-header">
        <div className="section-title">
          <Gem size={18} />
          <div>
            <h2>Case Hit Lab</h2>
            <span>2026 Bowman rare inserts, compared against comps and Bowman 1st Auto peer pricing</span>
          </div>
        </div>
        <div className="bin-radar-pills">
          <span className={configured ? 'connected' : 'offline'}>
            {configured ? <Wifi size={14} /> : <WifiOff size={14} />}
            {configured ? 'eBay only' : 'eBay keys needed'}
          </span>
          <span>{activeChecklistSize.toLocaleString()} cards</span>
          <span>{selectedFamily ? `${selectedFamily.printRun.toLocaleString()} est. run` : `${CASE_HIT_TOTAL_CARDS} total checklist`}</span>
          <span>{scan ? `${scan.listings.length.toLocaleString()} mapped` : 'No scan yet'}</span>
          <span>{scan ? `${positiveEdges.toLocaleString()} ask edges` : 'Ask model pending'}</span>
          <span>{scan ? `${relativeEdges.toLocaleString()} value tiers` : 'Relative value pending'}</span>
          <span>{scan ? `${autoLensCount.toLocaleString()} auto lenses` : 'Auto ruler pending'}</span>
          {latestFetchedAt ? <span>Scanned {latestFetchedAt}</span> : null}
        </div>
      </div>

      <div className="bin-radar-controls">
        <label className="bin-control">
          <span>Family</span>
          <select
            aria-label="Case hit family"
            value={familyFilter}
            onChange={(event) => onFamilyFilterChange(event.target.value as 'all' | CaseHitInsertKey)}
          >
            <option value="all">All rare inserts</option>
            {CASE_HIT_FAMILIES.map((family) => (
              <option key={family.key} value={family.key}>
                {family.label}
              </option>
            ))}
          </select>
        </label>
        <label className="bin-control">
          <span>Min BIN</span>
          <input
            aria-label="Minimum case hit BIN price"
            min="0"
            step="5"
            type="number"
            value={minPrice}
            onChange={(event) => onMinPriceChange(Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
        <button className="primary-button bin-scan-button" type="button" onClick={onScan} disabled={!canScan}>
          <RefreshCw size={16} className={loading ? 'spin' : undefined} />
          {scanButtonLabel}
        </button>
        {scan ? (
          <div className="bin-scan-stats">
            <strong>{scan.stats.queriesSucceeded.toLocaleString()}</strong>
            <span>
              queries / {scan.stats.upstreamPagesFetched.toLocaleString()} live pages / {scan.stats.cacheHits.toLocaleString()} cached /{' '}
              {scan.stats.rejectedListings.toLocaleString()} rejects
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="bin-radar-alert">
          <ShieldCheck size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="case-hit-lens-board">
        <div>
          <span>Price-to-Tier Map</span>
          <strong>List price maps to the player's Bowman auto ladder</strong>
        </div>
        <div>
          <span>Family Lanes</span>
          <strong>Patchwork, Anime, Kanji, Spotlights, Crystallized, and Final Draft price separately</strong>
        </div>
        <div>
          <span>Scarcity Context</span>
          <strong>Estimated print runs help orient value when direct comps are thin</strong>
        </div>
      </div>

      {!configured ? (
        <div className="bin-empty-state">
          <KeyRound size={24} />
          <div>
            <strong>eBay production keys are required.</strong>
            <span>This lab builds from active rare-insert listings and the Bowman 1st Auto model.</span>
          </div>
        </div>
      ) : !scan ? (
        <div className="bin-empty-state ready">
          <Gem size={24} />
          <div>
            <strong>Ready to scan 2026 Bowman case hits.</strong>
            <span>
              The model scans the official rare-insert checklists, rejects adjacent inserts/autos, and estimates value from active ask comps,
              print-run context, and the same player's Bowman 1st Auto ladder when available.
            </span>
          </div>
        </div>
      ) : rendered.length === 0 ? (
        <div className="bin-empty-state muted">
          <Gem size={24} />
          <div>
            <strong>No case-hit listings survived the title filters.</strong>
            <span>{scan.stats.dedupedItems.toLocaleString()} eBay items were reviewed before checklist and insert filtering.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="bin-opportunity-list">
            <div className="case-hit-review-kicker">
              <div>
                <span>Review Queue</span>
                <strong>{playerGroups.length.toLocaleString()} players with mapped BINs</strong>
              </div>
              <small>Grouped by player, ordered by the strongest price-to-auto-tier read.</small>
            </div>
            <div className="bin-opportunity-head">
              <span>Rank</span>
              <span>Listing</span>
              <span>All In</span>
              <span>Variation Model</span>
              <span>Auto Map</span>
              <span>Signal</span>
            </div>
            {playerGroups.map((group) => {
              const bestAutoLens = group.best.autoEquivalent
              return (
                <section className="case-hit-player-group" key={group.groupKey}>
                  <div className="case-hit-player-group-header">
                    <div>
                      <span>
                        {group.valuation?.team ?? group.best.opportunity.listing.team} / {group.entries.length} BIN
                        {group.entries.length === 1 ? '' : 's'}
                      </span>
                      <strong>{group.playerName}</strong>
                      <small>
                        {group.best.opportunity.listing.caseHitLabel} /{' '}
                        {bestAutoLens
                          ? `best ask trades like ${compactVariation(bestAutoLens.equivalentLabel)} at ${formatMultiplier(bestAutoLens.autoMultiple)} base auto`
                          : 'no Bowman auto ladder match yet'}
                      </small>
                    </div>
                    <div className="case-hit-player-group-metrics">
                      <span>
                        <small>Best all-in</small>
                        <strong>{money(group.bestAllIn)}</strong>
                      </span>
                      <span>
                        <small>Ask edge</small>
                        <strong>{money(group.bestModelEdge)}</strong>
                      </span>
                      <span>
                        <small>Base ask</small>
                        <strong>{money(group.valuation?.baseAsk ?? 0)}</strong>
                      </span>
                    </div>
                  </div>
                  <div className="case-hit-player-group-list">
                    {group.entries.map(({ opportunity, autoEquivalent }) => {
                      const rank = ranking.get(opportunity.listing.itemId) ?? 0
                      return (
                        <article
                          className={`bin-opportunity-row case-hit-row ${
                            opportunity.edgeDollars > 0
                              ? 'lane-buy'
                              : opportunity.confidence < 0.38
                                ? 'lane-risk'
                                : 'lane-watch'
                          }`}
                          key={opportunity.listing.itemId}
                        >
                          <div className="bin-rank-cell">
                            <strong>#{rank}</strong>
                            <span>{opportunity.grade}</span>
                          </div>
                          <div className="bin-listing-cell">
                            <strong>{opportunity.listing.playerName}</strong>
                            <span>{opportunity.listing.title}</span>
                            <div className="bin-evidence-strip">
                              <small>{opportunity.listing.variationLabel}</small>
                              <small>{opportunity.listing.caseHitLabel}</small>
                              <small>{opportunity.listing.cardNo}</small>
                              <small>~{opportunity.listing.printRun.toLocaleString()} run</small>
                              <small>{opportunity.compCount} active comps</small>
                              <small>{caseHitSourceLabel(opportunity.source)}</small>
                              {autoEquivalent ? (
                                <>
                                  <small className={`auto-lens-chip ${autoEquivalent.signal}`}>
                                    Trades like {compactVariation(autoEquivalent.equivalentLabel)}
                                  </small>
                                  <small className={`auto-lens-chip ${autoEquivalent.signal}`}>
                                    {formatMultiplier(autoEquivalent.autoMultiple)} base auto
                                  </small>
                                  <small className={`auto-lens-chip ${autoEquivalent.signal}`}>
                                    {caseHitAutoBandLabel(autoEquivalent)}
                                  </small>
                                  <small className={`auto-lens-chip ${autoEquivalent.signal}`}>
                                    {caseHitAutoSignalLabel(autoEquivalent.signal)}
                                  </small>
                                </>
                              ) : (
                                <small className="auto-lens-chip missing">No auto ruler</small>
                              )}
                            </div>
                          </div>
                          <div className="bin-money-cell">
                            <strong>{money(opportunity.listing.allIn)}</strong>
                            <span>BIN + ship</span>
                          </div>
                          <div className="bin-money-cell">
                            <strong>{money(opportunity.modelPrice)}</strong>
                            <span>{opportunity.compCount.toLocaleString()} active comps</span>
                          </div>
                          <div className={`bin-money-cell ${opportunity.edgeDollars > 0 ? 'edge' : ''}`}>
                            <strong>
                              {autoEquivalent ? compactVariation(autoEquivalent.equivalentLabel) : money(opportunity.edgeDollars)}
                            </strong>
                            <span>
                              {autoEquivalent
                                ? `${money(autoEquivalent.equivalentPrice)} tier`
                                : `${percent(opportunity.discountPct)} spread`}
                            </span>
                          </div>
                          <div className="bin-signal-cell">
                            <span>
                              {autoEquivalent
                                ? caseHitAutoSignalLabel(autoEquivalent.signal)
                                : opportunity.edgeDollars > 0
                                  ? 'Inspect BIN'
                                  : 'Market check'}
                            </span>
                            {opportunity.listing.listingUrl ? (
                              <a href={opportunity.listing.listingUrl} target="_blank" rel="noreferrer">
                                <ExternalLink size={14} />
                                eBay
                              </a>
                            ) : null}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>

          <details className="case-hit-model-drawer">
            <summary>
              <span>
                <strong>Checklist valuation table</strong>
                <small>{valuationRows.length.toLocaleString()} cards / active ask pricing / print-run context</small>
              </span>
            </summary>
            <div className="case-hit-model-board">
              <div className="case-hit-model-title">
                <strong>Rare Insert Valuation Table</strong>
                <span>Reference layer only. The review queue above is the primary workflow.</span>
              </div>
              <div className="case-hit-model-list">
                {valuationRows.map((row, index) => (
                  <article className="case-hit-model-row" key={`${row.caseHitKey}:${row.cardNo}`}>
                    <div className="case-hit-player-cell">
                      <span>#{index + 1}</span>
                      <strong>{row.playerName}</strong>
                      <small>
                        {row.caseHitLabel} / {row.cardNo} / {row.team}
                      </small>
                    </div>
                    <div className="case-hit-base-cell">
                      <span>Base ask</span>
                      <strong>{money(row.baseAsk)}</strong>
                      <small>
                        {row.activeListings.toLocaleString()} listings / {caseHitModelSourceLabel(row.source)}
                      </small>
                    </div>
                    <div className="case-hit-variation-strip">
                      {row.variations.map((variation) => (
                        <span className="case-hit-variation-cell" key={`${row.cardNo}:${variation.key}`}>
                          <small>{variation.label}</small>
                          <strong>{money(variation.price)}</strong>
                          <em>{variation.rarityMultiplier}x</em>
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </details>
        </>
      )}
    </section>
  )
}

function sealedWaxSourceLabel(model: WaxMarketModel) {
  if (model.source === 'manual') return 'Target price'
  if (model.source === 'comps') return 'Comp-backed'
  return 'Add target'
}

function sealedWaxGradeLabel(opportunity: WaxOpportunity) {
  if (opportunity.grade === 'A') return 'Below target'
  if (opportunity.grade === 'B') return 'Offer zone'
  if (opportunity.grade === 'C') return 'Reach offer'
  return 'Watch'
}

function SealedWaxDesk({
  query,
  onQueryChange,
  manualMarketInput,
  onManualMarketInputChange,
  minPrice,
  onMinPriceChange,
  compText,
  onCompTextChange,
  daveAdamsText,
  onDaveAdamsTextChange,
  includeEbay,
  onIncludeEbayChange,
  includeFanatics,
  onIncludeFanaticsChange,
  includeDaveAdams,
  onIncludeDaveAdamsChange,
  comps,
  model,
  scan,
  opportunities,
  loading,
  error,
  onScan,
}: {
  query: string
  onQueryChange: (value: string) => void
  manualMarketInput: string
  onManualMarketInputChange: (value: string) => void
  minPrice: number
  onMinPriceChange: (value: number) => void
  compText: string
  onCompTextChange: (value: string) => void
  daveAdamsText: string
  onDaveAdamsTextChange: (value: string) => void
  includeEbay: boolean
  onIncludeEbayChange: (value: boolean) => void
  includeFanatics: boolean
  onIncludeFanaticsChange: (value: boolean) => void
  includeDaveAdams: boolean
  onIncludeDaveAdamsChange: (value: boolean) => void
  comps: WaxComp[]
  model: WaxMarketModel
  scan: WaxScanResult | null
  opportunities: WaxOpportunity[]
  loading: boolean
  error: string | null
  onScan: () => void
}) {
  const daveSearchUrl = `https://www.dacardworld.com/search?Search=${encodeURIComponent(query || 'sealed wax')}`
  const scannedListings = scan?.listings ?? []
  const topOpportunities = opportunities.slice(0, 48)
  const bestOpportunity = topOpportunities[0]
  const productGroups = SEALED_WAX_PRODUCTS.reduce<Record<string, typeof SEALED_WAX_PRODUCTS>>((groups, product) => {
    groups[product.family] = [...(groups[product.family] ?? []), product]
    return groups
  }, {})
  const marketplaceCounts = scannedListings.reduce<Record<string, number>>((counts, listing) => {
    counts[listing.marketplaceLabel] = (counts[listing.marketplaceLabel] ?? 0) + 1
    return counts
  }, {})
  const daveListingCount = scannedListings.filter((listing) => listing.marketplace === 'dave-adams').length
  const hasMarketAnchor = model.marketPrice > 0
  const selectedFormat = sealedWaxProductLabel(query)
  const canScan =
    query.trim().length > 2 &&
    hasMarketAnchor &&
    !loading &&
    (includeEbay || includeFanatics || includeDaveAdams || daveAdamsText.trim().length > 0)
  const scanButtonText = !hasMarketAnchor
    ? 'Add Target or Comps'
    : loading
      ? `Scanning ${selectedFormat}`
      : `Scan ${selectedFormat}`

  return (
    <section className="sealed-wax-desk">
      <div className="wax-command-center">
        <div>
          <span className="workflow-kicker">
            <Package size={14} />
            Sealed Wax Desk
          </span>
          <h2>Source Bowman wax against fresh comps.</h2>
          <p>
            Paste recent Market Movers box sales, pick a Bowman wax product, then scan live marketplaces against a recency-weighted comp anchor.
          </p>
        </div>
        <div className="wax-command-metrics" aria-label="Sealed wax status">
          <span>
            <small>Target price</small>
            <strong>{hasMarketAnchor ? money(model.marketPrice) : '--'}</strong>
            <em>{sealedWaxSourceLabel(model)}</em>
          </span>
          <span>
            <small>Scanned</small>
            <strong>{scannedListings.length.toLocaleString()}</strong>
            <em>{scan ? `Updated ${new Date(scan.fetchedAt).toLocaleTimeString()}` : 'No scan yet'}</em>
          </span>
          <span>
            <small>Best gap</small>
            <strong>{bestOpportunity ? money(bestOpportunity.spread) : '--'}</strong>
            <em>{bestOpportunity ? sealedWaxGradeLabel(bestOpportunity) : 'Awaiting scan'}</em>
          </span>
        </div>
      </div>

      <section className="wax-value-console">
        <div className="wax-step wax-format-step">
          <span>1 / Product</span>
          <strong>{selectedFormat}</strong>
          <select className="wax-product-select" value={query} onChange={(event) => onQueryChange(event.target.value)} aria-label="Sealed wax product">
            {Object.entries(productGroups).map(([family, products]) => (
              <optgroup label={family} key={family}>
                {products.map((product) => (
                  <option value={product.query} key={product.id}>
                    {product.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <label className="wax-step wax-anchor-step">
          <span>2 / Willing to pay</span>
          <input
            value={manualMarketInput}
            onChange={(event) => onManualMarketInputChange(event.target.value)}
            inputMode="decimal"
            placeholder="Optional target"
            aria-label="Price you are willing to pay"
          />
          <small>
            {model.source === 'manual'
              ? `Your target; comp anchor ${model.timeWeightedAverage ? money(model.timeWeightedAverage) : '--'}`
              : model.source === 'comps'
                ? `${model.recentCompCount} recent / ${model.compCount.toLocaleString()} matching comps`
                : 'Paste comps below or enter a target'}
          </small>
        </label>

        <label className="wax-step wax-min-step">
          <span>3 / Minimum</span>
          <input
            type="number"
            min="0"
            step="10"
            value={minPrice}
            onChange={(event) => onMinPriceChange(Math.max(0, Number(event.target.value) || 0))}
            aria-label="Minimum listing price"
          />
          <small>Skip noisy low-dollar listings</small>
        </label>

        <div className="wax-step wax-source-step">
          <span>Sources</span>
          <div className="wax-toggle-row" aria-label="Sealed wax marketplace sources">
            <label>
              <input type="checkbox" checked={includeEbay} onChange={(event) => onIncludeEbayChange(event.target.checked)} />
              <span>eBay live</span>
            </label>
            <label>
              <input type="checkbox" checked={includeFanatics} onChange={(event) => onIncludeFanaticsChange(event.target.checked)} />
              <span>Fanatics Collect</span>
            </label>
            <label>
              <input type="checkbox" checked={includeDaveAdams} onChange={(event) => onIncludeDaveAdamsChange(event.target.checked)} />
              <span>Dave & Adams live</span>
            </label>
            <span>Quote paste fallback</span>
          </div>
        </div>

        <div className="wax-step wax-run-step">
          <button className="primary-button wax-scan-button" type="button" onClick={onScan} disabled={!canScan}>
            <RefreshCw size={16} className={loading ? 'spin' : undefined} />
            {scanButtonText}
          </button>
          <small>{hasMarketAnchor ? `Ranking listings up to 30% above ${money(model.marketPrice)}` : 'A target or comp anchor is required to score listings'}</small>
        </div>

        {error ? (
          <div className="wax-alert wax-console-alert">
            <ShieldCheck size={16} />
            <span>{error}</span>
          </div>
        ) : null}
      </section>

      <details className="wax-evidence-details" open={comps.length > 0 || daveAdamsText.trim().length > 0}>
        <summary>
          <span>
            <BarChart3 size={16} />
            Market evidence and retail quotes
          </span>
          <em>
            {model.compCount.toLocaleString()} matching / {comps.length.toLocaleString()} pasted comps / {daveListingCount.toLocaleString()} D&A listings
          </em>
        </summary>

        <div className="wax-evidence-grid">
          <section className="wax-panel wax-comp-panel">
            <div className="wax-panel-title">
              <div>
                <span>Market Evidence</span>
                <strong>Recent box comps</strong>
              </div>
              <div className="wax-pill-row">
                <span>{model.compCount.toLocaleString()} matching</span>
                <span>{model.recentCompCount.toLocaleString()} in model</span>
                <span>{model.source === 'manual' ? 'target price' : model.source}</span>
              </div>
            </div>
            <textarea
              className="wax-textarea"
              value={compText}
              onChange={(event) => onCompTextChange(event.target.value)}
              placeholder={`Paste Market Movers box comps here. You can paste multiple products; the model filters to the selected product.\neBay $240 2026 Bowman Hobby Box 7/1/2026\nFanatics $260 2026 Bowman Jumbo Box 6/30/2026\nMarket Movers $345 2025 Bowman Draft Jumbo Box 6/28/2026`}
              aria-label="Market comps"
            />
            <div className="wax-model-grid">
              <span>
                <small>Weighted</small>
                <strong>{model.timeWeightedAverage ? money(model.timeWeightedAverage) : '--'}</strong>
              </span>
              <span>
                <small>Last 3</small>
                <strong>{model.lastThreeAverage ? money(model.lastThreeAverage) : '--'}</strong>
              </span>
              <span>
                <small>Last 5</small>
                <strong>{model.lastFiveAverage ? money(model.lastFiveAverage) : '--'}</strong>
              </span>
              <span>
                <small>Range</small>
                <strong>{model.low ? `${money(model.low)}-${money(model.high)}` : '--'}</strong>
              </span>
            </div>
          </section>

          <section className="wax-panel wax-retail-panel">
            <div className="wax-panel-title">
              <div>
                <span>Retail Quotes</span>
                <strong>Dave & Adams fallback</strong>
              </div>
              <a className="wax-inline-link" href={daveSearchUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                Search D&A
              </a>
            </div>
            <textarea
              className="wax-textarea"
              value={daveAdamsText}
              onChange={(event) => onDaveAdamsTextChange(event.target.value)}
              placeholder={`Paste D&A rows when you find a quote.\n2026 Bowman Baseball Hobby Box $229.95 https://www.dacardworld.com/...`}
              aria-label="Dave and Adams quote rows"
            />
            <div className="wax-note">
              <Store size={16} />
              <span>
                Live D&A reads are attempted when enabled. If the storefront blocks automated reads, pasted rows still rank against the same comp anchor.
              </span>
            </div>
          </section>
        </div>
      </details>

      <section className="wax-results-panel">
        <div className="wax-results-head">
          <div>
            <span>Ranked Opportunities</span>
            <strong>
              {hasMarketAnchor
                ? `${topOpportunities.length.toLocaleString()} listings inside offer window`
                : 'Add a target price to score listings'}
            </strong>
          </div>
          <div className="wax-pill-row">
            {Object.entries(marketplaceCounts).map(([marketplace, count]) => (
              <span key={marketplace}>
                {marketplace}: {count.toLocaleString()}
              </span>
            ))}
            {scan?.stats.cacheHits ? <span>{scan.stats.cacheHits.toLocaleString()} cached</span> : null}
            {scan?.stats.upstreamPages ? <span>{scan.stats.upstreamPages.toLocaleString()} live pages</span> : null}
          </div>
        </div>

        {scan?.errors.length ? (
          <div className="wax-alert muted">
            <ShieldCheck size={16} />
            <span>{scan.errors.map((scanError) => `${scanError.source}: ${scanError.error}`).join(' / ')}</span>
          </div>
        ) : null}

        {bestOpportunity ? (
          <article className="wax-best-card">
            <div>
              <span>Best current lead</span>
              <strong>{bestOpportunity.listing.title}</strong>
              <small>
                {bestOpportunity.listing.marketplaceLabel} / {money(bestOpportunity.listing.allIn)} all-in /{' '}
                {bestOpportunity.spread >= 0 ? `${money(bestOpportunity.spread)} under target` : `${money(Math.abs(bestOpportunity.spread))} over target`}
              </small>
            </div>
            <div>
              <strong>{percent(bestOpportunity.discountPct)}</strong>
              <span>{sealedWaxGradeLabel(bestOpportunity)}</span>
              {bestOpportunity.listing.listingUrl ? (
                <a href={bestOpportunity.listing.listingUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} />
                  Open
                </a>
              ) : null}
            </div>
          </article>
        ) : null}

        {!hasMarketAnchor ? (
          <div className="wax-empty-state">
            <BarChart3 size={26} />
            <div>
              <strong>Start with your target price.</strong>
              <span>Enter what you would pay, or expand market evidence and paste recent comps. Then scans grade listings around that number.</span>
            </div>
          </div>
        ) : !scan ? (
          <div className="wax-empty-state">
            <Package size={26} />
            <div>
              <strong>Ready to scan sealed wax.</strong>
              <span>Run the scan to compare active eBay, Fanatics Collect, D&A, and pasted retail quotes for the selected Bowman product.</span>
            </div>
          </div>
        ) : topOpportunities.length === 0 ? (
          <div className="wax-empty-state">
            <Radio size={26} />
            <div>
              <strong>No listings cleared the offer window.</strong>
              <span>
                {scannedListings.length.toLocaleString()} sealed listings reviewed; none landed within 30% above {money(model.marketPrice)}.
              </span>
            </div>
          </div>
        ) : (
          <div className="wax-opportunity-list">
            <div className="wax-opportunity-head">
              <span>Rank</span>
              <span>Product</span>
              <span>Source</span>
              <span>All In</span>
              <span>Target</span>
              <span>Signal</span>
            </div>
            {topOpportunities.map((opportunity, index) => (
              <article className={`wax-opportunity-row grade-${opportunity.grade.toLowerCase()}`} key={opportunity.listing.id}>
                <div className="wax-rank-cell">
                  <strong>#{index + 1}</strong>
                  <span>{opportunity.grade}</span>
                </div>
                <div className="wax-product-cell">
                  {opportunity.listing.imageUrl ? <img src={opportunity.listing.imageUrl} alt="" loading="lazy" /> : <Package size={20} />}
                  <div>
                    <strong>{opportunity.listing.title}</strong>
                    <span>
                      {opportunity.listing.productKind} / {Math.round(opportunity.listing.confidence * 100)}% title match
                      {opportunity.listing.mode === 'auction' && opportunity.listing.endTime ? ` / ends ${compactDate(opportunity.listing.endTime)}` : ''}
                    </span>
                  </div>
                </div>
                <div className="wax-source-cell">
                  <span>{opportunity.listing.marketplaceLabel}</span>
                  <small>{opportunity.listing.mode}</small>
                </div>
                <div className="wax-money-cell">
                  <strong>{money(opportunity.listing.allIn)}</strong>
                  <span>{opportunity.listing.shipping ? `${money(opportunity.listing.shipping)} ship` : 'all-in'}</span>
                </div>
                <div className="wax-money-cell">
                  <strong>{money(opportunity.marketPrice)}</strong>
                  <span>{opportunity.spread >= 0 ? `${money(opportunity.spread)} under` : `${money(Math.abs(opportunity.spread))} over`}</span>
                </div>
                <div className="wax-signal-cell">
                  <strong>{sealedWaxGradeLabel(opportunity)}</strong>
                  <span>{percent(opportunity.discountPct)} vs target</span>
                  {opportunity.listing.listingUrl ? (
                    <a href={opportunity.listing.listingUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={14} />
                      Open
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

function App() {
  const [releaseOptions, setReleaseOptions] = useState<ReleaseOption[]>(FALLBACK_RELEASE_OPTIONS)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [checklistModels, setChecklistModels] = useState<ChecklistModel[]>([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [checklistProgress, setChecklistProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [query, setQuery] = useState('')
  const [releaseFilter, setReleaseFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all')
  const [baseSourceFilter, setBaseSourceFilter] = useState<BaseSourceFilter>('decision-ready')
  const [stsFilter, setStsFilter] = useState<StsFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('dynasty-value')
  const [selectedRowId, setSelectedRowId] = useState<string | undefined>()
  const [workMode, setWorkMode] = useState<WorkMode>(() =>
    typeof window === 'undefined' ? 'lookup' : workModeFromPath(window.location.pathname),
  )
  const [appRoute, setAppRoute] = useState<AppRoute>(() =>
    typeof window === 'undefined' ? 'desk' : appRouteFromPath(window.location.pathname),
  )
  const [ebayStatus, setEbayStatus] = useState<EbayStatus | null>(null)
  const [binListings, setBinListings] = useState<MarketplaceListing[]>([])
  const [binLoading, setBinLoading] = useState(false)
  const [binError, setBinError] = useState<string | null>(null)
  const [binMinPrice, setBinMinPrice] = useState(25)
  const [binPlayerScope, setBinPlayerScope] = useState<BinPlayerScope>('value-25')
  const [binSearchMode, setBinSearchMode] = useState<BinSearchMode>('checklist')
  const [binSearchTerm, setBinSearchTerm] = useState('')
  const [binResultSort, setBinResultSort] = useState<BinResultSort>('conviction-desc')
  const [binModelKey, setBinModelKey] = useState(BIN_ALL_MODELS_KEY)
  const [binScan, setBinScan] = useState<EbayBinScanResult | null>(null)
  const [listingRejections, setListingRejections] = useState<ListingRejection[]>(() => readListingRejections())
  const [lastRejectedListing, setLastRejectedListing] = useState<ListingRejection | null>(null)
  const [auctionListings, setAuctionListings] = useState<MarketplaceListing[]>([])
  const [auctionLoading, setAuctionLoading] = useState(false)
  const [auctionError, setAuctionError] = useState<string | null>(null)
  const [auctionScan, setAuctionScan] = useState<EbayBinScanResult | null>(null)
  const [cachedLiveMarket, setCachedLiveMarket] = useState<{
    binOpportunities: Opportunity[]
    auctionOpportunities: Opportunity[]
    observedAt: string
    listingCount: number
  } | null>(null)
  const [cachedFreshLiveMarket, setCachedFreshLiveMarket] = useState<{
    binOpportunities: Opportunity[]
    auctionOpportunities: Opportunity[]
    observedAt: string
    listingCount: number
    snapshotCount: number
  } | null>(null)
  const [caseHitScan, setCaseHitScan] = useState<CaseHitScanResult | null>(null)
  const [caseHitLoading, setCaseHitLoading] = useState(false)
  const [caseHitError, setCaseHitError] = useState<string | null>(null)
  const [caseHitFamilyFilter, setCaseHitFamilyFilter] = useState<'all' | CaseHitInsertKey>('all')
  const [caseHitMinPrice, setCaseHitMinPrice] = useState(20)
  const [waxQuery, setWaxQuery] = useState('2026 Bowman Baseball Hobby Box')
  const [waxManualMarketInput, setWaxManualMarketInput] = useState('')
  const [waxMinPrice, setWaxMinPrice] = useState(50)
  const [waxCompText, setWaxCompText] = useState('')
  const [waxDaveAdamsText, setWaxDaveAdamsText] = useState('')
  const [waxIncludeEbay, setWaxIncludeEbay] = useState(true)
  const [waxIncludeFanatics, setWaxIncludeFanatics] = useState(true)
  const [waxIncludeDaveAdams, setWaxIncludeDaveAdams] = useState(true)
  const [waxScan, setWaxScan] = useState<WaxScanResult | null>(null)
  const [waxLoading, setWaxLoading] = useState(false)
  const [waxError, setWaxError] = useState<string | null>(null)
  const [salesCacheModel, setSalesCacheModel] = useState<SalesCachePlayerModel | null>(null)
  const [activeSalesCacheModels, setActiveSalesCacheModels] = useState<Record<string, SalesCachePlayerModel>>({})
  const [salesCacheLoading, setSalesCacheLoading] = useState(false)
  const [salesCacheError, setSalesCacheError] = useState<{ playerName: string; message: string } | null>(null)
  const [observability, setObservability] = useState<ObservabilitySnapshot | null>(null)
  const [observabilityLoading, setObservabilityLoading] = useState(false)
  const [observabilityError, setObservabilityError] = useState<string | null>(null)
  const [marlinsCoverage, setMarlinsCoverage] = useState<ChecklistCoveragePayload | null>(null)
  const [marlinsCoverageLoading, setMarlinsCoverageLoading] = useState(false)
  const [marlinsCoverageError, setMarlinsCoverageError] = useState<string | null>(null)
  const [marlinsScanLedger, setMarlinsScanLedger] = useState<ScanCoverageStatus | null>(null)
  const [marlinsScanLedgerLoading, setMarlinsScanLedgerLoading] = useState(false)
  const [marlinsScanLedgerError, setMarlinsScanLedgerError] = useState<string | null>(null)
  const [marlinsScanQueue, setMarlinsScanQueue] = useState<ScanQueueStatus | null>(null)
  const [marlinsScanQueueLoading, setMarlinsScanQueueLoading] = useState(false)
  const [marlinsScanQueueError, setMarlinsScanQueueError] = useState<string | null>(null)
  const [marlinsSuperfractorBinScan, setMarlinsSuperfractorBinScan] = useState<EbayBinScanResult | null>(null)
  const [marlinsSuperfractorAuctionScan, setMarlinsSuperfractorAuctionScan] = useState<EbayBinScanResult | null>(null)
  const [marlinsSuperfractorLoading, setMarlinsSuperfractorLoading] = useState(false)
  const [marlinsSuperfractorError, setMarlinsSuperfractorError] = useState<string | null>(null)
  const [rankingsRefreshing, setRankingsRefreshing] = useState(false)
  const [compsRefreshing, setCompsRefreshing] = useState(false)
  const [compRefreshState, setCompRefreshState] = useState<{
    rowId: string
    status: 'loading' | 'success' | 'missing' | 'error'
    message: string
  } | null>(null)
  const [compDatasetVersion, setCompDatasetVersion] = useState(0)
  const [rankingsDatasetVersion, setRankingsDatasetVersion] = useState(0)
  const checklistRequestRef = useRef<AbortController | null>(null)
  const coverageRequestRef = useRef<AbortController | null>(null)
  const scanLedgerRequestRef = useRef<AbortController | null>(null)
  const scanQueueRequestRef = useRef<AbortController | null>(null)
  const marlinsSuperfractorRequestRef = useRef<AbortController | null>(null)
  const checklistRequestIdRef = useRef(0)
  const binRequestRef = useRef<AbortController | null>(null)
  const auctionRequestRef = useRef<AbortController | null>(null)
  const caseHitRequestRef = useRef<AbortController | null>(null)
  const waxRequestRef = useRef<AbortController | null>(null)
  const salesCacheRequestRef = useRef<AbortController | null>(null)
  const activeSalesCacheRequestRef = useRef<AbortController | null>(null)
  const boardSalesCacheRequestRef = useRef<AbortController | null>(null)
  const boardSalesCacheAttemptedRef = useRef(new Set<string>())
  const hostedCompVersionRef = useRef('')
  const dealResultsRef = useRef<HTMLDivElement | null>(null)

  const revealDealResults = useCallback(() => {
    if (typeof window === 'undefined') return
    window.setTimeout(() => {
      const target = dealResultsRef.current
      if (!target) return
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      target.focus({ preventScroll: true })
    }, 120)
  }, [])

  const navigateAppRoute = useCallback((route: AppRoute) => {
    setAppRoute(route)
    if (typeof window === 'undefined') return
    const nextPath = route === 'desk' ? pathForWorkMode(workMode) : pathForAppRoute(route)
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [workMode])

  const navigateWorkMode = useCallback((mode: WorkMode) => {
    setAppRoute('desk')
    setWorkMode(mode)
    if (typeof window === 'undefined') return
    const nextPath = pathForWorkMode(mode)
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncRoute = () => {
      setAppRoute(appRouteFromPath(window.location.pathname))
      setWorkMode(workModeFromPath(window.location.pathname))
    }
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  const loadChecklistCatalog = useCallback(async (signal?: AbortSignal) => {
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      const catalog = await fetchChecklistCatalog({
        categories: CHECKLIST_CATEGORIES,
        minYear: CHECKLIST_MIN_YEAR,
        signal,
      })
      const nextReleaseOptions = catalog.length > 0 ? catalog : FALLBACK_RELEASE_OPTIONS
      setReleaseOptions(nextReleaseOptions)
      setCatalogError(catalog.length > 0 ? null : 'Using baseline checklist catalog')
      return nextReleaseOptions
    } catch (catalogLoadError) {
      if (signal?.aborted) return FALLBACK_RELEASE_OPTIONS
      setCatalogError(catalogLoadError instanceof Error ? cleanModelLanguage(catalogLoadError.message) : 'Checklist catalog load failed')
      setReleaseOptions(FALLBACK_RELEASE_OPTIONS)
      return FALLBACK_RELEASE_OPTIONS
    } finally {
      if (!signal?.aborted) setCatalogLoading(false)
    }
  }, [])

  const loadChecklistModel = useCallback(async (releases: ReleaseOption[]) => {
    checklistRequestRef.current?.abort()
    const requestId = checklistRequestIdRef.current + 1
    checklistRequestIdRef.current = requestId
    const controller = new AbortController()
    checklistRequestRef.current = controller
    setChecklistLoading(true)
    setChecklistError(null)
    setChecklistProgress({ loaded: 0, total: releases.length })

    try {
      const settledModels = await mapWithConcurrency(releases, CHECKLIST_LOAD_CONCURRENCY, async (release) => {
        try {
          const value = await fetchChecklistModel({
            category: release.category,
            year: release.year,
            release: release.release,
            totalPlayers: release.totalPlayers,
            firstChromeAutos: release.firstChromeAutos,
            activeChecklistPlayers: release.activeChecklistPlayers,
            signal: controller.signal,
          })
          if (checklistRequestIdRef.current === requestId && !controller.signal.aborted) {
            setChecklistModels((current) => {
              const valueKey = checklistModelKey(value)
              return sortChecklistModels([...current.filter((model) => checklistModelKey(model) !== valueKey), value])
            })
          }
          return { status: 'fulfilled' as const, value }
        } catch (reason) {
          return { status: 'rejected' as const, reason }
        } finally {
          if (checklistRequestIdRef.current === requestId && !controller.signal.aborted) {
            setChecklistProgress((progress) =>
              progress ? { ...progress, loaded: Math.min(progress.total, progress.loaded + 1) } : progress,
            )
          }
        }
      })
      if (checklistRequestIdRef.current !== requestId) return
      const models = settledModels.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))

      if (models.length === 0) {
        const firstError = settledModels.find((result) => result.status === 'rejected')
        throw firstError?.status === 'rejected' ? firstError.reason : new Error('Model load failed')
      }

      setChecklistModels(models)
      setChecklistError(models.length < releases.length ? `Loaded ${models.length} / ${releases.length} checklist models` : null)
    } catch (modelError) {
      if (checklistRequestIdRef.current !== requestId || controller.signal.aborted) return
      setChecklistError(modelError instanceof Error ? cleanModelLanguage(modelError.message) : 'Model load failed')
    } finally {
      if (checklistRequestIdRef.current === requestId) {
        setChecklistLoading(false)
        setChecklistProgress(null)
        if (checklistRequestRef.current === controller) checklistRequestRef.current = null
      }
    }
  }, [])

  const applyRankingsData = useCallback((ranking: RankingsData) => {
    const csvInputs = ranking.sources.map((source) => source.csv).filter((csv) => csv.trim())
    if (!hydrateStsLeaderboard(csvInputs)) return false
    setRankingsDatasetVersion((version) => version + 1)
    return true
  }, [])

  const refreshObservability = useCallback(async (signal?: AbortSignal) => {
    setObservabilityLoading(true)
    setObservabilityError(null)
    try {
      const settled = await Promise.allSettled([
        fetchSalesCacheStatus(signal),
        fetchLiveMarketStatus(signal),
        fetchChecklistStatus(signal),
        fetchCardHedgeStatus(signal),
        fetchRankingsStatus(signal),
      ])
      if (signal?.aborted) return

      const [salesCache, liveMarket, checklist, cardHedge, ranking] = settled
      const errors = settled.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
      setObservability({
        checkedAt: new Date().toISOString(),
        salesCache: salesCache.status === 'fulfilled' ? salesCache.value : null,
        liveMarket: liveMarket.status === 'fulfilled' ? liveMarket.value : null,
        checklist: checklist.status === 'fulfilled' ? checklist.value : null,
        cardHedge: cardHedge.status === 'fulfilled' ? cardHedge.value : null,
        ranking: ranking.status === 'fulfilled' ? ranking.value : rankingObservability(),
      })
      setObservabilityError(
        errors.length > 0
          ? `${errors.length.toLocaleString()} status source${errors.length === 1 ? '' : 's'} unavailable`
          : null,
      )
    } finally {
      if (!signal?.aborted) setObservabilityLoading(false)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let request: AbortController | null = null

    const checkForHostedCompUpdates = async () => {
      if (disposed || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
      request?.abort()
      request = new AbortController()
      try {
        const status = await fetchSalesCacheStatus(request.signal)
        if (disposed) return
        const nextVersion = salesCacheDatasetVersion(status)
        const previousVersion = hostedCompVersionRef.current
        hostedCompVersionRef.current = nextVersion
        setObservability((current) =>
          current
            ? {
                ...current,
                checkedAt: new Date().toISOString(),
                salesCache: status,
              }
            : current,
        )
        if (previousVersion && nextVersion && previousVersion !== nextVersion) {
          boardSalesCacheRequestRef.current?.abort()
          boardSalesCacheAttemptedRef.current.clear()
          setActiveSalesCacheModels({})
          setSalesCacheModel(null)
          setCompDatasetVersion((version) => version + 1)
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn('Hosted comp status check failed', error)
        }
      }
    }

    void checkForHostedCompUpdates()
    const interval = window.setInterval(checkForHostedCompUpdates, 45_000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForHostedCompUpdates()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      disposed = true
      request?.abort()
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const handleRefreshRankings = useCallback(async () => {
    setRankingsRefreshing(true)
    setObservabilityError(null)
    try {
      const ranking = await refreshRankings()
      applyRankingsData(ranking)
      setObservability((current) =>
        current
          ? {
              ...current,
              checkedAt: new Date().toISOString(),
              ranking,
            }
          : current,
      )
      await refreshObservability()
    } catch (error) {
      setObservabilityError(cleanModelLanguage(error instanceof Error ? error.message : 'Rankings refresh failed'))
    } finally {
      setRankingsRefreshing(false)
    }
  }, [applyRankingsData, refreshObservability])

  const handleRefreshComps = useCallback(async () => {
    setCompsRefreshing(true)
    setObservabilityError(null)
    try {
      const result = await refreshHostedCardHedgeComps()
      if (!result.ok) throw new Error(result.error || 'Comp refresh did not complete')
      boardSalesCacheAttemptedRef.current.clear()
      setActiveSalesCacheModels({})
      setSalesCacheModel(null)
      setCompDatasetVersion((version) => version + 1)
      await refreshObservability()
    } catch (error) {
      setObservabilityError(cleanModelLanguage(error instanceof Error ? error.message : 'Comp refresh failed'))
    } finally {
      setCompsRefreshing(false)
    }
  }, [refreshObservability])

  const handleRefreshPlayerComp = useCallback(
    async (row: PricingRow) => {
      setCompRefreshState({ rowId: row.id, status: 'loading', message: `Finding recent sold comps for ${row.playerName}...` })
      setObservabilityError(null)
      try {
        const result = await refreshHostedCardHedgeComps({ playerName: row.playerName, releaseYear: row.releaseYear })
        if (!result.ok) throw new Error(result.error || 'Comp refresh did not complete')

        const refreshed = await fetchSalesCachePlayer(row.playerName)
        const matchingBase = soldBaseBucketForRow(row, refreshed)
        if (refreshed.available) {
          setActiveSalesCacheModels((current) => ({ ...current, [salesCacheRecordKey(refreshed.playerName)]: refreshed }))
          if (selectedRowId === row.id) setSalesCacheModel(refreshed)
        }
        boardSalesCacheAttemptedRef.current.delete(salesCacheRecordKey(row.playerName))
        setCompDatasetVersion((version) => version + 1)
        setCompRefreshState({
          rowId: row.id,
          status: matchingBase ? 'success' : 'missing',
          message: matchingBase
            ? `${matchingBase.saleCount.toLocaleString()} sold comps modeled at ${money(matchingBase.modelPrice)}.`
            : 'No trustworthy flagship base-auto match was found yet. The player remains in the retry queue.',
        })
        await refreshObservability()
      } catch (error) {
        const message = cleanModelLanguage(error instanceof Error ? error.message : 'Comp refresh failed')
        setCompRefreshState({ rowId: row.id, status: 'error', message })
        setObservabilityError(message)
      }
    },
    [refreshObservability, selectedRowId],
  )

  useEffect(() => {
    let active = true
    const catalogController = new AbortController()
    const ebayController = new AbortController()
    const liveMarketController = new AbortController()
    const observabilityController = new AbortController()
    const rankingsController = new AbortController()
    fetchEbayStatus(ebayController.signal)
      .then((status) => {
        if (active) setEbayStatus(status)
      })
      .catch((statusError) => {
        if (active && !ebayController.signal.aborted) {
          setEbayStatus({
            configured: false,
            environment: 'production',
            marketplaceId: 'EBAY_US',
            hasCategoryId: false,
            message: statusError instanceof Error ? statusError.message : 'Could not read eBay status',
          })
        }
      })
    fetchLatestLiveMarketSnapshot({ limit: 180 }, liveMarketController.signal)
      .then((snapshot) => {
        if (!active || !snapshot.available) return
        const opportunities = snapshot.listings.map(liveMarketListingToOpportunity)
        setCachedLiveMarket({
          binOpportunities: opportunities.filter((opportunity) => opportunity.listing.kind === 'bin'),
          auctionOpportunities: opportunities.filter((opportunity) => opportunity.listing.kind !== 'bin'),
          observedAt: snapshot.snapshot?.observedAt ?? snapshot.listings[0]?.observedAt ?? new Date().toISOString(),
          listingCount: snapshot.listings.length,
        })
      })
      .catch(() => {
        if (active && !liveMarketController.signal.aborted) setCachedLiveMarket(null)
      })
    fetchLatestLiveMarketSnapshot({ limit: 900, snapshotScope: 'all' }, liveMarketController.signal)
      .then((snapshot) => {
        if (!active || !snapshot.available) return
        const opportunities = snapshot.listings.map(liveMarketListingToOpportunity)
        setCachedFreshLiveMarket({
          binOpportunities: opportunities.filter((opportunity) => opportunity.listing.kind === 'bin'),
          auctionOpportunities: opportunities.filter((opportunity) => opportunity.listing.kind !== 'bin'),
          observedAt: snapshot.snapshot?.observedAt ?? snapshot.listings[0]?.observedAt ?? new Date().toISOString(),
          listingCount: snapshot.listings.length,
          snapshotCount: snapshot.snapshotCount ?? 1,
        })
      })
      .catch(() => {
        if (active && !liveMarketController.signal.aborted) setCachedFreshLiveMarket(null)
      })
    fetchRankingsData(rankingsController.signal)
      .then((ranking) => {
        if (!active || rankingsController.signal.aborted) return
        applyRankingsData(ranking)
        setObservability((current) =>
          current
            ? {
                ...current,
                checkedAt: new Date().toISOString(),
                ranking,
              }
            : current,
        )
      })
      .catch(async () => {
        if (!active || rankingsController.signal.aborted) return
        try {
          const { STS_FALLBACK_CSV_INPUTS } = await import('./lib/stsFallback')
          if (hydrateStsLeaderboard(STS_FALLBACK_CSV_INPUTS)) {
            setRankingsDatasetVersion((version) => version + 1)
          }
        } catch {
          // The value board remains usable without ranking enrichment.
        }
      })
    const modelTimer = window.setTimeout(() => {
      void (async () => {
        const catalog = await loadChecklistCatalog(catalogController.signal)
        if (active) await loadChecklistModel(catalog)
      })()
    }, 0)
    const observabilityTimer = window.setTimeout(() => {
      void refreshObservability(observabilityController.signal)
    }, 0)

    return () => {
      active = false
      catalogController.abort()
      ebayController.abort()
      liveMarketController.abort()
      observabilityController.abort()
      rankingsController.abort()
      window.clearTimeout(modelTimer)
      window.clearTimeout(observabilityTimer)
    }
  }, [applyRankingsData, loadChecklistCatalog, loadChecklistModel, refreshObservability])

  useEffect(() => {
    return () => {
      checklistRequestIdRef.current += 1
      checklistRequestRef.current?.abort()
      coverageRequestRef.current?.abort()
      scanLedgerRequestRef.current?.abort()
      scanQueueRequestRef.current?.abort()
      marlinsSuperfractorRequestRef.current?.abort()
      binRequestRef.current?.abort()
      auctionRequestRef.current?.abort()
      caseHitRequestRef.current?.abort()
      salesCacheRequestRef.current?.abort()
      boardSalesCacheRequestRef.current?.abort()
    }
  }, [])

  const matrix = useMemo(() => {
    void rankingsDatasetVersion
    return buildPricingMatrix(checklistModels)
  }, [checklistModels, rankingsDatasetVersion])
  const hostedAdjustedRows = useMemo(
    () =>
      matrix.rows.map(
        (row) => soldCacheAdjustedRow(row, activeSalesCacheModels[salesCacheRecordKey(row.playerName)] ?? null) ?? row,
      ),
    [activeSalesCacheModels, matrix.rows],
  )
  useEffect(() => {
    void compDatasetVersion
    const pendingNames = playerNamesForPricingRows(matrix.rows).filter((playerName) => {
      const key = salesCacheRecordKey(playerName)
      return key && !boardSalesCacheAttemptedRef.current.has(key)
    })
    if (!pendingNames.length) return

    boardSalesCacheRequestRef.current?.abort()
    const controller = new AbortController()
    boardSalesCacheRequestRef.current = controller
    const attemptedKeys = boardSalesCacheAttemptedRef.current
    const completedKeys = new Set<string>()
    for (const playerName of pendingNames) attemptedKeys.add(salesCacheRecordKey(playerName))

    const batches: string[][] = []
    for (let index = 0; index < pendingNames.length; index += 60) batches.push(pendingNames.slice(index, index + 60))
    const loadBatch = async (batch: string[]) => {
      try {
        return await fetchSalesCachePlayers(batch, controller.signal)
      } catch (firstError) {
        if (controller.signal.aborted) throw firstError
        return fetchSalesCachePlayers(batch, controller.signal)
      }
    }
    const hydrate = async () => {
      for (let index = 0; index < batches.length; index += 3) {
        if (controller.signal.aborted) return
        const batchGroup = batches.slice(index, index + 3)
        const settled = await Promise.allSettled(
          batchGroup.map((batch) => loadBatch(batch)),
        )
        if (controller.signal.aborted) return
        settled.forEach((result, resultIndex) => {
          for (const playerName of batchGroup[resultIndex] ?? []) {
            const key = salesCacheRecordKey(playerName)
            if (result.status === 'fulfilled') completedKeys.add(key)
            else attemptedKeys.delete(key)
          }
        })
        const models = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value.players ?? [] : []))
        if (models.length) {
          const record = salesCacheModelsToRecord(models)
          setActiveSalesCacheModels((current) => ({ ...current, ...record }))
        }
      }
    }

    void hydrate().finally(() => {
      if (boardSalesCacheRequestRef.current === controller) boardSalesCacheRequestRef.current = null
    })
    return () => {
      controller.abort()
      for (const playerName of pendingNames) {
        const key = salesCacheRecordKey(playerName)
        if (!completedKeys.has(key)) attemptedKeys.delete(key)
      }
      if (boardSalesCacheRequestRef.current === controller) boardSalesCacheRequestRef.current = null
    }
  }, [compDatasetVersion, matrix.rows])
  const teamOptions = useMemo(() => buildTeamOptions(matrix.rows), [matrix.rows])
  const selectedTeamOption = useMemo(() => {
    if (teamFilter === 'all') return null
    const teamCode = normalizeTeamCode(teamFilter)
    return teamOptions.find((team) => normalizeTeamCode(team.code) === teamCode) ?? null
  }, [teamFilter, teamOptions])
  const bowman2026Model = useMemo(
    () => checklistModels.find((model) => model.releaseYear === 2026 && model.category === 'bowman') ?? null,
    [checklistModels],
  )
  const binModelOptions = useMemo(() => sortChecklistModels(checklistModels), [checklistModels])
  const marlinsChecklistPlayerNamesByModel = useMemo(() => {
    void rankingsDatasetVersion
    const byModel = new Map<string, string[]>()
    for (const model of binModelOptions) {
      const seen = new Set<string>()
      const names: string[] = []
      for (const player of model.players) {
        const checklistTeam = normalizeTeamCode(player.team)
        const currentTeam = normalizeTeamCode(findStsRanking(player.playerName)?.team)
        if (checklistTeam !== MARLINS_TEAM_CODE && currentTeam !== MARLINS_TEAM_CODE) continue
        const key = scanNameKey(player.playerName)
        if (!key || seen.has(key)) continue
        seen.add(key)
        names.push(player.playerName)
      }
      if (names.length > 0) byModel.set(checklistModelKey(model), names)
    }
    return byModel
  }, [binModelOptions, rankingsDatasetVersion])
  const marlinsChecklistPlayerNames = useMemo(() => {
    const seen = new Set<string>()
    const names: string[] = []
    for (const modelNames of marlinsChecklistPlayerNamesByModel.values()) {
      for (const playerName of modelNames) {
        const key = scanNameKey(playerName)
        if (!key || seen.has(key)) continue
        seen.add(key)
        names.push(playerName)
      }
    }
    return names
  }, [marlinsChecklistPlayerNamesByModel])
  const marlinsChecklistModelCount = marlinsChecklistPlayerNamesByModel.size
  const marlinsChecklistModelSummaries = useMemo(
    () =>
      binModelOptions.flatMap((model) => {
        const key = checklistModelKey(model)
        const names = marlinsChecklistPlayerNamesByModel.get(key) ?? []
        return names.length > 0
          ? [
              {
                key,
                label: checklistModelLabel(model),
                playerCount: names.length,
              },
            ]
          : []
      }),
    [binModelOptions, marlinsChecklistPlayerNamesByModel],
  )
  const marlinsCoveragePlayerKey = useMemo(
    () => marlinsChecklistPlayerNames.map(scanNameKey).filter(Boolean).sort().join('|'),
    [marlinsChecklistPlayerNames],
  )
  const loadMarlinsCoverage = useCallback(async (signal?: AbortSignal) => {
    if (marlinsChecklistPlayerNames.length === 0) {
      setMarlinsCoverage(null)
      return null
    }
    const fallbackCoverage = () =>
      buildStaticChecklistCoverage(binModelOptions, marlinsChecklistPlayerNames, {
        minYear: CHECKLIST_MIN_YEAR,
        staleDays: 60,
        limit: Math.max(160, marlinsChecklistPlayerNames.length),
      })
    setMarlinsCoverageLoading(true)
    setMarlinsCoverageError(null)
    try {
      const coverage = await fetchChecklistCoverage({
        minYear: CHECKLIST_MIN_YEAR,
        staleDays: 60,
        retryCooldownDays: 7,
        source: 'waxpackhero',
        players: marlinsChecklistPlayerNames,
        limit: Math.max(160, marlinsChecklistPlayerNames.length),
        signal,
      })
      if (!signal?.aborted) setMarlinsCoverage(coverage)
      return coverage
    } catch (error) {
      if (!signal?.aborted) {
        const fallback = fallbackCoverage()
        if (fallback.summary.totalPlayers > 0) {
          setMarlinsCoverage(fallback)
          setMarlinsCoverageError(null)
          return fallback
        }
        setMarlinsCoverageError(cleanModelLanguage(error instanceof Error ? error.message : 'Coverage refresh failed'))
      }
      return null
    } finally {
      if (!signal?.aborted) setMarlinsCoverageLoading(false)
    }
  }, [binModelOptions, marlinsChecklistPlayerNames])
  useEffect(() => {
    coverageRequestRef.current?.abort()
    if (!marlinsCoveragePlayerKey) {
      return
    }
    const controller = new AbortController()
    coverageRequestRef.current = controller
    const coverageTimer = window.setTimeout(() => {
      void loadMarlinsCoverage(controller.signal)
    }, 0)
    return () => {
      window.clearTimeout(coverageTimer)
      controller.abort()
      if (coverageRequestRef.current === controller) coverageRequestRef.current = null
    }
  }, [loadMarlinsCoverage, marlinsCoveragePlayerKey])
  const refreshMarlinsCoverage = useCallback(() => {
    coverageRequestRef.current?.abort()
    const controller = new AbortController()
    coverageRequestRef.current = controller
    void loadMarlinsCoverage(controller.signal).finally(() => {
      if (coverageRequestRef.current === controller) coverageRequestRef.current = null
    })
  }, [loadMarlinsCoverage])
  const loadMarlinsScanLedger = useCallback(async (signal?: AbortSignal) => {
    setMarlinsScanLedgerLoading(true)
    setMarlinsScanLedgerError(null)
    try {
      const ledger = await fetchScanCoverageStatus({
        teamCode: MARLINS_TEAM_CODE,
        limit: Math.max(220, marlinsChecklistPlayerNames.length * 4),
      }, signal)
      if (!signal?.aborted) setMarlinsScanLedger(ledger)
      return ledger
    } catch (error) {
      if (!signal?.aborted) {
        setMarlinsScanLedger(null)
        setMarlinsScanLedgerError(cleanModelLanguage(error instanceof Error ? error.message : 'Scan coverage ledger failed'))
      }
      return null
    } finally {
      if (!signal?.aborted) setMarlinsScanLedgerLoading(false)
    }
  }, [marlinsChecklistPlayerNames.length])
  useEffect(() => {
    scanLedgerRequestRef.current?.abort()
    if (!marlinsCoveragePlayerKey) return
    const controller = new AbortController()
    scanLedgerRequestRef.current = controller
    const timer = window.setTimeout(() => {
      void loadMarlinsScanLedger(controller.signal)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      if (scanLedgerRequestRef.current === controller) scanLedgerRequestRef.current = null
    }
  }, [loadMarlinsScanLedger, marlinsCoveragePlayerKey])
  const refreshMarlinsScanLedger = useCallback(() => {
    scanLedgerRequestRef.current?.abort()
    const controller = new AbortController()
    scanLedgerRequestRef.current = controller
    void loadMarlinsScanLedger(controller.signal).finally(() => {
      if (scanLedgerRequestRef.current === controller) scanLedgerRequestRef.current = null
    })
  }, [loadMarlinsScanLedger])
  const loadMarlinsScanQueue = useCallback(async (signal?: AbortSignal) => {
    setMarlinsScanQueueLoading(true)
    setMarlinsScanQueueError(null)
    try {
      const queue = await fetchScanQueueStatus({
        teamCode: MARLINS_TEAM_CODE,
        limit: Math.max(160, marlinsChecklistPlayerNames.length * 3),
      }, signal)
      if (!signal?.aborted) setMarlinsScanQueue(queue)
      return queue
    } catch (error) {
      if (!signal?.aborted) {
        setMarlinsScanQueue(null)
        setMarlinsScanQueueError(cleanModelLanguage(error instanceof Error ? error.message : 'Scan queue failed'))
      }
      return null
    } finally {
      if (!signal?.aborted) setMarlinsScanQueueLoading(false)
    }
  }, [marlinsChecklistPlayerNames.length])
  useEffect(() => {
    scanQueueRequestRef.current?.abort()
    if (!marlinsCoveragePlayerKey) return
    const controller = new AbortController()
    scanQueueRequestRef.current = controller
    const timer = window.setTimeout(() => {
      void loadMarlinsScanQueue(controller.signal)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      if (scanQueueRequestRef.current === controller) scanQueueRequestRef.current = null
    }
  }, [loadMarlinsScanQueue, marlinsCoveragePlayerKey])
  const refreshMarlinsScanQueue = useCallback(() => {
    scanQueueRequestRef.current?.abort()
    const controller = new AbortController()
    scanQueueRequestRef.current = controller
    void loadMarlinsScanQueue(controller.signal).finally(() => {
      if (scanQueueRequestRef.current === controller) scanQueueRequestRef.current = null
    })
  }, [loadMarlinsScanQueue])
  const defaultBinModelKey = useMemo(
    () => (bowman2026Model ? checklistModelKey(bowman2026Model) : binModelOptions[0] ? checklistModelKey(binModelOptions[0]) : ''),
    [binModelOptions, bowman2026Model],
  )
  const effectiveBinModelKey =
    binModelKey === BIN_ALL_MODELS_KEY
      ? BIN_ALL_MODELS_KEY
      : binModelOptions.some((model) => checklistModelKey(model) === binModelKey)
        ? binModelKey
        : defaultBinModelKey
  const selectedBinModels = useMemo(() => {
    if (effectiveBinModelKey === BIN_ALL_MODELS_KEY) return binModelOptions
    const selectedModel = binModelOptions.find((model) => checklistModelKey(model) === effectiveBinModelKey)
    if (selectedModel) return [selectedModel]
    return []
  }, [effectiveBinModelKey, binModelOptions])
  const selectedBinRowsByModel = useMemo(() => rowsBySelectedModels(matrix.rows, selectedBinModels), [matrix.rows, selectedBinModels])
  const selectedBinRows = useMemo(() => flattenPricingRowGroups(selectedBinRowsByModel), [selectedBinRowsByModel])
  const binTargetRowsByModel = useMemo(() => targetRowsByModelFromGroups(selectedBinRowsByModel, 50), [selectedBinRowsByModel])
  const binValueRowsByModel = useMemo(() => valueRowsFromRows(selectedBinRows, 25), [selectedBinRows])
  const binProspectRowsByModel = useMemo(() => prospectRowsFromRows(selectedBinRows, 100), [selectedBinRows])
  const binTargetPlayerCount = useMemo(
    () => selectedBinModels.reduce((total, model) => total + (binTargetRowsByModel.get(checklistModelKey(model))?.length ?? 0), 0),
    [binTargetRowsByModel, selectedBinModels],
  )
  const binValuePlayerCount = useMemo(
    () => selectedBinModels.reduce((total, model) => total + (binValueRowsByModel.get(checklistModelKey(model))?.length ?? 0), 0),
    [binValueRowsByModel, selectedBinModels],
  )
  const binProspectPlayerCount = useMemo(
    () => selectedBinModels.reduce((total, model) => total + (binProspectRowsByModel.get(checklistModelKey(model))?.length ?? 0), 0),
    [binProspectRowsByModel, selectedBinModels],
  )
  const binVariationOptions = useMemo(() => binVariationOptionsForModels(selectedBinModels), [selectedBinModels])
  const rejectedListingKeys = useMemo(() => listingRejectionKeySet(listingRejections), [listingRejections])
  const visibleBinListings = useMemo(
    () => binListings.filter((listing) => !isListingRejected(listing, rejectedListingKeys)),
    [binListings, rejectedListingKeys],
  )
  const visibleAuctionListings = useMemo(
    () => auctionListings.filter((listing) => !isListingRejected(listing, rejectedListingKeys)),
    [auctionListings, rejectedListingKeys],
  )
  const visibleCachedLiveMarket = useMemo(() => {
    if (!cachedLiveMarket) return null
    return {
      ...cachedLiveMarket,
      binOpportunities: cachedLiveMarket.binOpportunities.filter((opportunity) => !isListingRejected(opportunity.listing, rejectedListingKeys)),
      auctionOpportunities: cachedLiveMarket.auctionOpportunities.filter(
        (opportunity) => !isListingRejected(opportunity.listing, rejectedListingKeys),
      ),
    }
  }, [cachedLiveMarket, rejectedListingKeys])
  const visibleCachedFreshLiveMarket = useMemo(() => {
    if (!cachedFreshLiveMarket) return null
    return {
      ...cachedFreshLiveMarket,
      binOpportunities: cachedFreshLiveMarket.binOpportunities.filter((opportunity) => !isListingRejected(opportunity.listing, rejectedListingKeys)),
      auctionOpportunities: cachedFreshLiveMarket.auctionOpportunities.filter(
        (opportunity) => !isListingRejected(opportunity.listing, rejectedListingKeys),
      ),
    }
  }, [cachedFreshLiveMarket, rejectedListingKeys])
  const hiddenBinListingCount = Math.max(0, binListings.length - visibleBinListings.length)
  const binScoreSettings = useMemo(() => {
    const selectedModel = selectedBinModels[0]
    return {
      ...DEFAULT_SETTINGS,
      activeOnly: true,
      checklistOnly: true,
      maxPrice: null,
      minCompCount: 0,
      minDiscountPct: 0,
      minPrice: binMinPrice,
      mode: 'raw-plus-graded' as const,
      releaseScope: effectiveBinModelKey === BIN_ALL_MODELS_KEY ? ('all' as const) : ('selected' as const),
      targetCategory: selectedModel?.category ?? 'bowman',
      targetReleaseYear: selectedModel?.releaseYear ?? 2026,
      targetUniverse:
        binSearchMode === 'low-serial-non-auto'
          ? ('low-serial-non-auto' as const)
          : binSearchMode === 'superfractor'
            ? ('expanded' as const)
            : ('strict' as const),
    }
  }, [binMinPrice, binSearchMode, effectiveBinModelKey, selectedBinModels])
  const binOpportunities = useMemo(
    () => sortBinOpportunities(
      rankOpportunities(visibleBinListings, binScoreSettings, selectedBinModels, activeSalesCacheModels).filter(isWithinBinModelWindow),
      binResultSort,
    ).slice(0, BIN_RENDER_LIMIT),
    [activeSalesCacheModels, binResultSort, binScoreSettings, selectedBinModels, visibleBinListings],
  )
  const auctionOpportunities = useMemo(
    () =>
      sortBinOpportunities(
        rankOpportunities(visibleAuctionListings, binScoreSettings, selectedBinModels, activeSalesCacheModels).filter(isUrgentAuctionOpportunity),
        binResultSort,
      ).slice(0, AUCTION_RENDER_LIMIT),
    [activeSalesCacheModels, binResultSort, binScoreSettings, selectedBinModels, visibleAuctionListings],
  )
  const displayedBinOpportunities = useMemo(
    () => (binScan ? binOpportunities : (visibleCachedLiveMarket?.binOpportunities ?? [])),
    [binOpportunities, binScan, visibleCachedLiveMarket],
  )
  const displayedAuctionOpportunities = useMemo(
    () => (auctionScan ? auctionOpportunities : (visibleCachedLiveMarket?.auctionOpportunities ?? [])),
    [auctionOpportunities, auctionScan, visibleCachedLiveMarket],
  )
  const displayedLiveListingCount =
    (binScan || auctionScan)
      ? visibleBinListings.length + visibleAuctionListings.length
      : (displayedBinOpportunities.length + displayedAuctionOpportunities.length)
  const marlinsRows = useMemo(
    () => sortRows(matrix.rows.filter((row) => rowMatchesTeam(row, MARLINS_TEAM_CODE)), 'dynasty-value'),
    [matrix.rows],
  )
  const marlinsChecklistOpportunities = useMemo(
    () => buildTeamChecklistOpportunities(marlinsChecklistPlayerNames, marlinsChecklistPlayerNamesByModel, binModelOptions, marlinsRows),
    [binModelOptions, marlinsChecklistPlayerNames, marlinsChecklistPlayerNamesByModel, marlinsRows],
  )
  const marlinsRowRankById = useMemo(
    () => new Map(marlinsRows.map((row, index) => [row.id, index + 1] as const)),
    [marlinsRows],
  )
  const marlinsPlayerKeys = useMemo(
    () => new Set([...marlinsChecklistPlayerNames, ...marlinsRows.map((row) => row.playerName)].map((playerName) => scanNameKey(playerName))),
    [marlinsChecklistPlayerNames, marlinsRows],
  )
  const marlinsCachedSource = visibleCachedFreshLiveMarket ?? visibleCachedLiveMarket
  const marlinsBinOpportunitySource = binScan ? displayedBinOpportunities : (marlinsCachedSource?.binOpportunities ?? displayedBinOpportunities)
  const marlinsAuctionOpportunitySource = auctionScan
    ? displayedAuctionOpportunities
    : (marlinsCachedSource?.auctionOpportunities ?? displayedAuctionOpportunities)
  const displayedMarlinsBinOpportunities = useMemo(
    () => marlinsBinOpportunitySource.filter((opportunity) => opportunityMatchesTeamUniverse(opportunity, MARLINS_TEAM_CODE, marlinsPlayerKeys)),
    [marlinsBinOpportunitySource, marlinsPlayerKeys],
  )
  const displayedMarlinsAuctionOpportunities = useMemo(
    () => marlinsAuctionOpportunitySource.filter((opportunity) => opportunityMatchesTeamUniverse(opportunity, MARLINS_TEAM_CODE, marlinsPlayerKeys)),
    [marlinsAuctionOpportunitySource, marlinsPlayerKeys],
  )
  const visibleMarlinsSuperfractorBinScan = useMemo(
    () => (marlinsSuperfractorBinScan ? filterRejectedScanResult(marlinsSuperfractorBinScan, rejectedListingKeys) : null),
    [marlinsSuperfractorBinScan, rejectedListingKeys],
  )
  const visibleMarlinsSuperfractorAuctionScan = useMemo(
    () => (marlinsSuperfractorAuctionScan ? filterRejectedScanResult(marlinsSuperfractorAuctionScan, rejectedListingKeys) : null),
    [marlinsSuperfractorAuctionScan, rejectedListingKeys],
  )
  const waxComps = useMemo(() => parseWaxComps(waxCompText), [waxCompText])
  const waxManualListings = useMemo(() => parseDaveAdamsQuotes(waxDaveAdamsText, waxQuery), [waxDaveAdamsText, waxQuery])
  const waxMarketModel = useMemo(
    () => buildWaxMarketModel(waxComps, parseMoneyInput(waxManualMarketInput) ?? 0, waxQuery),
    [waxComps, waxManualMarketInput, waxQuery],
  )
  const waxOpportunities = useMemo(
    () => rankWaxOpportunities(waxScan?.listings ?? [], waxMarketModel, 0.3),
    [waxMarketModel, waxScan?.listings],
  )

  useEffect(() => {
    const playerNames = playerNamesFromListings([...visibleBinListings, ...visibleAuctionListings]).filter(
      (playerName) => !activeSalesCacheModels[salesCacheRecordKey(playerName)],
    )
    if (playerNames.length === 0) return

    activeSalesCacheRequestRef.current?.abort()
    const controller = new AbortController()
    activeSalesCacheRequestRef.current = controller

    const timer = window.setTimeout(() => {
      fetchSalesCachePlayers(playerNames, controller.signal)
        .then((response) => {
          if (controller.signal.aborted) return
          const record = salesCacheModelsToRecord(response.players ?? [])
          if (Object.keys(record).length > 0) {
            setActiveSalesCacheModels((current) => ({ ...current, ...record }))
          }
        })
        .catch(() => {
          // Sold-cache backfill is additive; scans should keep working if the cache is unavailable.
        })
        .finally(() => {
          if (activeSalesCacheRequestRef.current === controller) activeSalesCacheRequestRef.current = null
        })
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
      if (activeSalesCacheRequestRef.current === controller) activeSalesCacheRequestRef.current = null
    }
  }, [activeSalesCacheModels, visibleAuctionListings, visibleBinListings])

  const trimmedQuery = query.trim()
  const filteredBoard = useMemo(() => {
    const searchedRows = filterPricingRows(hostedAdjustedRows, query)
    const rowsBeforeRank = searchedRows.filter((row) => {
      if (releaseFilter !== 'all' && row.release !== releaseFilter) return false
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
      if (!rowMatchesTeam(row, teamFilter)) return false
      if (!trimmedQuery && !rowMatchesBaseFilter(row, baseSourceFilter)) return false
      return true
    })
    const filteredRows = trimmedQuery ? rowsBeforeRank : rowsBeforeRank.filter((row) => rowMatchesStsFilter(row, stsFilter))
    const rankRelaxedForSearch =
      trimmedQuery.length > 0 &&
      (stsFilter !== 'all' || baseSourceFilter !== 'all') &&
      filteredRows.some((row) => !rowMatchesStsFilter(row, stsFilter) || !rowMatchesBaseFilter(row, baseSourceFilter))
    return {
      rows: sortRows(filteredRows, sortMode),
      rankRelaxedForSearch,
    }
  }, [baseSourceFilter, categoryFilter, hostedAdjustedRows, query, releaseFilter, sortMode, stsFilter, teamFilter, trimmedQuery])
  const visibleRows = filteredBoard.rows
  const rankRelaxedForSearch = filteredBoard.rankRelaxedForSearch
  const hasLeaderboardNarrowing =
    trimmedQuery.length > 0 ||
    releaseFilter !== 'all' ||
    categoryFilter !== 'all' ||
    teamFilter !== 'all' ||
    baseSourceFilter !== 'decision-ready' ||
    stsFilter !== 'all'
  const leaderboardRenderLimit = hasLeaderboardNarrowing ? FILTERED_LEADERBOARD_RENDER_LIMIT : LEADERBOARD_RENDER_LIMIT
  const renderedRows = useMemo(() => visibleRows.slice(0, leaderboardRenderLimit), [leaderboardRenderLimit, visibleRows])
  const visibleRowRankById = useMemo(
    () => new Map(visibleRows.map((row, index) => [row.id, index + 1] as const)),
    [visibleRows],
  )
  const selectedRow = visibleRows.find((row) => row.id === selectedRowId) ?? renderedRows[0]
  const quickPickerRows = useMemo(() => {
    const rows = visibleRows.slice(0, 80)
    if (!selectedRow || rows.some((row) => row.id === selectedRow.id)) return rows
    return [selectedRow, ...rows]
  }, [selectedRow, visibleRows])

  useEffect(() => {
    salesCacheRequestRef.current?.abort()

    const playerName = selectedRow?.playerName
    if (!playerName) return

    const controller = new AbortController()
    salesCacheRequestRef.current = controller
    const timer = window.setTimeout(() => {
      setSalesCacheLoading(true)
      fetchSalesCachePlayer(playerName, controller.signal)
        .then((model) => {
          if (!controller.signal.aborted) {
            setSalesCacheModel(model)
            if (model.available) {
              setActiveSalesCacheModels((current) => ({ ...current, [salesCacheRecordKey(model.playerName)]: model }))
            }
            setSalesCacheError(null)
          }
        })
        .catch((cacheError) => {
          if (controller.signal.aborted) return
          setSalesCacheModel(null)
          setSalesCacheError({
            playerName,
            message: cacheError instanceof Error ? cacheError.message : 'Sold cache read failed',
          })
        })
        .finally(() => {
          if (!controller.signal.aborted) setSalesCacheLoading(false)
          if (salesCacheRequestRef.current === controller) salesCacheRequestRef.current = null
        })
    }, 140)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
      if (salesCacheRequestRef.current === controller) salesCacheRequestRef.current = null
    }
  }, [compDatasetVersion, selectedRow?.playerName])

  const activeSalesCacheModel =
    selectedRow && salesCacheModel && salesCacheRecordKey(salesCacheModel.playerName) === salesCacheRecordKey(selectedRow.playerName)
      ? salesCacheModel
      : null
  const effectiveSelectedRow = useMemo(
    () => soldCacheAdjustedRow(selectedRow, activeSalesCacheModel),
    [activeSalesCacheModel, selectedRow],
  )
  const visibleRowsForDisplay = useMemo(() => {
    if (!effectiveSelectedRow || !selectedRow || effectiveSelectedRow === selectedRow) return visibleRows
    return visibleRows.map((row) => (row.id === effectiveSelectedRow.id ? effectiveSelectedRow : row))
  }, [effectiveSelectedRow, selectedRow, visibleRows])
  const renderedRowsForDisplay = useMemo(() => {
    const adjustedRows =
      effectiveSelectedRow && selectedRow && effectiveSelectedRow !== selectedRow
        ? renderedRows.map((row) => (row.id === effectiveSelectedRow.id ? effectiveSelectedRow : row))
        : renderedRows
    if (!effectiveSelectedRow || adjustedRows.some((row) => row.id === effectiveSelectedRow.id)) return adjustedRows
    if (adjustedRows.length < leaderboardRenderLimit) return [...adjustedRows, effectiveSelectedRow]
    return [...adjustedRows.slice(0, Math.max(leaderboardRenderLimit - 1, 0)), effectiveSelectedRow]
  }, [effectiveSelectedRow, leaderboardRenderLimit, renderedRows, selectedRow])
  const teamScanRows = useMemo(
    () => (selectedTeamOption ? visibleRowsForDisplay.filter(rowHasModel).slice(0, TEAM_DEAL_SCAN_LIMIT) : []),
    [selectedTeamOption, visibleRowsForDisplay],
  )
  const activeSalesCacheError =
    salesCacheError && salesCacheError.playerName === selectedRow?.playerName ? salesCacheError.message : null
  const flagCachedSale = useCallback(async (itemId: string, erroneous: boolean, note?: string) => {
    const flag = await flagSalesCacheSale({ itemId, erroneous, note })
	    setSalesCacheModel((current) => {
	      if (!current?.sales) return current
	      return {
	        ...current,
	        sales: current.sales.map((sale) =>
	          sale.itemId === flag.itemId
	            ? {
	                ...sale,
	                erroneous: flag.erroneous,
	                erroneousNote: flag.note,
	                flagUpdatedAt: flag.updatedAt,
	              }
	            : sale,
	        ),
	      }
	    })
    void refreshObservability()
	  }, [refreshObservability])
	  const mergeCachedBucket = useCallback(
	    async (sourceBucketKey: string, targetBucketKey: string, note?: string, targetMetadata?: SalesCacheMergeTargetMetadata) => {
	      await mergeSalesCacheBucket({ sourceBucketKey, targetBucketKey, note, ...targetMetadata })
	      if (!selectedRow?.playerName) return
	      const refreshed = await fetchSalesCachePlayer(selectedRow.playerName)
	      setSalesCacheModel(refreshed)
	      if (refreshed.available) {
	        setActiveSalesCacheModels((current) => ({ ...current, [salesCacheRecordKey(refreshed.playerName)]: refreshed }))
	      }
	      setSalesCacheError(null)
      void refreshObservability()
	    },
	    [refreshObservability, selectedRow?.playerName],
	  )
  const rankingOnlyMatch = useMemo(() => {
    if (!trimmedQuery || visibleRows.length > 0) return null
    return findStsRanking(trimmedQuery)
  }, [trimmedQuery, visibleRows.length])
  const topBase = matrix.rows[0]?.baseTwmaPrice ?? 0
  const modelUpdatedAt = latestFetchedAt(checklistModels)
  const openMathItems = matrix.missingBaseRows + matrix.unresolvedMultipliers
  const mathHealth = matrix.totalResolvedCells === 0 ? 'waiting' : openMathItems > 0 ? 'warning' : 'healthy'
  const mathHealthLabel =
    mathHealth === 'waiting'
      ? 'Math waiting'
      : mathHealth === 'warning'
        ? `${matrix.missingBaseRows.toLocaleString()} base gaps / ${matrix.unresolvedMultipliers.toLocaleString()} multiplier gaps`
        : 'Math clean'
  const showModelHealth = Boolean(checklistProgress || catalogError || checklistError || matrix.totalResolvedCells === 0)
  const canonicalSourceReady = matrix.totalPricedPlayers > 0

  async function refreshChecklistUniverse() {
    const catalog = await loadChecklistCatalog()
    await loadChecklistModel(catalog)
  }

  function resetBinScan() {
    setBinListings([])
    setBinScan(null)
    setBinError(null)
    setLastRejectedListing(null)
    resetAuctionScan()
  }

  function resetAuctionScan() {
    setAuctionListings([])
    setAuctionScan(null)
    setAuctionError(null)
  }

  function rejectLiveListing(opportunity: Opportunity) {
    const rejection = createListingRejection(opportunity.listing)
    if (!rejection) {
      setBinError('Could not create a stable rejection key for that listing.')
      return
    }

    setListingRejections((current) => {
      const next = upsertListingRejection(current, rejection)
      writeListingRejections(next)
      return next
    })
    setLastRejectedListing(rejection)
  }

  function undoLastListingRejection() {
    if (!lastRejectedListing) return
    setListingRejections((current) => {
      const next = removeListingRejection(current, lastRejectedListing)
      writeListingRejections(next)
      return next
    })
    setLastRejectedListing(null)
  }

  function updateBinSearchMode(mode: BinSearchMode) {
    setBinSearchMode(mode)
    setBinSearchTerm(mode === 'variation' ? (binVariationOptions[0]?.label ?? '') : '')
    resetBinScan()
  }

  function updateBinSearchTerm(term: string) {
    setBinSearchTerm(term)
    resetBinScan()
  }

  function updateBinPlayerScope(scope: BinPlayerScope) {
    setBinPlayerScope(scope)
    resetBinScan()
  }

  function updateBinModelKey(value: string) {
    setBinModelKey(value)
    if (binSearchMode === 'variation') {
      const nextModels =
        value === BIN_ALL_MODELS_KEY
          ? binModelOptions
          : binModelOptions.filter((model) => checklistModelKey(model) === value)
      setBinSearchTerm(binVariationOptionsForModels(nextModels)[0]?.label ?? '')
    }
    resetBinScan()
  }

  function updateBinMinPrice(value: number) {
    setBinMinPrice(value)
    resetBinScan()
  }

  function prepareBoardDealScan(rows: PricingRow[], playerScope: BinPlayerScope = 'value-25') {
    const playerNames = playerNamesForPricingRows(rows)
    const scanModels = modelsForPricingRows(rows, binModelOptions)
    const nextModelKey = scanModels.length === 1 ? checklistModelKey(scanModels[0]) : BIN_ALL_MODELS_KEY

    setBinModelKey(nextModelKey)
    setBinSearchMode('checklist')
    setBinSearchTerm('')
    setBinPlayerScope(playerScope)
    setBinListings([])
    setBinScan(null)
    setBinError(null)
    resetAuctionScan()

    return { scanModels: scanModels.length > 0 ? scanModels : selectedBinModels, playerNames }
  }

  function scanVisibleBoardDeals() {
    const boardRows = renderedRowsForDisplay.slice(0, BOARD_DEAL_SCAN_LIMIT)
    if (boardRows.length === 0) {
      setBinError('No visible board rows are ready to scan.')
      return
    }

    const { scanModels, playerNames } = prepareBoardDealScan(boardRows)
    const scanOptions = {
      models: scanModels,
      playerScope: 'value-25' as const,
      playerNames,
      searchMode: 'checklist' as const,
      searchTerm: '',
    }

    navigateWorkMode('deals')
    revealDealResults()
    void scanEbayBinListings(scanOptions)
    void scanEbayAuctionListings(scanOptions)
  }

  function scanSelectedTeamDeals() {
    if (!selectedTeamOption) {
      setBinError('Choose a current team before scanning team deals.')
      return
    }

    if (teamScanRows.length === 0) {
      setBinError(`No priced ${selectedTeamOption.label} players match the current filters.`)
      return
    }

    const { scanModels, playerNames } = prepareBoardDealScan(teamScanRows)
    const scanOptions = {
      models: scanModels,
      playerScope: 'value-25' as const,
      playerNames,
      searchMode: 'checklist' as const,
      searchTerm: '',
    }

    navigateWorkMode('deals')
    revealDealResults()
    void scanEbayBinListings(scanOptions)
    void scanEbayAuctionListings(scanOptions)
  }

  function scanMarlinsTeamDeals() {
    if (marlinsChecklistPlayerNames.length === 0) {
      setBinError('No Marlins checklist players are loaded yet.')
      return
    }

    const scanModels = binModelOptions.filter((model) => (marlinsChecklistPlayerNamesByModel.get(checklistModelKey(model))?.length ?? 0) > 0)
    if (scanModels.length === 0) {
      setBinError('No loaded checklist model has Marlins players yet.')
      return
    }

    navigateAppRoute('marlins')
    setBinModelKey(scanModels.length === 1 ? checklistModelKey(scanModels[0]) : BIN_ALL_MODELS_KEY)
    setBinSearchMode('checklist')
    setBinSearchTerm('')
    setBinPlayerScope('all')
    setBinListings([])
    setBinScan(null)
    setBinError(null)
    setLastRejectedListing(null)
    resetAuctionScan()

    const scanOptions = {
      models: scanModels,
      playerScope: 'all' as const,
      playerNames: marlinsChecklistPlayerNames,
      searchMode: 'checklist' as const,
      searchTerm: '',
      coverageTeamCode: MARLINS_TEAM_CODE,
      coverageTeamLabel: 'Miami Marlins',
    }

    revealDealResults()
    void scanEbayBinListings(scanOptions)
    void scanEbayAuctionListings(scanOptions)
    void scanMarlinsSuperfractors()
  }

  async function scanMarlinsSuperfractors() {
    if (marlinsChecklistPlayerNames.length === 0) {
      setMarlinsSuperfractorError('No Marlins checklist players are loaded yet.')
      return
    }

    if (!ebayStatus?.configured) {
      setMarlinsSuperfractorError(ebayStatus?.message ?? 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env.local')
      return
    }

    const scanModels = binModelOptions.filter((model) => (marlinsChecklistPlayerNamesByModel.get(checklistModelKey(model))?.length ?? 0) > 0)
    if (scanModels.length === 0) {
      setMarlinsSuperfractorError('No loaded checklist model has Marlins players yet.')
      return
    }

    navigateAppRoute('marlins')
    marlinsSuperfractorRequestRef.current?.abort()
    const controller = new AbortController()
    marlinsSuperfractorRequestRef.current = controller
    setMarlinsSuperfractorLoading(true)
    setMarlinsSuperfractorError(null)

    try {
      const settledScans = await mapWithConcurrency(scanModels, BIN_SCAN_CONCURRENCY, async (model) => {
        const modelPlayerNames = marlinsChecklistPlayerNamesByModel.get(checklistModelKey(model)) ?? []
        try {
          const providerOptions = {
            model,
            minPrice: 0,
            playerLimit: null,
            playerNames: modelPlayerNames,
            searchMode: 'superfractor' as const,
            searchTerm: '',
            limitPerPlayer: 80,
            maxPagesPerPlayer: 1,
            signal: controller.signal,
          }
          const providerScans = await Promise.allSettled([
            fetchEbayBinListings(providerOptions),
            fetchFanaticsCollectBinListings(providerOptions),
            fetchEbayAuctionListings({
              ...providerOptions,
              maxHoursToClose: 24 * 14,
            }),
          ])
          const successfulBinScans = providerScans.flatMap((providerResult, providerIndex) =>
            providerResult.status === 'fulfilled' && providerIndex < 2 ? [providerResult.value] : [],
          )
          const successfulAuctionScans = providerScans.flatMap((providerResult, providerIndex) =>
            providerResult.status === 'fulfilled' && providerIndex === 2 ? [providerResult.value] : [],
          )
          const providerErrors = providerScans.flatMap((providerResult, providerIndex) =>
            providerResult.status === 'rejected'
              ? [
                  {
                    query: `${checklistModelLabel(model)} / ${
                      providerIndex === 0 ? 'eBay' : providerIndex === 1 ? 'Fanatics Collect' : 'eBay auctions'
                    }`,
                    error:
                      providerResult.reason instanceof Error
                        ? providerResult.reason.message
                        : providerIndex === 2
                          ? 'eBay auction Superfractor scan failed'
                          : 'Marketplace Superfractor scan failed',
                  },
                ]
              : [],
          )

          if (successfulBinScans.length === 0 && successfulAuctionScans.length === 0) {
            throw new Error(providerErrors[0]?.error ?? 'Marlins Superfractor scan failed')
          }

          return {
            status: 'fulfilled' as const,
            bin: successfulBinScans.length > 0 ? mergeBinScans(successfulBinScans, providerErrors) : null,
            auction: successfulAuctionScans.length > 0 ? mergeBinScans(successfulAuctionScans) : null,
            errors: successfulBinScans.length > 0 ? [] : providerErrors,
          }
        } catch (reason) {
          return {
            status: 'rejected' as const,
            model,
            reason,
          }
        }
      })
      if (controller.signal.aborted) return

      const successfulBinScans = settledScans.flatMap((result) =>
        result.status === 'fulfilled' && result.bin ? [result.bin] : [],
      )
      const successfulAuctionScans = settledScans.flatMap((result) =>
        result.status === 'fulfilled' && result.auction ? [result.auction] : [],
      )
      const failedScans = settledScans.flatMap((result) =>
        result.status === 'rejected'
          ? [
              {
                query: checklistModelLabel(result.model),
                error: result.reason instanceof Error ? result.reason.message : 'Marlins Superfractor scan failed',
              },
            ]
          : result.errors,
      )

      if (successfulBinScans.length === 0 && successfulAuctionScans.length === 0) {
        throw new Error(failedScans[0]?.error ?? 'Marlins Superfractor scan failed')
      }

      const binResult = successfulBinScans.length > 0 ? mergeBinScans(successfulBinScans, failedScans) : null
      const auctionResult = successfulAuctionScans.length > 0 ? mergeBinScans(successfulAuctionScans, binResult ? [] : failedScans) : null
      setMarlinsSuperfractorBinScan(binResult)
      setMarlinsSuperfractorAuctionScan(auctionResult)
      setMarlinsSuperfractorError(
        binResult ? binScanErrorSummary(binResult) : auctionResult ? binScanErrorSummary(auctionResult) : null,
      )
      try {
        const coverageScans = [binResult, auctionResult].filter((scan): scan is EbayBinScanResult => Boolean(scan))
        const coverageScan = mergeBinScans(coverageScans, failedScans)
        const targets = buildScanCoverageTargets({
          models: scanModels,
          playerNames: marlinsChecklistPlayerNames,
          playerScope: 'all',
          scanResult: coverageScan,
          teamCode: MARLINS_TEAM_CODE,
          targetType: 'superfractor',
        })
        if (targets.length > 0) {
          await saveScanCoverageRun({
            scanType: 'superfractor',
            scanKey: 'superfractor:Miami Marlins:all',
            teamCode: MARLINS_TEAM_CODE,
            teamLabel: 'Miami Marlins',
            targetType: 'superfractor',
            searchMode: 'superfractor',
            playerScope: 'all',
            releaseScope: 'all',
            observedAt: coverageScan.fetchedAt,
            status: failedScans.length > 0 ? 'partial' : 'complete',
            marketplaces: ['ebay', 'fanatics-collect'],
            request: {
              modelKeys: scanModels.map(checklistModelKey),
              playerNames: marlinsChecklistPlayerNames,
              listingsReviewed: coverageScan.listings.length,
              failedScans,
            },
            stats: scanCoverageStatsPayload(coverageScan.stats),
            targets,
          })
          try {
            await scheduleScanQueueJobs({
              source: 'marlins-superfractor-scan',
              teamCode: MARLINS_TEAM_CODE,
              teamLabel: 'Miami Marlins',
              scanType: 'superfractor',
              targetType: 'superfractor',
              jobs: buildScanQueueJobsFromTargets({
                targets,
                scanType: 'superfractor',
                teamCode: MARLINS_TEAM_CODE,
                teamLabel: 'Miami Marlins',
                targetType: 'superfractor',
                searchMode: 'superfractor',
                playerScope: 'all',
                observedAt: coverageScan.fetchedAt,
              }),
            })
            void loadMarlinsScanQueue()
          } catch (queueError) {
            console.warn('Marlins Superfractor scan queue was not scheduled', queueError)
          }
          void loadMarlinsScanLedger()
        }
      } catch (coverageError) {
        console.warn('Marlins Superfractor coverage ledger was not saved', coverageError)
      }
    } catch (scanError) {
      if (controller.signal.aborted) return
      setMarlinsSuperfractorError(friendlyBinError(scanError))
    } finally {
      if (marlinsSuperfractorRequestRef.current === controller) {
        setMarlinsSuperfractorLoading(false)
        marlinsSuperfractorRequestRef.current = null
      }
    }
  }

  function scanMarlinsChecklistPlayer(playerName: string) {
    const playerKey = scanNameKey(playerName)
    if (!playerKey) {
      setBinError('Choose a Marlins checklist player to scan.')
      return
    }

    const scanModels = binModelOptions.filter((model) =>
      model.players.some((player) => scanNameKey(player.playerName) === playerKey),
    )
    if (scanModels.length === 0) {
      setBinError(`No loaded checklist model has ${playerName}.`)
      return
    }

    navigateAppRoute('marlins')
    setBinModelKey(scanModels.length === 1 ? checklistModelKey(scanModels[0]) : BIN_ALL_MODELS_KEY)
    setBinSearchMode('checklist')
    setBinSearchTerm('')
    setBinPlayerScope('all')
    setBinListings([])
    setBinScan(null)
    setBinError(null)
    setLastRejectedListing(null)
    resetAuctionScan()

    const scanOptions = {
      models: scanModels,
      playerScope: 'all' as const,
      playerNames: [playerName],
      searchMode: 'checklist' as const,
      searchTerm: '',
      coverageTeamCode: MARLINS_TEAM_CODE,
      coverageTeamLabel: 'Miami Marlins',
    }

    revealDealResults()
    void scanEbayBinListings(scanOptions)
    void scanEbayAuctionListings(scanOptions)
  }

  function scanBinsForLookupRow(row: PricingRow) {
    const rowModel =
      binModelOptions.find(
        (model) => model.release === row.release && model.releaseYear === row.releaseYear && model.category === row.category,
      ) ?? null
    const scanModels = rowModel ? [rowModel] : selectedBinModels

    setSelectedRowId(row.id)
    setBinModelKey(rowModel ? checklistModelKey(rowModel) : BIN_ALL_MODELS_KEY)
    setBinSearchMode('player')
    setBinSearchTerm(row.playerName)
    setBinPlayerScope('all')
    setBinListings([])
    setBinScan(null)
    setBinError(null)
    resetAuctionScan()

    navigateWorkMode('deals')
    revealDealResults()
    void scanEbayBinListings({
      models: scanModels,
      playerScope: 'all',
      searchMode: 'player',
      searchTerm: row.playerName,
    })
    void scanEbayAuctionListings({
      models: scanModels,
      playerScope: 'all',
      searchMode: 'player',
      searchTerm: row.playerName,
    })
  }

  function scanValue25Targets() {
    navigateWorkMode('deals')
    revealDealResults()
    setBinSearchMode('checklist')
    setBinSearchTerm('')
    setBinPlayerScope('value-25')
    setBinListings([])
    setBinScan(null)
    setBinError(null)
    resetAuctionScan()

    void scanEbayBinListings({
      playerScope: 'value-25',
      searchMode: 'checklist',
      searchTerm: '',
    })
  }

  function scanTop100Prospects() {
    navigateWorkMode('deals')
    revealDealResults()
    setBinSearchMode('checklist')
    setBinSearchTerm('')
    setBinPlayerScope('prospect-100')
    setBinListings([])
    setBinScan(null)
    setBinError(null)
    resetAuctionScan()

    const scanOptions = {
      playerScope: 'prospect-100' as const,
      searchMode: 'checklist' as const,
      searchTerm: '',
    }
    void scanEbayBinListings(scanOptions)
    void scanEbayAuctionListings(scanOptions)
  }

  function scanBaseAutos() {
    navigateWorkMode('deals')
    revealDealResults()
    setBinSearchMode('base-auto')
    setBinSearchTerm('')
    setBinListings([])
    setBinScan(null)
    setBinError(null)
    resetAuctionScan()

    void scanEbayBinListings({
      searchMode: 'base-auto',
      searchTerm: '',
    })
  }

  function scanLowSerialNonAutos() {
    navigateWorkMode('deals')
    revealDealResults()
    setBinSearchMode('low-serial-non-auto')
    setBinSearchTerm('')
    setBinPlayerScope('value-25')
    setBinListings([])
    setBinScan(null)
    setBinError(null)
    resetAuctionScan()

    const scanOptions = {
      playerScope: 'value-25' as const,
      searchMode: 'low-serial-non-auto' as const,
      searchTerm: '',
    }
    void scanEbayBinListings(scanOptions)
    void scanEbayAuctionListings(scanOptions)
  }

  function scanSuperfractors() {
    navigateWorkMode('deals')
    revealDealResults()
    setBinSearchMode('superfractor')
    setBinSearchTerm('')
    setBinPlayerScope('all')
    setBinListings([])
    setBinScan(null)
    setBinError(null)
    resetAuctionScan()

    const scanOptions = {
      playerScope: 'all' as const,
      searchMode: 'superfractor' as const,
      searchTerm: '',
      minPrice: 0,
    }
    void scanEbayBinListings(scanOptions)
    void scanEbayAuctionListings(scanOptions)
  }

  function updateCaseHitMinPrice(value: number) {
    setCaseHitMinPrice(value)
    setCaseHitScan(null)
    setCaseHitError(null)
  }

  function updateCaseHitFamilyFilter(value: 'all' | CaseHitInsertKey) {
    setCaseHitFamilyFilter(value)
    setCaseHitScan(null)
    setCaseHitError(null)
  }

  async function loadSalesCacheModelsForListings(listings: MarketplaceListing[], signal?: AbortSignal) {
    const playerNames = playerNamesFromListings(listings)
    if (playerNames.length === 0) return {}

    const response = await fetchSalesCachePlayers(playerNames, signal)
    const record = salesCacheModelsToRecord(response.players ?? [])
    if (Object.keys(record).length > 0) {
      setActiveSalesCacheModels((current) => ({ ...current, ...record }))
    }
    return record
  }

  async function saveScoredLiveMarketSnapshot(options: {
    scanType: LiveMarketScanType
    scanResult: EbayBinScanResult
    models: ChecklistModel[]
    minPrice: number
    playerScope: BinPlayerScope
    playerNames?: string[]
    searchMode: BinSearchMode
    searchTerm: string
    salesCacheModels?: Record<string, SalesCachePlayerModel>
    coverageTeamCode?: string
    coverageTeamLabel?: string
    coverageTargetType?: string
  }) {
    const scanResult = filterRejectedScanResult(options.scanResult, rejectedListingKeys)
    const activeScoreSettings = scoreSettingsForSearchMode(binScoreSettings, options.searchMode)
    const ranked = sortBinOpportunities(
      rankOpportunities(scanResult.listings, activeScoreSettings, options.models, options.salesCacheModels ?? activeSalesCacheModels).filter(
        (opportunity) => (options.scanType === 'auction' ? isUrgentAuctionOpportunity(opportunity) : isWithinBinModelWindow(opportunity)),
      ),
      binResultSort,
    )
    const capped = capLiveMarketOpportunities(ranked, options.scanType === 'auction' ? 4 : 8).slice(0, options.scanType === 'auction' ? 180 : 360)
    const scanKey = liveMarketScanKey(options)
    try {
      await saveLiveMarketSnapshot({
        scanType: options.scanType,
        scanKey,
        searchMode: options.searchMode,
        playerScope: options.playerScope,
        releaseScope: effectiveBinModelKey === BIN_ALL_MODELS_KEY ? 'all' : 'selected',
        observedAt: options.scanResult.fetchedAt,
        ttlSeconds: options.scanType === 'auction' ? 10 * 60 : 45 * 60,
        request: {
          minPrice: options.minPrice,
          modelKeys: options.models.map(checklistModelKey),
          playerNames: options.playerNames ?? [],
          searchTerm: options.searchTerm.trim(),
          listingsReviewed: options.scanResult.listings.length,
        },
        stats: scanResult.stats,
        listings: capped.map(opportunityToLiveMarketListing),
      })
      void refreshObservability()
    } catch (cacheError) {
      console.warn('Live market snapshot was not saved', cacheError)
    }
    try {
      const targets = buildScanCoverageTargets({
        models: options.models,
        playerNames: options.playerNames,
        playerScope: options.playerScope,
        scanResult,
        opportunities: ranked,
        teamCode: options.coverageTeamCode,
        targetType: options.coverageTargetType ?? 'listing',
      })
      if (targets.length > 0) {
        await saveScanCoverageRun({
          scanType: options.scanType,
          scanKey,
          teamCode: options.coverageTeamCode,
          teamLabel: options.coverageTeamLabel,
          targetType: options.coverageTargetType ?? 'listing',
          searchMode: options.searchMode,
          playerScope: options.playerScope,
          releaseScope: effectiveBinModelKey === BIN_ALL_MODELS_KEY ? 'all' : 'selected',
          observedAt: options.scanResult.fetchedAt,
          status: scanResult.errors.length > 0 ? 'partial' : 'complete',
          marketplaces: ['ebay', 'fanatics-collect'],
          request: {
            minPrice: options.minPrice,
            modelKeys: options.models.map(checklistModelKey),
            playerNames: options.playerNames ?? [],
            searchTerm: options.searchTerm.trim(),
            listingsReviewed: options.scanResult.listings.length,
          },
          stats: scanCoverageStatsPayload(scanResult.stats),
          targets,
        })
        if (options.coverageTeamCode === MARLINS_TEAM_CODE) {
          const targetType = options.coverageTargetType ?? 'listing'
          try {
            await scheduleScanQueueJobs({
              source: 'marlins-live-market-scan',
              teamCode: MARLINS_TEAM_CODE,
              teamLabel: options.coverageTeamLabel,
              scanType: options.scanType,
              targetType,
              jobs: buildScanQueueJobsFromTargets({
                targets,
                scanType: options.scanType,
                teamCode: MARLINS_TEAM_CODE,
                teamLabel: options.coverageTeamLabel ?? 'Miami Marlins',
                targetType,
                searchMode: options.searchMode,
                playerScope: options.playerScope,
                observedAt: options.scanResult.fetchedAt,
              }),
            })
            void loadMarlinsScanQueue()
          } catch (queueError) {
            console.warn('Marlins scan queue was not scheduled', queueError)
          }
          void loadMarlinsScanLedger()
        }
      }
    } catch (coverageError) {
      console.warn('Scan coverage ledger was not saved', coverageError)
    }
  }

  async function scanEbayBinListings(
    overrides: {
      models?: ChecklistModel[]
      minPrice?: number
      playerScope?: BinPlayerScope
      playerNames?: string[]
      searchMode?: BinSearchMode
      searchTerm?: string
      coverageTeamCode?: string
      coverageTeamLabel?: string
      coverageTargetType?: string
    } = {},
  ) {
    const activeModels = overrides.models ?? selectedBinModels
    const activeMinPrice = overrides.minPrice ?? binMinPrice
    const activePlayerScope = overrides.playerScope ?? binPlayerScope
    const activeSearchMode = overrides.searchMode ?? binSearchMode
    const activeSearchTerm = overrides.searchTerm ?? binSearchTerm
    const activePlayerNames = [...new Set((overrides.playerNames ?? []).map((name) => name.trim()).filter(Boolean))]

    if (activeModels.length === 0) {
      setBinError('No checklist model is loaded yet.')
      return
    }

    if (!ebayStatus?.configured) {
      setBinError(ebayStatus?.message ?? 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env.local')
      return
    }

    const playerLoadedModels = activeModels.filter((model) => model.players.length > 0)
    if (playerLoadedModels.length === 0) {
      setBinError('Checklist player lists are not loaded for the selected scope.')
      return
    }

    if ((activeSearchMode === 'player' || activeSearchMode === 'variation') && !activeSearchTerm.trim()) {
      setBinError(activeSearchMode === 'player' ? 'Enter a player name to scan.' : 'Enter a variation to scan.')
      return
    }

    const namedPlayerScope =
      activePlayerNames.length === 0 &&
      (activePlayerScope === 'target-50' || activePlayerScope === 'value-25' || activePlayerScope === 'prospect-100') &&
      activeSearchMode !== 'player'
    const scopedRowsByScanModel = scopedRowsForScan(matrix.rows, playerLoadedModels, activePlayerScope, activeSearchMode)

    if (
      namedPlayerScope &&
      playerLoadedModels.every((model) => (scopedRowsByScanModel.get(checklistModelKey(model))?.length ?? 0) === 0)
    ) {
      setBinError(
        activePlayerScope === 'value-25'
          ? 'Value board needs priced checklist rows matched to ranking signals before scanning.'
          : activePlayerScope === 'prospect-100'
            ? 'Top 100 prospects needs checklist rows matched to formulated prospect ranks before scanning.'
          : 'Target 50 needs priced checklist rows matched to ranking signals before scanning.',
      )
      return
    }
    const scanModels =
      activePlayerNames.length > 0
        ? modelsContainingPlayerNames(playerLoadedModels, activePlayerNames)
        : namedPlayerScope
        ? playerLoadedModels.filter((model) => (scopedRowsByScanModel.get(checklistModelKey(model))?.length ?? 0) > 0)
        : playerLoadedModels

    if (scanModels.length === 0) {
      setBinError('No loaded checklist players match the current board scan.')
      return
    }

    revealDealResults()
    binRequestRef.current?.abort()
    const controller = new AbortController()
    binRequestRef.current = controller
    setBinLoading(true)
    setBinError(null)
    setLastRejectedListing(null)

    try {
      const settledScans = await mapWithConcurrency(scanModels, BIN_SCAN_CONCURRENCY, async (model) => {
        const targetRows =
          namedPlayerScope ? (scopedRowsByScanModel.get(checklistModelKey(model)) ?? []) : []
        const scanPlayerNames =
          activePlayerNames.length > 0
            ? activePlayerNames
            : namedPlayerScope
              ? targetRows.map((row) => row.playerName)
              : undefined
        try {
          const providerOptions = {
            model,
            minPrice: activeMinPrice,
            playerLimit: activePlayerScope === 'top-40' ? 40 : null,
            playerNames: scanPlayerNames,
            searchMode: activeSearchMode,
            searchTerm: activeSearchTerm,
            signal: controller.signal,
          }
          const providerScans = await Promise.allSettled([
            fetchEbayBinListings(providerOptions),
            fetchFanaticsCollectBinListings(providerOptions),
          ])
          const successfulProviderScans = providerScans.flatMap((providerResult) =>
            providerResult.status === 'fulfilled' ? [providerResult.value] : [],
          )
          const providerErrors = providerScans.flatMap((providerResult, providerIndex) =>
            providerResult.status === 'rejected'
              ? [
                  {
                    query: `${checklistModelLabel(model)} / ${providerIndex === 0 ? 'eBay' : 'Fanatics Collect'}`,
                    error:
                      providerResult.reason instanceof Error
                        ? providerResult.reason.message
                        : providerIndex === 0
                          ? 'eBay BIN scan failed'
                          : 'Fanatics Collect scan failed',
                  },
                ]
              : [],
          )
          if (successfulProviderScans.length === 0) {
            throw new Error(providerErrors[0]?.error ?? 'Marketplace BIN scan failed')
          }
          return { status: 'fulfilled' as const, value: mergeBinScans(successfulProviderScans, providerErrors) }
        } catch (reason) {
          return {
            status: 'rejected' as const,
            model,
            reason,
          }
        }
      })
      if (controller.signal.aborted) return

      const successfulScans = settledScans.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      const failedScans = settledScans.flatMap((result) =>
        result.status === 'rejected'
          ? [
              {
                query: checklistModelLabel(result.model),
                error: result.reason instanceof Error ? result.reason.message : 'eBay BIN scan failed',
              },
            ]
          : [],
      )

      if (successfulScans.length === 0) {
        throw new Error(failedScans[0]?.error ?? 'eBay BIN scan failed')
      }

      const scanResult = mergeBinScans(successfulScans, failedScans)
      const visibleScanResult = filterRejectedScanResult(scanResult, rejectedListingKeys)
      setBinListings(scanResult.listings)
      setBinScan(scanResult)
      setBinError(binScanErrorSummary(scanResult))
      let scanSalesCacheModels = activeSalesCacheModels
      try {
        const loadedSalesCacheModels = await loadSalesCacheModelsForListings(visibleScanResult.listings, controller.signal)
        scanSalesCacheModels = { ...activeSalesCacheModels, ...loadedSalesCacheModels }
      } catch {
        scanSalesCacheModels = activeSalesCacheModels
      }
      if (controller.signal.aborted) return
      void saveScoredLiveMarketSnapshot({
        scanType: 'bin',
        scanResult: visibleScanResult,
        models: scanModels,
        minPrice: activeMinPrice,
        playerScope: activePlayerScope,
        playerNames: activePlayerNames,
        searchMode: activeSearchMode,
        searchTerm: activeSearchTerm,
        salesCacheModels: scanSalesCacheModels,
        coverageTeamCode: overrides.coverageTeamCode,
        coverageTeamLabel: overrides.coverageTeamLabel,
        coverageTargetType: overrides.coverageTargetType,
      })
    } catch (scanError) {
      if (controller.signal.aborted) return
      setBinError(friendlyBinError(scanError))
    } finally {
      if (binRequestRef.current === controller) {
        setBinLoading(false)
        binRequestRef.current = null
      }
    }
  }

  async function scanEbayAuctionListings(
    overrides: {
      models?: ChecklistModel[]
      minPrice?: number
      playerScope?: BinPlayerScope
      playerNames?: string[]
      searchMode?: BinSearchMode
      searchTerm?: string
      coverageTeamCode?: string
      coverageTeamLabel?: string
      coverageTargetType?: string
    } = {},
  ) {
    const activeModels = overrides.models ?? selectedBinModels
    const activeMinPrice = overrides.minPrice ?? binMinPrice
    const activePlayerScope = overrides.playerScope ?? binPlayerScope
    const activeSearchMode = overrides.searchMode ?? binSearchMode
    const activeSearchTerm = overrides.searchTerm ?? binSearchTerm
    const activePlayerNames = [...new Set((overrides.playerNames ?? []).map((name) => name.trim()).filter(Boolean))]

    if (activeModels.length === 0) {
      setAuctionError('No checklist model is loaded yet.')
      return
    }

    if (!ebayStatus?.configured) {
      setAuctionError(ebayStatus?.message ?? 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env.local')
      return
    }

    const playerLoadedModels = activeModels.filter((model) => model.players.length > 0)
    if (playerLoadedModels.length === 0) {
      setAuctionError('Checklist player lists are not loaded for the selected scope.')
      return
    }

    if ((activeSearchMode === 'player' || activeSearchMode === 'variation') && !activeSearchTerm.trim()) {
      setAuctionError(activeSearchMode === 'player' ? 'Enter a player name to scan auctions.' : 'Enter a variation to scan auctions.')
      return
    }

    const namedPlayerScope =
      activePlayerNames.length === 0 &&
      (activePlayerScope === 'target-50' || activePlayerScope === 'value-25' || activePlayerScope === 'prospect-100') &&
      activeSearchMode !== 'player'
    const scopedRowsByScanModel = scopedRowsForScan(matrix.rows, playerLoadedModels, activePlayerScope, activeSearchMode)

    if (
      namedPlayerScope &&
      playerLoadedModels.every((model) => (scopedRowsByScanModel.get(checklistModelKey(model))?.length ?? 0) === 0)
    ) {
      setAuctionError(
        activePlayerScope === 'value-25'
          ? 'Value board needs priced checklist rows matched to ranking signals before scanning auctions.'
          : activePlayerScope === 'prospect-100'
            ? 'Top 100 prospects needs checklist rows matched to formulated prospect ranks before scanning auctions.'
          : 'Target 50 needs priced checklist rows matched to ranking signals before scanning auctions.',
      )
      return
    }

    const scanModels =
      activePlayerNames.length > 0
        ? modelsContainingPlayerNames(playerLoadedModels, activePlayerNames)
        : namedPlayerScope
        ? playerLoadedModels.filter((model) => (scopedRowsByScanModel.get(checklistModelKey(model))?.length ?? 0) > 0)
        : playerLoadedModels

    if (scanModels.length === 0) {
      setAuctionError('No loaded checklist players match the current board scan.')
      return
    }

    revealDealResults()
    auctionRequestRef.current?.abort()
    const controller = new AbortController()
    auctionRequestRef.current = controller
    setAuctionLoading(true)
    setAuctionError(null)

    try {
      const settledScans = await mapWithConcurrency(scanModels, BIN_SCAN_CONCURRENCY, async (model) => {
        const targetRows =
          namedPlayerScope ? (scopedRowsByScanModel.get(checklistModelKey(model)) ?? []) : []
        const scanPlayerNames =
          activePlayerNames.length > 0
            ? activePlayerNames
            : namedPlayerScope
              ? targetRows.map((row) => row.playerName)
              : undefined
        try {
          const value = await fetchEbayAuctionListings({
            model,
            minPrice: activeMinPrice,
            maxHoursToClose: AUCTION_MAX_HOURS_TO_CLOSE,
            playerLimit: activePlayerScope === 'top-40' ? 40 : null,
            playerNames: scanPlayerNames,
            searchMode: activeSearchMode,
            searchTerm: activeSearchTerm,
            signal: controller.signal,
          })
          return { status: 'fulfilled' as const, value }
        } catch (reason) {
          return {
            status: 'rejected' as const,
            model,
            reason,
          }
        }
      })
      if (controller.signal.aborted) return

      const successfulScans = settledScans.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      const failedScans = settledScans.flatMap((result) =>
        result.status === 'rejected'
          ? [
              {
                query: checklistModelLabel(result.model),
                error: result.reason instanceof Error ? result.reason.message : 'eBay auction scan failed',
              },
            ]
          : [],
      )

      if (successfulScans.length === 0) {
        throw new Error(failedScans[0]?.error ?? 'eBay auction scan failed')
      }

      const scanResult = mergeBinScans(successfulScans, failedScans)
      const visibleScanResult = filterRejectedScanResult(scanResult, rejectedListingKeys)
      setAuctionListings(scanResult.listings)
      setAuctionScan(scanResult)
      setAuctionError(binScanErrorSummary(scanResult))
      let scanSalesCacheModels = activeSalesCacheModels
      try {
        const loadedSalesCacheModels = await loadSalesCacheModelsForListings(visibleScanResult.listings, controller.signal)
        scanSalesCacheModels = { ...activeSalesCacheModels, ...loadedSalesCacheModels }
      } catch {
        scanSalesCacheModels = activeSalesCacheModels
      }
      if (controller.signal.aborted) return
      void saveScoredLiveMarketSnapshot({
        scanType: 'auction',
        scanResult: visibleScanResult,
        models: scanModels,
        minPrice: activeMinPrice,
        playerScope: activePlayerScope,
        playerNames: activePlayerNames,
        searchMode: activeSearchMode,
        searchTerm: activeSearchTerm,
        salesCacheModels: scanSalesCacheModels,
        coverageTeamCode: overrides.coverageTeamCode,
        coverageTeamLabel: overrides.coverageTeamLabel,
        coverageTargetType: overrides.coverageTargetType,
      })
    } catch (scanError) {
      if (controller.signal.aborted) return
      setAuctionError(friendlyAuctionError(scanError))
    } finally {
      if (auctionRequestRef.current === controller) {
        setAuctionLoading(false)
        auctionRequestRef.current = null
      }
    }
  }

  async function scanCaseHits() {
    if (!ebayStatus?.configured) {
      setCaseHitError(ebayStatus?.message ?? 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env.local')
      return
    }

    caseHitRequestRef.current?.abort()
    const controller = new AbortController()
    caseHitRequestRef.current = controller
    setCaseHitLoading(true)
    setCaseHitError(null)

    try {
      const scanResult = await fetchCaseHits({
        caseHitKeys: caseHitFamilyFilter === 'all' ? undefined : [caseHitFamilyFilter],
        minPrice: caseHitMinPrice,
        signal: controller.signal,
      })
      setCaseHitScan(scanResult)
      setCaseHitError(
        scanResult.errors.length > 0
          ? `${scanResult.errors.length.toLocaleString()} eBay quer${scanResult.errors.length === 1 ? 'y' : 'ies'} failed; ranked successful results.`
          : null,
      )
    } catch (scanError) {
      if (controller.signal.aborted) return
      setCaseHitError(scanError instanceof Error ? scanError.message : 'Case hit scan failed')
    } finally {
      if (caseHitRequestRef.current === controller) {
        setCaseHitLoading(false)
        caseHitRequestRef.current = null
      }
    }
  }

  function updateWaxQuery(value: string) {
    setWaxQuery(value)
    setWaxScan(null)
    setWaxError(null)
  }

  async function scanSealedWax() {
    if (waxQuery.trim().length < 3) {
      setWaxError('Enter a sealed product before scanning.')
      return
    }

    if (!waxIncludeEbay && !waxIncludeFanatics && !waxIncludeDaveAdams && waxManualListings.length === 0) {
      setWaxError('Choose at least one live marketplace or paste a Dave & Adams quote.')
      return
    }

    waxRequestRef.current?.abort()
    const controller = new AbortController()
    waxRequestRef.current = controller
    setWaxLoading(true)
    setWaxError(null)

    try {
      const scanResult = await fetchSealedWaxListings({
        query: waxQuery,
        minPrice: waxMinPrice,
        includeEbay: waxIncludeEbay,
        includeFanatics: waxIncludeFanatics,
        includeDaveAdams: waxIncludeDaveAdams,
        manualListings: waxManualListings,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setWaxScan(scanResult)
      setWaxError(
        scanResult.errors.length > 0
          ? `${scanResult.errors.length.toLocaleString()} marketplace quer${scanResult.errors.length === 1 ? 'y' : 'ies'} failed; ranked successful results.`
          : null,
      )
    } catch (scanError) {
      if (controller.signal.aborted) return
      setWaxError(scanError instanceof Error ? scanError.message : 'Sealed wax scan failed')
    } finally {
      if (waxRequestRef.current === controller) {
        setWaxLoading(false)
        waxRequestRef.current = null
      }
    }
  }

  const visibleBoardScanCount = Math.min(BOARD_DEAL_SCAN_LIMIT, playerNamesForPricingRows(renderedRowsForDisplay).length)
  const primaryBoardScanDisabled =
    (selectedTeamOption ? teamScanRows.length === 0 : visibleBoardScanCount === 0) || binLoading || auctionLoading
  const primaryBoardScanLabel = selectedTeamOption ? `Scan ${selectedTeamOption.label}` : 'Scan Top 25'
  const runPrimaryBoardScan = selectedTeamOption ? scanSelectedTeamDeals : scanVisibleBoardDeals
  return (
    <main className="app-shell valuation-app">
      <section className="workbench-topbar">
        <div className="brand-block">
          <div className="brand-lockup">
            <img className="brand-logo" src="/backstop-logo.jpeg" alt="Backstop Cards" />
            <div>
              <div className="eyebrow">
                <Activity size={14} />
                Live Bowman Market Desk
              </div>
              <h1>Backstop Card Finder</h1>
            </div>
          </div>
          <div className="release-line">
            <span>{releaseOptions.length} releases</span>
            <span>{CHECKLIST_MIN_YEAR}+ seasons</span>
            <span>Bowman / Chrome / Draft</span>
          </div>
        </div>

        <div className="top-actions">
          <button className="primary-button refresh-model-button" type="button" onClick={() => void refreshChecklistUniverse()} disabled={checklistLoading || catalogLoading}>
            <RefreshCw size={16} className={checklistLoading ? 'spin' : undefined} />
            {catalogLoading
              ? 'Discovering'
              : checklistProgress
                ? `Loading ${checklistProgress.loaded}/${checklistProgress.total}`
                : checklistLoading
                  ? 'Refreshing'
                  : 'Refresh'}
          </button>
          <button className="ghost-button export-button" type="button" onClick={() => downloadMatrixCsv(visibleRows)}>
            <Download size={16} />
            Export
          </button>
        </div>
      </section>

      {appRoute === 'desk' ? (
        <WorkflowCommand
          mode={workMode}
          onModeChange={navigateWorkMode}
          totalRows={matrix.totalPlayers}
          pricedRows={matrix.totalPricedPlayers}
          topBase={topBase}
          dealCount={displayedBinOpportunities.length + displayedAuctionOpportunities.length}
          listingCount={displayedLiveListingCount}
          modelReady={matrix.totalResolvedCells > 0}
        />
      ) : null}

      {showModelHealth ? (
        <section className="status-strip valuation-status" aria-label="Model health">
          <span className={`source-chip ${canonicalSourceReady ? 'connected' : 'offline'}`}>
            <Database size={14} />
            {canonicalSourceReady ? 'Canonical model active' : 'Loading canonical model'}
          </span>
          <span>{matrix.totalPricedPlayers.toLocaleString()} players priced</span>
          <span>{matrix.totalResolvedCells.toLocaleString()} card values</span>
          <span className={`model-health-chip ${mathHealth}`}>
            <Sigma size={14} />
            {mathHealth === 'warning' ? `${openMathItems.toLocaleString()} open math items` : mathHealthLabel}
          </span>
          {checklistProgress ? <span>Loading {checklistProgress.loaded.toLocaleString()} / {checklistProgress.total.toLocaleString()}</span> : null}
          <span>{modelUpdatedAt ? `Updated ${new Date(modelUpdatedAt).toLocaleTimeString()}` : 'Awaiting player bases'}</span>
          {catalogError ? <strong>{catalogError}</strong> : null}
          {checklistError ? <strong>{checklistError}</strong> : null}
        </section>
      ) : null}

      {appRoute === 'marlins' ? (
        <MarlinsTeamPage
          rows={marlinsRows}
          selectedId={selectedRowId}
          rankById={marlinsRowRankById}
          binOpportunities={displayedMarlinsBinOpportunities}
          auctionOpportunities={displayedMarlinsAuctionOpportunities}
          binScan={binScan}
          auctionScan={auctionScan}
          superfractorBinScan={visibleMarlinsSuperfractorBinScan}
          superfractorAuctionScan={visibleMarlinsSuperfractorAuctionScan}
          cachedObservedAt={cachedLiveMarket?.observedAt ?? null}
          checklistLoading={checklistLoading}
          binLoading={binLoading}
          auctionLoading={auctionLoading}
          superfractorLoading={marlinsSuperfractorLoading}
          binError={binError}
          auctionError={auctionError}
          superfractorError={marlinsSuperfractorError}
          ebayStatus={ebayStatus}
          modelCount={marlinsChecklistModelCount}
          checklistPlayerCount={marlinsChecklistPlayerNames.length}
          checklistPlayers={marlinsChecklistPlayerNames}
          checklistModelSummaries={marlinsChecklistModelSummaries}
          checklistOpportunities={marlinsChecklistOpportunities}
          coverageEngine={marlinsCoverage}
          coverageLoading={marlinsCoverageLoading}
          coverageError={marlinsCoverageError}
          scanLedger={marlinsScanLedger}
          scanLedgerLoading={marlinsScanLedgerLoading}
          scanLedgerError={marlinsScanLedgerError}
          scanQueue={marlinsScanQueue}
          scanQueueLoading={marlinsScanQueueLoading}
          scanQueueError={marlinsScanQueueError}
          lastRejectedListing={lastRejectedListing}
          resultsRef={dealResultsRef}
          onScanTeam={scanMarlinsTeamDeals}
          onScanSuperfractors={scanMarlinsSuperfractors}
          onRefreshCoverage={refreshMarlinsCoverage}
          onRefreshScanLedger={refreshMarlinsScanLedger}
          onRefreshScanQueue={refreshMarlinsScanQueue}
          onOpenDesk={() => navigateAppRoute('desk')}
          onSelectRow={setSelectedRowId}
          onScanPlayer={scanBinsForLookupRow}
          onScanChecklistPlayer={scanMarlinsChecklistPlayer}
          onRejectListing={rejectLiveListing}
          onUndoRejectListing={undoLastListingRejection}
        />
      ) : workMode === 'lookup' ? (
        <section className="workbench-layout lookup-workflow" aria-label="Value ranking">
          <div className="valuation-workspace">
            <div className="lookup-intent-bar">
              <div className="lookup-intent-copy">
                <span>Top 25 Value Board</span>
                <strong>
                  {effectiveSelectedRow && (selectedRowId || trimmedQuery) ? effectiveSelectedRow.playerName : 'Best rank-to-price gaps'}
                </strong>
                <small>
                  {effectiveSelectedRow && (selectedRowId || trimmedQuery)
                    ? `${effectiveSelectedRow.release.replaceAll('-', ' ')} / ${effectiveSelectedRow.currentTeamName ?? 'team unknown'} / ${formatBasePrice(effectiveSelectedRow)} base auto / ${formatStsLine(effectiveSelectedRow) || 'no rank signal'}`
                    : 'Consensus player rank compared with the latest modeled 1st Bowman base-auto price.'}
                </small>
              </div>
              <label className="lookup-primary-search">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search player, team, set, or variation"
                  aria-label="Search player, current team, release, or variation"
                />
              </label>
              <div className="lookup-action-stack">
                <div className="lookup-intent-meta">
                  <span>{visibleRows.length.toLocaleString()} matches</span>
                  <span>{renderedRowsForDisplay.length.toLocaleString()} shown</span>
                </div>
                <button
                  className="primary-button board-scan-button"
                  type="button"
                  onClick={runPrimaryBoardScan}
                  disabled={primaryBoardScanDisabled}
                >
                  <Radio size={15} />
                  {primaryBoardScanLabel}
                </button>
                <button
                  className="ghost-button calculator-toggle-button"
                  type="button"
                  onClick={() => navigateWorkMode('price')}
                >
                  <Calculator size={15} />
                  Price a Card
                </button>
                <button className="ghost-button board-radar-button" type="button" onClick={() => navigateWorkMode('deals')}>
                  <SlidersHorizontal size={15} />
                  Live Deals
                </button>
              </div>
            </div>

            <div className="toolbar valuation-toolbar" aria-label="Value board filters">
              <label className="filter-select">
                <span>Set</span>
                <select value={releaseFilter} onChange={(event) => setReleaseFilter(event.target.value)}>
                  <option value="all">All sets</option>
                  {releaseOptions.map((release) => (
                    <option value={release.release} key={release.id}>
                      {release.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-select team-filter">
                <span>Team</span>
                <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value as TeamFilter)}>
                  <option value="all">All teams</option>
                  {teamOptions.map((team) => (
                    <option value={team.code} key={team.code}>
                      {team.label} ({team.count.toLocaleString()})
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-select">
                <span>Player pool</span>
                <select value={stsFilter} onChange={(event) => setStsFilter(event.target.value as StsFilter)}>
                  {Object.entries(STS_FILTER_LABELS).map(([filter, label]) => (
                    <option value={filter} key={filter}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-select">
                <span>Sort</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  {Object.entries(SORT_LABELS).map(([mode, label]) => (
                    <option value={mode} key={mode}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <details className="board-advanced-filters">
                <summary>
                  <SlidersHorizontal size={15} />
                  More filters
                </summary>
                <div className="board-advanced-filter-grid">
                  <label className="filter-select family-filter">
                    <span>Card family</span>
                    <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}>
                      <option value="all">All families</option>
                      {CHECKLIST_CATEGORIES.map((category) => (
                        <option value={category} key={category}>
                          {CATEGORY_LABELS[category]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="filter-select base-source-filter">
                    <span>Model quality</span>
                    <select value={baseSourceFilter} onChange={(event) => setBaseSourceFilter(event.target.value as BaseSourceFilter)}>
                      {BASE_FILTER_LABELS.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
              <div className="row-counts">
                <div className="deal-count">
                  <strong>{visibleRows.length.toLocaleString()}</strong>
                  <span>rows</span>
                </div>
                {visibleRows.length > renderedRows.length ? (
                  <div className="deal-count">
                    <strong>{renderedRowsForDisplay.length.toLocaleString()}</strong>
                    <span>shown</span>
                  </div>
                ) : null}
              </div>
            </div>

            {rankRelaxedForSearch ? (
              <div className="search-filter-note">
                <Search size={16} />
                <div>
                  <strong>Showing direct matches outside model and rank filters.</strong>
                  <span>
                    Direct player search keeps set, family, and team context while revealing matching card rows that still need comps.
                  </span>
                </div>
              </div>
            ) : null}

            {rankingOnlyMatch ? <RankingOnlyMatch ranking={rankingOnlyMatch} /> : null}

            <div
              className={`lookup-board-market-grid ${
                displayedBinOpportunities.length + displayedAuctionOpportunities.length > 0 ? 'has-market' : 'board-only'
              }`}
            >
              <Leaderboard
                rows={renderedRowsForDisplay}
                rankById={visibleRowRankById}
                selectedId={selectedRow?.id}
                onSelect={setSelectedRowId}
                onScanPlayer={scanBinsForLookupRow}
                onRefreshPlayer={(row) => void handleRefreshPlayerComp(row)}
                refreshingPlayerId={compRefreshState?.status === 'loading' ? compRefreshState.rowId : null}
                emptyTitle={checklistLoading ? 'Loading player models...' : trimmedQuery ? 'No modeled card match.' : undefined}
                emptyText={
                  checklistLoading
                    ? 'Building the value board from cached checklists and sold comp evidence.'
                    : trimmedQuery
                    ? rankingOnlyMatch
                      ? 'Ranking data exists for this player, but no loaded Bowman card lane has a model yet.'
                      : 'No loaded checklist row matches this search and the current filters.'
                    : undefined
                }
              />
              {displayedBinOpportunities.length + displayedAuctionOpportunities.length > 0 ? (
                <LiveMarketMap
                  binOpportunities={displayedBinOpportunities}
                  auctionOpportunities={displayedAuctionOpportunities}
                  binScan={binScan}
                  auctionScan={auctionScan}
                  cachedObservedAt={cachedLiveMarket?.observedAt ?? null}
                  compact
                />
              ) : null}
            </div>

            {SHOW_LOOKUP_MODEL_LAB && (salesCacheLoading || activeSalesCacheError || activeSalesCacheModel?.available) ? (
              <SalesModelLab
                row={selectedRow}
                model={activeSalesCacheModel}
                loading={salesCacheLoading}
                error={activeSalesCacheError}
                onFlagSale={flagCachedSale}
                onMergeBucket={mergeCachedBucket}
              />
            ) : null}
          </div>

          {SHOW_LOOKUP_SUPPORT_PANELS ? (
            <aside className="detail-rail calculator-rail">
              <>
                <LocalSoldModelPanel
                  playerName={selectedRow?.playerName}
                  row={selectedRow}
                  model={activeSalesCacheModel}
                  loading={salesCacheLoading}
                  error={activeSalesCacheError}
                />
                <LadderDetail row={effectiveSelectedRow} />
                <ModelStatus
                  models={checklistModels}
                  loading={checklistLoading}
                  error={checklistError}
                  onRefresh={() => void loadChecklistModel(releaseOptions)}
                />
              </>
            </aside>
          ) : null}
        </section>
      ) : workMode === 'price' ? (
        <section className="price-workflow" aria-label="Price my card">
          <div className="price-workflow-shell">
            <div className="price-workflow-intro">
              <span className="workflow-kicker">
                <Calculator size={14} />
                Price My Card
              </span>
              <strong>{effectiveSelectedRow ? effectiveSelectedRow.playerName : 'Choose a player'}</strong>
              <small>
                Pick a player, variation, grade, and all-in price. The calculator shows the model, target price, and live-search path without leaving the app.
              </small>
              <label className="price-workflow-search">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search player, team, set, or variation"
                  aria-label="Search player, team, set, or variation for card pricing"
                />
              </label>
              <div className="price-workflow-actions">
                <button className="ghost-button" type="button" onClick={() => navigateWorkMode('lookup')}>
                  <Search size={15} />
                  Value Board
                </button>
                <button className="ghost-button" type="button" onClick={() => navigateWorkMode('deals')}>
                  <Radio size={15} />
                  Live Deals
                </button>
              </div>
            </div>

            <QuickPriceModule
              row={effectiveSelectedRow}
              onScanPlayer={scanBinsForLookupRow}
              pickerRows={quickPickerRows}
              onPickRow={setSelectedRowId}
              onRefreshPlayer={(row) => void handleRefreshPlayerComp(row)}
              refreshState={compRefreshState}
              className="price-page-calculator"
            />
          </div>
        </section>
      ) : workMode === 'deals' ? (
        <section className="deal-workflow" aria-label="Deal finder">
          <BinRadar
            models={selectedBinModels}
            modelOptions={binModelOptions}
            selectedModelKey={effectiveBinModelKey}
            opportunities={binOpportunities}
            auctionOpportunities={auctionOpportunities}
            listingCount={visibleBinListings.length}
            auctionListingCount={visibleAuctionListings.length}
            hiddenListingCount={hiddenBinListingCount}
            lastRejectedListing={lastRejectedListing}
            scan={binScan}
            auctionScan={auctionScan}
            ebayStatus={ebayStatus}
            loading={binLoading}
            auctionLoading={auctionLoading}
            modelLoading={checklistLoading}
            error={binError}
            auctionError={auctionError}
            minPrice={binMinPrice}
            playerScope={binPlayerScope}
            targetPlayerCount={binTargetPlayerCount}
            valuePlayerCount={binValuePlayerCount}
            prospectPlayerCount={binProspectPlayerCount}
            resultSort={binResultSort}
            searchMode={binSearchMode}
            searchTerm={binSearchTerm}
            variationOptions={binVariationOptions}
            onModelChange={updateBinModelKey}
            onMinPriceChange={updateBinMinPrice}
            onPlayerScopeChange={updateBinPlayerScope}
            onResultSortChange={setBinResultSort}
            onSearchModeChange={updateBinSearchMode}
            onSearchTermChange={updateBinSearchTerm}
            onRejectListing={rejectLiveListing}
            onUndoRejectListing={undoLastListingRejection}
            onScan={() => {
              void scanEbayBinListings()
              void scanEbayAuctionListings()
            }}
            onScanAuctions={() => void scanEbayAuctionListings()}
            onScanValueTargets={scanValue25Targets}
            onScanTopProspects={scanTop100Prospects}
            onScanBaseAutos={scanBaseAutos}
            onScanLowSerial={scanLowSerialNonAutos}
            onScanSuperfractors={scanSuperfractors}
            resultsRef={dealResultsRef}
          />
          <LiveMarketMap
            binOpportunities={displayedBinOpportunities}
            auctionOpportunities={displayedAuctionOpportunities}
            binScan={binScan}
            auctionScan={auctionScan}
            cachedObservedAt={cachedLiveMarket?.observedAt ?? null}
          />
        </section>
      ) : workMode === 'health' ? (
        <section className="health-workflow" aria-label="Data health">
          <div className="health-workflow-shell">
            <div className="health-intro-card">
              <span className="workflow-kicker">
                <Activity size={14} />
                Data Health
              </span>
              <strong>Trust the board before you scan.</strong>
              <small>
                Freshness, source coverage, cache status, and API budget live here so the main buying workflow can stay focused.
              </small>
            </div>
            <ObservabilityBoard
              snapshot={observability}
              loading={observabilityLoading}
              error={observabilityError}
              onRefresh={() => void refreshObservability()}
              onRefreshRankings={() => void handleRefreshRankings()}
              onRefreshComps={() => void handleRefreshComps()}
              rankingsRefreshing={rankingsRefreshing}
              compsRefreshing={compsRefreshing}
              fallbackChecklistReleases={releaseOptions.length}
              fallbackChecklistPlayers={matrix.totalPricedPlayers}
            />
            <section className="model-support-dock health-source-stack" aria-label="Data source stack">
              <div className="model-support-grid">
                <SourceStackPanel
                  snapshot={observability}
                  ebayStatus={ebayStatus}
                  releaseCount={releaseOptions.length}
                  modelCount={checklistModels.length}
                  pricedPlayers={matrix.totalPricedPlayers}
                />
              </div>
            </section>
          </div>
        </section>
      ) : workMode === 'wax' ? (
        <section className="sealed-wax-workflow" aria-label="Sealed wax">
          <SealedWaxDesk
            query={waxQuery}
            onQueryChange={updateWaxQuery}
            manualMarketInput={waxManualMarketInput}
            onManualMarketInputChange={setWaxManualMarketInput}
            minPrice={waxMinPrice}
            onMinPriceChange={setWaxMinPrice}
            compText={waxCompText}
            onCompTextChange={setWaxCompText}
            daveAdamsText={waxDaveAdamsText}
            onDaveAdamsTextChange={setWaxDaveAdamsText}
            includeEbay={waxIncludeEbay}
            onIncludeEbayChange={setWaxIncludeEbay}
            includeFanatics={waxIncludeFanatics}
            onIncludeFanaticsChange={setWaxIncludeFanatics}
            includeDaveAdams={waxIncludeDaveAdams}
            onIncludeDaveAdamsChange={setWaxIncludeDaveAdams}
            comps={waxComps}
            model={waxMarketModel}
            scan={waxScan}
            opportunities={waxOpportunities}
            loading={waxLoading}
            error={waxError}
            onScan={() => void scanSealedWax()}
          />
        </section>
      ) : (
        <section className="case-hit-workflow" aria-label="Case hits">
          <div className="case-hit-page-head">
            <span>Case Hits</span>
            <strong>2026 Bowman rare inserts</strong>
          </div>
          <CaseHitLab
            scan={caseHitScan}
            pricingRows={matrix.rows}
            loading={caseHitLoading}
            error={caseHitError}
            ebayStatus={ebayStatus}
            familyFilter={caseHitFamilyFilter}
            onFamilyFilterChange={updateCaseHitFamilyFilter}
            minPrice={caseHitMinPrice}
            onMinPriceChange={updateCaseHitMinPrice}
            onScan={() => void scanCaseHits()}
          />
        </section>
      )}

      {appRoute === 'marlins' || workMode !== 'health' ? (
        <details className="operations-drawer" open={Boolean(observabilityError) || undefined}>
          <summary>
            <span>
              <Activity size={15} />
              Data health
            </span>
            <small>Freshness, queues, rankings, and API budget</small>
          </summary>
          <ObservabilityBoard
            snapshot={observability}
            loading={observabilityLoading}
            error={observabilityError}
            onRefresh={() => void refreshObservability()}
            onRefreshRankings={() => void handleRefreshRankings()}
            onRefreshComps={() => void handleRefreshComps()}
            rankingsRefreshing={rankingsRefreshing}
            compsRefreshing={compsRefreshing}
            fallbackChecklistReleases={releaseOptions.length}
            fallbackChecklistPlayers={matrix.totalPricedPlayers}
          />
        </details>
      ) : null}

      {workMode !== 'health' ? <details className="operations-drawer access-drawer">
        <summary>
          <span>
            <Database size={15} />
            Data access
          </span>
          <small>Checklist and source connection settings</small>
        </summary>
        <section className="model-support-dock" aria-label="Data access">
          <div className="model-support-grid">
            <SourceStackPanel
              snapshot={observability}
              ebayStatus={ebayStatus}
              releaseCount={releaseOptions.length}
              modelCount={checklistModels.length}
              pricedPlayers={matrix.totalPricedPlayers}
            />
          </div>
        </section>
      </details> : null}
    </main>
  )
}

export default App
