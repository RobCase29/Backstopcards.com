import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dbFile = resolve(process.env.BACKSTOP_SALES_DB ?? 'local-data/backstop-sales.sqlite')

function rowNumber(row, key) {
  const value = row?.[key]
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function rowString(row, key) {
  const value = row?.[key]
  return value == null ? '' : String(value)
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
      LIMIT 1
    `).get(tableName),
  )
}

if (!existsSync(dbFile)) {
  console.log(
    JSON.stringify(
      {
        available: false,
        dbFile,
        message: 'No sales cache exists yet. Run npm run sales:sync after adding raw comp pulls.',
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

const db = new DatabaseSync(dbFile)

const raw = db.prepare(`
  SELECT
    COUNT(*) AS rawRows,
    COUNT(DISTINCT player_name) AS rawPlayers,
    MAX(sold_at) AS latestSoldAt,
    MIN(sold_at) AS earliestSoldAt
  FROM market_movers_sales_raw
`).get()

const rawSources = tableExists(db, 'market_movers_sales_raw')
  ? db.prepare(`
      SELECT source, COUNT(*) AS rows, COUNT(DISTINCT player_name) AS players, MAX(imported_at) AS latestImportedAt
      FROM market_movers_sales_raw
      GROUP BY source
      ORDER BY rows DESC
    `).all()
  : []

const normalized = db.prepare(`
  SELECT
    COUNT(*) AS normalizedRows,
    COALESCE(SUM(model_eligible), 0) AS modelEligibleRows,
    COALESCE(SUM(CASE WHEN model_eligible = 0 THEN 1 ELSE 0 END), 0) AS excludedRows
  FROM market_movers_sales_normalized
`).get()

const buckets = db.prepare(`
  SELECT
    COUNT(*) AS bucketRows,
    COUNT(DISTINCT player_name) AS modeledPlayers,
    COALESCE(SUM(sale_count), 0) AS modeledSales,
    MAX(generated_at) AS generatedAt
  FROM market_movers_model_buckets
`).get()

const baseAnchors = db.prepare(`
  SELECT player_name AS playerName, release_year AS releaseYear, model_price AS modelPrice, sale_count AS saleCount, latest_sold_at AS latestSoldAt
  FROM market_movers_model_buckets
  WHERE card_class = 'auto'
    AND product_family = 'Bowman Chrome'
    AND grade_bucket = 'Raw'
    AND variation_label = 'Base Auto'
  ORDER BY model_price DESC
  LIMIT 20
`).all()

const missingBaseAnchors = db.prepare(`
  SELECT p.player_name AS playerName, COUNT(n.item_id) AS saleRows
  FROM (SELECT DISTINCT player_name FROM market_movers_sales_normalized) p
  JOIN market_movers_sales_normalized n ON n.player_name = p.player_name
  LEFT JOIN market_movers_model_buckets b
    ON b.player_name = p.player_name
    AND b.card_class = 'auto'
    AND b.grade_bucket = 'Raw'
    AND b.variation_label = 'Base Auto'
  WHERE b.bucket_key IS NULL
  GROUP BY p.player_name
  ORDER BY saleRows DESC, p.player_name
  LIMIT 25
`).all()

const exclusions = db.prepare(`
  SELECT exclusion_reason AS reason, COUNT(*) AS count
  FROM market_movers_sales_normalized
  WHERE exclusion_reason IS NOT NULL
  GROUP BY exclusion_reason
  ORDER BY count DESC
  LIMIT 20
`).all()

const flags = tableExists(db, 'market_movers_sale_flags')
  ? db.prepare(`
      SELECT COALESCE(SUM(erroneous), 0) AS flaggedRows, COUNT(*) AS reviewedRows
      FROM market_movers_sale_flags
    `).get()
  : { flaggedRows: 0, reviewedRows: 0 }

const overrides = tableExists(db, 'market_movers_bucket_overrides')
  ? db.prepare(`
      SELECT COUNT(*) AS bucketOverrides, MAX(updated_at) AS latestOverrideAt
      FROM market_movers_bucket_overrides
    `).get()
  : { bucketOverrides: 0, latestOverrideAt: '' }

const nowIso = new Date().toISOString()
const liveMarket =
  tableExists(db, 'live_market_snapshots') && tableExists(db, 'live_market_listings')
    ? db.prepare(`
        SELECT
          COUNT(DISTINCT s.snapshot_id) AS freshSnapshots,
          COUNT(l.item_id) AS freshListings,
          COALESCE(SUM(CASE WHEN l.edge_dollars >= 0 THEN 1 ELSE 0 END), 0) AS freshBuyDots,
          MAX(s.observed_at) AS latestObservedAt
        FROM live_market_snapshots s
        LEFT JOIN live_market_listings l ON l.snapshot_id = s.snapshot_id AND l.expires_at > ?
        WHERE s.expires_at > ?
      `).get(nowIso, nowIso)
    : { freshSnapshots: 0, freshListings: 0, freshBuyDots: 0, latestObservedAt: '' }

const canonical =
  tableExists(db, 'canonical_cards') && tableExists(db, 'canonical_comp_summary')
    ? db.prepare(`
        SELECT
          COUNT(DISTINCT c.canonical_card_key) AS cards,
          COUNT(DISTINCT c.player_name) AS players,
          COUNT(s.canonical_card_key) AS summaries,
          COALESCE(SUM(s.sale_count), 0) AS summarizedSales,
          MAX(s.latest_sold_at) AS latestSoldAt,
          MAX(s.updated_at) AS updatedAt
        FROM canonical_cards c
        LEFT JOIN canonical_comp_summary s ON s.canonical_card_key = c.canonical_card_key
      `).get()
    : { cards: 0, players: 0, summaries: 0, summarizedSales: 0, latestSoldAt: '', updatedAt: '' }

const canonicalSources =
  tableExists(db, 'canonical_source_mappings')
    ? db.prepare(`
        SELECT source, COUNT(*) AS rows, COUNT(DISTINCT player_name) AS players
        FROM canonical_source_mappings
        GROUP BY source
        ORDER BY rows DESC
      `).all()
    : []

const cardHedge =
  tableExists(db, 'card_hedge_cards') && tableExists(db, 'card_hedge_sales')
    ? db.prepare(`
        SELECT
          COUNT(DISTINCT c.card_id) AS cards,
          COUNT(DISTINCT c.player_name) AS players,
          COUNT(s.price_history_id) AS sales,
          MAX(s.sold_at) AS latestSoldAt,
          MAX(s.imported_at) AS latestImportedAt
        FROM card_hedge_cards c
        LEFT JOIN card_hedge_sales s ON s.card_id = c.card_id
      `).get()
    : { cards: 0, players: 0, sales: 0, latestSoldAt: '', latestImportedAt: '' }

const refreshQueue =
  tableExists(db, 'canonical_refresh_queue')
    ? db.prepare(`
        SELECT
          COUNT(*) AS queuedPlayers,
          COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0) AS pendingPlayers,
          COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) AS runningPlayers,
          COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS donePlayers,
          COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errorPlayers,
          MAX(updated_at) AS updatedAt
        FROM canonical_refresh_queue
      `).get()
    : { queuedPlayers: 0, pendingPlayers: 0, runningPlayers: 0, donePlayers: 0, errorPlayers: 0, updatedAt: '' }

const checklist =
  tableExists(db, 'checklist_releases') && tableExists(db, 'checklist_cards')
    ? db.prepare(`
        SELECT
          COUNT(DISTINCT r.release_key) AS releases,
          COUNT(c.checklist_card_key) AS cards,
          COUNT(DISTINCT c.player_key) AS players,
          COALESCE(SUM(CASE WHEN c.first_status = 'confirmed_1st' THEN 1 ELSE 0 END), 0) AS confirmedFirstCards,
          COALESCE(SUM(CASE WHEN c.first_status = 'likely_1st' THEN 1 ELSE 0 END), 0) AS likelyFirstCards,
          COALESCE(SUM(CASE WHEN c.first_status = 'unknown' THEN 1 ELSE 0 END), 0) AS unknownFirstCards,
          MAX(r.imported_at) AS latestImportedAt
        FROM checklist_releases r
        LEFT JOIN checklist_cards c ON c.release_key = r.release_key
      `).get()
    : {
        releases: 0,
        cards: 0,
        players: 0,
        confirmedFirstCards: 0,
        likelyFirstCards: 0,
        unknownFirstCards: 0,
        latestImportedAt: '',
      }

const checklistUniverse =
  tableExists(db, 'checklist_card_universe')
    ? db.prepare(`
        SELECT COUNT(*) AS cards, COUNT(DISTINCT player_key) AS players
        FROM checklist_card_universe
      `).get()
    : { cards: 0, players: 0 }

const checklistTemplates =
  tableExists(db, 'checklist_variation_templates')
    ? db.prepare('SELECT COUNT(*) AS templates FROM checklist_variation_templates').get()
    : { templates: 0 }

const checklistSignals =
  tableExists(db, 'checklist_player_signals')
    ? db.prepare(`
        SELECT first_status AS status, COUNT(*) AS players
        FROM checklist_player_signals
        GROUP BY first_status
        ORDER BY players DESC
      `).all()
    : []

const nextQueuePlayers =
  tableExists(db, 'canonical_refresh_queue')
    ? db.prepare(`
        SELECT player_name AS playerName, release_year AS releaseYear, priority, status, error
        FROM canonical_refresh_queue
        WHERE status != 'done'
        ORDER BY priority DESC, player_name
        LIMIT 20
      `).all()
    : []

const healthItems = []
if (rowNumber(raw, 'rawPlayers') < 25 && rowNumber(refreshQueue, 'pendingPlayers') === 0) {
  healthItems.push('Scale blocker: sold cache only has a small player sample.')
}
if (rowNumber(refreshQueue, 'pendingPlayers') > 0) {
  healthItems.push(`${rowNumber(refreshQueue, 'pendingPlayers')} comp refresh players are queued for acquisition.`)
}
if (rowNumber(refreshQueue, 'runningPlayers') > 0) healthItems.push(`${rowNumber(refreshQueue, 'runningPlayers')} comp refresh players are currently claimed/running.`)
if (rowNumber(refreshQueue, 'errorPlayers') > 0) healthItems.push(`${rowNumber(refreshQueue, 'errorPlayers')} comp refresh queue players need retry/review.`)
if (missingBaseAnchors.length) healthItems.push(`${missingBaseAnchors.length} displayed players are missing raw base-auto anchors.`)
if (rowNumber(liveMarket, 'freshBuyDots') === 0) healthItems.push('No fresh active buy dots are cached right now; run a BIN or auction scan.')
if (rowNumber(canonical, 'cards') === 0) healthItems.push('Canonical market layer is empty; run npm run canonical:rebuild or npm run sales:refresh.')
if (rowNumber(checklist, 'cards') === 0) healthItems.push('Checklist ledger is empty; run npm run checklist:import:2026.')
if (rowNumber(cardHedge, 'sales') > 0) {
  healthItems.push(`${rowNumber(cardHedge, 'sales')} Card Hedge comp rows are cached and available for local reclassification.`)
}
if (rowNumber(flags, 'flaggedRows') > 0 || rowNumber(overrides, 'bucketOverrides') > 0) {
  healthItems.push('Manual cleanup exists and is preserved across imports.')
}

console.log(
  JSON.stringify(
    {
      available: true,
      dbFile,
      raw: {
        rows: rowNumber(raw, 'rawRows'),
        players: rowNumber(raw, 'rawPlayers'),
        earliestSoldAt: rowString(raw, 'earliestSoldAt'),
        latestSoldAt: rowString(raw, 'latestSoldAt'),
        sources: rawSources.map((row) => ({
          source: rowString(row, 'source'),
          rows: rowNumber(row, 'rows'),
          players: rowNumber(row, 'players'),
          latestImportedAt: rowString(row, 'latestImportedAt'),
        })),
      },
      normalized: {
        rows: rowNumber(normalized, 'normalizedRows'),
        modelEligibleRows: rowNumber(normalized, 'modelEligibleRows'),
        excludedRows: rowNumber(normalized, 'excludedRows'),
      },
      models: {
        players: rowNumber(buckets, 'modeledPlayers'),
        buckets: rowNumber(buckets, 'bucketRows'),
        modeledSales: rowNumber(buckets, 'modeledSales'),
        generatedAt: rowString(buckets, 'generatedAt'),
      },
      cleanup: {
        reviewedRows: rowNumber(flags, 'reviewedRows'),
        flaggedRows: rowNumber(flags, 'flaggedRows'),
        bucketOverrides: rowNumber(overrides, 'bucketOverrides'),
        latestOverrideAt: rowString(overrides, 'latestOverrideAt'),
      },
      liveMarket: {
        freshSnapshots: rowNumber(liveMarket, 'freshSnapshots'),
        freshListings: rowNumber(liveMarket, 'freshListings'),
        freshBuyDots: rowNumber(liveMarket, 'freshBuyDots'),
        latestObservedAt: rowString(liveMarket, 'latestObservedAt'),
      },
      canonical: {
        cards: rowNumber(canonical, 'cards'),
        players: rowNumber(canonical, 'players'),
        summaries: rowNumber(canonical, 'summaries'),
        summarizedSales: rowNumber(canonical, 'summarizedSales'),
        latestSoldAt: rowString(canonical, 'latestSoldAt'),
        updatedAt: rowString(canonical, 'updatedAt'),
        sources: canonicalSources.map((row) => ({
          source: rowString(row, 'source'),
          rows: rowNumber(row, 'rows'),
          players: rowNumber(row, 'players'),
        })),
      },
      cardHedge: {
        cards: rowNumber(cardHedge, 'cards'),
        players: rowNumber(cardHedge, 'players'),
        sales: rowNumber(cardHedge, 'sales'),
        latestSoldAt: rowString(cardHedge, 'latestSoldAt'),
        latestImportedAt: rowString(cardHedge, 'latestImportedAt'),
      },
      checklist: {
        releases: rowNumber(checklist, 'releases'),
        cards: rowNumber(checklist, 'cards'),
        players: rowNumber(checklist, 'players'),
        universeCards: rowNumber(checklistUniverse, 'cards'),
        universePlayers: rowNumber(checklistUniverse, 'players'),
        templates: rowNumber(checklistTemplates, 'templates'),
        confirmedFirstCards: rowNumber(checklist, 'confirmedFirstCards'),
        likelyFirstCards: rowNumber(checklist, 'likelyFirstCards'),
        unknownFirstCards: rowNumber(checklist, 'unknownFirstCards'),
        latestImportedAt: rowString(checklist, 'latestImportedAt'),
        firstSignals: checklistSignals.map((row) => ({
          status: rowString(row, 'status'),
          players: rowNumber(row, 'players'),
        })),
      },
      refreshQueue: {
        players: rowNumber(refreshQueue, 'queuedPlayers'),
        pending: rowNumber(refreshQueue, 'pendingPlayers'),
        running: rowNumber(refreshQueue, 'runningPlayers'),
        done: rowNumber(refreshQueue, 'donePlayers'),
        errors: rowNumber(refreshQueue, 'errorPlayers'),
        updatedAt: rowString(refreshQueue, 'updatedAt'),
      },
      nextQueuePlayers: nextQueuePlayers.map((row) => ({
        playerName: rowString(row, 'playerName'),
        releaseYear: rowNumber(row, 'releaseYear') || null,
        priority: rowNumber(row, 'priority'),
        status: rowString(row, 'status'),
        error: rowString(row, 'error'),
      })),
      topBaseAnchors: baseAnchors.map((row) => ({
        playerName: rowString(row, 'playerName'),
        releaseYear: rowNumber(row, 'releaseYear') || null,
        modelPrice: rowNumber(row, 'modelPrice'),
        saleCount: rowNumber(row, 'saleCount'),
        latestSoldAt: rowString(row, 'latestSoldAt'),
      })),
      missingBaseAnchors: missingBaseAnchors.map((row) => ({
        playerName: rowString(row, 'playerName'),
        saleRows: rowNumber(row, 'saleRows'),
      })),
      exclusions: exclusions.map((row) => ({
        reason: rowString(row, 'reason'),
        count: rowNumber(row, 'count'),
      })),
      healthItems,
    },
    null,
    2,
  ),
)

db.close()
