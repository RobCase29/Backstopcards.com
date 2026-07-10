export type StsRankingSource = 'formulated-consensus' | 'legacy-leaderboard' | 'oopsy-peak-mlb'
export type StsPopulation = 'hitter' | 'pitcher' | 'legacy' | 'mlb'

export interface StsRanking {
  name: string
  normalizedName: string
  team: string
  pos: string
  age: number | null
  level: string
  rank: number | null
  prospectRank: number | null
  change3d: number | null
  change7d: number | null
  change14d: number | null
  change30d: number | null
  war: number | null
  summary: string
  source: StsRankingSource
  population: StsPopulation
  populationRank: number | null
  avgRank: number | null
  sortAvgRank: number | null
  coverage: number
  lowCoverage: boolean
  sourceRanks: Record<string, number | null>
  updated: string
}

const CONSENSUS_SOURCE_COLUMNS = [
  'BaGS',
  'FScore',
  'PG+',
  'PLFR',
  'OOPSY Peak',
  'PARS',
  'P.Tilt',
  'Colossus',
] as const

const STS_PLAYER_ALIASES: Array<[string, string]> = [
  ['Cam Schlittler', 'Cameron Schlittler'],
]

function parseNumber(value: string | undefined | null) {
  if (!value) return null
  const cleaned = value.replace(/[$,%\s,]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

export function normalizeStsPlayerName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseCsvRows(input: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  function pushField() {
    row.push(field)
    field = ''
  }

  function pushRow() {
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

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      pushField()
    } else if (char === '\n') {
      pushRow()
    } else if (char === '\r') {
      if (input[index + 1] === '\n') index += 1
      pushRow()
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) pushRow()
  return rows
}

function average(values: number[]) {
  if (!values.length) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function formatRank(value: number) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1)
}

function consensusSummary(ranking: Pick<StsRanking, 'avgRank' | 'sortAvgRank' | 'coverage' | 'lowCoverage' | 'sourceRanks'>) {
  const rankedSources = CONSENSUS_SOURCE_COLUMNS.flatMap((label) => {
    const value = ranking.sourceRanks[label]
    return value === null || value === undefined ? [] : `${label} #${formatRank(value)}`
  })

  const sourceText = `${ranking.coverage} source${ranking.coverage === 1 ? '' : 's'}`
  const averageText =
    ranking.avgRank !== null
      ? `Consensus avg ${ranking.avgRank.toFixed(1)} across ${sourceText}`
      : ranking.sortAvgRank !== null
        ? `Low-coverage partial avg ${ranking.sortAvgRank.toFixed(1)} across ${sourceText}`
        : `Low-coverage row across ${sourceText}`

  return [averageText, rankedSources.length ? rankedSources.join(', ') : null, ranking.lowCoverage ? 'Treat as early-signal context.' : null]
    .filter(Boolean)
    .join(' | ')
}

function parseConsensusCsv(rows: string[][], headers: string[]) {
  const headerIndex = new Map(headers.map((header, index) => [header.trim(), index]))

  function cell(row: string[], header: string) {
    return row[headerIndex.get(header) ?? -1]?.trim() ?? ''
  }

  return rows.slice(1).flatMap<StsRanking>((row) => {
    const name = cell(row, 'Name')
    if (!name) return []

    const sourceRanks = Object.fromEntries(
      CONSENSUS_SOURCE_COLUMNS.map((label) => [label, parseNumber(cell(row, label))]),
    ) as Record<string, number | null>
    const sourceRankValues = Object.values(sourceRanks).filter((value): value is number => value !== null)
    const avgRank = parseNumber(cell(row, 'Avg Rank'))
    const sortAvgRank = avgRank ?? average(sourceRankValues)
    const coverage = parseNumber(cell(row, 'Coverage')) ?? sourceRankValues.length
    const lowCoverage = coverage > 0 && (coverage < 3 || avgRank === null)
    const population = cell(row, 'Population') === 'pitcher' ? 'pitcher' : 'hitter'
    const ranking: StsRanking = {
      name,
      normalizedName: normalizeStsPlayerName(name),
      team: cell(row, 'Team'),
      pos: cell(row, 'Pos'),
      age: parseNumber(cell(row, 'Age')),
      level: cell(row, 'Level'),
      rank: null,
      prospectRank: null,
      change3d: null,
      change7d: null,
      change14d: null,
      change30d: null,
      war: null,
      summary: '',
      source: 'formulated-consensus',
      population,
      populationRank: parseNumber(cell(row, '#')),
      avgRank,
      sortAvgRank,
      coverage,
      lowCoverage,
      sourceRanks,
      updated: cell(row, 'Updated'),
    }
    return [{ ...ranking, summary: consensusSummary(ranking) }]
  })
}

function parseLegacyCsv(rows: string[][], headers: string[]) {
  const headerIndex = new Map(headers.map((header, index) => [header.trim(), index]))

  function cell(row: string[], header: string) {
    return row[headerIndex.get(header) ?? -1]?.trim() ?? ''
  }

  return rows.slice(1).flatMap<StsRanking>((row) => {
    const name = cell(row, 'Name')
    if (!name) return []

    const rank = parseNumber(cell(row, 'Rank'))
    return [
      {
        name,
        normalizedName: normalizeStsPlayerName(name),
        team: cell(row, 'Team'),
        pos: cell(row, 'Pos'),
        age: parseNumber(cell(row, 'Age')),
        level: cell(row, 'Level'),
        rank,
        prospectRank: parseNumber(cell(row, 'Prospect Rank')),
        change3d: parseNumber(cell(row, '3 Day Change')),
        change7d: parseNumber(cell(row, '7 Day Change')),
        change14d: parseNumber(cell(row, '14 Day Change')),
        change30d: parseNumber(cell(row, '30 Day Change')),
        war: parseNumber(cell(row, 'WAR')),
        summary: cell(row, 'Summary'),
        source: 'legacy-leaderboard',
        population: 'legacy',
        populationRank: rank,
        avgRank: null,
        sortAvgRank: null,
        coverage: 0,
        lowCoverage: false,
        sourceRanks: {},
        updated: '',
      },
    ]
  })
}

function parseOopsyPeakMlbCsv(rows: string[][], headers: string[]) {
  const headerIndex = new Map(headers.map((header, index) => [header.trim(), index]))

  function cell(row: string[], header: string) {
    return row[headerIndex.get(header) ?? -1]?.trim() ?? ''
  }

  return rows.slice(1).flatMap<StsRanking>((row) => {
    const name = cell(row, 'Name')
    if (!name) return []

    const rank = parseNumber(cell(row, 'Rank'))
    return [
      {
        name,
        normalizedName: normalizeStsPlayerName(name),
        team: cell(row, 'Team'),
        pos: cell(row, 'Pos'),
        age: parseNumber(cell(row, 'Age')),
        level: cell(row, 'Level') || 'MLB',
        rank,
        // Keep the MLB feed as a dynasty-only fallback; prospect rank authority comes from consensus.
        prospectRank: null,
        change3d: parseNumber(cell(row, '3 Day Change')),
        change7d: parseNumber(cell(row, '7 Day Change')),
        change14d: parseNumber(cell(row, '14 Day Change')),
        change30d: parseNumber(cell(row, '30 Day Change')),
        war: parseNumber(cell(row, 'WAR')),
        summary: cell(row, 'Summary'),
        source: 'oopsy-peak-mlb',
        population: 'mlb',
        populationRank: parseNumber(cell(row, '#')) ?? rank,
        avgRank: null,
        sortAvgRank: rank,
        coverage: 0,
        lowCoverage: false,
        sourceRanks: {},
        updated: cell(row, 'Updated'),
      },
    ]
  })
}

export function parseStsCsv(input: string) {
  const rows = parseCsvRows(input)
  const headers = rows[0] ?? []
  if (headers.includes('Avg Rank') && headers.includes('Coverage')) return parseConsensusCsv(rows, headers)
  if (headers.includes('Source') && headers.includes('PlayerId') && headers.includes('Rank')) return parseOopsyPeakMlbCsv(rows, headers)
  return parseLegacyCsv(rows, headers)
}

function compareConsensusRows(left: StsRanking, right: StsRanking) {
  const leftRank = left.sortAvgRank ?? Number.POSITIVE_INFINITY
  const rightRank = right.sortAvgRank ?? Number.POSITIVE_INFINITY
  return (
    leftRank - rightRank ||
    Number(left.lowCoverage) - Number(right.lowCoverage) ||
    right.coverage - left.coverage ||
    left.name.localeCompare(right.name)
  )
}

function isProspectLevel(level: string) {
  const normalized = level.toUpperCase()
  return normalized !== 'MLB'
}

function isMlbLevel(level: string) {
  return level.toUpperCase() === 'MLB'
}

function assignCombinedRanks(rows: StsRanking[]) {
  const consensusRows = rows.filter((row) => row.source === 'formulated-consensus').sort(compareConsensusRows)
  if (!consensusRows.length) return rows

  const rankByRow = new Map<StsRanking, { rank: number; prospectRank: number | null }>()
  let prospectRank = 0

  consensusRows.forEach((row, index) => {
    const nextProspectRank = isProspectLevel(row.level) ? (prospectRank += 1) : null
    rankByRow.set(row, { rank: index + 1, prospectRank: nextProspectRank })
  })

  return rows.map((row) => {
    const assigned = rankByRow.get(row)
    return assigned ? { ...row, rank: assigned.rank, prospectRank: assigned.prospectRank } : row
  })
}

function betterRanking(left: StsRanking | undefined, right: StsRanking) {
  if (!left) return right
  const leftPriority = rankingPrecedence(left)
  const rightPriority = rankingPrecedence(right)
  if (rightPriority > leftPriority) return right
  if (rightPriority < leftPriority) return left
  const leftRank = left.rank ?? Number.POSITIVE_INFINITY
  const rightRank = right.rank ?? Number.POSITIVE_INFINITY
  if (rightRank < leftRank) return right
  if (rightRank === leftRank && right.coverage > left.coverage) return right
  return left
}

function rankingPrecedence(ranking: StsRanking) {
  if (ranking.prospectRank !== null) return 4
  if (ranking.source === 'oopsy-peak-mlb' && isMlbLevel(ranking.level) && ranking.rank !== null) return 3
  if (ranking.source === 'formulated-consensus' && ranking.rank !== null) return 2
  if (ranking.rank !== null) return 1
  return 0
}

function buildLeaderboard(csvInputs: string[]) {
  const rows = assignCombinedRanks(csvInputs.flatMap(parseStsCsv))
  const byName = new Map<string, StsRanking>()

  for (const ranking of rows) {
    byName.set(ranking.normalizedName, betterRanking(byName.get(ranking.normalizedName), ranking))
  }

  for (const [alias, officialName] of STS_PLAYER_ALIASES) {
    const officialRanking = byName.get(normalizeStsPlayerName(officialName))
    if (officialRanking) byName.set(normalizeStsPlayerName(alias), officialRanking)
  }

  return { rows, byName }
}

type LeaderboardState = {
  rows: StsRanking[]
  byName: Map<string, StsRanking>
  maxRank: number
  maxProspectRank: number
}

let cachedLeaderboard: LeaderboardState | null = null
let activeCsvInputs: string[] = []

export function hydrateStsLeaderboard(csvInputs: string[]) {
  const validInputs = csvInputs.filter((input) => input.trim())
  if (validInputs.length < 2) return false
  activeCsvInputs = validInputs
  cachedLeaderboard = null
  leaderboardState()
  return true
}

function leaderboardState() {
  if (cachedLeaderboard) return cachedLeaderboard
  const { rows, byName } = buildLeaderboard(activeCsvInputs)
  cachedLeaderboard = {
    rows,
    byName,
    maxRank: Math.max(1, ...rows.map((ranking) => ranking.rank ?? 0)),
    maxProspectRank: Math.max(1, ...rows.map((ranking) => ranking.prospectRank ?? 0)),
  }
  return cachedLeaderboard
}

function rankScore(rank: number | null, max: number) {
  if (!rank || rank <= 0 || max <= 1) return null
  return clamp(100 * (1 - Math.log(rank) / Math.log(max + 1)))
}

function coverageAdjustment(ranking: StsRanking) {
  if (ranking.source !== 'formulated-consensus') return 1
  if (ranking.lowCoverage) return 0.84 + Math.min(ranking.coverage, 2) * 0.04
  return 0.96 + clamp(ranking.coverage / 7, 0, 1) * 0.04
}

export function isStsMlbDynastyFallback(ranking: Pick<StsRanking, 'level' | 'prospectRank' | 'rank'>) {
  return ranking.prospectRank === null && ranking.rank !== null && isMlbLevel(ranking.level)
}

export function primaryStsRank(ranking: Pick<StsRanking, 'rank' | 'prospectRank'>) {
  return ranking.prospectRank ?? ranking.rank
}

export function primaryStsRankLabel(ranking: Pick<StsRanking, 'level' | 'rank' | 'prospectRank'>) {
  if (ranking.prospectRank !== null) return `Prospect #${ranking.prospectRank.toLocaleString()}`
  if (isStsMlbDynastyFallback(ranking)) return `MLB dynasty #${ranking.rank?.toLocaleString()}`
  if (ranking.rank !== null) return `Rank #${ranking.rank.toLocaleString()}`
  return null
}

export function scoreStsRanking(ranking: StsRanking) {
  const { maxRank, maxProspectRank } = leaderboardState()
  const overallScore = rankScore(ranking.rank, maxRank) ?? 0
  const prospectScore = rankScore(ranking.prospectRank, maxProspectRank) ?? 0
  const prospectWeight = isMlbLevel(ranking.level) ? 0.9 : 1
  const rawScore = Math.max(overallScore, prospectScore * prospectWeight)
  return Number((rawScore * coverageAdjustment(ranking)).toFixed(1))
}

function signedLogScore(value: number | null, cap: number) {
  if (!value) return 0
  const sign = value > 0 ? 1 : -1
  return sign * (Math.log1p(Math.min(Math.abs(value), cap)) / Math.log1p(cap))
}

export function scoreStsMomentum(ranking: StsRanking) {
  const weighted =
    signedLogScore(ranking.change3d, 90) * 0.36 +
    signedLogScore(ranking.change7d, 180) * 0.28 +
    signedLogScore(ranking.change14d, 360) * 0.2 +
    signedLogScore(ranking.change30d, 900) * 0.16

  return Number(clamp(50 + weighted * 50).toFixed(1))
}

export function scoreStsRiserValue(ranking: StsRanking, basePrice: number) {
  const dynastyScore = scoreStsRanking(ranking)
  const momentumScore = scoreStsMomentum(ranking)
  const positiveMomentum = Math.max(0, momentumScore - 50)
  const priceDrag = Math.log10(Math.max(10, basePrice)) * 13
  const prospectBoost = ranking.prospectRank ? 5 : 0
  const coverageBoost = ranking.source === 'formulated-consensus' ? clamp(ranking.coverage, 0, 7) * 0.55 : 0
  const lowCoverageDiscovery = ranking.lowCoverage ? 3 : 0
  return Number(Math.max(0, dynastyScore + positiveMomentum * 0.85 + prospectBoost + coverageBoost + lowCoverageDiscovery - priceDrag).toFixed(1))
}

export function scoreStsBinTarget(ranking: StsRanking, basePrice: number) {
  const dynastyScore = scoreStsRanking(ranking)
  const momentumScore = scoreStsMomentum(ranking)
  const positiveMomentum = Math.max(0, momentumScore - 50)
  const base = Math.max(1, basePrice)
  const priceSweetSpot = Math.exp(-((Math.log(base / 65) / Math.log(2.7)) ** 2)) * 24
  const investablePrice = Math.min(14, Math.log10(Math.max(10, base)) * 8)
  const prospectBoost = ranking.prospectRank ? 8 : 0
  const trendScore = positiveMomentum * 0.72
  const coverageBoost = ranking.source === 'formulated-consensus' ? clamp(ranking.coverage, 0, 7) * 0.65 : 0
  const lowCoverageDiscovery = ranking.lowCoverage ? 4 : 0
  return Number(Math.max(0, dynastyScore * 0.72 + trendScore + priceSweetSpot + investablePrice + prospectBoost + coverageBoost + lowCoverageDiscovery).toFixed(1))
}

export function findStsRanking(playerName: string) {
  return leaderboardState().byName.get(normalizeStsPlayerName(playerName)) ?? null
}

export function getStsLeaderboard() {
  return leaderboardState().rows
}
