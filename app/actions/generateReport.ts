'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { StockReport } from '@/types/report'
import { yahooFinance } from '@/lib/yahoo'

function getGenAI() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not configured')
  return new GoogleGenerativeAI(key)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Request timed out')), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

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

    // Fetch recent news headlines
    let recentNews: { title: string; date: string }[] = []
    try {
      const newsResults: any = await yahooFinance.search(ticker, { newsCount: 10, quotesCount: 0 })
      recentNews = (newsResults.news || []).slice(0, 10).map((n: any) => ({
        title: n.title || '',
        date: n.providerPublishTime instanceof Date
          ? n.providerPublishTime.toISOString().split('T')[0]
          : typeof n.providerPublishTime === 'number'
            ? new Date(n.providerPublishTime * 1000).toISOString().split('T')[0]
            : '',
      }))
    } catch {
      // News is supplementary — continue without it
    }

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

    // ── Beta ──
    const beta = safeNum(summary.beta) || safeNum(keyStats.beta)

    // ── Live price data for header overrides ──
    const livePrice = safeNum(price.regularMarketPrice)
    const prevClose = safeNum(price.regularMarketPreviousClose)
    const fiftyTwoWeekHigh = safeNum(summary.fiftyTwoWeekHigh)
    const marketCapRaw = safeNum(price.marketCap)
    const epsTrailing = safeNum(keyStats.trailingEps) || safeNum(financial.earningsPerShare)

    // Format market cap
    let marketCapStr = ''
    if (marketCapRaw >= 1e12) marketCapStr = `~$${(marketCapRaw / 1e12).toFixed(2)}T`
    else if (marketCapRaw >= 1e9) marketCapStr = `~$${(marketCapRaw / 1e9).toFixed(0)}B`
    else if (marketCapRaw >= 1e6) marketCapStr = `~$${(marketCapRaw / 1e6).toFixed(0)}M`
    else marketCapStr = `$${marketCapRaw.toLocaleString()}`

    // Price vs ATH
    const priceVsATH = fiftyTwoWeekHigh > 0 && livePrice > 0
      ? `${((livePrice / fiftyTwoWeekHigh - 1) * 100).toFixed(0)}% from 52wk high $${fiftyTwoWeekHigh.toFixed(2)}`
      : ''

    // Latest annual revenue for display
    const latestRevenue = revenueVsCogs.length > 0 ? revenueVsCogs[revenueVsCogs.length - 1].revenue : 0

    return {
      // Live price data
      livePrice,
      livePriceStr: `$${livePrice.toFixed(2)}`,
      marketCap: marketCapStr,
      marketCapRaw,
      priceVsATH,
      epsTrailing,
      latestRevenue,
      prevClose,
      // Existing fields
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
        eps: { fiveYear: 'N/A', tenYear: null },
      },
      expandedAnnualColumns,
      recommendationTrend,
      insiderTimeline,
      currentPE,
      forwardPE,
      beta,
      recentNews,
    }
  } catch (err) {
    console.error('fetchYahooData failed:', err)
    return null
  }
}

