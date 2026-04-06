# Quant Pre-Score & Prompt Revamp Design

**Date:** 2026-04-06
**Scope:** Revamp `app/actions/generateReport.ts` with quantitative pre-scoring, macro overlay, chain-of-thought prompting, verdict veto logic, and post-Gemini validation.

## Architecture

Approach B — extract scoring, macro, and validation into separate modules:

| File | Responsibility |
|---|---|
| `lib/quantScore.ts` | Scoring engine with tunable weight config |
| `lib/macroContext.ts` | Macro environment data fetch |
| `lib/reportValidation.ts` | Post-Gemini source-of-truth validation |
| `app/actions/generateReport.ts` | Orchestrator (imports from the three modules) |
| `types/report.ts` | Extended with new fields |

## 1. Quant Pre-Score (`lib/quantScore.ts`)

### Weight Config

Exported at top of file for easy tuning:

```ts
export const QUANT_WEIGHTS = {
  analystConsensus:        0.15,
  priceVsTarget:           0.15,
  insiderActivity:         0.12,
  marginTrajectory:        0.10,
  revenueGrowthMomentum:   0.10,
  earningsGrowthMomentum:  0.10,
  fcfYield:                0.08,
  relativeValuation:       0.12,
  shortInterest:           0.08,
}
```

Weights sum to 1.0. Each factor produces a sub-score from -1 (bearish) to +1 (bullish).

### Factor Scoring

**Analyst consensus** — From `recommendationTrend` with temporal weighting (most recent month 3x, second 2x, older 1x). Compute weighted buy% and sell%. buy% > 70% → +1.0, buy% > 50% → +0.5, sell% > 40% → -0.5, sell% > 60% → -1.0, else 0.

**Price vs analyst mean target** — `(meanTarget - currentPrice) / currentPrice` gives upside%. Linear mapping: +30% upside → +1.0, 0% → 0, -20% downside → -1.0. Clamped to [-1, +1].

**Insider activity** — Bucket transactions by age. 0-30 days: 3x weight. 30-60 days: 2x. 60-90 days: 1x. Sum weighted net buys (buy = +1, sell = -1). Normalize: > +5 → +1.0, < -5 → -1.0, linear between.

**Margin trajectory** — Last 3 years of `marginTrends`. Simple linear regression slope on gross and operating margins. Both expanding → +1.0, both contracting → -1.0, mixed → average normalized.

**Revenue growth momentum** — YoY growth rates from last 3 years of `revenueVsCogs`. Compare most recent YoY to prior YoY. Difference > +5pp → +1.0, < -5pp → -1.0, linear between.

**Earnings growth momentum** — Same acceleration/deceleration logic using diluted EPS from `sortedIncome` (the `epsHistory` array already computed in `fetchYahooData`).

**FCF yield** — `FCF / marketCap` vs 4% benchmark. Yield > 8% → +1.0, 4% → 0, < 0% → -1.0. Linear interpolation.

**Relative valuation** — Two sub-signals averaged: (1) Compare `forwardPE` to `currentPE` (trailing) — if forward is significantly lower, implies earnings growth (bullish); if higher, implies contraction (bearish). (2) Compare `forwardPE` to a market average benchmark of ~20x — forward PE well below → cheap (+1), well above → expensive (-1). Average the two sub-signals. 30% deviation from benchmark = ±1 bounds.

**Short interest** — `shortPercentOfFloat` from `defaultKeyStatistics`. > 20% → -1.0, > 10% → -0.5, < 3% → +0.3, else 0. If unavailable, weight redistributed.

### Missing Data Handling

When a factor has no data, its weight is redistributed proportionally across remaining factors. Skipped factors are tracked in `skippedFactors` array.

### Score Normalization

1. Each factor: `contribution = score * weight`
2. Sum contributions → weighted sum in [-1, +1]
3. Normalize to 0-100: `(weightedSum + 1) / 2 * 100`
4. Verdict thresholds:
   - >= 70 → BUY
   - 45-69 → HOLD
   - 20-44 → SELL
   - < 20 → AVOID

