# Chart Timeframe Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent 1D/1W/1M/3M/YTD/1Y timeframe selector to each report card sparkline.

**Architecture:** The `/api/charts` route gains a `period` param that computes the correct window and interval for each timeframe. Each `ReportCard` holds its own `selectedPeriod` state and a `periodCache` for on-demand fetches, so cards are fully independent. The parent still batch-fetches 1D on mount; switching to any other period triggers a single-ticker fetch only if not already cached.

**Tech Stack:** Next.js 14 App Router, yahoo-finance2, React `useState`/`useCallback`/`memo`, TypeScript

---

## Task 1: Add `period` param to `/api/charts`

**Files:**
- Modify: `app/api/charts/route.ts`

- [ ] **Step 1: Add `getEtOffset` and `getChartParams` helpers above the `fetchChart` function**

Replace the top of `app/api/charts/route.ts` (keep the imports, add helpers before `fetchChart`):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'

export const dynamic = 'force-dynamic'

/** Returns the number of milliseconds to add to a "fake UTC" ET time to get real UTC. */
function getEtOffset(): number {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find(p => p.type === type)!.value
  const fakeUtcMs = Date.parse(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`
  )
  return now.getTime() - fakeUtcMs
}

/**
 * Maps a period string to yahoo-finance2 chart params.
 * 1D: 4 AM ET today → 8 PM ET today (capped at now).
 * All others: rolling window from now.
 */
function getChartParams(period: string): { period1: Date; period2: Date; interval: string } {
  const now = Date.now()
  const offsetMs = getEtOffset()

  switch (period) {
    case '1W':
      return { period1: new Date(now - 7 * 24 * 60 * 60 * 1000), period2: new Date(now), interval: '1h' }
    case '1M':
      return { period1: new Date(now - 30 * 24 * 60 * 60 * 1000), period2: new Date(now), interval: '1d' }
    case '3M':
      return { period1: new Date(now - 90 * 24 * 60 * 60 * 1000), period2: new Date(now), interval: '1d' }
    case '1Y':
      return { period1: new Date(now - 365 * 24 * 60 * 60 * 1000), period2: new Date(now), interval: '1d' }
    case 'YTD': {
      const etYear = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric',
      }).format(new Date(now))
      const jan1Ms = Date.parse(`${etYear}-01-01T00:00:00Z`) + offsetMs
      return { period1: new Date(jan1Ms), period2: new Date(now), interval: '1d' }
    }
    default: { // '1D'
      const etNowMs = now - offsetMs
      const etDate = new Date(etNowMs)
      const etMidnightFakeUtc = Date.UTC(
        etDate.getUTCFullYear(), etDate.getUTCMonth(), etDate.getUTCDate()
      )
      const etMidnightMs = etMidnightFakeUtc + offsetMs
      return {
        period1: new Date(etMidnightMs + 4 * 60 * 60 * 1000),
        period2: new Date(Math.min(etMidnightMs + 20 * 60 * 60 * 1000, now)),
        interval: '5m',
      }
    }
  }
}
```

- [ ] **Step 2: Update `fetchChart` to accept and use `period`**

Replace the existing `fetchChart` function:

```typescript
async function fetchChart(symbol: string, period: string) {
  try {
    const { period1, period2, interval } = getChartParams(period)
    const [chartResult, quoteResult] = await Promise.all([
      yahooFinance.chart(symbol, { period1, period2, interval: interval as any }),
      yahooFinance.quote(symbol),
    ])

    const points = (chartResult.quotes || [])
      .filter((q: any) => q.close != null && q.date != null)
      .map((q: any) => ({
        time: new Date(q.date).toISOString(),
        price: q.close as number,
      }))

    let afterHours: { price: number; change: number; changePct: number; label: string } | null = null
    if (period === '1D') {
      const marketState = (quoteResult as any).marketState as string | undefined
      if (marketState && (marketState.includes('POST') || marketState === 'CLOSED')) {
        const postPrice = (quoteResult as any).postMarketPrice as number | undefined
        const postChange = (quoteResult as any).postMarketChange as number | undefined
        const postChangePct = (quoteResult as any).postMarketChangePercent as number | undefined
        if (postPrice != null && postChange != null && postChangePct != null) {
          afterHours = { price: postPrice, change: postChange, changePct: postChangePct, label: 'After Hours' }
        }
      } else if (marketState && marketState.includes('PRE')) {
        const prePrice = (quoteResult as any).preMarketPrice as number | undefined
        const preChange = (quoteResult as any).preMarketChange as number | undefined
        const preChangePct = (quoteResult as any).preMarketChangePercent as number | undefined
        if (prePrice != null && preChange != null && preChangePct != null) {
          afterHours = { price: prePrice, change: preChange, changePct: preChangePct, label: 'Pre-Market' }
        }
      }
    }

    return { ticker: symbol, points, afterHours }
  } catch {
    return { ticker: symbol, points: [], afterHours: null }
  }
}
```

- [ ] **Step 3: Update the GET handler to read `period` and pass it through**

Replace the existing `GET` function:

```typescript
export async function GET(req: NextRequest) {
  try {
    const tickersParam = req.nextUrl.searchParams.get('tickers')
    if (!tickersParam) {
      return NextResponse.json({ error: 'tickers param required' }, { status: 400 })
    }

    const period = req.nextUrl.searchParams.get('period') || '1D'
    const tickers = tickersParam.split(',').filter(Boolean).slice(0, 30).map(t => t.trim().toUpperCase())
    const results = await Promise.all(tickers.map(t => fetchChart(t, period)))

    const chartMap: Record<string, { points: { time: string; price: number }[]; afterHours: any }> = {}
    for (const r of results) {
      if (r.points.length > 0) {
        chartMap[r.ticker] = { points: r.points, afterHours: r.afterHours }
      }
    }

    return NextResponse.json(chartMap)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch charts' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify the API responds correctly**

Start the dev server (`npm run dev`) and test:
```
curl "http://localhost:3000/api/charts?tickers=AAPL&period=1D"
curl "http://localhost:3000/api/charts?tickers=AAPL&period=1W"
curl "http://localhost:3000/api/charts?tickers=AAPL&period=YTD"
```
Each should return `{ "AAPL": { "points": [...], "afterHours": ... } }`. 1W and YTD should have more data points than 1D. `afterHours` should be `null` for non-1D.

- [ ] **Step 5: Commit**

```bash
git add app/api/charts/route.ts
git commit -m "feat: add period param to /api/charts (1D/1W/1M/3M/YTD/1Y)"
```

---

## Task 2: Add per-card period selector to `ReportCard`

**Files:**
- Modify: `app/page.tsx` (lines 358–785, the `ReportCard` component)

- [ ] **Step 1: Add the `PERIODS` constant and `Period` type above the `ReportCard` component**

Add immediately before line `const etFormatter = new Intl.DateTimeFormat(...)`:

```typescript
const PERIODS = ['1D', '1W', '1M', '3M', 'YTD', '1Y'] as const
type Period = typeof PERIODS[number]
```

- [ ] **Step 2: Rename the `chartData` prop alias and add period state inside `ReportCard`**

Change the destructuring in the `ReportCard` function signature from:
```typescript
{ report, chartData: tickerChart, focusedCardId, colIndex, onOpen, onDelete, onFocus }
```
to:
```typescript
{ report, chartData: initialChartData, focusedCardId, colIndex, onOpen, onDelete, onFocus }
```

Then, directly after the opening brace of the function body (after the existing `const d = ...` lines), add:

```typescript
const [selectedPeriod, setSelectedPeriod] = useState<Period>('1D')
const [periodCache, setPeriodCache] = useState<
  Record<string, { points: { time: string; price: number }[]; afterHours: { price: number; change: number; changePct: number; label: string } | null } | null>
>({})
const [isFetchingPeriod, setIsFetchingPeriod] = useState(false)

// Active chart data: 1D uses prop from parent; other periods use local cache
const tickerChart = selectedPeriod === '1D'
  ? initialChartData
  : (periodCache[selectedPeriod] ?? undefined)
```

- [ ] **Step 3: Update the `ah` line to suppress after-hours for non-1D periods**

The existing line:
```typescript
const ah = tickerChart?.afterHours || null
```
Replace with:
```typescript
const ah = selectedPeriod === '1D' ? (tickerChart?.afterHours || null) : null
```

- [ ] **Step 4: Add the `handlePeriodSelect` callback inside `ReportCard`**

Add after the `ah` line:

```typescript
const handlePeriodSelect = useCallback(async (period: Period) => {
  setSelectedPeriod(period)
  if (period === '1D' || periodCache[period] !== undefined) return
  setIsFetchingPeriod(true)
  try {
    const res = await fetch(`/api/charts?tickers=${encodeURIComponent(report.ticker)}&period=${period}`)
    const data = await res.json()
    setPeriodCache(prev => ({ ...prev, [period]: data[report.ticker] ?? null }))
  } catch {
    setPeriodCache(prev => ({ ...prev, [period]: null }))
  } finally {
    setIsFetchingPeriod(false)
  }
}, [periodCache, report.ticker])
```

- [ ] **Step 5: Add the pill row UI above the chart `<div>`**

Find the comment `{/* 1-Day Sparkline Chart */}` and add the pill row immediately before the chart container `<div>`:

```tsx
{/* Timeframe selector */}
<div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
  {PERIODS.map(p => (
    <button
      key={p}
      onClick={e => { e.stopPropagation(); handlePeriodSelect(p) }}
      style={{
        fontSize: 9,
        padding: '2px 5px',
        background: selectedPeriod === p ? 'rgba(255,255,255,0.07)' : 'transparent',
        color: selectedPeriod === p ? '#ccc' : '#3a3a3a',
        border: `1px solid ${selectedPeriod === p ? 'rgba(255,255,255,0.12)' : 'transparent'}`,
        borderRadius: 3,
        cursor: 'pointer',
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.04em',
        lineHeight: 1,
      }}
    >
      {p}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Add a loading state inside the chart area**

Inside the chart `<div>` (the container with `onMouseMove`/`onMouseLeave`), find the early-return for no data:
```tsx
if (!pts || pts.length < 2) return (
  <div style={{ ... }}>
    <span ...>loading chart...</span>
  </div>
)
```
Replace with:
```tsx
if (isFetchingPeriod) return (
  <div style={{
    width: '100%', height: '100%', minHeight: 40,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <span style={{ fontSize: 10, color: '#222', fontFamily: "'JetBrains Mono', monospace" }}>
      loading...
    </span>
  </div>
)
if (!pts || pts.length < 2) return (
  <div style={{
    width: '100%', height: '100%', minHeight: 40,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <span style={{ fontSize: 10, color: '#222', fontFamily: "'JetBrains Mono', monospace" }}>
      no data
    </span>
  </div>
)
```

- [ ] **Step 7: Gate session markers to 1D only**

Inside the SVG render, find:
```tsx
{sessionMarkers.map(({ x, label: mLabel, key: mKey }) => (
```
Wrap the entire `sessionMarkers.map(...)` block:
```tsx
{selectedPeriod === '1D' && sessionMarkers.map(({ x, label: mLabel, key: mKey }) => (
```

- [ ] **Step 8: Fix the tooltip time format for non-1D periods**

In the `onMouseMove` handler, find:
```typescript
const timeStr = new Date(pt.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
```
Replace with:
```typescript
const timeStr = selectedPeriod === '1D'
  ? new Date(pt.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  : new Date(pt.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
```

- [ ] **Step 9: Verify the UI**

Open `http://localhost:3000`, go to the Dashboard tab. Each report card should show 6 pill buttons (`1D 1W 1M 3M YTD 1Y`) left-aligned above the chart in white/gray monotone. Clicking a non-1D period should show "loading..." briefly then render the new chart. Clicking back to 1D should restore the original chart instantly (cached). Session markers should only appear on 1D.

- [ ] **Step 10: Commit**

```bash
git add app/page.tsx
git commit -m "feat: per-card timeframe selector (1D/1W/1M/3M/YTD/1Y)"
```
