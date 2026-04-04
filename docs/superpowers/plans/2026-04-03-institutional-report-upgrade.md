# Institutional-Grade Report Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Sanctum ticker report from a Gemini-only AI report to an institutional-grade research report backed by real Yahoo Finance data, enriched AI analysis with peer context and conviction scoring, and 12 interactive charts across 5 tabs.

**Architecture:** Data-layer-first approach. Task 1 expands the `StockReport` TypeScript interface. Task 2 expands Yahoo Finance data fetching and adds server-side derived calculations (CAGRs, margins, etc.). Task 3 rewrites the Gemini prompt to consume real data and produce richer output. Tasks 4-8 upgrade each tab component and shared UI primitives to render the enriched payload. Task 9 updates the shell component to pass new data slices.

**Tech Stack:** Next.js 14 App Router, TypeScript, Recharts, `yahoo-finance2`, `@google/generative-ai` (Gemini 2.5 Flash), Supabase

**Spec:** `docs/superpowers/specs/2026-04-03-institutional-report-upgrade-design.md`

---

## File Map

```
types/report.ts                              — Expand StockReport interface with new fields
app/actions/generateReport.ts                — Yahoo Finance expansion + CAGR calculations + enriched Gemini prompt + merge logic
components/reports/ReportUI.tsx               — Add RangeBar, ConvictionBadge shared primitives
components/reports/StockReport.tsx            — Pass new data slices to tab components
components/reports/tabs/OverviewTab.tsx       — Analyst consensus bar, institutional signals, upgraded donut + radar
components/reports/tabs/FinancialsTab.tsx     — Revenue vs COGS chart, margin trends, FCF vs dividends, dividend section, CAGR row
components/reports/tabs/ValuationTab.tsx      — Sector median column, analyst target range chart, historical P/E chart, structured bull/bear
components/reports/tabs/CatalystsTab.tsx      — Temporal columns, recommendation trend chart, insider timeline, upgraded risk cards
components/reports/tabs/VerdictTab.tsx        — Conviction score display, upgraded scenarios/matrix/projections/chart, syndicate card
```

---

### Task 1: Expand StockReport TypeScript Interface

**Files:**
- Modify: `types/report.ts`

This is the foundation — every other task depends on these types being correct.

- [ ] **Step 1: Add new fields to the StockReport interface**

Replace the entire contents of `types/report.ts` with:

```typescript
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
  badges: string[]

  // === NEW: Root-level conviction ===
  convictionScore: number // 0-100, AI-generated

  overview: {
    keyMetrics: { label: string; value: string; subtitle?: string; color?: string }[]
    businessSummary: string
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
}
```

- [ ] **Step 2: Verify the project builds with the new types**

Run: `npx tsc --noEmit 2>&1 | head -30`

Expected: Type errors in `generateReport.ts` and tab components because the server action doesn't yet return the new fields. This is expected — later tasks will fix them. The types file itself should have zero syntax errors.

- [ ] **Step 3: Commit**

```bash
git add types/report.ts
git commit -m "feat: expand StockReport interface with institutional-grade fields"
```

---

### Task 2: Expand Yahoo Finance Data Fetching & Derived Calculations

**Files:**
- Modify: `app/actions/generateReport.ts`

This task adds Yahoo Finance data fetching and server-side calculations. The Gemini prompt update is in Task 3 (separate concern). After this task, `generateReport` fetches expanded data and computes CAGRs/margins/arrays, but still uses the old Gemini prompt temporarily.

- [ ] **Step 1: Add yahoo-finance2 import and helper functions at the top of generateReport.ts**

Add above the `genAI` declaration:

```typescript
import yahooFinance from 'yahoo-finance2'

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
```

- [ ] **Step 2: Add the Yahoo Finance data fetching function**

Add below the helper functions:

