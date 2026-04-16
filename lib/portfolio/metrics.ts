import type {
  Holding,
  SnapshotMap,
  EnrichedHolding,
  HoldingSnapshot,
  PortfolioTotals,
  AllocationSlice,
  TopMovers,
  RiskStats,
} from './types'

export const CASH_TICKER = 'CASH'

export function isCashHolding(h: { ticker: string }): boolean {
  return h.ticker === CASH_TICKER
}

function cashSnapshot(): HoldingSnapshot {
  return {
    ticker: CASH_TICKER,
    price: 1,
    prevClose: 1,
    isExtendedHours: false,
    beta: 0,
    volatility30d: 0,
    sector: 'Cash',
    name: 'Cash',
  }
}

export function enrichHoldings(holdings: Holding[], snapshots: SnapshotMap): EnrichedHolding[] {
  const enriched = holdings.map(h => {
    const snapshot = isCashHolding(h) ? cashSnapshot() : (snapshots[h.ticker] ?? null)
    const price = snapshot?.price ?? null
    const prevClose = snapshot?.prevClose ?? null
    const costBasis = h.shares * h.avg_cost
    const marketValue = price != null ? h.shares * price : null
    const plDollar = marketValue != null ? marketValue - costBasis : null
    const plPercent = plDollar != null && costBasis > 0 ? plDollar / costBasis : null
    const dayChangeDollar = price != null && prevClose != null ? (price - prevClose) * h.shares : null
    const dayChangePercent = price != null && prevClose != null && prevClose > 0
      ? (price - prevClose) / prevClose
      : null
    return {
      ...h,
      snapshot,
      costBasis,
      marketValue,
      plDollar,
      plPercent,
      dayChangeDollar,
      dayChangePercent,
      weight: null as number | null,
    }
  })

  const totalValue = enriched.reduce((acc, e) => acc + (e.marketValue ?? 0), 0)
  for (const e of enriched) {
    e.weight = e.marketValue != null && totalValue > 0 ? e.marketValue / totalValue : null
  }

  enriched.sort((a, b) => {
    const aCash = isCashHolding(a)
    const bCash = isCashHolding(b)
    if (aCash !== bCash) return aCash ? 1 : -1
    return (b.marketValue ?? -Infinity) - (a.marketValue ?? -Infinity)
  })
  return enriched
}

export function computeTotals(holdings: EnrichedHolding[]): PortfolioTotals {
  let totalValue = 0
  let totalCost = 0
  let dayChangeDollar = 0
  let prevValueSum = 0
  let hasIncomplete = false

  for (const h of holdings) {
    totalCost += h.costBasis
    if (h.marketValue != null) {
      totalValue += h.marketValue
    } else {
      hasIncomplete = true
    }
    if (h.dayChangeDollar != null && h.snapshot?.prevClose != null) {
      dayChangeDollar += h.dayChangeDollar
      prevValueSum += h.snapshot.prevClose * h.shares
    }
  }

  const totalPlDollar = totalValue - totalCost
  const totalPlPercent = totalCost > 0 ? totalPlDollar / totalCost : 0
  const dayChangePercent = prevValueSum > 0 ? dayChangeDollar / prevValueSum : 0

  return {
    totalValue,
    totalCost,
    totalPlDollar,
    totalPlPercent,
    dayChangeDollar,
    dayChangePercent,
    hasIncomplete,
  }
}

export function computeSectorAllocation(holdings: EnrichedHolding[]): AllocationSlice[] {
  const total = holdings.reduce((acc, h) => acc + (h.marketValue ?? 0), 0)
  if (total <= 0) return []
  const buckets = new Map<string, number>()
  for (const h of holdings) {
    if (h.marketValue == null || h.marketValue <= 0) continue
    const sector = h.snapshot?.sector?.trim() || 'Other'
    buckets.set(sector, (buckets.get(sector) ?? 0) + h.marketValue)
  }
  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value, percent: value / total }))
    .sort((a, b) => b.value - a.value)
}

export function computeTopMovers(holdings: EnrichedHolding[], count = 3): TopMovers {
  const withChange = holdings.filter(h => h.dayChangePercent != null)
  const sorted = [...withChange].sort(
    (a, b) => (b.dayChangePercent ?? 0) - (a.dayChangePercent ?? 0)
  )
  const winners = sorted.filter(h => (h.dayChangePercent ?? 0) > 0).slice(0, count)
  const losers = sorted
    .filter(h => (h.dayChangePercent ?? 0) < 0)
    .slice(-count)
    .reverse()
  return { winners, losers }
}

export function computeRiskStats(holdings: EnrichedHolding[]): RiskStats {
  const valid = holdings.filter(h => h.marketValue != null && h.marketValue > 0)
  const totalValid = valid.reduce((acc, h) => acc + (h.marketValue ?? 0), 0)

  const betaWeighted = valid.filter(h => h.snapshot?.beta != null)
  const betaWeight = betaWeighted.reduce((acc, h) => acc + (h.marketValue ?? 0), 0)
  const beta = betaWeight > 0
    ? betaWeighted.reduce((acc, h) => acc + h.snapshot!.beta! * ((h.marketValue ?? 0) / betaWeight), 0)
    : null

  const volWeighted = valid.filter(h => h.snapshot?.volatility30d != null)
  const volWeight = volWeighted.reduce((acc, h) => acc + (h.marketValue ?? 0), 0)
  const volatility30d = volWeight > 0
    ? volWeighted.reduce((acc, h) => acc + h.snapshot!.volatility30d! * ((h.marketValue ?? 0) / volWeight), 0)
    : null

  let topHoldingTicker: string | null = null
  let topHoldingWeight: number | null = null
  if (totalValid > 0) {
    const sorted = [...valid].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
    topHoldingTicker = sorted[0]?.ticker ?? null
    topHoldingWeight = sorted[0] ? (sorted[0].marketValue ?? 0) / totalValid : null
  }

  const top3Concentration = totalValid > 0
    ? [...valid]
        .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
        .slice(0, 3)
        .reduce((acc, h) => acc + (h.marketValue ?? 0), 0) / totalValid
    : null

  return { beta, volatility30d, topHoldingTicker, topHoldingWeight, top3Concentration }
}

export function computeAnnualizedVolatility(closes: number[]): number | null {
  if (closes.length < 2) return null
  const returns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]
    const curr = closes[i]
    if (prev > 0) returns.push((curr - prev) / prev)
  }
  if (returns.length < 2) return null
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(252)
}
