# Quant Pre-Score & Prompt Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add quantitative pre-scoring, macro overlay, chain-of-thought prompting, verdict veto logic, and post-Gemini validation to the stock report generation pipeline.

**Architecture:** Three new modules (`lib/quantScore.ts`, `lib/macroContext.ts`, `lib/reportValidation.ts`) imported by the existing orchestrator (`app/actions/generateReport.ts`). Types extended in `types/report.ts`. Yahoo data fetch extended with three new return fields. Gemini prompt rewritten with quant + macro context and chain-of-thought forcing.

**Tech Stack:** TypeScript, Next.js 14 server actions, yahoo-finance2, Google Generative AI SDK

**Spec:** `docs/superpowers/specs/2026-04-06-quant-prescore-prompt-revamp-design.md`

---

### Task 1: Add new types to `types/report.ts`

**Files:**
- Modify: `types/report.ts`

- [ ] **Step 1: Add new root-level fields to StockReport interface**

Open `types/report.ts`. After the existing last field (`verdictDetails`), add these new fields before the closing `}`:

```ts
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
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: No type errors. Existing code that references `StockReport` will get errors about missing fields in later tasks — that's expected; the orchestrator will populate them.

- [ ] **Step 3: Commit**

```bash
git add types/report.ts
git commit -m "feat: add quantSignal, reasoningTrace, splitSignal, dataValidation, macroContext types"
```

---

### Task 2: Extend `fetchYahooData` return with fields needed for quant scoring

**Files:**
- Modify: `app/actions/generateReport.ts` (lines 90-360 — the `fetchYahooData` function)

The quant scoring module needs three fields not currently returned: `epsHistory`, `latestFCF`, and `shortPercentOfFloat`.

- [ ] **Step 1: Extract `shortPercentOfFloat` from keyStats**

In `app/actions/generateReport.ts`, find the line (around line 92):

```ts
    const keyStats = result.defaultKeyStatistics || {}
```

No change needed there — `keyStats` already holds the data. We just need to include it in the return object.

- [ ] **Step 2: Add the three new fields to the return object**

Find the return statement in `fetchYahooData` (starts around line 320: `return {`). Add these three fields anywhere in the return object. The best place is right after the `opCashFlowHistory` line (the last existing field, around line 358):

Replace:

```ts
      opCashFlowHistory: fcfHistory.map(f => ({ year: f.year, opCF: f.operatingCashFlow })),
    }
```

With:

```ts
      opCashFlowHistory: fcfHistory.map(f => ({ year: f.year, opCF: f.operatingCashFlow })),
      // Fields for quant pre-score
      epsHistory,
      latestFCF: fcfHistory.length > 0 ? fcfHistory[fcfHistory.length - 1].fcf : 0,
      shortPercentOfFloat: keyStats.shortPercentOfFloat != null ? safeNum(keyStats.shortPercentOfFloat) : null,
    }
```

`epsHistory` is already computed at lines 164-169 as a local variable. `fcfHistory` is computed at lines 139-150. `keyStats` is available from line 92. All three are already in scope.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build. The new fields are just additional properties on the return object.

- [ ] **Step 4: Commit**

```bash
git add app/actions/generateReport.ts
git commit -m "feat: expose epsHistory, latestFCF, shortPercentOfFloat from fetchYahooData"
```

---

### Task 3: Create `lib/quantScore.ts`

**Files:**
- Create: `lib/quantScore.ts`

- [ ] **Step 1: Create the file with the full implementation**

Create `lib/quantScore.ts` with this content:

```ts
// ── Quant Pre-Score Engine ──
// Computes a 0-100 score from Yahoo Finance data BEFORE the Gemini call.
// Each factor produces a sub-score from -1 (bearish) to +1 (bullish),
// gets weighted, and the total is normalized to 0-100.

// ── Tunable weight config ──
// Adjust these to change how aggressively each signal contributes.
// Weights MUST sum to 1.0.
export const QUANT_WEIGHTS: Record<string, number> = {
  analystConsensus:        0.15,  // buy% vs sell% from recommendationTrend
  priceVsTarget:           0.15,  // upside/downside to analyst mean target
  insiderActivity:         0.12,  // net buys in 90 days, recency-weighted
  marginTrajectory:        0.10,  // gross + operating margin slope (3yr)
  revenueGrowthMomentum:   0.10,  // revenue growth accelerating or decelerating
  earningsGrowthMomentum:  0.10,  // EPS growth accelerating or decelerating
  fcfYield:                0.08,  // FCF yield vs ~4% equity benchmark
  relativeValuation:       0.12,  // forward P/E vs trailing and market avg
  shortInterest:           0.08,  // short % of float
}

// ── Verdict thresholds ──
// Score 0-100 mapped to verdict
const VERDICT_THRESHOLDS = { BUY: 70, HOLD: 45, SELL: 20 }
// >= 70 BUY, 45-69 HOLD, 20-44 SELL, <20 AVOID

// ── Input type (matches fields from fetchYahooData return) ──
export interface QuantScoreInput {
  recommendationTrend: { month: string; buy: number; hold: number; sell: number }[]
  analystTargetRange: { mean: number; currentPrice: number }
  insiderTimeline: { date: string; type: 'BUY' | 'SELL'; shares: number; value: string }[] | null
  marginTrends: { year: string; gross: number; operating: number; net: number }[]
  revenueVsCogs: { year: string; revenue: number; cogs: number; grossProfit: number }[]
  epsHistory: { year: string; eps: number }[]
  marketCapRaw: number
  latestFCF: number
  forwardPE: number
  currentPE: number
  shortPercentOfFloat: number | null
}

