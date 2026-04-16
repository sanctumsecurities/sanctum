export interface Holding {
  id: string
  user_id: string
  ticker: string
  shares: number
  avg_cost: number
  created_at: string
  updated_at: string
}

export interface HoldingSnapshot {
  ticker: string
  price: number | null
  prevClose: number | null
  isExtendedHours: boolean
  beta: number | null
  volatility30d: number | null
  sector: string | null
  name: string | null
}

export type SnapshotMap = Record<string, HoldingSnapshot>

export interface EnrichedHolding extends Holding {
  snapshot: HoldingSnapshot | null
  marketValue: number | null
  costBasis: number
  plDollar: number | null
  plPercent: number | null
  dayChangeDollar: number | null
  dayChangePercent: number | null
  weight: number | null
}

export interface PortfolioTotals {
  totalValue: number
  totalCost: number
  totalPlDollar: number
  totalPlPercent: number
  dayChangeDollar: number
  dayChangePercent: number
  hasIncomplete: boolean
}

export interface AllocationSlice {
  label: string
  value: number
  percent: number
}

export interface TopMovers {
  winners: EnrichedHolding[]
  losers: EnrichedHolding[]
}

export interface RiskStats {
  beta: number | null
  volatility30d: number | null
  topHoldingTicker: string | null
  topHoldingWeight: number | null
  top3Concentration: number | null
}
