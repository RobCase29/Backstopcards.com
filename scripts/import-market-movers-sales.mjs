import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  buildMarketMoversNormalizedPlayerModel,
  buildMarketMoversPlayerModel,
  modelBucketCsvRows,
  normalizeMarketMoversSale,
} from './market-movers-sales-model.mjs'

const cwd = process.cwd()
const args = process.argv.slice(2)
const flags = new Set(args.filter((arg) => arg.startsWith('--')))
const inputArgs = args.filter((arg) => !arg.startsWith('--'))
const defaultInput = join(cwd, 'local-data/market-movers')
const dbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))
const shouldReclassifyCache = flags.has('--reclassify-cache')

function run(db, sql, params = []) {
  return db.prepare(sql).run(...params)
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS market_movers_sales_raw (
      item_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      player_name TEXT NOT NULL,
      search TEXT,
      title TEXT NOT NULL,
      sale_price_text TEXT,
      sale_price REAL,
      sold_at TEXT,
      sale_type TEXT,
      seller TEXT,
      source_page INTEGER,
      source_offset INTEGER,
      imported_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_movers_sales_normalized (
      item_id TEXT PRIMARY KEY,
      player_name TEXT NOT NULL,
      release_year INTEGER,
      product_family TEXT,
      card_class TEXT,
      variation_label TEXT,
      serial_denominator INTEGER,
      grade_company TEXT,
      grade_value REAL,
      grade_bucket TEXT,
      channel TEXT,
      is_auto INTEGER NOT NULL,
      is_bowman INTEGER NOT NULL,
      is_chrome INTEGER NOT NULL,
      is_paper INTEGER NOT NULL,
      is_case_hit INTEGER NOT NULL,
      is_insert INTEGER NOT NULL,
      insert_name TEXT,
      is_redemption INTEGER NOT NULL,
      is_redeemed INTEGER NOT NULL,
      is_digital INTEGER NOT NULL,
      is_lot INTEGER NOT NULL,
      model_eligible INTEGER NOT NULL,
      exclusion_reason TEXT,
      bucket_key TEXT,
      normalized_json TEXT NOT NULL,
      FOREIGN KEY(item_id) REFERENCES market_movers_sales_raw(item_id)
    );

    CREATE TABLE IF NOT EXISTS market_movers_model_buckets (
      bucket_key TEXT PRIMARY KEY,
      player_name TEXT NOT NULL,
      release_year INTEGER,
      product_family TEXT,
      card_class TEXT,
      variation_label TEXT,
      grade_bucket TEXT,
      serial_denominator INTEGER,
      sale_count INTEGER NOT NULL,
      sales_30 INTEGER NOT NULL,
      sales_90 INTEGER NOT NULL,
      auction_count INTEGER NOT NULL,
      bin_count INTEGER NOT NULL,
      min_price REAL NOT NULL,
      q1_price REAL NOT NULL,
      median_price REAL NOT NULL,
      avg_price REAL NOT NULL,
      q3_price REAL NOT NULL,
      max_price REAL NOT NULL,
      model_price REAL NOT NULL,
      base_auto_multiple REAL,
      latest_sold_at TEXT,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_movers_sale_flags (
      item_id TEXT PRIMARY KEY,
      erroneous INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(item_id) REFERENCES market_movers_sales_raw(item_id)
    );

	    CREATE TABLE IF NOT EXISTS market_movers_bucket_overrides (
	      source_bucket_key TEXT PRIMARY KEY,
	      target_bucket_key TEXT NOT NULL,
	      note TEXT NOT NULL DEFAULT '',
	      updated_at TEXT NOT NULL,
	      target_release_year INTEGER,
	      target_product_family TEXT,
	      target_card_class TEXT,
	      target_variation_label TEXT,
	      target_serial_denominator INTEGER,
	      target_grade_bucket TEXT,
	      target_insert_name TEXT
	    );

    CREATE TABLE IF NOT EXISTS market_movers_import_runs (
      import_id TEXT PRIMARY KEY,
      input_path TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      player_name TEXT NOT NULL,
      raw_rows INTEGER NOT NULL,
      normalized_rows INTEGER NOT NULL,
      model_eligible_rows INTEGER NOT NULL,
      excluded_rows INTEGER NOT NULL,
      latest_sold_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_market_movers_sales_player_sold ON market_movers_sales_raw(player_name, sold_at);
    CREATE INDEX IF NOT EXISTS idx_market_movers_norm_bucket ON market_movers_sales_normalized(bucket_key);
    CREATE INDEX IF NOT EXISTS idx_market_movers_norm_player_class ON market_movers_sales_normalized(player_name, card_class, product_family);
    CREATE INDEX IF NOT EXISTS idx_market_movers_norm_player_sold ON market_movers_sales_normalized(player_name, model_eligible);
  `)
}

function bool(value) {
  return value ? 1 : 0
}

function slugify(value) {
  return String(value ?? 'player').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player'
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function tableExists(db, tableName) {
  return Boolean(
    db
      .prepare(
        `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
      LIMIT 1
    `,
      )
      .get(tableName),
  )
}

function playerScopedBucketKey(playerName, bucketKey) {
  const raw = String(bucketKey ?? '')
  if (!raw || raw.startsWith('player=')) return raw
  return `player=${String(playerName ?? '').trim()} | ${raw}`
}

function migratePlayerScopedBucketOverrides(db) {
  if (!tableExists(db, 'market_movers_bucket_overrides') || !tableExists(db, 'market_movers_sales_normalized')) return 0
  const legacyOverrides = db
    .prepare(
      `
      SELECT source_bucket_key AS sourceBucketKey, target_bucket_key AS targetBucketKey
      FROM market_movers_bucket_overrides
      WHERE source_bucket_key NOT LIKE 'player=%'
    `,
    )
    .all()
  if (legacyOverrides.length === 0) return 0

  const playerLookup = db.prepare(`
    SELECT DISTINCT player_name AS playerName
    FROM market_movers_sales_normalized
    WHERE bucket_key = ?
  `)
  const existingLookup = db.prepare(`
    SELECT 1
    FROM market_movers_bucket_overrides
    WHERE source_bucket_key = ?
    LIMIT 1
  `)
  const cloneOverride = db.prepare(`
    INSERT INTO market_movers_bucket_overrides (
      source_bucket_key,
      target_bucket_key,
      note,
      updated_at,
      target_release_year,
      target_product_family,
      target_card_class,
      target_variation_label,
      target_serial_denominator,
      target_grade_bucket,
      target_insert_name
    )
    SELECT
      ?,
      ?,
      note,
      updated_at,
      target_release_year,
      target_product_family,
      target_card_class,
      target_variation_label,
      target_serial_denominator,
      target_grade_bucket,
      target_insert_name
    FROM market_movers_bucket_overrides
    WHERE source_bucket_key = ?
  `)
  const deleteLegacy = db.prepare('DELETE FROM market_movers_bucket_overrides WHERE source_bucket_key = ?')

  let migrated = 0
  for (const override of legacyOverrides) {
    const players = playerLookup.all(override.sourceBucketKey)
    if (players.length !== 1) continue
    const playerName = String(players[0].playerName ?? '').trim()
    if (!playerName) continue
    const sourceBucketKey = playerScopedBucketKey(playerName, override.sourceBucketKey)
    const targetBucketKey = playerScopedBucketKey(playerName, override.targetBucketKey)
    if (!existingLookup.get(sourceBucketKey)) cloneOverride.run(sourceBucketKey, targetBucketKey, override.sourceBucketKey)
    deleteLegacy.run(override.sourceBucketKey)
    migrated += 1
  }
  return migrated
}

async function discoverRawFiles(paths) {
  const discovered = []
  async function visit(path) {
    const absolute = resolve(path)
    const info = await stat(absolute).catch(() => null)
    if (!info) return
    if (info.isDirectory()) {
      const entries = await readdir(absolute)
      for (const entry of entries) await visit(join(absolute, entry))
      return
    }
    if (/\.raw\.json$/i.test(absolute)) discovered.push(absolute)
  }

  for (const path of paths.length ? paths : [defaultInput]) await visit(path)
  return [...new Set(discovered)].sort()
}

function defaultReleaseYearFromFile(inputFile) {
  return Number(inputFile.match(/bowman-(20\d{2})/i)?.[1] ?? 0) || null
}

function latestSoldAtFromSales(sales) {
  return sales.reduce((latest, sale) => (sale.soldAt && sale.soldAt > latest ? sale.soldAt : latest), '')
}

function upsertSalesStatements(db) {
  return {
    raw: db.prepare(`
      INSERT INTO market_movers_sales_raw (
        item_id, source, player_name, search, title, sale_price_text, sale_price, sold_at, sale_type,
        seller, source_page, source_offset, imported_at, raw_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET
        source=excluded.source,
        player_name=excluded.player_name,
        search=excluded.search,
        title=excluded.title,
        sale_price_text=excluded.sale_price_text,
        sale_price=excluded.sale_price,
        sold_at=excluded.sold_at,
        sale_type=excluded.sale_type,
        seller=excluded.seller,
        source_page=excluded.source_page,
        source_offset=excluded.source_offset,
        imported_at=excluded.imported_at,
        raw_json=excluded.raw_json
    `),
    normalized: db.prepare(`
      INSERT INTO market_movers_sales_normalized (
        item_id, player_name, release_year, product_family, card_class, variation_label, serial_denominator,
        grade_company, grade_value, grade_bucket, channel, is_auto, is_bowman, is_chrome, is_paper,
        is_case_hit, is_insert, insert_name, is_redemption, is_redeemed, is_digital, is_lot,
        model_eligible, exclusion_reason, bucket_key, normalized_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(item_id) DO UPDATE SET
        player_name=excluded.player_name,
        release_year=excluded.release_year,
        product_family=excluded.product_family,
        card_class=excluded.card_class,
        variation_label=excluded.variation_label,
        serial_denominator=excluded.serial_denominator,
        grade_company=excluded.grade_company,
        grade_value=excluded.grade_value,
        grade_bucket=excluded.grade_bucket,
        channel=excluded.channel,
        is_auto=excluded.is_auto,
        is_bowman=excluded.is_bowman,
        is_chrome=excluded.is_chrome,
        is_paper=excluded.is_paper,
        is_case_hit=excluded.is_case_hit,
        is_insert=excluded.is_insert,
        insert_name=excluded.insert_name,
        is_redemption=excluded.is_redemption,
        is_redeemed=excluded.is_redeemed,
        is_digital=excluded.is_digital,
        is_lot=excluded.is_lot,
        model_eligible=excluded.model_eligible,
        exclusion_reason=excluded.exclusion_reason,
        bucket_key=excluded.bucket_key,
        normalized_json=excluded.normalized_json
    `),
  }
}

function upsertNormalizedSale(stmt, sale) {
  stmt.run(
    sale.itemId,
    sale.playerName,
    sale.releaseYear,
    sale.productFamily,
    sale.cardClass,
    sale.variationLabel,
    sale.serialDenominator,
    sale.gradeCompany,
    sale.gradeValue,
    sale.gradeBucket,
    sale.channel,
    bool(sale.isAuto),
    bool(sale.isBowman),
    bool(sale.isChrome),
    bool(sale.isPaper),
    bool(sale.isCaseHit),
    bool(sale.isInsert),
    sale.insertName,
    bool(sale.isRedemption),
    bool(sale.isRedeemed),
    bool(sale.isDigital),
    bool(sale.isLot),
    bool(sale.modelEligible),
    sale.exclusionReason,
    sale.bucketKey,
    JSON.stringify(sale),
  )
}

async function importRawFile(db, inputFile, importedAt) {
  const payload = JSON.parse(await readFile(inputFile, 'utf8'))
  const playerName = payload.playerName ?? 'Aiva Arquette'
  const rows = payload.rows ?? []
  const defaultReleaseYear = Number(payload.releaseYear ?? defaultReleaseYearFromFile(inputFile)) || null
  const model = buildMarketMoversPlayerModel(rows, playerName, { asOf: payload.scrapedAt, defaultReleaseYear })
  const statements = upsertSalesStatements(db)

  for (const sale of model.normalized) {
    const rawRow = rows.find((row) => String(row.itemId) === sale.itemId) ?? sale
    statements.raw.run(
      sale.itemId,
      payload.source ?? 'market-movers-ui',
      playerName,
      payload.search ?? '',
      sale.title,
      sale.salePriceText,
      sale.salePrice,
      sale.soldAt,
      sale.saleType,
      sale.seller,
      sale.sourcePage,
      sale.sourceOffset,
      importedAt,
      JSON.stringify(rawRow),
    )
    upsertNormalizedSale(statements.normalized, sale)
  }

  const importId = `${basename(inputFile)}:${Date.parse(importedAt)}`
  db.prepare(`
    INSERT INTO market_movers_import_runs (
      import_id, input_path, imported_at, player_name, raw_rows, normalized_rows,
      model_eligible_rows, excluded_rows, latest_sold_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(import_id) DO UPDATE SET
      input_path=excluded.input_path,
      imported_at=excluded.imported_at,
      player_name=excluded.player_name,
      raw_rows=excluded.raw_rows,
      normalized_rows=excluded.normalized_rows,
      model_eligible_rows=excluded.model_eligible_rows,
      excluded_rows=excluded.excluded_rows,
      latest_sold_at=excluded.latest_sold_at
  `).run(
    importId,
    inputFile,
    importedAt,
    playerName,
    rows.length,
    model.normalizedRows,
    model.modelEligibleRows,
    model.excludedRows,
    latestSoldAtFromSales(model.normalized),
  )

  return {
    inputFile,
    playerName,
    rawRows: rows.length,
    normalizedRows: model.normalizedRows,
    modelEligibleRows: model.modelEligibleRows,
    excludedRows: model.excludedRows,
    latestSoldAt: latestSoldAtFromSales(model.normalized),
  }
}

function reclassifyRawCache(db) {
  const rows = db.prepare(`
    SELECT player_name AS playerName, raw_json AS rawJson
    FROM market_movers_sales_raw
    ORDER BY player_name, sold_at
  `).all()
  const normalizedStmt = upsertSalesStatements(db).normalized
  const players = new Set()
  let reclassified = 0
  for (const row of rows) {
    const playerName = String(row.playerName ?? '')
    const raw = parseJson(String(row.rawJson ?? ''), null)
    if (!playerName || !raw) continue
    const sale = normalizeMarketMoversSale(raw, playerName, {})
    upsertNormalizedSale(normalizedStmt, sale)
    players.add(playerName)
    reclassified += 1
  }
  return { players: [...players], reclassified }
}

function loadPlayerNormalizedSales(db, playerName) {
  const rows = db.prepare(`
    SELECT
      n.normalized_json AS normalizedJson,
      COALESCE(f.erroneous, 0) AS erroneous,
      COALESCE(f.note, '') AS erroneousNote
    FROM market_movers_sales_normalized n
    LEFT JOIN market_movers_sale_flags f ON f.item_id = n.item_id
    WHERE n.player_name = ?
    ORDER BY n.release_year, n.product_family, n.card_class, n.variation_label
  `).all(playerName)

  return rows.flatMap((row) => {
    const sale = parseJson(String(row.normalizedJson ?? ''), null)
    if (!sale) return []
    if (Number(row.erroneous) === 1) {
      return [
        {
          ...sale,
          modelEligible: false,
          exclusionReason: row.erroneousNote ? `user flagged: ${row.erroneousNote}` : 'user flagged',
        },
      ]
    }
    return [sale]
  })
}

function rebuildPlayerBuckets(db, playerName, outputDir) {
  const normalized = loadPlayerNormalizedSales(db, playerName)
  const latestSoldAt = latestSoldAtFromSales(normalized)
  const model = buildMarketMoversNormalizedPlayerModel(normalized, playerName, { asOf: latestSoldAt || new Date().toISOString() })

  run(db, 'DELETE FROM market_movers_model_buckets WHERE player_name = ?', [playerName])
  const bucketStmt = db.prepare(`
    INSERT INTO market_movers_model_buckets (
      bucket_key, player_name, release_year, product_family, card_class, variation_label, grade_bucket,
      serial_denominator, sale_count, sales_30, sales_90, auction_count, bin_count,
      min_price, q1_price, median_price, avg_price, q3_price, max_price, model_price,
      base_auto_multiple, latest_sold_at, generated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const bucket of model.buckets) {
    bucketStmt.run(
      bucket.bucketKey,
      bucket.playerName,
      bucket.releaseYear,
      bucket.productFamily,
      bucket.cardClass,
      bucket.variationLabel,
      bucket.gradeBucket,
      bucket.serialDenominator,
      bucket.count,
      bucket.sales30,
      bucket.sales90,
      bucket.auctionCount,
      bucket.binCount,
      bucket.minPrice,
      bucket.q1Price,
      bucket.medianPrice,
      bucket.avgPrice,
      bucket.q3Price,
      bucket.maxPrice,
      bucket.modelPrice,
      bucket.baseAutoMultiple,
      bucket.latestSoldAt,
      model.generatedAt,
    )
  }

  return {
    model,
    summaryFile: join(outputDir, `${slugify(playerName)}.cache-summary.json`),
    csvFile: join(outputDir, `${slugify(playerName)}.cache-buckets.csv`),
  }
}

function dbTotals(db) {
  const raw = db.prepare(`
    SELECT
      COUNT(*) AS rawRows,
      COUNT(DISTINCT player_name) AS rawPlayers,
      MAX(sold_at) AS latestSoldAt
    FROM market_movers_sales_raw
  `).get()
  const normalized = db.prepare(`
    SELECT
      COUNT(*) AS normalizedRows,
      COALESCE(SUM(model_eligible), 0) AS modelEligibleRows,
      COALESCE(SUM(CASE WHEN model_eligible = 0 THEN 1 ELSE 0 END), 0) AS excludedRows
    FROM market_movers_sales_normalized
  `).get()
  const buckets = db.prepare(`
    SELECT COUNT(*) AS bucketRows, COUNT(DISTINCT player_name) AS modeledPlayers
    FROM market_movers_model_buckets
  `).get()
  const flags = db.prepare(`
    SELECT COALESCE(SUM(erroneous), 0) AS flaggedRows
    FROM market_movers_sale_flags
  `).get()
  return {
    rawRows: Number(raw.rawRows ?? 0),
    rawPlayers: Number(raw.rawPlayers ?? 0),
    normalizedRows: Number(normalized.normalizedRows ?? 0),
    modelEligibleRows: Number(normalized.modelEligibleRows ?? 0),
    excludedRows: Number(normalized.excludedRows ?? 0),
    bucketRows: Number(buckets.bucketRows ?? 0),
    modeledPlayers: Number(buckets.modeledPlayers ?? 0),
    flaggedRows: Number(flags.flaggedRows ?? 0),
    latestSoldAt: String(raw.latestSoldAt ?? ''),
  }
}

const inputFiles = await discoverRawFiles(inputArgs)
await mkdir(dirname(dbFile), { recursive: true })
const db = new DatabaseSync(dbFile)
createSchema(db)
const migratedBucketOverrides = migratePlayerScopedBucketOverrides(db)

const importedAt = new Date().toISOString()
const imports = []
const affectedPlayers = new Set()

db.exec('BEGIN')
try {
  for (const inputFile of inputFiles) {
    const result = await importRawFile(db, inputFile, importedAt)
    imports.push(result)
    affectedPlayers.add(result.playerName)
  }

  if (shouldReclassifyCache) {
    const reclassified = reclassifyRawCache(db)
    for (const playerName of reclassified.players) affectedPlayers.add(playerName)
    imports.push({
      inputFile: 'existing-cache',
      playerName: `${reclassified.players.length} players`,
      rawRows: reclassified.reclassified,
      normalizedRows: reclassified.reclassified,
      modelEligibleRows: 0,
      excludedRows: 0,
      latestSoldAt: '',
    })
  }

  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK')
  db.close()
  throw error
}

const outputDir = inputFiles[0] ? dirname(inputFiles[0]) : defaultInput
await mkdir(outputDir, { recursive: true })
const rebuiltPlayers = []

db.exec('BEGIN')
try {
  for (const playerName of [...affectedPlayers].sort()) {
    const rebuilt = rebuildPlayerBuckets(db, playerName, outputDir)
    await writeFile(rebuilt.summaryFile, JSON.stringify({ ...rebuilt.model, normalized: undefined }, null, 2))
    await writeFile(rebuilt.csvFile, modelBucketCsvRows(rebuilt.model))
    rebuiltPlayers.push({
      playerName,
      summaryFile: rebuilt.summaryFile,
      csvFile: rebuilt.csvFile,
      rows: rebuilt.model.totalRows,
      modelEligibleRows: rebuilt.model.modelEligibleRows,
      excludedRows: rebuilt.model.excludedRows,
      buckets: rebuilt.model.buckets.length,
      baseAutoPrice: rebuilt.model.baseAutoPrice ? Number(rebuilt.model.baseAutoPrice.toFixed(2)) : null,
      latestSoldAt: latestSoldAtFromSales(rebuilt.model.normalized),
      topBuckets: rebuilt.model.buckets.slice(0, 6).map((bucket) => ({
        bucket: bucket.bucketKey,
        count: bucket.count,
        modelPrice: Number(bucket.modelPrice.toFixed(2)),
        multiple: bucket.baseAutoMultiple ? Number(bucket.baseAutoMultiple.toFixed(2)) : null,
      })),
    })
  }
  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK')
  db.close()
  throw error
}

const totals = dbTotals(db)
db.close()

console.log(
  JSON.stringify(
    {
      dbFile,
      inputFiles,
      importedFiles: imports.length,
      imports,
      rebuiltPlayers,
      totals,
      migratedBucketOverrides,
      nextFreshPull: 'Drop new *.raw.json files into local-data/market-movers and rerun npm run sales:sync.',
    },
    null,
    2,
  ),
)
