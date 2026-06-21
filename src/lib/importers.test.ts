import { describe, expect, it } from 'vitest'
import { parseListingText } from './importers'

describe('parseListingText', () => {
  it('parses quoted CSV fields and currency-like numbers', () => {
    const listings = parseListingText(
      [
        'player,title,price,shipping,market_price,comp_count,release_year,serial_denominator,listing_url',
        '"Eli Willits","2026 Bowman Chrome, 1st Auto Blue /150","$1,250.50","$5.25","$1,500",2,2026,"/150",https://example.com/card',
      ].join('\n'),
      'board.csv',
    )

    expect(listings).toHaveLength(1)
    expect(listings[0]?.player_name).toBe('Eli Willits')
    expect(listings[0]?.current_price).toBe(1250.5)
    expect(listings[0]?.shipping_cost).toBe(5.25)
    expect(listings[0]?.avgCompPrice).toBe(1500)
    expect(listings[0]?.serial_denominator).toBe(150)
    expect(listings[0]?.comps).toHaveLength(2)
  })

  it('accepts JSON wrapper objects from exports', () => {
    const listings = parseListingText(
      JSON.stringify({
        listings: [
          {
            item_id: 'abc',
            player_name: 'Eli Willits',
            current_price: 100,
          },
        ],
      }),
      'board.json',
    )

    expect(listings[0]?.item_id).toBe('abc')
  })
})
