import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  FAIR_VALUE_MODEL_VERSION,
  VARIATION_FAIR_VALUE_POLICY,
  buildProximityRatioPoints,
  estimateBaseFairValue,
  estimateHierarchicalMultiplier,
  robustFairValueEstimate,
} from '../shared/fairValueEngine.js'
import {
  canonicalizeHistoricalBowmanAutoVariation,
  historicalBowmanAutoPrior,
} from '../shared/bowmanAutoTaxonomy.js'
import {
  BOWMAN_2026_CHROME_AUTO_VARIATIONS,
  bowman2026AutoDefinition,
  canonicalizeBowman2026AutoVariation,
  extractSerialDenominator,
} from '../shared/bowman2026Taxonomy.js'
import { buildReleaseLaneRegistry } from '../shared/releaseLaneRegistry.js'

const ROOT = process.cwd()
const DB_PATH = resolve(ROOT, process.argv[2] ?? 'local-data/backstop-sales.sqlite')
const OUTPUT_PATH = resolve(ROOT, process.argv[3] ?? 'src/data/staticChecklistSnapshot.ts')
const MIN_YEAR = Number(process.env.STATIC_CHECKLIST_MIN_YEAR ?? 2016)
const MAX_BASE_SALES_PER_PLAYER = 80

if (!existsSync(DB_PATH)) {
  throw new Error(`Missing sales database at ${DB_PATH}`)
}

const db = new DatabaseSync(DB_PATH, { readOnly: true })

