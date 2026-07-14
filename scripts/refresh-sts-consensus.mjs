import { existsSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUTPUTS = [
  {
    population: 'hitter',
    type: 'hitting',
    file: 'src/data/sts_formulated_consensus_hitters.csv',
  },
  {
    population: 'pitcher',
    type: 'pitching',
    file: 'src/data/sts_formulated_consensus_pitchers.csv',
  },
]

const API_BASE = 'https://scoutthestatline.com/wp-json/sts/v1/get-consensus'
const OOPSY_PEAK_BASE = 'https://scoutthestatline.com/wp-json/sts/v1/get-leaderboard'
const ORACLE_API_BASE = process.env.BASEBALL_ORACLE_API_BASE ?? process.env.BASEBALL_ORACLE_API_URL ?? 'https://baseball-oracle.vercel.app'
const ORACLE_SCHEMA_VERSION = 'player-signals.v1'
const ORACLE_CONTRACT_VERSION = 'player-signals-contract/v1'
const ORACLE_OUTPUT = 'src/data/baseball_oracle_bowman_prospects.csv'
const SOURCE_COLUMNS = [
  ['rank_bags', 'BaGS'],
  ['rank_fscore', 'FScore'],
  ['rank_pgplus', 'PG+'],
  ['rank_pl', 'PLFR'],
  ['rank_sts', 'OOPSY Peak'],
  ['rank_pars', 'PARS'],
  ['rank_ptilt', 'P.Tilt'],
  ['rank_colossus', 'Colossus'],
]

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function parseCsvRows(input) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (row.some((cell) => cell.length > 0)) rows.push(row)
    row = []
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') inQuotes = true
    else if (char === ',') pushField()
    else if (char === '\n') pushRow()
    else if (char === '\r') {
      if (input[index + 1] === '\n') index += 1
      pushRow()
    } else field += char
  }
  if (field.length > 0 || row.length > 0) pushRow()
  return rows
}

function normalizePlayerName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TEAM_CODES = new Map(Object.entries({
  'arizona diamondbacks': 'ARI', 'atlanta braves': 'ATL', 'baltimore orioles': 'BAL',
  'boston red sox': 'BOS', 'chicago cubs': 'CHC', 'chicago white sox': 'CWS',
  'cincinnati reds': 'CIN', 'cleveland guardians': 'CLE', 'colorado rockies': 'COL',
  'detroit tigers': 'DET', 'houston astros': 'HOU', 'kansas city royals': 'KC',
  'los angeles angels': 'LAA', 'los angeles dodgers': 'LAD', 'miami marlins': 'MIA',
  'milwaukee brewers': 'MIL', 'minnesota twins': 'MIN', 'new york mets': 'NYM',
  'new york yankees': 'NYY', athletics: 'ATH', 'oakland athletics': 'ATH',
  'philadelphia phillies': 'PHI', 'pittsburgh pirates': 'PIT', 'san diego padres': 'SD',
  'san francisco giants': 'SF', 'seattle mariners': 'SEA', 'st louis cardinals': 'STL',
  'tampa bay rays': 'TB', 'texas rangers': 'TEX', 'toronto blue jays': 'TOR',
  'washington nationals': 'WSN',
}))
const TEAM_CODE_ALIASES = new Map(Object.entries({ CHW: 'CWS', KCR: 'KC', OAK: 'ATH', SDP: 'SD', SFG: 'SF', TBR: 'TB', WSH: 'WSN' }))

function normalizeTeamCode(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const upper = text.toUpperCase().replace(/[^A-Z]/g, '')
  if (/^[A-Z]{2,3}$/.test(upper)) return TEAM_CODE_ALIASES.get(upper) ?? upper
  return TEAM_CODES.get(normalizePlayerName(text)) ?? ''
}

function previousOracleIdentities(target) {
  if (!existsSync(target)) return new Map()
  const rows = parseCsvRows(readFileSync(target, 'utf8'))
  const headers = rows[0] ?? []
  const indexes = new Map(headers.map((header, index) => [header.trim(), index]))
  const checklistKeyIndex = indexes.get('Checklist Key') ?? -1
  const playerIdIndex = indexes.get('Oracle Player Id') ?? -1
  return new Map(rows.slice(1).flatMap((row) => {
    const checklistKey = String(row[checklistKeyIndex] ?? '').trim()
    const playerId = String(row[playerIdIndex] ?? '').trim()
    return checklistKey && playerId ? [[checklistKey, playerId]] : []
  }))
}

