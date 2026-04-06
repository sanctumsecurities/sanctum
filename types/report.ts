export interface StockReport {
  // === Existing fields (unchanged) ===
  ticker: string
  companyName: string
  exchange: string
  currentPrice: string
  priceVsATH: string
  marketCap: string
  website: string
  verdict: 'BUY' | 'SELL' | 'HOLD' | 'AVOID'
  verdictSubtitle: string
  badges: { text: string; sentiment: 'positive' | 'negative' | 'neutral' | 'caution'; reason?: string }[]

  // === NEW: Root-level conviction ===
  convictionScore: number // 0-100, AI-generated

  overview: {
    keyMetrics: { label: string; value: string; subtitle?: string; color?: string; yoyChange?: string }[]
    businessSummary: {
      businessModel: string
      financials: string
      valuation: string
    }
    whatHasGoneWrong: string | null
    segmentBreakdown: { name: string; percentage: number }[]
    moatScores: { metric: string; score: number }[]
    // === NEW ===
    sectorMoatScores: { metric: string; score: number }[]
    analystConsensus: {
      meanTarget: string
      lowTarget: string
      highTarget: string
      numberOfAnalysts: number
      recommendation: string
    }
    institutionalOwnership: string
    insiderActivity: {
      netBuys90Days: number
      notable: string
    } | null
    revenueCagr: { fiveYear: string; tenYear: string | null }
    netIncomeCagr: { fiveYear: string; tenYear: string | null }
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
      // === NEW ===
      grossMargin: string
      operatingMargin: string
      fcf: string
    }[]
    callout: string
    // === NEW ===
    revenueVsCogs: {
      year: string; revenue: number; cogs: number; grossProfit: number
    }[]
    marginTrends: {
      year: string; gross: number; operating: number; net: number
    }[]
    dividendData: {
      currentYield: string
      payoutRatio: string
      fiveYearCagr: string
      tenYearCagr: string | null
      consecutiveYearsGrowth: number | null
      fcfVsDividends: {
        year: string; fcf: number; dividendsPaid: number
      }[]
    } | null
    cagrs: {
      revenue: { fiveYear: string; tenYear: string | null }
      netIncome: { fiveYear: string; tenYear: string | null }
      eps: { fiveYear: string; tenYear: string | null }
    }
  }

  valuation: {
    bullCase: string
    bearCase: string
    metrics: {
      metric: string; current: string; fiveYearAvg: string; commentary: string
      // === NEW ===
      sectorMedian: string
    }[]
    // === NEW ===
    analystTargetRange: {
      low: number; mean: number; median: number; high: number
      currentPrice: number
      numberOfAnalysts: number
    }
    historicalPE: { year: string; pe: number }[]
    sectorMedianPE: number
  }

  catalysts: {
    catalystTable: {
      timeline: string; catalyst: string; impact: string; probability: string
      // === NEW ===
      timeframe: 'NEAR' | 'MEDIUM' | 'LONG'
      conviction: number
    }[]
    risks: {
      risk: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; description: string
      // === NEW ===
      likelihood: 'HIGH' | 'MEDIUM' | 'LOW'
      timeframe: 'NEAR' | 'MEDIUM' | 'LONG'
    }[]
    // === NEW ===
    recommendationTrend: {
      month: string; buy: number; hold: number; sell: number
    }[]
    insiderTimeline: {
      date: string; type: 'BUY' | 'SELL'; shares: number; value: string
    }[] | null
  }

  verdictDetails: {
    bullCase: { priceTarget: string; return: string; description: string }
    baseCase: { priceTarget: string; return: string; description: string }
    bearCase: { priceTarget: string; return: string; description: string }
    scenarioMatrix: {
      scenario: string; probability: string; priceTarget: string; return: string; weighted: string
      // === NEW ===
      keyAssumptions: string[]
    }[]
    multiYearProjections: {
      horizon: string; bearCase: string; baseCase: string; bullCase: string; commentary: string
      // === NEW ===
      impliedCagr: string
    }[]
    priceProjectionChart: {
      year: string; bear: number; base: number; bull: number
      // === NEW ===
      analystMean: number
    }[]
    syndicateVerdict: {
      rating: 'BUY' | 'SELL' | 'HOLD' | 'AVOID'
      positionSizing: string
      keySignalTitle: string
      keySignalDetail: string
      honestRisk: string
      howToPosition: string
      longTermThesis: string
    }
    // === NEW ===
    convictionScore: number
    convictionDrivers: string
  }

  // === Quant pre-score (computed from Yahoo data before Gemini call) ===
  quantSignal: {
    score: number
    verdict: 'BUY' | 'SELL' | 'HOLD' | 'AVOID'
    factors: {
      name: string
      rawValue: string
      score: number
      weight: number
      contribution: number
    }[]
    skippedFactors: string[]
  }

  // === Gemini chain-of-thought reasoning ===
  reasoningTrace: {
    quantAgreement: string
    qualitativeOverrides: string
    macroImpact: string
    finalRationale: string
  }

  // === true when Gemini verdict diverges from quant verdict (or was vetoed) ===
  splitSignal: boolean

  // === Post-Gemini source-of-truth validation ===
  dataValidation: {
    flaggedClaims: {
      field: string
      claim: string
      sourceValue: string
      geminiValue: string
      severity: 'low' | 'medium' | 'high'
    }[]
    validationScore: number
    totalChecked: number
    totalFlagged: number
  }

  // === Macro environment snapshot used for this report ===
  macroContext: {
    vix: { level: number; classification: string } | null
    tenYearYield: number | null
    sp500: { price: number; fiftyDayAvg: number; twoHundredDayAvg: number } | null
    yieldCurve: { spread: number; status: 'inverted' | 'flat' | 'normal' } | null
    fetchedAt: string
  } | null
}
