# Gemini Report Prompt Optimization

**Date**: 2026-04-04
**Goal**: Switch to Gemini 3 Flash, cut generation time by stripping ~40% of the schema, improve analysis quality, and add news context.

## Summary

The current `generateReport()` server action sends a massive prompt to `gemini-2.5-flash` containing a ~90-line JSON schema. Roughly 40% of the fields in that schema are immediately overwritten by Yahoo Finance data after generation. The prompt's analytical directives are generic, producing prose that is often fluffy, backward-looking, and not tightly coupled to the provided data.

This redesign:
1. Switches to `gemini-3-flash` for faster generation
2. Strips all Yahoo-overwritten fields from the prompt schema (~40% reduction)
3. Rewrites the prompt for denser, forward-looking, data-grounded analysis
4. Adds recent news headlines as context for event-aware analysis
5. Replaces the hardcoded date with a dynamic one

## File scope

Only one file changes: `app/actions/generateReport.ts`

- `types/report.ts` — no changes (the TypeScript interface stays the same)
- All tab components — no changes (they consume the same `StockReport` shape)
- Post-generation Yahoo merge logic — no changes
- Defensive patching for omitted fields — no changes

## Change 1: Model switch

```diff
- const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
+ const model = genAI.getGenerativeModel({ model: 'gemini-3-flash' })
```

Verify `@google/generative-ai` package version supports `gemini-3-flash`. Update if needed.

## Change 2: Add news fetching

Add a news fetch inside `fetchYahooData()` using `yahoo-finance2`'s `search()` method. This runs alongside existing data fetching — no extra round trip to a separate service.

```ts
// Inside fetchYahooData(), after the existing quoteSummary call
const newsResults = await yahooFinance.search(ticker, { newsCount: 10, quotesCount: 0 })
const recentNews = (newsResults.news || []).slice(0, 10).map((n: any) => ({
  title: n.title || '',
  date: n.providerPublishTime
    ? new Date(n.providerPublishTime * 1000).toISOString().split('T')[0]
    : '',
  snippet: n.snippet || n.title || '',
}))
```

Return `recentNews` as part of the yahoo data object. If the search call fails, default to an empty array — news is supplementary, not critical.

The news block is appended to the Yahoo context passed to Gemini:

```
RECENT NEWS & EVENTS:
- 2026-04-02: Apple announces new AI chip partnership — Tim Cook reveals...
- 2026-03-28: Q1 earnings beat expectations — Revenue up 12% YoY...
...
```

## Change 3: Strip Yahoo-overwritten fields from prompt schema

These fields are removed from the JSON schema in the prompt. They are still part of `types/report.ts` and still injected by the post-merge logic.

### Root level (3 fields removed)
- `currentPrice` — overwritten by `yahoo.livePriceStr`
- `marketCap` — overwritten by `yahoo.marketCap`
- `priceVsATH` — overwritten by `yahoo.priceVsATH`

### Overview (5 fields removed)
- `analystConsensus` (full object) — overwritten by `yahoo.analystConsensus`
- `institutionalOwnership` — overwritten by `yahoo.institutionalOwnership`
- `insiderActivity` — overwritten by `yahoo.insiderActivity`
- `revenueCagr` — overwritten by `yahoo.revenueCagr`
- `netIncomeCagr` — overwritten by `yahoo.netIncomeCagr`

### Financials (4 fields removed + 3 sub-fields from annualData)
- `revenueVsCogs` (full array) — overwritten by `yahoo.revenueVsCogs`
- `marginTrends` (full array) — overwritten by `yahoo.marginTrends`
- `dividendData` (full object) — overwritten by `yahoo.dividendData`
- `cagrs` (full object) — overwritten by `yahoo.cagrs`
- `annualData[].grossMargin` — overwritten from `yahoo.expandedAnnualColumns`
- `annualData[].operatingMargin` — overwritten from `yahoo.expandedAnnualColumns`
- `annualData[].fcf` — overwritten from `yahoo.expandedAnnualColumns`

