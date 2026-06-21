import { describe, expect, it } from 'vitest'
import {
  buildCaseHitValuationRows,
  mapEbayItemToCaseHitListing,
  rankCaseHitListings,
  rarityMultiplier,
  type RawEbayCaseHitItem,
} from './caseHits'

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
})
