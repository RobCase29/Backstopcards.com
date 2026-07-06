import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const ROOT = process.cwd()
const DB_PATH = resolve(ROOT, process.argv[2] ?? 'local-data/backstop-sales.sqlite')
const OUTPUT_PATH = resolve(ROOT, process.argv[3] ?? 'src/data/staticChecklistSnapshot.ts')
const MIN_YEAR = Number(process.env.STATIC_CHECKLIST_MIN_YEAR ?? 2020)
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
    AND EXISTS (
      SELECT 1
      FROM checklist_cards source_cards
      WHERE source_cards.release_key = checklist_releases.release_key
        AND source_cards.source_sheet = 'Wax Pack Hero First Bowman'
    )
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
    AND c.source_sheet = 'Wax Pack Hero First Bowman'
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
    n.player_name AS playerName,
    n.release_year AS releaseYear,
    r.item_id AS itemId,
    r.title AS title,
    r.sale_price AS salePrice,
    r.sold_at AS soldAt,
    r.sale_type AS saleType,
    n.channel AS channel
  FROM market_movers_sales_normalized n
  JOIN market_movers_sales_raw r ON r.item_id = n.item_id
  WHERE n.release_year = ?
    AND n.grade_bucket = 'Raw'
    AND n.card_class IN ('auto', 'paper-auto')
    AND n.variation_label IN ('Base Auto', 'Base', '')
    AND n.model_eligible = 1
    AND r.sale_price > 0
  ORDER BY r.sold_at DESC
`)

function baseCandidatesByPlayer(releaseYear) {
  const map = new Map()
  for (const row of baseCandidateStatement.all(releaseYear)) {
    const key = playerYearKey(rowString(row, 'playerName'), releaseYear)
    if (!map.has(key)) map.set(key, row)
  }
  return map
}

function baseSalesByPlayer(releaseYear) {
  const map = new Map()
  for (const row of baseSalesStatement.all(releaseYear)) {
    const price = rowNumber(row, 'salePrice')
    const soldAt = rowString(row, 'soldAt')
    if (!price || !soldAt) continue
    const key = playerYearKey(rowString(row, 'playerName'), releaseYear)
    const current = map.get(key) ?? []
    if (current.length >= MAX_BASE_SALES_PER_PLAYER) continue
    current.push({
      id: rowString(row, 'itemId'),
      title: rowString(row, 'title'),
      salePrice: money(price),
      soldAt,
      saleType: rowString(row, 'saleType'),
      source: 'market-movers',
      format: rowString(row, 'channel'),
    })
    map.set(key, current)
  }
  return map
}

function variationRowsByPlayer(releaseYear, baseMap) {
  const byPlayer = new Map()
  const multiplierBuckets = new Map()

  for (const row of variationStatement.all(releaseYear)) {
    const price = modelPrice(row)
    if (!price) continue
    const playerName = rowString(row, 'playerName')
    const playerKey = playerYearKey(playerName, releaseYear)
    const label = displayVariation(row)
    const serialDenominator = rowNumber(row, 'serialDenominator')
    const base = modelPrice(baseMap.get(playerKey))
    const releaseMultiplier = base > 0 ? price / base : 0

    if (!isBaseVariation(label) && releaseMultiplier > 0) {
      const bucket = multiplierBuckets.get(label) ?? {
        label,
        values: [],
        playerCount: 0,
        totalSales: 0,
        sortOrder: variationSortOrder(label, serialDenominator),
      }
      bucket.values.push(releaseMultiplier)
      bucket.playerCount += 1
      bucket.totalSales += rowNumber(row, 'saleCount')
      bucket.sortOrder = Math.min(bucket.sortOrder, variationSortOrder(label, serialDenominator))
      multiplierBuckets.set(label, bucket)
    }

    const current = byPlayer.get(playerKey) ?? []
    if (!isBaseVariation(label)) {
      current.push({
        variation: label,
        avgPrice: money(price),
        multiplier: releaseMultiplier > 0 ? Number(releaseMultiplier.toFixed(3)) : 0,
        salesCount: rowNumber(row, 'saleCount'),
      })
      byPlayer.set(playerKey, current)
    }
  }

  const multipliers = [
    {
      variation: 'Base Auto',
      avgMultiplier: 1,
      playerCount: baseMap.size,
      totalSales: [...baseMap.values()].reduce((total, row) => total + rowNumber(row, 'saleCount'), 0),
      sortOrder: -1,
    },
    ...[...multiplierBuckets.values()]
      .map((bucket) => ({
        variation: bucket.label,
        avgMultiplier: Number(median(bucket.values).toFixed(3)),
        playerCount: bucket.playerCount,
        totalSales: bucket.totalSales,
        sortOrder: bucket.sortOrder,
      }))
      .filter((bucket) => bucket.avgMultiplier > 1)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.avgMultiplier - right.avgMultiplier),
  ]

  const multiplierLookup = new Map(multipliers.map((bucket) => [bucket.variation, bucket.avgMultiplier]))
  for (const rows of byPlayer.values()) {
    for (const row of rows) {
      if (row.multiplier > 0) continue
      const fallback = multiplierLookup.get(row.variation)
      if (fallback && fallback > 0) row.multiplier = fallback
    }
  }

  return { byPlayer, multipliers }
}

const models = releases.map((releaseRow) => {
  const releaseKey = rowString(releaseRow, 'releaseKey')
  const releaseYear = rowNumber(releaseRow, 'releaseYear')
  const releaseName = rowString(releaseRow, 'releaseName')
  const baseMap = baseCandidatesByPlayer(releaseYear)
  const salesMap = baseSalesByPlayer(releaseYear)
  const { byPlayer: variationMap, multipliers } = variationRowsByPlayer(releaseYear, baseMap)
  const players = playerStatement.all(releaseKey).map((row) => {
    const key = playerYearKey(rowString(row, 'playerName'), releaseYear)
    const baseRow = baseMap.get(key)
    const baseAvgPrice = money(modelPrice(baseRow))
    const baseSalesCount = rowNumber(baseRow, 'saleCount')
    return {
      playerName: rowString(row, 'playerName'),
      team: rowString(row, 'team') || null,
      status: rowNumber(row, 'confirmedFirst') ? 'confirmed_1st' : 'first_bowman',
      prospectId: rowString(row, 'playerKey') || null,
      baseAvgPrice,
      baseSalesCount,
      baseSales: salesMap.get(key) ?? [],
      variations: (variationMap.get(key) ?? []).slice(0, 80),
    }
  })
  const pricedPlayers = players.filter((player) => player.baseAvgPrice > 0 || player.variations.some((variation) => variation.avgPrice > 0))
  return {
    category: categoryFromReleaseName(releaseName),
    release: releaseSlug(releaseName, releaseKey),
    releaseYear,
    totalPlayers: players.length,
    firstChromeAutos: players.length,
    activeChecklistPlayers: pricedPlayers.length,
    multipliers,
    players,
    fetchedAt: new Date().toISOString(),
    source: 'canonical-sold-model',
  }
})

mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
const file = `import type { ChecklistModel } from '../types'\n\nexport const STATIC_CHECKLIST_GENERATED_AT = ${JSON.stringify(new Date().toISOString())}\n\nexport const STATIC_CHECKLIST_MODELS: ChecklistModel[] = ${JSON.stringify(models, null, 2)}\n`
writeFileSync(OUTPUT_PATH, file)
console.log(`Wrote ${models.length} static checklist models to ${OUTPUT_PATH}`)