### Valuation (1 field removed)
- `analystTargetRange` (full object) — overwritten by `yahoo.analystTargetRange`

### Catalysts (2 fields removed)
- `recommendationTrend` (full array) — overwritten by `yahoo.recommendationTrend`
- `insiderTimeline` (full array) — overwritten by `yahoo.insiderTimeline`

## Change 4: Rewrite the prompt

### New role
```
You are a quantitative equity strategist. You write dense, forward-looking analysis. Every sentence either cites a number or makes a falsifiable prediction. No filler. If a sentence could apply to any company, delete it.
```

### New context framing
```
Here is today's market data and recent news for {TICKER} as of {DYNAMIC_DATE}. Your job is to ANALYZE this data, not repeat it. Data-sourced fields (prices, margins, analyst targets, insider activity) will be injected separately into the report — you do not generate them. Focus on interpretation, thesis, and forward scenarios.
```

### New analytical directives (replacing CRITICAL INSTRUCTIONS)
```
1. Ground every claim in provided data — reference specific margins, growth rates, and multiples.
2. Focus on what changes from here. Historical context only to support a forward thesis.
3. Incorporate the recent news and events below into your catalysts and risk assessment. Use your broader knowledge of market conditions, regulatory environment, and industry trends to fill gaps.
4. Bull/bear cases must include specific price targets derived from stated assumptions (multiple x earnings).
5. All prose fields: 2-3 sentences max. If you need more, the insight isn't sharp enough.
6. whatHasGoneWrong should be null unless there's a genuine material negative — don't manufacture problems.
7. Assign conviction scores (0-100) where requested. 0 = no confidence, 100 = maximum conviction.
8. Use temporal buckets: NEAR (0-6 months), MEDIUM (6-18 months), LONG (18+ months).
```

### New schema

The trimmed schema with inline prose guidance on key analytical fields:

```json
{
  "ticker": "string",
  "companyName": "string",
  "exchange": "string",
  "website": "string (company URL, e.g. 'https://www.apple.com')",
  "verdict": "BUY | SELL | HOLD | AVOID",
  "verdictSubtitle": "string — one-line thesis, max 10 words",
  "convictionScore": "number 0-100",
  "badges": ["string — 4-6 contextual tags like 'DOJ Investigation', 'Buffett Bought', 'Mkt Cap ~$256B'"],
  "overview": {
    "keyMetrics": [
      { "label": "string", "value": "string", "subtitle": "string or omit", "color": "hex or omit", "yoyChange": "string like '+12.3%'" }
    ],
    "businessSummary": "string — 2-3 sentences, what this company does and why it matters NOW",
    "whatHasGoneWrong": "string or null — only if genuine material negative exists",
    "segmentBreakdown": [{ "name": "string", "percentage": "number" }],
    "moatScores": [{ "metric": "string", "score": "number 0-100" }],
    "sectorMoatScores": [{ "metric": "string", "score": "number 0-100 — sector median for same metrics" }]
  },
  "financials": {
    "narrativeSummary": "string — 2-3 sentences on financial trajectory and what the numbers say about the future",
    "annualData": [
      { "year": "string", "revenue": "number (billions)", "revenueGrowth": "string", "adjEPS": "number", "epsGrowth": "string", "opCF": "string", "keyMetric": "string — most relevant KPI for this year" }
    ],
    "callout": "string — single most important financial insight or warning"
  },
  "valuation": {
    "bullCase": "string — 2-3 sentences, quantitative, with price math (multiple x earnings = target)",
    "bearCase": "string — 2-3 sentences, quantitative, with price math",
    "metrics": [{ "metric": "string", "current": "string", "fiveYearAvg": "string", "sectorMedian": "string", "commentary": "string — one sentence, forward-looking" }],
    "historicalPE": [{ "year": "string", "pe": "number" }],
    "sectorMedianPE": "number"
  },
  "catalysts": {
    "catalystTable": [{ "timeline": "string", "catalyst": "string", "impact": "string (arrow like '^ Positive' or 'v Negative')", "probability": "string", "timeframe": "NEAR | MEDIUM | LONG", "conviction": "number 0-100" }],
    "risks": [{ "risk": "string", "severity": "CRITICAL | HIGH | MEDIUM | LOW", "description": "string — one sentence", "likelihood": "HIGH | MEDIUM | LOW", "timeframe": "NEAR | MEDIUM | LONG" }]
  },
  "verdictDetails": {
    "bullCase": { "priceTarget": "string", "return": "string", "description": "string — 2-3 sentences" },
    "baseCase": { "priceTarget": "string", "return": "string", "description": "string — 2-3 sentences" },
    "bearCase": { "priceTarget": "string", "return": "string", "description": "string — 2-3 sentences" },
    "scenarioMatrix": [{ "scenario": "string", "probability": "string", "priceTarget": "string", "return": "string", "weighted": "string", "keyAssumptions": ["string — 2-3 per scenario"] }],
    "multiYearProjections": [{ "horizon": "string", "bearCase": "string", "baseCase": "string", "bullCase": "string", "commentary": "string — one sentence", "impliedCagr": "string" }],
    "priceProjectionChart": [{ "year": "string", "bear": "number", "base": "number", "bull": "number", "analystMean": "number — use analyst mean target from provided data" }],
    "syndicateVerdict": {
      "rating": "BUY | SELL | HOLD | AVOID",
      "positionSizing": "string — specific portfolio % range with rationale",
      "keySignalTitle": "string — dynamic signal title",
      "keySignalDetail": "string — 2-3 sentences explaining the signal",
      "honestRisk": "string — 2-3 sentences on the honest risk",
      "howToPosition": "string — 2-3 sentences on entry strategy",
      "longTermThesis": "string — 2-3 sentences on 5-10 year outlook"
    },
    "convictionScore": "number 0-100",
    "convictionDrivers": "string — 2-3 sentences on what drives or limits conviction"
  }
}
```

