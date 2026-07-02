import { describe, expect, it } from 'vitest'
import {
  buildWaxMarketModel,
  parseDaveAdamsQuotes,
  parseWaxComps,
  rankWaxOpportunities,
  titleLooksLikeSealedWax,
  waxProductMatchesQuery,
  waxProductKind,
  type WaxListing,
} from './sealedWax'

function listing(overrides: Partial<WaxListing> = {}): WaxListing {
  return {
    id: 'wax-1',
    marketplace: 'ebay',
    marketplaceLabel: 'eBay',
    mode: 'bin',
    title: '2026 Bowman Baseball Hobby Box Factory Sealed',
    listingUrl: 'https://www.ebay.com/itm/wax-1',
    imageUrl: '',
    price: 220,
    shipping: 10,
    allIn: 230,
    productKind: 'box',
    confidence: 0.9,
    ...overrides,
  }
}

describe('sealed wax modeling', () => {
  it('accepts sealed box and case titles but rejects breaks and empty packaging', () => {
    expect(titleLooksLikeSealedWax('2026 Bowman Baseball Hobby Box Factory Sealed')).toBe(true)
    expect(titleLooksLikeSealedWax('2026 Bowman Baseball Hobby Case Sealed')).toBe(true)
    expect(titleLooksLikeSealedWax('2026 Bowman Baseball Random Team Break Spot')).toBe(false)
    expect(titleLooksLikeSealedWax('2026 Bowman Baseball Empty Hobby Box Only')).toBe(false)
  })

  it('classifies product kind from title language', () => {
    expect(waxProductKind('2026 Bowman Baseball Hobby Case')).toBe('case')
    expect(waxProductKind('2026 Bowman Baseball Jumbo Box')).toBe('box')
    expect(waxProductKind('2026 Bowman Baseball Hobby Pack')).toBe('pack')
  })

  it('keeps sealed wax scans aligned to the exact product format', () => {
    const hobbyBox = '2026 Bowman Baseball Hobby Box'

    expect(waxProductMatchesQuery('2026 Bowman Baseball Hobby Box Factory Sealed', hobbyBox)).toBe(true)
    expect(waxProductMatchesQuery('2026 Bowman Baseball Mega Box Factory Sealed', hobbyBox)).toBe(false)
    expect(waxProductMatchesQuery('1x Pack of 2026 Bowman Baseball Jumbo Hobby Box', hobbyBox)).toBe(false)
    expect(waxProductMatchesQuery('2026 Bowman Baseball Hobby Case Sealed', hobbyBox)).toBe(false)
  })

  it('builds a comp anchored market model and lets manual fair value override it', () => {
    const comps = parseWaxComps(`
      eBay $240 2026 Bowman Hobby Box 7/1/2026
      Fanatics $260 2026 Bowman Hobby Box 6/30/2026
      eBay $250 2026 Bowman Hobby Box 6/29/2026
    `)

    expect(comps).toHaveLength(3)
    expect(buildWaxMarketModel(comps).marketPrice).toBeCloseTo(250)
    expect(buildWaxMarketModel(comps, 275).marketPrice).toBe(275)
    expect(buildWaxMarketModel(comps, 275).source).toBe('manual')
  })

  it('parses Dave & Adams retail quotes into scored listings', () => {
    const quotes = parseDaveAdamsQuotes(
      '2026 Bowman Baseball Hobby Box $229.95 https://www.dacardworld.com/sports-cards/2026-bowman-baseball-hobby-box',
      '2026 Bowman Baseball Hobby Box',
    )

    expect(quotes).toHaveLength(1)
    expect(quotes[0].marketplaceLabel).toBe('Dave & Adams')
    expect(quotes[0].allIn).toBe(229.95)
    expect(quotes[0].productKind).toBe('box')
  })

  it('ranks quotes inside the fair-value window by absolute spread', () => {
    const model = buildWaxMarketModel([], 300)
    const ranked = rankWaxOpportunities(
      [
        listing({ id: 'near', allIn: 310, price: 310 }),
        listing({ id: 'strong', allIn: 230, price: 220, shipping: 10 }),
        listing({ id: 'rich', allIn: 500, price: 500 }),
      ],
      model,
      0.15,
    )

    expect(ranked.map((opportunity) => opportunity.listing.id)).toEqual(['strong', 'near'])
    expect(ranked[0].grade).toBe('A')
    expect(ranked[1].signal).toBe('Near market')
  })
})