export interface QuantSignal {
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

// ── Factor scoring functions ──
// Each returns NaN when data is missing (factor gets skipped).
// Each returns a value in [-1, +1].

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// Analyst consensus: buy% vs sell% with temporal weighting on months
// Most recent month 3x, second 2x, older 1x
function scoreAnalystConsensus(
  trend: QuantScoreInput['recommendationTrend']
): { score: number; rawValue: string } {
  if (!trend || trend.length === 0) return { score: NaN, rawValue: 'no data' }

  const recencyWeights = [3, 2, 1, 1]
  let wBuys = 0, wSells = 0, wTotal = 0

  for (let i = 0; i < trend.length; i++) {
    const w = recencyWeights[i] ?? 1
    wBuys += trend[i].buy * w
    wSells += trend[i].sell * w
    wTotal += (trend[i].buy + trend[i].hold + trend[i].sell) * w
  }

  if (wTotal === 0) return { score: NaN, rawValue: 'no ratings' }

  const buyPct = wBuys / wTotal
  const sellPct = wSells / wTotal

  let score: number
  if (buyPct > 0.7) score = 1.0
  else if (buyPct > 0.5) score = 0.5
  else if (sellPct > 0.6) score = -1.0
  else if (sellPct > 0.4) score = -0.5
  else score = 0

  return {
    score,
    rawValue: `buy ${(buyPct * 100).toFixed(0)}%, sell ${(sellPct * 100).toFixed(0)}% (weighted)`,
  }
}

// Price vs analyst mean target: linear map of upside/downside %
// +30% upside → +1, 0% → 0, -20% → -1
function scorePriceVsTarget(
  mean: number, currentPrice: number
): { score: number; rawValue: string } {
  if (!mean || !currentPrice || mean <= 0 || currentPrice <= 0) {
    return { score: NaN, rawValue: 'no target data' }
  }

  const upside = (mean - currentPrice) / currentPrice
  const score = upside >= 0
    ? clamp(upside / 0.30, 0, 1)
    : clamp(upside / 0.20, -1, 0)

  return {
    score,
    rawValue: `${(upside * 100).toFixed(1)}% ${upside >= 0 ? 'upside' : 'downside'} to $${mean.toFixed(0)} mean`,
  }
}

// Insider activity: recency-weighted net buys
// 0-30 days: 3x, 30-60 days: 2x, 60-90 days: 1x
// Normalize: > +5 → +1, < -5 → -1, linear between
function scoreInsiderActivity(
  timeline: QuantScoreInput['insiderTimeline']
): { score: number; rawValue: string } {
  if (!timeline || timeline.length === 0) return { score: NaN, rawValue: 'no data' }

  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000
  let weightedNet = 0
  let counted = 0

  for (const txn of timeline) {
    const ageInDays = (now - new Date(txn.date).getTime()) / DAY_MS
    if (ageInDays > 90) continue
    counted++
    const recencyWeight = ageInDays <= 30 ? 3 : ageInDays <= 60 ? 2 : 1
    weightedNet += (txn.type === 'BUY' ? 1 : -1) * recencyWeight
  }

  if (counted === 0) return { score: NaN, rawValue: 'no recent transactions' }

  return {
    score: clamp(weightedNet / 5, -1, 1),
    rawValue: `${counted} txns in 90d (weighted net: ${weightedNet >= 0 ? '+' : ''}${weightedNet.toFixed(1)})`,
  }
}

// Margin trajectory: linear regression slope on gross + operating margins (last 3 years)
// Both expanding → +1, both contracting → -1, mixed → average
function scoreMarginTrajectory(
  trends: QuantScoreInput['marginTrends']
): { score: number; rawValue: string } {
  if (!trends || trends.length < 2) return { score: NaN, rawValue: 'insufficient data' }

  const recent = trends.slice(-3)
  if (recent.length < 2) return { score: NaN, rawValue: 'insufficient data' }

  function slope(values: number[]): number {
    const n = values.length
    const xMean = (n - 1) / 2
    const yMean = values.reduce((a, b) => a + b, 0) / n
    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - yMean)
      den += (i - xMean) ** 2
    }
    return den === 0 ? 0 : num / den
  }

  // Slopes are in percentage points per year
  const grossSlope = slope(recent.map(m => m.gross))
  const opSlope = slope(recent.map(m => m.operating))

  // ~2pp/year slope is a strong signal → ±1
  const grossScore = clamp(grossSlope / 2, -1, 1)
  const opScore = clamp(opSlope / 2, -1, 1)
  const score = (grossScore + opScore) / 2

  return {
    score,
    rawValue: `gross ${grossSlope >= 0 ? '+' : ''}${grossSlope.toFixed(1)}pp/yr, op ${opSlope >= 0 ? '+' : ''}${opSlope.toFixed(1)}pp/yr`,
  }
}

