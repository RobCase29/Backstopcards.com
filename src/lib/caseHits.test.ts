import { describe, expect, it } from 'vitest'
import type { PricingRow } from './matrix'
import {
  buildCaseHitAutoEquivalent,
  buildCaseHitValuationRows,
  mapEbayItemToCaseHitListing,
  rankCaseHitListings,
  rarityMultiplier,
  type RawEbayCaseHitItem,
} from './caseHits'

function pricingRow(overrides: Partial<PricingRow> = {}): PricingRow {
  return {
    id: '2026-bowman-aiva',
    rank: 1,
    playerName: 'Aiva Arquette',
    checklistTeam: 'MIA',
    currentTeam: 'MIA',
    currentTeamName: 'Miami Marlins',
    stsName: null,
    stsTeam: 'MIA',
    stsPosition: 'SS',
    stsAge: 22,
    stsLevel: 'A+',
    stsRank: null,
    stsProspectRank: null,
    stsDynastyScore: null,
    stsMomentumScore: null,
    stsRiserValueScore: null,
    stsBinTargetScore: null,
    stsWar: null,
    stsChange3d: null,
    stsChange7d: null,
    stsChange14d: null,
    stsChange30d: null,
    stsSummary: null,
    release: '2026-Bowman',
    releaseYear: 2026,
    category: 'bowman',
    baseTwmaPrice: 100,
    pulseBasePrice: 100,
    baseSales: 12,
    rawBaseSales: 12,
    baseSales30: 8,
    baseSales90: 12,
    baseAuctionSales: 7,
    baseBinSales: 4,
    baseUnknownSales: 1,
    baseEffectiveSales: 9,
    baseVolatility: 0.12,
    basePriceSource: 'weighted-sales',
    baseConfidence: 0.82,
    latestBaseSaleAt: null,
    baseMethod: 'test',
    topVariationPrice: 4_000,
    variationCount: 5,
    ladder: [
      { key: 'base', label: 'Base Auto', multiplier: 1, price: 100, sortOrder: -1, synthesizedBase: true },
      { key: 'refractor-499', label: 'Refractor /499', multiplier: 1.25, price: 125, sortOrder: 1, synthesizedBase: false },
      { key: 'blue-150', label: 'Blue Refractor /150', multiplier: 1.85, price: 185, sortOrder: 2, synthesizedBase: false },
      { key: 'green-99', label: 'Green Refractor /99', multiplier: 2.5, price: 250, sortOrder: 3, synthesizedBase: false },
      { key: 'superfractor-1', label: 'Superfractor /1', multiplier: 40, price: 4_000, sortOrder: 99, synthesizedBase: false },
    ],
    searchText: 'aiva arquette 2026 bowman',
    ...overrides,
  }
}

function item(overrides: Partial<RawEbayCaseHitItem> = {}): RawEbayCaseHitItem {
  return {
    itemId: 'item-1',
    title: '2026 Bowman Crystallized Aiva Arquette BWC-1 Miami Marlins',
    itemWebUrl: 'https://www.ebay.com/itm/item-1',
    price: { value: '100.00', currency: 'USD' },
    buyingOptions: ['FIXED_PRICE'],
    shippingOptions: [{ shippingCost: { value: '5.00', currency: 'USD' } }],
    _bowmanTraderQuery: {
      playerName: 'Aiva Arquette',
      caseHit: 'crystallized',
    },
    ...overrides,
  }
}

