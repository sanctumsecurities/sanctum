# Ticker Report Page Rebuild — Design Spec

## Goal

Replace the existing ticker report page (`/reports/[ticker]`) with a full AI-generated equity research report. On load, call Gemini 2.0 Flash via a server action, show a terminal-style loading screen, then render a 5-tab report (Overview, Financials, Valuation, Catalysts, Verdict) matching the existing SANCTUM dark terminal aesthetic.

## Architecture

Server action (`app/actions/generateReport.ts`) calls Gemini 2.0 Flash with the ticker, returns a typed `StockReport` object. The client shell (`components/reports/StockReport.tsx`) calls this on mount, manages loading/error/tab state, and renders the header + active tab. Each tab is an isolated component receiving its data slice as props. Shared UI primitives live in `components/reports/ReportUI.tsx`.

The report page (`app/reports/[ticker]/page.tsx`) is a thin wrapper: Back button, + Watchlist button, and `<StockReport ticker={ticker} />`.

## Tech Stack

- Next.js 14 App Router (server actions)
- `@google/generative-ai` (already installed) — Gemini 2.0 Flash
- `recharts` (already installed) — PieChart, RadarChart, ComposedChart
- `@supabase/supabase-js` (already installed) — session + watchlist
- TypeScript throughout, typed with `StockReport` interface
- No new packages required

## Design Tokens (existing — no new values)

| Token | Value | Usage |
|---|---|---|
| Background | `#0a0a0a` | Page bg |
| Card bg | `#0f0f0f` | Card surfaces |
| Border | `#1a1a1a` | Default borders |
| Border hover | `#2a2a2a` | Hover borders |
| Text primary | `#e8ecf1` | Headings, values |
| Text muted | `#555` / `#5a6475` | Labels, captions |
| Green | `#4ade80` / `#22c55e` | Bullish, positive |
| Red | `#f87171` | Bearish, negative |
| Blue | `#60a5fa` | Neutral, base case |
| Yellow | `#eab308` | Warning, gold accents |
| Font mono | `'JetBrains Mono', monospace` | Numbers, terminal text |
| Font sans | `'DM Sans', sans-serif` | Body text, labels |
| Font serif | `'Instrument Serif', serif` | Headings, large values |
| Glass card | `linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.025) 100%)` with `border: 1px solid rgba(255,255,255,0.10)` | Card surfaces |

---

## File Structure

```
types/report.ts                          — StockReport interface + type guards
app/actions/generateReport.ts            — "use server", Gemini 2.0 Flash call
components/reports/ReportUI.tsx           — MetricCard, Badge, SectionTitle, DataTable, CTooltip
components/reports/tabs/OverviewTab.tsx   — Key metrics bar, business overview, pie chart, radar chart
components/reports/tabs/FinancialsTab.tsx — Revenue/EPS combo chart, annual data table, callout card
components/reports/tabs/ValuationTab.tsx  — Bull/bear case paragraphs, valuation metrics table
components/reports/tabs/CatalystsTab.tsx  — Catalyst calendar table, risk cards
components/reports/tabs/VerdictTab.tsx    — Scenario cards, matrix, projections, price chart, syndicate verdict
components/reports/StockReport.tsx        — Header + tab bar + loading/error states + tab content
app/reports/[ticker]/page.tsx            — Back button + Watchlist button + <StockReport>
```

---

## TypeScript Interface (`types/report.ts`)

```typescript
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
```

Key resolution: the original spec had duplicate `"verdict"` keys. Top-level `verdict` is the rating string (`BUY`/`SELL`/`HOLD`/`AVOID`). The detailed verdict tab data lives in `verdictDetails`.

Added fields not in original spec schema:
- `overview.keyMetrics` — array of metric cards for the Overview tab key metrics bar
- `financials.callout` — string for the red-bordered financial insight card

---

## Server Action (`app/actions/generateReport.ts`)

- `"use server"` directive at top
- Uses `@google/generative-ai` with `process.env.GEMINI_API_KEY`
- Model: `gemini-2.0-flash` (consistent with existing `/api/analyze`)
- Accepts `ticker: string`, returns `Promise<StockReport | { error: string }>`
- System prompt instructs Gemini to return raw JSON matching the `StockReport` schema (using `verdictDetails` instead of duplicate `verdict`)
- Strips markdown fences (`\`\`\`json`, `\`\`\``) before parsing
- Gemini prompt explicitly requests `overview.keyMetrics` (6 cards: Market Cap, FY Revenue, Next Year Revenue Est., Adj EPS, Op Cash Flow, Dividend/Yield) and `financials.callout` (single most important financial warning/insight)
- Wraps in try/catch — returns `{ error: message }` on failure