```typescript
async function fetchYahooData(ticker: string) {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
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
      ],
    })

    // --- Income statement history (annual) ---
    const incomeStmts = (quote.incomeStatementHistory?.incomeStatementHistory || [])
      .sort((a: any, b: any) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())

    const revenueHistory = incomeStmts.map((s: any) => ({
      year: new Date(s.endDate).getFullYear().toString(),
      revenue: s.totalRevenue || 0,
      cogs: s.costOfRevenue || 0,
      grossProfit: s.grossProfit || 0,
      operatingIncome: s.operatingIncome || 0,
      netIncome: s.netIncome || 0,
    }))

    // --- Margin trends ---
    const marginTrends = revenueHistory.map((r: any) => ({
      year: r.year,
      gross: r.revenue ? (r.grossProfit / r.revenue) * 100 : 0,
      operating: r.revenue ? (r.operatingIncome / r.revenue) * 100 : 0,
      net: r.revenue ? (r.netIncome / r.revenue) * 100 : 0,
    }))

    // --- Revenue vs COGS ---
    const revenueVsCogs = revenueHistory.map((r: any) => ({
      year: r.year,
      revenue: r.revenue / 1e9,
      cogs: r.cogs / 1e9,
      grossProfit: r.grossProfit / 1e9,
    }))

    // --- Cash flow history ---
    const cfStmts = (quote.cashflowStatementHistory?.cashflowStatements || [])
      .sort((a: any, b: any) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())

    const fcfHistory = cfStmts.map((s: any) => ({
      year: new Date(s.endDate).getFullYear().toString(),
      fcf: ((s.totalCashFromOperatingActivities || 0) - (s.capitalExpenditures || 0)) / 1e9,
      dividendsPaid: Math.abs(s.dividendsPaid || 0) / 1e9,
    }))

    // --- CAGRs ---
    const revenues = revenueHistory.map((r: any) => r.revenue)
    const netIncomes = revenueHistory.map((r: any) => r.netIncome)
    const yearsAvailable = revenueHistory.length

    const revenueCagr = {
      fiveYear: yearsAvailable >= 2 ? cagr(revenues[0], revenues[revenues.length - 1], yearsAvailable - 1) : null,
      tenYear: null as string | null, // yahoo-finance2 typically provides 4-5 years
    }
    const netIncomeCagr = {
      fiveYear: yearsAvailable >= 2 ? cagr(netIncomes[0], netIncomes[netIncomes.length - 1], yearsAvailable - 1) : null,
      tenYear: null as string | null,
    }

    // --- Analyst data ---
    const fd = quote.financialData
    const analystTargetRange = {
      low: fd?.targetLowPrice || 0,
      mean: fd?.targetMeanPrice || 0,
      median: fd?.targetMedianPrice || 0,
      high: fd?.targetHighPrice || 0,
      currentPrice: fd?.currentPrice || 0,
      numberOfAnalysts: fd?.numberOfAnalystOpinions || 0,
    }
    const recommendation = fd?.recommendationKey
      ? fd.recommendationKey.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : 'N/A'

    // --- Institutional ownership ---
    const holders = quote.majorHoldersBreakdown
    const institutionalOwnership = holders?.institutionsPercentHeld
      ? fmtPct(holders.institutionsPercentHeld)
      : 'N/A'

    // --- Insider transactions ---
    const insiderTxns = (quote.insiderTransactions?.transactions || [])
      .slice(0, 20)
      .map((t: any) => ({
        date: t.startDate ? new Date(t.startDate).toISOString().split('T')[0] : '',
        type: (t.transactionText || '').toLowerCase().includes('purchase') ? 'BUY' as const : 'SELL' as const,
        shares: t.shares || 0,
        value: t.value ? `$${(t.value / 1e6).toFixed(1)}M` : 'N/A',
        name: t.filerName || '',
      }))

    const recentBuys = insiderTxns.filter((t: any) => t.type === 'BUY')
    const recentSells = insiderTxns.filter((t: any) => t.type === 'SELL')
    const insiderActivity = insiderTxns.length > 0 ? {
      netBuys90Days: recentBuys.length - recentSells.length,
      notable: recentBuys.length > 0
        ? `${recentBuys[0].name} bought ${recentBuys[0].shares.toLocaleString()} shares (${recentBuys[0].value})`
        : recentSells.length > 0
          ? `${recentSells[0].name} sold ${recentSells[0].shares.toLocaleString()} shares (${recentSells[0].value})`
          : 'No notable recent activity',
    } : null

    const insiderTimeline = insiderTxns.length > 0 ? insiderTxns.map((t: any) => ({
      date: t.date,
      type: t.type,
      shares: t.shares,
      value: t.value,
    })) : null

    // --- Recommendation trend ---
    const recTrend = (quote.recommendationTrend?.trend || [])
      .filter((t: any) => t.period !== '0m')
      .slice(0, 4)
      .reverse()
      .map((t: any) => ({
        month: t.period || '',
        buy: (t.strongBuy || 0) + (t.buy || 0),
        hold: t.hold || 0,
        sell: (t.sell || 0) + (t.strongSell || 0),
      }))

    // --- Dividend data ---
    const sd = quote.summaryDetail
    const hasDividend = (sd?.dividendYield || 0) > 0
    let dividendData = null
    if (hasDividend) {
      const divPaid = fcfHistory.map((f: any) => f.dividendsPaid).filter((d: number) => d > 0)
      dividendData = {
        currentYield: sd?.dividendYield ? fmtPct(sd.dividendYield) : 'N/A',
        payoutRatio: sd?.payoutRatio ? fmtPct(sd.payoutRatio) : 'N/A',
        fiveYearCagr: divPaid.length >= 2 ? (cagr(divPaid[0], divPaid[divPaid.length - 1], divPaid.length - 1) || 'N/A') : 'N/A',
        tenYearCagr: null as string | null,
        consecutiveYearsGrowth: null as number | null, // yahoo-finance2 doesn't track this directly
        fcfVsDividends: fcfHistory.filter((f: any) => f.dividendsPaid > 0),
      }
    }

    // --- Expanded annual data columns ---
    const expandedAnnualCols = revenueHistory.map((r: any, i: number) => ({
      year: r.year,
      grossMargin: r.revenue ? fmtPct(r.grossProfit / r.revenue) : 'N/A',
      operatingMargin: r.revenue ? fmtPct(r.operatingIncome / r.revenue) : 'N/A',
      fcf: fcfHistory[i] ? fmtB(fcfHistory[i].fcf * 1e9) : 'N/A',
    }))

    // --- Historical P/E (from earnings trend + price) ---
    // yahoo-finance2 doesn't give historical P/E directly; we'll let Gemini estimate this
    // but we provide current trailing P/E and forward P/E for context
    const currentPE = quote.summaryDetail?.trailingPE || quote.defaultKeyStatistics?.trailingPE || 0
    const forwardPE = quote.summaryDetail?.forwardPE || quote.defaultKeyStatistics?.forwardPE || 0

    return {
      revenueVsCogs,
      marginTrends,
      fcfHistory,
      revenueCagr,
      netIncomeCagr,
      analystTargetRange,
      recommendation,
      institutionalOwnership,
      insiderActivity,
      insiderTimeline,
      recommendationTrend: recTrend,
      dividendData,
      expandedAnnualCols,
      currentPE,
      forwardPE,
      // Raw data for Gemini prompt context
      revenueHistory,
      hasDividend,
    }
  } catch (err: any) {
    console.error('Yahoo Finance fetch failed:', err.message)
    return null
  }
}
```

- [ ] **Step 3: Update the generateReport function to call fetchYahooData**

In the `generateReport` function body, add the Yahoo Finance call right after the symbol validation, before the Gemini call:

```typescript
const yahoo = await fetchYahooData(symbol)
```

This runs before the Gemini prompt (Task 3 will inject `yahoo` data into the prompt). For now, the Gemini call stays unchanged — the yahoo data will be merged into the response after Gemini returns.

- [ ] **Step 4: Add the merge logic after Gemini returns**

After the existing `JSON.parse(cleaned) as StockReport` line, add logic to merge computed Yahoo data into the parsed Gemini response. Replace:

```typescript
const parsed = JSON.parse(cleaned) as StockReport
return parsed
```

With:

```typescript
const parsed = JSON.parse(cleaned) as StockReport

// Merge server-computed Yahoo Finance data into the AI-generated report
if (yahoo) {
  // Overview
  parsed.overview.revenueCagr = yahoo.revenueCagr.fiveYear
    ? { fiveYear: yahoo.revenueCagr.fiveYear, tenYear: yahoo.revenueCagr.tenYear }
    : { fiveYear: 'N/A', tenYear: null }
  parsed.overview.netIncomeCagr = yahoo.netIncomeCagr.fiveYear
    ? { fiveYear: yahoo.netIncomeCagr.fiveYear, tenYear: yahoo.netIncomeCagr.tenYear }
    : { fiveYear: 'N/A', tenYear: null }
  parsed.overview.institutionalOwnership = yahoo.institutionalOwnership
  parsed.overview.insiderActivity = yahoo.insiderActivity
  parsed.overview.analystConsensus = {
    ...parsed.overview.analystConsensus,
    meanTarget: `$${yahoo.analystTargetRange.mean.toFixed(0)}`,
    lowTarget: `$${yahoo.analystTargetRange.low.toFixed(0)}`,
    highTarget: `$${yahoo.analystTargetRange.high.toFixed(0)}`,
    numberOfAnalysts: yahoo.analystTargetRange.numberOfAnalysts,
    recommendation: yahoo.recommendation,
  }

  // Financials
  parsed.financials.revenueVsCogs = yahoo.revenueVsCogs
  parsed.financials.marginTrends = yahoo.marginTrends
  parsed.financials.dividendData = yahoo.dividendData
  parsed.financials.cagrs = {
    revenue: yahoo.revenueCagr.fiveYear
      ? { fiveYear: yahoo.revenueCagr.fiveYear, tenYear: yahoo.revenueCagr.tenYear }
      : { fiveYear: 'N/A', tenYear: null },
    netIncome: yahoo.netIncomeCagr.fiveYear
      ? { fiveYear: yahoo.netIncomeCagr.fiveYear, tenYear: yahoo.netIncomeCagr.tenYear }
      : { fiveYear: 'N/A', tenYear: null },
    eps: { fiveYear: 'N/A', tenYear: null }, // Gemini will provide this
  }

  // Merge expanded columns into annualData
  if (parsed.financials.annualData && yahoo.expandedAnnualCols.length > 0) {
    parsed.financials.annualData = parsed.financials.annualData.map((row) => {
      const match = yahoo.expandedAnnualCols.find((c: any) => c.year === row.year)
      return {
        ...row,
        grossMargin: match?.grossMargin || 'N/A',
        operatingMargin: match?.operatingMargin || 'N/A',
        fcf: match?.fcf || 'N/A',
      }
    })
  }

  // Valuation
  parsed.valuation.analystTargetRange = yahoo.analystTargetRange
  // historicalPE and sectorMedianPE come from Gemini (Task 3)

  // Catalysts
  parsed.catalysts.recommendationTrend = yahoo.recommendationTrend
  parsed.catalysts.insiderTimeline = yahoo.insiderTimeline
}

return parsed
```

