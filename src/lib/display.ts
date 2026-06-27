import type { SalesCacheSale } from './salesCache'
import type { NormalizedListing } from '../types'

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function money(value: number) {
  return currency.format(value)
}

export function auctionBidShipLabel(listing: NormalizedListing) {
  const shippingLabel = listing.shippingCost > 0 ? `${money(listing.shippingCost)} ship` : 'free ship'
  return `${money(listing.currentPrice)} bid + ${shippingLabel}`
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function closeTimeLabel(hoursToClose?: number | null) {
  if (hoursToClose === null || hoursToClose === undefined) return 'No end time'
  if (hoursToClose <= 0) return 'Ended'
  if (hoursToClose < 1) return `${Math.max(1, Math.round(hoursToClose * 60))}m left`
  return `${hoursToClose.toFixed(hoursToClose < 10 ? 1 : 0)}h left`
}

export function compactDate(value?: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '--'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function saleTime(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function medianValue(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function weightedSoldModelPrice(sales: SalesCacheSale[]) {
  const usable = sales.filter((sale) => sale.salePrice > 0 && saleTime(sale.soldAt) > 0)
  if (usable.length === 0) return 0
  const asOf = Math.max(...usable.map((sale) => saleTime(sale.soldAt)))
  const halfLifeDays = 30
  const weighted = usable.map((sale) => ({
    logPrice: Math.log(sale.salePrice),
    weight: Math.pow(0.5, Math.max(0, asOf - saleTime(sale.soldAt)) / 86_400_000 / halfLifeDays),
  }))
  const totalWeight = weighted.reduce((total, sale) => total + sale.weight, 0)
  return totalWeight > 0 ? Math.exp(weighted.reduce((total, sale) => total + sale.logPrice * sale.weight, 0) / totalWeight) : 0
}

export function averageSalePrice(sales: SalesCacheSale[]) {
  const prices = sales.map((sale) => sale.salePrice).filter((price) => price > 0)
  return prices.length ? prices.reduce((total, price) => total + price, 0) / prices.length : 0
}

export function salesLogTrend(sales: SalesCacheSale[]) {
  const usable = sales.filter((sale) => sale.salePrice > 0 && saleTime(sale.soldAt) > 0)
  if (usable.length < 2) return null
  const minTime = Math.min(...usable.map((sale) => saleTime(sale.soldAt)))
  const points = usable.map((sale) => ({
    x: (saleTime(sale.soldAt) - minTime) / 86_400_000,
    y: Math.log(sale.salePrice),
  }))
  const xMean = points.reduce((total, point) => total + point.x, 0) / points.length
  const yMean = points.reduce((total, point) => total + point.y, 0) / points.length
  const variance = points.reduce((total, point) => total + (point.x - xMean) ** 2, 0)
  if (variance <= 0.0001) return null
  const slope = points.reduce((total, point) => total + (point.x - xMean) * (point.y - yMean), 0) / variance
  const intercept = yMean - slope * xMean
  const maxX = Math.max(...points.map((point) => point.x))
  return {
    startTime: minTime,
    endTime: minTime + maxX * 86_400_000,
    startPrice: Math.exp(intercept),
    endPrice: Math.exp(intercept + slope * maxX),
    change30Pct: Math.exp(slope * 30) - 1,
  }
}

export function parseMoneyInput(value: string) {
  const parsed = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