### Return Type

```ts
interface QuantSignal {
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
```

## 2. Macro Overlay (`lib/macroContext.ts`)

### Data Sources

Uses existing `yahooFinance` client to fetch:

| Ticker | Data |
|---|---|
| `^VIX` | Volatility / fear level |
| `^TNX` | US 10-year treasury yield |
| `^GSPC` | S&P 500 level + moving averages |
| `^FVX` | US 5-year treasury yield (for yield curve) |

All four fetches via `Promise.allSettled` with 5-second timeout each. Failures silently omitted.

### Classification

- **VIX**: < 15 low fear, 15-25 moderate, 25-35 elevated, > 35 extreme fear
- **S&P 500**: Price vs `fiftyDayAverage` and `twoHundredDayAverage` as proxies for 1mo/3mo performance
- **Yield curve**: 10Y (`^TNX`) vs 5Y (`^FVX`). 10Y < 5Y → inverted. Spread < 0.2 → flat. Else normal.

### Returns

A formatted string block for prompt injection + a structured `MacroContext` object for storage:

```ts
interface MacroContext {
  vix: { level: number; classification: string } | null
  tenYearYield: number | null
  sp500: { price: number; fiftyDayAvg: number; twoHundredDayAvg: number } | null
  yieldCurve: { spread: number; status: 'inverted' | 'flat' | 'normal' } | null
  fetchedAt: string
}
```

## 3. Revamped Gemini Prompt

### Model Config

```ts
const model = genAI.getGenerativeModel({
  model: 'gemini-3-flash-preview',
  tools: [{ googleSearch: {} } as any],
  generationConfig: {
    thinkingConfig: { thinkingBudget: -1 },
  },
})
```

### Prompt Structure

**System persona:**

> You are a quantitative equity strategist at a multi-strategy hedge fund. You write dense, forward-looking analysis. Every sentence either cites a number or makes a falsifiable prediction. No filler. If a sentence could apply to any company, delete it.
>
> You are provided with a quantitative pre-score computed from market data. Your job is to CONFIRM, OVERRIDE, or NUANCE this signal with qualitative reasoning. If you disagree with the quant signal, you must explicitly state why.
>
> When the data is ambiguous or insufficient to support a strong directional call, default to HOLD. Never manufacture conviction.

**Context injection** — three labeled blocks:

1. `=== MARKET DATA ===` — existing `{yahooContext}` unchanged
2. `=== QUANTITATIVE PRE-SCORE ===` — score, verdict, full factor breakdown with scores/weights/contributions, skipped factors
3. `=== MACRO ENVIRONMENT ===` — `{macroContext}` output + directive: "Consider the current macro environment when evaluating risk and positioning. A rising rate / high VIX environment should increase your skepticism of growth-dependent theses."

**Chain-of-thought directive:**

> Before generating the final JSON, internally reason through these steps in order:
> 1. Evaluate the quant signal — which factors do you agree with and which do you think are misleading for this specific company?
> 2. Identify 1-3 qualitative factors NOT captured in the quant data (competitive dynamics, management quality, regulatory risk, product cycle) that should shift the verdict
> 3. Determine if macro conditions amplify or dampen the stock-specific thesis
> 4. Arrive at your final verdict and conviction score, noting any divergence from the quant signal
>
> Embed your reasoning chain in a top-level field called "reasoningTrace" in the JSON output.

**Split signal directive:**

> If your verdict DISAGREES with the quant pre-score verdict, you MUST set "splitSignal": true at the root level and explain the divergence in reasoningTrace.finalRationale. If you agree, set "splitSignal": false.

**Existing directives 1-8** — unchanged.

**Schema** — existing schema plus new root-level fields:

```json
"reasoningTrace": {
  "quantAgreement": "string — 1-3 sentences",
  "qualitativeOverrides": "string — 1-3 sentences",
  "macroImpact": "string — 1-3 sentences",
  "finalRationale": "string — 1-3 sentences"
},
"splitSignal": boolean
```

