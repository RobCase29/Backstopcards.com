import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  FAIR_VALUE_MODEL_VERSION,
  buildProximityRatioPoints,
  estimateHierarchicalMultiplier,
} from '../shared/fairValueEngine.js'
import {
  BOWMAN_2026_CHROME_AUTO_VARIATIONS,
  bowman2026AutoDefinition,
  canonicalizeBowman2026AutoVariation,
} from '../shared/bowman2026Taxonomy.js'

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
  const displayed = displayVariation(row)
  if (releaseYear !== 2026 || releaseCategory !== 'bowman') return displayed
  const sourceText = [
    rowString(row, 'title'),
    displayed,
    rowNumber(row, 'serialDenominator') ? `/${rowNumber(row, 'serialDenominator')}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const resolved = canonicalizeBowman2026AutoVariation(sourceText, {
    playerName: rowString(row, 'playerName'),
    assumeAuto: true,
  })
  return resolved.modelEligible ? resolved.definition.label : null
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

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0)
  return usable.length ? usable.reduce((total, value) => total + value, 0) / usable.length : 0
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

const variationStatement = db.prepare(`
  SELECT
    cc.player_name AS playerName,
    cc.product_family AS productFamily,
    cc.card_class AS cardClass,
    cc.variation_label AS variationLabel,
    cc.serial_denominator AS serialDenominator,
    s.sale_count AS saleCount,
    s.twma_30 AS twma30,
    s.twma_90 AS twma90,
    s.recent_5_avg AS recent5Avg,
    s.median_price AS medianPrice,
    s.avg_price AS avgPrice
  FROM canonical_cards cc
  JOIN canonical_comp_summary s ON s.canonical_card_key = cc.canonical_card_key
  WHERE cc.release_year = ?
    AND cc.grade_bucket = 'Raw'
    AND cc.card_class IN ('auto', 'paper-auto')
    AND s.sale_count > 0
  ORDER BY cc.player_name, s.sale_count DESC, cc.variation_label
`)

const baseSalesStatement = db.prepare(`
  SELECT
    cc.player_name AS playerName,
    cc.release_year AS releaseYear,
    cc.product_family AS productFamily,
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
    AND cc.variation_label IN ('Base Auto', 'Base', '')
    AND lower(cc.product_family) LIKE '%chrome%'
    AND json_extract(m.raw_json, '$.normalized.salePrice') > 0
    AND json_extract(m.raw_json, '$.normalized.soldAt') IS NOT NULL
  ORDER BY json_extract(m.raw_json, '$.normalized.soldAt') DESC
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
    AND lower(cc.product_family) LIKE '%chrome%'
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

function baseSalesByPlayer(releaseYear, releaseCategory) {
  const map = new Map()
  const seenByPlayer = new Map()
  for (const row of baseSalesStatement.all(releaseYear)) {
    if (!rowNumber(row, 'modelEligible')) continue
    if (!productMatchesReleaseCategory(rowString(row, 'productFamily'), releaseCategory)) continue
    const price = rowNumber(row, 'salePrice')
    const soldAt = rowString(row, 'soldAt')
    if (!price || !soldAt) continue
    const key = playerYearKey(rowString(row, 'playerName'), releaseYear)
    const seen = seenByPlayer.get(key) ?? new Set()
    const itemId = rowString(row, 'itemId') || rowString(row, 'sourceKey')
    const identity = itemId.replace(/^[a-z_-]+:/i, '') || `${soldAt}|${money(price)}|${searchKey(rowString(row, 'title'))}`
    if (seen.has(identity)) continue
    seen.add(identity)
    seenByPlayer.set(key, seen)
    const current = map.get(key) ?? []
    if (current.length >= MAX_BASE_SALES_PER_PLAYER) continue
    current.push({
      id: itemId,
      title: rowString(row, 'title'),
      salePrice: money(price),
      soldAt,
      saleType: rowString(row, 'channel'),
      source: rowString(row, 'source'),
      format: rowString(row, 'channel'),
    })
    map.set(key, current)
  }
  return map
}

function releaseProximitySales(releaseYear, releaseCategory, allowedPlayerKeys) {
  const byPlayer = new Map()
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
    const label = canonicalReleaseVariation(row, releaseYear, releaseCategory)
    if (!label) continue
    const player = byPlayer.get(playerKey) ?? new Map()
    const lane = player.get(label) ?? []
    lane.push({
      price,
      soldAt,
      channel: rowString(row, 'channel'),
      itemId,
      title: rowString(row, 'title'),
      source: rowString(row, 'source'),
      groupKey: playerKey,
      playerName: rowString(row, 'playerName'),
    })
    player.set(label, lane)
    byPlayer.set(playerKey, player)
  }
  return byPlayer
}

