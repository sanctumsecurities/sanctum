export interface StockReport {
  ticker: string
  companyName: string
  exchange: string
  currentPrice: string
  priceVsATH: string
  marketCap: string
  website: string
  verdict: 'BUY' | 'SELL' | 'HOLD' | 'AVOID'
  verdictSubtitle: string
  badges: string[]
  overview: {
    keyMetrics: { label: string; value: string; subtitle?: string; color?: string }[]
    businessSummary: string
    whatHasGoneWrong: string | null
    segmentBreakdown: { name: string; percentage: number }[]
    moatScores: { metric: string; score: number }[]
  }
  financials: {
    narrativeSummary: string
    annualData: {
      year: string
      revenue: number
      revenueGrowth: string
      adjEPS: number
      epsGrowth: string
      opCF: string
      keyMetric: string
    }[]
    callout: string
  }
  valuation: {
    bullCase: string
    bearCase: string
    metrics: { metric: string; current: string; fiveYearAvg: string; commentary: string }[]
  }
  catalysts: {
    catalystTable: { timeline: string; catalyst: string; impact: string; probability: string }[]
    risks: { risk: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; description: string }[]
  }
  verdictDetails: {
    bullCase: { priceTarget: string; return: string; description: string }
    baseCase: { priceTarget: string; return: string; description: string }
    bearCase: { priceTarget: string; return: string; description: string }
    scenarioMatrix: { scenario: string; probability: string; priceTarget: string; return: string; weighted: string }[]
    multiYearProjections: { horizon: string; bearCase: string; baseCase: string; bullCase: string; commentary: string }[]
    priceProjectionChart: { year: string; bear: number; base: number; bull: number }[]
    syndicateVerdict: {
      rating: 'BUY' | 'SELL' | 'HOLD' | 'AVOID'
      positionSizing: string
      keySignalTitle: string
      keySignalDetail: string
      honestRisk: string
      howToPosition: string
      longTermThesis: string
    }
  }
}
