import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  BookOpenCheck,
  Brain,
  Calculator,
  Database,
  Download,
  ExternalLink,
  Gem,
  KeyRound,
  Layers,
  LogOut,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sigma,
  TableProperties,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  clearPulseSession,
  fetchChecklistCatalog,
  fetchChecklistModel,
  getPulseStatus,
  getStoredPulseSession,
  isPulseAuthError,
  loginProspectPulse,
  savePulseSession,
  type PulseAuthMode,
} from './lib/prospectPulse'
import {
  fetchEbayBinListings,
  fetchEbayStatus,
  isEbayRateLimitError,
  type EbayBinScanResult,
  type EbayBinSearchMode,
  type EbayStatus,
} from './lib/ebay'
import { impliedDynastyBasePrice, scoreDynastyValueOpportunity } from './lib/dynastyValue'
import { fetchEbaySoldVariationModel, type EbaySoldModelResult } from './lib/ebaySold'
import { MARKET_MOVERS_CAPTURE_BOOKMARKLET, buildMarketMoversSoldModel } from './lib/marketMovers'
import { findStsRanking, scoreStsMomentum } from './lib/stsRankings'
import {
  CRYSTALLIZED_CHECKLIST,
  buildCaseHitAutoEquivalent,
  fetchCrystallizedCaseHits,
  type CaseHitOpportunity,
  type CaseHitScanResult,
} from './lib/caseHits'
import {
  buildPricingMatrix,
  filterPricingRows,
  formatMultiplier,
  pickPreviewQuotes,
  type BasePriceSource,
  type PricingRow,
  type VariationQuote,
} from './lib/matrix'
import { DEFAULT_SETTINGS, estimateGradedPremium, rankOpportunities } from './lib/scoring'
import type { ChecklistModel, GradingCompany, Opportunity, ProspectPulseListing } from './types'

type CategoryFilter = 'all' | ChecklistModel['category']
type BaseSourceFilter = 'all' | BasePriceSource
type StsFilter = 'all' | 'ranked' | 'prospects' | 'mlb' | 'unmatched'
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
type BinPlayerScope = 'all' | 'top-40' | 'target-50' | 'value-25'
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
type WorkMode = 'lookup' | 'deals' | 'beta'

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
}