function checklistProjectIdentitySeeds(root) {
  const releasesDir = resolve(root, '../Checklist.BackstopCards.com/data/releases')
  if (!existsSync(releasesDir)) return new Map()
  const files = ['2026-bowman-baseball.json', '2025-bowman-draft-baseball.json']
  const seeds = new Map()
  for (const file of files) {
    const target = resolve(releasesDir, file)
    if (!existsSync(target)) continue
    const release = JSON.parse(readFileSync(target, 'utf8'))
    for (const player of release.players ?? []) {
      const key = normalizePlayerName(player.checklistName ?? player.name)
      if (key && player.playerId) seeds.set(key, String(player.playerId))
    }
  }
  return seeds
}

async function checklistCandidates(root, priorIdentities) {
  const dbPath = resolve(process.env.BACKSTOP_SALES_DB?.trim() || resolve(root, 'local-data/backstop-sales.sqlite'))
  if (!existsSync(dbPath)) {
    return [...priorIdentities.keys()].map((checklistKey) => ({ checklistKey, checklistName: checklistKey, teams: [] }))
  }
  const sqlite = await import('node:sqlite')
  const db = new sqlite.DatabaseSync(dbPath, { readOnly: true })
  try {
    const rows = db.prepare(`
      SELECT player_key AS playerKey, player_name AS playerName, team
      FROM checklist_cards
      WHERE TRIM(player_name) <> ''
      ORDER BY player_key, player_name
    `).all()
    const candidates = new Map()
    for (const row of rows) {
      const checklistName = String(row.playerName ?? '').trim()
      const checklistKey = normalizePlayerName(String(row.playerKey ?? '') || checklistName)
      if (!checklistKey || !checklistName) continue
      const candidate = candidates.get(checklistKey) ?? { checklistKey, checklistName, teams: new Set() }
      const team = String(row.team ?? '').trim()
      if (team) candidate.teams.add(team)
      candidates.set(checklistKey, candidate)
    }
    return [...candidates.values()].map((candidate) => ({ ...candidate, teams: [...candidate.teams].sort() }))
  } finally {
    db.close()
  }
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function sourceAverage(player) {
  const values = SOURCE_COLUMNS.map(([key]) => parseNumber(player[key])).filter((value) => value !== null)
  if (!values.length) return Number.POSITIVE_INFINITY
  return values.reduce((total, value) => total + value, 0) / values.length
}

function sortPlayers(left, right) {
  const leftAvg = parseNumber(left.avg_rank) ?? sourceAverage(left)
  const rightAvg = parseNumber(right.avg_rank) ?? sourceAverage(right)
  return leftAvg - rightAvg || String(left.name ?? '').localeCompare(String(right.name ?? ''))
}

async function fetchConsensus(type) {
  const url = new URL(API_BASE)
  url.searchParams.set('type', type)
  url.searchParams.set('show_low', '1')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Backstop Card Finder consensus refresh',
    },
  })
  if (!response.ok) {
    throw new Error(`Consensus ${type} request failed: ${response.status} ${response.statusText}`)
  }

  const payload = await response.json()
  const players = Array.isArray(payload?.players) ? payload.players : Array.isArray(payload) ? payload : []
  if (!players.length) throw new Error(`Consensus ${type} request returned no players`)

  return {
    updated: payload?.updated ?? new Date().toISOString(),
    players: players.sort(sortPlayers),
  }
}

async function fetchOopsyPeakMlb() {
  const url = new URL(OOPSY_PEAK_BASE)
  url.searchParams.set('type', 'combined')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Backstop Card Finder OOPSY Peak MLB refresh',
    },
  })
  if (!response.ok) {
    throw new Error(`OOPSY Peak MLB request failed: ${response.status} ${response.statusText}`)
  }

  const payload = await response.json()
  const players = Array.isArray(payload) ? payload : Array.isArray(payload?.players) ? payload.players : []
  const mlbPlayers = players
    .filter((player) => String(player.highest_level ?? player.level ?? '').toUpperCase() === 'MLB')
    .sort((left, right) => (parseNumber(left.rank) ?? Number.POSITIVE_INFINITY) - (parseNumber(right.rank) ?? Number.POSITIVE_INFINITY))

  if (!mlbPlayers.length) throw new Error('OOPSY Peak MLB request returned no MLB players')

  return {
    updated: new Date().toISOString(),
    players: mlbPlayers,
  }
}

