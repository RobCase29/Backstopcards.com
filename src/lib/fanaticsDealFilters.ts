import type { Opportunity } from '../types'

export type FanaticsValueBand = 'within-50' | 'fair-or-better' | 'near-model' | 'all'
export type FanaticsGradeFilter = 'all' | 'raw' | 'graded'
export type FanaticsDealSort = 'edge' | 'discount' | 'price' | 'confidence'

export type FanaticsDealFilters = {
  query: string
  valueBand: FanaticsValueBand
  grade: FanaticsGradeFilter
  sort: FanaticsDealSort
  maxPrice: number
  holdsOnly: boolean
  holdTargets: string[]
}

export function fanaticsPlayerKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function filterFanaticsDealOpportunities(opportunities: Opportunity[], filters: FanaticsDealFilters) {
  const query = fanaticsPlayerKey(filters.query)
  const holdKeys = new Set(filters.holdTargets.map(fanaticsPlayerKey))
  const filtered = opportunities.filter((opportunity) => {
    if (opportunity.listing.marketplace !== 'fanatics-collect') return false
    const ask = opportunity.listing.allInPrice
    const fairValue = opportunity.fairValue
    if (!fairValue || ask <= 0) return false
    if (query) {
      const searchText = fanaticsPlayerKey(
        `${opportunity.listing.playerName} ${opportunity.listing.title} ${opportunity.listing.releaseLabel} ${opportunity.matchedVariation ?? ''}`,
      )
      if (!searchText.includes(query) && !query.split(' ').every((word) => searchText.includes(word))) return false
    }
    if (filters.valueBand === 'fair-or-better' && ask > fairValue) return false
    if (filters.valueBand === 'near-model' && ask > fairValue * 1.15) return false
    if (filters.valueBand === 'within-50' && ask > fairValue * 1.5) return false
    if (filters.grade === 'raw' && opportunity.listing.isGraded) return false
    if (filters.grade === 'graded' && !opportunity.listing.isGraded) return false
    if (filters.maxPrice > 0 && ask > filters.maxPrice) return false
    if (filters.holdsOnly && !holdKeys.has(fanaticsPlayerKey(opportunity.listing.playerName))) return false
    return true
  })

  return filtered.sort((left, right) => {
    if (filters.sort === 'discount') {
      return right.discountPct - left.discountPct || right.edgeDollars - left.edgeDollars
    }
    if (filters.sort === 'price') {
      return left.listing.allInPrice - right.listing.allInPrice || right.edgeDollars - left.edgeDollars
    }
    if (filters.sort === 'confidence') {
      return right.confidence - left.confidence || right.edgeDollars - left.edgeDollars
    }
    return right.edgeDollars - left.edgeDollars || right.discountPct - left.discountPct
  })
}
