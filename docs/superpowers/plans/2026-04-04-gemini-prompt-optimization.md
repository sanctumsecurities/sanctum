# Gemini Prompt Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch to Gemini 3 Flash, strip Yahoo-overwritten fields from the prompt schema (~40% reduction), rewrite the prompt for denser/forward-looking analysis, and add news context.

**Architecture:** Single-file change to `app/actions/generateReport.ts`. The `fetchYahooData()` function gains a news fetch call. The prompt sent to Gemini is fully rewritten with a trimmed schema, new role, and analytical directives. All post-generation merge logic and defensive patching remain unchanged.

**Tech Stack:** Next.js 14, `@google/generative-ai` SDK, `yahoo-finance2` v3, TypeScript

---

### Task 1: Add news fetching to fetchYahooData()

**Files:**
- Modify: `app/actions/generateReport.ts:33-307` (inside `fetchYahooData()`)

- [ ] **Step 1: Add news fetch after the quoteSummary call**

In `app/actions/generateReport.ts`, inside `fetchYahooData()`, add a news fetch block right after the existing `quoteSummary` call (after line 49, before line 51 where `const price = result.price` starts). The news fetch is wrapped in its own try/catch so a failure doesn't break report generation:

```ts
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
```

- [ ] **Step 2: Add `recentNews` to the return object**

In the return statement of `fetchYahooData()` (currently starting at line 265), add `recentNews` to the returned object. Add it after the `beta` field (line 301):

```ts
      beta,
      recentNews,
    }
```

- [ ] **Step 3: Add empty `recentNews` to the error return path**

The function's catch block (line 303) returns `null` on failure, so no change needed there — the null check in `generateReport()` already handles this.

- [ ] **Step 4: Commit**

```bash
git add app/actions/generateReport.ts
git commit -m "feat: add news headline fetching to Yahoo data pipeline"
```

---

### Task 2: Switch to Gemini 3 Flash

**Files:**
- Modify: `app/actions/generateReport.ts:317`

- [ ] **Step 1: Change the model identifier**

Replace line 317:

```ts
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
```

with:

```ts
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash' })
```

- [ ] **Step 2: Commit**

```bash
git add app/actions/generateReport.ts
git commit -m "feat: switch from gemini-2.5-flash to gemini-3-flash"
```

---

### Task 3: Rewrite the Yahoo context block and add news

**Files:**
- Modify: `app/actions/generateReport.ts:319-339`

- [ ] **Step 1: Replace the yahooContext template string**

Replace the entire `yahooContext` block (lines 319-339) with the new version. The data points stay the same (Gemini needs them for analysis), but the framing changes from "use these as output" to "analyze this data". News headlines are appended. The hardcoded date becomes dynamic:

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add app/actions/generateReport.ts
git commit -m "feat: rewrite Yahoo context block with news headlines and dynamic date"
```

---

### Task 4: Rewrite the prompt

**Files:**
- Modify: `app/actions/generateReport.ts:341-460`

- [ ] **Step 1: Replace the entire prompt template string**

Replace everything from the `const prompt = ...` line (341) through the closing backtick (line 460) with the new prompt. This includes the new role, context framing, analytical directives, trimmed schema (Yahoo-overwritten fields removed), and simplified requirements:

```ts
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
- overview.keyMetrics: exactly 8 items: Market Cap, FY Revenue, Revenue 5yr CAGR, Net Income 5yr CAGR, Beta, Forward P/E, Op Cash Flow, Dividend Yield (show "N/A" if no dividend). Include yoyChange where applicable. For CAGR metrics, use the CAGR itself as yoyChange. For Beta use the provided real value — no yoyChange needed.
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

- [ ] **Step 2: Commit**

```bash
git add app/actions/generateReport.ts
git commit -m "feat: rewrite Gemini prompt — trimmed schema, new role, analytical directives"
```

---

### Task 5: Build verification

**Files:**
- Verify: `app/actions/generateReport.ts`

- [ ] **Step 1: Run the build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors. The only file changed is `app/actions/generateReport.ts`. Since `types/report.ts` is unchanged and all post-merge logic is unchanged, there should be no type mismatches.

- [ ] **Step 2: Verify no regressions in post-merge logic**

Visually confirm that the Yahoo merge block (starting after `const parsed = JSON.parse(cleaned)`) still references the same fields. Since we didn't touch lines 462-618, this should be intact. The key things to verify:

1. `parsed.currentPrice`, `parsed.marketCap`, `parsed.priceVsATH` are still overwritten by Yahoo (lines 472-474)
2. All overview fields still merged (lines 487-491)
3. All financials fields still merged (lines 494-509)
4. `analystTargetRange` still merged (line 514)
5. `recommendationTrend` and `insiderTimeline` still merged (lines 517-518)
6. Defensive patching still applies defaults for all fields Gemini might omit (lines 553-612)

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add app/actions/generateReport.ts
git commit -m "fix: address build issues from prompt optimization"
```

Only run this step if Step 1 revealed errors that needed fixing.
