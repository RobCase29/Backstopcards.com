import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import { createCanonicalMarketSchema } from './canonical-market.mjs'
import {
  createChecklistLedgerSchema,
  normalizePlayerKey,
  parseWaxPackHeroFirstBowmanPage,
  releaseKeyFromParts,
  summarizeChecklistLedger,
  upsertChecklistRelease,
  upsertChecklistRows,
  upsertExplicitFirstBowmanEvidence,
  WAX_PACK_HERO_FIRST_SOURCE,
} from './checklist-ledger.mjs'

const cwd = process.cwd()
const defaultDbFile = resolve(process.env.BACKSTOP_SALES_DB ?? join(cwd, 'local-data/backstop-sales.sqlite'))
const DEFAULT_HUB_URL = 'https://waxpackhero.com/firstbowman'
const DEFAULT_INDEX_URL = 'https://waxpackhero.com/first-bowman'

function compact(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function argValue(name, fallback = null) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function usage() {
  return [
    'Usage: node scripts/import-waxpackhero-first-bowman.mjs [--seed-queue] [--since-year=1996]',
    '',
    'Imports every Wax Pack Hero 1st Bowman checklist page into the local checklist ledger.',
    'The import creates synthetic checklist rows when an official checklist workbook is not loaded,',
    'then queues player/year refreshes so Card Hedge can supply base-auto pricing.',
  ].join('\n')
}

function htmlDecode(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function pageYearFromUrl(url) {
  return Number(String(url ?? '').match(/\/first-bowman\/((?:19|20)\d{2})(?:-|$)/i)?.[1] ?? 0) || null
}

function sourceHash(value) {
  return createHash('sha1').update(String(value ?? '')).digest('hex')
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'BackstopCardFinder/1.0 (+private local first-bowman importer)',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!response.ok) throw new Error(`Could not fetch ${url}: HTTP ${response.status}`)
  return response.text()
}

function firstBowmanLinksFromHub(html, hubUrl) {
  const links = []
  const seen = new Set()
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = htmlDecode(match[1])
    if (!/\/first-bowman\//i.test(href)) continue
    const url = new URL(href, hubUrl).href.replace(/#.*$/, '')
    const year = pageYearFromUrl(url)
    if (!year || seen.has(url)) continue
    seen.add(url)
    links.push({
      url,
      year,
      label: compact(htmlDecode(match[2]).replace(/<[^>]+>/g, ' ')),
    })
  }
  return links.sort((left, right) => right.year - left.year || left.url.localeCompare(right.url))
}

function olderIndexLinks(html, sourceUrl) {
  const links = []
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = htmlDecode(match[1])
    const text = compact(htmlDecode(match[2]).replace(/<[^>]+>/g, ' '))
    if (!/Older/i.test(text) || !/\/first-bowman\?/i.test(href)) continue
    links.push(new URL(href, sourceUrl).href)
  }
  return links
}

async function collectFirstBowmanPages(hubUrl, options = {}) {
  const indexQueue = [hubUrl]
  if (!options.skipIndexCrawl && hubUrl !== DEFAULT_INDEX_URL) indexQueue.push(DEFAULT_INDEX_URL)
  const seenIndexes = new Set()
  const byUrl = new Map()

  while (indexQueue.length) {
    const indexUrl = indexQueue.shift()
    if (!indexUrl || seenIndexes.has(indexUrl)) continue
    seenIndexes.add(indexUrl)
    const html = await fetchText(indexUrl)
    for (const link of firstBowmanLinksFromHub(html, indexUrl)) byUrl.set(link.url, link)
    if (!options.skipIndexCrawl) {
      for (const nextUrl of olderIndexLinks(html, indexUrl)) {
        if (!seenIndexes.has(nextUrl)) indexQueue.push(nextUrl)
      }
    }
  }

  return [...byUrl.values()].sort((left, right) => right.year - left.year || left.url.localeCompare(right.url))
}

function rowsFromEntries(entries) {
  return entries.map((entry) => ({
    sourceSheet: 'Wax Pack Hero First Bowman',
    section: entry.section || entry.releaseName,
    cardNo: entry.cardNo,
    playerName: entry.playerName,
    team: '',
    rookieFlag: '1st',
  }))
}

function upsertWaxPackHeroPage(db, page, nowIso) {
  const groups = new Map()
  for (const entry of page.entries) {
    const releaseYear = Number(entry.releaseYear || page.year)
    const releaseName = entry.releaseName || `${releaseYear} Bowman`
    const releaseKey = entry.releaseKey || releaseKeyFromParts(releaseYear, releaseName)
    const group =
      groups.get(releaseKey) ??
      {
        releaseKey,
        releaseYear,
        releaseName,
        entries: [],
      }
    group.entries.push({ ...entry, releaseYear, releaseName, releaseKey })
    groups.set(releaseKey, group)
  }

  const releases = []
  for (const group of groups.values()) {
    upsertChecklistRelease(db, {
      releaseKey: group.releaseKey,
      releaseYear: group.releaseYear,
      releaseName: group.releaseName,
      sourcePath: page.url,
      sourceHash: page.hash,
      nowIso,
      rawJson: {
        importer: 'waxpackhero-first-bowman',
        source: WAX_PACK_HERO_FIRST_SOURCE,
        sourceUrl: page.url,
        hubUrl: page.hubUrl,
      },
    })
    const checklist = upsertChecklistRows(db, group.releaseKey, group.releaseYear, rowsFromEntries(group.entries), { nowIso, prune: false })
    const evidence = upsertExplicitFirstBowmanEvidence(db, group.releaseKey, group.entries, {
      nowIso,
      source: WAX_PACK_HERO_FIRST_SOURCE,
      sourceUrl: page.url,
    })
    releases.push({
      releaseKey: group.releaseKey,
      releaseYear: group.releaseYear,
      releaseName: group.releaseName,
      cards: checklist.cards,
      parsedEntries: group.entries.length,
      evidence: {
        matched: evidence.matched,
        unmatched: evidence.unmatched,
      },
      sampleUnmatched: evidence.unmatchedEntries.slice(0, 5),
    })
  }
  return releases
}

function seedFirstBowmanBaseAutoQueue(db, releases, options = {}) {
  createCanonicalMarketSchema(db)
  const nowIso = options.nowIso ?? new Date().toISOString()
  const maxYear = Math.max(0, ...releases.map((release) => release.releaseYear).filter(Boolean))
  const candidates = db.prepare(`
    SELECT
      c.release_year AS releaseYear,
      c.player_name AS playerName,
      c.player_key AS playerKey,
      COUNT(*) AS cards,
      MAX(CASE WHEN c.first_status = 'confirmed_1st' THEN 1 ELSE 0 END) AS confirmedFirst
    FROM checklist_cards c
    JOIN checklist_releases r ON r.release_key = c.release_key
    WHERE c.source_sheet = 'Wax Pack Hero First Bowman'
      AND c.release_year BETWEEN ? AND ?
    GROUP BY c.release_year, c.player_key
  `).all(options.sinceYear ?? 0, options.untilYear ?? 9999)

  const existing = db.prepare('SELECT player_name AS playerName, release_year AS releaseYear, status FROM canonical_refresh_queue').all()
  const existingStatus = new Map(existing.map((row) => [`${normalizePlayerKey(row.playerName)}:${row.releaseYear}`, row.status]))
  const upsert = db.prepare(`
    INSERT INTO canonical_refresh_queue (player_name, release_year, priority, status, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(player_name, release_year) DO UPDATE SET
      priority=MAX(canonical_refresh_queue.priority, excluded.priority),
      status=CASE
        WHEN canonical_refresh_queue.status = 'done' THEN canonical_refresh_queue.status
        ELSE excluded.status
      END,
      updated_at=excluded.updated_at
  `)

  let inserted = 0
  let updated = 0
  const queueRows = candidates
    .map((row) => {
      const recencyBoost = Math.max(0, Math.min(22, Number(row.releaseYear ?? 0) - (maxYear - 22)))
      const firstBoost = Number(row.confirmedFirst ?? 0) ? 35 : 20
      return {
        ...row,
        priority: Number((firstBoost + recencyBoost + Math.min(8, Number(row.cards ?? 0))).toFixed(3)),
      }
    })
    .sort((left, right) => right.priority - left.priority || right.releaseYear - left.releaseYear || left.playerName.localeCompare(right.playerName))

  for (const row of queueRows) {
    const key = `${normalizePlayerKey(row.playerName)}:${row.releaseYear}`
    if (existingStatus.has(key)) updated += 1
    else inserted += 1
    const nextStatus = existingStatus.get(key) === 'done' ? 'done' : 'queued'
    upsert.run(row.playerName, row.releaseYear, row.priority, nextStatus, nowIso)
  }

  return {
    queuedPlayers: queueRows.length,
    inserted,
    updated,
    topQueue: queueRows.slice(0, 50),
  }
}

if (hasFlag('--help')) {
  console.log(usage())
  process.exit(0)
}

const hubUrl = compact(argValue('--hub-url', DEFAULT_HUB_URL))
const sinceYear = Number(argValue('--since-year', '1996')) || 0
const untilYear = Number(argValue('--until-year', '9999')) || 9999
const maxPages = Number(argValue('--max-pages', '0')) || 0
const dbFile = resolve(argValue('--db', defaultDbFile))
const reportFile = resolve(argValue('--report', join(cwd, 'local-data/checklists/waxpackhero-first-bowman-import.json')))
const seedQueue = hasFlag('--seed-queue')
const dryRun = hasFlag('--dry-run')

mkdirSync(dirname(dbFile), { recursive: true })
mkdirSync(dirname(reportFile), { recursive: true })

const sourcePages = (await collectFirstBowmanPages(hubUrl, { skipIndexCrawl: hasFlag('--no-index-crawl') }))
  .filter((page) => page.year >= sinceYear && page.year <= untilYear)
  .slice(0, maxPages || undefined)

const pages = []
for (const sourcePage of sourcePages) {
  const html = await fetchText(sourcePage.url)
  const parsed = parseWaxPackHeroFirstBowmanPage(html, { releaseYear: sourcePage.year, sourceUrl: sourcePage.url })
  pages.push({
    ...sourcePage,
    hubUrl,
    hash: sourceHash(html),
    parsedEntries: parsed.entries.length,
    sections: parsed.sections,
    entries: parsed.entries,
  })
}

const db = new DatabaseSync(dbFile)
createChecklistLedgerSchema(db)

let importedReleases = []
let queue = null
if (!dryRun) {
  db.exec('BEGIN')
  try {
    const nowIso = new Date().toISOString()
    importedReleases = pages.flatMap((page) => upsertWaxPackHeroPage(db, page, nowIso))
    if (seedQueue) {
      queue = seedFirstBowmanBaseAutoQueue(db, importedReleases, { sinceYear, untilYear, nowIso })
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    db.close()
    throw error
  }
}

const summary = summarizeChecklistLedger(db)
db.close()

const payload = {
  importedAt: new Date().toISOString(),
  dryRun,
  source: WAX_PACK_HERO_FIRST_SOURCE,
  hubUrl,
  dbFile,
  pageCount: pages.length,
  parsedEntries: pages.reduce((total, page) => total + page.parsedEntries, 0),
  pages: pages.map((page) => ({
    url: page.url,
    year: page.year,
    parsedEntries: page.parsedEntries,
    sections: page.sections,
  })),
  importedReleases,
  queue,
  summary: {
    ...summary,
    sections: summary.sections.slice(0, 60),
  },
}

writeFileSync(reportFile, `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify({ ...payload, reportFile }, null, 2))