function toCsv({ population, updated, players }) {
  const headers = [
    'Population',
    '#',
    'FgId',
    'Name',
    'Age',
    'Level',
    'Team',
    'Pos',
    'Avg Rank',
    'Coverage',
    'In Sts',
    ...SOURCE_COLUMNS.map(([, label]) => label),
    'Updated',
  ]

  const rows = players.map((player, index) => [
    population,
    index + 1,
    player.fg_id ?? '',
    player.name ?? '',
    player.age ?? '',
    player.level ?? '',
    player.team ?? '',
    player.position ?? '',
    player.avg_rank ?? '',
    player.coverage ?? '',
    player.in_sts ?? '',
    ...SOURCE_COLUMNS.map(([key]) => player[key] ?? ''),
    updated,
  ])

  return `${headers.map(csvCell).join(',')}\n${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`
}

function toOopsyPeakMlbCsv({ updated, players }) {
  const headers = [
    'Source',
    '#',
    'PlayerId',
    'Name',
    'Age',
    'Level',
    'Team',
    'Pos',
    'Rank',
    'Prospect Rank',
    '1 Day Change',
    '3 Day Change',
    '7 Day Change',
    '14 Day Change',
    '30 Day Change',
    'WAR',
    'Summary',
    'Updated',
  ]

  const rows = players.map((player, index) => [
    'OOPSY Peak MLB',
    index + 1,
    player.player_id ?? player.id ?? '',
    player.player ?? player.name ?? '',
    player.age ?? '',
    player.highest_level ?? '',
    player.team_update ?? '',
    player.sp_rp ?? '',
    player.rank ?? '',
    player.prospect_rank ?? '',
    player.c_1_day_change ?? '',
    player.c_3_day_change ?? '',
    player.c_7_day_change ?? '',
    player.c_14_day_change ?? '',
    player.c_30_day_change ?? '',
    player.war ?? '',
    player.summary ?? '',
    updated,
  ])

  return `${headers.map(csvCell).join(',')}\n${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`
}

function assertOraclePage(payload, label) {
  if (
    payload?.schemaVersion !== ORACLE_SCHEMA_VERSION ||
    payload?.contractVersion !== ORACLE_CONTRACT_VERSION ||
    !payload?.snapshot?.id ||
    payload.snapshot.freshness?.status !== 'ok' ||
    !Array.isArray(payload?.items) ||
    !Number.isInteger(payload?.page?.page) ||
    !Number.isInteger(payload?.page?.totalPages)
  ) {
    throw new Error(`${label} returned an unsupported or stale Baseball Oracle response`)
  }
  return payload
}

async function fetchOraclePage(stage, page) {
  const url = new URL('/api/v1/player-signals', ORACLE_API_BASE)
  url.searchParams.set('stage', stage)
  url.searchParams.set('sort', stage === 'Minors' ? 'prospectScore' : 'stageStanding')
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', '100')
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Backstop Card Finder Oracle identity refresh',
    },
  })
  if (!response.ok) throw new Error(`Baseball Oracle ${stage} page ${page} failed: ${response.status} ${response.statusText}`)
  return assertOraclePage(await response.json(), `Baseball Oracle ${stage} page ${page}`)
}

async function fetchOracleStage(stage) {
  const first = await fetchOraclePage(stage, 1)
  const pages = [first]
  for (let start = 2; start <= first.page.totalPages; start += 10) {
    const pageNumbers = Array.from(
      { length: Math.min(10, first.page.totalPages - start + 1) },
      (_, index) => start + index,
    )
    pages.push(...await Promise.all(pageNumbers.map((page) => fetchOraclePage(stage, page))))
  }
  const snapshotIds = new Set(pages.map((page) => page.snapshot.id))
  if (snapshotIds.size !== 1) throw new Error(`Baseball Oracle refreshed while ${stage} pages were loading`)
  const items = pages.flatMap((page) => page.items)
  if (items.length !== first.page.total) {
    throw new Error(`Baseball Oracle ${stage} expected ${first.page.total} players but loaded ${items.length}`)
  }
  if (new Set(items.map((item) => item.player?.id)).size !== items.length) {
    throw new Error(`Baseball Oracle ${stage} returned duplicate player identities`)
  }
  return { first, items }
}

