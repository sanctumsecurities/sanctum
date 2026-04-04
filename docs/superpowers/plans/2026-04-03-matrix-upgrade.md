# Matrix Tab Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Matrix tab with SPY-relative quadrant classification, downside deviation, max drawdown, lookback periods, and dynamic risk-free rate.

**Architecture:** Server-side API route computes all new metrics (downside vol, max drawdown, dynamic Sharpe). Frontend receives enriched data and renders SPY-relative crosshairs, drawdown border rings, and new toggle controls. No new dependencies.

**Tech Stack:** Next.js 14 App Router, yahoo-finance2, inline styles (no Tailwind), SVG scatter plot

**Note:** No test suite is configured for this project. Verification is done via `npm run build`.

---

### Task 1: API Route — Complete Upgrade

**Files:**
- Modify: `app/api/matrix/route.ts`

- [ ] **Step 1: Add helper functions after the existing `withTimeout` function (after line 49)**

Add two new utility functions:

```typescript
function downsideDeviation(dailyReturns: number[]): number {
  const negatives = dailyReturns.filter(r => r < 0)
  if (negatives.length < 2) return 0
  return stddev(negatives) * Math.sqrt(252)
}

function maxDrawdownFromCloses(closes: number[]): number {
  if (closes.length < 2) return 0
  let peak = closes[0]
  let maxDD = 0
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > peak) peak = closes[i]
    const dd = (peak - closes[i]) / peak
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}
```

- [ ] **Step 2: Update the `MatrixStock` interface (lines 6-14)**

Replace with:

```typescript
interface MatrixStock {
  symbol: string
  name: string
  ret: number
  vol: number
  downsideVol: number
  maxDrawdown: number
  mcap: number
  sharpe: number
  price: number
}
```

- [ ] **Step 3: Update the `MatrixBenchmark` interface (lines 16-22)**

Replace with:

```typescript
interface MatrixBenchmark {
  symbol: string
  name: string
  ret: number
  vol: number
  downsideVol: number
  maxDrawdown: number
  sharpe: number
}
```

- [ ] **Step 4: Update the `CacheEntry` interface (lines 24-27)**

Replace with:

```typescript
interface CacheEntry {
  data: { stocks: MatrixStock[]; benchmarks: MatrixBenchmark[]; riskFreeRate: number; period: string }
  ts: number
}
```

- [ ] **Step 5: Remove the hardcoded `RISK_FREE_RATE` constant (line 31)**

Delete this line:

```typescript
const RISK_FREE_RATE = 0.05
```

- [ ] **Step 6: Add period-to-days mapping constant (near line 31, where RISK_FREE_RATE was)**

```typescript
const PERIOD_DAYS: Record<string, number> = { '3m': 90, '6m': 180, '12m': 365 }
```

- [ ] **Step 7: Update `fetchTickerData` signature and body (lines 51-108)**

Replace the entire function:

```typescript
async function fetchTickerData(symbol: string, periodDays: number, riskFreeRate: number): Promise<MatrixStock | null> {
  try {
    const now = new Date()
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)

    const [chartResult, quoteResult] = await withTimeout(
      Promise.all([
        yahooFinance.chart(symbol, {
          period1: periodStart,
          period2: now,
          interval: '1d' as any,
        }),
        yahooFinance.quote(symbol),
      ]),
      PER_TICKER_TIMEOUT
    )

    const quotes = (chartResult as any).quotes || []
    const closes: number[] = quotes
      .map((q: any) => q.close as number | null)
      .filter((c: number | null): c is number => c != null)

    if (closes.length < 10) return null

    const dailyReturns: number[] = []
    for (let i = 1; i < closes.length; i++) {
      dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1])
    }

    const tradingDays = closes.length
    const firstClose = closes[0]
    const lastClose = closes[closes.length - 1]

    const annualizedReturn = Math.pow(lastClose / firstClose, 252 / tradingDays) - 1
    const annualizedVol = stddev(dailyReturns) * Math.sqrt(252)
    const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0

    const q = quoteResult as any
    return {
      symbol: symbol.toUpperCase(),
      name: q.shortName || q.longName || symbol,
      ret: annualizedReturn,
      vol: annualizedVol,
      downsideVol: downsideDeviation(dailyReturns),
      maxDrawdown: maxDrawdownFromCloses(closes),
      mcap: q.marketCap || 0,
      sharpe,
      price: q.regularMarketPrice || lastClose,
    }
  } catch (err) {
    console.error(`[matrix] ${symbol} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}
