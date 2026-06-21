import type { ChecklistModel, ChecklistPlayer, ChecklistSale, ChecklistVariation } from '../types'
import { estimateBasePrice, releaseVariationCurve, variationKey } from './matrix'

type EbaySoldQueryMeta = {
  q?: string
  playerName?: string
  release?: string
  releaseYear?: number
  category?: ChecklistModel['category']
}

type EbayMoney = {
  value?: string | number
  convertedFromValue?: string | number
  currency?: string
}

export type RawEbaySoldItem = {
  itemId?: string
  legacyItemId?: string
  title?: string
  itemWebUrl?: string
  itemAffiliateWebUrl?: string
  price?: EbayMoney
  itemSoldPrice?: EbayMoney
  soldPrice?: EbayMoney
  totalPrice?: EbayMoney
  itemCreationDate?: string
  itemEndDate?: string
  itemSoldDate?: string
  lastSoldDate?: string
  dateSold?: string
  transactionDate?: string
  _bowmanTraderQuery?: EbaySoldQueryMeta
}

export type EbaySoldCompKind = 'base' | 'variation'

export interface EbaySoldComp {
  itemId: string
  playerName: string
  title: string
  salePrice: number
  soldAt: string
  kind: EbaySoldCompKind
  variationKey: string
  variationLabel: string
  serialDenominator: number | null
  listingUrl: string
}

export interface EbaySoldModelStats {
  queriesRun: number
  queriesSucceeded: number
  queriesFailed: number
  pagesFetched: number
  upstreamTotal: number
  dedupedItems: number
  mappedComps: number
  rejectedComps: number
  baseComps: number
  variationComps: number
  soldDerivedMultipliers: number
  fallbackMultipliers: number
  soldAnchoredPlayers: number
}

export interface EbaySoldModelResult {
  model: ChecklistModel
  comps: EbaySoldComp[]
  fetchedAt: string
  errors: Array<{ query?: string; error: string }>
  stats: EbaySoldModelStats
}

type EbaySoldSearchResponse = {
  items?: RawEbaySoldItem[]
  errors?: Array<{ query?: string; error: string }>
  fetchedAt?: string
  stats?: {
    queriesRun?: number
    queriesSucceeded?: number
    queriesFailed?: number
    pagesFetched?: number
    upstreamTotal?: number
    dedupedItems?: number
  }
  error?: string
}

type VariationCandidate = ChecklistVariation & {
  key: string
  label: string
}

const BASE_PARALLEL_TERMS =
  /\b(refractor|speckle|purple|blue|aqua|green|gold|orange|red|superfractor|sapphire|lava|shimmer|wave|raywave|mini\s*diamond|rose|yellow|black|pearl|atomic|mojo|x\s*(?:re)?fractor|xfractor|image\s+variation|packfractor|logofractor|firefractor|geometric|reptilian|grass)\b/i