export async function generateReport(ticker: string): Promise<StockReport | { error: string }> {
  const symbol = ticker.toUpperCase().trim()
  if (!symbol) return { error: 'Ticker is required' }
  if (symbol.length > 20 || !/^[A-Z0-9.\-^=]+$/.test(symbol)) return { error: 'Invalid ticker symbol' }

  try {
    // Fetch expanded Yahoo Finance data
    const yahoo = await fetchYahooData(symbol)

    const genAI = getGenAI()
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

    const yahooContext = yahoo ? `
MARKET DATA:
- Current Price: $${yahoo.livePrice.toFixed(2)}
- Market Cap: ${yahoo.marketCap}
- Price vs 52-Week High: ${yahoo.priceVsATH}
- Beta: ${yahoo.beta.toFixed(2)}
- EPS (Trailing): $${yahoo.epsTrailing.toFixed(2)}
- Latest Annual Revenue: $${yahoo.latestRevenue.toFixed(1)}B
- Analyst Targets: Low $${yahoo.analystTargetRange.low.toFixed(2)}, Mean $${yahoo.analystTargetRange.mean.toFixed(2)}, High $${yahoo.analystTargetRange.high.toFixed(2)} (${yahoo.analystTargetRange.numberOfAnalysts} analysts)
- Recommendation: ${yahoo.analystConsensus.recommendation}
- Institutional Ownership: ${yahoo.institutionalOwnership}
- Trailing P/E: ${yahoo.currentPE.toFixed(1)}, Forward P/E: ${yahoo.forwardPE.toFixed(1)}
- Dividend Yield: ${yahoo.dividendData ? yahoo.dividendData.currentYield : '0%'}
- Revenue vs COGS: ${JSON.stringify(yahoo.revenueVsCogs.map((r: any) => ({ year: r.year, revenue: r.revenue + 'B', cogs: r.cogs + 'B', grossProfit: r.grossProfit + 'B' })))}
- Margin Trends: ${JSON.stringify(yahoo.marginTrends.map((m: any) => ({ year: m.year, gross: m.gross.toFixed(1) + '%', operating: m.operating.toFixed(1) + '%', net: m.net.toFixed(1) + '%' })))}
- Revenue CAGR (5yr): ${yahoo.revenueCagr.fiveYear || 'N/A'}
- Net Income CAGR (5yr): ${yahoo.netIncomeCagr.fiveYear || 'N/A'}
- Insider Activity: ${yahoo.insiderActivity ? 'Net buys (90d): ' + yahoo.insiderActivity.netBuys90Days + ', Notable: ' + yahoo.insiderActivity.notable : 'No data'}
- Recommendation Trend: ${JSON.stringify(yahoo.recommendationTrend)}

RECENT NEWS & EVENTS:
${yahoo.recentNews.length > 0 ? yahoo.recentNews.map((n: any) => `- ${n.date}: ${n.title}`).join('\n') : '- No recent news available'}
` : ''

    const prompt = `You are a quantitative equity strategist. You write dense, forward-looking analysis. Every sentence either cites a number or makes a falsifiable prediction. No filler. If a sentence could apply to any company, delete it.

Here is today's market data and recent news for ${symbol} as of ${new Date().toISOString().split('T')[0]}. Your job is to ANALYZE this data, not repeat it. Data-sourced fields (prices, margins, analyst targets, insider activity) will be injected separately into the report — you do not generate them. Focus on interpretation, thesis, and forward scenarios.
${yahooContext}
DIRECTIVES:
1. Ground every claim in provided data — reference specific margins, growth rates, and multiples.
2. Focus on what changes from here. Historical context only to support a forward thesis.
3. Incorporate the recent news and events above into your catalysts and risk assessment. Use your broader knowledge of market conditions, regulatory environment, and industry trends to fill gaps.
4. Bull/bear cases must include specific price targets derived from stated assumptions (multiple x earnings).
5. All prose fields: 2-3 sentences max. If you need more, the insight isn't sharp enough.
6. whatHasGoneWrong should be null unless there's a genuine material negative — don't manufacture problems.
7. Assign conviction scores (0-100) where requested. 0 = no confidence, 100 = maximum conviction.
8. Use temporal buckets: NEAR (0-6 months), MEDIUM (6-18 months), LONG (18+ months).

Return ONLY a raw JSON object. No markdown. No backticks. No preamble. Just JSON.

Schema:
{
  "ticker": "string",
  "companyName": "string",
  "exchange": "string",
  "website": "string (company URL, e.g. 'https://www.apple.com')",
  "verdict": "BUY" | "SELL" | "HOLD" | "AVOID",
  "verdictSubtitle": "string — one-line thesis, max 10 words",
  "convictionScore": number (0-100),
  "badges": ["string — 4-6 contextual tags like 'DOJ Investigation', 'Buffett Bought', 'Mkt Cap ~$256B'"],
  "overview": {
    "keyMetrics": [
      { "label": "string", "value": "string", "subtitle": "string or omit", "color": "hex or omit", "yoyChange": "string like '+12.3%'" }
    ],
    "businessSummary": "string — 2-3 sentences, what this company does and why it matters NOW",
    "whatHasGoneWrong": "string or null — only if genuine material negative exists",
    "segmentBreakdown": [{ "name": "string", "percentage": number }],
    "moatScores": [{ "metric": "string", "score": number 0-100 }],
    "sectorMoatScores": [{ "metric": "string", "score": number 0-100 — sector median for same metrics }]
  },
  "financials": {
    "narrativeSummary": "string — 2-3 sentences on financial trajectory and what the numbers say about the future",
    "annualData": [
      { "year": "string", "revenue": number (billions), "revenueGrowth": "string", "adjEPS": number, "epsGrowth": "string", "opCF": "string", "keyMetric": "string — most relevant KPI for this year" }
    ],
    "callout": "string — single most important financial insight or warning"
  },
  "valuation": {
    "bullCase": "string — 2-3 sentences, quantitative, with price math (multiple x earnings = target)",
    "bearCase": "string — 2-3 sentences, quantitative, with price math",
    "metrics": [{ "metric": "string", "current": "string", "fiveYearAvg": "string", "sectorMedian": "string", "commentary": "string — one sentence, forward-looking" }],
    "historicalPE": [{ "year": "string", "pe": number }],
    "sectorMedianPE": number
  },
  "catalysts": {
    "catalystTable": [{ "timeline": "string", "catalyst": "string", "impact": "string (use arrow like '↑ Positive' or '↓ Negative')", "probability": "string", "timeframe": "NEAR" | "MEDIUM" | "LONG", "conviction": number (0-100) }],
    "risks": [{ "risk": "string", "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "description": "string — one sentence", "likelihood": "HIGH" | "MEDIUM" | "LOW", "timeframe": "NEAR" | "MEDIUM" | "LONG" }]
  },
  "verdictDetails": {
    "bullCase": { "priceTarget": "string", "return": "string", "description": "string — 2-3 sentences" },
    "baseCase": { "priceTarget": "string", "return": "string", "description": "string — 2-3 sentences" },
    "bearCase": { "priceTarget": "string", "return": "string", "description": "string — 2-3 sentences" },
    "scenarioMatrix": [{ "scenario": "string", "probability": "string", "priceTarget": "string", "return": "string", "weighted": "string", "keyAssumptions": ["string — 2-3 per scenario"] }],
    "multiYearProjections": [{ "horizon": "string", "bearCase": "string", "baseCase": "string", "bullCase": "string", "commentary": "string — one sentence", "impliedCagr": "string" }],
    "priceProjectionChart": [{ "year": "string", "bear": number, "base": number, "bull": number, "analystMean": number — use analyst mean target from provided data }],
    "syndicateVerdict": {
      "rating": "BUY" | "SELL" | "HOLD" | "AVOID",
      "positionSizing": "string — specific portfolio % range with rationale",
      "keySignalTitle": "string — dynamic signal title",
      "keySignalDetail": "string — 2-3 sentences explaining the signal",
      "honestRisk": "string — 2-3 sentences on the honest risk",
      "howToPosition": "string — 2-3 sentences on entry strategy",
      "longTermThesis": "string — 2-3 sentences on 5-10 year outlook"
    },
    "convictionScore": number (0-100),
    "convictionDrivers": "string — 2-3 sentences on what drives or limits conviction"
  }
}

Requirements:
- overview.keyMetrics: exactly 8 items: Market Cap, FY Revenue, Revenue 5yr CAGR, Net Income 5yr CAGR, Beta, Forward P/E, Op Cash Flow, Dividend Yield (show "N/A" if no dividend). Include yoyChange for: Market Cap (YoY % change), FY Revenue (YoY % change), Revenue 5yr CAGR (the CAGR itself), Net Income 5yr CAGR (the CAGR itself), Op Cash Flow (YoY % change), Dividend Yield (YoY change). No yoyChange for Beta or Forward P/E.
- overview.moatScores: exactly 6 items, 0-100 scale
- overview.sectorMoatScores: exactly 6 items matching moatScores metrics
- overview.segmentBreakdown: 3-8 segments summing close to 100
- financials.annualData: 4-5 years
- valuation.historicalPE: 4-5 years
- catalysts.catalystTable: 4-6 catalysts
- catalysts.risks: 4-6 risks ordered by severity
- verdictDetails.scenarioMatrix: 3 rows (Bull/Base/Bear) + 1 Expected Value row, each with keyAssumptions (2-3 per scenario)
- verdictDetails.multiYearProjections: 3 rows (3-year, 5-year, 10-year) each with impliedCagr
- verdictDetails.priceProjectionChart: 5-6 data points (current year through 5 years out) each with analystMean
- verdictDetails.syndicateVerdict.positionSizing: must be specific portfolio percentage range with rationale
- Be specific to THIS company — no generic filler
- Return ONLY the JSON object, no wrapping`

    const result = await withTimeout(model.generateContent(prompt), 120_000)
    const text = result.response.text()
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as StockReport

    // ── Merge Yahoo Finance data into Gemini response ──
    if (yahoo) {
      // 0. Override header fields with LIVE Yahoo data
      if (yahoo.livePrice > 0) parsed.currentPrice = yahoo.livePriceStr
      if (yahoo.marketCap) parsed.marketCap = yahoo.marketCap
      if (yahoo.priceVsATH) parsed.priceVsATH = yahoo.priceVsATH

      // 1. Overview fields — replace EPS card with Beta (match either label)
      if (yahoo.beta > 0 && parsed.overview.keyMetrics) {
        const idx = parsed.overview.keyMetrics.findIndex(m => {
          const l = m.label.toLowerCase()
          return l.includes('beta') || l.includes('eps')
        })
        if (idx !== -1) {
          parsed.overview.keyMetrics[idx].label = 'Beta'
          parsed.overview.keyMetrics[idx].value = yahoo.beta.toFixed(2)
          parsed.overview.keyMetrics[idx].subtitle = 'vs. market volatility'
          delete (parsed.overview.keyMetrics[idx] as any).yoyChange
        }
      }
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
    console.error('[generateReport] failed:', err)
    const msg = err.message || ''
    if (msg.includes('GEMINI_API_KEY')) return { error: msg }
    if (msg.includes('timed out')) return { error: 'Report generation timed out. Please try again.' }
    return { error: 'Failed to generate report. Please try again.' }
  }
}
