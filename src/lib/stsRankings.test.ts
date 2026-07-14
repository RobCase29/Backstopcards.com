import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  findStsRanking,
  hydrateStsLeaderboard,
  normalizeStsPlayerName,
  parseStsCsv,
  primaryStsRankLabel,
  scoreStsBinTarget,
  scoreStsMomentum,
  scoreStsRanking,
  scoreStsRiserValue,
} from './stsRankings'
import { STS_FALLBACK_CSV_INPUTS } from './stsFallback'

beforeAll(() => {
  hydrateStsLeaderboard(STS_FALLBACK_CSV_INPUTS)
})

afterEach(() => {
  hydrateStsLeaderboard(STS_FALLBACK_CSV_INPUTS)
})

const ORACLE_HEADERS = [
  'Source',
  '#',
  'Checklist Key',
  'Checklist Name',
  'Checklist Team',
  'Match Method',
  'Oracle Player Id',
  'MLBAM Id',
  'Oracle Name',
  'Oracle Route',
  'Ranking Role',
  'Rank Label',
  'Rank Availability',
  'Rank Universe',
  'Rank Target',
  'Rank As Of',
  'Rank Model Version',
  'Evidence Tier',
  'Volatility',
  'Reason Codes',
  'Career Outlook',
  'Career Outlook Band',
  'Career Outlook Basis',
  'Career Outlook As Of',
  'Career Outlook Model Version',
  'Age',
  'Level',
  'Team',
  'Pos',
  'Record Version',
  'Snapshot Id',
  'Schema Version',
  'Contract Version',
  'Updated',
] as const

type OracleCsvOverride = Partial<Record<(typeof ORACLE_HEADERS)[number], string | number | null>>

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function oracleCsv(...overrides: OracleCsvOverride[]) {
  const rows = overrides.map((override, index) => {
    const name = String(override['Checklist Name'] ?? `Oracle Prospect ${index + 1}`)
    const values: Record<(typeof ORACLE_HEADERS)[number], string | number | null> = {
      Source: 'Baseball Oracle Player Signals',
      '#': index + 10,
      'Checklist Key': normalizeStsPlayerName(name),
      'Checklist Name': name,
      'Checklist Team': 'Miami Marlins',
      'Match Method': 'checklist_name_and_team',
      'Oracle Player Id': `oracle:test:${index + 1}`,
      'MLBAM Id': `90000${index + 1}`,
      'Oracle Name': name,
      'Oracle Route': 'milb',
      'Ranking Role': 'hitter',
      'Rank Label': 'Prospect Rank',
      'Rank Availability': 'available',
      'Rank Universe': 6_490,
      'Rank Target': 'mlb_war_next_5_ge_5',
      'Rank As Of': '2025-12-31T00:00:00.000Z',
      'Rank Model Version': 'milb-impact-five-calendar-year-war-v1',
      'Evidence Tier': 'completed_season_full_model',
      Volatility: 'standard',
      'Reason Codes': '',
      'Career Outlook': 72,
      'Career Outlook Band': 'MLB contributor',
      'Career Outlook Basis': 'conditional_on_mlb_arrival',
      'Career Outlook As Of': '2025-12-31T00:00:00.000Z',
      'Career Outlook Model Version': 'career-model-v1',
      Age: 20,
      Level: 'AA',
      Team: 'MIA',
      Pos: 'SS',
      'Record Version': `record-${index + 1}`,
      'Snapshot Id': 'snapshot-test-1',
      'Schema Version': 'player-signals.v1',
      'Contract Version': 'player-signals-contract/v1',
      Updated: '2026-07-14T14:14:34.796Z',
      ...override,
    }
    return ORACLE_HEADERS.map((header) => csvCell(values[header])).join(',')
  })
  return [ORACLE_HEADERS.join(','), ...rows].join('\n')
}