```

- [ ] **Step 8: Update `fetchBenchmark` signature and body (lines 115-153)**

Replace the entire function:

```typescript
async function fetchBenchmark(symbol: string, name: string, periodDays: number, riskFreeRate: number): Promise<MatrixBenchmark> {
  try {
    const now = new Date()
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)

    const chartResult = await withTimeout(
      yahooFinance.chart(symbol, {
        period1: periodStart,
        period2: now,
        interval: '1d' as any,
      }),
      PER_TICKER_TIMEOUT
    )

    const quotes = (chartResult as any).quotes || []
    const closes: number[] = quotes
      .map((q: any) => q.close as number | null)
      .filter((c: number | null): c is number => c != null)

    if (closes.length < 10) {
      return { symbol, name, ret: 0, vol: 0, downsideVol: 0, maxDrawdown: 0, sharpe: 0 }
    }

    const dailyReturns: number[] = []
    for (let i = 1; i < closes.length; i++) {
      dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1])
    }

    const tradingDays = closes.length
    const annualizedReturn = Math.pow(closes[closes.length - 1] / closes[0], 252 / tradingDays) - 1
    const annualizedVol = stddev(dailyReturns) * Math.sqrt(252)
    const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0

    return {
      symbol,
      name,
      ret: annualizedReturn,
      vol: annualizedVol,
      downsideVol: downsideDeviation(dailyReturns),
      maxDrawdown: maxDrawdownFromCloses(closes),
      sharpe,
    }
  } catch (err) {
    console.error(`[matrix] ${symbol} benchmark failed:`, err instanceof Error ? err.message : err)
    return { symbol, name, ret: 0, vol: 0, downsideVol: 0, maxDrawdown: 0, sharpe: 0 }
  }
}
```

- [ ] **Step 9: Update the `GET` handler (lines 155-195)**

Replace the entire function:

```typescript
export async function GET(req: NextRequest) {
  try {
    const tickersParam = req.nextUrl.searchParams.get('tickers')
    if (!tickersParam) {
      return NextResponse.json({ error: 'tickers param required' }, { status: 400 })
    }

    const period = req.nextUrl.searchParams.get('period') || '12m'
    const periodDays = PERIOD_DAYS[period] || 365

    const tickers = tickersParam
      .split(',')
      .filter(Boolean)
      .map(t => t.trim().toUpperCase())
      .slice(0, 30)

    const cacheKey = `${period}:${[...tickers].sort().join(',')}`
    const cached = CACHE.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    // Fetch risk-free rate from 13-week T-bill
    let riskFreeRate = 0.05
    try {
      const irx = await withTimeout(yahooFinance.quote('^IRX'), PER_TICKER_TIMEOUT)
      const irxPrice = (irx as any).regularMarketPrice
      if (typeof irxPrice === 'number' && irxPrice > 0) {
        riskFreeRate = irxPrice / 100
      }
    } catch {
      // fall back to 0.05
    }

    // Fetch benchmarks in parallel with stock data
    const benchmarkPromises = BENCHMARKS.map(b => fetchBenchmark(b.symbol, b.name, periodDays, riskFreeRate))
    const stocks: (MatrixStock | null)[] = []
    for (let i = 0; i < tickers.length; i += 5) {
      const batch = tickers.slice(i, i + 5)
      const results = await Promise.all(batch.map(t => fetchTickerData(t, periodDays, riskFreeRate)))
      stocks.push(...results)
    }
    const benchmarks = await Promise.all(benchmarkPromises)

    const validStocks = stocks.filter((s): s is MatrixStock => s !== null)

    const result = { stocks: validStocks, benchmarks, riskFreeRate, period }
    CACHE.set(cacheKey, { data: result, ts: Date.now() })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[matrix] route error:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch matrix data' }, { status: 500 })
  }
}
```

- [ ] **Step 10: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 11: Commit**

```bash
git add app/api/matrix/route.ts
git commit -m "feat(matrix): add downside vol, max drawdown, dynamic risk-free rate, period param"
```

---

### Task 2: Frontend — Update Types, State, and Helper Functions

**Files:**
- Modify: `components/MatrixScatter.tsx`

- [ ] **Step 1: Update the `MatrixStock` interface (lines 7-15)**

Replace with:

```typescript
interface MatrixStock {
  symbol: string
  name: string
  ret: number
  vol: number
  downsideVol: number
  maxDrawdown: number
  mcap: number
  sharpe: number
  price: number
}
```

- [ ] **Step 2: Update the `MatrixBenchmark` interface (lines 17-23)**

Replace with:

```typescript
interface MatrixBenchmark {
  symbol: string
  name: string
  ret: number
  vol: number
  downsideVol: number
  maxDrawdown: number
  sharpe: number
}
```

- [ ] **Step 3: Update the `MatrixData` interface (lines 25-28)**

Replace with:

```typescript
interface MatrixData {
  stocks: MatrixStock[]
  benchmarks: MatrixBenchmark[]
  riskFreeRate: number
  period: string
}
```

- [ ] **Step 4: Add new type aliases (after line 31, next to `DataSource` and `Quadrant`)**

```typescript
type VolMetric = 'total' | 'downside'
type Period = '3m' | '6m' | '12m'
```

- [ ] **Step 5: Remove the hardcoded threshold constants (lines 44-45)**

Delete these two lines:

```typescript
const VOL_THRESHOLD = 0.35
const RET_THRESHOLD = 0
```

- [ ] **Step 6: Update `getQuadrant` to accept dynamic thresholds (lines 56-61)**

Replace with:

```typescript
function getQuadrant(ret: number, vol: number, benchRet: number, benchVol: number): Quadrant {
  if (ret >= benchRet && vol < benchVol) return 'CORE'
  if (ret >= benchRet && vol >= benchVol) return 'VOLATILE'
  if (ret < benchRet && vol < benchVol) return 'DEFENSIVE'
  return 'AT RISK'
}
```

- [ ] **Step 7: Update `dotRadius` max range (line 79)**

Change:

```typescript
  return 6 + t * 12
