import { describe, expect, it } from 'vitest'
import {
  createListingRejection,
  extractEbayItemId,
  isListingRejected,
  listingRejectionKeySet,
  listingRejectionKeys,
  removeListingRejection,
  upsertListingRejection,
} from './listingExclusions'

describe('listingExclusions', () => {
  it('extracts stable eBay item ids from common listing URLs', () => {
    expect(extractEbayItemId('https://www.ebay.com/itm/176444555666?mkcid=1&mkevt=1')).toBe('176444555666')
    expect(extractEbayItemId('https://www.ebay.com/itm/Aiva-Arquette-Auto/176444555666?hash=abc')).toBe('176444555666')
    expect(extractEbayItemId('176444555666')).toBe('176444555666')
  })

  it('matches future scans even when the eBay URL has different tracking params', () => {
    const rejection = createListingRejection({
      item_id: '176444555666',
      listing_url: 'https://www.ebay.com/itm/176444555666?mkcid=1',
      player_name: 'Edward Florentino',
      title: '2026 Bowman Chrome Edward Florentino 1st Green Auto /99',
    })

    expect(rejection).not.toBeNull()
    const keys = listingRejectionKeySet(rejection ? [rejection] : [])

    expect(
      isListingRejected(
        {
          id: '176444555666',
          listingUrl: 'https://www.ebay.com/itm/176444555666?customid=next-scan',
          playerName: 'Edward Florentino',
          title: '2026 Bowman Chrome Edward Florentino 1st Green Auto /99',
        },
        keys,
      ),
    ).toBe(true)
  })

  it('upserts and removes rejection records by shared key', () => {
    const first = createListingRejection({ item_id: '111111111111', title: 'Bad listing one' })
    const second = createListingRejection({ id: '111111111111', title: 'Bad listing one again' })

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()

    const records = upsertListingRejection(upsertListingRejection([], first!), second!)
    expect(records).toHaveLength(1)
    expect(listingRejectionKeys({ item_id: '111111111111' }).some((key) => records[0].keys.includes(key))).toBe(true)
    expect(removeListingRejection(records, second!)).toHaveLength(0)
  })
})