function rowString(row, key) {
  const value = row?.[key]
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function rowNumber(row, key) {
  const value = row?.[key]
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value) {
  return Number(Number(value || 0).toFixed(2))
}

function modelPrice(row) {
  return (
    rowNumber(row, 'twma30') ||
    rowNumber(row, 'recent5Avg') ||
    rowNumber(row, 'twma90') ||
    rowNumber(row, 'medianPrice') ||
    rowNumber(row, 'avgPrice')
  )
}

function categoryFromReleaseName(releaseName) {
  const text = releaseName.toLowerCase()
  if (/\bdraft\b/.test(text)) return 'draft'
  if (/\bchrome\b/.test(text)) return 'chrome'
  return 'bowman'
}

function productMatchesReleaseCategory(productFamily, releaseCategory) {
  const product = searchKey(productFamily)
  if (releaseCategory === 'draft') return product.includes('draft')
  if (releaseCategory === 'chrome') return product.includes('chrome') && !product.includes('draft')
  // Prospect autos from the flagship Bowman release are catalogued under the
  // Bowman Chrome card family. Bowman Draft remains a separate release lane.
  return product.includes('chrome') && !product.includes('draft')
}

function releaseSlug(releaseName, releaseKey) {
  const label = releaseName.replace(/\s+/g, ' ').trim().replace(/ /g, '-')
  return label || releaseKey
}

function searchKey(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function playerYearKey(playerName, releaseYear) {
  return `${releaseYear}:${searchKey(playerName)}`
}

function isBaseVariation(label) {
  const text = searchKey(label)
  return text === '' || text === 'base' || text === 'base auto'
}

function displayVariation(row) {
  const label = rowString(row, 'variationLabel') || 'Base Auto'
  if (isBaseVariation(label)) return 'Base Auto'
  const product = searchKey(rowString(row, 'productFamily'))
  const cardClass = searchKey(rowString(row, 'cardClass'))
  if ((cardClass === 'paper auto' || product.includes('paper')) && !searchKey(label).includes('paper')) {
    return `Paper ${label}`
  }
  return label
}

function canonicalReleaseVariation(row, releaseYear, releaseCategory) {
  const options = {
    playerName: rowString(row, 'playerName'),
    assumeAuto: true,
  }
  const classify = releaseYear === 2026 && releaseCategory === 'bowman'
    ? canonicalizeBowman2026AutoVariation
    : canonicalizeHistoricalBowmanAutoVariation

  // Raw listing text is the primary identity evidence. Appending a cached
  // variation label before classification allowed stale upstream metadata to
  // turn a plain base auto into Mini Diamond /100 (and similar phantom lanes).
  const title = rowString(row, 'title')
  if (title) {
    const resolved = classify(title, options)
    if (!resolved.modelEligible) return null
    return {
      label: resolved.definition.label,
      confidence: resolved.confidence,
      registryClass: releaseYear === 2026 && releaseCategory === 'bowman'
        ? 'official'
        : resolved.definition.registryClass ?? 'release-confirmed',
      explicitDenominator: Boolean(extractSerialDenominator(title)),
    }
  }

  // Structured metadata is a fallback for sources without a title, never a
  // competing vote against an explicit listing title.
  const displayed = displayVariation(row)
  const sourceText = [
    displayed,
    rowNumber(row, 'serialDenominator') ? `/${rowNumber(row, 'serialDenominator')}` : '',
  ].filter(Boolean).join(' ')
  const resolved = classify(sourceText, options)
  if (!resolved.modelEligible) return null
  return {
    label: resolved.definition.label,
    confidence: Math.min(resolved.confidence, 0.82),
    registryClass: releaseYear === 2026 && releaseCategory === 'bowman'
      ? 'official'
      : resolved.definition.registryClass ?? 'release-confirmed',
    explicitDenominator: Boolean(rowNumber(row, 'serialDenominator') || extractSerialDenominator(sourceText)),
  }
}

function serialDenominatorFromLabel(label) {
  const match = String(label ?? '').match(/\/(\d{1,4})\b/)
  const denominator = Number(match?.[1])
  return Number.isFinite(denominator) && denominator > 0 ? denominator : 0
}

function stabilizedDirectValue(estimate) {
  if (!estimate?.value) return 0
  if (!estimate.weightedMedian) return estimate.value
  const medianWeight = VARIATION_FAIR_VALUE_POLICY.directMedianBlend
  return Math.exp(
    Math.log(estimate.value) * (1 - medianWeight) + Math.log(estimate.weightedMedian) * medianWeight,
  )
}

function variationSortOrder(label, serialDenominator) {
  if (isBaseVariation(label)) return -1
  const denominator = Number(serialDenominator)
  if (Number.isFinite(denominator) && denominator > 0) return 100_000 - denominator
  return 200_000 + searchKey(label).charCodeAt(0)
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const releases = db.prepare(`
  SELECT
    release_key AS releaseKey,
    release_year AS releaseYear,
    release_name AS releaseName,
    product_line AS productLine,
    imported_at AS importedAt
  FROM checklist_releases
  WHERE release_year >= ?
    AND EXISTS (SELECT 1 FROM checklist_cards source_cards WHERE source_cards.release_key = checklist_releases.release_key)
  ORDER BY release_year DESC, release_name
`).all(MIN_YEAR)

const playerStatement = db.prepare(`
  SELECT
    c.release_key AS releaseKey,
    c.release_year AS releaseYear,
    c.player_key AS playerKey,
    MAX(c.player_name) AS playerName,
    MAX(NULLIF(c.team, '')) AS team,
    MAX(CASE WHEN c.first_status = 'confirmed_1st' THEN 1 ELSE 0 END) AS confirmedFirst,
    COUNT(*) AS checklistRows
  FROM checklist_cards c
  WHERE c.release_key = ?
  GROUP BY c.release_key, c.release_year, c.player_key
  ORDER BY playerName
`)

const baseCandidateStatement = db.prepare(`
  SELECT
    cc.player_name AS playerName,
    cc.product_family AS productFamily,
    cc.variation_label AS variationLabel,
    s.sale_count AS saleCount,
    s.sales_30 AS sales30,
    s.sales_90 AS sales90,
    s.auction_count AS auctionCount,
    s.bin_count AS binCount,
    s.twma_30 AS twma30,
    s.twma_90 AS twma90,
    s.recent_3_avg AS recent3Avg,
    s.recent_5_avg AS recent5Avg,
    s.median_price AS medianPrice,
    s.avg_price AS avgPrice,
    s.latest_sold_at AS latestSoldAt
  FROM canonical_cards cc
  JOIN canonical_comp_summary s ON s.canonical_card_key = cc.canonical_card_key
  WHERE cc.release_year = ?
    AND cc.grade_bucket = 'Raw'
    AND cc.card_class IN ('auto', 'paper-auto')
    AND cc.variation_label IN ('Base Auto', 'Base', '')
    AND s.sale_count > 0
  ORDER BY
    cc.player_name,
    CASE WHEN lower(cc.product_family) LIKE '%chrome%' THEN 0 ELSE 1 END,
    s.sale_count DESC,
    s.sales_30 DESC,
    s.latest_sold_at DESC
`)

const allAutoSalesStatement = db.prepare(`
  SELECT
    cc.player_name AS playerName,
    cc.release_year AS releaseYear,
    cc.product_family AS productFamily,
    cc.card_class AS cardClass,
    cc.variation_label AS variationLabel,
    cc.serial_denominator AS serialDenominator,
    m.source AS source,
    m.source_key AS sourceKey,
    json_extract(m.raw_json, '$.normalized.itemId') AS itemId,
    json_extract(m.raw_json, '$.normalized.title') AS title,
    json_extract(m.raw_json, '$.normalized.salePrice') AS salePrice,
    json_extract(m.raw_json, '$.normalized.soldAt') AS soldAt,
    json_extract(m.raw_json, '$.normalized.channel') AS channel,
    json_extract(m.raw_json, '$.normalized.modelEligible') AS modelEligible
  FROM canonical_source_mappings m
  JOIN canonical_cards cc USING(canonical_card_key)
  WHERE cc.release_year = ?
    AND cc.grade_bucket = 'Raw'
    AND cc.card_class = 'auto'
    AND json_extract(m.raw_json, '$.normalized.salePrice') > 0
    AND json_extract(m.raw_json, '$.normalized.soldAt') IS NOT NULL
  ORDER BY json_extract(m.raw_json, '$.normalized.soldAt') DESC
`)

function baseCandidatesByPlayer(releaseYear, releaseCategory) {
  const map = new Map()
  for (const row of baseCandidateStatement.all(releaseYear)) {
    if (!productMatchesReleaseCategory(rowString(row, 'productFamily'), releaseCategory)) continue
    const key = playerYearKey(rowString(row, 'playerName'), releaseYear)
    if (!map.has(key)) map.set(key, row)
  }
  return map
}

function releaseProximitySales(releaseYear, releaseCategory, allowedPlayerKeys) {
  const candidates = []
  const seen = new Set()
  for (const row of allAutoSalesStatement.all(releaseYear)) {
    if (!rowNumber(row, 'modelEligible')) continue
    if (!productMatchesReleaseCategory(rowString(row, 'productFamily'), releaseCategory)) continue
    const playerKey = playerYearKey(rowString(row, 'playerName'), releaseYear)
    if (!allowedPlayerKeys.has(playerKey)) continue
    const price = rowNumber(row, 'salePrice')
    const soldAt = rowString(row, 'soldAt')
    if (!price || !soldAt) continue
    const itemId = rowString(row, 'itemId') || rowString(row, 'sourceKey')
    const identity = itemId.replace(/^[a-z_-]+:/i, '') || `${soldAt}|${money(price)}|${searchKey(rowString(row, 'title'))}`
    if (seen.has(identity)) continue
    seen.add(identity)
    const resolved = canonicalReleaseVariation(row, releaseYear, releaseCategory)
    if (!resolved) continue
    candidates.push({
      ...resolved,
      playerKey,
      sale: {
        price,
        soldAt,
        channel: rowString(row, 'channel'),
        itemId,
        title: rowString(row, 'title'),
        source: rowString(row, 'source'),
        groupKey: playerKey,
        playerName: rowString(row, 'playerName'),
      },
    })
  }

  const registry = buildReleaseLaneRegistry(candidates, {
    officialLabels: releaseYear === 2026 && releaseCategory === 'bowman'
      ? BOWMAN_2026_CHROME_AUTO_VARIATIONS.map((definition) => definition.label)
      : [],
  })
  const byPlayer = new Map()
  for (const candidate of candidates) {
    if (!registry.acceptedLabels.has(candidate.label)) continue
    const player = byPlayer.get(candidate.playerKey) ?? new Map()
    const lane = player.get(candidate.label) ?? []
    lane.push(candidate.sale)
    player.set(candidate.label, lane)
    byPlayer.set(candidate.playerKey, player)
  }
  return { byPlayer, registry }
}

function buildBaseEvidence(proximitySalesByPlayer) {
  const estimates = new Map()
  const exportedSales = new Map()
  for (const [playerKey, lanes] of proximitySalesByPlayer.entries()) {
    const sales = lanes.get('Base Auto') ?? []
    if (!sales.length) continue
    const estimate = estimateBaseFairValue(sales)
    if (estimate) estimates.set(playerKey, estimate)
    exportedSales.set(
      playerKey,
      sales.slice(0, MAX_BASE_SALES_PER_PLAYER).map((sale) => ({
        id: sale.itemId,
        title: sale.title,
        salePrice: money(sale.price),
        soldAt: sale.soldAt,
        saleType: sale.channel,
        source: sale.source,
        format: sale.channel,
      })),
    )
  }
  return { estimates, exportedSales }
}

function directVariationRows(proximitySalesByPlayer, baseEstimates) {
  const byPlayer = new Map()
  for (const [playerKey, lanes] of proximitySalesByPlayer.entries()) {
    const baseEstimate = baseEstimates.get(playerKey)
    const playerRows = new Map()
    for (const [label, sales] of lanes.entries()) {
      if (isBaseVariation(label) || !sales.length) continue
      const estimate = robustFairValueEstimate(sales, {
        halfLifeDays: VARIATION_FAIR_VALUE_POLICY.directHalfLifeDays,
        maxSales: VARIATION_FAIR_VALUE_POLICY.directMaxSales,
        enableTrend: false,
      })
      const price = stabilizedDirectValue(estimate)
      if (!price) continue
      const multiplier = baseEstimate?.value > 0 ? price / baseEstimate.value : 0
      const serialDenominator = serialDenominatorFromLabel(label)
      playerRows.set(label, {
        variation: label,
        avgPrice: money(price),
        multiplier: multiplier > 0 ? Number(multiplier.toFixed(3)) : 0,
        salesCount: estimate?.count ?? sales.length,
        effectiveSales: Number((estimate?.effectiveN ?? 0).toFixed(2)),
        modelConfidence: Number((estimate?.confidence ?? 0).toFixed(3)),
        sortOrder: variationSortOrder(label, serialDenominator),
      })
    }
    if (playerRows.size) byPlayer.set(playerKey, playerRows)
  }
  return byPlayer
}

function variationRowsByPlayer(
  releaseContext,
  crossReleaseRatioIndex,
) {
  const {
    releaseId,
    releaseYear,
    releaseCategory,
    baseEstimates,
    allowedPlayerKeys,
    proximitySalesByPlayer,
    laneRegistry,
  } = releaseContext
  const byPlayer = directVariationRows(proximitySalesByPlayer, baseEstimates)
  const registryByLabel = new Map(laneRegistry.lanes.map((lane) => [lane.label, lane]))

  const multiplierBuckets = new Map()
  for (const rows of byPlayer.values()) {
    for (const row of rows.values()) {
      if (row.multiplier <= 0) continue
      const bucket = multiplierBuckets.get(row.variation) ?? {
        label: row.variation,
        values: [],
        playerCount: 0,
        totalSales: 0,
        sortOrder: row.sortOrder,
      }
      bucket.values.push(row.multiplier)
      bucket.playerCount += 1
      bucket.totalSales += row.salesCount
      bucket.sortOrder = Math.min(bucket.sortOrder, row.sortOrder)
      multiplierBuckets.set(row.variation, bucket)
    }
  }

  if (releaseYear === 2026 && releaseCategory === 'bowman') {
    for (const definition of BOWMAN_2026_CHROME_AUTO_VARIATIONS) {
      if (definition.id === 'base-auto') continue
      const key = definition.label
      if (multiplierBuckets.has(key)) continue
      multiplierBuckets.set(key, {
        label: definition.label,
        values: [],
        playerCount: 0,
        totalSales: 0,
        sortOrder: variationSortOrder(definition.label, definition.serialDenominator),
      })
    }
  }

  const multipliers = [
    {
      variation: 'Base Auto',
      avgMultiplier: 1,
      playerCount: [...allowedPlayerKeys].filter((key) => baseEstimates.has(key)).length,
      totalSales: [...allowedPlayerKeys].reduce((total, key) => total + (baseEstimates.get(key)?.count ?? 0), 0),
      sortOrder: -1,
      modelMethod: 'structural-base-anchor',
      modelConfidence: 1,
      structuralPrior: 1,
      modelEvidence: 'observed',
      modelActionable: true,
      modelLowMultiplier: 1,
      modelHighMultiplier: 1,
      empiricalEffectiveSales: [...allowedPlayerKeys].reduce((total, key) => total + (baseEstimates.get(key)?.effectiveN ?? 0), 0),
      modelRegistryClass: 'base',
      registryPlayerCount: [...allowedPlayerKeys].filter((key) => baseEstimates.has(key)).length,
      registryExplicitSales: 0,
    },
    ...[...multiplierBuckets.values()]
      .map((bucket) => {
        const ratioPoints = []
        for (const player of proximitySalesByPlayer.values()) {
          const baseSales = player.get('Base Auto') ?? []
          const variationSales = player.get(bucket.label) ?? []
          if (!baseSales.length || !variationSales.length) continue
          ratioPoints.push(...buildProximityRatioPoints(variationSales, baseSales))
        }
        const legacyPrior = median(bucket.values)
        const structuralDefinition =
          releaseYear === 2026 && releaseCategory === 'bowman'
            ? bowman2026AutoDefinition(bucket.label)
            : null
        const pooledPrior = structuralDefinition
          ? null
          : resolveCrossReleasePrior(bucket.label, releaseId, crossReleaseRatioIndex)
        const genericPrior = structuralDefinition ? null : historicalBowmanAutoPrior(bucket.label)
        const priorMultiplier = structuralDefinition?.priorMultiplier ?? pooledPrior?.multiplier ?? genericPrior?.multiplier ?? legacyPrior
        const priorReliability = structuralDefinition?.priorReliability ?? pooledPrior?.reliability ?? genericPrior?.reliability ?? 0.28
        const estimate = estimateHierarchicalMultiplier({
          priorMultiplier,
          priorReliability,
          releaseRatioPoints: ratioPoints,
        })
        const registryEntry = registryByLabel.get(bucket.label)
        return {
          variation: bucket.label,
          avgMultiplier: Number(estimate.multiplier.toFixed(3)),
          playerCount: Math.max(
            bucket.playerCount,
            [...proximitySalesByPlayer.values()].filter((player) => (player.get(bucket.label) ?? []).length > 0).length,
          ),
          totalSales: Math.max(bucket.totalSales, ratioPoints.length),
          sortOrder: structuralDefinition?.scarcityOrder ?? bucket.sortOrder,
          modelMethod: 'hierarchical-proximity-v3',
          modelConfidence: Number(estimate.confidence.toFixed(3)),
          structuralPrior: Number(priorMultiplier.toFixed(3)),
          structuralPriorSource: structuralDefinition
            ? 'official-release-structure'
            : pooledPrior?.source ?? genericPrior?.source ?? 'release-median-fallback',
          pooledReleaseCount: pooledPrior?.releaseCount ?? 0,
          proximitySales: ratioPoints.length,
          modelEvidence: estimate.evidenceTier,
          modelActionable: estimate.actionable,
          modelLowMultiplier: Number(estimate.low.toFixed(3)),
          modelHighMultiplier: Number(estimate.high.toFixed(3)),
          empiricalEffectiveSales: Number(estimate.effectiveN.toFixed(2)),
          modelRegistryClass: registryEntry?.registryClass ?? (structuralDefinition ? 'official' : 'standard'),
          registryPlayerCount: registryEntry?.playerCount ?? 0,
          registryExplicitSales: registryEntry?.explicitDenominatorSales ?? 0,
        }
      })
      .filter((bucket) => bucket.avgMultiplier > 1)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.avgMultiplier - right.avgMultiplier),
  ]

  const multiplierLookup = new Map(multipliers.map((bucket) => [bucket.variation, bucket.avgMultiplier]))
  for (const [playerKey, rows] of byPlayer.entries()) {
    const validRows = []
    for (const row of rows.values()) {
      if (row.multiplier > 0) continue
      const fallback = multiplierLookup.get(row.variation)
      if (fallback && fallback > 0) row.multiplier = fallback
    }
    for (const row of rows.values()) {
      if (row.multiplier <= 0) continue
      const { sortOrder: _sortOrder, ...publicRow } = row
      validRows.push(publicRow)
    }
    validRows.sort((left, right) => {
      const leftOrder = rows.get(left.variation)?.sortOrder ?? 0
      const rightOrder = rows.get(right.variation)?.sortOrder ?? 0
      return leftOrder - rightOrder || left.variation.localeCompare(right.variation)
    })
    byPlayer.set(playerKey, validRows)
  }

  return { byPlayer, multipliers }
}

function releaseRatioIndex(proximitySalesByPlayer, releaseId) {
  const index = new Map()
  for (const [playerKey, player] of proximitySalesByPlayer.entries()) {
    const baseSales = player.get('Base Auto') ?? []
    if (!baseSales.length) continue
    for (const [label, variationSales] of player.entries()) {
      if (isBaseVariation(label) || !variationSales.length) continue
      const points = buildProximityRatioPoints(variationSales, baseSales).map((point) => ({
        ...point,
        groupKey: `${releaseId}:${playerKey}`,
      }))
      if (!points.length) continue
      const current = index.get(label) ?? []
      current.push(...points)
      index.set(label, current)
    }
  }
  return index
}

function buildCrossReleaseRatioIndex(contexts) {
  const index = new Map()
  for (const context of contexts) {
    for (const [label, points] of context.ratioIndex.entries()) {
      const releasesById = index.get(label) ?? new Map()
      releasesById.set(context.releaseId, points)
      index.set(label, releasesById)
    }
  }
  return index
}

function resolveCrossReleasePrior(label, currentReleaseId, crossReleaseRatioIndex) {
  const generic = historicalBowmanAutoPrior(label)
  if (!generic) return null
  const releasesById = crossReleaseRatioIndex.get(label)
  if (!releasesById) return { ...generic, releaseCount: 0 }
  const comparisonReleases = [...releasesById.entries()].filter(([releaseId]) => releaseId !== currentReleaseId)
  const points = comparisonReleases.flatMap(([, rows]) => rows)
  const groupCount = new Set(points.map((point) => point.groupKey)).size
  if (comparisonReleases.length < 2 || groupCount < 6) {
    return { ...generic, releaseCount: comparisonReleases.length }
  }

  // Cross-release evidence describes structural scarcity, not a dated market
  // quote. Equalize timestamps so an older release contributes its lane shape
  // without pretending its absolute prices are current.
  const asOf = Date.now()
  const structuralPoints = points.map((point) => ({ ...point, soldAt: asOf }))
  const pooled = estimateHierarchicalMultiplier({
    priorMultiplier: generic.multiplier,
    priorReliability: generic.reliability,
    releaseRatioPoints: structuralPoints,
    asOf,
  })
  return {
    multiplier: pooled.multiplier,
    reliability: Math.min(0.72, 0.44 + comparisonReleases.length * 0.035 + Math.min(groupCount, 24) * 0.006),
    source: 'cross-release-market-pool',
    releaseCount: comparisonReleases.length,
  }
}

const releaseContexts = releases.map((releaseRow) => {
  const releaseKey = rowString(releaseRow, 'releaseKey')
  const releaseYear = rowNumber(releaseRow, 'releaseYear')
  const releaseName = rowString(releaseRow, 'releaseName')
  const releaseCategory = categoryFromReleaseName(releaseName)
  const checklistPlayerRows = playerStatement.all(releaseKey)
  const allowedPlayerKeys = new Set(
    checklistPlayerRows.map((row) => playerYearKey(rowString(row, 'playerName'), releaseYear)),
  )
  const baseMap = baseCandidatesByPlayer(releaseYear, releaseCategory)
  const { byPlayer: proximitySalesByPlayer, registry: laneRegistry } = releaseProximitySales(
    releaseYear,
    releaseCategory,
    allowedPlayerKeys,
  )
  const { estimates: baseEstimates, exportedSales: salesMap } = buildBaseEvidence(proximitySalesByPlayer)
  const releaseId = `${releaseYear}:${releaseKey}`
  return {
    releaseRow,
    releaseId,
    releaseKey,
    releaseYear,
    releaseName,
    releaseCategory,
    checklistPlayerRows,
    allowedPlayerKeys,
    baseMap,
    baseEstimates,
    salesMap,
    proximitySalesByPlayer,
    laneRegistry,
    ratioIndex: releaseRatioIndex(proximitySalesByPlayer, releaseId),
  }
})

const crossReleaseRatioIndex = buildCrossReleaseRatioIndex(releaseContexts)

const models = releaseContexts.map((context) => {
  const {
    releaseRow,
    releaseKey,
    releaseYear,
    releaseName,
    releaseCategory,
    checklistPlayerRows,
    baseMap,
    baseEstimates,
    salesMap,
    laneRegistry,
  } = context
  const { byPlayer: variationMap, multipliers } = variationRowsByPlayer(context, crossReleaseRatioIndex)
  const players = checklistPlayerRows.map((row) => {
    const key = playerYearKey(rowString(row, 'playerName'), releaseYear)
    const baseRow = baseMap.get(key)
    const rawBaseEstimate = baseEstimates.get(key)
    const fallbackBasePrice = modelPrice(baseRow)
    const baseAvgPrice = money(rawBaseEstimate?.value || fallbackBasePrice)
    const baseSalesCount = rawBaseEstimate?.count ?? rowNumber(baseRow, 'saleCount')
    const baseModelMethod = rawBaseEstimate
      ? FAIR_VALUE_MODEL_VERSION
      : fallbackBasePrice > 0
        ? 'legacy-cached-summary'
        : 'unpriced'
    const baseModelConfidence = rawBaseEstimate
      ? Number(rawBaseEstimate.confidence.toFixed(3))
      : fallbackBasePrice > 0
        ? Number(Math.min(0.48, 0.24 + Math.log1p(baseSalesCount) * 0.07).toFixed(3))
        : 0
    return {
      playerName: rowString(row, 'playerName'),
      team: rowString(row, 'team') || null,
      status: rowNumber(row, 'confirmedFirst') ? 'confirmed_1st' : 'checklist',
      prospectId: rowString(row, 'playerKey') || null,
      baseAvgPrice,
      baseSalesCount,
      baseModelMethod,
      baseModelConfidence,
      baseEffectiveSales: Number((rawBaseEstimate?.effectiveN ?? 0).toFixed(2)),
      baseModelLow: money(rawBaseEstimate?.low || (fallbackBasePrice > 0 ? fallbackBasePrice * 0.68 : 0)),
      baseModelHigh: money(rawBaseEstimate?.high || (fallbackBasePrice > 0 ? fallbackBasePrice * 1.47 : 0)),
      baseLatestSaleAt: (rawBaseEstimate?.latestSaleAt ?? rowString(baseRow, 'latestSoldAt')) || null,
      baseSales: salesMap.get(key) ?? [],
      variations: (variationMap.get(key) ?? []).slice(0, 80),
    }
  })
  const pricedPlayers = players.filter((player) => player.baseAvgPrice > 0 || player.variations.some((variation) => variation.avgPrice > 0))
  return {
    category: releaseCategory,
    release: releaseSlug(releaseName, releaseKey),
    releaseYear,
    totalPlayers: players.length,
    firstChromeAutos: players.filter((player) => player.status === 'confirmed_1st').length,
    activeChecklistPlayers: pricedPlayers.length,
    multipliers,
    players,
    fetchedAt: new Date().toISOString(),
    modelVersion: FAIR_VALUE_MODEL_VERSION,
    modelDiagnostics: {
      candidateSales: laneRegistry.candidateCount,
      acceptedLaneCount: laneRegistry.acceptedCount,
      quarantinedLaneCount: laneRegistry.quarantinedCount,
      acceptedLanes: laneRegistry.lanes
        .filter((lane) => lane.accepted)
        .map((lane) => ({
          label: lane.label,
          registryClass: lane.registryClass,
          saleCount: lane.saleCount,
          playerCount: lane.playerCount,
          explicitDenominatorSales: lane.explicitDenominatorSales,
        })),
      quarantinedLanes: laneRegistry.lanes
        .filter((lane) => !lane.accepted)
        .map((lane) => ({
          label: lane.label,
          reason: lane.reason,
          saleCount: lane.saleCount,
          playerCount: lane.playerCount,
        })),
    },
    source: 'canonical-sold-model',
  }
})

mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
const file = `import type { ChecklistModel } from '../types'\n\nexport const STATIC_CHECKLIST_GENERATED_AT = ${JSON.stringify(new Date().toISOString())}\n\nexport const STATIC_CHECKLIST_MODELS: ChecklistModel[] = ${JSON.stringify(models, null, 2)}\n`
writeFileSync(OUTPUT_PATH, file)
console.log(`Wrote ${models.length} static checklist models to ${OUTPUT_PATH}`)
const registryTotals = releaseContexts.reduce(
  (total, context) => ({
    candidates: total.candidates + context.laneRegistry.candidateCount,
    accepted: total.accepted + context.laneRegistry.acceptedCount,
    quarantined: total.quarantined + context.laneRegistry.quarantinedCount,
  }),
  { candidates: 0, accepted: 0, quarantined: 0 },
)
console.log(
  `Release registries: ${registryTotals.accepted} accepted lanes, ${registryTotals.quarantined} quarantined lanes from ${registryTotals.candidates} candidate sales`,
)
