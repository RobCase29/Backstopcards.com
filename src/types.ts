export type ListingKind = 'live' | 'bin' | 'sold'

export type ListingMarketplace = 'ebay' | 'fanatics-collect' | 'comc' | 'unknown'

export type MarketMode = 'raw' | 'graded' | 'raw-plus-graded'

export type GradingCompany = 'PSA' | 'BGS' | 'SGC' | 'CGC'

export type TargetUniverse = 'strict' | 'expanded' | 'low-serial-non-auto'

export type FeedScanDepth = 'fast' | 'deep'

export type ReleaseScope = 'all' | 'selected'

export type ListingStatus = 'active' | 'ended' | 'sold' | 'unknown'

export type ValuationSource =
  | 'sales-cache-exact'
  | 'sales-cache-blend'
  | 'base-auto'
  | 'hand-signed-base'
  | 'base-twma-blend'
  | 'player-variation'
  | 'player-base-curve'
  | 'release-curve'
  | 'listing-comps'

export interface Prospect {
  id?: string
  name?: string
  normalized_name?: string
  team?: string
  level?: string
  position?: string
  ranking?: number | string | null
  age?: number | string | null
  mlb_id?: string
  current_avg?: number | string | null
  iso?: number | string | null
  k_pct?: number | string | null
  bb_pct?: number | string | null
  era?: number | string | null
  fip?: number | string | null
  k_per_9?: number | string | null
  bb_per_9?: number | string | null
  status?: string | null
}

export interface CompSale {
  id?: string
  ebay_item_id?: string
  player_name?: string
  sale_date?: string
  sale_price?: number | string
  price?: number | string
  url?: string
  title?: string
}

export interface MarketplaceListing {
  id?: string
  item_id?: string
  title?: string
  player_name?: string
  prospect?: Prospect | null
  current_price?: number | string | null
  price?: number | string | null
  sold_price?: number | string | null
  shipping_cost?: number | string | null
  buying_format?: string
  listing_status?: string | null
  status?: string | null
  is_sold?: boolean | null
  listing_url?: string
  url?: string
  marketplace?: ListingMarketplace | string | null
  marketplace_label?: string | null
  image_url?: string | null
  image?: string | null
  gallery_url?: string | null
  gallery_urls?: string[] | string | null
  seller_username?: string | null
  seller_feedback_score?: number | string | null
  watch_count?: number | string | null
  created_at?: string | null
  listed_at?: string | null
  end_time?: string | null
  bid_count?: number | string | null
  release_year?: number | string | null
  product_type?: string | null
  release?: string | null
  variation?: string | null
  base_color?: string | null
  serial_denominator?: number | string | null
  is_hand_signed?: boolean | null
  checklist_match?: boolean | null
  checklist_first_bowman?: boolean | null
  is_graded?: boolean | null
  grader?: string | null
  grade?: string | number | null
  comps?: CompSale[]
  avgCompPrice?: number | string | null
  avg_comp_price?: number | string | null
  inferredCompPrice?: number | string | null
  inferred_comp_price?: number | string | null
}

export interface ChecklistVariation {
  variation: string
  avgMultiplier: number
  avgPrice?: number
  playerCount?: number
  totalSales?: number
  sortOrder?: number | null
  modelMethod?: string
  modelConfidence?: number
  structuralPrior?: number
  proximitySales?: number
}

export interface ChecklistPlayerVariation {
  variation: string
  avgPrice: number
  multiplier: number
  salesCount?: number
}

export interface ChecklistSale {
  id?: string
  title?: string | null
  variation?: string | null
  saleType?: string | null
  sale_type?: string | null
  sellingFormat?: string | null
  selling_format?: string | null
  buyingFormat?: string | null
  buying_format?: string | null
  listingType?: string | null
  listing_type?: string | null
  format?: string | null
  source?: string | null
  saleDate?: string | null
  sale_date?: string | null
  soldAt?: string | null
  sold_at?: string | null
  date?: string | null
  created_at?: string | null
  salePrice?: number | string | null
  sale_price?: number | string | null
  price?: number | string | null
  amount?: number | string | null
  value?: number | string | null
}

export interface ChecklistPlayer {
  playerName: string
  prospectId?: string | null
  team?: string | null
  status?: string | null
  baseAvgPrice: number
  baseSalesCount: number
  baseSales?: ChecklistSale[]
  base_sales?: ChecklistSale[]
  sales?: ChecklistSale[]
  saleHistory?: ChecklistSale[]
  sale_history?: ChecklistSale[]
  variations: ChecklistPlayerVariation[]
}