const SOLD_MODEL_BLOCKERS = [
  /\btopps\s+bunt\s+digital\b/i,
  /\btopps\s+bunt\b/i,
  /\bbunt\b/i,
  /\bdigital\b/i,
  /\bredeemed\b/i,
  /\bpaper\b/i,
  /(?:^|\s|#)bpa[-\s]?[a-z0-9]+/i,
  /\bpower\s*chords?\b/i,
  /\bdie[-\s]?cut\b/i,
  /\belectric\s+sluggers?\b/i,
  /\bunder\s+the\s+radar\b/i,
  /\bpatchwork\b/i,
  /\bcrystall?ized\b/i,
  /\banime\b/i,
  /\bkanji\b/i,
  /\bspotlights?\b/i,
]

const DISTINCT_PARALLEL_MODIFIERS = [
  { key: 'mojo', pattern: /\bmojo\b/ },
  { key: 'shimmer', pattern: /\bshimmer\b/ },
  { key: 'lava', pattern: /\blava\b/ },
  { key: 'wave', pattern: /\b(?:ray\s*)?wave\b/ },
  { key: 'geometric', pattern: /\bgeometric\b/ },
  { key: 'x-fractor', pattern: /\bx\s*(?:re)?fractor\b|\bxfractor\b/ },
  { key: 'packfractor', pattern: /\bpackfractor\b/ },
  { key: 'logofractor', pattern: /\blogofractor\b/ },
  { key: 'firefractor', pattern: /\bfirefractor\b/ },
  { key: 'mini-diamond', pattern: /\bmini\s*diamond\b/ },
  { key: 'speckle', pattern: /\bspeckle\b/ },
  { key: 'atomic', pattern: /\batomic\b/ },
  { key: 'reptilian', pattern: /\breptilian\b/ },
  { key: 'grass', pattern: /\bgrass\b/ },
]

function numberValue(value: unknown, fallback = 0) {
  const parsed =
    typeof value === 'number'
      ? value
      : Number(String(value ?? '').replace(/[$,%\s,]/g, ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function moneyValue(values: Array<EbayMoney | string | number | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'number' || typeof value === 'string') {
      const parsed = numberValue(value, 0)
      if (parsed > 0) return parsed
      continue
    }
    const parsed = numberValue(value?.value ?? value?.convertedFromValue, 0)
    if (parsed > 0) return parsed
  }
  return 0
}

function firstString(values: unknown[], fallback = '') {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return fallback
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/#/g, '/')
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedWords(value: string) {
  return normalizeText(value).split(' ').filter(Boolean)
}

function titleMatchesPlayer(title: string, playerName: string) {
  const titleWords = new Set(normalizedWords(title))
  const playerWords = normalizedWords(playerName).filter((word) => word.length > 1)
  if (playerWords.length < 2) return playerWords.every((word) => titleWords.has(word))
  return playerWords.every((word) => titleWords.has(word))
}

function titleEligibleForSoldModel(title: string) {
  return !SOLD_MODEL_BLOCKERS.some((pattern) => pattern.test(title))
}

function serialDenominatorFromTitle(title: string) {
  const match = title.match(/(?:\/|#\/|numbered\s+to\s+)(\d{1,3})\b/i)
  return match ? Number(match[1]) : null
}

function soldAtFromItem(item: RawEbaySoldItem) {
  const value = firstString(
    [item.itemSoldDate, item.lastSoldDate, item.dateSold, item.transactionDate, item.itemEndDate, item.itemCreationDate],
    '',
  )
  if (!value) return ''
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : ''
}

function compactQuery(query: string) {
  const compacted = query.replace(/\s+/g, ' ').trim()
  return compacted.length <= 100 ? compacted : compacted.slice(0, 100).trim()
}

function tokenSet(value: string) {
  return new Set(normalizedWords(value))
}

function comparableVariationText(value: string) {
  return normalizeText(value).replace(/\b(1st|first|bowman|chrome|prospect|auto|autograph|autographs|autographed)\b/g, ' ')
}

function comparableVariationTokens(value: string) {
  return comparableVariationText(value).split(/\s+/).filter(Boolean)
}

function distinctParallelModifiers(value: string) {
  const text = comparableVariationText(value)
  return new Set(DISTINCT_PARALLEL_MODIFIERS.filter((modifier) => modifier.pattern.test(text)).map((modifier) => modifier.key))
}

function hasUnmatchedDistinctModifier(haystack: string, variation: string) {
  const haystackModifiers = distinctParallelModifiers(haystack)
  if (haystackModifiers.size === 0) return false
  const variationModifiers = distinctParallelModifiers(variation)
  return [...haystackModifiers].some((modifier) => !variationModifiers.has(modifier))
}

function tokenMatchesVariationPart(part: string, tokens: Set<string>) {
  if (part.startsWith('/')) return tokens.has(part)
  if (part === 'x') return tokens.has('x') || tokens.has('xfractor')
  if (part === 'fractor') return tokens.has('fractor') || tokens.has('xfractor') || tokens.has('refractor')
  return tokens.has(part)
}

function variationSpecificity(variation: string) {
  return comparableVariationTokens(variation)
    .filter((part) => !/^(variation|parallel)$/.test(part))
    .reduce((total, part) => total + (/^\/\d+$/.test(part) ? 1 : 2), 0)
}

function variationScore(title: string, variation: string) {
  const target = comparableVariationText(variation)
  if (!target) return 0
  if (hasUnmatchedDistinctModifier(title, variation)) return 0

  const targetTokens = comparableVariationTokens(variation)
  const titleTokens = tokenSet(title)
  const serialTokens = targetTokens.filter((part) => /^\/\d+$/.test(part))
  const specificTokens = targetTokens.filter((part) => !/^\/\d+$/.test(part) && !/^(variation|parallel)$/.test(part))
  const specificHits = specificTokens.filter((part) => tokenMatchesVariationPart(part, titleTokens)).length
  const serialHits = serialTokens.filter((part) => tokenMatchesVariationPart(part, titleTokens)).length
  const specificScore = specificTokens.length ? specificHits / specificTokens.length : 0
  const serialScore = serialTokens.length ? serialHits / serialTokens.length : 0
  const exactBoost = comparableVariationText(title).includes(target) ? 0.16 : 0
  const score = Math.min(1, Math.max(0, specificScore * 0.72 + serialScore * 0.28 + exactBoost))
  if (serialTokens.length > 0 && serialHits === 0) return Math.min(score, 0.52)
  return score
}

function classifyVariation(title: string, variations: VariationCandidate[]) {
  let best: { variation: VariationCandidate; score: number; specificity: number } | null = null

  for (const variation of variations) {
    if (variationKey(variation.variation) === 'base') continue
    const score = variationScore(title, variation.variation)
    const specificity = variationSpecificity(variation.variation)
    const bestScore = best?.score ?? 0
    if (score > bestScore + 0.001 || (Math.abs(score - bestScore) <= 0.001 && specificity > (best?.specificity ?? 0))) {
      best = { variation, score, specificity }
    }
  }

  return best && best.score >= 0.55 ? best.variation : null
}

function isLikelyBaseTitle(title: string) {
  return !BASE_PARALLEL_TERMS.test(title) && !serialDenominatorFromTitle(title)
}

function ageDays(soldAt: number, asOf: number) {
  return Math.max(0, (asOf - soldAt) / 86_400_000)
}

function robustTimeWeightedAverage(values: Array<{ value: number; soldAt: number }>, asOf: number, halfLifeDays: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left.value - right.value)
  const trimCount = sorted.length >= 10 ? Math.floor(sorted.length * 0.1) : 0
  const trimmed = trimCount > 0 ? sorted.slice(trimCount, sorted.length - trimCount) : sorted
  const weighted = trimmed.map((item) => ({
    value: item.value,
    weight: Math.pow(0.5, ageDays(item.soldAt, asOf) / halfLifeDays),
  }))
  const totalWeight = weighted.reduce((total, item) => total + item.weight, 0)
  if (totalWeight <= 0) return 0
  return weighted.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight
}

function checklistSaleFromComp(comp: EbaySoldComp): ChecklistSale {
  return {
    id: comp.itemId,
    title: comp.title,
    saleDate: comp.soldAt,
    salePrice: comp.salePrice,
    variation: comp.kind === 'base' ? 'Base Auto' : comp.variationLabel,
  }
}

function soldCompIdentity(comp: EbaySoldComp) {
  return comp.itemId || `${comp.playerName}:${comp.title}:${comp.salePrice}:${comp.soldAt}`
}

function dedupeSoldComps(comps: EbaySoldComp[]) {
  const seen = new Set<string>()
  const deduped: EbaySoldComp[] = []
  for (const comp of comps) {
    const key = soldCompIdentity(comp)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(comp)
  }
  return deduped
}

function soldModelQueries(model: ChecklistModel, playerLimit: number | null | undefined) {
  const players = [...model.players].sort(
    (left, right) => right.baseAvgPrice - left.baseAvgPrice || left.playerName.localeCompare(right.playerName),
  )
  const selected = playerLimit && playerLimit > 0 ? players.slice(0, playerLimit) : players
  return selected.map((player) => ({
    q: compactQuery(`${player.playerName} 1st bowman chrome auto`),
    playerName: player.playerName,
    release: model.release,
    releaseYear: model.releaseYear,
    category: model.category,
  }))
}

export function mapEbaySoldItemToComp(item: RawEbaySoldItem, model: ChecklistModel): EbaySoldComp | null {
  const meta = item._bowmanTraderQuery
  const playerName = firstString([meta?.playerName], '')
  const title = firstString([item.title], '')
  if (!playerName || !title || !titleMatchesPlayer(title, playerName)) return null
  if (!/\bbowman\b/i.test(title) || !/\bchrome\b/i.test(title) || !/\b(auto|autograph|autographs|autographed)\b/i.test(title)) return null
  if (!/\b(1st|first)\b/i.test(title)) return null
  if (!titleEligibleForSoldModel(title)) return null

  const salePrice = moneyValue([item.itemSoldPrice, item.soldPrice, item.totalPrice, item.price])
  const soldAt = soldAtFromItem(item)
  if (salePrice <= 0 || !soldAt) return null

  const releaseCurve = releaseVariationCurve(model)
  const variations = releaseCurve.variations.map((variation) => ({
    ...variation,
    key: variationKey(variation.variation),
    label: variation.variation,
  }))
  const variation = classifyVariation(title, variations)
  if (!variation && !isLikelyBaseTitle(title)) return null

  const itemId = firstString([item.legacyItemId, item.itemId, item.itemWebUrl], title)
  return {
    itemId,
    playerName,
    title,
    salePrice,
    soldAt,
    kind: variation ? 'variation' : 'base',
    variationKey: variation?.key ?? 'base',
    variationLabel: variation?.label ?? 'Base Auto',
    serialDenominator: serialDenominatorFromTitle(title),
    listingUrl: firstString([item.itemAffiliateWebUrl, item.itemWebUrl], ''),
  }
}

export function buildEbaySoldVariationModel(seedModel: ChecklistModel, comps: EbaySoldComp[], asOf = Date.now()): ChecklistModel {
  const compsByPlayer = new Map<string, EbaySoldComp[]>()
  for (const comp of dedupeSoldComps(comps)) {
    compsByPlayer.set(comp.playerName, [...(compsByPlayer.get(comp.playerName) ?? []), comp])
  }

  const players: ChecklistPlayer[] = seedModel.players.map((player) => {
    const playerComps = compsByPlayer.get(player.playerName) ?? []
    const baseComps = playerComps.filter((comp) => comp.kind === 'base')
    const baseSales = baseComps.map(checklistSaleFromComp)
    const baseProbe: ChecklistPlayer = {
      ...player,
      baseSales,
      base_sales: baseSales,
      baseSalesCount: baseComps.length || player.baseSalesCount,
    }
    const baseEstimate = estimateBasePrice(baseProbe, asOf)
    const variationGroups = new Map<string, EbaySoldComp[]>()

    for (const comp of playerComps.filter((candidate) => candidate.kind === 'variation')) {
      variationGroups.set(comp.variationKey, [...(variationGroups.get(comp.variationKey) ?? []), comp])
    }

    const variations = [...variationGroups.values()].flatMap((variationComps) => {
      const first = variationComps[0]
      if (!first || baseEstimate.price <= 0) return []
      const avgPrice = robustTimeWeightedAverage(
        variationComps.map((comp) => ({ value: comp.salePrice, soldAt: Date.parse(comp.soldAt) })).filter((comp) => Number.isFinite(comp.soldAt)),
        asOf,
        45,
      )
      if (avgPrice <= 0) return []
      return [
        {
          variation: first.variationLabel,
          avgPrice: Number(avgPrice.toFixed(2)),
          multiplier: Number((avgPrice / baseEstimate.price).toFixed(3)),
          salesCount: variationComps.length,
        },
      ]
    })

    return {
      ...player,
      baseAvgPrice: baseEstimate.price || player.baseAvgPrice,
      baseSalesCount: baseComps.length || player.baseSalesCount,
      baseSales,
      base_sales: baseSales,
      variations,
    }
  })

  const playerBaseEstimates = new Map(
    players.map((player) => [
      player.playerName,
      estimateBasePrice(player, asOf).price || player.baseAvgPrice,
    ]),
  )
  const ratioGroups = new Map<string, Array<{ value: number; soldAt: number; label: string; sortOrder: number | null | undefined }>>()

  for (const comp of comps.filter((candidate) => candidate.kind === 'variation')) {
    const basePrice = playerBaseEstimates.get(comp.playerName) ?? 0
    const soldAt = Date.parse(comp.soldAt)
    if (basePrice <= 0 || comp.salePrice <= 0 || !Number.isFinite(soldAt)) continue
    ratioGroups.set(comp.variationKey, [
      ...(ratioGroups.get(comp.variationKey) ?? []),
      { value: comp.salePrice / basePrice, soldAt, label: comp.variationLabel, sortOrder: null },
    ])
  }

  const fallbackCurve = releaseVariationCurve(seedModel).variations
  const fallbackByKey = new Map(fallbackCurve.map((variation) => [variationKey(variation.variation), variation]))
  const multiplierKeys = new Set([...fallbackByKey.keys(), ...ratioGroups.keys()])
  const multipliers = [...multiplierKeys]
    .flatMap<ChecklistVariation>((key) => {
      const fallback = fallbackByKey.get(key)
      if (key === 'base') return [{ variation: fallback?.variation ?? 'Base Auto', avgMultiplier: 1, sortOrder: -1 }]
      const ratios = ratioGroups.get(key) ?? []
      if (ratios.length === 0) return fallback ? [fallback] : []
      const multiplier = robustTimeWeightedAverage(ratios, asOf, 45)
      if (multiplier <= 0) return fallback ? [fallback] : []
      return [
        {
          variation: ratios[0]?.label ?? fallback?.variation ?? key,
          avgMultiplier: Number(multiplier.toFixed(3)),
          playerCount: new Set(comps.filter((comp) => comp.variationKey === key).map((comp) => comp.playerName)).size,
          totalSales: ratios.length,
          sortOrder: fallback?.sortOrder ?? null,
        },
      ]
    })
    .sort((left, right) => (left.sortOrder ?? Number.POSITIVE_INFINITY) - (right.sortOrder ?? Number.POSITIVE_INFINITY))

  return {
    ...seedModel,
    players,
    multipliers,
    fetchedAt: new Date(asOf).toISOString(),
    source: 'ebay-sold-model',
  }
}

export function summarizeEbaySoldModel(seedModel: ChecklistModel, comps: EbaySoldComp[], model: ChecklistModel, baseStats?: Partial<EbaySoldModelStats>) {
  const releaseCurve = releaseVariationCurve(seedModel)
  const seedKeys = new Set(releaseCurve.variations.map((variation) => variationKey(variation.variation)))
  const soldKeys = new Set(comps.filter((comp) => comp.kind === 'variation').map((comp) => comp.variationKey))
  const soldAnchoredPlayers = model.players.filter((player) => (player.baseSales?.length ?? 0) > 0).length

  return {
    queriesRun: baseStats?.queriesRun ?? 0,
    queriesSucceeded: baseStats?.queriesSucceeded ?? 0,
    queriesFailed: baseStats?.queriesFailed ?? 0,
    pagesFetched: baseStats?.pagesFetched ?? 0,
    upstreamTotal: baseStats?.upstreamTotal ?? 0,
    dedupedItems: baseStats?.dedupedItems ?? comps.length,
    mappedComps: comps.length,
    rejectedComps: Math.max(0, (baseStats?.dedupedItems ?? comps.length) - comps.length),
    baseComps: comps.filter((comp) => comp.kind === 'base').length,
    variationComps: comps.filter((comp) => comp.kind === 'variation').length,
    soldDerivedMultipliers: [...soldKeys].length,
    fallbackMultipliers: [...seedKeys].filter((key) => key !== 'base' && !soldKeys.has(key)).length,
    soldAnchoredPlayers,
  }
}

export async function fetchEbaySoldVariationModel(options: {
  model: ChecklistModel
  playerLimit?: number | null
  limitPerPlayer?: number
  maxPagesPerPlayer?: number
  signal?: AbortSignal
}): Promise<EbaySoldModelResult> {
  const queries = soldModelQueries(options.model, options.playerLimit)
  if (queries.length === 0) throw new Error('No checklist players are available to scan.')

  const response = await fetch('/api/ebay/sold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      queries,
      limit: options.limitPerPlayer ?? 100,
      maxPages: options.maxPagesPerPlayer ?? 1,
    }),
  })

  const payload = (await response.json()) as EbaySoldSearchResponse
  if (!response.ok) throw new Error(payload.error ?? 'eBay sold search failed')

  const comps = dedupeSoldComps(
    (payload.items ?? []).flatMap((item) => {
      const comp = mapEbaySoldItemToComp(item, options.model)
      return comp ? [comp] : []
    }),
  )
  const model = buildEbaySoldVariationModel(options.model, comps)
  const stats = summarizeEbaySoldModel(options.model, comps, model, payload.stats)

  return {
    model,
    comps,
    fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    errors: payload.errors ?? [],
    stats,
  }
}
