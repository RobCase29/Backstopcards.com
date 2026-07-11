import { describe, expect, it } from 'vitest'
import type { ChecklistModel } from '../types'
import { mapAuthorizedFanaticsCollectInventory } from './fanaticsCollect'

function model(
  release: string,
  releaseYear: number,
  category: ChecklistModel['category'],
  players: string[],
): ChecklistModel {
  return {
    release,
    releaseYear,
    category,
    fetchedAt: '2026-07-11T12:00:00.000Z',
    source: 'canonical-sold-model',
    multipliers: [{ variation: 'Gold Refractor Auto /50', avgMultiplier: 4 }],
    players: players.map((playerName) => ({
      playerName,
      baseAvgPrice: 100,
      baseSalesCount: 5,
      variations: [],
    })),
  }
}

const bowman2026 = model('2026-Bowman', 2026, 'bowman', ['Aiva Arquette', 'Luis Arana'])
const chrome2025 = model('2025-Bowman-Chrome', 2025, 'chrome', ['Aiva Arquette', 'Jesus Made'])
const draft2025 = model('2025-Bowman-Draft', 2025, 'draft', ['Eli Willits'])

describe('authorized Fanatics Collect inventory matcher', () => {
  it('maps an active fixed-price Bowman auto to one checklist model with a namespaced identity', () => {
    const result = mapAuthorizedFanaticsCollectInventory(
      [{
        listingUuid: 'listing-one',
        title: '2026 Bowman Chrome Aiva Arquette 1st Gold Refractor Auto /50',
        askingPrice: 240,
        marketplace: 'FIXED',
        status: 'Live',
        year: 2026,
        allowOffers: true,
        gradingService: 'PSA',
        grade: 10,
        listedAt: 1_783_331_334,
      }],
      [bowman2026, chrome2025, draft2025],
    )

    expect(result.stats.mappedListings).toBe(1)
    expect(result.listings[0]).toMatchObject({
      item_id: 'fanatics-collect:listing-one',
      player_name: 'Aiva Arquette',
      current_price: 240,
      shipping_cost: null,
      release_year: 2026,
      release: '2026-Bowman',
      marketplace: 'fanatics-collect',
      is_graded: true,
      grader: 'PSA',
      grade: 10,
    })
    expect(result.listings[0]?.listed_at).toMatch(/^2026-/)
  })

  it('fails closed for wrong years, adjacent products, non-autos, and non-fixed listings', () => {
    const result = mapAuthorizedFanaticsCollectInventory(
      [
        { listingUuid: 'wrong-year', title: '2025 Bowman Chrome Luis Arana Auto', year: 2024, askingPrice: 25 },
        { listingUuid: 'sapphire', title: '2026 Bowman Chrome Sapphire Aiva Arquette Auto', year: 2026, askingPrice: 25 },
        { listingUuid: 'non-auto', title: '2026 Bowman Chrome Aiva Arquette Gold /50', year: 2026, askingPrice: 25 },
        { listingUuid: 'auction', title: '2026 Bowman Chrome Aiva Arquette Auto', year: 2026, askingPrice: 25, saleType: 'WEEKLY' },
      ],
      [bowman2026, chrome2025],
    )

    expect(result.listings).toEqual([])
    expect(result.stats).toMatchObject({
      rejectedModel: 1,
      rejectedTitleGuard: 1,
      rejectedNonAuto: 1,
      rejectedSaleType: 1,
    })
  })

  it('rejects a same-player same-year release ambiguity unless structured release evidence resolves it', () => {
    const flagship2025 = model('2025-Bowman', 2025, 'bowman', ['Shared Player'])
    const chromeRelease2025 = model('2025-Bowman-Chrome', 2025, 'chrome', ['Shared Player'])
    const ambiguous = {
      listingUuid: 'ambiguous',
      title: '2025 Bowman Chrome Shared Player 1st Auto',
      year: 2025,
      askingPrice: 100,
    }

    const unresolved = mapAuthorizedFanaticsCollectInventory([ambiguous], [flagship2025, chromeRelease2025])
    expect(unresolved.listings).toEqual([])
    expect(unresolved.stats.rejectedAmbiguousModel).toBe(1)

    const resolved = mapAuthorizedFanaticsCollectInventory(
      [{ ...ambiguous, listingUuid: 'resolved', release: '2025 Bowman Chrome' }],
      [flagship2025, chromeRelease2025],
    )
    expect(resolved.listings).toHaveLength(1)
    expect(resolved.listings[0]?.release).toBe('2025-Bowman-Chrome')
  })

  it('deduplicates only identical listing IDs and keeps distinct copies of the same card', () => {
    const item = {
      title: '2026 Bowman Chrome Luis Arana 1st Auto',
      year: 2026,
      askingPrice: 80,
      status: 'active',
      marketplace: 'fixed',
    }
    const result = mapAuthorizedFanaticsCollectInventory(
      [
        { ...item, listingUuid: 'copy-one' },
        { ...item, listingUuid: 'copy-one' },
        { ...item, listingUuid: 'copy-two' },
      ],
      [bowman2026],
    )

    expect(result.listings.map((listing) => listing.item_id)).toEqual([
      'fanatics-collect:copy-one',
      'fanatics-collect:copy-two',
    ])
  })
})
