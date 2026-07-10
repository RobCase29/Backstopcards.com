import { beforeAll, describe, expect, it } from 'vitest'
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

  it('normalizes accents, suffixes, hyphens, and punctuation for player matching', () => {
    expect(normalizeStsPlayerName('Ronald Acuña Jr.')).toBe('ronald acuna')
    expect(normalizeStsPlayerName('Seong-Jun Kim')).toBe('seong jun kim')
  })

  it('matches real formulated consensus rows from both hitter and pitcher feeds', () => {
    const ranking = findStsRanking('Aiva Arquette')

    expect(ranking).toMatchObject({
      team: 'MIA',
      population: 'hitter',
      source: 'formulated-consensus',
    })
    expect(ranking?.coverage).toBeGreaterThanOrEqual(5)
    expect(ranking?.coverage).toBe(
      Object.values(ranking?.sourceRanks ?? {}).filter((sourceRank) => sourceRank !== null).length,
    )
    expect(ranking?.lowCoverage).toBe(false)

    const pitcher = findStsRanking('Karson Milbrandt')

    expect(pitcher).toMatchObject({
      team: 'MIA',
      population: 'pitcher',
      source: 'formulated-consensus',
    })
    expect(pitcher?.rank).toBeLessThan(ranking?.rank ?? Number.POSITIVE_INFINITY)
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
      source: 'formulated-consensus',
      level: 'AA',
    })
    expect(prospect?.prospectRank).not.toBeNull()
    expect(primaryStsRankLabel(prospect!)).toContain('Prospect #')
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

  it('keeps low-coverage players visible but discounts them versus fully covered peers', () => {
    const covered = findStsRanking('Eli Willits')
    const lowCoverage = findStsRanking('Aidan Miller')

    expect(covered?.lowCoverage).toBe(false)
    expect(lowCoverage?.lowCoverage).toBe(true)
    expect(scoreStsRanking(covered!)).toBeGreaterThan(scoreStsRanking(lowCoverage!))
  })
})