```

To:

```typescript
  return 6 + t * 22
```

Also update the fallback for zero range (line 77) from `return 12` to `return 17` (midpoint of 6-28).

- [ ] **Step 8: Add new state variables in the main component (around lines 244-252)**

After the existing `source` state, add:

```typescript
  const [volMetric, setVolMetric] = useState<VolMetric>('total')
  const [period, setPeriod] = useState<Period>('12m')
```

Remove the `activeQuadrant` state (line 250):

```typescript
  const [activeQuadrant, setActiveQuadrant] = useState<Quadrant | null>(null)
```

- [ ] **Step 9: Add SPY benchmark memo and vol getter (after `allMcaps` memo, around line 337)**

```typescript
  const spyBenchmark = useMemo(() => data?.benchmarks.find(b => b.symbol === 'SPY') ?? null, [data])
  const spyRet = spyBenchmark?.ret ?? 0
  const spyVol = spyBenchmark ? (volMetric === 'downside' ? spyBenchmark.downsideVol : spyBenchmark.vol) : 0.35

  const getVol = useCallback((s: { vol: number; downsideVol: number }) =>
    volMetric === 'downside' ? s.downsideVol : s.vol, [volMetric])
```

- [ ] **Step 10: Update axis ranges memo to use active vol field (lines 322-335)**

Replace:

```typescript
  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    if (!data || data.stocks.length === 0) {
      return { xMin: 0, xMax: 0.8, yMin: -0.3, yMax: 0.6 }
    }
    const allVols = [...data.stocks.map(s => s.vol), ...data.benchmarks.map(b => b.vol)]
    const allRets = [...data.stocks.map(s => s.ret), ...data.benchmarks.map(b => b.ret)]
```

With:

```typescript
  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    if (!data || data.stocks.length === 0) {
      return { xMin: 0, xMax: 0.8, yMin: -0.3, yMax: 0.6 }
    }
    const allVols = [...data.stocks.map(s => getVol(s)), ...data.benchmarks.map(b => getVol(b))]
    const allRets = [...data.stocks.map(s => s.ret), ...data.benchmarks.map(b => b.ret)]
```

Also update the dependency array from `[data]` to `[data, getVol]`.

- [ ] **Step 11: Remove `quadrantCounts` memo entirely (lines 312-319)**

Delete the entire block:

```typescript
  const quadrantCounts = useMemo(() => {
    const counts: Record<Quadrant, number> = { 'CORE': 0, 'VOLATILE': 0, 'DEFENSIVE': 0, 'AT RISK': 0 }
    if (!data) return counts
    for (const s of data.stocks) {
      counts[getQuadrant(s.ret, s.vol)]++
    }
    return counts
  }, [data])
