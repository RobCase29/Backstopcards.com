import { describe, expect, it } from 'vitest'
import {
  findStsRanking,
  normalizeStsPlayerName,
  parseStsCsv,
  scoreStsBinTarget,
  scoreStsMomentum,
  scoreStsRiserValue,
} from './stsRankings'

describe('STS rankings', () => {
  it('parses quoted multiline summaries without splitting records', () => {
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
      summary: 'line one\nline two',
    })
    expect(rows[1]).toMatchObject({
      name: 'Falling Prospect',
      change14d: -24,
    })
  })

  it('normalizes accents, suffixes, hyphens, and punctuation for player matching', () => {
    expect(normalizeStsPlayerName('Ronald Acuña Jr.')).toBe('ronald acuna')
    expect(normalizeStsPlayerName('Seong-Jun Kim')).toBe('seong jun kim')
  })

  it('matches real STS rows from the imported leaderboard', () => {
    const ranking = findStsRanking('Aiva Arquette')

    expect(ranking).toMatchObject({
      team: 'MIA',
      prospectRank: 516,
    })
  })

  it('matches known checklist aliases to STS official names', () => {
    const ranking = findStsRanking('Cam Schlittler')

    expect(ranking).toMatchObject({
      name: 'Cameron Schlittler',
      team: 'NYY',
      rank: 45,
    })
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
})
