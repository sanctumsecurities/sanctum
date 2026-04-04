# Institutional-Grade Report Upgrade — Design Spec

## Goal

Upgrade the existing 5-tab ticker report to institutional-grade quality (Morningstar/S&P rigor with Sanctum's dark terminal aesthetic). The report should be the definitive tool for determining whether a stock belongs in someone's portfolio — combining expanded Yahoo Finance data, deeper Gemini AI analysis with quantitative backing and peer context, and richer chart-driven visualization.

## Approach

**Data layer first, then presentation.** Expand the Yahoo Finance data pull and Gemini prompt to create a richer payload, then upgrade each tab's rendering against that improved data foundation.

## Scope

- **Keep:** Existing 5-tab structure (Overview, Financials, Valuation, Catalysts, Verdict), dark terminal aesthetic, glass-card design system, component architecture
- **Expand:** Yahoo Finance data modules, Gemini prompt depth, chart count (4 existing → 12 total), data table columns, conditional sections
- **Add:** Conviction scoring, peer context, temporal bucketing, dividend analysis, CAGR metrics, analyst consensus visuals, insider/institutional signals
- **No new:** API routes, server actions, client-side fetches, or packages

---

## Layer 1: Yahoo Finance Data Expansion

### New Modules

The existing `quoteSummary` call in `generateReport.ts` adds these modules:

| Module | Data Provided |
|---|---|
| `incomeStatementHistory` | Revenue, COGS, gross/operating/net income (annual, 4-5 years) |
| `cashflowStatementHistory` | FCF, dividends paid, operating cash flow (annual, 4-5 years) |
| `balanceSheetHistory` | Cash, total debt, equity (annual, 4-5 years) |
| `earningsTrend` | Forward EPS estimates (current/next quarter, current/next year) |
| `financialData` | Analyst price targets (low/mean/median/high), recommendation |
| `majorHoldersBreakdown` | Institutional ownership % |
| `insiderTransactions` | Recent insider buys/sells (last 6-12 months) |
| `recommendationTrend` | Monthly buy/hold/sell analyst counts (last 4 months) |

### Server-Side Derived Calculations

Computed from historical data before passing to Gemini or the frontend:

| Metric | Derivation |
|---|---|
| Revenue 5yr/10yr CAGR | `(end/start)^(1/n) - 1` from `incomeStatementHistory` |
| Net income 5yr/10yr CAGR | Same formula from `incomeStatementHistory` |
| EPS 5yr/10yr CAGR | Same formula from `earningsTrend` + historical |
| Dividend 5yr/10yr CAGR | Same formula from `cashflowStatementHistory` |
| Gross/operating/net margin arrays | Computed per year from `incomeStatementHistory` |
| FCF vs dividends paid arrays | Paired per year from `cashflowStatementHistory` |
| Revenue vs COGS arrays | Paired per year from `incomeStatementHistory` |

10yr CAGR fields are `null` when insufficient historical data exists.

---

## Layer 2: Gemini AI Prompt Enrichment

### Four Upgrades

**2a. Quantitative Backing** — Every AI claim must cite a specific number.
- Before: *"Strong margin profile"*
- After: *"Operating margin of 34.2% ranks in the 89th percentile of the S&P 500 software sector, expanding 280bps YoY"*

**2b. Peer Context** — Gemini receives the ticker's sector/industry and contextualizes every key metric against sector norms.
- Valuation: "P/E of 25.3x vs sector median 18.1x — 40% premium"
- Growth: "Revenue CAGR of 12% vs industry average 7%"
- Margins: relative ranking within sector

**2c. Conviction Scoring** — Numerical confidence on key outputs:
- Overall conviction score (0-100) with explanation of drivers
- Each catalyst gets a conviction % (already has probability; this adds AI confidence)
- Each risk gets severity + likelihood
- Position sizing becomes precise: "2-4% of portfolio" with rationale

**2d. Temporal Bucketing** — Every catalyst, risk, and thesis point tagged:
- **NEAR** (0-6 months)
- **MEDIUM** (6-18 months)
- **LONG** (18+ months)

### Prompt Structure Change

The enriched Yahoo Finance data (analyst targets, margins history, institutional ownership, insider activity, historical financials) gets injected into the Gemini prompt as structured context. The AI interprets real data rather than generating numbers from training data.

### New AI Output Fields

```
convictionScore: number              // 0-100, root level
convictionDrivers: string            // What drives the score up/down

analystConsensus (in overview):
  meanTarget, lowTarget, highTarget, numberOfAnalysts, recommendation

peerComparison (AI-generated):
  metrics: [{ metric, company, sector, percentile }]
  summary: string

All narratives: must cite specific numbers and comparisons
All catalysts: gain timeframe + conviction fields
All risks: gain likelihood + timeframe fields
```

---

## Layer 3: StockReport Interface Changes

All changes are additive — existing fields remain untouched.

### Root Level

```typescript
convictionScore: number                    // 0-100, AI-generated
```

### Overview (new fields)

```typescript
analystConsensus: {
  meanTarget: string                       // "$215"
  lowTarget: string
  highTarget: string
  numberOfAnalysts: number
  recommendation: string                   // "Strong Buy" / "Buy" / "Hold" / etc.
}
institutionalOwnership: string             // "78.4%"
insiderActivity: {
  netBuys90Days: number
  notable: string                          // AI one-liner: "CFO bought $2.1M in March"
} | null
revenueCagr: { fiveYear: string; tenYear: string | null }
netIncomeCagr: { fiveYear: string; tenYear: string | null }
sectorMoatScores: { metric: string; score: number }[]  // Sector avg for radar overlay
```

### Financials (new fields)

```typescript
revenueVsCogs: {
  year: string; revenue: number; cogs: number; grossProfit: number
}[]                                        // 4-5 years

marginTrends: {
  year: string; gross: number; operating: number; net: number
}[]                                        // 4-5 years

dividendData: {                            // null if non-dividend payer
  currentYield: string
  payoutRatio: string
  fiveYearCagr: string
  tenYearCagr: string | null
  consecutiveYearsGrowth: number | null
  fcfVsDividends: {
    year: string; fcf: number; dividendsPaid: number
  }[]
} | null

annualData expanded columns:
  grossMargin: string                      // "58.2%"
  operatingMargin: string                  // "34.1%"
  fcf: string                             // "$18.2B"

cagrs: {
  revenue: { fiveYear: string; tenYear: string | null }
  netIncome: { fiveYear: string; tenYear: string | null }
  eps: { fiveYear: string; tenYear: string | null }
}
```

### Valuation (new fields)

```typescript
metrics expanded column:
  sectorMedian: string                     // New column for peer context

analystTargetRange: {
  low: number; mean: number; median: number; high: number
  currentPrice: number
  numberOfAnalysts: number
}

historicalPE: {
  year: string; pe: number
}[]                                        // 4-5 years

sectorMedianPE: number                    // Horizontal reference line value
```

### Catalysts (new/modified fields)

```typescript
catalystTable expanded:
  timeframe: "NEAR" | "MEDIUM" | "LONG"    // New
  conviction: number                        // 0-100, new

risks expanded:
  likelihood: "HIGH" | "MEDIUM" | "LOW"     // New
  timeframe: "NEAR" | "MEDIUM" | "LONG"     // New

recommendationTrend: {                      // New section
  month: string; buy: number; hold: number; sell: number
}[]                                         // Last 4 months

insiderTimeline: {                          // New section
  date: string; type: "BUY" | "SELL"; shares: number; value: string
}[] | null
```

### Verdict (new fields)

```typescript
convictionScore: number                     // Displayed prominently
convictionDrivers: string                   // AI explanation

scenarioMatrix expanded:
  keyAssumptions: string[]                  // 2-3 bullets per scenario

multiYearProjections expanded:
  impliedCagr: string                       // Implied annual return

priceProjectionChart expanded:
  analystMean: number                       // Overlay line for consensus
```

---

## Layer 4: Tab-by-Tab Content Upgrades

### Overview Tab

**Current:** 6 key metric cards, business summary, segment donut, moat radar.

**Upgrades:**

1. **Key metrics grid** — expand from 6 to 8 cards. Add Revenue 5yr CAGR and Net Income 5yr CAGR. Existing cards gain subtitles with peer context ("vs sector median X").
2. **Analyst consensus bar** — new horizontal range chart. Shows analyst target range (low → mean → high) with current price marked as a vertical line. Answers: "Where does the street think this goes?"
3. **Institutional & insider signals** — new compact section. Institutional ownership % with directional context, plus recent notable insider transactions (1-3 lines max, not a full table). Rendered only if data is available.
4. **Segment donut** — existing, upgraded. Show $ values alongside percentages, add "largest segment" callout annotation.
5. **Moat radar** — existing, upgraded. Add a second faded radar overlay showing sector average scores for comparison.

### Financials Tab

**Current:** Narrative summary, revenue/EPS combo chart, annual data table, callout card.

**Upgrades:**

1. **Revenue vs COGS chart** — new ComposedChart. Bars for revenue, line for COGS, shaded area between representing gross profit. Answers: "Are margins expanding or compressing?"
2. **Revenue & EPS combo chart** — existing, upgraded. Add YoY growth % labels above each bar.
3. **Margin trend chart** — new line chart. Gross, operating, and net margin lines over 4-5 years. Answers: "What's the margin trajectory?"
4. **FCF vs Dividends Paid chart** — new grouped bar chart, conditional (dividend payers only). FCF bar next to dividends paid bar per year. Gap = safety cushion. If FCF < dividends in any year, that bar gets a red accent. Answers: "Can they afford the dividend?"
5. **Dividend section** — new conditional section (non-dividend stocks: hidden). Compact metric row: current yield, payout ratio, 5yr CAGR, 10yr CAGR, consecutive years of growth. Not a full card — a dense metric row.
6. **Annual data table** — expand columns: add gross margin %, operating margin %, FCF. Bold most recent year.
7. **CAGR callout row** — new row beneath the table. Shows 5yr and 10yr CAGRs for revenue, net income, and EPS in a compact inline format.
8. **Narrative summary** — Gemini prompt now requires specific number citations and trend analysis.

### Valuation Tab

**Current:** Bull/bear case paragraphs, valuation metrics table.

**Upgrades:**

1. **Valuation metrics table** — expand with sector median column. Each row: metric, current, 5yr avg, sector median, AI commentary. The single most important upgrade for portfolio decisions — relative valuation at a glance.
2. **Analyst price target visual** — new horizontal range chart. Low/mean/median/high targets with current price marked. Number of analysts shown.
3. **Bull/bear cases** — upgrade from paragraphs to structured format: each case gets 3-4 bullet points with specific catalyst + quantified impact ("If X happens → Y impact").
4. **Historical P/E chart** — new line chart. P/E ratio over 4-5 years with horizontal line at sector median. Answers: "Is it cheap vs its own history?"

### Catalysts Tab

**Current:** Catalyst calendar table, risk cards with severity borders.

**Upgrades:**

1. **Catalyst table** — add temporal bucketing column (Near/Medium/Long-term) and conviction score. Sort by timeline.
2. **Risk cards** — add likelihood alongside severity. Add temporal tag. Color-code borders by combined severity × likelihood.
3. **Recommendation trend chart** — new stacked bar chart. Monthly analyst buy/hold/sell counts over last 4 months. Answers: "Is analyst sentiment shifting?"
4. **Insider activity timeline** — new dot/bar chart. Insider buys/sells over last 6-12 months. Answers: "Are insiders buying their own stock?" Conditionally rendered.

### Verdict Tab

**Current:** 3 scenario cards, matrix, projections, price projection chart, syndicate verdict.

**Upgrades:**

1. **Conviction score display** — new prominent element at top. Large number (0-100) with color gradient (red → yellow → green) and one-line explanation of drivers.
2. **Scenario cards** — keep 3-card layout, add probability-weighted expected return and mini bullet list of key assumptions per card.
3. **Risk-to-reward matrix** — keep, add visually distinct "Expected Value" row (bold + accent border).
4. **Price projection chart** — existing, upgraded. Add analyst target range as a horizontal band overlay. Shows how scenarios compare to consensus.
5. **Multi-year projections table** — keep, add implied CAGR column per scenario × horizon.
6. **Syndicate verdict card** — upgrade position sizing to specific portfolio % range with rationale. Add conviction score badge.

---

## Chart Design Standards

### Principles

- Every chart answers one specific question (stated as title or subtitle)
- Every chart gets a one-line insight caption below it
- Consistent color language across all tabs
- No chart without purpose — if it doesn't aid a portfolio decision, it doesn't exist

### Color Language

| Color | Hex | Meaning |
|---|---|---|
| Blue | `#60a5fa` | Primary/neutral (revenue, base case, current values) |
| Green | `#4ade80` | Positive/bullish (earnings growth, bull case, FCF surplus) |
| Red | `#f87171` | Negative/bearish (bear case, margin compression, FCF deficit) |
| Amber | `#f59e0b` | Warning/attention (costs, dividends, sector median lines) |
| Purple | `#a78bfa` | Secondary comparisons (sector overlays, peer data) |

### Typography

- JetBrains Mono for all chart numerics
- DM Sans for chart labels and titles
- Axis labels always include units ($, %, B, x)

### Shared Patterns

- All charts in `<ResponsiveContainer width="100%" height={N}>`
- CartesianGrid: `strokeDasharray="3 3"`, `stroke="rgba(255,255,255,0.05)"`
- Custom CTooltip: `background rgba(8,8,14,0.95)`, `border 1px rgba(255,255,255,0.10)`, `borderRadius 12px`, `fontSize 12px`, subtle box-shadow
- Charts embedded in glassCard containers

### Full Chart Inventory (12 total)

| # | Tab | Chart | Type | Question It Answers |
|---|---|---|---|---|
| 1 | Overview | Analyst consensus range | Horizontal range | Where does the street think this goes? |
| 2 | Overview | Segment breakdown | Donut (existing, upgraded) | Where does revenue come from? |
| 3 | Overview | Competitive moat | Radar (existing, upgraded) | How defensible vs sector? |
| 4 | Financials | Revenue & EPS | ComposedChart (existing, upgraded) | Growing profitably? |
| 5 | Financials | Revenue vs COGS | ComposedChart (new) | Margins expanding or compressing? |
| 6 | Financials | Margin trends | Line chart (new) | What's the margin trajectory? |
| 7 | Financials | FCF vs Dividends | Grouped bar (new, conditional) | Can they afford the dividend? |
| 8 | Valuation | Analyst price targets | Range chart (new) | Cheap vs consensus? |
| 9 | Valuation | Historical P/E | Line chart (new) | Cheap vs own history? |
| 10 | Catalysts | Recommendation trend | Stacked bar (new) | Analyst sentiment shifting? |
| 11 | Catalysts | Insider activity | Bar/dot plot (new, conditional) | Insiders buying or selling? |
| 12 | Verdict | Price projection | ComposedChart (existing, upgraded) | Risk/reward scenarios? |

### Interactivity

All charts get hover tooltips (existing CTooltip pattern). Analyst consensus range and price projection charts highlight current price position on hover. No zoom/pan — clean and fast.

---

## Conditional Rendering Rules

All existing null/missing field handling remains. Additional rules:

| Condition | Behavior |
|---|---|
| Non-dividend stock (`dividendData === null`) | Hide FCF vs Dividends chart, dividend section, dividend-related metrics |
| No insider data (`insiderActivity === null`, `insiderTimeline === null`) | Hide insider signals section, insider activity chart |
| Insufficient history for 10yr CAGR | Show 5yr only, 10yr field is `null` |
| Empty `recommendationTrend` | Hide recommendation trend chart |
| Empty `historicalPE` | Hide historical P/E chart |

Never crash on missing data — gracefully hide sections.

---

## Data Flow

```
Yahoo Finance (expanded modules)
        ↓
generateReport.ts (server action)
  ├── Fetches quoteSummary with 9 new modules
  ├── Computes derived metrics (CAGRs, margins, FCF arrays)
  ├── Injects enriched data into Gemini prompt
  ├── Gemini returns richer StockReport JSON
  ├── Merges computed data + AI output into StockReport
  └── Returns typed StockReport
        ↓
StockReport.tsx (client shell)
  ├── Calls server action on mount
  ├── Manages loading/error/tab state
  └── Passes data slices to tab components
        ↓
Tab Components (pure rendering)
  ├── OverviewTab receives overview + analystConsensus + insiderActivity + CAGRs
  ├── FinancialsTab receives financials + marginTrends + revenueVsCogs + dividendData + cagrs
  ├── ValuationTab receives valuation + analystTargetRange + historicalPE
  ├── CatalystsTab receives catalysts + recommendationTrend + insiderTimeline
  └── VerdictTab receives verdictDetails + convictionScore + convictionDrivers
```

No new API routes. No new server actions. No new client-side fetches. The entire upgrade flows through the existing pipeline with a richer payload.

---

## Files Modified

```
types/report.ts                          — Expanded StockReport interface
app/actions/generateReport.ts            — Expanded Yahoo fetch + enriched Gemini prompt + derived calculations
components/reports/ReportUI.tsx           — Possible new shared primitives (RangeBar, ConvictionBadge)
components/reports/tabs/OverviewTab.tsx   — Analyst consensus, institutional signals, upgraded charts
components/reports/tabs/FinancialsTab.tsx — 3 new charts, dividend section, expanded table, CAGR row
components/reports/tabs/ValuationTab.tsx  — Expanded table, 2 new charts, structured bull/bear
components/reports/tabs/CatalystsTab.tsx  — Temporal columns, 2 new charts, upgraded risk cards
components/reports/tabs/VerdictTab.tsx    — Conviction score, upgraded scenario cards/matrix/projections/chart
components/reports/StockReport.tsx        — Pass new data slices to tabs (minimal changes)
```

No new files created. No new packages. All changes within existing file structure.

---

## Hard Constraints

- Existing 5-tab structure unchanged
- All styles use existing design tokens — no new hex values, fonts, or design tokens
- `"use server"` only in `app/actions/generateReport.ts`
- `"use client"` only in components that use hooks/state
- All Recharts charts in `<ResponsiveContainer>`
- Fully typed TypeScript using expanded `types/report.ts`
- Single Yahoo Finance API call (expanded modules, not multiple requests)
- Single Gemini API call (enriched prompt, not multiple calls)
- Conditional rendering: dividend sections hidden for non-payers, insider sections hidden when no data
- 10yr CAGRs nullable when history insufficient