function variationRowsByPlayer(releaseYear, releaseCategory, baseMap, allowedPlayerKeys) {
  const byPlayer = new Map()

  for (const row of variationStatement.all(releaseYear)) {
    if (!productMatchesReleaseCategory(rowString(row, 'productFamily'), releaseCategory)) continue
    const price = modelPrice(row)
    if (!price) continue
    const playerName = rowString(row, 'playerName')
    const playerKey = playerYearKey(playerName, releaseYear)
    if (!allowedPlayerKeys.has(playerKey)) continue
    const label = canonicalReleaseVariation(row, releaseYear, releaseCategory)
    if (!label) continue
    const serialDenominator = rowNumber(row, 'serialDenominator')
    const base = modelPrice(baseMap.get(playerKey))
    const releaseMultiplier = base > 0 ? price / base : 0

    const current = byPlayer.get(playerKey) ?? new Map()
    if (!isBaseVariation(label)) {
      const candidate = {
        variation: label,
        avgPrice: money(price),
        multiplier: releaseMultiplier > 0 ? Number(releaseMultiplier.toFixed(3)) : 0,
        salesCount: rowNumber(row, 'saleCount'),
        sortOrder: variationSortOrder(label, serialDenominator),
      }
      const existing = current.get(label)
      if (!existing || candidate.salesCount > existing.salesCount) current.set(label, candidate)
      byPlayer.set(playerKey, current)
    }
  }

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

  const proximitySalesByPlayer = releaseProximitySales(releaseYear, releaseCategory, allowedPlayerKeys)

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
      playerCount: [...allowedPlayerKeys].filter((key) => baseMap.has(key)).length,
      totalSales: [...allowedPlayerKeys].reduce((total, key) => total + rowNumber(baseMap.get(key), 'saleCount'), 0),
      sortOrder: -1,
      modelMethod: 'structural-base-anchor',
      modelConfidence: 1,
      structuralPrior: 1,
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
        const priorMultiplier = structuralDefinition?.priorMultiplier ?? legacyPrior
        const priorReliability = structuralDefinition?.priorReliability ?? (ratioPoints.length >= 8 ? 0.42 : 0.62)
        const estimate = estimateHierarchicalMultiplier({
          priorMultiplier,
          priorReliability,
          releaseRatioPoints: ratioPoints,
        })
        return {
          variation: bucket.label,
          avgMultiplier: Number(estimate.multiplier.toFixed(3)),
          playerCount: Math.max(
            bucket.playerCount,
            [...proximitySalesByPlayer.values()].filter((player) => (player.get(bucket.label) ?? []).length > 0).length,
          ),
          totalSales: Math.max(bucket.totalSales, ratioPoints.length),
          sortOrder: structuralDefinition?.scarcityOrder ?? bucket.sortOrder,
          modelMethod: 'hierarchical-proximity-v2',
          modelConfidence: Number(estimate.confidence.toFixed(3)),
          structuralPrior: structuralDefinition?.priorMultiplier,
          proximitySales: ratioPoints.length,
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

const models = releases.map((releaseRow) => {
  const releaseKey = rowString(releaseRow, 'releaseKey')
  const releaseYear = rowNumber(releaseRow, 'releaseYear')
  const releaseName = rowString(releaseRow, 'releaseName')
  const releaseCategory = categoryFromReleaseName(releaseName)
  const checklistPlayerRows = playerStatement.all(releaseKey)
  const allowedPlayerKeys = new Set(
    checklistPlayerRows.map((row) => playerYearKey(rowString(row, 'playerName'), releaseYear)),
  )
  const baseMap = baseCandidatesByPlayer(releaseYear, releaseCategory)
  const salesMap = baseSalesByPlayer(releaseYear, releaseCategory)
  const { byPlayer: variationMap, multipliers } = variationRowsByPlayer(releaseYear, releaseCategory, baseMap, allowedPlayerKeys)
  const players = checklistPlayerRows.map((row) => {
    const key = playerYearKey(rowString(row, 'playerName'), releaseYear)
    const baseRow = baseMap.get(key)
    const baseAvgPrice = money(modelPrice(baseRow))
    const baseSalesCount = rowNumber(baseRow, 'saleCount')
    return {
      playerName: rowString(row, 'playerName'),
      team: rowString(row, 'team') || null,
      status: rowNumber(row, 'confirmedFirst') ? 'confirmed_1st' : 'checklist',
      prospectId: rowString(row, 'playerKey') || null,
      baseAvgPrice,
      baseSalesCount,
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
    source: 'canonical-sold-model',
  }
})

mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
const file = `import type { ChecklistModel } from '../types'\n\nexport const STATIC_CHECKLIST_GENERATED_AT = ${JSON.stringify(new Date().toISOString())}\n\nexport const STATIC_CHECKLIST_MODELS: ChecklistModel[] = ${JSON.stringify(models, null, 2)}\n`
writeFileSync(OUTPUT_PATH, file)
console.log(`Wrote ${models.length} static checklist models to ${OUTPUT_PATH}`)