// Revenue growth momentum: is YoY growth accelerating or decelerating?
// Compares most recent YoY to prior YoY.
// > +5pp acceleration → +1, < -5pp → -1, linear between
function scoreRevenueGrowthMomentum(
  revenueVsCogs: QuantScoreInput['revenueVsCogs']
): { score: number; rawValue: string } {
  if (!revenueVsCogs || revenueVsCogs.length < 3) {
    return { score: NaN, rawValue: 'insufficient data' }
  }

  const recent = revenueVsCogs.slice(-3)
  const growthRates: number[] = []

  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].revenue > 0) {
      growthRates.push(
        ((recent[i].revenue - recent[i - 1].revenue) / recent[i - 1].revenue) * 100
      )
    }
  }

  if (growthRates.length < 2) return { score: NaN, rawValue: 'insufficient growth data' }

  const acceleration = growthRates[growthRates.length - 1] - growthRates[growthRates.length - 2]

  return {
    score: clamp(acceleration / 5, -1, 1),
    rawValue: `${acceleration >= 0 ? '+' : ''}${acceleration.toFixed(1)}pp acceleration`,
  }
}

// Earnings growth momentum: same as revenue but using diluted EPS
function scoreEarningsGrowthMomentum(
  epsHistory: QuantScoreInput['epsHistory']
): { score: number; rawValue: string } {
  if (!epsHistory || epsHistory.length < 3) {
    return { score: NaN, rawValue: 'insufficient data' }
  }

  const recent = epsHistory.slice(-3)
  const growthRates: number[] = []

  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].eps > 0) {
      growthRates.push(
        ((recent[i].eps - recent[i - 1].eps) / recent[i - 1].eps) * 100
      )
    }
  }

  if (growthRates.length < 2) return { score: NaN, rawValue: 'insufficient EPS data' }

  const acceleration = growthRates[growthRates.length - 1] - growthRates[growthRates.length - 2]

  return {
    score: clamp(acceleration / 5, -1, 1),
    rawValue: `${acceleration >= 0 ? '+' : ''}${acceleration.toFixed(1)}pp EPS acceleration`,
  }
}

// FCF yield: (FCF / marketCap) vs 4% benchmark
// > 8% → +1, 4% → 0, < 0% → -1
function scoreFCFYield(
  latestFCF: number, marketCapRaw: number
): { score: number; rawValue: string } {
  if (!marketCapRaw || marketCapRaw <= 0) return { score: NaN, rawValue: 'no market cap' }
  if (latestFCF === 0 && marketCapRaw > 0) {
    // Zero FCF is meaningful data (negative signal), not missing data
    return { score: -0.5, rawValue: '0% FCF yield' }
  }

  const fcfYieldPct = (latestFCF / marketCapRaw) * 100

  let score: number
  if (fcfYieldPct >= 4) {
    score = clamp((fcfYieldPct - 4) / 4, 0, 1)
  } else {
    score = clamp(fcfYieldPct / 4, -1, 0)
  }

  return {
    score,
    rawValue: `${fcfYieldPct.toFixed(1)}% (vs 4% benchmark)`,
  }
}

// Relative valuation: two sub-signals averaged
// 1. Forward PE vs trailing PE (forward < trailing = growth expected = bullish)
// 2. Forward PE vs ~20x market average (below = cheap, above = expensive)
function scoreRelativeValuation(
  forwardPE: number, currentPE: number
): { score: number; rawValue: string } {
  if (!forwardPE || forwardPE <= 0) return { score: NaN, rawValue: 'no forward P/E' }

  const MARKET_AVG_PE = 20

  // Sub-signal 1: forward vs trailing
  let forwardVsTrailing = 0
  if (currentPE > 0) {
    const ratio = forwardPE / currentPE
    // ratio < 0.8 → +1 (strong growth), ratio > 1.2 → -1 (contraction)
    forwardVsTrailing = clamp((1 - ratio) / 0.2, -1, 1)
  }

  // Sub-signal 2: forward PE vs market average
  // below 20 → cheap (positive), above 20 → expensive (negative)
  const deviation = (forwardPE - MARKET_AVG_PE) / MARKET_AVG_PE
  const vsMarket = clamp(-deviation / 0.3, -1, 1)

  const score = currentPE > 0
    ? (forwardVsTrailing + vsMarket) / 2
    : vsMarket

  return {
    score,
    rawValue: `fwd ${forwardPE.toFixed(1)}x vs ${currentPE > 0 ? currentPE.toFixed(1) + 'x trailing, ' : ''}${MARKET_AVG_PE}x market avg`,
  }
}

// Short interest: > 20% → -1, > 10% → -0.5, < 3% → +0.3, else 0
function scoreShortInterest(
  shortPctFloat: number | null
): { score: number; rawValue: string } {
  if (shortPctFloat == null) return { score: NaN, rawValue: 'no data' }

  // Yahoo returns this as a decimal (e.g., 0.05 = 5%)
  const pct = shortPctFloat * 100

  let score: number
  if (shortPctFloat > 0.20) score = -1.0
  else if (shortPctFloat > 0.10) score = -0.5
  else if (shortPctFloat < 0.03) score = 0.3
  else score = 0

  return {
    score,
    rawValue: `${pct.toFixed(1)}% of float`,
  }
}

// ── Main scoring function ──