```

---

### Task 3: Frontend — Control Row Redesign

**Files:**
- Modify: `components/MatrixScatter.tsx`

- [ ] **Step 1: Add period subtitle as the first element in the return JSX (line 358)**

Right after `return (` and `<div>`, add:

```tsx
      {/* Period subtitle */}
      <div style={{
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        color: '#444',
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        marginTop: 6,
      }}>
        TRAILING {period.toUpperCase()}
      </div>
```

- [ ] **Step 2: Replace the source buttons row (lines 360-388) with a single row containing all controls**

Replace the current source button `<div>` with:

```tsx
      {/* Control row: source buttons left, toggles right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 16 }}>
        {/* Source buttons — left */}
        <div style={{ display: 'flex', gap: 8, width: titleWidth ?? 420, flexShrink: 0 }}>
          {sourceButtons.map(({ label, flex }) => {
            const isActive = label === source
            return (
              <button
                key={label}
                onClick={() => { setSource(label); setPinnedSymbol(null); onSelectStock?.(null) }}
                style={{
                  flex,
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : '#1a1a1a'}`,
                  borderRadius: 4,
                  padding: '6px 0',
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.08em',
                  color: isActive ? '#fff' : '#555',
                  cursor: 'pointer',
                  textTransform: 'uppercase' as const,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget).style.color = '#aaa' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget).style.color = '#555' }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Right side: vol toggle + period selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          {/* Vol metric toggle */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['total', 'downside'] as const).map(v => {
              const isActive = volMetric === v
              return (
                <button
                  key={v}
                  onClick={() => setVolMetric(v)}
                  style={{
                    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : '#1a1a1a'}`,
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.08em',
                    color: isActive ? '#fff' : '#555',
                    cursor: 'pointer',
                    textTransform: 'uppercase' as const,
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap' as const,
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget).style.color = '#aaa' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget).style.color = '#555' }}
                >
                  {v === 'total' ? 'TOTAL VOL' : 'DOWNSIDE VOL'}
                </button>
              )
            })}
          </div>

          {/* Period selector */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['3m', '6m', '12m'] as const).map(p => {
              const isActive = period === p
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : '#1a1a1a'}`,
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.08em',
                    color: isActive ? '#fff' : '#555',
                    cursor: 'pointer',
                    textTransform: 'uppercase' as const,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget).style.color = '#aaa' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget).style.color = '#555' }}
                >
                  {p.toUpperCase()}
                </button>
              )
            })}
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Remove `setActiveQuadrant(null)` from the source button click handler**

In the new source button `onClick`, it already reads:

```typescript
onClick={() => { setSource(label); setPinnedSymbol(null); onSelectStock?.(null) }}
```

The old version had `setActiveQuadrant(null)` — confirm it is not present in the new code.

- [ ] **Step 4: Remove the entire quadrant filter pills block (old lines 479-530)**

Delete the entire `{/* Quadrant filter pills */}` section, including the wrapping `<div>` with its buttons and the CLEAR button.

---

### Task 4: Frontend — Dynamic Crosshairs and Chart Rendering

**Files:**
- Modify: `components/MatrixScatter.tsx`

- [ ] **Step 1: Update quadrant background washes to use SPY values**

In the quadrant washes block (currently referencing `VOL_THRESHOLD` and `RET_THRESHOLD`), replace:

```tsx
              {(() => {
                const divX = toX(VOL_THRESHOLD)
                const divY = toY(RET_THRESHOLD)
```

With:

```tsx
              {(() => {
                const divX = toX(spyVol)
                const divY = toY(spyRet)
```

- [ ] **Step 2: Update quadrant divider lines to use SPY values**

Replace the vertical crosshair line:

```tsx
              <line
                x1={toX(VOL_THRESHOLD)} y1={PADDING.top}
                x2={toX(VOL_THRESHOLD)} y2={dimensions.height - PADDING.bottom}
                stroke="#1a1a1e" strokeWidth="1"
                strokeDasharray="6,4"
                style={{ animation: mounted ? undefined : 'none' }}
              />
```

With:

```tsx
              <line
                x1={toX(spyVol)} y1={PADDING.top}
                x2={toX(spyVol)} y2={dimensions.height - PADDING.bottom}
                stroke="#1a1a1e" strokeWidth="1"
                strokeDasharray="6,4"
                style={{ animation: mounted ? undefined : 'none' }}
              />
```

Replace the horizontal crosshair line:

```tsx
              <line
                x1={PADDING.left} y1={toY(RET_THRESHOLD)}
                x2={dimensions.width - PADDING.right} y2={toY(RET_THRESHOLD)}
                stroke="#1a1a1e" strokeWidth="1"
                strokeDasharray="6,4"
              />
```

With:

```tsx
              <line
                x1={PADDING.left} y1={toY(spyRet)}
                x2={dimensions.width - PADDING.right} y2={toY(spyRet)}
                stroke="#1a1a1e" strokeWidth="1"
                strokeDasharray="6,4"
              />
```

- [ ] **Step 3: Add SPY crosshair labels after the crosshair lines**

Insert after the horizontal crosshair `<line>`:

```tsx
              {/* SPY crosshair labels */}
              <text
                x={dimensions.width - PADDING.right - 4}
                y={toY(spyRet) - 6}
                fill="#444"
                fontSize="9"
                fontFamily="'JetBrains Mono', monospace"
                textAnchor="end"
              >
                SPY {(spyRet * 100).toFixed(1)}%
              </text>
              <text
                x={toX(spyVol) + 6}
                y={PADDING.top + 12}
                fill="#444"
                fontSize="9"
                fontFamily="'JetBrains Mono', monospace"
              >
                SPY {(spyVol * 100).toFixed(1)}%
              </text>
```

- [ ] **Step 4: Update quadrant corner labels to use SPY values**

In the quadrant labels block, replace:

```tsx
              {(() => {
                const divX = toX(VOL_THRESHOLD)
                const divY = toY(RET_THRESHOLD)
```

With:

```tsx
              {(() => {
                const divX = toX(spyVol)
                const divY = toY(spyRet)
```

- [ ] **Step 5: Update X-axis label to reflect vol metric toggle**

Replace:

```tsx
              <text
                x={dimensions.width / 2} y={dimensions.height - 8}
                fill="#333" fontSize="10" textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
                letterSpacing="0.12em"
              >
                VOLATILITY
              </text>
```

With:

```tsx
              <text
                x={dimensions.width / 2} y={dimensions.height - 8}
                fill="#333" fontSize="10" textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
                letterSpacing="0.12em"
              >
                {volMetric === 'downside' ? 'DOWNSIDE VOLATILITY' : 'VOLATILITY'}
              </text>
```

- [ ] **Step 6: Update stock dot rendering — use active vol, remove quadrant filtering, add drawdown border**

In the stock dots map (the `data.stocks.map((s, i) =>` block), replace the entire body with:

```tsx
              {data.stocks.map((s, i) => {
                const sVol = getVol(s)
                const quad = getQuadrant(s.ret, sVol, spyRet, spyVol)
                const color = QUADRANT_CONFIG[quad].color
                const r = dotRadius(s.mcap, allMcaps)
                const isActive = activeSymbol === s.symbol
                const cx = toX(sVol)
                const cy = toY(s.ret)

                // Drawdown border ring
                const dd = s.maxDrawdown
                const ddRing = dd >= 0.40
                  ? { width: 3, color: '#ef4444', opacity: 0.8 }
                  : dd >= 0.20
                  ? { width: 2, color, opacity: 0.6 }
                  : dd >= 0.05
                  ? { width: 1, color, opacity: 0.4 }
                  : null

                return (
                  <g
                    key={s.symbol}
                    style={{
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setHoveredSymbol(s.symbol)}
                    onMouseLeave={() => setHoveredSymbol(null)}
                    onClick={() => {
                      const next = pinnedSymbol === s.symbol ? null : s.symbol
                      setPinnedSymbol(next)
                      onSelectStock?.(next)
                    }}
                  >
                    {isActive && (
                      <circle
                        cx={cx} cy={cy} r={r + 6}
                        fill="none" stroke={color} strokeWidth="1.5"
                        opacity={0.3}
                        style={{ animation: 'pulse 2s ease-in-out infinite' }}
                      />
                    )}
                    {ddRing && (
                      <circle
                        cx={cx} cy={cy}
                        r={(isActive ? r + 2 : r) + ddRing.width + 1}
                        fill="none"
                        stroke={ddRing.color}
                        strokeWidth={ddRing.width}
                        opacity={ddRing.opacity}
                        style={{
                          transform: mounted ? 'scale(1)' : 'scale(0)',
                          transformOrigin: `${cx}px ${cy}px`,
                          transition: `transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 25}ms`,
                        }}
                      />
                    )}
                    <circle
                      cx={cx} cy={cy}
                      r={isActive ? r + 2 : r}
                      fill={color} fillOpacity={0.15}
                      stroke={color} strokeWidth={isActive ? 2 : 1.5}
                      style={{
                        transform: mounted ? 'scale(1)' : 'scale(0)',
                        transformOrigin: `${cx}px ${cy}px`,
                        transition: `transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 25}ms, r 0.2s ease`,
                      }}
                    />
                  </g>
                )
              })}
```

- [ ] **Step 7: Update benchmark diamond rendering to use active vol**

In the benchmark diamonds map, replace `toX(bench.vol)` with `toX(getVol(bench))`:

```tsx
              {data.benchmarks.map((bench, bi) => {
                const bx = toX(getVol(bench))
                const by = toY(bench.ret)
```

- [ ] **Step 8: Update stock label rendering — use active vol, remove quadrant filtering**

In the stock labels map, replace the entire body with:

```tsx
              {data.stocks.map(s => {
                const sVol = getVol(s)
                const quad = getQuadrant(s.ret, sVol, spyRet, spyVol)
                const color = QUADRANT_CONFIG[quad].color
                const r = dotRadius(s.mcap, allMcaps)
                const isActive = activeSymbol === s.symbol
                const cx = toX(sVol)
                const cy = toY(s.ret)

                return (
                  <text
                    key={`label-${s.symbol}`}
                    x={cx} y={cy - r - 6}
                    fill={isActive ? '#fff' : color}
                    opacity={isActive ? 1 : 0.65}
                    fontSize="10"
                    fontFamily="'JetBrains Mono', monospace"
                    fontWeight={isActive ? 700 : 500}
                    textAnchor="middle"
                    style={{
                      transition: 'fill 0.2s ease, opacity 0.2s ease',
                      pointerEvents: 'none',
                    }}
                  >
                    {s.symbol}
                  </text>
                )
              })}
```

- [ ] **Step 9: Update benchmark label rendering to use active vol**

In the benchmark labels map, replace `toX(bench.vol)` with `toX(getVol(bench))`:

```tsx
              {data.benchmarks.map(bench => {
                const bx = toX(getVol(bench))
                const by = toY(bench.ret)
```

---

### Task 5: Frontend — Fetch Wiring, Tooltip, and Final Verification

**Files:**
- Modify: `components/MatrixScatter.tsx`

- [ ] **Step 1: Update the fetch effect to include `period` in the URL and dependency array**

Replace the fetch URL (currently line 291):

```typescript
    fetch(`/api/matrix?tickers=${encodeURIComponent(tickers.join(','))}`)
```

With:

```typescript
    fetch(`/api/matrix?tickers=${encodeURIComponent(tickers.join(','))}&period=${period}`)
```

Add `period` to the dependency array (currently line 309):

```typescript
  }, [tickers])
```

Becomes:

```typescript
  }, [tickers, period])
```

- [ ] **Step 2: Update the tooltip to show new fields and use active vol**

In the tooltip section (the `{activeSymbol && (() => {` block), update the vol/ret extraction to use the active vol field:

Replace:

```typescript
              const vol = 'mcap' in item ? item.vol : (item as MatrixBenchmark).vol
              const ret = 'mcap' in item ? item.ret : (item as MatrixBenchmark).ret
```

With:

```typescript
              const vol = getVol(item)
              const ret = item.ret
```

Then update `getQuadrant` call in the tooltip:

Replace:

```typescript
              const quad = getQuadrant(ret, vol)
```

With:

```typescript
              const quad = getQuadrant(ret, vol, spyRet, spyVol)
```

Update the VOLATILITY row value label text — after the existing VOLATILITY row, add new rows for DOWNSIDE VOL and MAX DD. Find the existing block:

```tsx
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>VOLATILITY</span>
                      <span style={{ fontSize: 10, color: '#ccc', fontFamily: "'JetBrains Mono', monospace" }}>
                        {(vol * 100).toFixed(1)}%
                      </span>
                    </div>
```

After it, add:

```tsx
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>DOWNSIDE VOL</span>
                      <span style={{ fontSize: 10, color: '#ccc', fontFamily: "'JetBrains Mono', monospace" }}>
                        {(item.downsideVol * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>MAX DD</span>
                      <span style={{ fontSize: 10, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace" }}>
                        -{('maxDrawdown' in item ? (item.maxDrawdown * 100).toFixed(1) : '0.0')}%
                      </span>
                    </div>
```

Update the SHARPE row to use 1 decimal place. Replace:

```tsx
                        {item.sharpe.toFixed(2)}
```

With:

```tsx
                        {item.sharpe.toFixed(1)}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add components/MatrixScatter.tsx
git commit -m "feat(matrix): SPY-relative crosshairs, vol toggle, period selector, drawdown rings"
```