async function fetchOracleProspectCensus() {
  const [minors, rookies] = await Promise.all([fetchOracleStage('Minors'), fetchOracleStage('RC')])
  if (minors.first.snapshot.id !== rookies.first.snapshot.id) {
    throw new Error('Baseball Oracle prospect and Rookie Track pages came from different snapshots')
  }
  if (minors.first.meta?.prospectCoverage?.census?.status !== 'complete') {
    throw new Error('Baseball Oracle prospect census is incomplete')
  }
  return {
    snapshot: minors.first.snapshot,
    items: [...minors.items, ...rookies.items],
    coverage: minors.first.meta.prospectCoverage,
  }
}

function resolveOracleCandidate(candidate, priorPlayerId, seedPlayerId, byPlayerId, byName) {
  const prior = byPlayerId.get(priorPlayerId)
  if (prior) {
    if (normalizePlayerName(prior.player?.name) === candidate.checklistKey) return { item: prior, method: 'prior_player_id' }
    return { item: null, method: null, reason: 'prior_identity_name_conflict' }
  }
  const seeded = byPlayerId.get(seedPlayerId)
  if (seeded) {
    if (normalizePlayerName(seeded.player?.name) === candidate.checklistKey) return { item: seeded, method: 'verified_checklist_seed' }
    return { item: null, method: null, reason: 'checklist_seed_name_conflict' }
  }

  const matches = byName.get(candidate.checklistKey) ?? []
  const teamCodes = new Set(candidate.teams.map(normalizeTeamCode).filter(Boolean))
  if (matches.length === 1) {
    const item = matches[0]
    const organizationCode = normalizeTeamCode(item.classification?.organizationCode)
    if (teamCodes.size > 0 && organizationCode && !teamCodes.has(organizationCode)) {
      return { item: null, method: null, reason: 'unique_name_team_conflict' }
    }
    return { item, method: teamCodes.size > 0 ? 'checklist_name_and_team' : 'unique_checklist_name' }
  }
  const teamMatches = matches.filter((item) => teamCodes.has(normalizeTeamCode(item.classification?.organizationCode)))
  if (teamMatches.length === 1) return { item: teamMatches[0], method: 'checklist_name_and_team' }
  return {
    item: null,
    method: null,
    reason: matches.length === 0 ? 'missing_from_oracle_prospect_census' : 'ambiguous_oracle_identity',
  }
}

function oracleCsv(identities, snapshot) {
  const headers = [
    'Source', '#', 'Checklist Key', 'Checklist Name', 'Checklist Team', 'Match Method',
    'Oracle Player Id', 'MLBAM Id', 'Oracle Name', 'Oracle Route', 'Ranking Role',
    'Rank Label', 'Rank Availability', 'Rank Universe', 'Rank Target', 'Rank As Of',
    'Rank Model Version', 'Evidence Tier', 'Volatility', 'Reason Codes', 'Career Outlook',
    'Career Outlook Band', 'Career Outlook Basis', 'Career Outlook As Of',
    'Career Outlook Model Version', 'Age', 'Level', 'Team', 'Pos', 'Record Version',
    'Snapshot Id', 'Schema Version', 'Contract Version', 'Updated',
  ]
  const rows = identities.map(({ candidate, item, method }) => {
    const stageRank = item.signals.stageRank
    const careerOutlook = item.signals.careerOutlook
    return [
      'Baseball Oracle Player Signals', stageRank.rank ?? '', candidate.checklistKey,
      candidate.checklistName, candidate.teams.join(' | '), method, item.player.id,
      item.player.externalIds?.mlbam ?? '', item.player.name, item.classification.route,
      item.classification.rankingRole, stageRank.label, stageRank.availability,
      stageRank.universe ?? '', stageRank.targetId ?? '', stageRank.asOf ?? '',
      stageRank.modelVersion ?? '', stageRank.evidenceTier ?? '', stageRank.volatility ?? '',
      (stageRank.reasonCodes ?? []).join(' | '), careerOutlook.value ?? '',
      careerOutlook.band?.label ?? '', careerOutlook.basis ?? '', careerOutlook.asOf ?? '',
      careerOutlook.modelVersion ?? '', item.classification.age ?? '',
      item.classification.currentLevel ?? '', item.classification.organizationCode ?? '',
      item.classification.position ?? '', item.recordVersion, snapshot.id,
      ORACLE_SCHEMA_VERSION, ORACLE_CONTRACT_VERSION, snapshot.dataAsOf ?? '',
    ]
  }).sort((left, right) => (
    (parseNumber(left[1]) ?? Number.POSITIVE_INFINITY) - (parseNumber(right[1]) ?? Number.POSITIVE_INFINITY) ||
    String(left[3]).localeCompare(String(right[3]))
  ))
  return `${headers.map(csvCell).join(',')}\n${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`
}