export function computeQuantSignal(input: QuantScoreInput): QuantSignal {
  // Run all factor scorers
  const rawFactors: { key: string; name: string; result: { score: number; rawValue: string } }[] = [
    { key: 'analystConsensus', name: 'Analyst Consensus', result: scoreAnalystConsensus(input.recommendationTrend) },
    { key: 'priceVsTarget', name: 'Price vs Target', result: scorePriceVsTarget(input.analystTargetRange.mean, input.analystTargetRange.currentPrice) },
    { key: 'insiderActivity', name: 'Insider Activity', result: scoreInsiderActivity(input.insiderTimeline) },
    { key: 'marginTrajectory', name: 'Margin Trajectory', result: scoreMarginTrajectory(input.marginTrends) },
    { key: 'revenueGrowthMomentum', name: 'Revenue Momentum', result: scoreRevenueGrowthMomentum(input.revenueVsCogs) },
    { key: 'earningsGrowthMomentum', name: 'Earnings Momentum', result: scoreEarningsGrowthMomentum(input.epsHistory) },
    { key: 'fcfYield', name: 'FCF Yield', result: scoreFCFYield(input.latestFCF, input.marketCapRaw) },
    { key: 'relativeValuation', name: 'Relative Valuation', result: scoreRelativeValuation(input.forwardPE, input.currentPE) },
    { key: 'shortInterest', name: 'Short Interest', result: scoreShortInterest(input.shortPercentOfFloat) },
  ]

  // Separate active from skipped
  const active = rawFactors.filter(f => !isNaN(f.result.score))
  const skippedFactors = rawFactors.filter(f => isNaN(f.result.score)).map(f => f.name)

  // If no factors have data, return neutral default
  if (active.length === 0) {
    return {
      score: 50,
      verdict: 'HOLD',
      factors: [],
      skippedFactors: rawFactors.map(f => f.name),
    }
  }

  // Redistribute weights proportionally across active factors
  const totalActiveWeight = active.reduce((sum, f) => sum + QUANT_WEIGHTS[f.key], 0)

  let weightedSum = 0
  const factors: QuantSignal['factors'] = []

  for (const f of active) {
    const effectiveWeight = QUANT_WEIGHTS[f.key] / totalActiveWeight
    const contribution = f.result.score * effectiveWeight
    weightedSum += contribution

    factors.push({
      name: f.name,
      rawValue: f.result.rawValue,
      score: parseFloat(f.result.score.toFixed(2)),
      weight: parseFloat(effectiveWeight.toFixed(3)),
      contribution: parseFloat(contribution.toFixed(4)),
    })
  }

  // Normalize [-1, +1] → [0, 100]
  const score = Math.round(clamp((weightedSum + 1) / 2 * 100, 0, 100))

  let verdict: QuantSignal['verdict']
  if (score >= VERDICT_THRESHOLDS.BUY) verdict = 'BUY'
  else if (score >= VERDICT_THRESHOLDS.HOLD) verdict = 'HOLD'
  else if (score >= VERDICT_THRESHOLDS.SELL) verdict = 'SELL'
  else verdict = 'AVOID'

  return { score, verdict, factors, skippedFactors }
}

// ── Format for prompt injection ──