### New requirements block
```
- overview.keyMetrics: exactly 8 items: Market Cap, FY Revenue, Revenue 5yr CAGR, Net Income 5yr CAGR, Beta, Forward P/E, Op Cash Flow, Dividend Yield (show "N/A" if no dividend). Include yoyChange where applicable.
- overview.moatScores: exactly 6 items, 0-100 scale
- overview.sectorMoatScores: exactly 6 items matching moatScores metrics
- overview.segmentBreakdown: 3-8 segments summing close to 100
- financials.annualData: 4-5 years
- valuation.historicalPE: 4-5 years
- catalysts.catalystTable: 4-6 catalysts
- catalysts.risks: 4-6 risks ordered by severity
- verdictDetails.scenarioMatrix: 3 rows (Bull/Base/Bear) + 1 Expected Value row
- verdictDetails.multiYearProjections: 3 rows (3-year, 5-year, 10-year) each with impliedCagr
- verdictDetails.priceProjectionChart: 5-6 data points (current year through 5 years out)
- Return ONLY the JSON object, no markdown, no backticks, no wrapping
```

## Change 5: Dynamic date

```diff
- REAL MARKET DATA — TODAY'S DATE IS 2026-04-03.
+ ... as of ${new Date().toISOString().split('T')[0]}.
```

## What stays the same

- `fetchYahooData()` — all existing data extraction logic unchanged
- Post-generation Yahoo merge (lines 467-518) — unchanged
- Defensive patching for omitted fields (lines 553-612) — unchanged
- `types/report.ts` — no interface changes
- All tab components — no changes
- `StockReport.tsx` — no changes

## Expected impact

- **Speed**: ~40% less output tokens for Gemini to generate. Gemini 3 Flash is a faster model baseline. News fetch adds negligible latency (same Yahoo API, one extra call).
- **Quality**: Tighter role prompting pushes toward data-grounded, forward-looking prose. News context enables event-aware analysis. "2-3 sentences max" constraint prevents filler.
- **Reliability**: Smaller schema = fewer fields to omit or malform. Defensive patching still catches edge cases.