---

## Shared UI Primitives (`components/reports/ReportUI.tsx`)

All components use existing design tokens only.

### MetricCard
- Props: `label: string`, `value: string`, `subtitle?: string`, `color?: string`
- Glass card background, small uppercase muted label (DM Sans 10px, `#5a6475`), large monospace value (JetBrains Mono), optional subtitle with auto-coloring (green for positive, red for negative)

### Badge
- Props: `text: string`, `variant?: 'green' | 'red' | 'blue' | 'yellow' | 'gray'`
- Pill shape, semi-transparent bg, colored border + text
- Matches existing Badge in ReportView.tsx: `padding: '3px 10px'`, `borderRadius: 9999`, `fontSize: 10`, `fontWeight: 600`

### SectionTitle
- Props: `children: React.ReactNode`
- Instrument Serif 17px bold, bottom border `rgba(255,255,255,0.07)`, margin-bottom 14px
- Matches existing Section component pattern

### DataTable
- Props: `headers: string[]`, `rows: (string | number)[][]`, `numericCols?: number[]`
- Striped rows (alternate `rgba(255,255,255,0.03)`), right-aligned numeric columns, monospace numbers, red for negative values (detected by leading `-` or `(`), DM Sans for text columns

### CTooltip
- Custom Recharts tooltip component
- Background: `rgba(8,8,14,0.95)`, border: `rgba(255,255,255,0.10)`, border-radius 12px, font-size 12px
- Matches existing `chartTooltipStyle` in ReportView.tsx

---

## Page Header (in StockReport.tsx, always visible above tabs)

- **Company logo**: Attempts to fetch from Clearbit (`logo.clearbit.com/{domain}`) using `report.website`. Extracts domain from URL, renders in a small rounded box (white bg, 54x54, rounded 15px). On image load error or missing website, falls back to 2-3 letter ticker initials in a styled box (`#0f0f0f` bg, `#1a1a1a` border, JetBrains Mono bold). Same pattern as existing `CompanyLogo` in `ReportView.tsx`.
- **Company name + exchange**: e.g. "UnitedHealth Group · NYSE" (Instrument Serif for name, DM Sans muted for exchange)
- **Current price**: Large monospace (JetBrains Mono 36px bold) + price vs ATH in muted text (e.g. "-55% from ATH $627")
- **Verdict badge**: Large Badge with rating-based color (BUY=green, SELL=red, HOLD=blue, AVOID=red) + one-line `verdictSubtitle` text
- **Context badges**: Flex-wrap row of gray Badge pills from `report.badges[]`

---

## Tab Bar (in StockReport.tsx)

5 tabs: Overview, Financials, Valuation, Catalysts, Verdict

- Styled like existing ReportView tab bar: horizontal flex, JetBrains Mono 11px uppercase, `#555` inactive, `#fff` active with bottom indicator
- Tab switch uses same fade animation pattern: 200ms fade-out, swap content, fade-in

---

## Tab: Overview

- **Key Metrics Bar**: Flex-wrap row of MetricCard components, data from `overview.keyMetrics[]`
- **Business Overview**: SectionTitle + rendered paragraphs from `overview.businessSummary` (split on `\n\n`). If `overview.whatHasGoneWrong` is non-null, render a red-bordered callout card with the content.
- **Revenue by Segment**: Recharts `PieChart` with `Pie` (donut, `innerRadius={60}`) + legend list beside it. Data from `overview.segmentBreakdown[]`. Colors from a preset palette of existing tokens.
- **Moat Radar**: Recharts `RadarChart` with `PolarGrid`, `PolarAngleAxis`, `Radar` fill. Data from `overview.moatScores[]`, scale 0-100. Caption below explaining scores.

---

## Tab: Financials

- **Revenue & EPS Combo Chart**: Recharts `ComposedChart` — `Bar` for revenue (left Y-axis, blue fill), `Line` with dots for Adj EPS (right Y-axis, green). X-axis: fiscal years. Custom `CTooltip`. Data from `financials.annualData[]`.
- **Annual Data Table**: `DataTable` with columns: Year / Revenue / Growth / Adj EPS / EPS Growth / Op CF / Key Metric. Data from `financials.annualData[]`.
- **Callout Card**: Red-bordered glass card with `financials.callout` text. Only rendered if callout is non-empty.

---

## Tab: Valuation

