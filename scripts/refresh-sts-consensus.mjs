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
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
