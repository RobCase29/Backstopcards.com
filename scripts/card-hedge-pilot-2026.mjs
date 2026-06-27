import { spawnSync } from 'node:child_process'

const DEFAULT_PLAYERS = ['Aiva Arquette', 'Dillon Lewis', 'Eli Willits', 'Seth Hernandez', 'Seong-Jun Kim']

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

function listArg(name, fallback) {
  return compact(argValue(name, ''))
    .split(',')
    .map(compact)
    .filter(Boolean)
    .concat([])
    .length
    ? compact(argValue(name, ''))
        .split(',')
        .map(compact)
        .filter(Boolean)
    : fallback
}

const players = listArg('--players', DEFAULT_PLAYERS)
const year = Number(argValue('--year', '2026')) || 2026
const grades = compact(argValue('--grades', 'Raw')) || 'Raw'
const compScope = compact(argValue('--comp-scope', 'market-signals')).toLowerCase() === 'all' ? 'all' : 'market-signals'
const count = Math.min(100, Math.max(1, Number(argValue('--count', '100')) || 100))
const maxCards = Math.max(1, Number(argValue('--max-cards', '120')) || 120)
const rpm = Math.min(500, Math.max(1, Number(argValue('--rpm', process.env.CARD_HEDGE_RATE_LIMIT_PER_MINUTE ?? '80')) || 80))
const dryRun = hasFlag('--dry-run')
const reclassifyOnly = hasFlag('--reclassify-only')

console.log(
  JSON.stringify(
    {
      action: dryRun ? 'card-hedge-pilot-dry-run' : 'card-hedge-pilot',
      players,
      year,
      grades,
      compScope,
      count,
      maxCards,
      rpm,
      reclassifyOnly,
    },
    null,
    2,
  ),
)

for (const player of players) {
  const args = [
    'scripts/card-hedge-player-sync.mjs',
    '--player',
    player,
    '--year',
    String(year),
    '--grades',
    grades,
    '--comp-scope',
    compScope,
    '--count',
    String(count),
    '--max-cards',
    String(maxCards),
    '--rpm',
    String(rpm),
  ]
  if (reclassifyOnly) args.push('--reclassify-only')
  console.log(`\n${process.execPath} ${args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(' ')}`)
  if (dryRun) continue
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    break
  }
}