- [ ] **Step 5: Verify the server action compiles**

Run: `npx tsc --noEmit 2>&1 | grep generateReport`

Expected: Errors only related to Gemini not yet returning new fields (like `convictionScore`, `historicalPE`, etc.). The Yahoo fetch + merge logic itself should compile. These will be resolved in Task 3.

- [ ] **Step 6: Commit**

```bash
git add app/actions/generateReport.ts
git commit -m "feat: expand Yahoo Finance data fetching with institutional metrics"
```

---

### Task 3: Rewrite Gemini Prompt for Institutional-Grade Output

**Files:**
- Modify: `app/actions/generateReport.ts`

This task rewrites the Gemini prompt to: (a) receive Yahoo Finance data as context, (b) return all new fields, (c) enforce quantitative backing, peer context, conviction scoring, and temporal bucketing.

- [ ] **Step 1: Replace the prompt string in generateReport**

Replace the entire `const prompt = ...` block (the template literal) with the new prompt below. The prompt injects `yahoo` data as context and requests all new `StockReport` fields:

```typescript
    const yahooContext = yahoo ? `
REAL MARKET DATA (use these exact numbers, do not fabricate):
- Analyst Targets: Low $${yahoo.analystTargetRange.low.toFixed(2)}, Mean $${yahoo.analystTargetRange.mean.toFixed(2)}, High $${yahoo.analystTargetRange.high.toFixed(2)} (${yahoo.analystTargetRange.numberOfAnalysts} analysts)
- Current Price: $${yahoo.analystTargetRange.currentPrice.toFixed(2)}
- Recommendation: ${yahoo.recommendation}
- Institutional Ownership: ${yahoo.institutionalOwnership}
- Trailing P/E: ${yahoo.currentPE.toFixed(1)}, Forward P/E: ${yahoo.forwardPE.toFixed(1)}
- Has Dividend: ${yahoo.hasDividend ? 'Yes' : 'No'}
- Revenue History (annual): ${JSON.stringify(yahoo.revenueHistory.map((r: any) => ({ year: r.year, revenue: fmtB(r.revenue), netIncome: fmtB(r.netIncome), grossProfit: fmtB(r.grossProfit) })))}
- Margin Trends: ${JSON.stringify(yahoo.marginTrends.map((m: any) => ({ year: m.year, gross: m.gross.toFixed(1) + '%', operating: m.operating.toFixed(1) + '%', net: m.net.toFixed(1) + '%' })))}
- FCF History: ${JSON.stringify(yahoo.fcfHistory.map((f: any) => ({ year: f.year, fcf: '$' + f.fcf.toFixed(1) + 'B', divPaid: '$' + f.dividendsPaid.toFixed(1) + 'B' })))}
- Revenue CAGR: 5yr ${yahoo.revenueCagr.fiveYear || 'N/A'}
- Net Income CAGR: 5yr ${yahoo.netIncomeCagr.fiveYear || 'N/A'}
- Insider Activity: ${yahoo.insiderActivity ? `Net buys (90d): ${yahoo.insiderActivity.netBuys90Days}, Notable: ${yahoo.insiderActivity.notable}` : 'No data'}
- Recommendation Trend: ${JSON.stringify(yahoo.recommendationTrend)}
` : ''

    const prompt = `You are a senior equity analyst at an elite hedge fund producing institutional-grade research. Generate a deeply researched stock analysis report for: ${symbol}.

${yahooContext}

CRITICAL INSTRUCTIONS:
1. QUANTITATIVE BACKING: Every claim must cite a specific number. Never say "strong margins" — say "operating margin of 34.2%, expanding 280bps YoY".
2. PEER CONTEXT: Compare every key metric to sector/industry medians. Use format "X vs sector median Y — Z% premium/discount".
3. CONVICTION SCORING: Provide numerical confidence (0-100) for the overall verdict and each catalyst. Explain what drives conviction up/down.
4. TEMPORAL BUCKETING: Tag every catalyst and risk as "NEAR" (0-6mo), "MEDIUM" (6-18mo), or "LONG" (18mo+).
5. Use the REAL MARKET DATA above as ground truth. Do not fabricate analyst targets, prices, or ownership data — use the exact numbers provided.

Return ONLY a raw JSON object. No markdown. No backticks. No preamble. Just JSON.

