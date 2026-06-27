export type CardHedgeUsage = {
  limits: {
    perMinute: number
    perDay: number
  }
  usage: {
    minute: number
    day: number
    remainingMinute: number
    remainingDay: number
    minuteWindowStart: string
    dayWindowStart: string
  }
}

export type CardHedgeStatus = CardHedgeUsage & {
  connected: boolean
  configured: boolean
  plan: string
  eliteAccessExpected: boolean
  baseUrl: string
  endpoints: Record<string, string>
  message: string
}

export type CardHedgeGradePrice = {
  card_id?: string
  grade: string
  grader?: string
  price: string | number
  display_order?: string | number
}

export type CardHedgeCard = {
  card_id: string
  description?: string
  player?: string
  set?: string
  number?: string
  variant?: string
  image?: string
  category?: string
  category_group?: string
  set_type?: string
  rookie?: boolean | string
  gain?: number | string
  prices?: CardHedgeGradePrice[]
  '7 Day Sales'?: number
  '30 Day Sales'?: number
}

export type CardHedgeCardSearchResponse = {
  pages: number
  count: number
  cards: CardHedgeCard[]
}

export type CardHedgeMatchResponse = {
  match: (CardHedgeCard & { confidence?: number; reasoning?: string }) | null
  candidates_evaluated: number
  search_query_used: string
}

export type CardHedgeRawSale = {
  price: number | string
  sale_date: string
  price_source?: string
  card_id?: string
  price_history_id?: string
  grade?: string
  sale_type?: string
  title?: string
  sale_url?: string
  image?: string
}

export type CardHedgeCompsResponse = {
  comp_price: number
  high: number
  low: number
  count_requested: number
  count_used: number
  time_weighted: boolean
  raw_prices?: CardHedgeRawSale[] | null
}

export type CardHedgeAllPricesResponse = {
  prices: CardHedgeGradePrice[]
}

export type CardHedgePriceUpdate = {
  price: string | number
  sale_date: string
  grade: string
  card_desc: string
  card_set: string
  card_number?: string
  player?: string
  variant?: string
  card_id: string
  update_timestamp: string
}

export type CardHedgePriceUpdatesResponse = {
  updates: CardHedgePriceUpdate[]
  count: number
}

export type CardHedgeFmvResult = {
  card_id: string
  grade: string
  price?: number | null
  price_low?: number | null
  price_high?: number | null
  confidence: number
  method: string
  freshness_days?: number | null
  support_grades: number
  grade_label: string
  provider: string
  grade_value: number
  raw_price?: number | null
  confidence_grade?: string
  price_explanation?: string
  error?: string
}

export type CardHedgeFmvBatchResponse = {
  results: CardHedgeFmvResult[]
  total_requested: number
  total_successful: number
}

async function parseCardHedgeResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ({ error?: string } & T) | null
  if (!response.ok) throw new Error(payload?.error ?? `Card Hedge request failed (${response.status})`)
  if (!payload) throw new Error('Card Hedge returned an empty response')
  return payload
}

async function postCardHedge<T>(route: string, payload: unknown, signal?: AbortSignal) {
  const response = await fetch(`/api/card-hedge/${route}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })
  return parseCardHedgeResponse<T>(response)
}

export async function fetchCardHedgeStatus(signal?: AbortSignal) {
  const response = await fetch('/api/card-hedge/status', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  return parseCardHedgeResponse<CardHedgeStatus>(response)
}

export function searchCardHedgeCards(
  payload: {
    search?: string | null
    set?: string | null
    category?: string | null
    player?: string | null
    rookie?: string | null
    page?: number
    page_size?: number
    raw_images_only?: boolean | null
  },
  signal?: AbortSignal,
) {
  return postCardHedge<CardHedgeCardSearchResponse>('search', payload, signal)
}

export function matchCardHedgeCard(
  payload: {
    query: string
    category?: string | null
    max_candidates?: number
    raw_images_only?: boolean | null
  },
  signal?: AbortSignal,
) {
  return postCardHedge<CardHedgeMatchResponse>('match', payload, signal)
}

export function fetchCardHedgeComps(
  payload: {
    card_id: string
    count: number
    grade: string
    time_weighted?: boolean
    include_raw_prices?: boolean
  },
  signal?: AbortSignal,
) {
  return postCardHedge<CardHedgeCompsResponse>('comps', payload, signal)
}

export function fetchCardHedgeAllPrices(cardId: string, signal?: AbortSignal) {
  return postCardHedge<CardHedgeAllPricesResponse>('all-prices', { card_id: cardId }, signal)
}

export function fetchCardHedgePriceUpdates(
  payload: {
    since: string
    ignore_grades?: string[] | null
  },
  signal?: AbortSignal,
) {
  return postCardHedge<CardHedgePriceUpdatesResponse>('price-updates', payload, signal)
}

export function fetchCardHedgeFmvBatch(
  payload: {
    items: Array<{ card_id: string; grade: string }>
  },
  signal?: AbortSignal,
) {
  return postCardHedge<CardHedgeFmvBatchResponse>('card-fmv-batch', payload, signal)
}

export async function fetchCardHedgeDailyExport(date: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ date })
  const response = await fetch(`/api/card-hedge/daily-export?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'text/csv, application/json' },
    signal,
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? `Card Hedge daily export failed (${response.status})`)
  }
  return response.text()
}