**Requirements section** — unchanged.

## 4. Verdict Veto Logic

Ordering: BUY (4) > HOLD (3) > SELL (2) > AVOID (1).

**Rules:**
- Gemini can always go more cautious (lower) than quant — no veto
- Gemini cannot go more than one notch bullish above quant
- If Gemini tries 2+ notches above quant, clamp to one notch above

| Quant | Gemini wants | Result | Reason |
|---|---|---|---|
| BUY | BUY | BUY | agree |
| BUY | HOLD/SELL/AVOID | Gemini wins | more cautious |
| HOLD | BUY | BUY | one notch up, allowed |
| HOLD | HOLD/SELL/AVOID | Gemini wins | same or more cautious |
| SELL | BUY | HOLD | 2 notches up, clamped |
| SELL | HOLD | HOLD | one notch up, allowed |
| SELL | SELL/AVOID | Gemini wins | same or more cautious |
| AVOID | BUY | SELL | 3 notches up, clamped |
| AVOID | HOLD | SELL | 2 notches up, clamped |
| AVOID | SELL | SELL | one notch up, allowed |
| AVOID | AVOID | AVOID | agree |

When veto fires, `splitSignal` is forced to `true`.

## 5. Post-Gemini Validation (`lib/reportValidation.ts`)

### Source Data Map

Built dynamically from Yahoo data — maps field names to known values (margins, growth rates, P/E ratios, prices, etc.).

### Scanning Logic

1. Recursively walk all string fields in Gemini output
2. Extract numerical claims via regex: percentages, dollar amounts, ratios
3. Fuzzy-match surrounding text against source data keys
4. Flag discrepancies exceeding thresholds:
   - Margins/yields: > 200bps
   - Growth rates: > 5 percentage points
   - P/E ratios: > 15% relative error
   - Dollar amounts: > 10% relative error

### Severity

- **high**: > 2x threshold
- **medium**: 1x-2x threshold
- **low**: just over threshold

### Return Type

```ts
interface DataValidation {
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
```

Does not auto-correct prose. Does not block report generation.

## 6. Execution Order in `generateReport()`

1. `fetchYahooData(symbol)` + `fetchMacroContext()` — **parallel** via `Promise.all`
2. `computeQuantSignal(yahoo)` — synchronous, after yahoo arrives
3. Build prompt with all three context blocks
4. Gemini call with `thinkingBudget: -1`
5. Parse JSON
6. `resolveVerdict(quantSignal.verdict, parsed.verdict)` — may override verdict
7. Existing Yahoo merge — **unchanged**
8. `validateReport(parsed, yahoo)` — after merge
9. Attach new fields: `quantSignal`, `reasoningTrace`, `splitSignal`, `dataValidation`, `macroContext`
10. Return

## 7. Type Changes (`types/report.ts`)

All additive — no existing fields renamed or removed:

```ts
// New root-level fields on StockReport:
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

reasoningTrace: {
  quantAgreement: string
  qualitativeOverrides: string
  macroImpact: string
  finalRationale: string
}

splitSignal: boolean

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

macroContext: {
  vix: { level: number; classification: string } | null
  tenYearYield: number | null
  sp500: { price: number; fiftyDayAvg: number; twoHundredDayAvg: number } | null
  yieldCurve: { spread: number; status: 'inverted' | 'flat' | 'normal' } | null
  fetchedAt: string
} | null
```

## Safe Defaults

- Macro fetch fails entirely: `macroContext` is `null`, macro section omitted from prompt
- Quant scoring has no usable factors: score defaults to 50 (HOLD), all factors skipped
- Gemini omits `reasoningTrace` or `splitSignal`: populated with defaults (false, empty strings)

## Constraints

- Existing StockReport fields untouched — only additive changes
- Existing Yahoo data fetch and post-processing merge logic unchanged
- All new API calls have error handling and timeouts (5s for macro, existing 120s for Gemini)
- Quant weights in clearly labeled exported config object
- Code comments explaining scoring logic for weight tuning