describe('case hit eBay modeling', () => {
  it('maps a valid Crystallized listing and classifies numbered parallels', () => {
    const listing = mapEbayItemToCaseHitListing(
      item({
        title: '2026 Bowman Crystallized Aiva Arquette Gold Refractor /50 BWC-1',
      }),
    )

    expect(listing?.playerName).toBe('Aiva Arquette')
    expect(listing?.variationKey).toBe('gold')
    expect(listing?.serial).toBe(50)
    expect(listing?.allIn).toBe(105)

    const redSoxGold = mapEbayItemToCaseHitListing(
      item({
        title: '2026 Bowman Chrome Roman Anthony Crystallized Gold BWC-18 #15/50 Red Sox',
        _bowmanTraderQuery: { playerName: 'Roman Anthony', caseHit: 'crystallized' },
      }),
    )

    expect(redSoxGold?.variationKey).toBe('gold')

    const redRefractor = mapEbayItemToCaseHitListing(
      item({
        title: '2026 Bowman Chrome Roman Anthony Crystallized Red Refractor /5 BWC-18 Red Sox',
        _bowmanTraderQuery: { playerName: 'Roman Anthony', caseHit: 'crystallized' },
      }),
    )

    expect(redRefractor?.variationKey).toBe('red')
  })

  it('rejects adjacent inserts and autos even when the player matches', () => {
    expect(
      mapEbayItemToCaseHitListing(
        item({
          title: '2026 Bowman Power Chord Auto Aiva Arquette Crystallized Style',
        }),
      ),
    ).toBeNull()
    expect(
      mapEbayItemToCaseHitListing(
        item({
          title: '2026 Bowman Patchwork Aiva Arquette BWC-1',
        }),
      ),
    ).toBeNull()
  })

  it('does not treat sales language or digital Bunt cards as physical Superfractors', () => {
    const gold = mapEbayItemToCaseHitListing(
      item({
        title: 'Daniel Pierce 2026 Bowman Crystallized Gold /50 SUPER CLEAN Tampa Bay Rays',
        _bowmanTraderQuery: { playerName: 'Daniel Pierce', caseHit: 'crystallized' },
      }),
    )

    expect(gold?.variationKey).toBe('gold')

    expect(
      mapEbayItemToCaseHitListing(
        item({
          title: '2026 Topps Bunt Bowman Francisco Lindor Red Crystallized 5cc Legendary Mets',
          _bowmanTraderQuery: { playerName: 'Francisco Lindor', caseHit: 'crystallized' },
        }),
      ),
    ).toBeNull()

    expect(
      mapEbayItemToCaseHitListing(
        item({
          title: '2026 Topps Bunt DIGITAL Bowman Jac Caglianone Legendary Orange Crystallized 25cc',
          _bowmanTraderQuery: { playerName: 'Jac Caglianone', caseHit: 'crystallized' },
        }),
      ),
    ).toBeNull()
  })

  it('rejects redeemed Crystallized listings', () => {
    expect(
      mapEbayItemToCaseHitListing(
        item({
          title: '2026 Bowman Chrome Shohei Ohtani Crystallized insert #BWC-19 Dodgers Redeemed',
          _bowmanTraderQuery: { playerName: 'Shohei Ohtani', caseHit: 'crystallized' },
        }),
      ),
    ).toBeNull()
  })

  it('uses rarity and active asks to rank under-ask Crystallized listings', () => {
    const listings = [
      mapEbayItemToCaseHitListing(item({ itemId: 'cheap-base', price: { value: '45' }, shippingOptions: [] })),
      mapEbayItemToCaseHitListing(item({ itemId: 'base-2', price: { value: '120' }, shippingOptions: [] })),
      mapEbayItemToCaseHitListing(item({ itemId: 'base-3', price: { value: '130' }, shippingOptions: [] })),
      mapEbayItemToCaseHitListing(
        item({
          itemId: 'gold-1',
          title: '2026 Bowman Crystallized Aiva Arquette Gold Refractor /50 BWC-1',
          price: { value: '185' },
          shippingOptions: [],
        }),
      ),
    ].filter((listing): listing is NonNullable<typeof listing> => Boolean(listing))

    const ranked = rankCaseHitListings(listings)

    expect(rarityMultiplier('gold')).toBeGreaterThan(1)
    expect(ranked[0]?.listing.itemId).toBe('cheap-base')
    expect(ranked[0]?.edgeDollars).toBeGreaterThan(0)

    const modelRows = buildCaseHitValuationRows(listings)
    const aiva = modelRows.find((row) => row.playerName === 'Aiva Arquette')
    expect(aiva?.variations.find((variation) => variation.key === 'gold')?.price).toBeGreaterThan(aiva?.baseAsk ?? 0)
    expect(aiva?.source).toBe('player-ask')
  })

  it('maps Crystallized prices to the nearest Bowman auto price tier without using insert serial', () => {
    const listing = mapEbayItemToCaseHitListing(
      item({
        itemId: 'fair-crystal',
        price: { value: '250' },
        shippingOptions: [],
      }),
    )
    expect(listing).not.toBeNull()

    const equivalent = buildCaseHitAutoEquivalent(listing!, [pricingRow()])

    expect(equivalent?.autoMultiple).toBe(2.5)
    expect(equivalent?.equivalentLabel).toBe('Green Refractor /99')
    expect(equivalent?.priceBandLabel).toBe('At Green Refractor /99')
    expect(equivalent?.signal).toBe('fair')

    const numberedListing = mapEbayItemToCaseHitListing(
      item({
        itemId: 'gold-crystal',
        title: '2026 Bowman Crystallized Aiva Arquette Gold Refractor /50 BWC-1',
        price: { value: '250' },
        shippingOptions: [],
      }),
    )
    const numberedEquivalent = buildCaseHitAutoEquivalent(numberedListing!, [pricingRow()])

    expect(numberedListing?.serial).toBe(50)
    expect(numberedEquivalent?.equivalentLabel).toBe('Green Refractor /99')
    expect(numberedEquivalent?.priceBandLabel).toBe('At Green Refractor /99')

    const cheapListing = mapEbayItemToCaseHitListing(
      item({
        itemId: 'cheap-crystal',
        price: { value: '75' },
        shippingOptions: [],
      }),
    )
    const cheapEquivalent = buildCaseHitAutoEquivalent(cheapListing!, [pricingRow()])
    expect(cheapEquivalent?.equivalentLabel).toBe('Base Auto')
    expect(cheapEquivalent?.priceBandLabel).toBe('Below Base Auto')
    expect(cheapEquivalent?.signal).toBe('value')
    expect(cheapEquivalent?.valueScore).toBeGreaterThan(equivalent?.valueScore ?? 0)
  })
})