const SORT_LABELS: Record<SortMode, string> = {
  'base-desc': 'Model Base',
  'sts-rank': 'Dynasty Rank',
  'prospect-rank': 'Prospect Rank',
  'dynasty-score': 'Dynasty Score',
  'dynasty-value': 'Dynasty Value',
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

const BIN_RESULT_SORT_LABELS: Record<BinResultSort, string> = {
  'conviction-desc': 'Conviction',
  'edge-desc': 'Spread',
  'score-desc': 'Model score',
  'sts-rank': 'Dynasty rank',
  'prospect-rank': 'Prospect rank',
  'trend-desc': 'Trend',
  'price-asc': 'Price low',
  'price-desc': 'Price high',
  'roi-desc': 'ROI',
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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const scoreDynastyBaseValue = scoreDynastyValueOpportunity

function sortRows(rows: PricingRow[], sortMode: SortMode) {
  const sorted = [...rows]
  if (sortMode === 'sts-rank') {
    return sorted.sort((left, right) => rankOrInfinity(left.stsRank) - rankOrInfinity(right.stsRank) || right.baseTwmaPrice - left.baseTwmaPrice)
  }
  if (sortMode === 'prospect-rank') {
    return sorted.sort(
      (left, right) =>
        rankOrInfinity(left.stsProspectRank) - rankOrInfinity(right.stsProspectRank) ||
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
        scoreDynastyBaseValue(right) - scoreDynastyBaseValue(left) ||
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
        rankOrInfinity(left.stsProspectRank) - rankOrInfinity(right.stsProspectRank),
    )
  }
  if (sortMode === 'bin-target') {
    return sorted.sort(
      (left, right) =>
        (right.stsBinTargetScore ?? -1) - (left.stsBinTargetScore ?? -1) ||
        (right.stsRiserValueScore ?? -1) - (left.stsRiserValueScore ?? -1) ||
        rankOrInfinity(left.stsProspectRank) - rankOrInfinity(right.stsProspectRank),
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

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

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
const CHECKLIST_MIN_YEAR = 2021
const CHECKLIST_LOAD_CONCURRENCY = 6
const BIN_SCAN_CONCURRENCY = 2
const LEADERBOARD_RENDER_LIMIT = 500
const BIN_RENDER_LIMIT = 40
const BIN_MODEL_WINDOW_PCT = 0.2
const CASE_HIT_RENDER_LIMIT = 24
const BIN_ALL_MODELS_KEY = 'all-checklists'

function money(value: number) {
  return currency.format(value)
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function parseMoneyInput(value: string) {
  const parsed = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function serialDenominatorFromLabel(label: string) {
  const match = label.match(/\/\s*(\d{1,4})\b/)
  return match ? Number(match[1]) : null
}

function pricingVerdict(spread: number | null, modelValue: number, askPrice: number | null) {
  if (!askPrice) return { label: 'No Ask', tone: 'neutral' as const }
  if (askPrice <= modelValue * 0.78) return { label: 'Buy Zone', tone: 'good' as const }
  if (spread !== null && spread >= 0) return { label: 'Under Model', tone: 'good' as const }
  if (askPrice <= modelValue * 1.2) return { label: 'Near Model', tone: 'watch' as const }
  return { label: 'Rich', tone: 'risk' as const }
}

function listingGradingLabel(listing: Opportunity['listing']) {
  if (!listing.isEligibleGraded) return null
  const company = listing.gradingCompany ?? String(listing.grader ?? 'Graded').toUpperCase()
  const grade = listing.gradeNumber ?? listing.grade
  return grade ? `${company} ${grade}` : company
}

function friendlySoldModelError(error: unknown) {
  const message = error instanceof Error ? error.message : 'eBay sold model scan failed'
  if (/access denied|insufficient permissions|marketplace.?insights/i.test(message)) {
    return 'eBay sold listings require Marketplace Insights access on this keyset. The modeling layer is ready; eBay is blocking the sold-comps endpoint for now.'
  }
  return message
}

function soldModelAccessBlocked(message: string | null) {
  return Boolean(message && /access denied|insufficient permissions|marketplace.?insights|sold-comps endpoint/i.test(message))
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

function binScanErrorSummary(scan: EbayBinScanResult) {
  if (scan.errors.length === 0) return null
  if (scan.errors.some((error) => ebayRateLimitMessage(error.error))) {
    return 'eBay throttled some queries; showing successful results. Wait a minute before another broad scan.'
  }
  return `${scan.errors.length.toLocaleString()} eBay quer${scan.errors.length === 1 ? 'y' : 'ies'} failed; ranked successful results.`
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

function formatBaseSource(source: BasePriceSource) {
  return SOURCE_LABELS[source]
}

function formatModelSource(source: string) {
  const labels: Record<string, string> = {
    'listing-comps': 'comp-led model',
    'base-twma-blend': 'base blend',
    'player-variation': 'player comp',
    'player-base-curve': 'base ladder',
    'release-curve': 'set curve',
  }
  return labels[source] ?? cleanModelLanguage(source.replaceAll('-', ' '))
}

function formatStsLine(row: PricingRow) {
  const parts = []
  if (row.stsRank) parts.push(`Rank #${row.stsRank.toLocaleString()}`)
  if (row.stsProspectRank) parts.push(`Prospect #${row.stsProspectRank.toLocaleString()}`)
  if (row.stsDynastyScore !== null || row.stsRank !== null) parts.push(`${scoreDynastyBaseValue(row).toFixed(1)} value`)
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

function checklistModelKey(model: ChecklistModel) {
  return `${model.category}:${model.releaseYear}:${model.release}`
}

function pricingRowModelKey(row: PricingRow) {
  return `${row.category}:${row.releaseYear}:${row.release}`
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

function targetRowsForModel(rows: PricingRow[], model: ChecklistModel, limit = 50) {
  const modelRelease = model.release
  return rows
    .filter((row) => row.release === modelRelease && row.releaseYear === model.releaseYear && row.category === model.category && row.stsBinTargetScore !== null)
    .sort(
      (left, right) =>
        (right.stsBinTargetScore ?? -1) - (left.stsBinTargetScore ?? -1) ||
        (right.stsMomentumScore ?? -1) - (left.stsMomentumScore ?? -1) ||
        rankOrInfinity(left.stsProspectRank) - rankOrInfinity(right.stsProspectRank) ||
        right.baseTwmaPrice - left.baseTwmaPrice,
    )
    .slice(0, limit)
}

function valueRowsForModels(rows: PricingRow[], models: ChecklistModel[], limit = 25) {
  const modelKeys = new Set(models.map(checklistModelKey))
  const selectedRows = rows
    .filter((row) => modelKeys.has(pricingRowModelKey(row)))
    .map((row) => ({ row, score: scoreDynastyValueOpportunity(row) }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.row.stsMomentumScore ?? -1) - (left.row.stsMomentumScore ?? -1) ||
        rankOrInfinity(left.row.stsProspectRank) - rankOrInfinity(right.row.stsProspectRank) ||
        left.row.baseTwmaPrice - right.row.baseTwmaPrice,
    )
    .slice(0, limit)
    .map(({ row }) => row)

  return selectedRows.reduce((groups, row) => {
    const key = pricingRowModelKey(row)
    const modelRows = groups.get(key) ?? []
    modelRows.push(row)
    groups.set(key, modelRows)
    return groups
  }, new Map<string, PricingRow[]>())
}

function opportunityStsContext(opportunity: Opportunity) {
  const ranking = findStsRanking(opportunity.listing.playerName)
  return {
    ranking,
    rank: ranking?.rank ?? null,
    prospectRank: ranking?.prospectRank ?? null,
    change30d: ranking?.change30d ?? null,
    momentumScore: ranking ? scoreStsMomentum(ranking) : null,
  }
}

function binConvictionScore(opportunity: Opportunity, sts = opportunityStsContext(opportunity)) {
  const roiSignal = clampNumber((opportunity.expectedRoiPct + 0.05) / 0.75, 0, 1) * 27
  const dollarSignal = clampNumber(Math.log1p(Math.max(0, opportunity.edgeDollars)) / Math.log1p(2_500), 0, 1) * 24
  const trustSignal = clampNumber(opportunity.trustScore / 100, 0, 1) * 22
  const momentumSignal = clampNumber(((sts.momentumScore ?? 50) - 38) / 42, 0, 1) * 14
  const rankSignal = sts.rank ? clampNumber((1_200 - Math.min(sts.rank, 1_200)) / 1_200, 0, 1) * 7 : 0
  const slabSignal = opportunity.gradingMultiplier ? clampNumber((opportunity.gradingMultiplier - 1) / 1.55, 0, 1) * 6 : 0
  return Math.round(roiSignal + dollarSignal + trustSignal + momentumSignal + rankSignal + slabSignal)
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
        rankOrInfinity(left.sts.prospectRank) - rankOrInfinity(right.sts.prospectRank) ||
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
  return opportunity.fairValue > 0 && opportunity.listing.allInPrice <= opportunity.fairValue * (1 + BIN_MODEL_WINDOW_PCT)
}

function dedupeBinListings(listings: ProspectPulseListing[]) {
  const seen = new Set<string>()
  const deduped: ProspectPulseListing[] = []
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
      },
    ),
  }
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
    'Dynasty Value Score',
    'Implied Signal Base',
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
    const hasDynastySignal = row.stsDynastyScore !== null || row.stsRank !== null
    return row.ladder.map((quote) => [
      row.rank,
      row.playerName,
      row.release,
      row.stsRank ?? '',
      row.stsProspectRank ?? '',
      row.stsDynastyScore?.toFixed(1) ?? '',
      hasDynastySignal ? scoreDynastyValueOpportunity(row).toFixed(1) : '',
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
      row.baseTwmaPrice.toFixed(2),
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

function StatTile({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: typeof BadgeDollarSign
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warn' | 'info'
}) {
  return (
    <div className="stat-tile">
      <div className={`stat-icon ${tone}`}>
        <Icon size={18} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function MarketTape({
  rowCount,
  variationCount,
  solvedCells,
  topBase,
  loadedSets,
  liveConnected,
  sourceLabel,
}: {
  rowCount: number
  variationCount: number
  solvedCells: number
  topBase: number
  loadedSets: number
  liveConnected: boolean
  sourceLabel: string
}) {
  const cells = [
    ['SETS', loadedSets > 0 ? loadedSets.toLocaleString() : '--', 'neutral'],
    ['PLAYERS', rowCount.toLocaleString(), rowCount > 0 ? 'up' : 'flat'],
    ['VARIATIONS', variationCount.toLocaleString(), variationCount > 0 ? 'up' : 'flat'],
    ['SOLVED', solvedCells.toLocaleString(), solvedCells > 0 ? 'up' : 'flat'],
    ['TOP BASE', money(topBase), topBase > 0 ? 'up' : 'flat'],
    ['DATA', sourceLabel, liveConnected ? 'up' : 'flat'],
  ] as const

  return (
    <section className="market-tape" aria-label="Market tape">
      {cells.map(([label, value, tone]) => (
        <div className={`tape-cell ${tone}`} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  )
}

function WorkflowCommand({
  mode,
  onModeChange,
  pricedRows,
  topBase,
  dealCount,
  listingCount,
  modelReady,
}: {
  mode: WorkMode
  onModeChange: (mode: WorkMode) => void
  pricedRows: number
  topBase: number
  dealCount: number
  listingCount: number
  modelReady: boolean
}) {
  const modeTitle = mode === 'lookup' ? 'Modeled Price' : mode === 'deals' ? 'Deal Finder' : 'Beta Labs'

  return (
    <section className="workflow-command" aria-label="Bowman auto desk">
      <div className="workflow-command-copy">
        <span className="workflow-kicker">
          <Activity size={14} />
          Bowman Auto Desk
        </span>
        <h2>{modeTitle}</h2>
        <div className="workflow-mini-tape">
          <span>{modelReady ? 'Model live' : 'Model loading'}</span>
          <span>{pricedRows.toLocaleString()} players</span>
          <span>{dealCount.toLocaleString()} candidates</span>
        </div>
      </div>

      <div className="workflow-mode-grid">
        <button
          className={`workflow-mode-card ${mode === 'lookup' ? 'active' : ''}`}
          type="button"
          onClick={() => onModeChange('lookup')}
          aria-pressed={mode === 'lookup'}
        >
          <span className="workflow-icon">
            <Search size={19} />
          </span>
          <span className="workflow-card-copy">
            <span>Modeled Price</span>
            <strong>Lookup Board</strong>
            <small>{pricedRows.toLocaleString()} modeled players</small>
          </span>
          <span className="workflow-value">{money(topBase)}</span>
        </button>

        <button
          className={`workflow-mode-card ${mode === 'deals' ? 'active' : ''}`}
          type="button"
          onClick={() => onModeChange('deals')}
          aria-pressed={mode === 'deals'}
        >
          <span className="workflow-icon">
            <Radio size={19} />
          </span>
          <span className="workflow-card-copy">
            <span>Deal Finder</span>
            <strong>Active BIN Radar</strong>
            <small>{listingCount.toLocaleString()} active listings scanned</small>
          </span>
          <span className="workflow-value">{dealCount.toLocaleString()}</span>
        </button>
      </div>
    </section>
  )
}

function PreviewQuote({ quote }: { quote: VariationQuote }) {
  return (
    <span className="preview-quote">
      <strong>{money(quote.price)}</strong>
      <small>{compactVariation(quote.label)}</small>
    </span>
  )
}

function Leaderboard({
  rows,
  totalRows,
  selectedId,
  onSelect,
  onScanPlayer,
  emptyTitle = 'No priced players loaded.',
  emptyText = 'Connect market data to load player base prices.',
}: {
  rows: PricingRow[]
  totalRows: number
  selectedId?: string
  onSelect: (rowId: string) => void
  onScanPlayer: (row: PricingRow) => void
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
        <span>Model Base</span>
        <span>{totalRows > rows.length ? `Curve: top ${rows.length} of ${totalRows}` : 'Curve'}</span>
      </div>
      <div className="leaderboard-list">
        {rows.map((row) => (
          <article
            className={`leaderboard-row ${selectedId === row.id ? 'selected' : ''}`}
            key={row.id}
            onClick={() => onSelect(row.id)}
            aria-selected={selectedId === row.id}
          >
            <span className="rank-chip">{row.rank}</span>
            <span className="player-chip">
              <button
                className="leaderboard-player-button"
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(row.id)
                  onScanPlayer(row)
                }}
                aria-label={`Scan active eBay BINs for ${row.playerName}`}
              >
                <strong>{row.playerName}</strong>
                <span>
                  <Radio size={12} />
                  Scan BINs
                </span>
              </button>
              <small>{row.release}</small>
              {row.stsName ? (
                <span className="sts-inline">
                  <span>{formatStsLine(row)}</span>
                  <span className={`change-pill ${changeClassName(row.stsChange30d)}`}>30D {formatSigned(row.stsChange30d)}</span>
                </span>
              ) : (
                <span className="sts-inline muted">Unranked</span>
              )}
            </span>
            <span className="money-chip">
              <strong>{money(row.baseTwmaPrice)}</strong>
              <small>{formatBaseMethod(row.baseMethod)}</small>
            </span>
            <span className="curve-strip">
              {pickPreviewQuotes(row.ladder).map((quote) => (
                <PreviewQuote quote={quote} key={`${row.id}:${quote.key}`} />
              ))}
            </span>
          </article>
        ))}
      </div>
    </div>
  )
}

function RankingOnlyMatch({ ranking }: { ranking: NonNullable<ReturnType<typeof findStsRanking>> }) {
  return (
    <div className="ranking-only-card">
      <Brain size={18} />
      <div>
        <span>Ranking-only match</span>
        <strong>{ranking.name}</strong>
        <small>
          {[ranking.team, ranking.pos, ranking.level, ranking.age ? `Age ${ranking.age}` : null].filter(Boolean).join(' / ')}
        </small>
      </div>
      <div className="ranking-only-stats">
        <span>Rank #{ranking.rank?.toLocaleString() ?? '--'}</span>
        <span>Prospect #{ranking.prospectRank?.toLocaleString() ?? '--'}</span>
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

  const topQuote = row.ladder.reduce((best, quote) => (quote.price > best.price ? quote : best), row.ladder[0])
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
          <span>Model Base</span>
          <strong>{money(row.baseTwmaPrice)}</strong>
        </div>
        <div>
          <span>Base</span>
          <strong>{formatBaseSource(row.basePriceSource)}</strong>
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
            <span>Value Signal</span>
            <strong>{money(impliedDynastyBasePrice(row))}</strong>
          </div>
        ) : null}
      </div>

      {row.stsName ? (
        <div className="sts-context-panel">
          <div className="sts-context-head">
            <div>
              <span>Dynasty Signal</span>
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
          <div className="sts-change-grid" aria-label="Rank changes">
            {stsChangeItems.map(([label, value]) => (
              <span className={`change-pill ${changeClassName(value)}`} key={label}>
                {label} {formatSigned(value)}
              </span>
            ))}
          </div>
          {stsSummary ? <p>{stsSummary}</p> : null}
        </div>
      ) : (
        <div className="sts-context-panel muted">
          <span>Dynasty Signal</span>
          <strong>No ranking match for this checklist name.</strong>
        </div>
      )}

      <div className="base-source-note">
        <span>Market base {money(row.pulseBasePrice)}</span>
        <span>{formatBaseMethod(row.baseMethod)}</span>
        {row.baseAuctionSales + row.baseBinSales > 0 ? (
          <span>
            Auction/BIN {row.baseAuctionSales}/{row.baseBinSales}
          </span>
        ) : null}
        {row.baseEffectiveSales > 0 ? <span>{row.baseEffectiveSales.toFixed(1)} effective sales</span> : null}
      </div>

      <div className="variation-grid">
        {row.ladder.map((quote) => (
          <div className={`variation-card ${quote.key === topQuote.key ? 'top' : ''}`} key={`${row.id}:detail:${quote.key}`}>
            <span>{compactVariation(quote.label)}</span>
            <strong>{money(quote.price)}</strong>
            <small>
              {money(row.baseTwmaPrice)} x {formatMultiplier(quote.multiplier)}
            </small>
          </div>
        ))}
      </div>
    </section>
  )
}

function QuickPriceModule({
  row,
  onScanPlayer,
  pickerRows,
  onPickRow,
  className,
}: {
  row?: PricingRow
  onScanPlayer: (row: PricingRow) => void
  pickerRows?: PricingRow[]
  onPickRow?: (rowId: string) => void
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
  const watchCeiling = modelValue * (1 + BIN_MODEL_WINDOW_PCT)
  const verdict = pricingVerdict(spread, modelValue, askPrice)
  const gradeLabel = gradeModel.option.label
  const canPickPlayer = Boolean(pickerRows?.length && onPickRow)

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
          <span>Buy Zone</span>
          <strong>{money(buyZone)}</strong>
          <small>{DEFAULT_SETTINGS.targetMarginPct}% margin</small>
        </div>
        <div>
          <span>Watch Cap</span>
          <strong>{money(watchCeiling)}</strong>
          <small>20% window</small>
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
          <span className={roi !== null && roi >= 0 ? 'good' : 'risk'}>{roi !== null ? percent(roi) : '--'} ROI</span>
        </div>
      ) : null}

      <div className="quick-source-strip">
        <span>{formatBaseSource(activeRow.basePriceSource)}</span>
        {activeRow.stsRank ? <span>Rank #{activeRow.stsRank.toLocaleString()}</span> : null}
        {gradeModel.serialDenominator ? <span>/{gradeModel.serialDenominator}</span> : null}
      </div>

      <button className="ghost-button quick-scan-button" type="button" onClick={() => onScanPlayer(activeRow)}>
        <Radio size={15} />
        Scan BINs
      </button>
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
    : models.some((model) => model.source === 'authenticated-player-model')
      ? `Player base data loaded: ${loadedPlayers.toLocaleString()}`
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
      <div className={`model-source ${models.some((model) => model.source === 'authenticated-player-model') ? 'connected' : ''}`}>
        <Brain size={16} />
        <span>{sourceLabel}</span>
      </div>
    </section>
  )
}

function ProspectPulsePanel({
  liveConnected,
  authMode,
  authEmail,
  authPassword,
  authBusy,
  onEmailChange,
  onPasswordChange,
  onConnect,
  onDisconnect,
}: {
  liveConnected: boolean
  authMode: PulseAuthMode
  authEmail: string
  authPassword: string
  authBusy: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onConnect: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDisconnect: () => void
}) {
  const isServerManaged = liveConnected && authMode === 'server'
  const connectedLabel = isServerManaged ? 'Managed data session' : 'Connected'
  const connectedIdentity = isServerManaged ? 'Private market feed' : authEmail || 'Local browser session'

  return (
    <section className="detail-card connection-card source-card">
      <div className="section-title">
        <KeyRound size={18} />
        <h2>Market Data</h2>
      </div>
      {liveConnected ? (
        <div className={`connected-box ${isServerManaged ? 'managed' : ''}`}>
          <span>{connectedLabel}</span>
          <strong>{connectedIdentity}</strong>
          <p>{isServerManaged ? 'Credentials stay on the server; every approved user gets live checklist data.' : 'Stored only in this browser.'}</p>
          {!isServerManaged && (
            <button className="ghost-button" type="button" onClick={onDisconnect}>
              <LogOut size={16} />
              Disconnect
            </button>
          )}
        </div>
      ) : (
        <form className="connect-form" onSubmit={(event) => void onConnect(event)}>
          <label>
            <span>Email</span>
            <input type="email" autoComplete="username" value={authEmail} onChange={(event) => onEmailChange(event.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={authPassword}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={authBusy}>
            <RefreshCw size={16} className={authBusy ? 'spin' : undefined} />
            Connect
          </button>
        </form>
      )}
    </section>
  )
}

function BinRadar({
  models,
  modelOptions,
  selectedModelKey,
  opportunities,
  listingCount,
  scan,
  ebayStatus,
  loading,
  modelLoading,
  error,
  minPrice,
  playerScope,
  targetPlayerCount,
  valuePlayerCount,
  resultSort,
  searchMode,
  searchTerm,
  onModelChange,
  onMinPriceChange,
  onPlayerScopeChange,
  onResultSortChange,
  onSearchModeChange,
  onSearchTermChange,
  onScan,
  onScanValueTargets,
}: {
  models: ChecklistModel[]
  modelOptions: ChecklistModel[]
  selectedModelKey: string
  opportunities: Opportunity[]
  listingCount: number
  scan: EbayBinScanResult | null
  ebayStatus: EbayStatus | null
  loading: boolean
  modelLoading: boolean
  error: string | null
  minPrice: number
  playerScope: BinPlayerScope
  targetPlayerCount: number
  valuePlayerCount: number
  resultSort: BinResultSort
  searchMode: BinSearchMode
  searchTerm: string
  onModelChange: (value: string) => void
  onMinPriceChange: (value: number) => void
  onPlayerScopeChange: (value: BinPlayerScope) => void
  onResultSortChange: (value: BinResultSort) => void
  onSearchModeChange: (value: BinSearchMode) => void
  onSearchTermChange: (value: string) => void
  onScan: () => void
  onScanValueTargets: () => void
}) {
  const configured = Boolean(ebayStatus?.configured)
  const latestFetchedAt = scan?.fetchedAt ? new Date(scan.fetchedAt).toLocaleTimeString() : null
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
  const requiresFocus = searchMode !== 'checklist'
  const hasFocus = !requiresFocus || trimmedSearchTerm.length > 0
  const scopedPlayerCount = playerScope === 'target-50' ? targetPlayerCount : playerScope === 'value-25' ? valuePlayerCount : playerCount
  const hasTargetQueue =
    (playerScope !== 'target-50' && playerScope !== 'value-25') || searchMode === 'player' || scopedPlayerCount > 0
  const rateLimited = ebayRateLimitMessage(error)
  const canScan = configured && setCount > 0 && hasPlayerUniverse && hasFocus && hasTargetQueue && !loading && !modelLoading
  const canScanValueTargets = configured && setCount > 0 && hasPlayerUniverse && valuePlayerCount > 0 && !loading && !modelLoading
  const queueWaitingLabel = playerScope === 'value-25' ? 'Value 25 waiting' : 'Target 50 waiting'
  let readinessLabel = 'Ready'
  if (!configured) readinessLabel = 'eBay offline'
  else if (setCount === 0) readinessLabel = 'Model pending'
  else if (!hasPlayerUniverse) readinessLabel = 'Player list needed'
  else if (!hasTargetQueue) readinessLabel = queueWaitingLabel
  else if (!hasFocus) readinessLabel = searchMode === 'player' ? 'Enter player' : 'Enter variation'

  let scanButtonLabel = 'Scan BINs'
  if (loading) scanButtonLabel = 'Scanning'
  else if (modelLoading) scanButtonLabel = 'Model loading'
  else if (rateLimited && !scan) scanButtonLabel = 'Retry Scan'
  else if (!configured) scanButtonLabel = 'eBay offline'
  else if (setCount === 0 || !hasPlayerUniverse) scanButtonLabel = 'Player list needed'
  else if (!hasTargetQueue) scanButtonLabel = queueWaitingLabel
  else if (!hasFocus) scanButtonLabel = searchMode === 'player' ? 'Enter player' : 'Enter variation'
  const focusPlaceholder = searchMode === 'player' ? 'Eli Willits' : 'packfractor'
  const scopeLabel =
    playerScope === 'value-25'
      ? selectedModelKey === BIN_ALL_MODELS_KEY
        ? `Value 25 total (${valuePlayerCount.toLocaleString()} players)`
        : `Value 25 (${valuePlayerCount.toLocaleString()} players)`
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
      : searchMode === 'variation'
        ? trimmedSearchTerm
          ? `Scanning ${trimmedSearchTerm} listings across ${selectedSetLabel}.`
          : 'Type a parallel name such as packfractor, gold shimmer, or red lava.'
        : `${scopeLabel} queued across ${selectedSetLabel}.`

  return (
    <section className="bin-radar">
      <div className="bin-radar-header">
        <div className="section-title">
          <Radio size={18} />
          <div>
            <h2>BIN Deal Radar</h2>
            <span>{selectedSetLabel} active Buy It Now vs modeled price</span>
          </div>
        </div>
        <div className="bin-radar-pills">
          <span className={configured ? 'connected' : 'offline'}>
            {configured ? <Wifi size={14} /> : <WifiOff size={14} />}
            {configured ? 'eBay live' : 'eBay keys needed'}
          </span>
          <span className={hasPlayerUniverse ? 'connected' : 'offline'}>{readinessLabel}</span>
          <span>Raw + 9+ slabs</span>
          <span>{selectedSetPill}</span>
          <span>{playerCount.toLocaleString()} players</span>
          <span>{searchMode === 'checklist' ? 'Checklist scan' : `${searchMode}: ${trimmedSearchTerm || 'focus needed'}`}</span>
          <span>{listingCount.toLocaleString()} listings</span>
          <span>{scan ? `${opportunities.length.toLocaleString()} candidates` : 'No scan yet'}</span>
          {latestFetchedAt ? <span>Scanned {latestFetchedAt}</span> : null}
        </div>
      </div>

      <div className="bin-radar-controls">
        <label className="bin-control wide release-control">
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
        <div className="bin-mode-control" role="group" aria-label="BIN scan mode">
          {(['checklist', 'player', 'variation'] as const).map((mode) => (
            <button
              className={searchMode === mode ? 'active' : ''}
              key={mode}
              type="button"
              onClick={() => onSearchModeChange(mode)}
            >
              {mode === 'checklist' ? 'Checklist' : mode === 'player' ? 'Player' : 'Variation'}
            </button>
          ))}
        </div>
        {searchMode !== 'checklist' ? (
          <label className="bin-control focus">
            <Search size={15} />
            <input
              aria-label={searchMode === 'player' ? 'Player search' : 'Variation search'}
              placeholder={focusPlaceholder}
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
            />
          </label>
        ) : null}
        <label className="bin-control">
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
        <label className="bin-control wide">
          <span>Players</span>
          <select value={playerScope} onChange={(event) => onPlayerScopeChange(event.target.value as BinPlayerScope)}>
            <option value="all">{selectedModelKey === BIN_ALL_MODELS_KEY ? 'All checklist players' : 'Full checklist'}</option>
            <option value="value-25">{selectedModelKey === BIN_ALL_MODELS_KEY ? 'Value 25 total' : 'Value 25'}</option>
            <option value="top-40">{selectedModelKey === BIN_ALL_MODELS_KEY ? 'Top 40 per checklist' : 'Top 40 by base'}</option>
            <option value="target-50">{selectedModelKey === BIN_ALL_MODELS_KEY ? 'Target 50 per checklist' : 'Target 50 model'}</option>
          </select>
        </label>
        <button className="ghost-button value-scan-button" type="button" onClick={onScanValueTargets} disabled={!canScanValueTargets}>
          <Brain size={16} />
          Scan Value 25
        </button>
        <label className="bin-control result-sort-control">
          <span>Sort</span>
          <select value={resultSort} onChange={(event) => onResultSortChange(event.target.value as BinResultSort)}>
            {Object.entries(BIN_RESULT_SORT_LABELS).map(([sort, label]) => (
              <option value={sort} key={sort}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button bin-scan-button" type="button" onClick={onScan} disabled={!canScan}>
          <RefreshCw size={16} className={loading ? 'spin' : undefined} />
          {scanButtonLabel}
        </button>
        {scan ? (
          <div className="bin-scan-stats">
            <strong>{scan.stats.queriesSucceeded.toLocaleString()}</strong>
            <span>queries / {scan.stats.pagesFetched.toLocaleString()} pages / {scan.stats.rejectedPlayerMismatches.toLocaleString()} rejects</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="bin-radar-alert">
          <ShieldCheck size={16} />
          <span>{error}</span>
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
            <span>{listingCount.toLocaleString()} active listings reviewed; none were priced at or within 20% above modeled value.</span>
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
                    {sts.ranking ? (
                      <>
                        {sts.rank ? <small className="sts-chip">Rank #{sts.rank.toLocaleString()}</small> : null}
                        {sts.prospectRank ? <small className="sts-chip">Prospect #{sts.prospectRank.toLocaleString()}</small> : null}
                        {sts.momentumScore !== null ? <small className="sts-chip">Trend {sts.momentumScore.toFixed(1)}</small> : null}
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
                  <span>{percent(opportunity.expectedRoiPct)} ROI</span>
                </div>
                <div className="bin-signal-cell">
                  <span>{opportunity.action}</span>
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
  minPrice,
  onMinPriceChange,
  onScan,
}: {
  scan: CaseHitScanResult | null
  pricingRows: PricingRow[]
  loading: boolean
  error: string | null
  ebayStatus: EbayStatus | null
  minPrice: number
  onMinPriceChange: (value: number) => void
  onScan: () => void
}) {
  const configured = Boolean(ebayStatus?.configured)
  const opportunities = scan?.opportunities ?? []
  const opportunitiesWithAutoLens = opportunities.map((opportunity) => ({
    opportunity,
    autoEquivalent: buildCaseHitAutoEquivalent(opportunity.listing, pricingRows),
  }))
  const rendered = [...opportunitiesWithAutoLens].sort(caseHitEntrySort).slice(0, CASE_HIT_RENDER_LIMIT)
  const ranking = new Map(rendered.map((entry, index) => [entry.opportunity.listing.itemId, index + 1]))
  const valuationRows = scan?.valuationRows ?? []
  const valuationByPlayer = new Map(valuationRows.map((row) => [row.playerName, row]))
  const playerGroups = Array.from(
    rendered.reduce((groups, entry) => {
      const playerName = entry.opportunity.listing.playerName
      const playerEntries = groups.get(playerName) ?? []
      playerEntries.push(entry)
      groups.set(playerName, playerEntries)
      return groups
    }, new Map<string, CaseHitReviewEntry[]>()),
  ).map(([playerName, entries]) => {
    const sortedEntries = [...entries].sort(caseHitEntrySort)
    const best = sortedEntries[0]
    const valuation = valuationByPlayer.get(playerName)
    const bestAllIn = Math.min(...sortedEntries.map((entry) => entry.opportunity.listing.allIn))
    const bestModelEdge = Math.max(...sortedEntries.map((entry) => entry.opportunity.edgeDollars))
    return { playerName, entries: sortedEntries, best, valuation, bestAllIn, bestModelEdge }
  })
  const positiveEdges = opportunities.filter((opportunity) => opportunity.edgeDollars > 0).length
  const autoLensCount = opportunitiesWithAutoLens.filter((entry) => entry.autoEquivalent).length
  const relativeEdges = opportunitiesWithAutoLens.filter((entry) =>
    entry.autoEquivalent ? ['value', 'fair'].includes(entry.autoEquivalent.signal) : false,
  ).length
  const latestFetchedAt = scan?.fetchedAt ? new Date(scan.fetchedAt).toLocaleTimeString() : null
  const canScan = configured && !loading
  const scanButtonLabel = loading ? 'Scanning' : configured ? 'Scan Crystallized' : 'eBay offline'

  return (
    <section className="bin-radar case-hit-lab">
      <div className="bin-radar-header">
        <div className="section-title">
          <Gem size={18} />
          <div>
            <h2>Case Hit Lab</h2>
            <span>2026 Bowman Crystallized active BINs, mapped to the Bowman auto ladder</span>
          </div>
        </div>
        <div className="bin-radar-pills">
          <span className={configured ? 'connected' : 'offline'}>
            {configured ? <Wifi size={14} /> : <WifiOff size={14} />}
            {configured ? 'eBay only' : 'eBay keys needed'}
          </span>
          <span>{CRYSTALLIZED_CHECKLIST.length} cards</span>
          <span>{scan ? `${scan.listings.length.toLocaleString()} mapped` : 'No scan yet'}</span>
          <span>{scan ? `${positiveEdges.toLocaleString()} ask edges` : 'Ask model pending'}</span>
          <span>{scan ? `${relativeEdges.toLocaleString()} value tiers` : 'Relative value pending'}</span>
          <span>{scan ? `${autoLensCount.toLocaleString()} auto lenses` : 'Auto ruler pending'}</span>
          {latestFetchedAt ? <span>Scanned {latestFetchedAt}</span> : null}
        </div>
      </div>

      <div className="bin-radar-controls">
        <label className="bin-control">
          <span>Min BIN</span>
          <input
            aria-label="Minimum Crystallized BIN price"
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
              queries / {scan.stats.pagesFetched.toLocaleString()} pages / {scan.stats.rejectedListings.toLocaleString()} rejects
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
          <span>Serial Ignored</span>
          <strong>Gold, red, and base Crystallized all map by price, not insert numbering</strong>
        </div>
        <div>
          <span>Decision Signal</span>
          <strong>Best reads are case hits priced like base or common refractor autos</strong>
        </div>
      </div>

      {!configured ? (
        <div className="bin-empty-state">
          <KeyRound size={24} />
          <div>
            <strong>eBay production keys are required.</strong>
            <span>This lab builds from active eBay Crystallized BINs only.</span>
          </div>
        </div>
      ) : !scan ? (
        <div className="bin-empty-state ready">
          <Gem size={24} />
          <div>
            <strong>Ready to trial eBay-only case-hit modeling.</strong>
            <span>
              The model scans the 20-card Crystallized checklist, rejects adjacent inserts/autos, and estimates value from active ask comps
              plus pack-odds rarity. It also compares each ask to the same player's Bowman auto variation ladder.
            </span>
          </div>
        </div>
      ) : rendered.length === 0 ? (
        <div className="bin-empty-state muted">
          <Gem size={24} />
          <div>
            <strong>No Crystallized listings survived the title filters.</strong>
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
                <section className="case-hit-player-group" key={group.playerName}>
                  <div className="case-hit-player-group-header">
                    <div>
                      <span>
                        {group.valuation?.team ?? group.best.opportunity.listing.team} / {group.entries.length} BIN
                        {group.entries.length === 1 ? '' : 's'}
                      </span>
                      <strong>{group.playerName}</strong>
                      <small>
                        {bestAutoLens
                          ? `Best ask trades like ${compactVariation(bestAutoLens.equivalentLabel)} at ${formatMultiplier(bestAutoLens.autoMultiple)} base auto`
                          : 'No Bowman auto ladder match yet'}
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
                              <small>{opportunity.listing.cardNo}</small>
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
                <small>{valuationRows.length.toLocaleString()} players / active ask pricing / pack-odds rarity</small>
              </span>
            </summary>
            <div className="case-hit-model-board">
              <div className="case-hit-model-title">
                <strong>Crystallized Variation Model</strong>
                <span>Reference layer only. The review queue above is the primary workflow.</span>
              </div>
              <div className="case-hit-model-list">
                {valuationRows.map((row, index) => (
                  <article className="case-hit-model-row" key={row.cardNo}>
                    <div className="case-hit-player-cell">
                      <span>#{index + 1}</span>
                      <strong>{row.playerName}</strong>
                      <small>
                        {row.cardNo} / {row.team}
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

function SoldModelLab({
  model,
  scan,
  loading,
  error,
  marketMoversText,
  marketMoversError,
  ebayStatus,
  onScan,
  onMarketMoversTextChange,
  onImportMarketMovers,
  onCopyMarketMoversCapture,
}: {
  model?: ChecklistModel | null
  scan: EbaySoldModelResult | null
  loading: boolean
  error: string | null
  marketMoversText: string
  marketMoversError: string | null
  ebayStatus: EbayStatus | null
  onScan: () => void
  onMarketMoversTextChange: (value: string) => void
  onImportMarketMovers: () => void
  onCopyMarketMoversCapture: () => void
}) {
  const configured = Boolean(ebayStatus?.configured)
  const playerCount = model?.players.length ?? 0
  const canScan = configured && Boolean(model) && playerCount > 0 && !loading
  const canImportMarketMovers = Boolean(model) && playerCount > 0 && marketMoversText.trim().length > 0
  const missingPlayers = Boolean(model) && playerCount === 0
  const accessBlocked = soldModelAccessBlocked(error)
  const topSoldMultipliers =
    scan?.model.multipliers
      .filter((variation) => !/^base/i.test(variation.variation))
      .sort((left, right) => right.avgMultiplier - left.avgMultiplier)
      .slice(0, 8) ?? []
  const latestFetchedAt = scan?.fetchedAt ? new Date(scan.fetchedAt).toLocaleTimeString() : null

  return (
    <section className="bin-radar sold-model-lab">
      <div className="bin-radar-header">
        <div className="section-title">
          <Brain size={18} />
          <div>
            <h2>Sold Comp Engine</h2>
            <span>Market Movers / eBay sold comps to model multipliers</span>
          </div>
        </div>
        <div className="bin-radar-pills">
          <span className={configured ? 'connected' : 'offline'}>
            {configured ? <Wifi size={14} /> : <WifiOff size={14} />}
            {configured ? 'eBay sold' : 'eBay keys needed'}
          </span>
          <span>{model ? `2026 Bowman / ${playerCount.toLocaleString()} players` : 'Model pending'}</span>
          <span>{scan ? `${scan.stats.mappedComps.toLocaleString()} sold comps` : 'No scan yet'}</span>
          <span className={accessBlocked ? 'offline' : scan ? 'connected' : undefined}>
            {accessBlocked
              ? 'Insights blocked'
              : scan
                ? `${scan.stats.soldDerivedMultipliers.toLocaleString()} sold multipliers`
                : 'Overlay pending'}
          </span>
          {latestFetchedAt ? <span>Scanned {latestFetchedAt}</span> : null}
        </div>
      </div>

      <div className="bin-radar-controls">
        <button className="primary-button bin-scan-button" type="button" onClick={onScan} disabled={!canScan}>
          <RefreshCw size={16} className={loading ? 'spin' : undefined} />
          {loading
            ? 'Building'
            : !configured
              ? 'eBay offline'
              : !model
                ? 'Model Loading'
              : missingPlayers
                ? 'Player List Needed'
                : accessBlocked
                  ? 'Retry Sold Access'
                  : 'Build Sold Model'}
        </button>
        {scan ? (
          <div className="bin-scan-stats">
            <strong>{scan.stats.queriesSucceeded.toLocaleString()}</strong>
            <span>
              {scan.model.source === 'market-movers-sold-model' ? 'Market Movers' : 'queries'} / {scan.stats.pagesFetched.toLocaleString()} pages /{' '}
              {scan.stats.rejectedComps.toLocaleString()} rejects
            </span>
          </div>
        ) : null}
      </div>

      <div className="sold-import-panel">
        <textarea
          className="sold-import-box"
          placeholder="Paste Market Movers comps"
          value={marketMoversText}
          onChange={(event) => onMarketMoversTextChange(event.target.value)}
        />
        <div className="sold-import-actions">
          <button className="ghost-button" type="button" onClick={onCopyMarketMoversCapture}>
            <Download size={15} />
            Copy Capture
          </button>
          <button className="primary-button" type="button" onClick={onImportMarketMovers} disabled={!canImportMarketMovers}>
            <Brain size={15} />
            Import Market Movers
          </button>
        </div>
      </div>

      {error || marketMoversError ? (
        <div className="bin-radar-alert">
          <ShieldCheck size={16} />
          <span>{marketMoversError ?? error}</span>
        </div>
      ) : null}

      {accessBlocked ? (
        <div className="bin-empty-state blocked">
          <ShieldCheck size={24} />
          <div>
            <strong>eBay sold access is not enabled yet.</strong>
            <span>
              Market Movers import can still build the overlay. eBay sold search unlocks after item-sales access is granted to this
              keyset.
            </span>
          </div>
        </div>
      ) : !model ? (
        <div className="bin-empty-state">
          <Database size={24} />
          <div>
            <strong>2026 Bowman is loading.</strong>
            <span>The sold model uses the checklist player universe as its guardrail.</span>
          </div>
        </div>
      ) : missingPlayers ? (
        <div className="bin-empty-state muted">
          <Database size={24} />
          <div>
            <strong>Waiting on checklist players.</strong>
            <span>Connect market data or reload the checklist before building sold-comp variation math.</span>
          </div>
        </div>
      ) : !scan ? (
        <div className="bin-empty-state ready">
          <Brain size={24} />
          <div>
            <strong>Ready for sold comps.</strong>
            <span>
              Paste Market Movers rows or run eBay sold search when access is live; both routes anchor variation math to base weighted averages.
            </span>
          </div>
        </div>
      ) : (
        <div className="case-hit-model-board">
          <div className="case-hit-model-title">
            <strong>Sold Overlay Audit</strong>
            <span>
              {scan.stats.baseComps.toLocaleString()} base comps / {scan.stats.variationComps.toLocaleString()} variation comps /{' '}
              {scan.stats.soldAnchoredPlayers.toLocaleString()} players with sold base anchors
            </span>
          </div>
          <div className="case-hit-model-list">
            <article className="case-hit-model-row">
              <div className="case-hit-player-cell">
                <span>MODEL</span>
                <strong>{scan.model.source === 'market-movers-sold-model' ? 'Market Movers' : scan.model.release}</strong>
                <small>{scan.stats.fallbackMultipliers.toLocaleString()} baseline multipliers retained</small>
              </div>
              <div className="case-hit-base-cell">
                <span>Sold signal</span>
                <strong>{scan.stats.soldDerivedMultipliers.toLocaleString()}</strong>
                <small>{scan.errors.length ? `${scan.errors.length} query errors` : 'No query errors'}</small>
              </div>
              <div className="case-hit-variation-strip">
                {topSoldMultipliers.map((variation) => (
                  <span className="case-hit-variation-cell" key={variation.variation}>
                    <small>{compactVariation(variation.variation)}</small>
                    <strong>{formatMultiplier(variation.avgMultiplier)}</strong>
                    <em>{variation.totalSales ?? 0} sales</em>
                  </span>
                ))}
              </div>
            </article>
          </div>
        </div>
      )}
    </section>
  )
}

function App() {
  const [liveConnected, setLiveConnected] = useState(false)
  const [pulseAuthMode, setPulseAuthMode] = useState<PulseAuthMode>(() => (getStoredPulseSession()?.access_token ? 'local' : 'public'))
  const [authEmail, setAuthEmail] = useState(() => getStoredPulseSession()?.user?.email ?? '')
  const [authPassword, setAuthPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
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
  const [baseSourceFilter, setBaseSourceFilter] = useState<BaseSourceFilter>('all')
  const [stsFilter, setStsFilter] = useState<StsFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('base-desc')
  const [selectedRowId, setSelectedRowId] = useState<string | undefined>()
  const [workMode, setWorkMode] = useState<WorkMode>('lookup')
  const [ebayStatus, setEbayStatus] = useState<EbayStatus | null>(null)
  const [binListings, setBinListings] = useState<ProspectPulseListing[]>([])
  const [binLoading, setBinLoading] = useState(false)
  const [binError, setBinError] = useState<string | null>(null)
  const [binMinPrice, setBinMinPrice] = useState(25)
  const [binPlayerScope, setBinPlayerScope] = useState<BinPlayerScope>('all')
  const [binSearchMode, setBinSearchMode] = useState<BinSearchMode>('checklist')
  const [binSearchTerm, setBinSearchTerm] = useState('')
  const [binResultSort, setBinResultSort] = useState<BinResultSort>('conviction-desc')
  const [binModelKey, setBinModelKey] = useState('')
  const [binScan, setBinScan] = useState<EbayBinScanResult | null>(null)
  const [caseHitScan, setCaseHitScan] = useState<CaseHitScanResult | null>(null)
  const [caseHitLoading, setCaseHitLoading] = useState(false)
  const [caseHitError, setCaseHitError] = useState<string | null>(null)
  const [caseHitMinPrice, setCaseHitMinPrice] = useState(20)
  const [soldModelScan, setSoldModelScan] = useState<EbaySoldModelResult | null>(null)
  const [soldModelLoading, setSoldModelLoading] = useState(false)
  const [soldModelError, setSoldModelError] = useState<string | null>(null)
  const [marketMoversImportText, setMarketMoversImportText] = useState('')
  const [marketMoversImportError, setMarketMoversImportError] = useState<string | null>(null)
  const checklistRequestRef = useRef<AbortController | null>(null)
  const checklistRequestIdRef = useRef(0)
  const binRequestRef = useRef<AbortController | null>(null)
  const caseHitRequestRef = useRef<AbortController | null>(null)
  const soldModelRequestRef = useRef<AbortController | null>(null)

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

  useEffect(() => {
    let active = true
    const catalogController = new AbortController()
    const ebayController = new AbortController()
    getPulseStatus()
      .then((status) => {
        if (!active) return
        setLiveConnected(status.connected)
        setPulseAuthMode(status.authMode)
      })
      .catch(() => {
        if (!active) return
        setLiveConnected(false)
        setPulseAuthMode(getStoredPulseSession()?.access_token ? 'local' : 'public')
      })
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
    const modelTimer = window.setTimeout(() => {
      void (async () => {
        const catalog = await loadChecklistCatalog(catalogController.signal)
        if (active) await loadChecklistModel(catalog)
      })()
    }, 0)

    return () => {
      active = false
      catalogController.abort()
      ebayController.abort()
      window.clearTimeout(modelTimer)
    }
  }, [loadChecklistCatalog, loadChecklistModel])

  useEffect(() => {
    return () => {
      checklistRequestIdRef.current += 1
      checklistRequestRef.current?.abort()
      binRequestRef.current?.abort()
      caseHitRequestRef.current?.abort()
      soldModelRequestRef.current?.abort()
    }
  }, [])

  const matrix = useMemo(() => buildPricingMatrix(checklistModels), [checklistModels])
  const bowman2026Model = useMemo(
    () => checklistModels.find((model) => model.releaseYear === 2026 && model.category === 'bowman') ?? null,
    [checklistModels],
  )
  const binModelOptions = useMemo(() => sortChecklistModels(checklistModels), [checklistModels])
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
  const binTargetRowsByModel = useMemo(() => {
    const targets = new Map<string, PricingRow[]>()
    for (const model of selectedBinModels) {
      targets.set(checklistModelKey(model), targetRowsForModel(matrix.rows, model, 50))
    }
    return targets
  }, [matrix.rows, selectedBinModels])
  const binValueRowsByModel = useMemo(() => valueRowsForModels(matrix.rows, selectedBinModels, 25), [matrix.rows, selectedBinModels])
  const binTargetPlayerCount = useMemo(
    () => selectedBinModels.reduce((total, model) => total + (binTargetRowsByModel.get(checklistModelKey(model))?.length ?? 0), 0),
    [binTargetRowsByModel, selectedBinModels],
  )
  const binValuePlayerCount = useMemo(
    () => selectedBinModels.reduce((total, model) => total + (binValueRowsByModel.get(checklistModelKey(model))?.length ?? 0), 0),
    [binValueRowsByModel, selectedBinModels],
  )
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
    }
  }, [binMinPrice, effectiveBinModelKey, selectedBinModels])
  const binOpportunities = useMemo(
    () => sortBinOpportunities(
      rankOpportunities(binListings, binScoreSettings, selectedBinModels).filter(isWithinBinModelWindow),
      binResultSort,
    ).slice(0, BIN_RENDER_LIMIT),
    [binListings, binResultSort, binScoreSettings, selectedBinModels],
  )

  const visibleRows = useMemo(() => {
    const searchedRows = filterPricingRows(matrix.rows, query)
    const filteredRows = searchedRows.filter((row) => {
      if (releaseFilter !== 'all' && row.release !== releaseFilter) return false
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
      if (baseSourceFilter !== 'all' && row.basePriceSource !== baseSourceFilter) return false
      if (stsFilter === 'ranked' && !row.stsRank) return false
      if (stsFilter === 'prospects' && !row.stsProspectRank) return false
      if (stsFilter === 'mlb' && row.stsLevel?.toUpperCase() !== 'MLB') return false
      if (stsFilter === 'unmatched' && row.stsName) return false
      return true
    })
    return sortRows(filteredRows, sortMode)
  }, [baseSourceFilter, categoryFilter, matrix.rows, query, releaseFilter, sortMode, stsFilter])
  const renderedRows = useMemo(() => visibleRows.slice(0, LEADERBOARD_RENDER_LIMIT), [visibleRows])
  const selectedRow = renderedRows.find((row) => row.id === selectedRowId) ?? renderedRows[0]
  const trimmedQuery = query.trim()
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
  const pulseSourceLabel =
    pulseAuthMode === 'server'
      ? 'Market data managed'
      : liveConnected
        ? 'Market data connected'
        : 'Set curves only'
  const pulseTapeLabel = pulseAuthMode === 'server' ? 'MANAGED' : liveConnected ? 'CONNECTED' : 'CURVES'

  async function refreshChecklistUniverse() {
    const catalog = await loadChecklistCatalog()
    await loadChecklistModel(catalog)
  }

  async function connectProspectPulse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthBusy(true)
    setChecklistError(null)
    let sessionSaved = false

    try {
      const session = await loginProspectPulse(authEmail.trim(), authPassword)
      savePulseSession(session)
      sessionSaved = true
      setLiveConnected(true)
      setPulseAuthMode('local')
      setAuthEmail(session.user?.email ?? authEmail.trim())
      setAuthPassword('')
      await loadChecklistModel(releaseOptions)
    } catch (connectError) {
      setLiveConnected(sessionSaved && !isPulseAuthError(connectError))
      setPulseAuthMode(sessionSaved && !isPulseAuthError(connectError) ? 'local' : 'public')
      setChecklistError(connectError instanceof Error ? cleanModelLanguage(connectError.message) : 'Could not connect market data')
    } finally {
      setAuthBusy(false)
    }
  }

  async function disconnectProspectPulse() {
    clearPulseSession()
    setAuthPassword('')
    try {
      const status = await getPulseStatus()
      setLiveConnected(status.connected)
      setPulseAuthMode(status.authMode)
    } catch {
      setLiveConnected(false)
      setPulseAuthMode('public')
    }
    await loadChecklistModel(releaseOptions)
  }

  function resetBinScan() {
    setBinListings([])
    setBinScan(null)
    setBinError(null)
  }

  function updateBinSearchMode(mode: BinSearchMode) {
    setBinSearchMode(mode)
    setBinSearchTerm('')
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
    resetBinScan()
  }

  function updateBinMinPrice(value: number) {
    setBinMinPrice(value)
    resetBinScan()
  }

  function scanBinsForLookupRow(row: PricingRow) {
    const rowModel =
      binModelOptions.find(
        (model) => model.release === row.release && model.releaseYear === row.releaseYear && model.category === row.category,
      ) ?? null
    const scanModels = rowModel ? [rowModel] : selectedBinModels

    setSelectedRowId(row.id)
    setWorkMode('deals')
    setBinModelKey(rowModel ? checklistModelKey(rowModel) : BIN_ALL_MODELS_KEY)
    setBinSearchMode('player')
    setBinSearchTerm(row.playerName)
    setBinPlayerScope('all')
    setBinListings([])
    setBinScan(null)
    setBinError(null)

    void scanEbayBinListings({
      models: scanModels,
      playerScope: 'all',
      searchMode: 'player',
      searchTerm: row.playerName,
    })
  }

  function scanValue25Targets() {
    setWorkMode('deals')
    setBinSearchMode('checklist')
    setBinSearchTerm('')
    setBinPlayerScope('value-25')
    setBinListings([])
    setBinScan(null)
    setBinError(null)

    void scanEbayBinListings({
      playerScope: 'value-25',
      searchMode: 'checklist',
      searchTerm: '',
    })
  }

  function updateCaseHitMinPrice(value: number) {
    setCaseHitMinPrice(value)
    setCaseHitScan(null)
    setCaseHitError(null)
  }

  async function scanEbayBinListings(
    overrides: {
      models?: ChecklistModel[]
      minPrice?: number
      playerScope?: BinPlayerScope
      searchMode?: BinSearchMode
      searchTerm?: string
    } = {},
  ) {
    const activeModels = overrides.models ?? selectedBinModels
    const activeMinPrice = overrides.minPrice ?? binMinPrice
    const activePlayerScope = overrides.playerScope ?? binPlayerScope
    const activeSearchMode = overrides.searchMode ?? binSearchMode
    const activeSearchTerm = overrides.searchTerm ?? binSearchTerm

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

    if (activeSearchMode !== 'checklist' && !activeSearchTerm.trim()) {
      setBinError(activeSearchMode === 'player' ? 'Enter a player name to scan.' : 'Enter a variation to scan.')
      return
    }

    const valueRowsByScanModel =
      activePlayerScope === 'value-25' && activeSearchMode !== 'player'
        ? valueRowsForModels(matrix.rows, playerLoadedModels, 25)
        : new Map<string, PricingRow[]>()

    if (
      (activePlayerScope === 'target-50' || activePlayerScope === 'value-25') &&
      activeSearchMode !== 'player' &&
      playerLoadedModels.every((model) => {
        if (activePlayerScope === 'value-25') return (valueRowsByScanModel.get(checklistModelKey(model))?.length ?? 0) === 0
        return targetRowsForModel(matrix.rows, model, 50).length === 0
      })
    ) {
      setBinError(
        activePlayerScope === 'value-25'
          ? 'Value 25 needs priced checklist rows matched to ranking signals before scanning.'
          : 'Target 50 needs priced checklist rows matched to ranking signals before scanning.',
      )
      return
    }
    const scanModels =
      (activePlayerScope === 'target-50' || activePlayerScope === 'value-25') && activeSearchMode !== 'player'
        ? playerLoadedModels.filter((model) =>
            activePlayerScope === 'value-25'
              ? (valueRowsByScanModel.get(checklistModelKey(model))?.length ?? 0) > 0
              : targetRowsForModel(matrix.rows, model, 50).length > 0,
          )
        : playerLoadedModels

    binRequestRef.current?.abort()
    const controller = new AbortController()
    binRequestRef.current = controller
    setBinLoading(true)
    setBinError(null)

    try {
      const settledScans = await mapWithConcurrency(scanModels, BIN_SCAN_CONCURRENCY, async (model) => {
        const targetRows =
          activePlayerScope === 'target-50'
            ? targetRowsForModel(matrix.rows, model, 50)
            : activePlayerScope === 'value-25'
              ? (valueRowsByScanModel.get(checklistModelKey(model)) ?? [])
              : []
        try {
          const value = await fetchEbayBinListings({
            model,
            minPrice: activeMinPrice,
            playerLimit: activePlayerScope === 'top-40' ? 40 : null,
            playerNames:
              activePlayerScope === 'target-50' || activePlayerScope === 'value-25'
                ? targetRows.map((row) => row.playerName)
                : undefined,
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
                error: result.reason instanceof Error ? result.reason.message : 'eBay BIN scan failed',
              },
            ]
          : [],
      )

      if (successfulScans.length === 0) {
        throw new Error(failedScans[0]?.error ?? 'eBay BIN scan failed')
      }

      const scanResult = mergeBinScans(successfulScans, failedScans)
      setBinListings(scanResult.listings)
      setBinScan(scanResult)
      setBinError(binScanErrorSummary(scanResult))
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

  async function scanCrystallizedCaseHits() {
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
      const scanResult = await fetchCrystallizedCaseHits({
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
      setCaseHitError(scanError instanceof Error ? scanError.message : 'Crystallized scan failed')
    } finally {
      if (caseHitRequestRef.current === controller) {
        setCaseHitLoading(false)
        caseHitRequestRef.current = null
      }
    }
  }

  async function scanEbaySoldModel() {
    if (!bowman2026Model) {
      setSoldModelError('2026 Bowman is not loaded yet.')
      return
    }

    if (!ebayStatus?.configured) {
      setSoldModelError(ebayStatus?.message ?? 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in .env.local')
      return
    }

    if (bowman2026Model.players.length === 0) {
      setSoldModelError('Checklist player list is not loaded for 2026 Bowman.')
      return
    }

    soldModelRequestRef.current?.abort()
    const controller = new AbortController()
    soldModelRequestRef.current = controller
    setSoldModelLoading(true)
    setSoldModelError(null)

    try {
      const scanResult = await fetchEbaySoldVariationModel({
        model: bowman2026Model,
        playerLimit: 40,
        limitPerPlayer: 100,
        maxPagesPerPlayer: 1,
        signal: controller.signal,
      })
      setSoldModelScan(scanResult)
      setSoldModelError(
        scanResult.errors.length > 0
          ? `${scanResult.errors.length.toLocaleString()} sold quer${scanResult.errors.length === 1 ? 'y' : 'ies'} failed; modeled successful comps.`
          : null,
      )
    } catch (scanError) {
      if (controller.signal.aborted) return
      setSoldModelError(friendlySoldModelError(scanError))
    } finally {
      if (soldModelRequestRef.current === controller) {
        setSoldModelLoading(false)
        soldModelRequestRef.current = null
      }
    }
  }

  async function copyMarketMoversCapture() {
    try {
      await navigator.clipboard.writeText(MARKET_MOVERS_CAPTURE_BOOKMARKLET)
      setMarketMoversImportError('Market Movers capture helper copied.')
    } catch {
      setMarketMoversImportError('Could not copy the Market Movers capture helper.')
    }
  }

  function importMarketMoversComps() {
    if (!bowman2026Model) {
      setMarketMoversImportError('2026 Bowman is not loaded yet.')
      return
    }

    if (bowman2026Model.players.length === 0) {
      setMarketMoversImportError('Checklist player list is not loaded for 2026 Bowman.')
      return
    }

    try {
      const scanResult = buildMarketMoversSoldModel(marketMoversImportText, bowman2026Model)
      setSoldModelScan(scanResult)
      setSoldModelError(null)
      setMarketMoversImportError(
        scanResult.errors.length > 0
          ? `${scanResult.errors.length.toLocaleString()} Market Movers import note${scanResult.errors.length === 1 ? '' : 's'}; modeled accepted comps.`
          : null,
      )
    } catch (importError) {
      setMarketMoversImportError(importError instanceof Error ? importError.message : 'Market Movers import failed')
    }
  }

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
          <button className="primary-button" type="button" onClick={() => void refreshChecklistUniverse()} disabled={checklistLoading || catalogLoading}>
            <RefreshCw size={16} className={checklistLoading ? 'spin' : undefined} />
            {catalogLoading
              ? 'Discovering'
              : checklistProgress
                ? `Loading ${checklistProgress.loaded}/${checklistProgress.total}`
                : checklistLoading
                  ? 'Refreshing'
                  : 'Refresh'}
          </button>
          <button className="ghost-button" type="button" onClick={() => downloadMatrixCsv(visibleRows)}>
            <Download size={16} />
            Export
          </button>
          <button className="ghost-button" type="button" onClick={() => setWorkMode((mode) => (mode === 'beta' ? 'lookup' : 'beta'))}>
            <Gem size={16} />
            {workMode === 'beta' ? 'Main Desk' : 'Beta'}
          </button>
        </div>
      </section>

      <section className="status-strip valuation-status">
        <span className={`source-chip ${liveConnected ? 'connected' : 'offline'}`}>
          {liveConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {pulseSourceLabel}
        </span>
        <span>{releaseOptions.length.toLocaleString()} checklist releases</span>
        <span>{matrix.totalPricedPlayers.toLocaleString()} priced players</span>
        <span>{matrix.totalResolvedCells.toLocaleString()} solved valuations</span>
        <span>
          {matrix.weightedBaseRows.toLocaleString()} weighted / {matrix.blendedBaseRows.toLocaleString()} blended /{' '}
          {matrix.impliedBaseRows.toLocaleString()} implied / {matrix.fallbackBaseRows.toLocaleString()} baseline
        </span>
        <span className={`model-health-chip ${mathHealth}`}>
          <Sigma size={14} />
          {mathHealthLabel}
        </span>
        {checklistProgress ? <span>Loading {checklistProgress.loaded.toLocaleString()} / {checklistProgress.total.toLocaleString()}</span> : null}
        <span>{modelUpdatedAt ? `Updated ${new Date(modelUpdatedAt).toLocaleTimeString()}` : 'Awaiting player bases'}</span>
        {catalogError ? <strong>{catalogError}</strong> : null}
        {checklistError ? <strong>{checklistError}</strong> : null}
      </section>

      <MarketTape
        rowCount={matrix.totalPricedPlayers}
        variationCount={matrix.totalVariations}
        solvedCells={matrix.totalResolvedCells}
        topBase={topBase}
        loadedSets={checklistModels.length}
        liveConnected={liveConnected}
        sourceLabel={pulseTapeLabel}
      />

      <WorkflowCommand
        mode={workMode}
        onModeChange={setWorkMode}
        pricedRows={matrix.totalPricedPlayers}
        topBase={topBase}
        dealCount={binOpportunities.length}
        listingCount={binListings.length}
        modelReady={matrix.totalResolvedCells > 0}
      />

      {workMode === 'lookup' ? (
        <section className="workbench-layout lookup-workflow" aria-label="Modeled price lookup">
          <div className="valuation-workspace">
            <div className="metric-grid">
              <StatTile icon={Database} label="Players" value={matrix.totalPricedPlayers.toLocaleString()} tone="info" />
              <StatTile icon={Brain} label="Ranked" value={`${matrix.stsMatchedRows.toLocaleString()} / ${matrix.stsProspectRows.toLocaleString()}`} tone="neutral" />
              <StatTile icon={Layers} label="Variations" value={matrix.totalVariations.toLocaleString()} tone="neutral" />
              <StatTile icon={BadgeDollarSign} label="Top Base" value={money(topBase)} tone="good" />
            </div>

            <div className="calculator-workbench-slot">
              <QuickPriceModule
                row={selectedRow}
                onScanPlayer={scanBinsForLookupRow}
                pickerRows={visibleRows}
                onPickRow={setSelectedRowId}
                className="workbench-quick-price-card"
              />
            </div>

            <div className="toolbar valuation-toolbar">
              <label className="search-box">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, release, variation" />
              </label>
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
              <label className="filter-select">
                <span>Family</span>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}>
                  <option value="all">All families</option>
                  {CHECKLIST_CATEGORIES.map((category) => (
                    <option value={category} key={category}>
                      {CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-select">
                <span>Base</span>
                <select value={baseSourceFilter} onChange={(event) => setBaseSourceFilter(event.target.value as BaseSourceFilter)}>
                  <option value="all">All sources</option>
                  {Object.entries(SOURCE_LABELS).map(([source, label]) => (
                    <option value={source} key={source}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-select">
                <span>Rank</span>
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
              <div className="row-counts">
                <div className="deal-count">
                  <strong>{visibleRows.length.toLocaleString()}</strong>
                  <span>rows</span>
                </div>
                {visibleRows.length > renderedRows.length ? (
                  <div className="deal-count">
                    <strong>{renderedRows.length.toLocaleString()}</strong>
                    <span>shown</span>
                  </div>
                ) : null}
              </div>
            </div>

            {rankingOnlyMatch ? <RankingOnlyMatch ranking={rankingOnlyMatch} /> : null}

            <Leaderboard
              rows={renderedRows}
              totalRows={visibleRows.length}
              selectedId={selectedRow?.id}
              onSelect={setSelectedRowId}
              onScanPlayer={scanBinsForLookupRow}
              emptyTitle={trimmedQuery ? 'No modeled card match.' : undefined}
              emptyText={
                trimmedQuery
                  ? 'No loaded checklist row matches this search and the current filters.'
                  : undefined
              }
            />
          </div>

          <aside className="detail-rail">
            <LadderDetail row={selectedRow} />
            <ModelStatus
              models={checklistModels}
              loading={checklistLoading}
              error={checklistError}
              onRefresh={() => void loadChecklistModel(releaseOptions)}
            />
          </aside>
        </section>
      ) : workMode === 'deals' ? (
        <section className="deal-workflow" aria-label="Deal finder">
          <BinRadar
            models={selectedBinModels}
            modelOptions={binModelOptions}
            selectedModelKey={effectiveBinModelKey}
            opportunities={binOpportunities}
            listingCount={binListings.length}
            scan={binScan}
            ebayStatus={ebayStatus}
            loading={binLoading}
            modelLoading={checklistLoading}
            error={binError}
            minPrice={binMinPrice}
            playerScope={binPlayerScope}
            targetPlayerCount={binTargetPlayerCount}
            valuePlayerCount={binValuePlayerCount}
            resultSort={binResultSort}
            searchMode={binSearchMode}
            searchTerm={binSearchTerm}
            onModelChange={updateBinModelKey}
            onMinPriceChange={updateBinMinPrice}
            onPlayerScopeChange={updateBinPlayerScope}
            onResultSortChange={setBinResultSort}
            onSearchModeChange={updateBinSearchMode}
            onSearchTermChange={updateBinSearchTerm}
            onScan={() => void scanEbayBinListings()}
            onScanValueTargets={scanValue25Targets}
          />
        </section>
      ) : (
        <section className="beta-workflow" aria-label="Beta labs">
          <div className="beta-page-head">
            <span>Beta Lab</span>
            <strong>Crystallized case hits</strong>
          </div>
          <CaseHitLab
            scan={caseHitScan}
            pricingRows={matrix.rows}
            loading={caseHitLoading}
            error={caseHitError}
            ebayStatus={ebayStatus}
            minPrice={caseHitMinPrice}
            onMinPriceChange={updateCaseHitMinPrice}
            onScan={() => void scanCrystallizedCaseHits()}
          />
        </section>
      )}

      <section className="model-support-dock" aria-label="Model sources">
        <div className="support-dock-head">
          <span>Model Sources</span>
          <strong>Comps and checklist access</strong>
        </div>
        <div className="model-support-grid">
          <SoldModelLab
            model={bowman2026Model}
            scan={soldModelScan}
            loading={soldModelLoading}
            error={soldModelError}
            marketMoversText={marketMoversImportText}
            marketMoversError={marketMoversImportError}
            ebayStatus={ebayStatus}
            onScan={() => void scanEbaySoldModel()}
            onMarketMoversTextChange={(value) => {
              setMarketMoversImportText(value)
              setMarketMoversImportError(null)
            }}
            onImportMarketMovers={importMarketMoversComps}
            onCopyMarketMoversCapture={() => void copyMarketMoversCapture()}
          />
          <ProspectPulsePanel
            liveConnected={liveConnected}
            authMode={pulseAuthMode}
            authEmail={authEmail}
            authPassword={authPassword}
            authBusy={authBusy}
            onEmailChange={setAuthEmail}
            onPasswordChange={setAuthPassword}
            onConnect={connectProspectPulse}
            onDisconnect={disconnectProspectPulse}
          />
        </div>
      </section>
    </main>
  )
}

export default App