- **Bull Case**: Green-left-bordered paragraph card with `valuation.bullCase` text
- **Bear Case**: Red-left-bordered paragraph card with `valuation.bearCase` text
- **Valuation Metrics Table**: `DataTable` with columns: Metric / Current / 5-Year Avg / Commentary. Data from `valuation.metrics[]`.

---

## Tab: Catalysts

- **Catalyst Calendar Table**: `DataTable` with columns: Timeline / Catalyst / Impact / Probability. Impact cells colored: content containing up arrow or positive language = green, down arrow or negative = red. Data from `catalysts.catalystTable[]`.
- **Risk Cards**: One card per risk from `catalysts.risks[]`. Header: bold risk name + severity Badge. Body: description paragraph. Border color by severity: CRITICAL=red, HIGH=yellow, MEDIUM=blue, LOW=green.

---

## Tab: Verdict

- **Three Scenario Cards**: Flex row (wraps on mobile). Bull (green border), Base (blue border), Bear (red border). Each shows price target, expected return, description. Data from `verdictDetails.bullCase/baseCase/bearCase`.
- **Risk-to-Reward Matrix Table**: `DataTable` — Scenario / Probability / Price Target / Return / Weighted. Data from `verdictDetails.scenarioMatrix[]`. Last row (Expected Value) bolded.
- **Multi-Year Projections Table**: `DataTable` — Horizon / Bear Case / Base Case / Bull Case / Commentary. Data from `verdictDetails.multiYearProjections[]`.
- **Price Projection Chart**: Recharts `ComposedChart`. Bull: `Area` green fill + stroke. Base: `Line` blue strokeWidth 2.5. Bear: `Area` red fill + dashed stroke. Y-axis formatted `$X` or `$XK`. Data from `verdictDetails.priceProjectionChart[]`.
- **SANCTUM Syndicate Verdict Card**: Gold/yellow outer border (`#eab308`), generous padding (32px), rounded (12px). Top row: large rating Badge + verdict subtitle + position sizing muted text. Horizontal divider. Four rich text blocks with bold labels: dynamic signal title (`keySignalTitle` / `keySignalDetail`), "The Honest Risk" (`honestRisk`), "How to Position" (`howToPosition`), "The Long-Term Thesis" (`longTermThesis`). Bottom: muted italic disclaimer line.

---

## Loading State

Full-page terminal loading screen (replaces all content except Back button):

```
> INITIALIZING SANCTUM AI ENGINE...
> FETCHING INSTITUTIONAL DATA FOR {TICKER}...
> RUNNING VALUATION MODELS...
> GENERATING SYNDICATE REPORT... |
```

- Lines appear with staggered CSS `animation-delay` (150ms apart)
- `@keyframes fadeIn` from `opacity: 0; translateY(4px)` to `opacity: 1; translateY(0)`
- Last line has blinking cursor via `@keyframes blink` (opacity toggle 0/1 at 500ms)
- Font: JetBrains Mono 13px, color: `#555`, background: `#0a0a0a`

---

## Error State

- Centered error message (JetBrains Mono, `#f87171`)
- `> RETRY` button styled like existing back button (`#2a2a2a` border, `#888` text, hover to `#444`/`#fff`)
- Retry re-invokes the server action

---

## Watchlist Button

The report page reads the user's Supabase session and settings on mount to get/set the watchlist array. Self-contained — no dependency on dashboard state.

- Styled identically to the existing watchlist button in the dashboard modal view (lines 1317-1331 of `app/page.tsx`)
- Toggle behavior: click adds/removes ticker from watchlist, persists to Supabase user settings
- Visual: green tint when active ("ON WATCHLIST"), muted when inactive ("+ WATCHLIST")

---

## Null/Missing Field Handling

All tab components check for null/undefined/empty before rendering sections:
- Missing `whatHasGoneWrong` → hide the callout card
- Empty `segmentBreakdown` → hide pie chart section
- Empty `moatScores` → hide radar section
- Empty `annualData` → hide chart + table
- Missing `callout` → hide callout card
- Empty arrays → hide their containing sections
- Never crash on missing data — gracefully hide sections

---

## Hard Constraints

- Only files created/modified: those listed in File Structure above + `app/reports/[ticker]/page.tsx`
- All styles use existing design tokens — no new hex values, font families, or design tokens
- `"use server"` only in `app/actions/generateReport.ts`
- `"use client"` only in components that use hooks/state
- All Recharts charts wrapped in `<ResponsiveContainer width="100%" height={N}>`
- No `<form>` tags — onClick handlers only
- Fully typed TypeScript using `types/report.ts` throughout
