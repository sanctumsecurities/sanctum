'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { StockReport } from '@/types/report'
import yahooFinance from 'yahoo-finance2'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// ── Helper functions ──

function cagr(start: number, end: number, years: number): string | null {
  if (!start || start <= 0 || !end || end <= 0 || years <= 0) return null
  const rate = Math.pow(end / start, 1 / years) - 1
  return `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(1)}%`
}

function fmtB(n: number): string {
  return `$${(n / 1e9).toFixed(1)}B`
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function safeNum(val: any, fallback = 0): number {
  if (val === undefined || val === null || isNaN(val)) return fallback
  return typeof val === 'object' && 'raw' in val ? val.raw : Number(val)
}

// ── Yahoo Finance data fetching ──

async function fetchYahooData(ticker: string) {
  try {
    const result: any = await yahooFinance.quoteSummary(ticker, {
      modules: [
        'price',
        'summaryDetail',
        'defaultKeyStatistics',
        'financialData',
        'incomeStatementHistory',
        'cashflowStatementHistory',
        'balanceSheetHistory',
        'earningsTrend',
        'majorHoldersBreakdown',
        'insiderTransactions',
        'recommendationTrend',
      ] as any,
    }, { validateResult: false })

    const price = result.price || {}
    const summary = result.summaryDetail || {}
    const keyStats = result.defaultKeyStatistics || {}
    const financial = result.financialData || {}
    const incomeHistory = result.incomeStatementHistory?.incomeStatementHistory || []
    const cashflowHistory = result.cashflowStatementHistory?.cashflowStatements || []
    const majorHolders = result.majorHoldersBreakdown || {}
    const insiderTxns = result.insiderTransactions?.transactions || []
    const recTrend = result.recommendationTrend?.trend || []

    // Sort income statements ascending by date
    const sortedIncome = [...incomeHistory].sort(
      (a: any, b: any) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
    )

    // Sort cash flow statements ascending by date
    const sortedCashflow = [...cashflowHistory].sort(
      (a: any, b: any) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
    )

    // ── Revenue history & margin trends ──
    const revenueHistory = sortedIncome.map((stmt: any) => ({
      year: new Date(stmt.endDate).getFullYear().toString(),
      revenue: safeNum(stmt.totalRevenue),
      netIncome: safeNum(stmt.netIncome),
    }))

    const revenueVsCogs = sortedIncome.map((stmt: any) => {
      const rev = safeNum(stmt.totalRevenue)
      const costOfRevenue = safeNum(stmt.costOfRevenue)
      return {
        year: new Date(stmt.endDate).getFullYear().toString(),
        revenue: parseFloat((rev / 1e9).toFixed(1)),
        cogs: parseFloat((costOfRevenue / 1e9).toFixed(1)),
        grossProfit: parseFloat(((rev - costOfRevenue) / 1e9).toFixed(1)),
      }
    })

    const marginTrends = sortedIncome.map((stmt: any) => {
      const rev = safeNum(stmt.totalRevenue)
      const costOfRevenue = safeNum(stmt.costOfRevenue)
      const opIncome = safeNum(stmt.operatingIncome)
      const netIncome = safeNum(stmt.netIncome)
      return {
        year: new Date(stmt.endDate).getFullYear().toString(),
        gross: rev > 0 ? parseFloat(((rev - costOfRevenue) / rev * 100).toFixed(1)) : 0,
        operating: rev > 0 ? parseFloat((opIncome / rev * 100).toFixed(1)) : 0,
        net: rev > 0 ? parseFloat((netIncome / rev * 100).toFixed(1)) : 0,
      }
    })

    // ── FCF history (operating cash flow - capex) ──
    const fcfHistory = sortedCashflow.map((stmt: any) => {
      const opCF = safeNum(stmt.totalCashFromOperatingActivities)
      const capex = Math.abs(safeNum(stmt.capitalExpenditures))
      return {
        year: new Date(stmt.endDate).getFullYear().toString(),
        operatingCashFlow: opCF,
        capex: capex,
        fcf: opCF - capex,
        dividendsPaid: Math.abs(safeNum(stmt.dividendsPaid)),
      }
    })

    // ── CAGRs ──
    const revLen = revenueHistory.length
    const revenueCagr5 = revLen >= 2
      ? cagr(revenueHistory[Math.max(0, revLen - 5)].revenue, revenueHistory[revLen - 1].revenue, Math.min(revLen - 1, 4))
      : null
    const netIncomeArr = revenueHistory.filter(r => r.netIncome > 0)
    const niLen = netIncomeArr.length
    const netIncomeCagr5 = niLen >= 2
      ? cagr(netIncomeArr[Math.max(0, niLen - 5)].netIncome, netIncomeArr[niLen - 1].netIncome, Math.min(niLen - 1, 4))
      : null

    // ── Analyst targets ──
    const analystTargetRange = {
      low: safeNum(financial.targetLowPrice),
      mean: safeNum(financial.targetMeanPrice),
      median: safeNum(financial.targetMedianPrice),
      high: safeNum(financial.targetHighPrice),
      currentPrice: safeNum(price.regularMarketPrice),
      numberOfAnalysts: safeNum(financial.numberOfAnalystOpinions),
    }

    // ── Institutional ownership ──
    const institutionalOwnership = majorHolders.institutionsPercentHeld != null
      ? fmtPct(safeNum(majorHolders.institutionsPercentHeld))
      : 'N/A'

    // ── Insider activity ──
    let insiderActivity: { netBuys90Days: number; notable: string } | null = null
    let insiderTimeline: { date: string; type: 'BUY' | 'SELL'; shares: number; value: string }[] | null = null

    if (insiderTxns.length > 0) {
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
      const recentTxns = insiderTxns.filter(
        (t: any) => new Date(t.startDate).getTime() > ninetyDaysAgo
      )
      const buys = recentTxns.filter((t: any) => safeNum(t.shares) > 0).length
      const sells = recentTxns.filter((t: any) => safeNum(t.shares) < 0).length
      const netBuys = buys - sells

      // Most notable transaction by value
      const sorted = [...recentTxns].sort(
        (a: any, b: any) => Math.abs(safeNum(b.value)) - Math.abs(safeNum(a.value))
      )
      const notable = sorted.length > 0
        ? `${sorted[0].filerName || 'Insider'}: ${safeNum(sorted[0].shares) > 0 ? 'bought' : 'sold'} ${Math.abs(safeNum(sorted[0].shares)).toLocaleString()} shares`
        : `${buys} buys, ${sells} sells in 90 days`

      insiderActivity = { netBuys90Days: netBuys, notable }

      insiderTimeline = insiderTxns.slice(0, 20).map((t: any) => ({
        date: new Date(t.startDate).toISOString().split('T')[0],
        type: safeNum(t.shares) > 0 ? 'BUY' as const : 'SELL' as const,
        shares: Math.abs(safeNum(t.shares)),
        value: fmtB(Math.abs(safeNum(t.value))),
      }))
    }

    // ── Recommendation trend (last 4 months) ──
    const recommendationTrend = recTrend.slice(0, 4).map((t: any) => ({
      month: t.period || '',
      buy: safeNum(t.strongBuy) + safeNum(t.buy),
      hold: safeNum(t.hold),
      sell: safeNum(t.sell) + safeNum(t.strongSell),
    }))

    // ── Analyst consensus label ──
    const totalRec = recommendationTrend.reduce((sum: number, r: any) => sum + r.buy + r.hold + r.sell, 0)
    const totalBuys = recommendationTrend.reduce((sum: number, r: any) => sum + r.buy, 0)
    const totalSells = recommendationTrend.reduce((sum: number, r: any) => sum + r.sell, 0)
    let recommendation = 'Hold'
    if (totalRec > 0) {
      const buyPct = totalBuys / totalRec
      const sellPct = totalSells / totalRec
      if (buyPct > 0.6) recommendation = 'Buy'
      else if (sellPct > 0.4) recommendation = 'Sell'
    }

    // ── Dividend data (conditional on yield > 0) ──
    let dividendData: StockReport['financials']['dividendData'] = null
    const divYield = safeNum(summary.dividendYield)
    if (divYield > 0) {
      const payoutRatio = safeNum(summary.payoutRatio)
      const fcfVsDividends = fcfHistory
        .filter(f => f.dividendsPaid > 0)
        .map(f => ({
          year: f.year,
          fcf: parseFloat((f.fcf / 1e9).toFixed(1)),
          dividendsPaid: parseFloat((f.dividendsPaid / 1e9).toFixed(1)),
        }))

      dividendData = {
        currentYield: fmtPct(divYield),
        payoutRatio: fmtPct(payoutRatio),
        fiveYearCagr: 'N/A', // would need historical dividend data not available in quoteSummary
        tenYearCagr: null,
        consecutiveYearsGrowth: null,
        fcfVsDividends,
      }
    }

    // ── Expanded annual column data (for merging into Gemini annualData) ──
    const expandedAnnualColumns = sortedIncome.map((stmt: any) => {
      const year = new Date(stmt.endDate).getFullYear().toString()
      const rev = safeNum(stmt.totalRevenue)
      const costOfRevenue = safeNum(stmt.costOfRevenue)
      const opIncome = safeNum(stmt.operatingIncome)
      const grossMarginVal = rev > 0 ? (rev - costOfRevenue) / rev : 0
      const opMarginVal = rev > 0 ? opIncome / rev : 0

      // Match FCF for this year
      const fcfEntry = fcfHistory.find(f => f.year === year)
      const fcfVal = fcfEntry ? fcfEntry.fcf : 0

      return {
        year,
        grossMargin: fmtPct(grossMarginVal),
        operatingMargin: fmtPct(opMarginVal),
        fcf: fmtB(fcfVal),
      }
    })

    // ── PE ratios ──
    const currentPE = safeNum(summary.trailingPE) || safeNum(keyStats.trailingPE)
    const forwardPE = safeNum(summary.forwardPE) || safeNum(keyStats.forwardPE)

    return {
      revenueCagr: { fiveYear: revenueCagr5 || 'N/A', tenYear: null },
      netIncomeCagr: { fiveYear: netIncomeCagr5 || 'N/A', tenYear: null },
      institutionalOwnership,
      insiderActivity,
      analystConsensus: {
        meanTarget: `$${analystTargetRange.mean.toFixed(0)}`,
        lowTarget: `$${analystTargetRange.low.toFixed(0)}`,
        highTarget: `$${analystTargetRange.high.toFixed(0)}`,
        numberOfAnalysts: analystTargetRange.numberOfAnalysts,
        recommendation,
      },
      analystTargetRange,
      revenueVsCogs,
      marginTrends,
      dividendData,
      cagrs: {
        revenue: { fiveYear: revenueCagr5 || 'N/A', tenYear: null },
        netIncome: { fiveYear: netIncomeCagr5 || 'N/A', tenYear: null },
        eps: { fiveYear: 'N/A', tenYear: null }, // EPS CAGR would need per-share data
      },
      expandedAnnualColumns,
      recommendationTrend,
      insiderTimeline,
      currentPE,
      forwardPE,
    }
  } catch (err) {
    console.error('fetchYahooData failed:', err)
    return null
  }
}

export async function generateReport(ticker: string): Promise<StockReport | { error: string }> {
  const symbol = ticker.toUpperCase().trim()
  if (!symbol) return { error: 'Ticker is required' }

  try {
    // Fetch expanded Yahoo Finance data
    const yahoo = await fetchYahooData(symbol)

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const prompt = `You are a senior equity analyst at an elite hedge fund. Generate a deeply researched, institutional-quality stock analysis report for the ticker: ${symbol}.

Return ONLY a raw JSON object. No markdown. No backticks. No preamble. Just JSON.

Schema:
{
  "ticker": "string",
  "companyName": "string",
  "exchange": "string",
  "currentPrice": "string (e.g. '$174.50')",
  "priceVsATH": "string (e.g. '-55% from ATH $627')",
  "marketCap": "string (e.g. '~$256B')",
  "website": "string (company website URL, e.g. 'https://www.apple.com')",
  "verdict": "BUY" | "SELL" | "HOLD" | "AVOID",
  "verdictSubtitle": "string — one-line thesis",
  "badges": ["string — contextual badges like 'DOJ Investigation', 'Buffett Bought', 'Mkt Cap ~$256B'"],
  "overview": {
    "keyMetrics": [
      { "label": "string", "value": "string", "subtitle": "string or omit", "color": "string hex or omit" }
    ],
    "businessSummary": "string — 3 paragraphs separated by \\n\\n",
    "whatHasGoneWrong": "string or null — if company is under stress, explain what went wrong",
    "segmentBreakdown": [{ "name": "string", "percentage": number }],
    "moatScores": [{ "metric": "string", "score": number 0-100 }]
  },
  "financials": {
    "narrativeSummary": "string — 2-3 paragraphs separated by \\n\\n",
    "annualData": [
      { "year": "string", "revenue": number (in billions), "revenueGrowth": "string (e.g. '+8.2%')", "adjEPS": number, "epsGrowth": "string", "opCF": "string (e.g. '$24.3B')", "keyMetric": "string (relevant KPI)" }
    ],
    "callout": "string — single most important financial warning or insight"
  },
  "valuation": {
    "bullCase": "string — detailed bull case paragraph",
    "bearCase": "string — detailed bear case paragraph",
    "metrics": [{ "metric": "string", "current": "string", "fiveYearAvg": "string", "commentary": "string" }]
  },
  "catalysts": {
    "catalystTable": [{ "timeline": "string", "catalyst": "string", "impact": "string (use arrow like '↑ Positive' or '↓ Negative')", "probability": "string" }],
    "risks": [{ "risk": "string", "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "description": "string" }]
  },
  "verdictDetails": {
    "bullCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "baseCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "bearCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "scenarioMatrix": [{ "scenario": "string", "probability": "string", "priceTarget": "string", "return": "string", "weighted": "string" }],
    "multiYearProjections": [{ "horizon": "string", "bearCase": "string", "baseCase": "string", "bullCase": "string", "commentary": "string" }],
    "priceProjectionChart": [{ "year": "string", "bear": number, "base": number, "bull": number }],
    "syndicateVerdict": {
      "rating": "BUY" | "SELL" | "HOLD" | "AVOID",
      "positionSizing": "string — position sizing recommendation",
      "keySignalTitle": "string — dynamic signal title (e.g. 'The Buffett Signal')",
      "keySignalDetail": "string — paragraph explaining the signal",
      "honestRisk": "string — paragraph on the honest risk",
      "howToPosition": "string — paragraph on entry strategy and sizing",
      "longTermThesis": "string — paragraph on 5-10 year outlook"
    }
  }
}

Requirements:
- overview.keyMetrics: exactly 6 items: Market Cap, FY Revenue, Next Year Revenue Est., Adj EPS, Op Cash Flow, Dividend/Yield
- overview.moatScores: exactly 6 items scoring competitive advantages on 0-100 scale
- overview.segmentBreakdown: 3-8 revenue segments that sum close to 100
- financials.annualData: 4-5 years of data
- catalysts.catalystTable: 4-6 catalysts
- catalysts.risks: 4-6 risks ordered by severity
- verdictDetails.scenarioMatrix: 3 rows (Bull/Base/Bear) + 1 Expected Value row
- verdictDetails.multiYearProjections: 3 rows (3-year, 5-year, 10-year)
- verdictDetails.priceProjectionChart: 5-6 data points for chart (current year through 5 years out)
- Be specific to THIS company — no generic filler
- Return ONLY the JSON object, no wrapping`

    const result = await model.generateContent(prompt)
    const text = result.response.text()
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as StockReport

    // ── Merge Yahoo Finance data into Gemini response ──
    if (yahoo) {
      // 1. Overview fields
      parsed.overview.revenueCagr = yahoo.revenueCagr
      parsed.overview.netIncomeCagr = yahoo.netIncomeCagr
      parsed.overview.institutionalOwnership = yahoo.institutionalOwnership
      parsed.overview.insiderActivity = yahoo.insiderActivity
      parsed.overview.analystConsensus = yahoo.analystConsensus

      // 2. Financials fields
      parsed.financials.revenueVsCogs = yahoo.revenueVsCogs
      parsed.financials.marginTrends = yahoo.marginTrends
      parsed.financials.dividendData = yahoo.dividendData
      parsed.financials.cagrs = yahoo.cagrs

      // 3. Merge expanded columns into annualData by matching year
      if (parsed.financials.annualData && yahoo.expandedAnnualColumns.length > 0) {
        parsed.financials.annualData = parsed.financials.annualData.map(row => {
          const match = yahoo.expandedAnnualColumns.find(c => c.year === row.year)
          return {
            ...row,
            adjEPS: row.adjEPS ?? 0,
            grossMargin: match?.grossMargin ?? '0.0%',
            operatingMargin: match?.operatingMargin ?? '0.0%',
            fcf: match?.fcf ?? '$0.0B',
          }
        })
      }

      // 4. Valuation fields
      parsed.valuation.analystTargetRange = yahoo.analystTargetRange

      // 5. Catalysts fields
      parsed.catalysts.recommendationTrend = yahoo.recommendationTrend
      parsed.catalysts.insiderTimeline = yahoo.insiderTimeline
    } else {
      // Yahoo fetch failed — provide safe defaults for Yahoo-sourced fields
      parsed.overview.revenueCagr = { fiveYear: 'N/A', tenYear: null }
      parsed.overview.netIncomeCagr = { fiveYear: 'N/A', tenYear: null }
      parsed.overview.institutionalOwnership = 'N/A'
      parsed.overview.insiderActivity = null
      parsed.overview.analystConsensus = {
        meanTarget: 'N/A', lowTarget: 'N/A', highTarget: 'N/A',
        numberOfAnalysts: 0, recommendation: 'N/A',
      }
      parsed.financials.revenueVsCogs = []
      parsed.financials.marginTrends = []
      parsed.financials.dividendData = null
      parsed.financials.cagrs = {
        revenue: { fiveYear: 'N/A', tenYear: null },
        netIncome: { fiveYear: 'N/A', tenYear: null },
        eps: { fiveYear: 'N/A', tenYear: null },
      }
      if (parsed.financials.annualData) {
        parsed.financials.annualData = parsed.financials.annualData.map(row => ({
          ...row,
          adjEPS: row.adjEPS ?? 0,
          grossMargin: '0.0%',
          operatingMargin: '0.0%',
          fcf: '$0.0B',
        }))
      }
      parsed.valuation.analystTargetRange = {
        low: 0, mean: 0, median: 0, high: 0, currentPrice: 0, numberOfAnalysts: 0,
      }
      parsed.catalysts.recommendationTrend = []
      parsed.catalysts.insiderTimeline = null
    }

    // ── Safe defaults for fields Gemini might omit ──
    parsed.convictionScore = parsed.convictionScore ?? 50
    parsed.overview.sectorMoatScores = parsed.overview.sectorMoatScores ?? []
    parsed.valuation.historicalPE = parsed.valuation.historicalPE ?? []
    parsed.valuation.sectorMedianPE = parsed.valuation.sectorMedianPE ?? 0

    // Ensure valuation metrics have sectorMedian
    if (parsed.valuation.metrics) {
      parsed.valuation.metrics = parsed.valuation.metrics.map(m => ({
        ...m,
        sectorMedian: m.sectorMedian ?? 'N/A',
      }))
    }

    // Ensure catalyst table entries have new fields
    if (parsed.catalysts.catalystTable) {
      parsed.catalysts.catalystTable = parsed.catalysts.catalystTable.map(c => ({
        ...c,
        timeframe: c.timeframe ?? 'MEDIUM',
        conviction: c.conviction ?? 50,
      }))
    }

    // Ensure risks have new fields
    if (parsed.catalysts.risks) {
      parsed.catalysts.risks = parsed.catalysts.risks.map(r => ({
        ...r,
        likelihood: r.likelihood ?? 'MEDIUM',
        timeframe: r.timeframe ?? 'MEDIUM',
      }))
    }

    // Ensure scenario matrix entries have keyAssumptions
    if (parsed.verdictDetails.scenarioMatrix) {
      parsed.verdictDetails.scenarioMatrix = parsed.verdictDetails.scenarioMatrix.map(s => ({
        ...s,
        keyAssumptions: s.keyAssumptions ?? [],
      }))
    }

    // Ensure multi-year projections have impliedCagr
    if (parsed.verdictDetails.multiYearProjections) {
      parsed.verdictDetails.multiYearProjections = parsed.verdictDetails.multiYearProjections.map(p => ({
        ...p,
        impliedCagr: p.impliedCagr ?? 'N/A',
      }))
    }

    // Ensure price projection chart entries have analystMean
    if (parsed.verdictDetails.priceProjectionChart) {
      const analystMean = yahoo?.analystTargetRange.mean ?? 0
      parsed.verdictDetails.priceProjectionChart = parsed.verdictDetails.priceProjectionChart.map(p => ({
        ...p,
        analystMean: p.analystMean ?? analystMean,
      }))
    }

    // Verdict details conviction
    parsed.verdictDetails.convictionScore = parsed.verdictDetails.convictionScore ?? parsed.convictionScore
    parsed.verdictDetails.convictionDrivers = parsed.verdictDetails.convictionDrivers ?? ''

    return parsed
  } catch (err: any) {
    return { error: err.message || 'Failed to generate report' }
  }
}