async function refreshOracleBowmanSnapshot(root) {
  const target = resolve(root, ORACLE_OUTPUT)
  const priorIdentities = previousOracleIdentities(target)
  const candidates = await checklistCandidates(root, priorIdentities)
  const seeds = checklistProjectIdentitySeeds(root)
  const census = await fetchOracleProspectCensus()
  const byPlayerId = new Map(census.items.map((item) => [item.player.id, item]))
  const byName = new Map()
  for (const item of census.items) {
    const key = normalizePlayerName(item.player.name)
    const matches = byName.get(key) ?? []
    matches.push(item)
    byName.set(key, matches)
  }

  const identities = []
  const unresolved = []
  for (const candidate of candidates) {
    const resolved = resolveOracleCandidate(
      candidate,
      priorIdentities.get(candidate.checklistKey),
      seeds.get(candidate.checklistKey),
      byPlayerId,
      byName,
    )
    if (resolved.item) identities.push({ candidate, item: resolved.item, method: resolved.method })
    else unresolved.push({
      checklistKey: candidate.checklistKey,
      checklistName: candidate.checklistName,
      checklistTeams: candidate.teams,
      reason: resolved.reason,
      candidates: (byName.get(candidate.checklistKey) ?? []).map((item) => ({
        playerId: item.player.id,
        name: item.player.name,
        organizationCode: item.classification.organizationCode,
      })),
    })
  }
  if (new Set(identities.map(({ candidate }) => candidate.checklistKey)).size !== identities.length) {
    throw new Error('Baseball Oracle refresh resolved duplicate checklist identities')
  }

  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, oracleCsv(identities, census.snapshot), 'utf8')
  const auditTarget = resolve(root, 'local-data/rankings/baseball-oracle-match-audit.json')
  await mkdir(dirname(auditTarget), { recursive: true })
  await writeFile(auditTarget, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    schemaVersion: ORACLE_SCHEMA_VERSION,
    contractVersion: ORACLE_CONTRACT_VERSION,
    snapshot: census.snapshot,
    coverage: census.coverage,
    checklistPlayers: candidates.length,
    matched: identities.length,
    unresolved: unresolved.length,
    unresolvedPlayers: unresolved,
  }, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${ORACLE_OUTPUT} (${identities.length.toLocaleString()} exact Bowman identities, ${unresolved.length.toLocaleString()} unresolved, snapshot ${census.snapshot.id})`)
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

  for (const output of OUTPUTS) {
    const consensus = await fetchConsensus(output.type)
    const csv = toCsv({ population: output.population, ...consensus })
    const target = resolve(root, output.file)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, csv, 'utf8')
    console.log(`Wrote ${output.file} (${consensus.players.length.toLocaleString()} ${output.population}s, updated ${consensus.updated})`)
  }

  const oopsyPeak = await fetchOopsyPeakMlb()
  const oopsyTarget = resolve(root, 'src/data/sts_oopsy_peak_mlb.csv')
  await mkdir(dirname(oopsyTarget), { recursive: true })
  await writeFile(oopsyTarget, toOopsyPeakMlbCsv(oopsyPeak), 'utf8')
  console.log(`Wrote src/data/sts_oopsy_peak_mlb.csv (${oopsyPeak.players.length.toLocaleString()} MLB players, updated ${oopsyPeak.updated})`)

  await refreshOracleBowmanSnapshot(root)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
