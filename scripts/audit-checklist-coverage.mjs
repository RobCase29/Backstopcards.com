import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const cwd = process.cwd()
const dbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))
const reportFile = resolve(process.env.CHECKLIST_COVERAGE_REPORT ?? join(cwd, 'local-data/checklists/checklist-coverage.json'))
const minYear = Number(process.env.CHECKLIST_COVERAGE_MIN_YEAR ?? 2016)

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function percent(value, total) {
  return total ? Number(((value / total) * 100).toFixed(1)) : 0
}

const db = new DatabaseSync(dbFile)
db.function('normalize_player', { deterministic: true }, normalize)

const rows = db.prepare(`
  WITH players AS (
    SELECT
      c.release_key,
      r.release_name,
      r.release_year,
      c.player_key,
      MAX(c.player_name) AS player_name,
      MAX(CASE WHEN c.source_sheet = 'Wax Pack Hero First Bowman' THEN 1 ELSE 0 END) AS historical_first,
      MAX(CASE WHEN c.is_auto = 1 THEN 1 ELSE 0 END) AS listed_auto,
      MAX(CASE WHEN c.first_status = 'confirmed_1st' THEN 1 ELSE 0 END) AS confirmed_first
    FROM checklist_cards c
    JOIN checklist_releases r ON r.release_key = c.release_key
    WHERE r.release_year >= ?
    GROUP BY c.release_key, r.release_name, r.release_year, c.player_key
  ),
  lanes AS (
    SELECT
      release_year,
      normalize_player(player_name) AS player_lookup,
      MAX(CASE
        WHEN grade_bucket = 'Raw'
          AND card_class IN ('auto', 'paper-auto')
          AND variation_label IN ('Base Auto', 'Base', '')
          AND summary.sale_count > 0
        THEN summary.sale_count ELSE 0 END) AS base_sales,
      MAX(CASE
        WHEN grade_bucket = 'Raw'
          AND card_class IN ('auto', 'paper-auto')
          AND summary.sale_count > 0
        THEN summary.sale_count ELSE 0 END) AS variation_sales
    FROM canonical_cards cards
    JOIN canonical_comp_summary summary USING (canonical_card_key)
    GROUP BY release_year, normalize_player(player_name)
  ),
  card_evidence AS (
    SELECT
      normalize_player(player_name) AS player_lookup,
      CAST(substr(source_query, instr(source_query, '20'), 4) AS INTEGER) AS release_year,
      SUM(CASE WHEN
        lower(description || ' ' || card_set || ' ' || variant || ' ' || category || ' ' || category_group || ' ' || set_type) LIKE '%auto%'
        OR lower(description || ' ' || card_set || ' ' || variant || ' ' || category || ' ' || category_group || ' ' || set_type) LIKE '%signature%'
        OR lower(description || ' ' || card_set || ' ' || variant || ' ' || category || ' ' || category_group || ' ' || set_type) LIKE '%signed%'
        THEN 1 ELSE 0 END) AS auto_cards
    FROM card_hedge_cards
    WHERE source_query GLOB '*20[0-9][0-9]*'
    GROUP BY normalize_player(player_name), CAST(substr(source_query, instr(source_query, '20'), 4) AS INTEGER)
  )
  SELECT
    p.release_key AS releaseKey,
    p.release_name AS releaseName,
    p.release_year AS releaseYear,
    p.player_name AS playerName,
    p.historical_first AS historicalFirst,
    p.listed_auto AS listedAuto,
    p.confirmed_first AS confirmedFirst,
    COALESCE(l.base_sales, 0) AS baseSales,
    COALESCE(l.variation_sales, 0) AS variationSales,
    COALESCE(e.auto_cards, 0) AS autoCardsFound,
    COALESCE(q.status, 'unsearched') AS queueStatus,
    COALESCE(q.last_success_at, '') AS lastSuccessAt,
    COALESCE(q.error, '') AS queueError
  FROM players p
  LEFT JOIN lanes l
    ON l.release_year = p.release_year
    AND l.player_lookup = normalize_player(p.player_name)
  LEFT JOIN card_evidence e
    ON e.release_year = p.release_year
    AND e.player_lookup = normalize_player(p.player_name)
  LEFT JOIN canonical_refresh_queue q
    ON q.release_year = p.release_year
    AND normalize_player(q.player_name) = normalize_player(p.player_name)
  ORDER BY p.release_year DESC, p.release_name, p.player_name
`).all(minYear)

const modelable = rows.filter((row) => row.historicalFirst || row.listedAuto)
const classified = modelable.map((row) => ({
  ...row,
  state:
    row.baseSales > 0
      ? 'direct-base'
      : row.variationSales > 0
        ? 'variation-evidence'
        : row.queueStatus === 'done' && row.autoCardsFound > 0
          ? 'auto-card-no-sales'
          : row.queueStatus === 'done'
            ? 'no-auto-card-found'
            : row.queueStatus === 'queued' || row.queueStatus === 'running'
              ? row.queueStatus
              : row.queueStatus === 'error' || row.queueStatus === 'timeout'
                ? 'search-error'
                : 'unsearched',
}))

const stateCounts = Object.fromEntries(
  [...new Set(classified.map((row) => row.state))]
    .sort()
    .map((state) => [state, classified.filter((row) => row.state === state).length]),
)

const releases = [...new Set(rows.map((row) => row.releaseKey))].map((releaseKey) => {
  const allRows = rows.filter((row) => row.releaseKey === releaseKey)
  const targets = classified.filter((row) => row.releaseKey === releaseKey)
  const direct = targets.filter((row) => row.state === 'direct-base').length
  const evidence = targets.filter((row) => row.state === 'variation-evidence').length
  return {
    releaseKey,
    releaseName: allRows[0]?.releaseName ?? releaseKey,
    releaseYear: allRows[0]?.releaseYear ?? 0,
    checklistPlayers: allRows.length,
    modelTargets: targets.length,
    directBaseModels: direct,
    variationEvidence: evidence,
    modeledPct: percent(direct + evidence, targets.length),
    unresolved: targets.length - direct - evidence,
  }
}).sort((left, right) => right.releaseYear - left.releaseYear || left.releaseName.localeCompare(right.releaseName))

const payload = {
  generatedAt: new Date().toISOString(),
  dbFile,
  minYear,
  checklistPlayers: rows.length,
  modelTargets: classified.length,
  directBaseModels: stateCounts['direct-base'] ?? 0,
  variationEvidence: stateCounts['variation-evidence'] ?? 0,
  modeledPct: percent((stateCounts['direct-base'] ?? 0) + (stateCounts['variation-evidence'] ?? 0), classified.length),
  states: stateCounts,
  releases,
  unresolved: classified.filter((row) => !['direct-base', 'variation-evidence'].includes(row.state)),
}

db.close()
mkdirSync(dirname(reportFile), { recursive: true })
writeFileSync(reportFile, `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify({ ...payload, unresolved: payload.unresolved.slice(0, 25), reportFile }, null, 2))