export function formatQuantSignal(signal: QuantSignal): string {
  const lines = [
    `Score: ${signal.score}/100 (${signal.verdict})`,
    'Factor breakdown:',
    ...signal.factors.map(f =>
      `- ${f.name}: ${f.score >= 0 ? '+' : ''}${f.score.toFixed(2)} (weight ${f.weight.toFixed(2)}, contribution ${f.contribution >= 0 ? '+' : ''}${f.contribution.toFixed(3)}) — ${f.rawValue}`
    ),
  ]
  if (signal.skippedFactors.length > 0) {
    lines.push(`Skipped factors: ${signal.skippedFactors.join(', ')} (data unavailable)`)
  }
  return lines.join('\n')
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build. The module isn't imported anywhere yet.

- [ ] **Step 3: Commit**

```bash
git add lib/quantScore.ts
git commit -m "feat: add quant pre-score engine with 9 weighted factors"
```

---

### Task 4: Create `lib/macroContext.ts`

**Files:**
- Create: `lib/macroContext.ts`

- [ ] **Step 1: Create the file with the full implementation**

Create `lib/macroContext.ts` with this content:

```ts
// ── Macro Environment Overlay ──
// Fetches VIX, 10Y yield, S&P 500, and 5Y yield for yield curve analysis.
// All fetches are best-effort with 5s timeouts — any that fail are silently omitted.

import { yahooFinance } from '@/lib/yahoo'

export interface MacroContext {
  vix: { level: number; classification: string } | null
  tenYearYield: number | null
  sp500: { price: number; fiftyDayAvg: number; twoHundredDayAvg: number } | null
  yieldCurve: { spread: number; status: 'inverted' | 'flat' | 'normal' } | null
  fetchedAt: string
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Macro fetch timed out')), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

function classifyVIX(level: number): string {
  if (level < 15) return 'low fear'
  if (level <= 25) return 'moderate'
  if (level <= 35) return 'elevated'
  return 'extreme fear'
}

export async function fetchMacroContext(): Promise<{ formatted: string; data: MacroContext }> {
  const data: MacroContext = {
    vix: null,
    tenYearYield: null,
    sp500: null,
    yieldCurve: null,
    fetchedAt: new Date().toISOString(),
  }

  // Fetch all four tickers in parallel, each with 5s timeout
  const [vixResult, tnxResult, gspcResult, fvxResult] = await Promise.allSettled([
    withTimeout(yahooFinance.quote('^VIX', {}, { validateResult: false } as any), 5000),
    withTimeout(yahooFinance.quote('^TNX', {}, { validateResult: false } as any), 5000),
    withTimeout(yahooFinance.quote('^GSPC', {}, { validateResult: false } as any), 5000),
    withTimeout(yahooFinance.quote('^FVX', {}, { validateResult: false } as any), 5000),
  ])

  // Process VIX
  if (vixResult.status === 'fulfilled' && vixResult.value) {
    const q = vixResult.value as any
    const level = q.regularMarketPrice ?? 0
    if (level > 0) {
      data.vix = { level, classification: classifyVIX(level) }
    }
  }

  // Process 10Y yield
  let tenY = 0
  if (tnxResult.status === 'fulfilled' && tnxResult.value) {
    const q = tnxResult.value as any
    tenY = q.regularMarketPrice ?? 0
    if (tenY > 0) data.tenYearYield = tenY
  }

  // Process S&P 500
  if (gspcResult.status === 'fulfilled' && gspcResult.value) {
    const q = gspcResult.value as any
    const price = q.regularMarketPrice ?? 0
    if (price > 0) {
      data.sp500 = {
        price,
        fiftyDayAvg: q.fiftyDayAverage ?? 0,
        twoHundredDayAvg: q.twoHundredDayAverage ?? 0,
      }
    }
  }

  // Process yield curve (10Y vs 5Y)
  let fiveY = 0
  if (fvxResult.status === 'fulfilled' && fvxResult.value) {
    const q = fvxResult.value as any
    fiveY = q.regularMarketPrice ?? 0
  }
  if (tenY > 0 && fiveY > 0) {
    const spread = tenY - fiveY
    let status: 'inverted' | 'flat' | 'normal'
    if (spread < 0) status = 'inverted'
    else if (spread < 0.2) status = 'flat'
    else status = 'normal'
    data.yieldCurve = { spread: parseFloat(spread.toFixed(2)), status }
  }

  // Build formatted string for prompt injection
  const lines: string[] = []
  if (data.vix) lines.push(`- VIX: ${data.vix.level.toFixed(1)} (${data.vix.classification})`)
  if (data.tenYearYield != null) lines.push(`- US 10-Year Yield: ${data.tenYearYield.toFixed(2)}%`)
  if (data.sp500) {
    lines.push(`- S&P 500: ${data.sp500.price.toFixed(0)} (50-day avg: ${data.sp500.fiftyDayAvg.toFixed(0)}, 200-day avg: ${data.sp500.twoHundredDayAvg.toFixed(0)})`)
  }
  if (data.yieldCurve) {
    lines.push(`- Yield Curve (10Y vs 5Y): ${data.yieldCurve.spread >= 0 ? '+' : ''}${data.yieldCurve.spread.toFixed(2)}% spread (${data.yieldCurve.status})`)
  }

  const formatted = lines.length > 0
    ? `MACRO ENVIRONMENT (as of ${new Date().toISOString().split('T')[0]}):\n${lines.join('\n')}`
    : ''

  return { formatted, data }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add lib/macroContext.ts
git commit -m "feat: add macro context overlay (VIX, 10Y yield, S&P 500, yield curve)"
```

---

### Task 5: Create `lib/reportValidation.ts`

**Files:**
- Create: `lib/reportValidation.ts`

- [ ] **Step 1: Create the file with the full implementation**

Create `lib/reportValidation.ts` with this content:

```ts
// ── Post-Gemini Source-of-Truth Validation ──
// Scans all string fields in the Gemini output for numerical claims,
// cross-references them against Yahoo Finance data, and flags discrepancies.
// Does NOT auto-correct prose or block report generation.

// ── Discrepancy thresholds by data type ──
const THRESHOLDS: Record<string, number> = {
  margin: 2.0,    // 200bps — margins, yields
  growth: 5.0,    // 5 percentage points — growth rates
  pe: 0.15,       // 15% relative error — P/E ratios
  dollar: 0.10,   // 10% relative error — dollar amounts
}

interface SourceEntry {
  value: number
  type: 'margin' | 'growth' | 'pe' | 'dollar'
}

interface FlaggedClaim {
  field: string
  claim: string
  sourceValue: string
  geminiValue: string
  severity: 'low' | 'medium' | 'high'
}

export interface DataValidation {
  flaggedClaims: FlaggedClaim[]
  validationScore: number
  totalChecked: number
  totalFlagged: number
}

// Build a lookup of ground-truth values from Yahoo data
function buildSourceMap(yahoo: any): Map<string, SourceEntry> {
  const map = new Map<string, SourceEntry>()

  // Margins from latest year of marginTrends
  const latestMargin = yahoo.marginTrends?.[yahoo.marginTrends.length - 1]
  if (latestMargin) {
    map.set('gross margin', { value: latestMargin.gross, type: 'margin' })
    map.set('operating margin', { value: latestMargin.operating, type: 'margin' })
    map.set('net margin', { value: latestMargin.net, type: 'margin' })
  }

  // P/E ratios
  if (yahoo.currentPE > 0) map.set('trailing p/e', { value: yahoo.currentPE, type: 'pe' })
  if (yahoo.forwardPE > 0) map.set('forward p/e', { value: yahoo.forwardPE, type: 'pe' })

  // Beta (use relative threshold)
  if (yahoo.beta > 0) map.set('beta', { value: yahoo.beta, type: 'pe' })

  // Analyst targets
  if (yahoo.analystTargetRange?.mean > 0) {
    map.set('analyst mean target', { value: yahoo.analystTargetRange.mean, type: 'dollar' })
    map.set('mean target', { value: yahoo.analystTargetRange.mean, type: 'dollar' })
    map.set('target price', { value: yahoo.analystTargetRange.mean, type: 'dollar' })
  }

  // Dividend yield (stored as formatted string like "0.5%" — parse it)
  if (yahoo.dividendData?.currentYield) {
    const yieldVal = parseFloat(yahoo.dividendData.currentYield)
    if (!isNaN(yieldVal)) map.set('dividend yield', { value: yieldVal, type: 'margin' })
  }

  // Revenue growth — compute YoY from latest two years
  if (yahoo.revenueVsCogs?.length >= 2) {
    const arr = yahoo.revenueVsCogs
    const latest = arr[arr.length - 1].revenue
    const prev = arr[arr.length - 2].revenue
    if (prev > 0) {
      map.set('revenue growth', { value: ((latest - prev) / prev) * 100, type: 'growth' })
    }
  }

  return map
}

// Extract numerical claims from a text string
function extractNumbers(text: string): { value: number; context: string; unit: 'pct' | 'dollar' | 'ratio' }[] {
  const results: { value: number; context: string; unit: 'pct' | 'dollar' | 'ratio' }[] = []

  // Percentages: 28.5%
  const pctRegex = /(\d+\.?\d*)%/g
  let match: RegExpExecArray | null
  while ((match = pctRegex.exec(text)) !== null) {
    results.push({
      value: parseFloat(match[1]),
      context: text.substring(Math.max(0, match.index - 40), match.index + match[0].length + 10).trim(),
      unit: 'pct',
    })
  }

  // Dollar amounts: $245, $1.2B, $95.2B
  const dollarRegex = /\$(\d[\d,.]*)\s*([BMTbmt])?/g
  while ((match = dollarRegex.exec(text)) !== null) {
    let value = parseFloat(match[1].replace(/,/g, ''))
    const suffix = match[2]?.toUpperCase()
    if (suffix === 'B') value *= 1e9
    else if (suffix === 'M') value *= 1e6
    else if (suffix === 'T') value *= 1e12
    results.push({
      value,
      context: text.substring(Math.max(0, match.index - 40), match.index + match[0].length + 10).trim(),
      unit: 'dollar',
    })
  }

  // Ratios: 28.4x
  const ratioRegex = /(\d+\.?\d*)x\b/g
  while ((match = ratioRegex.exec(text)) !== null) {
    results.push({
      value: parseFloat(match[1]),
      context: text.substring(Math.max(0, match.index - 40), match.index + match[0].length + 10).trim(),
      unit: 'ratio',
    })
  }

  return results
}

// Recursively walk an object and collect all string fields with their JSON paths
function walkStrings(obj: any, path: string = ''): { path: string; value: string }[] {
  const results: { path: string; value: string }[] = []
  if (typeof obj === 'string') {
    results.push({ path, value: obj })
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      results.push(...walkStrings(obj[i], `${path}[${i}]`))
    }
  } else if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      results.push(...walkStrings(obj[key], path ? `${path}.${key}` : key))
    }
  }
  return results
}

function computeSeverity(discrepancy: number, threshold: number): 'low' | 'medium' | 'high' {
  if (discrepancy > threshold * 2) return 'high'
  if (discrepancy > threshold * 1.5) return 'medium'
  return 'low'
}

export function validateReport(report: any, yahoo: any): DataValidation {
  const sourceMap = buildSourceMap(yahoo)
  const flaggedClaims: FlaggedClaim[] = []
  let totalChecked = 0

  const strings = walkStrings(report)

  for (const { path, value } of strings) {
    // Skip fields we know are Yahoo-sourced (already overwritten, guaranteed correct)
    if (path.startsWith('overview.analystConsensus')) continue
    if (path.startsWith('overview.institutionalOwnership')) continue
    if (path.startsWith('overview.revenueCagr')) continue
    if (path.startsWith('overview.netIncomeCagr')) continue
    if (path.startsWith('valuation.analystTargetRange')) continue
    if (path.startsWith('catalysts.recommendationTrend')) continue
    if (path.startsWith('catalysts.insiderTimeline')) continue

    const numbers = extractNumbers(value)

    for (const num of numbers) {
      const contextLower = num.context.toLowerCase()

      for (const [key, source] of sourceMap) {
        // Check if the context mentions this data point
        // Use the first word of the key for fuzzy matching
        const keyWords = key.split(' ')
        const hasKey = contextLower.includes(key) ||
          (keyWords.length > 1 && keyWords.every(w => contextLower.includes(w)))
        if (!hasKey) continue

        totalChecked++

        let discrepancy: number
        if (source.type === 'margin' || source.type === 'growth') {
          // Absolute difference in percentage points
          discrepancy = Math.abs(num.value - source.value)
        } else {
          // Relative error for P/E and dollar amounts
          discrepancy = source.value !== 0
            ? Math.abs(num.value - source.value) / Math.abs(source.value)
            : 0
        }

        const threshold = THRESHOLDS[source.type]
        if (discrepancy > threshold) {
          flaggedClaims.push({
            field: path,
            claim: num.context,
            sourceValue: `${source.value}`,
            geminiValue: `${num.value}`,
            severity: computeSeverity(discrepancy, threshold),
          })
        }
      }
    }
  }

  const totalFlagged = flaggedClaims.length

  return {
    flaggedClaims,
    validationScore: totalChecked > 0 ? Math.round((1 - totalFlagged / totalChecked) * 100) : 100,
    totalChecked,
    totalFlagged,
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add lib/reportValidation.ts
git commit -m "feat: add post-Gemini source-of-truth validation engine"
```

---

### Task 6: Revamp prompt, add veto logic, and wire orchestration in `generateReport.ts`

**Files:**
- Modify: `app/actions/generateReport.ts`

This is the integration task. It modifies the `generateReport()` function to import the new modules, run them in the correct order, build the new prompt, apply veto logic, and attach all new fields.

- [ ] **Step 1: Add imports**

At the top of `app/actions/generateReport.ts`, after the existing imports (line 5: `import { yahooFinance } from '@/lib/yahoo'`), add:

```ts
import { computeQuantSignal, formatQuantSignal, type QuantSignal } from '@/lib/quantScore'
import { fetchMacroContext, type MacroContext } from '@/lib/macroContext'
import { validateReport } from '@/lib/reportValidation'
```

- [ ] **Step 2: Add the verdict veto function**

After the existing helper functions (after the `safeNum` function, around line 42), add:

```ts
// ── Verdict veto logic ──
// Gemini can always go more cautious than quant, but cannot go more than
// one notch bullish above quant. If it tries, clamp to one notch above.
const VERDICT_RANK: Record<string, number> = { AVOID: 1, SELL: 2, HOLD: 3, BUY: 4 }
const RANK_TO_VERDICT: Record<number, 'BUY' | 'SELL' | 'HOLD' | 'AVOID'> = {
  1: 'AVOID', 2: 'SELL', 3: 'HOLD', 4: 'BUY',
}

function resolveVerdict(
  quantVerdict: string, geminiVerdict: string
): { verdict: 'BUY' | 'SELL' | 'HOLD' | 'AVOID'; vetoed: boolean } {
  const qRank = VERDICT_RANK[quantVerdict] ?? 3
  const gRank = VERDICT_RANK[geminiVerdict] ?? 3

  // Gemini going more cautious or same — always allowed
  if (gRank <= qRank) {
    return { verdict: RANK_TO_VERDICT[gRank], vetoed: false }
  }

  // Gemini going one notch more bullish — allowed
  if (gRank - qRank <= 1) {
    return { verdict: RANK_TO_VERDICT[gRank], vetoed: false }
  }

  // Gemini trying to go 2+ notches more bullish — veto, clamp to one above quant
  return { verdict: RANK_TO_VERDICT[qRank + 1], vetoed: true }
}
```

- [ ] **Step 3: Modify `generateReport()` — parallel fetch + quant signal**

In the `generateReport` function, find the line (around line 416):

```ts
    const yahoo = await fetchYahooData(symbol)
```

Replace it with:

```ts
    // Fetch Yahoo data + macro context in parallel
    const [yahoo, macroResult] = await Promise.all([
      fetchYahooData(symbol),
      fetchMacroContext().catch((): { formatted: string; data: MacroContext | null } => ({
        formatted: '',
        data: null,
      })),
    ])
```

- [ ] **Step 4: Add quant signal computation after Yahoo data**

Right after the parallel fetch (the line you just added), and before the `const genAI = getGenAI()` line, add:

```ts
    // Compute quant pre-score from Yahoo data
    const quantSignal: QuantSignal = yahoo
      ? computeQuantSignal(yahoo)
      : { score: 50, verdict: 'HOLD', factors: [], skippedFactors: ['all (Yahoo data unavailable)'] }
```

- [ ] **Step 5: Update model config with thinkingBudget**

Find the model initialization (around line 419):

```ts
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      tools: [{ googleSearch: {} } as any],
    })
```

Replace with:

```ts
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      tools: [{ googleSearch: {} } as any],
      generationConfig: {
        thinkingConfig: { thinkingBudget: -1 },
      } as any,
    })
```

- [ ] **Step 6: Rewrite the prompt**

Find the prompt template (starts around line 454 with `const prompt = \`You are a quantitative equity strategist...`). Replace the ENTIRE prompt string (from `const prompt = \`` through the closing `` \` `` before `const result = await withTimeout`) with:

```ts
    const quantContext = formatQuantSignal(quantSignal)
    const macroContextStr = macroResult.formatted

    const prompt = `You are a quantitative equity strategist at a multi-strategy hedge fund. You write dense, forward-looking analysis. Every sentence either cites a number or makes a falsifiable prediction. No filler. If a sentence could apply to any company, delete it.

You are provided with a quantitative pre-score computed from market data. Your job is to CONFIRM, OVERRIDE, or NUANCE this signal with qualitative reasoning. If you disagree with the quant signal, you must explicitly state why.

When the data is ambiguous or insufficient to support a strong directional call, default to HOLD. Never manufacture conviction.

Here is today's market data, quantitative signal, and macro context for ${symbol} as of ${new Date().toISOString().split('T')[0]}. Your job is to ANALYZE this data, not repeat it. Data-sourced fields (prices, margins, analyst targets, insider activity) will be injected separately into the report — you do not generate them. Focus on interpretation, thesis, and forward scenarios.

=== MARKET DATA ===
${yahooContext}

=== QUANTITATIVE PRE-SCORE ===
${quantContext}

=== MACRO ENVIRONMENT ===
${macroContextStr || 'Macro data unavailable.'}
Consider the current macro environment when evaluating risk and positioning. A rising rate / high VIX environment should increase your skepticism of growth-dependent theses.

CHAIN-OF-THOUGHT:
Before generating the final JSON, internally reason through these steps in order:
1. Evaluate the quant signal — which factors do you agree with and which do you think are misleading for this specific company?
2. Identify 1-3 qualitative factors NOT captured in the quant data (competitive dynamics, management quality, regulatory risk, product cycle) that should shift the verdict
3. Determine if macro conditions amplify or dampen the stock-specific thesis
4. Arrive at your final verdict and conviction score, noting any divergence from the quant signal

Embed your reasoning chain in a top-level field called "reasoningTrace" in the JSON output — this should be a structured object with keys: quantAgreement, qualitativeOverrides, macroImpact, finalRationale — each being 1-3 sentences.

SPLIT SIGNAL:
If your verdict DISAGREES with the quant pre-score verdict, you MUST set "splitSignal": true at the root level and explain the divergence in reasoningTrace.finalRationale. If you agree, set "splitSignal": false.

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
  "splitSignal": boolean,
  "reasoningTrace": {
    "quantAgreement": "string — 1-3 sentences on which quant factors you agree/disagree with",
    "qualitativeOverrides": "string — 1-3 sentences on qualitative factors not in the quant data",
    "macroImpact": "string — 1-3 sentences on how macro conditions affect the thesis",
    "finalRationale": "string — 1-3 sentences on your final verdict and any divergence from quant"
  },
  "badges": [{ "text": "string — qualitative/narrative tag about the company", "sentiment": "'positive' | 'negative' | 'neutral' | 'caution' — classify based on whether this tag is bullish (positive), bearish (negative), informational (neutral), or a risk/warning (caution)" }],
  "overview": {
    "keyMetrics": [
      { "label": "string", "value": "string", "subtitle": "string or omit", "color": "hex or omit", "yoyChange": "string like '+12.3%'" }
    ],
    "businessSummary": {
      "businessModel": "string — 2-3 sentences on what this company does, its business model, and competitive position",
      "financials": "string — 2-3 sentences summarizing financial health, growth trajectory, and profitability",
      "valuation": "string — 2-3 sentences on current valuation, whether it appears cheap or expensive, and key valuation metrics"
    },
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
- badges: 8-12 objects. Each tag must be qualitative/narrative — NEVER include numeric metrics (market cap, P/E, dividend yield, revenue, EPS, beta, CAGR, margins). Good: 'DOJ Investigation' (negative), 'Buffett Favorite' (positive), 'AI Tailwind' (positive), 'Founder-Led' (neutral), 'Dividend Aristocrat' (positive), 'Tariff Exposed' (caution). Sentiment must reflect whether the tag is bullish, bearish, informational, or a warning for this specific company.
- overview.keyMetrics: copy the PRE-BUILT KEY METRICS from context exactly (label, value, yoyChange are already correct real-time data — do NOT change them). Your only job per metric is to add a "subtitle" field: 3-5 words of sharp interpretation (e.g. "above sector avg", "accelerating trend", "historically cheap", "crowded valuation", "near multi-year low"). Use your web search knowledge and the provided financials to make these insightful, not generic.
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
```

- [ ] **Step 7: Add verdict veto after Gemini parse**

Find the line (around line 553):

```ts
    const parsed = JSON.parse(cleaned) as StockReport
```

Right after that line, and BEFORE the `// ── Merge Yahoo Finance data into Gemini response ──` comment, add:

```ts
    // ── Apply verdict veto ──
    const { verdict: finalVerdict, vetoed } = resolveVerdict(quantSignal.verdict, parsed.verdict)
    parsed.verdict = finalVerdict
```

- [ ] **Step 8: Add validation and new field attachment after the existing merge**

Find the end of the existing merge/defaults block. Look for the line (around line 699):

```ts
    parsed.verdictDetails.convictionDrivers = parsed.verdictDetails.convictionDrivers ?? ''

    return parsed
```

Replace `return parsed` with:

```ts
    // ── Post-Gemini validation ──
    const dataValidation = yahoo
      ? validateReport(parsed, yahoo)
      : { flaggedClaims: [], validationScore: 100, totalChecked: 0, totalFlagged: 0 }

    // ── Attach new fields ──
    parsed.quantSignal = quantSignal
    parsed.splitSignal = vetoed || (parsed.splitSignal ?? false)
    parsed.reasoningTrace = parsed.reasoningTrace ?? {
      quantAgreement: '',
      qualitativeOverrides: '',
      macroImpact: '',
      finalRationale: '',
    }
    parsed.dataValidation = dataValidation
    parsed.macroContext = macroResult.data

    return parsed
```

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Clean build with no type errors. All new types are populated by the orchestrator.

- [ ] **Step 10: Commit**

```bash
git add app/actions/generateReport.ts
git commit -m "feat: revamp prompt with quant pre-score, macro overlay, CoT, and verdict veto"
```

---

### Task 7: End-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

Expected: Server starts at http://localhost:3000 without errors.

- [ ] **Step 2: Generate a report**

Open http://localhost:3000 in a browser and generate a report for a well-known ticker (e.g., AAPL). Verify:

1. Report generates without errors
2. The report loads in the UI as before (no visual regressions)
3. Check browser console / server logs for any warnings from the validation engine

- [ ] **Step 3: Verify new fields in response**

In the browser dev tools Network tab, inspect the response from the report generation. Confirm these new fields exist:

- `quantSignal` — with `score`, `verdict`, `factors` array
- `reasoningTrace` — with four sub-fields
- `splitSignal` — boolean
- `dataValidation` — with `flaggedClaims`, `validationScore`
- `macroContext` — with VIX, yield, S&P data (or null if market is closed)

- [ ] **Step 4: Commit any fixes if needed**

If the build or runtime test revealed issues, fix them and commit:

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```
