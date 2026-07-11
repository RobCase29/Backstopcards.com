import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import { createCanonicalMarketSchema } from './canonical-market.mjs'
import {
  createChecklistLedgerSchema,
  normalizePlayerKey,
  upsertChecklistRelease,
  upsertChecklistRows,
  upsertExplicitFirstBowmanEvidence,
  WAX_PACK_HERO_FIRST_SOURCE,
} from './checklist-ledger.mjs'

const ROOT = process.cwd()
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DB_PATH = resolve(process.env.BACKSTOP_SALES_DB ?? join(ROOT, 'local-data/backstop-sales.sqlite'))
const CORRECTIONS_PATH = resolve(process.argv[2] ?? join(SCRIPT_DIR, 'data/checklist-corrections.json'))
const SOURCE_SHEET = 'Wax Pack Hero First Bowman'

const corrections = JSON.parse(readFileSync(CORRECTIONS_PATH, 'utf8'))
const db = new DatabaseSync(DB_PATH)
createChecklistLedgerSchema(db)
createCanonicalMarketSchema(db)

const queue = db.prepare(`
  INSERT INTO canonical_refresh_queue (player_name, release_year, priority, status, updated_at)
  VALUES (?, ?, 120, 'queued', ?)
  ON CONFLICT(player_name, release_year) DO UPDATE SET
    priority = MAX(canonical_refresh_queue.priority, excluded.priority),
    status = CASE WHEN canonical_refresh_queue.status = 'running' THEN 'running' ELSE 'queued' END,
    updated_at = excluded.updated_at
`)

const applied = []
db.exec('BEGIN')
try {
  for (const correction of corrections) {
    const nowIso = new Date().toISOString()
    upsertChecklistRelease(db, {
      releaseKey: correction.releaseKey,
      releaseYear: correction.releaseYear,
      releaseName: correction.releaseName,
      productLine: 'Bowman',
      sourcePath: correction.sourceUrl,
      nowIso,
      rawJson: {
        importer: 'curated-checklist-correction',
        reason: correction.reason,
        sourceUrl: correction.sourceUrl,
      },
    })
    upsertChecklistRows(
      db,
      correction.releaseKey,
      correction.releaseYear,
      [
        {
          sourceSheet: SOURCE_SHEET,
          section: correction.section,
          cardNo: correction.cardNo,
          playerName: correction.playerName,
          team: correction.team,
          rookieFlag: correction.rookieFlag,
        },
      ],
      { nowIso, prune: false },
    )
    const evidence = upsertExplicitFirstBowmanEvidence(
      db,
      correction.releaseKey,
      [
        {
          cardNo: correction.cardNo,
          playerName: correction.playerName,
          title: `${correction.releaseYear} Bowman Chrome ${correction.playerName} 1st Bowman Auto ${correction.cardNo}`,
          sourceKey: `curated:${correction.releaseKey}:${correction.cardNo}`,
          confidence: 1,
          observedAt: nowIso,
        },
      ],
      {
        nowIso,
        source: WAX_PACK_HERO_FIRST_SOURCE,
        sourceUrl: correction.sourceUrl,
      },
    )
    queue.run(correction.playerName, correction.releaseYear, nowIso)
    applied.push({
      releaseKey: correction.releaseKey,
      playerName: correction.playerName,
      playerKey: normalizePlayerKey(correction.playerName),
      cardNo: correction.cardNo,
      evidenceMatched: evidence.matched,
    })
  }
  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK')
  db.close()
  throw error
}

db.close()
console.log(JSON.stringify({ database: DB_PATH, corrections: applied }, null, 2))