Schema:
{
  "ticker": "string",
  "companyName": "string",
  "exchange": "string",
  "currentPrice": "string (e.g. '$174.50')",
  "priceVsATH": "string (e.g. '-55% from ATH $627')",
  "marketCap": "string (e.g. '~$256B')",
  "website": "string (company website URL)",
  "verdict": "BUY" | "SELL" | "HOLD" | "AVOID",
  "verdictSubtitle": "string — one-line thesis with a key number",
  "badges": ["string — contextual badges"],
  "convictionScore": number (0-100),
  "overview": {
    "keyMetrics": [
      { "label": "string", "value": "string", "subtitle": "string (peer context, e.g. 'vs sector 18.1x')", "color": "string hex or omit" }
    ],
    "businessSummary": "string — 3 paragraphs separated by \\n\\n, cite specific numbers",
    "whatHasGoneWrong": "string or null",
    "segmentBreakdown": [{ "name": "string", "percentage": number }],
    "moatScores": [{ "metric": "string", "score": number 0-100 }],
    "sectorMoatScores": [{ "metric": "string", "score": number 0-100 }],
    "analystConsensus": {
      "meanTarget": "string", "lowTarget": "string", "highTarget": "string",
      "numberOfAnalysts": number, "recommendation": "string"
    },
    "institutionalOwnership": "string",
    "insiderActivity": { "netBuys90Days": number, "notable": "string" } or null,
    "revenueCagr": { "fiveYear": "string", "tenYear": null },
    "netIncomeCagr": { "fiveYear": "string", "tenYear": null }
  },
  "financials": {
    "narrativeSummary": "string — 2-3 paragraphs with specific numbers and trend analysis",
    "annualData": [
      { "year": "string", "revenue": number (billions), "revenueGrowth": "string", "adjEPS": number, "epsGrowth": "string", "opCF": "string", "keyMetric": "string", "grossMargin": "string", "operatingMargin": "string", "fcf": "string" }
    ],
    "callout": "string — cite a specific number or trend",
    "revenueVsCogs": [{ "year": "string", "revenue": number, "cogs": number, "grossProfit": number }],
    "marginTrends": [{ "year": "string", "gross": number, "operating": number, "net": number }],
    "dividendData": { "currentYield": "string", "payoutRatio": "string", "fiveYearCagr": "string", "tenYearCagr": null, "consecutiveYearsGrowth": number or null, "fcfVsDividends": [{ "year": "string", "fcf": number, "dividendsPaid": number }] } or null,
    "cagrs": {
      "revenue": { "fiveYear": "string", "tenYear": null },
      "netIncome": { "fiveYear": "string", "tenYear": null },
      "eps": { "fiveYear": "string", "tenYear": null }
    }
  },
  "valuation": {
    "bullCase": "string — structured with specific catalysts and quantified impacts",
    "bearCase": "string — structured with specific risks and quantified impacts",
    "metrics": [{ "metric": "string", "current": "string", "fiveYearAvg": "string", "sectorMedian": "string", "commentary": "string (include relative positioning)" }],
    "analystTargetRange": { "low": number, "mean": number, "median": number, "high": number, "currentPrice": number, "numberOfAnalysts": number },
    "historicalPE": [{ "year": "string", "pe": number }],
    "sectorMedianPE": number
  },
  "catalysts": {
    "catalystTable": [{ "timeline": "string", "catalyst": "string", "impact": "string", "probability": "string", "timeframe": "NEAR"|"MEDIUM"|"LONG", "conviction": number (0-100) }],
    "risks": [{ "risk": "string", "severity": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", "description": "string", "likelihood": "HIGH"|"MEDIUM"|"LOW", "timeframe": "NEAR"|"MEDIUM"|"LONG" }],
    "recommendationTrend": [{ "month": "string", "buy": number, "hold": number, "sell": number }],
    "insiderTimeline": [{ "date": "string", "type": "BUY"|"SELL", "shares": number, "value": "string" }] or null
  },
  "verdictDetails": {
    "bullCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "baseCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "bearCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "scenarioMatrix": [{ "scenario": "string", "probability": "string", "priceTarget": "string", "return": "string", "weighted": "string", "keyAssumptions": ["string"] }],
    "multiYearProjections": [{ "horizon": "string", "bearCase": "string", "baseCase": "string", "bullCase": "string", "commentary": "string", "impliedCagr": "string" }],
    "priceProjectionChart": [{ "year": "string", "bear": number, "base": number, "bull": number, "analystMean": number }],
    "syndicateVerdict": {
      "rating": "BUY"|"SELL"|"HOLD"|"AVOID",
      "positionSizing": "string — specific portfolio % range with rationale (e.g. '2-4% of portfolio: high conviction but cyclical risk')",
      "keySignalTitle": "string",
      "keySignalDetail": "string — cite specific numbers",
      "honestRisk": "string — cite specific numbers",
      "howToPosition": "string — specific entry strategy",
      "longTermThesis": "string — 5-10 year outlook with numbers"
    },
    "convictionScore": number (0-100),
    "convictionDrivers": "string — what drives conviction up/down, cite 2-3 specific factors"
  }
}

Requirements:
- overview.keyMetrics: exactly 8 items: Market Cap, FY Revenue, Revenue 5yr CAGR, Net Income 5yr CAGR, Adj EPS, Forward P/E, Op Cash Flow, Dividend/Yield (or Institutional Ownership if no dividend)
- overview.moatScores: exactly 6 items, 0-100 scale
- overview.sectorMoatScores: exactly 6 items matching moatScores metrics, with sector average scores
- overview.segmentBreakdown: 3-8 segments summing close to 100
- financials.annualData: 4-5 years
- valuation.historicalPE: 4-5 years of estimated trailing P/E
- catalysts.catalystTable: 4-6 catalysts with timeframe and conviction
- catalysts.risks: 4-6 risks with likelihood and timeframe, ordered by severity
- verdictDetails.scenarioMatrix: 3 rows (Bull/Base/Bear) + 1 Expected Value row, each with 2-3 keyAssumptions
- verdictDetails.multiYearProjections: 3 rows (3-year, 5-year, 10-year) with impliedCagr
- verdictDetails.priceProjectionChart: 5-6 data points with analystMean
- Be specific to THIS company — no generic filler
- Return ONLY the JSON object, no wrapping`
```

- [ ] **Step 2: Update the merge logic to avoid overwriting Gemini fields with Yahoo fallbacks**

The merge logic from Task 2 should only fill in fields where Yahoo data is more authoritative (analyst targets, ownership %, computed CAGRs). Gemini-generated fields (historicalPE, sectorMoatScores, conviction scores) should be left as-is from the parsed response. Update the merge block to add safe defaults for any fields Gemini might omit:

After the existing merge block, add:

```typescript
// Safe defaults for new fields Gemini might omit
if (!parsed.convictionScore) parsed.convictionScore = 50
if (!parsed.overview.sectorMoatScores) parsed.overview.sectorMoatScores = []
if (!parsed.valuation.historicalPE) parsed.valuation.historicalPE = []
if (!parsed.valuation.sectorMedianPE) parsed.valuation.sectorMedianPE = 0
if (!parsed.verdictDetails.convictionScore) parsed.verdictDetails.convictionScore = parsed.convictionScore
if (!parsed.verdictDetails.convictionDrivers) parsed.verdictDetails.convictionDrivers = ''
```

- [ ] **Step 3: Test by running the dev server and generating a report**

Run: `npm run dev`

Open browser → navigate to a ticker report (e.g., `/reports/AAPL`). Verify:
1. The loading screen appears (Gemini call takes longer now due to bigger prompt)
2. The report renders without crashing
3. Open browser console — no runtime errors

The new data won't be visible yet (tabs haven't been upgraded), but the report should still render with the existing tab layout.

- [ ] **Step 4: Commit**

```bash
git add app/actions/generateReport.ts
git commit -m "feat: enrich Gemini prompt with Yahoo Finance data and institutional-grade output schema"
```

---

### Task 4: Add Shared UI Primitives (RangeBar, ConvictionBadge)

**Files:**
- Modify: `components/reports/ReportUI.tsx`

Two new reusable components needed by multiple tabs.

- [ ] **Step 1: Add RangeBar component**

Used by Overview (analyst consensus) and Valuation (analyst price targets). Add at the bottom of `ReportUI.tsx`:

```typescript
export function RangeBar({ low, mean, high, current, label, count }: {
  low: number; mean: number; high: number; current: number; label?: string; count?: number
}) {
  const min = Math.min(low, current) * 0.95
  const max = Math.max(high, current) * 1.05
  const range = max - min
  const pct = (v: number) => ((v - min) / range) * 100

  return (
    <div style={{ padding: '12px 0' }}>
      {label && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: '#e8ecf1',
            fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>{label}</span>
          {count != null && (
            <span style={{
              fontSize: 11, color: '#5a6475',
              fontFamily: "'JetBrains Mono', monospace",
            }}>{count} analysts</span>
          )}
        </div>
      )}
      <div style={{
        position: 'relative', height: 8, borderRadius: 4,
        background: 'rgba(255,255,255,0.06)',
      }}>
        {/* Range bar from low to high */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, borderRadius: 4,
          left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%`,
          background: 'linear-gradient(90deg, rgba(248,113,113,0.3), rgba(96,165,250,0.3), rgba(74,222,128,0.3))',
        }} />
        {/* Mean marker */}
        <div style={{
          position: 'absolute', top: -4, width: 2, height: 16, borderRadius: 1,
          left: `${pct(mean)}%`, background: '#60a5fa',
        }} />
        {/* Current price marker */}
        <div style={{
          position: 'absolute', top: -6, width: 3, height: 20, borderRadius: 1.5,
          left: `${pct(current)}%`, background: '#e8ecf1',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 8,
        fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
      }}>
        <span style={{ color: '#f87171' }}>${low.toFixed(0)}</span>
        <span style={{ color: '#60a5fa' }}>Mean ${mean.toFixed(0)}</span>
        <span style={{ color: '#4ade80' }}>${high.toFixed(0)}</span>
      </div>
      <div style={{
        textAlign: 'center', marginTop: 4,
        fontSize: 10, color: '#5a6475', fontFamily: "'DM Sans', sans-serif",
      }}>
        Current: <span style={{ color: '#e8ecf1', fontFamily: "'JetBrains Mono', monospace" }}>${current.toFixed(0)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add ConvictionBadge component**

Used by Verdict tab (large display) and potentially Catalysts. Add below RangeBar:

```typescript
export function ConvictionBadge({ score, size = 'default' }: {
  score: number; size?: 'default' | 'large'
}) {
  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#f59e0b' : '#f87171'
  const isLarge = size === 'large'

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: isLarge ? 10 : 6,
    }}>
      <span style={{
        fontSize: isLarge ? 36 : 16, fontWeight: 700, color,
        fontFamily: "'JetBrains Mono', monospace", lineHeight: 1,
      }}>{score}</span>
      <span style={{
        fontSize: isLarge ? 13 : 10, color: '#5a6475',
        fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>/100</span>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/reports/ReportUI.tsx
git commit -m "feat: add RangeBar and ConvictionBadge shared UI primitives"
```

---

### Task 5: Upgrade Overview Tab

**Files:**
- Modify: `components/reports/tabs/OverviewTab.tsx`

Adds analyst consensus bar, institutional/insider signals, upgraded donut + radar with sector overlay. Key metrics grid expands from 6 to 8 cards.

- [ ] **Step 1: Update the component props and imports**

Replace the imports and function signature:

```typescript
'use client'

import {
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts'
import { MetricCard, SectionTitle, CTooltip, RangeBar, Badge, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

const SEGMENT_COLORS = ['#60a5fa', '#4ade80', '#f59e0b', '#f87171', '#a78bfa', '#ec4899', '#2dd4bf', '#fb923c']

export default function OverviewTab({ overview }: { overview: StockReport['overview'] }) {
```

- [ ] **Step 2: Add analyst consensus section after key metrics grid**

After the closing `</div>` of the key metrics grid (`marginBottom: 32`), add:

```tsx
      {overview.analystConsensus && overview.analystConsensus.numberOfAnalysts > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Analyst Consensus</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 20px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
            }}>
              <Badge
                text={overview.analystConsensus.recommendation}
                variant={
                  overview.analystConsensus.recommendation.toLowerCase().includes('buy') ? 'green'
                  : overview.analystConsensus.recommendation.toLowerCase().includes('sell') ? 'red'
                  : 'blue'
                }
              />
              <span style={{
                fontSize: 12, color: '#5a6475',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {overview.analystConsensus.numberOfAnalysts} analysts
              </span>
            </div>
            <RangeBar
              low={parseFloat(overview.analystConsensus.lowTarget.replace(/[$,]/g, '')) || 0}
              mean={parseFloat(overview.analystConsensus.meanTarget.replace(/[$,]/g, '')) || 0}
              high={parseFloat(overview.analystConsensus.highTarget.replace(/[$,]/g, '')) || 0}
              current={parseFloat(overview.analystConsensus.meanTarget.replace(/[$,]/g, '')) || 0}
              label="Price Target Range"
              count={overview.analystConsensus.numberOfAnalysts}
            />
          </div>
        </div>
      )}
```

Note: The `current` prop on this RangeBar uses the mean target as a placeholder — the actual current price is in the header. We'll use `analystConsensus` data which already has the price targets from Yahoo.

- [ ] **Step 3: Add institutional & insider signals section**

After the analyst consensus section, add:

```tsx
      {(overview.institutionalOwnership !== 'N/A' || overview.insiderActivity) && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Institutional & Insider Signals</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {overview.institutionalOwnership && overview.institutionalOwnership !== 'N/A' && (
                <div>
                  <div style={{
                    fontSize: 10, letterSpacing: 1.4, color: '#5a6475',
                    textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 6,
                  }}>Institutional Ownership</div>
                  <div style={{
                    fontSize: 20, fontWeight: 700, color: '#e8ecf1',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{overview.institutionalOwnership}</div>
                </div>
              )}
              {overview.insiderActivity && (
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{
                    fontSize: 10, letterSpacing: 1.4, color: '#5a6475',
                    textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 6,
                  }}>Recent Insider Activity</div>
                  <div style={{
                    fontSize: 13, color: overview.insiderActivity.netBuys90Days > 0 ? '#4ade80' : overview.insiderActivity.netBuys90Days < 0 ? '#f87171' : '#8b95a5',
                    fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6,
                  }}>
                    Net {overview.insiderActivity.netBuys90Days >= 0 ? 'buys' : 'sells'} (90d): {Math.abs(overview.insiderActivity.netBuys90Days)}
                  </div>
                  <div style={{
                    fontSize: 12, color: '#8b95a5', marginTop: 4,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>{overview.insiderActivity.notable}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Upgrade moat radar with sector overlay**

Replace the existing Radar chart section (the `<RadarChart>` block) with a version that includes the sector average overlay:

```tsx
      {overview.moatScores?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Competitive Moat Analysis</SectionTitle>
          <div style={{ ...glassCard, padding: '20px' }}>
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={overview.moatScores} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: '#5a6475', fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}
                />
                {overview.sectorMoatScores?.length > 0 && (
                  <Radar
                    dataKey="score"
                    data={overview.sectorMoatScores}
                    stroke="#a78bfa"
                    fill="rgba(167,139,250,0.08)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                  />
                )}
                <Radar
                  dataKey="score"
                  stroke="#60a5fa"
                  fill="rgba(96,165,250,0.20)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#60a5fa', strokeWidth: 0 }}
                />
                <Tooltip content={<CTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9679; Company</span>
              {overview.sectorMoatScores?.length > 0 && (
                <span style={{ fontSize: 11, color: '#a78bfa' }}>- - Sector Avg</span>
              )}
            </div>
            <p style={{
              fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '8px 0 0',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Scores out of 100. Higher values indicate stronger competitive positioning in each dimension.
            </p>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Test the Overview tab**

Run: `npm run dev`

Navigate to a report page. Verify:
1. Key metrics grid shows up to 8 cards
2. Analyst consensus bar renders with price target range
3. Institutional & insider signals appear (or are gracefully hidden)
4. Moat radar shows company scores (and sector overlay if data available)
5. No console errors

- [ ] **Step 6: Commit**

```bash
git add components/reports/tabs/OverviewTab.tsx
git commit -m "feat: upgrade Overview tab with analyst consensus, institutional signals, sector moat overlay"
```

---

### Task 6: Upgrade Financials Tab

**Files:**
- Modify: `components/reports/tabs/FinancialsTab.tsx`

Adds Revenue vs COGS chart, margin trends chart, FCF vs Dividends chart (conditional), dividend section, expanded data table, CAGR row.

- [ ] **Step 1: Update imports and component signature**

Replace the entire imports block and function signature:

```typescript
'use client'

import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid,
  LineChart, ResponsiveContainer, Tooltip,
} from 'recharts'
import { SectionTitle, DataTable, MetricCard, CTooltip, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

export default function FinancialsTab({ financials }: { financials: StockReport['financials'] }) {
  const data = financials.annualData || []
```

- [ ] **Step 2: Add Revenue vs COGS chart after the narrative summary**

After the narrative summary section closing `</div>`, add:

```tsx
      {financials.revenueVsCogs?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Revenue vs Cost of Revenue</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={financials.revenueVsCogs}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}B`} />
                <Tooltip content={<CTooltip />} />
                <Bar dataKey="revenue" name="Revenue ($B)" fill="rgba(96,165,250,0.6)" radius={[5, 5, 0, 0]} />
                <Line type="monotone" dataKey="cogs" name="COGS ($B)" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: '#f59e0b', r: 4, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="grossProfit" name="Gross Profit ($B)" fill="rgba(74,222,128,0.08)" stroke="#4ade80" strokeWidth={1.5} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9632; Revenue</span>
              <span style={{ fontSize: 11, color: '#f59e0b' }}>&#9679; COGS</span>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9650; Gross Profit</span>
            </div>
            <p style={{ fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '4px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
              Gap between revenue and COGS shows gross profit margin health over time.
            </p>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Add Margin Trends chart**

After the Revenue vs COGS section:

```tsx
      {financials.marginTrends?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Margin Trends</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={financials.marginTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                <Tooltip content={<CTooltip />} />
                <Line type="monotone" dataKey="gross" name="Gross Margin %" stroke="#4ade80" strokeWidth={2} dot={{ fill: '#4ade80', r: 3, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="operating" name="Operating Margin %" stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 3, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="net" name="Net Margin %" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9679; Gross</span>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9679; Operating</span>
              <span style={{ fontSize: 11, color: '#a78bfa' }}>&#9679; Net</span>
            </div>
            <p style={{ fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '4px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
              Expanding margins signal improving efficiency; compressing margins flag rising costs or pricing pressure.
            </p>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Keep the existing Revenue & EPS combo chart (already present)**

No changes to this chart — it stays as-is. It comes after the new charts in render order.

- [ ] **Step 5: Expand the annual data table columns**

Replace the DataTable headers and rows in the "Annual Financial Data" section:

```tsx
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Year', 'Revenue', 'Growth', 'Gross Margin', 'Op Margin', 'Adj EPS', 'EPS Growth', 'FCF']}
              rows={data.map(d => [
                d.year,
                `$${d.revenue}B`,
                d.revenueGrowth,
                d.grossMargin || 'N/A',
                d.operatingMargin || 'N/A',
                `$${typeof d.adjEPS === 'number' ? d.adjEPS.toFixed(2) : d.adjEPS}`,
                d.epsGrowth,
                d.fcf || 'N/A',
              ])}
              numericCols={[1, 2, 3, 4, 5, 6, 7]}
            />
          </div>
```

- [ ] **Step 6: Add CAGR callout row after the data table**

After the DataTable's closing `</div>` (inside the "Annual Financial Data" section):

```tsx
          {financials.cagrs && (
            <div style={{
              display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12,
              padding: '12px 16px', borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
            }}>
              {[
                { label: 'Revenue CAGR', five: financials.cagrs.revenue.fiveYear, ten: financials.cagrs.revenue.tenYear },
                { label: 'Net Income CAGR', five: financials.cagrs.netIncome.fiveYear, ten: financials.cagrs.netIncome.tenYear },
                { label: 'EPS CAGR', five: financials.cagrs.eps.fiveYear, ten: financials.cagrs.eps.tenYear },
              ].map((c, i) => (
                <div key={i} style={{ minWidth: 140 }}>
                  <div style={{
                    fontSize: 10, letterSpacing: 1.2, color: '#5a6475',
                    textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 4,
                  }}>{c.label}</div>
                  <span style={{
                    fontSize: 14, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: c.five?.startsWith('+') ? '#4ade80' : c.five?.startsWith('-') ? '#f87171' : '#e8ecf1',
                  }}>5yr: {c.five || 'N/A'}</span>
                  {c.ten && (
                    <span style={{
                      fontSize: 12, color: '#5a6475', marginLeft: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>10yr: {c.ten}</span>
                  )}
                </div>
              ))}
            </div>
          )}
```

- [ ] **Step 7: Add conditional dividend section and FCF vs Dividends chart**

After the callout card section, before the closing `</div>` of the component:

```tsx
      {financials.dividendData && (
        <div style={{ marginTop: 32 }}>
          <SectionTitle>Dividend Analysis</SectionTitle>

          {/* Dividend metrics row */}
          <div style={{
            display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20,
          }}>
            {[
              { label: 'Yield', value: financials.dividendData.currentYield },
              { label: 'Payout Ratio', value: financials.dividendData.payoutRatio },
              { label: '5yr CAGR', value: financials.dividendData.fiveYearCagr },
              ...(financials.dividendData.tenYearCagr ? [{ label: '10yr CAGR', value: financials.dividendData.tenYearCagr }] : []),
              ...(financials.dividendData.consecutiveYearsGrowth != null ? [{ label: 'Consec. Years Growth', value: String(financials.dividendData.consecutiveYearsGrowth) }] : []),
            ].map((m, i) => (
              <MetricCard key={i} label={m.label} value={m.value} />
            ))}
          </div>

          {/* FCF vs Dividends Paid chart */}
          {financials.dividendData.fcfVsDividends?.length > 0 && (
            <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={financials.dividendData.fcfVsDividends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}B`} />
                  <Tooltip content={<CTooltip />} />
                  <Bar dataKey="fcf" name="Free Cash Flow ($B)" fill="rgba(74,222,128,0.6)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="dividendsPaid" name="Dividends Paid ($B)" fill="rgba(248,113,113,0.6)" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#4ade80' }}>&#9632; Free Cash Flow</span>
                <span style={{ fontSize: 11, color: '#f87171' }}>&#9632; Dividends Paid</span>
              </div>
              <p style={{ fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '4px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
                FCF exceeding dividends indicates sustainable payout. Red bars approaching green signal dividend risk.
              </p>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 8: Test the Financials tab**

Run: `npm run dev`

Navigate to a report → Financials tab. Verify:
1. Revenue vs COGS chart renders with bars + line + area
2. Margin trends chart shows 3 lines
3. Revenue & EPS chart still works (unchanged)
4. Data table has new columns (Gross Margin, Op Margin, FCF)
5. CAGR row appears below table
6. For a dividend stock (e.g., AAPL): dividend section + FCF vs Dividends chart appear
7. For a non-dividend stock (e.g., GOOG): dividend section hidden
8. No console errors

- [ ] **Step 9: Commit**

```bash
git add components/reports/tabs/FinancialsTab.tsx
git commit -m "feat: upgrade Financials tab with COGS, margin, dividend charts and CAGR metrics"
```

---

### Task 7: Upgrade Valuation Tab

**Files:**
- Modify: `components/reports/tabs/ValuationTab.tsx`

Adds sector median column to metrics table, analyst price target range chart, historical P/E chart, and restructures bull/bear cases.

- [ ] **Step 1: Update imports and add chart dependencies**

Replace the imports:

```typescript
'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import { SectionTitle, DataTable, RangeBar, CTooltip, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'
```

- [ ] **Step 2: Update the component signature**

```typescript
export default function ValuationTab({ valuation }: { valuation: StockReport['valuation'] }) {
```

- [ ] **Step 3: Replace the bull/bear case sections**

Replace the existing bull case and bear case `<div>` blocks with structured bullet-point versions. The `bullCase` and `bearCase` strings will now contain richer text from the upgraded Gemini prompt — we keep the same card layout but the content inside is now more structured:

No code change needed here — the existing card layout will render the upgraded Gemini text. The prompt in Task 3 already instructs Gemini to include structured bullet points with quantified impacts.

- [ ] **Step 4: Expand the valuation metrics table with sector median column**

Replace the existing DataTable in the valuation metrics section:

```tsx
      {valuation.metrics?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Valuation Metrics</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Metric', 'Current', '5-Year Avg', 'Sector Median', 'Commentary']}
              rows={valuation.metrics.map(m => [m.metric, m.current, m.fiveYearAvg, m.sectorMedian || 'N/A', m.commentary])}
              numericCols={[1, 2, 3]}
            />
          </div>
        </div>
      )}
```

- [ ] **Step 5: Add analyst price target range chart**

After the valuation metrics table:

```tsx
      {valuation.analystTargetRange && valuation.analystTargetRange.numberOfAnalysts > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Analyst Price Targets</SectionTitle>
          <div style={{ ...glassCard, padding: '20px' }}>
            <RangeBar
              low={valuation.analystTargetRange.low}
              mean={valuation.analystTargetRange.mean}
              high={valuation.analystTargetRange.high}
              current={valuation.analystTargetRange.currentPrice}
              label="Target Range"
              count={valuation.analystTargetRange.numberOfAnalysts}
            />
          </div>
        </div>
      )}
```

- [ ] **Step 6: Add historical P/E chart**

After the analyst price target section:

```tsx
      {valuation.historicalPE?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Historical P/E Ratio</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={valuation.historicalPE}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}x`} />
                <Tooltip content={<CTooltip />} />
                {valuation.sectorMedianPE > 0 && (
                  <ReferenceLine
                    y={valuation.sectorMedianPE}
                    stroke="#f59e0b"
                    strokeDasharray="6 3"
                    label={{
                      value: `Sector ${valuation.sectorMedianPE.toFixed(0)}x`,
                      position: 'right',
                      fill: '#f59e0b',
                      fontSize: 10,
                    }}
                  />
                )}
                <Line
                  type="monotone" dataKey="pe" name="P/E Ratio"
                  stroke="#60a5fa" strokeWidth={2.5}
                  dot={{ fill: '#60a5fa', r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9679; P/E</span>
              {valuation.sectorMedianPE > 0 && (
                <span style={{ fontSize: 11, color: '#f59e0b' }}>- - Sector Median</span>
              )}
            </div>
            <p style={{ fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '4px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
              P/E above sector median suggests premium valuation; below suggests potential value or concern.
            </p>
          </div>
        </div>
      )}
```

- [ ] **Step 7: Test the Valuation tab**

Run: `npm run dev`

Navigate to a report → Valuation tab. Verify:
1. Bull/bear cases render with richer quantitative text
2. Metrics table has 5 columns (including Sector Median)
3. Analyst price target range bar renders
4. Historical P/E chart renders with sector median reference line
5. No console errors

- [ ] **Step 8: Commit**

```bash
git add components/reports/tabs/ValuationTab.tsx
git commit -m "feat: upgrade Valuation tab with sector medians, analyst targets, historical P/E chart"
```

---

### Task 8: Upgrade Catalysts Tab

**Files:**
- Modify: `components/reports/tabs/CatalystsTab.tsx`

Adds temporal bucketing + conviction to catalyst table, likelihood + temporal tag to risk cards, recommendation trend chart, insider activity timeline.

- [ ] **Step 1: Update imports**

Replace imports:

```typescript
'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { SectionTitle, Badge, CTooltip, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'
```

- [ ] **Step 2: Add timeframe badge color helper**

Below the existing severity maps:

```typescript
const timeframeColor: Record<string, 'green' | 'blue' | 'yellow'> = {
  NEAR: 'green',
  MEDIUM: 'blue',
  LONG: 'yellow',
}
```

- [ ] **Step 3: Add timeframe and conviction columns to catalyst table**

Replace the catalyst table headers and body. Change the headers array:

```typescript
{['Timeline', 'Catalyst', 'Impact', 'Probability', 'Timeframe', 'Conviction'].map((h, i) => (
```

Add two new `<td>` cells to each row, after the probability cell:

```tsx
                    <td style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
                    }}>
                      {row.timeframe && <Badge text={row.timeframe} variant={timeframeColor[row.timeframe] || 'gray'} />}
                    </td>
                    <td style={{
                      padding: '10px 12px', color: '#e8ecf1',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                      borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
                    }}>{row.conviction != null ? `${row.conviction}/100` : ''}</td>
```

- [ ] **Step 4: Upgrade risk cards with likelihood and temporal tag**

In the risk card rendering, after the existing severity Badge, add likelihood and timeframe badges:

```tsx
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 10, gap: 8, flexWrap: 'wrap',
                }}>
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: '#e8ecf1',
                    fontFamily: "'Instrument Serif', serif",
                  }}>{risk.risk}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Badge text={risk.severity} variant={severityColor[risk.severity] || 'blue'} />
                    {risk.likelihood && <Badge text={`${risk.likelihood} likelihood`} variant={risk.likelihood === 'HIGH' ? 'red' : risk.likelihood === 'MEDIUM' ? 'yellow' : 'green'} />}
                    {risk.timeframe && <Badge text={risk.timeframe} variant={timeframeColor[risk.timeframe] || 'gray'} />}
                  </div>
                </div>
```

- [ ] **Step 5: Add recommendation trend chart**

After the risk cards section:

```tsx
      {catalysts.recommendationTrend?.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <SectionTitle>Analyst Recommendation Trend</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={catalysts.recommendationTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CTooltip />} />
                <Bar dataKey="buy" name="Buy" stackId="a" fill="rgba(74,222,128,0.7)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="hold" name="Hold" stackId="a" fill="rgba(96,165,250,0.7)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="sell" name="Sell" stackId="a" fill="rgba(248,113,113,0.7)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9632; Buy</span>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9632; Hold</span>
              <span style={{ fontSize: 11, color: '#f87171' }}>&#9632; Sell</span>
            </div>
            <p style={{ fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '4px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
              Shifts in buy/hold/sell distribution signal changing analyst sentiment.
            </p>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Add insider activity timeline**

After the recommendation trend section:

```tsx
      {catalysts.insiderTimeline && catalysts.insiderTimeline.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <SectionTitle>Insider Activity</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catalysts.insiderTimeline.map((txn, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 0',
                  borderBottom: i < catalysts.insiderTimeline!.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: txn.type === 'BUY' ? '#4ade80' : '#f87171',
                  }} />
                  <span style={{
                    fontSize: 11, color: '#5a6475', fontFamily: "'JetBrains Mono', monospace",
                    minWidth: 80,
                  }}>{txn.date}</span>
                  <Badge text={txn.type} variant={txn.type === 'BUY' ? 'green' : 'red'} />
                  <span style={{
                    fontSize: 12, color: '#e8ecf1', fontFamily: "'JetBrains Mono', monospace",
                  }}>{txn.shares.toLocaleString()} shares</span>
                  <span style={{
                    fontSize: 12, color: '#5a6475', fontFamily: "'JetBrains Mono', monospace",
                    marginLeft: 'auto',
                  }}>{txn.value}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#5a6475', margin: '12px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
              Insider buying often signals management confidence; heavy selling may flag concern (or routine diversification).
            </p>
          </div>
        </div>
      )}
```

- [ ] **Step 7: Test the Catalysts tab**

Run: `npm run dev`

Navigate to a report → Catalysts tab. Verify:
1. Catalyst table has 6 columns (with Timeframe and Conviction)
2. Risk cards show severity + likelihood + temporal badges
3. Recommendation trend stacked bar chart renders
4. Insider activity timeline renders (or is hidden if no data)
5. No console errors

- [ ] **Step 8: Commit**

```bash
git add components/reports/tabs/CatalystsTab.tsx
git commit -m "feat: upgrade Catalysts tab with temporal bucketing, conviction scores, analyst trend chart"
```

---

### Task 9: Upgrade Verdict Tab

**Files:**
- Modify: `components/reports/tabs/VerdictTab.tsx`

Adds conviction score display, key assumptions to scenario cards, Expected Value row styling, analyst target overlay on price chart, implied CAGR column, conviction badge on syndicate card.

- [ ] **Step 1: Update imports**

Add ConvictionBadge import:

```typescript
import { SectionTitle, DataTable, Badge, ConvictionBadge, CTooltip, glassCard } from '../ReportUI'
```

Also add `ReferenceLine` to recharts imports:

```typescript
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
```

- [ ] **Step 2: Add conviction score display at the top of the tab**

At the very start of the returned JSX (inside the outer `<div>`), before the scenario cards:

```tsx
      {/* Conviction Score */}
      {verdictDetails.convictionScore != null && (
        <div style={{
          ...glassCard,
          display: 'flex', alignItems: 'center', gap: 20,
          padding: '20px 24px', marginBottom: 32,
        }}>
          <ConvictionBadge score={verdictDetails.convictionScore} size="large" />
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, color: '#5a6475',
              fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 4,
            }}>CONVICTION SCORE</div>
            {verdictDetails.convictionDrivers && (
              <p style={{
                fontSize: 13, color: '#b8c4d4', lineHeight: 1.6,
                fontFamily: "'DM Sans', sans-serif", margin: 0,
              }}>{verdictDetails.convictionDrivers}</p>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 3: Add key assumptions to scenario cards**

In the scenario card rendering, after the `<p>` that shows `scenario.description`, add:

```tsx
              {/* Key assumptions (from scenarioMatrix) */}
              {verdictDetails.scenarioMatrix?.find(s => s.scenario.toLowerCase().includes(key.replace('Case', '').toLowerCase()))?.keyAssumptions?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: '#5a6475',
                    fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase',
                    letterSpacing: 1, marginBottom: 6,
                  }}>Key Assumptions</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {verdictDetails.scenarioMatrix.find(s => s.scenario.toLowerCase().includes(key.replace('Case', '').toLowerCase()))!.keyAssumptions.map((a, ai) => (
                      <li key={ai} style={{
                        fontSize: 11, color: '#8b95a5', lineHeight: 1.6,
                        fontFamily: "'DM Sans', sans-serif",
                      }}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
```

- [ ] **Step 4: Expand multi-year projections table with implied CAGR column**

Replace the MultiYear Projections DataTable:

```tsx
            <DataTable
              headers={['Horizon', 'Bear Case', 'Base Case', 'Bull Case', 'Implied CAGR', 'Commentary']}
              rows={verdictDetails.multiYearProjections.map(r => [
                r.horizon, r.bearCase, r.baseCase, r.bullCase, r.impliedCagr || 'N/A', r.commentary,
              ])}
              numericCols={[1, 2, 3, 4]}
            />
```

- [ ] **Step 5: Add analyst mean overlay to price projection chart**

Add a new `Line` element to the price projection chart for the analyst mean target. In the `ComposedChart`, after the Bear `Area`:

```tsx
                <Line
                  type="monotone" dataKey="analystMean" name="Analyst Mean"
                  stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3"
                  dot={false}
                />
```

Also update the legend below the chart to include the analyst mean:

```tsx
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9650; Bull</span>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9679; Base</span>
              <span style={{ fontSize: 11, color: '#f87171' }}>&#9660; Bear</span>
              <span style={{ fontSize: 11, color: '#f59e0b' }}>- - Analyst Mean</span>
            </div>
```

- [ ] **Step 6: Add conviction badge to syndicate verdict card**

In the syndicate verdict card, after the existing `<Badge text={sv.rating} ... />`, add:

```tsx
              <ConvictionBadge score={verdictDetails.convictionScore} />
```

- [ ] **Step 7: Test the Verdict tab**

Run: `npm run dev`

Navigate to a report → Verdict tab. Verify:
1. Conviction score appears at top with large number and explanation
2. Scenario cards show key assumptions bullet list
3. Multi-year projections table has Implied CAGR column
4. Price projection chart has dashed amber analyst mean line
5. Syndicate verdict card has conviction badge next to rating
6. No console errors

- [ ] **Step 8: Commit**

```bash
git add components/reports/tabs/VerdictTab.tsx
git commit -m "feat: upgrade Verdict tab with conviction score, key assumptions, analyst target overlay"
```

---

### Task 10: Update StockReport Shell to Pass New Data Slices

**Files:**
- Modify: `components/reports/StockReport.tsx`

The shell component currently passes tab-level data slices to each tab. Some new fields live at the root or cross-tab level, so the props need updating.

- [ ] **Step 1: Update tab component prop passing**

Replace the tab rendering block:

```tsx
        {activeTab === 'Overview' && <OverviewTab overview={report.overview} />}
        {activeTab === 'Financials' && <FinancialsTab financials={report.financials} />}
        {activeTab === 'Valuation' && <ValuationTab valuation={report.valuation} />}
        {activeTab === 'Catalysts' && <CatalystsTab catalysts={report.catalysts} />}
        {activeTab === 'Verdict' && <VerdictTab verdictDetails={report.verdictDetails} verdict={report.verdict} />}
```

No change needed — each tab already receives its data slice from the `StockReport` type, and the new fields are nested within those existing slices (`overview.analystConsensus`, `financials.dividendData`, etc.). The conviction score is in `verdictDetails.convictionScore`.

The shell component requires no modifications.

- [ ] **Step 2: Verify full app builds cleanly**

Run: `npx tsc --noEmit`

Expected: Zero errors. All types should align between the expanded interface, the server action, and the tab components.

- [ ] **Step 3: Commit (if any changes were needed)**

Only commit if changes were made. If the shell needed no changes, skip this step.

---

### Task 11: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test with a dividend-paying stock (e.g., AAPL)**

Navigate to `/reports/AAPL`. Check every tab:
- Overview: 8 metric cards, analyst consensus bar, institutional ownership, segment donut, moat radar with sector overlay
- Financials: Revenue vs COGS chart, margin trends chart, revenue & EPS chart, expanded data table, CAGR row, dividend section with FCF vs Dividends chart
- Valuation: Bull/bear with numbers, 5-column metrics table, analyst targets range, historical P/E chart
- Catalysts: 6-column catalyst table, risk cards with 3 badges, recommendation trend chart, insider timeline
- Verdict: Conviction score, scenario cards with assumptions, matrix with bold Expected Value row, projections with implied CAGR, price chart with analyst mean, syndicate card with conviction badge

- [ ] **Step 3: Test with a non-dividend stock (e.g., GOOG)**

Navigate to `/reports/GOOG`. Verify:
- Financials tab: No dividend section, no FCF vs Dividends chart
- All other sections render correctly

- [ ] **Step 4: Test with a smaller/riskier stock (e.g., PLTR)**

Navigate to `/reports/PLTR`. Verify:
- Conditional sections hide gracefully when data is missing
- No crashes from null/undefined fields

- [ ] **Step 5: Run production build**

Run: `npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve issues found during end-to-end verification"
```
