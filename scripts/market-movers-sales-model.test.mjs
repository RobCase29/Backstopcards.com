import { describe, expect, it } from 'vitest'
import { buildMarketMoversNormalizedPlayerModel, normalizeMarketMoversSale } from './market-movers-sales-model.mjs'

describe('Market Movers sales model title scrub', () => {
  it('uses official 2026 Bowman families to separate paper and insert autos', () => {
    const paper = normalizeMarketMoversSale(
      {
        itemId: 'paper',
        title: '2026 Bowman Aiva Arquette Orange Auto #BPA-AA 13/25',
        salePriceText: '$500',
        soldDate: '6/20/2026',
      },
      'Aiva Arquette',
    )
    const powerChords = normalizeMarketMoversSale(
      {
        itemId: 'power',
        title: '2026 Bowman Power Chords Auto Aiva Arquette Gold /50',
        salePriceText: '$300',
        soldDate: '6/20/2026',
      },
      'Aiva Arquette',
    )

    expect(paper.cardClass).toBe('paper-auto')
    expect(paper.productFamily).toBe('Bowman Paper')
    expect(powerChords.cardClass).toBe('insert-auto')
    expect(powerChords.insertName).toBe('power chords')
  })

  it('treats gold ink as its official chrome auto lane', () => {
    const goldInk = normalizeMarketMoversSale(
      {
        itemId: 'gold-ink',
        title: '2026 Bowman Baseball Aiva Arquette Gold Ink Variation /15 Unused Redemption',
        salePriceText: '$2700',
        soldDate: '6/21/2026',
      },
      'Aiva Arquette',
    )

    expect(goldInk.cardClass).toBe('auto')
    expect(goldInk.productFamily).toBe('Bowman Chrome')
    expect(goldInk.variationLabel).toBe('Gold Ink /15')
  })

  it('keeps snack-pack autographs in chrome auto /5 lanes', () => {
    const snackPackTitles = [
      ['sunflower', '2026 Bowman Chrome Aiva Arquette Auto /5 Sunflower Snack Pack 1st Refractor', 'Sunflower Snack Pack /5'],
      ['gumball', '2026 Bowman Aiva Arquette Gumball Snack Pack Auto Redemption CPA-AA', 'Gumball Snack Pack /5'],
      ['peanuts', '2026 Bowman Chrome Aiva Arquette Peanuts Auto 1st Bowman', 'Peanuts Snack Pack /5'],
      ['popcorn', '2026 Bowman Chrome Aiva Arquette Popcorn Autograph', 'Popcorn Snack Pack /5'],
    ]

    for (const [itemId, title, variationLabel] of snackPackTitles) {
      const sale = normalizeMarketMoversSale(
        {
          itemId,
          title,
          salePriceText: '$810',
          soldDate: '6/21/2026',
        },
        'Aiva Arquette',
      )

      expect(sale.productFamily).toBe('Bowman Chrome')
      expect(sale.cardClass).toBe('auto')
      expect(sale.isInsert).toBe(false)
      expect(sale.insertName).toBeNull()
      expect(sale.variationLabel).toBe(variationLabel)
      expect(sale.serialDenominator).toBe(5)
    }
  })

  it('splits IP and hand-signed autos away from pack-issued base autos', () => {
    const titles = [
      '2026 Bowman Chrome Aiva Arquette 1st Bowman Signed Rare Auto #BCP-40',
      '2026 Bowman Chrome Aiva Arquette Base #BCP-40 IP AUTO',
      '2026 Bowman Chrome Aiva Arquette 1st Bowman Auto Signed #BCP-40 COA',
    ]

    for (const [index, title] of titles.entries()) {
      const sale = normalizeMarketMoversSale(
        {
          itemId: `hand-signed-${index}`,
          title,
          salePriceText: '$72',
          soldDate: '6/23/2026',
        },
        'Aiva Arquette',
      )

      expect(sale.modelEligible).toBe(true)
      expect(sale.productFamily).toBe('Bowman Chrome')
      expect(sale.cardClass).toBe('auto')
      expect(sale.variationLabel).toBe('Hand Signed Auto')
      expect(sale.serialDenominator).toBeNull()
    }
  })

  it('keeps Bowman Logo Foil Pattern out of generic base buckets', () => {
    const paperLogo = normalizeMarketMoversSale(
      {
        itemId: 'paper-logo',
        title: '2026 Bowman - Aiva Arquette 1st Bowman Logo Foil Pattern SSP Miami Marlins',
        salePriceText: '$65',
        soldDate: '6/21/2026',
      },
      'Aiva Arquette',
    )
    const chromeLogo = normalizeMarketMoversSale(
      {
        itemId: 'chrome-logo',
        title: 'Aiva Arquette 1st Bowman Chrome Logo Foil - Marlins - Chase',
        salePriceText: '$40',
        soldDate: '6/21/2026',
      },
      'Aiva Arquette',
      { defaultReleaseYear: 2026 },
    )

    expect(paperLogo.productFamily).toBe('Bowman Paper')
    expect(paperLogo.cardClass).toBe('paper')
    expect(paperLogo.variationLabel).toBe('Logo Foil Pattern')
    expect(chromeLogo.productFamily).toBe('Bowman Chrome')
    expect(chromeLogo.cardClass).toBe('chrome')
    expect(chromeLogo.variationLabel).toBe('Logo Foil Pattern')
  })

  it('keeps Etched In Glass SSPs out of generic base chrome buckets', () => {
    const etched = normalizeMarketMoversSale(
      {
        itemId: 'etched',
        title: '2026 Bowman Chrome - Aiva Arquette 1st Bowman Etched In Glass SSP #BCP-40 Marlins',
        salePriceText: '$185',
        soldDate: '6/21/2026',
      },
      'Aiva Arquette',
    )
    const stained = normalizeMarketMoversSale(
      {
        itemId: 'etched-stained',
        title: '2026 Bowman Chrome Aiva Arquette Etched In Stained Glass SSP #BCP-40',
        salePriceText: '$200',
        soldDate: '6/21/2026',
      },
      'Aiva Arquette',
    )

    expect(etched.productFamily).toBe('Bowman Chrome')
    expect(etched.cardClass).toBe('chrome')
    expect(etched.variationLabel).toBe('Etched In Glass')
    expect(etched.isInsert).toBe(false)
    expect(etched.isCaseHit).toBe(false)
    expect(stained.variationLabel).toBe('Etched In Glass')
  })

  it('keeps Chrome Logofractor autos as a valid /35 chrome auto lane', () => {
    const logofractorAuto = normalizeMarketMoversSale(
      {
        itemId: 'logofractor-auto',
        title: '2026 Bowman Chrome Aiva Arquette Logofractor Auto CPA-AA',
        salePriceText: '$500',
        soldDate: '6/21/2026',
      },
      'Aiva Arquette',
    )

    expect(logofractorAuto.productFamily).toBe('Bowman Chrome')
    expect(logofractorAuto.cardClass).toBe('auto')
    expect(logofractorAuto.variationLabel).toBe('Logofractor /35')
    expect(logofractorAuto.serialDenominator).toBe(35)
  })

  it('maps generic /35 refractor autos to Logofractor instead of /499', () => {
    const logofractorAuto = normalizeMarketMoversSale(
      {
        itemId: 'dillon-logofractor-auto',
        title: '2026 Bowman Dillon Lewis Bowman Refractor Auto /35 Yankees',
        salePriceText: '$99',
        soldDate: '6/23/2026',
      },
      'Dillon Lewis',
    )

    expect(logofractorAuto.productFamily).toBe('Bowman Chrome')
    expect(logofractorAuto.cardClass).toBe('auto')
    expect(logofractorAuto.variationLabel).toBe('Logofractor /35')
    expect(logofractorAuto.serialDenominator).toBe(35)
  })

  it('keeps speckled refractor titles in the Speckle lane', () => {
    const speckled = normalizeMarketMoversSale(
      {
        itemId: 'dillon-speckled',
        title: '2026 Bowman Chrome Dillon Lewis Speckled Refractor 1st Bowman /299',
        salePriceText: '$8',
        soldDate: '6/23/2026',
      },
      'Dillon Lewis',
    )

    expect(speckled.productFamily).toBe('Bowman Chrome')
    expect(speckled.cardClass).toBe('chrome')
    expect(speckled.variationLabel).toBe('Speckle /299')
    expect(speckled.serialDenominator).toBe(299)
  })

  it('treats redemption as autograph evidence while preserving paper/chrome family', () => {
    const chromeRedemption = normalizeMarketMoversSale(
      {
        itemId: 'chrome-redemption',
        title: '2026 Bowman Chrome Aiva Arquette Gold Refractor Redemption /50',
        salePriceText: '$525',
        soldDate: '6/21/2026',
      },
      'Aiva Arquette',
    )
    const paperRedemption = normalizeMarketMoversSale(
      {
        itemId: 'paper-redemption',
        title: '2026 Bowman Aiva Arquette Red Paper Redemption 3/5',
        salePriceText: '$450',
        soldDate: '6/21/2026',
      },
      'Aiva Arquette',
    )
    const refractorRedemption = normalizeMarketMoversSale(
      {
        itemId: 'refractor-redemption',
        title: '2026 Bowman #CPA-AA Aiva Arquette Auto Refractor REDEMPTION',
        salePriceText: '$165',
        soldDate: '6/23/2026',
      },
      'Aiva Arquette',
    )
    const genericVariationRedemption = normalizeMarketMoversSale(
      {
        itemId: 'generic-variation-redemption',
        title: '2026 Bowman Aiva Arquette #CPA-AA 1st Bowman Variation Autograph Auto Redemption',
        salePriceText: '$115',
        soldDate: '6/12/2026',
      },
      'Aiva Arquette',
    )
    const refractorVariationRedemption = normalizeMarketMoversSale(
      {
        itemId: 'refractor-variation-redemption',
        title: '2026 Bowman #CPA-AA Aiva Arquette Auto Refractor Variation REDEMPTION',
        salePriceText: '$160',
        soldDate: '6/20/2026',
      },
      'Aiva Arquette',
    )
    const bareNumberedRefractor = normalizeMarketMoversSale(
      {
        itemId: 'bare-numbered-refractor',
        title: '2026 Bowman #CPA-AA Aiva Arquette Chrome Auto 012/499 Miami Marlins',
        salePriceText: '$150',
        soldDate: '6/22/2026',
      },
      'Aiva Arquette',
    )
    const miniDiamondRefractor = normalizeMarketMoversSale(
      {
        itemId: 'mini-diamond',
        title: '2026 Bowman Aiva Arquette Chrome Auto Mini-Diamond Refractor 1st #/100 Marlins',
        salePriceText: '$283',
        soldDate: '6/23/2026',
      },
      'Aiva Arquette',
    )
    const purpleParallelRedemption = normalizeMarketMoversSale(
      {
        itemId: 'purple-parallel-redemption',
        title: 'Topps 2026 Bowman Baseball Aiva Arquette Auto Redemption Purple Parallel CPA-AA',
        salePriceText: '$200',
        soldDate: '6/23/2026',
      },
      'Aiva Arquette',
    )
    const goldPaperParallelRedemption = normalizeMarketMoversSale(
      {
        itemId: 'gold-paper-parallel-redemption',
        title: 'Topps 2026 Bowman Aiva Arquette Gold Parallel Auto Redemption #BPA-AA Marlins',
        salePriceText: '$225',
        soldDate: '6/23/2026',
      },
      'Aiva Arquette',
    )
    const htaParallelRedemption = normalizeMarketMoversSale(
      {
        itemId: 'hta-choice-parallel-redemption',
        title: '2026 Bowman Aiva Arquette AutoVariation HTA Choice Refractor Parallel REDEMPTION',
        salePriceText: '$250',
        soldDate: '6/23/2026',
      },
      'Aiva Arquette',
    )

    expect(chromeRedemption.isAuto).toBe(true)
    expect(chromeRedemption.productFamily).toBe('Bowman Chrome')
    expect(chromeRedemption.cardClass).toBe('auto')
    expect(chromeRedemption.variationLabel).toBe('Gold /50')
    expect(paperRedemption.isAuto).toBe(true)
    expect(paperRedemption.productFamily).toBe('Bowman Paper')
    expect(paperRedemption.cardClass).toBe('paper-auto')
    expect(paperRedemption.variationLabel).toBe('Red /5')
    expect(refractorRedemption.isAuto).toBe(true)
    expect(refractorRedemption.productFamily).toBe('Bowman Chrome')
    expect(refractorRedemption.cardClass).toBe('auto')
    expect(refractorRedemption.variationLabel).toBe('Refractor /499')
    expect(refractorRedemption.serialDenominator).toBe(499)
    expect(genericVariationRedemption.productFamily).toBe('Bowman Chrome')
    expect(genericVariationRedemption.cardClass).toBe('auto')
    expect(genericVariationRedemption.variationLabel).toBe('Base Auto')
    expect(genericVariationRedemption.serialDenominator).toBeNull()
    expect(refractorVariationRedemption.variationLabel).toBe('Refractor /499')
    expect(refractorVariationRedemption.serialDenominator).toBe(499)
    expect(bareNumberedRefractor.variationLabel).toBe('Refractor /499')
    expect(bareNumberedRefractor.serialDenominator).toBe(499)
    expect(miniDiamondRefractor.productFamily).toBe('Bowman Chrome')
    expect(miniDiamondRefractor.cardClass).toBe('auto')
    expect(miniDiamondRefractor.variationLabel).toBe('Mini Diamond /100')
    expect(miniDiamondRefractor.serialDenominator).toBe(100)
    expect(purpleParallelRedemption.variationLabel).toBe('Purple /250')
    expect(purpleParallelRedemption.serialDenominator).toBe(250)
    expect(goldPaperParallelRedemption.productFamily).toBe('Bowman Paper')
    expect(goldPaperParallelRedemption.cardClass).toBe('paper-auto')
    expect(goldPaperParallelRedemption.variationLabel).toBe('Gold /50')
    expect(goldPaperParallelRedemption.serialDenominator).toBe(50)
    expect(htaParallelRedemption.productFamily).toBe('Bowman Chrome')
    expect(htaParallelRedemption.variationLabel).toBe('HTA Choice /150')
    expect(htaParallelRedemption.serialDenominator).toBe(150)
  })

  it('keeps B&W Shimmer as its own low-pop chrome auto lane', () => {
    const shortHand = normalizeMarketMoversSale(
      {
        itemId: 'bw-short',
        title: '2026 Bowman Chrome Aiva Arquette B&W Shimmer Auto CPA-AA',
        salePriceText: '$610',
        soldDate: '6/23/2026',
      },
      'Aiva Arquette',
    )
    const longHand = normalizeMarketMoversSale(
      {
        itemId: 'bw-long',
        title: '2026 Bowman Chrome Aiva Arquette Black and White Shimmer Auto',
        salePriceText: '$590',
        soldDate: '6/23/2026',
      },
      'Aiva Arquette',
    )

    expect(shortHand.productFamily).toBe('Bowman Chrome')
    expect(shortHand.cardClass).toBe('auto')
    expect(shortHand.variationLabel).toBe('B&W Shimmer /11')
    expect(shortHand.serialDenominator).toBe(11)
    expect(longHand.variationLabel).toBe('B&W Shimmer /11')
    expect(longHand.serialDenominator).toBe(11)
  })

  it('uses direct base auto comps when they exist', () => {
    const rows = [
      {
        itemId: 'base',
        title: '2026 Bowman Chrome Aiva Arquette 1st Bowman Auto CPA-AA',
        salePriceText: '$100',
        soldDate: '6/21/2026',
        saleType: 'Auction',
      },
      {
        itemId: 'refractor',
        title: '2026 Bowman Chrome Aiva Arquette Refractor Auto /499 CPA-AA',
        salePriceText: '$140',
        soldDate: '6/22/2026',
        saleType: 'Auction',
      },
    ].map((row) => normalizeMarketMoversSale(row, 'Aiva Arquette'))

    const model = buildMarketMoversNormalizedPlayerModel(rows, 'Aiva Arquette', { asOf: '2026-06-23T12:00:00.000Z' })

    expect(model.baseAutoSource).toBe('direct')
    expect(model.baseAutoPrice).toBeCloseTo(100, 0)
    expect(model.baseAutoBucket?.variationLabel).toBe('Base Auto')
  })

  it('infers a base auto anchor from liquid chrome auto variations when base has no sale', () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, index) => ({
        itemId: `purple-${index}`,
        title: `2026 Bowman Chrome Marek Houston Purple Refractor Auto ${index + 1}/250 CPA-MH`,
        salePriceText: '$33',
        soldDate: '6/21/2026',
        saleType: 'Auction',
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        itemId: `aqua-${index}`,
        title: `2026 Bowman Chrome Marek Houston Aqua Auto ${index + 1}/125 CPA-MH`,
        salePriceText: '$50',
        soldDate: '6/22/2026',
        saleType: 'Auction',
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        itemId: `gold-${index}`,
        title: `2026 Bowman Chrome Marek Houston Gold Shimmer Auto ${index + 1}/50 CPA-MH`,
        salePriceText: '$92',
        soldDate: '6/23/2026',
        saleType: 'Buy It Now',
      })),
      {
        itemId: 'snack-outlier',
        title: '2026 Bowman Chrome Marek Houston Sunflower Snack Pack Auto /5 CPA-MH',
        salePriceText: '$900',
        soldDate: '6/23/2026',
        saleType: 'Buy It Now',
      },
    ].map((row) => normalizeMarketMoversSale(row, 'Marek Houston'))

    const model = buildMarketMoversNormalizedPlayerModel(rows, 'Marek Houston', { asOf: '2026-06-24T12:00:00.000Z' })
    const purple = model.buckets.find((bucket) => bucket.variationLabel === 'Purple /250')

    expect(model.baseAutoSource).toBe('variation-implied')
    expect(model.baseAutoBucket).toBeNull()
    expect(model.baseAutoPrice).toBeGreaterThan(18)
    expect(model.baseAutoPrice).toBeLessThan(28)
    expect(model.baseAutoInferred?.supportingBuckets.length).toBeGreaterThan(1)
    expect(purple?.baseAutoMultiple).toBeGreaterThan(1.3)
  })
})