describe('consensus rankings', () => {
  it('still parses quoted legacy rows without splitting records', () => {
    const rows = parseStsCsv(
      [
        'Name,Team,Pos,Age,Level,Rank,Prospect Rank,3 Day Change,7 Day Change,14 Day Change,30 Day Change,WAR,Summary',
        '"Rising Prospect","MIA","SS","20","AA","120","20","5","15","42","88","3.1","line one',
        'line two"',
        '"Falling Prospect","BOS","CF","22","AAA","220","90","-2","-9","-24","-60","1.2","single line"',
      ].join('\n'),
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      name: 'Rising Prospect',
      change30d: 88,
      source: 'legacy-leaderboard',
      summary: 'line one\nline two',
    })
    expect(rows[1]).toMatchObject({
      name: 'Falling Prospect',
      change14d: -24,
    })
  })

  it('parses formulated consensus rows with source coverage and low-coverage context', () => {
    const rows = parseStsCsv(
      [
        'Population,#,FgId,Name,Age,Level,Team,Pos,Avg Rank,Coverage,In Sts,BaGS,FScore,PG+,PLFR,OOPSY Peak,PARS,P.Tilt,Colossus,Updated',
        'hitter,1,sa1,Consensus Star,18,A+,WSN,SS,7.57143,7,1,1,22,1,1,1,15,12,,2026-06-23 18:43:21',
        'hitter,2,sa2,Low Coverage Pop,22,AAA,PHI,SS,,2,1,,2.5,,,22,,,,2026-06-23 18:43:21',
      ].join('\n'),
    )

    expect(rows[0]).toMatchObject({
      name: 'Consensus Star',
      population: 'hitter',
      populationRank: 1,
      avgRank: 7.57143,
      sortAvgRank: 7.57143,
      coverage: 7,
      lowCoverage: false,
      source: 'formulated-consensus',
    })
    expect(rows[0].sourceRanks).toMatchObject({ BaGS: 1, FScore: 22, 'OOPSY Peak': 1 })
    expect(rows[1]).toMatchObject({
      name: 'Low Coverage Pop',
      avgRank: null,
      sortAvgRank: 12.25,
      coverage: 2,
      lowCoverage: true,
    })
    expect(rows[1].summary).toContain('Low-coverage partial avg 12.3')
  })

  it('parses OOPSY Peak MLB rows as dynasty fallback rankings', () => {
    const [ranking] = parseStsCsv(
      [
        'Source,#,PlayerId,Name,Age,Level,Team,Pos,Rank,Prospect Rank,1 Day Change,3 Day Change,7 Day Change,14 Day Change,30 Day Change,WAR,Summary,Updated',
        '"OOPSY Peak MLB","1","19755","Shohei Ohtani","31","MLB","LAD","DH, SP","1","","0","0","0","0","-1","10.7","two-way monster","2026-06-26T19:18:21.440Z"',
      ].join('\n'),
    )

    expect(ranking).toMatchObject({
      name: 'Shohei Ohtani',
      source: 'oopsy-peak-mlb',
      population: 'mlb',
      rank: 1,
      prospectRank: null,
      change30d: -1,
      war: 10.7,
    })
    expect(primaryStsRankLabel(ranking!)).toBe('MLB dynasty #1')
  })

  it('parses Baseball Oracle rank, Career Outlook, and provider lineage without renumbering it', () => {
    const [ranking] = parseStsCsv(
      oracleCsv({
        '#': 27,
        'Checklist Name': 'Edward Florentino',
        'Oracle Player Id': 'oracle:edward-florentino',
        'MLBAM Id': '812345',
        'Oracle Name': 'Edward Florentino',
        'Rank Universe': 6_490,
        'Career Outlook': 78.4,
        'Career Outlook Band': 'Impact regular',
        'Record Version': 'record-edward',
        'Snapshot Id': 'snapshot-oracle-a',
        'Match Method': 'verified_checklist_seed',
      }),
    )

    expect(ranking).toMatchObject({
      source: 'baseball-oracle',
      population: 'oracle',
      prospectRank: 27,
      oracleStageRank: 27,
      oracleRankUniverse: 6_490,
      oracleCareerOutlook: 78.4,
      oracleCareerOutlookBand: 'Impact regular',
      oraclePlayerId: 'oracle:edward-florentino',
      oracleMlbamId: '812345',
      oracleRecordVersion: 'record-edward',
      oracleSnapshotId: 'snapshot-oracle-a',
      oracleSchemaVersion: 'player-signals.v1',
      oracleContractVersion: 'player-signals-contract/v1',
      oracleMatchMethod: 'verified_checklist_seed',
    })
    expect(primaryStsRankLabel(ranking!)).toBe('Oracle Prospect #27')
    expect(ranking?.summary).toContain('Prospect Rank #27 of 6,490')
  })

  it('normalizes accents, suffixes, hyphens, and punctuation for player matching', () => {
    expect(normalizeStsPlayerName('Ronald Acuña Jr.')).toBe('ronald acuna')
    expect(normalizeStsPlayerName('Seong-Jun Kim')).toBe('seong jun kim')
  })

  it('keeps real Oracle prospect ranks authoritative while retaining STS hitter and pitcher context', () => {
    const ranking = findStsRanking('Aiva Arquette')

    expect(ranking).toMatchObject({
      team: 'MIA',
      population: 'oracle',
      source: 'baseball-oracle',
      oracleRoute: 'milb',
      oracleStageRank: expect.any(Number),
      oracleRankUniverse: expect.any(Number),
      prospectRank: expect.any(Number),
    })
    expect(ranking?.prospectRank).toBe(ranking?.oracleStageRank)
    expect(ranking?.oracleRankUniverse).toBeGreaterThan(ranking?.oracleStageRank ?? 0)
    expect(ranking?.coverage).toBeGreaterThanOrEqual(5)
    expect(ranking?.coverage).toBe(
      Object.values(ranking?.sourceRanks ?? {}).filter((sourceRank) => sourceRank !== null).length,
    )
    expect(ranking?.lowCoverage).toBe(false)

    const pitcher = findStsRanking('Karson Milbrandt')

    expect(pitcher).toMatchObject({
      team: 'MIA',
      population: 'oracle',
      source: 'baseball-oracle',
      oracleRankingRole: 'pitcher',
      oracleStageRank: expect.any(Number),
    })
    expect(pitcher?.coverage).toBeGreaterThan(0)
    expect(Object.values(pitcher?.sourceRanks ?? {}).some((sourceRank) => sourceRank !== null)).toBe(true)
  })

  it('uses OOPSY Peak MLB rows for graduated players without taking precedence over prospect rows', () => {
    const mlb = findStsRanking('Shohei Ohtani')
    const prospect = findStsRanking('Aiva Arquette')

    expect(mlb).toMatchObject({
      source: 'oopsy-peak-mlb',
      level: 'MLB',
      prospectRank: null,
      rank: 1,
    })
    expect(primaryStsRankLabel(mlb!)).toBe('MLB dynasty #1')

    expect(prospect).toMatchObject({
      source: 'baseball-oracle',
      level: 'AA',
      oracleRoute: 'milb',
      oracleStageRank: expect.any(Number),
    })
    expect(prospect?.prospectRank).not.toBeNull()
    expect(primaryStsRankLabel(prospect!)).toBe(`Oracle Prospect #${prospect?.oracleStageRank?.toLocaleString()}`)
  })

  it('merges STS movement into an Oracle row without overwriting the Oracle prospect ordinal', () => {
    const oracle = oracleCsv({
      '#': 19,
      'Checklist Name': 'Signal Player',
      'Oracle Name': 'Signal Player',
      'Oracle Player Id': 'oracle:signal-player',
      Team: 'MIA',
    })
    const sts = [
      'Name,Team,Pos,Age,Level,Rank,Prospect Rank,3 Day Change,7 Day Change,14 Day Change,30 Day Change,WAR,Summary',
      'Signal Player,MIA,SS,20,AA,120,45,4,12,30,88,3.4,STS trend context',
    ].join('\n')
    hydrateStsLeaderboard([oracle, sts])

    const ranking = findStsRanking('Signal Player', { team: 'MIA' })
    expect(ranking).toMatchObject({
      source: 'baseball-oracle',
      oraclePlayerId: 'oracle:signal-player',
      oracleStageRank: 19,
      prospectRank: 19,
      rank: 120,
      change7d: 12,
      change30d: 88,
      war: 3.4,
    })
    expect(ranking?.summary).toContain('Scout the Statline context: STS trend context')
  })

  it('fails closed on ambiguous names while allowing exact team and provider-ID resolution', () => {
    hydrateStsLeaderboard([
      oracleCsv(
        {
          '#': 40,
          'Checklist Name': 'Alex Smith',
          'Oracle Name': 'Alex Smith',
          'Oracle Player Id': 'oracle:alex-mia',
          Team: 'MIA',
        },
        {
          '#': 90,
          'Checklist Name': 'Alex Smith',
          'Oracle Name': 'Alex Smith',
          'Oracle Player Id': 'oracle:alex-bos',
          'MLBAM Id': '955555',
          Team: 'BOS',
        },
      ),
    ])

    expect(findStsRanking('Alex Smith')).toBeNull()
    expect(findStsRanking('Alex Smith', { team: 'Boston Red Sox' })).toMatchObject({
      oraclePlayerId: 'oracle:alex-bos',
      oracleStageRank: 90,
    })
    expect(findStsRanking('Alex Smith', { oraclePlayerId: 'oracle:alex-mia' })).toMatchObject({
      oraclePlayerId: 'oracle:alex-mia',
      oracleStageRank: 40,
    })
    expect(findStsRanking('Alex Smith', { mlbamId: '955555' })?.oraclePlayerId).toBe('oracle:alex-bos')
  })

  it('scores rising rank movement above neutral and improves low-price riser value', () => {
    const [riser, flat] = parseStsCsv(
      [
        'Name,Team,Pos,Age,Level,Rank,Prospect Rank,3 Day Change,7 Day Change,14 Day Change,30 Day Change,WAR,Summary',
        '"Riser","WSN","SS","18","A+","54","2","4","18","80","220","4.6","hot"',
        '"Flat","WSN","SS","18","A+","54","2","","","","","4.6","flat"',
      ].join('\n'),
    )

    expect(scoreStsMomentum(riser)).toBeGreaterThan(50)
    expect(scoreStsMomentum(riser)).toBeGreaterThan(scoreStsMomentum(flat))
    expect(scoreStsRiserValue(riser, 40)).toBeGreaterThan(scoreStsRiserValue(riser, 400))
    expect(scoreStsBinTarget(riser, 60)).toBeGreaterThan(scoreStsBinTarget(flat, 60))
    expect(scoreStsBinTarget(riser, 60)).toBeGreaterThan(scoreStsBinTarget(riser, 3))
  })

  it('keeps thin-evidence Oracle players visible but discounts them versus full-model peers', () => {
    const csv = oracleCsv(
      {
        '#': 50,
        'Checklist Name': 'Full Evidence',
        'Oracle Name': 'Full Evidence',
        'Career Outlook': 80,
      },
      {
        '#': 50,
        'Checklist Name': 'Thin Evidence',
        'Oracle Name': 'Thin Evidence',
        'Rank Availability': 'insufficient_sample',
        'Evidence Tier': 'live_in_season_prior',
        Volatility: 'very_high',
        'Career Outlook': 80,
      },
    )
    hydrateStsLeaderboard([csv])
    const covered = findStsRanking('Full Evidence')
    const lowCoverage = findStsRanking('Thin Evidence')

    expect(covered?.lowCoverage).toBe(false)
    expect(lowCoverage?.lowCoverage).toBe(true)
    expect(scoreStsRanking(covered!)).toBeGreaterThan(scoreStsRanking(lowCoverage!) + 20)
  })
})
