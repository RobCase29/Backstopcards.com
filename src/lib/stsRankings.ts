import stsLeaderboardCsv from '../data/sts_leaderboard_combined_2026-06-21.csv?raw'

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
}

function parseNumber(value: string | undefined) {
  if (!value) return null
  const cleaned = value.replace(/[$,%\s,]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
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

const STS_PLAYER_ALIASES: Array<[string, string]> = [
  ['Cam Schlittler', 'Cameron Schlittler'],
]

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

export function parseStsCsv(input: string) {
  const rows = parseCsvRows(input)
  const headers = rows[0] ?? []
  const headerIndex = new Map(headers.map((header, index) => [header.trim(), index]))

  function cell(row: string[], header: string) {
    return row[headerIndex.get(header) ?? -1]?.trim() ?? ''
  }

  return rows.slice(1).flatMap<StsRanking>((row) => {
    const name = cell(row, 'Name')
    if (!name) return []

    return [
      {
        name,
        normalizedName: normalizeStsPlayerName(name),
        team: cell(row, 'Team'),
        pos: cell(row, 'Pos'),
        age: parseNumber(cell(row, 'Age')),
        level: cell(row, 'Level'),
        rank: parseNumber(cell(row, 'Rank')),
        prospectRank: parseNumber(cell(row, 'Prospect Rank')),
        change3d: parseNumber(cell(row, '3 Day Change')),
        change7d: parseNumber(cell(row, '7 Day Change')),
        change14d: parseNumber(cell(row, '14 Day Change')),
        change30d: parseNumber(cell(row, '30 Day Change')),
        war: parseNumber(cell(row, 'WAR')),
        summary: cell(row, 'Summary'),
      },
    ]
  })
}

const leaderboard = parseStsCsv(stsLeaderboardCsv)
const leaderboardByName = new Map<string, StsRanking>()
const maxRank = Math.max(1, ...leaderboard.map((ranking) => ranking.rank ?? 0))
const maxProspectRank = Math.max(1, ...leaderboard.map((ranking) => ranking.prospectRank ?? 0))

for (const ranking of leaderboard) {
  const existing = leaderboardByName.get(ranking.normalizedName)
  const existingRank = existing?.rank ?? Number.POSITIVE_INFINITY
  const currentRank = ranking.rank ?? Number.POSITIVE_INFINITY
  if (!existing || currentRank < existingRank) {
    leaderboardByName.set(ranking.normalizedName, ranking)
  }
}

for (const [alias, officialName] of STS_PLAYER_ALIASES) {
  const officialRanking = leaderboardByName.get(normalizeStsPlayerName(officialName))
  if (officialRanking) leaderboardByName.set(normalizeStsPlayerName(alias), officialRanking)
}

function rankScore(rank: number | null, max: number) {
  if (!rank || rank <= 0 || max <= 1) return null
  return Math.max(0, Math.min(100, 100 * (1 - Math.log(rank) / Math.log(max + 1))))
}

export function scoreStsRanking(ranking: StsRanking) {
  const overallScore = rankScore(ranking.rank, maxRank) ?? 0
  const prospectScore = rankScore(ranking.prospectRank, maxProspectRank) ?? 0
  const prospectWeight = ranking.level.toUpperCase() === 'MLB' ? 0.9 : 1
  return Number(Math.max(overallScore, prospectScore * prospectWeight).toFixed(1))
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

  return Number(Math.max(0, Math.min(100, 50 + weighted * 50)).toFixed(1))
}

export function scoreStsRiserValue(ranking: StsRanking, basePrice: number) {
  const dynastyScore = scoreStsRanking(ranking)
  const momentumScore = scoreStsMomentum(ranking)
  const positiveMomentum = Math.max(0, momentumScore - 50)
  const priceDrag = Math.log10(Math.max(10, basePrice)) * 13
  const prospectBoost = ranking.prospectRank ? 5 : 0
  return Number(Math.max(0, dynastyScore + positiveMomentum * 0.85 + prospectBoost - priceDrag).toFixed(1))
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
  return Number(Math.max(0, dynastyScore * 0.72 + trendScore + priceSweetSpot + investablePrice + prospectBoost).toFixed(1))
}

export function findStsRanking(playerName: string) {
  return leaderboardByName.get(normalizeStsPlayerName(playerName)) ?? null
}

export function getStsLeaderboard() {
  return leaderboard
}