export interface ChecklistModel {
  category: 'bowman' | 'chrome' | 'draft'
  release: string
  releaseYear: number
  totalPlayers?: number | null
  firstChromeAutos?: number | null
  activeChecklistPlayers?: number | null
  multipliers: ChecklistVariation[]
  players: ChecklistPlayer[]
  fetchedAt: string
  modelVersion?: string
  source:
    | 'public-multipliers'
    | 'authenticated-player-model'
    | 'ebay-sold-model'
    | 'market-movers-sold-model'
    | 'canonical-sold-model'
}

export interface NormalizedListing {
  id: string
  kind: ListingKind
  title: string
  playerName: string
  prospect?: Prospect | null
  currentPrice: number
  shippingCost: number
  allInPrice: number
  marketPrice: number
  compCount: number
  comps: CompSale[]
  status: ListingStatus
  isSold: boolean
  listingUrl?: string
  marketplace?: ListingMarketplace | string
  marketplaceLabel?: string
  imageUrl?: string | null
  sellerName?: string | null
  sellerFeedbackScore?: number | null
  watchCount: number
  createdAt?: string | null
  endTime?: string | null
  bidCount: number
  releaseYear?: number | null
  releaseLabel: string
  variationLabel: string
  serialDenominator?: number | null
  isGraded: boolean
  grader?: string | null
  grade?: string | number | null
  gradingCompany?: GradingCompany | null
  gradeNumber?: number | null
  isEligibleGraded: boolean
  isBowman: boolean
  isAutograph: boolean
  isFirstBowman: boolean
  isTargetAuto: boolean
  isLowSerialNonAuto: boolean
  isHandSigned: boolean
  universeScore: number
  taxonomyStatus?: 'matched' | 'ambiguous' | 'conflict' | 'out-of-scope' | 'unknown' | null
  taxonomyConfidence?: number | null
  taxonomyReason?: string | null
  listingAgeHours?: number | null
  hoursToClose?: number | null
}

export interface Opportunity {
  listing: NormalizedListing
  score: number
  grade: 'A+' | 'A' | 'B' | 'C' | 'Watch'
  action: 'Buy now' | 'Make offer' | 'Bid window' | 'Watchlist' | 'Pass'
  lane: 'buy' | 'watch' | 'risk'
  fairValue: number
  rawFairValue: number
  modelPrice?: number | null
  baseTwmaPrice?: number | null
  variationPrice?: number | null
  compPrice?: number | null
  compBucketLabel?: string | null
  compSaleCount?: number | null
  compLast3Avg?: number | null
  compLast5Avg?: number | null
  compTrailingModel?: number | null
  compAskVsLast5Pct?: number | null
  modelConfidence: number
  gradingMultiplier?: number | null
  gradingConfidence?: number | null
  gradingNote?: string | null
  matchedVariation?: string | null
  valuationSource: ValuationSource
  discountPct: number
  edgeDollars: number
  rawEdgeDollars: number
  maxEntry: number
  expectedRoiPct: number
  confidence: number
  trustScore: number
  compQualityScore: number
  availabilityScore: number
  universeScore: number
  executionScore: number
  liquidityScore: number
  urgencyScore: number
  riskScore: number
  scoreComponents: {
    rawEdge: number
    percentEdge: number
    compQuality: number
    targetFit: number
    availability: number
    variationModel: number
    prospect: number
    riskPenalty: number
  }
  thesis: string
  tags: string[]
  reasons: string[]
  warnings: string[]
}

export interface ScoreSettings {
  minDiscountPct: number
  dollarEdgeWeight: number
  targetMarginPct: number
  minPrice: number
  maxPrice?: number | null
  mode: MarketMode
  targetUniverse: TargetUniverse
  targetReleaseYear: number
  targetCategory: ChecklistModel['category']
  releaseScope: ReleaseScope
  checklistOnly: boolean
  minCompCount: number
  activeOnly: boolean
}

export interface PulseSnapshot {
  listings: MarketplaceListing[]
  analytics?: unknown
  source: 'live' | 'import'
  fetchedAt: string
  totalCount?: number | null
  scanStats?: PulseScanStats
}

export interface PulseScanStats {
  depth: FeedScanDepth
  phase: 'cache' | 'bands' | 'coverage' | 'complete'
  durationMs: number
  networkCalls: number
  cacheHits: number
  dedupeHits: number
  priceBands: number
  pagesFetched: number
  checklistPlayers: number
  checklistPlayerUniverse: number
  checklistCoverageComplete: boolean
  checklistCoverageRan: boolean
  binListings: number
  checklistListings: number
  liveListings: number
  dedupedListings: number
  totalCount?: number | null
}
