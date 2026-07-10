import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const cwd = process.cwd()
const dbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))
const outputFile = resolve(join(cwd, 'server/data/hostedCompBootstrap.ts'))

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeName(value) {
  return compact(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function releaseYear(value) {
  return Number(String(value ?? '').match(/\b(20\d{2})\b/)?.[1] ?? 0) || null
}

function baseAutoCardScore(card, playerName, year) {
  const player = normalizeName(card.playerName)
  if (!player || player !== normalizeName(playerName)) return Number.NEGATIVE_INFINITY
  const description = compact(card.description)
  const cardSet = compact(card.cardSet)
  const variant = compact(card.variant)
  const cardNumber = compact(card.cardNumber)
  const text = `${description} ${cardSet}`
  if (!/\bbowman\b/i.test(text) || !/\bauto(?:graph|graphs)?\b/i.test(description)) return Number.NEGATIVE_INFINITY
  if (year && releaseYear(text) !== year) return Number.NEGATIVE_INFINITY
  if (variant && !/^base$/i.test(variant)) return Number.NEGATIVE_INFINITY
  if (
    /\b(?:paper|mega|mojo|sapphire|rookie\s+auto|rookie\s+autograph|packfractor|gold\s+ink|draft\s+nights?|portrait|class\s+of|all[- ]america|spotlight|sterling|best|inception|choice|hta|dual|pairings?|image\s+variation)\b/i.test(
      text,
    )
  ) {
    return Number.NEGATIVE_INFINITY
  }

  let score = /^base$/i.test(variant) ? 30 : 0
  if (/^(?:CPA|CDA)-/i.test(cardNumber)) score += 80
  if (/\bchrome\b/i.test(description)) score += 30
  if (/\b(?:prospects?|draft\s+pick)\b/i.test(description)) score += 25
  if (/\bauto(?:graph|graphs)?\b/i.test(description)) score += 25
  return score
}

const db = new DatabaseSync(dbFile, { readOnly: true })
const queue = db
  .prepare(`
    SELECT player_name AS playerName, release_year AS releaseYear, priority
    FROM canonical_refresh_queue
    WHERE player_name IS NOT NULL AND trim(player_name) <> '' AND release_year IS NOT NULL
    ORDER BY priority DESC, release_year DESC, player_name
  `)
  .all()

const cardRows = db
  .prepare(`
    SELECT
      card_id AS cardId,
      player_name AS playerName,
      description,
      card_set AS cardSet,
      card_number AS cardNumber,
      variant,
      raw_json AS rawJson
    FROM card_hedge_cards
    WHERE lower(description) LIKE '%bowman%'
      AND (lower(description) LIKE '%auto%' OR lower(description) LIKE '%autograph%')
  `)
  .all()

const cardsByPlayerYear = new Map()
for (const card of cardRows) {
  const year = releaseYear(`${card.description ?? ''} ${card.cardSet ?? ''}`)
  if (!year) continue
  const key = `${normalizeName(card.playerName)}|${year}`
  const current = cardsByPlayerYear.get(key) ?? []
  current.push(card)
  cardsByPlayerYear.set(key, current)
}

const modelRows = db
  .prepare(`
    SELECT
      player_name AS playerName,
      release_year AS releaseYear,
      model_price AS modelPrice,
      min_price AS minPrice,
      q1_price AS q1Price,
      median_price AS medianPrice,
      avg_price AS avgPrice,
      q3_price AS q3Price,
      max_price AS maxPrice,
      sale_count AS saleCount,
      sales_30 AS sales30,
      sales_90 AS sales90,
      auction_count AS auctionCount,
      bin_count AS binCount,
      latest_sold_at AS latestSoldAt,
      generated_at AS generatedAt
    FROM market_movers_model_buckets
    WHERE card_class = 'auto'
      AND grade_bucket = 'Raw'
      AND variation_label = 'Base Auto'
      AND release_year IS NOT NULL
    ORDER BY player_name, release_year,
      CASE WHEN product_family = 'Bowman Chrome' THEN 0 ELSE 1 END,
      sale_count DESC,
      model_price DESC
  `)
  .all()

const laneByPlayerYear = new Map()
for (const row of modelRows) {
  const key = `${normalizeName(row.playerName)}|${row.releaseYear}`
  if (laneByPlayerYear.has(key)) continue
  const cards = cardsByPlayerYear.get(key) ?? []
  const card = [...cards]
    .map((candidate) => ({ candidate, score: baseAutoCardScore(candidate, row.playerName, Number(row.releaseYear)) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score)[0]?.candidate

  laneByPlayerYear.set(key, [
    compact(row.playerName),
    Number(row.releaseYear),
    compact(card?.cardId),
    compact(card?.description),
    numberOrNull(row.modelPrice),
    numberOrNull(row.minPrice),
    numberOrNull(row.q1Price),
    numberOrNull(row.medianPrice),
    numberOrNull(row.avgPrice),
    numberOrNull(row.q3Price),
    numberOrNull(row.maxPrice),
    Number(row.saleCount) || 0,
    Number(row.sales30) || 0,
    Number(row.sales90) || 0,
    Number(row.auctionCount) || 0,
    Number(row.binCount) || 0,
    compact(row.latestSoldAt),
    compact(row.generatedAt),
  ])
}

const queueTuples = queue.map((row) => [compact(row.playerName), Number(row.releaseYear), Number(row.priority) || 0])
const laneTuples = [...laneByPlayerYear.values()]

const output = `// Generated by scripts/export-hosted-comp-bootstrap.mjs. Do not edit by hand.\n` +
  `export const HOSTED_COMP_QUEUE_SEEDS = ${JSON.stringify(queueTuples)} as const\n\n` +
  `export const HOSTED_COMP_LANE_SEEDS = ${JSON.stringify(laneTuples)} as const\n`

mkdirSync(dirname(outputFile), { recursive: true })
writeFileSync(outputFile, output)
db.close()

console.log(
  JSON.stringify(
    {
      dbFile,
      outputFile,
      queuePlayers: queueTuples.length,
      seededLanes: laneTuples.length,
      seededCardIds: laneTuples.filter((row) => row[2]).length,
    },
    null,
    2,
  ),
)
