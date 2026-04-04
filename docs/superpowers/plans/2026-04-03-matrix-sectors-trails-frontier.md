# Matrix Sectors, Trails & Frontier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sector coloring, trajectory arrows, and efficient frontier line to the Matrix scatter chart.

**Architecture:** Two files change. The API route (`app/api/matrix/route.ts`) gains sector data via `quoteSummary` and trajectory fields computed from historical price subsets. The component (`components/MatrixScatter.tsx`) stays monolithic, adding three pure computation functions (`computeConvexHull`, `catmullRomPath`, `getArrowheadPoints`), three new toggle states, and three new SVG rendering layers. Controls restructured into two rows.

**Tech Stack:** Next.js 14, yahoo-finance2, pure SVG rendering, inline styles

**Spec:** `docs/superpowers/specs/2026-04-03-matrix-sectors-trails-frontier-design.md`

**No test suite configured** — verification is via `npm run build` and manual visual inspection at `http://localhost:3000`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/api/matrix/route.ts` | Modify | Add `sector`, `prevRet`, `prevVol`, `prevDownsideVol` to stock response |
| `components/MatrixScatter.tsx` | Modify | New types, constants, state, controls layout, SVG layers, interactions |

---

### Task 1: API — Add sector field to stock response

**Files:**
- Modify: `app/api/matrix/route.ts:5-16` (MatrixStock interface)
- Modify: `app/api/matrix/route.ts:73-126` (fetchTickerData function)

- [ ] **Step 1: Add `sector` to the MatrixStock interface**

In `app/api/matrix/route.ts`, change the interface at line 5:

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
  sector: string
}
```

- [ ] **Step 2: Fetch sector data in fetchTickerData**

In `app/api/matrix/route.ts`, modify `fetchTickerData` (starting at line 73). Replace the existing `Promise.all` block (lines 78-88) and the return object (lines 110-121) to include a `quoteSummary` call and extract the sector:

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

    // Fetch sector — separate call so a failure doesn't kill the whole ticker
    let sector = 'Other'
    try {
      const summary = await withTimeout(
        yahooFinance.quoteSummary(symbol, { modules: ['summaryProfile'] }),
        5000
      )
      const sp = (summary as any)?.summaryProfile
      if (sp?.sector) sector = sp.sector
    } catch {
      // sector stays 'Other'
    }

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
      sector,
    }
  } catch (err) {
    console.error(`[matrix] ${symbol} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/matrix/route.ts
git commit -m "feat(matrix): add sector field to stock response via quoteSummary"
```

---

### Task 2: API — Add trajectory fields to stock response

**Files:**
- Modify: `app/api/matrix/route.ts:5-17` (MatrixStock interface — add prevRet/prevVol/prevDownsideVol)
- Modify: `app/api/matrix/route.ts` (fetchTickerData — compute historical metrics)
- Modify: `app/api/matrix/route.ts:35` (PERIOD_DAYS — add TRAJECTORY_OFFSET)

- [ ] **Step 1: Add trajectory offset constant and update interface**

Add the trajectory offset mapping after `PERIOD_DAYS` (line 35):

```typescript
const TRAJECTORY_OFFSET: Record<string, number> = { '12m': 63, '6m': 42 }
```

Update `MatrixStock` interface to add:

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
  sector: string
  prevRet: number | null
  prevVol: number | null
  prevDownsideVol: number | null
}
```

- [ ] **Step 2: Compute trajectory data in fetchTickerData**

After the existing return and volatility computation (after the `sharpe` line), add the trajectory calculation. Insert this block before the `const q = quoteResult as any` line:

```typescript
    // Trajectory: compute where this stock would have plotted ~3m ago (12m period) or ~2m ago (6m period)
    const periodKey = periodDays === 365 ? '12m' : periodDays === 180 ? '6m' : '3m'
    const trajOffset = TRAJECTORY_OFFSET[periodKey]
    let prevRet: number | null = null
    let prevVol: number | null = null
    let prevDownsideVol: number | null = null

    if (trajOffset && closes.length >= trajOffset + 20) {
      const prevCloses = closes.slice(0, closes.length - trajOffset)
      const prevDailyReturns: number[] = []
      for (let i = 1; i < prevCloses.length; i++) {
        prevDailyReturns.push((prevCloses[i] - prevCloses[i - 1]) / prevCloses[i - 1])
      }
      const prevTradingDays = prevCloses.length
      const prevFirst = prevCloses[0]
      const prevLast = prevCloses[prevCloses.length - 1]
      prevRet = Math.pow(prevLast / prevFirst, 252 / prevTradingDays) - 1
      prevVol = stddev(prevDailyReturns) * Math.sqrt(252)
      prevDownsideVol = downsideDeviation(prevDailyReturns)
    }
```

Then add the three fields to the return object:

```typescript
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
      sector,
      prevRet,
      prevVol,
      prevDownsideVol,
    }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/matrix/route.ts
git commit -m "feat(matrix): compute trajectory fields (prevRet, prevVol, prevDownsideVol)"
```

---

### Task 3: Component — Update types, add constants, add new state

**Files:**
- Modify: `components/MatrixScatter.tsx:7-48` (types)
- Modify: `components/MatrixScatter.tsx:50-57` (constants — add SECTOR_COLORS)
- Modify: `components/MatrixScatter.tsx:248-258` (state declarations — add colorMode, showTrails, showFrontier, sectorFilter)

- [ ] **Step 1: Update MatrixStock interface and add new types**

In `components/MatrixScatter.tsx`, update the `MatrixStock` interface (lines 7-16):

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
  sector: string
  prevRet: number | null
  prevVol: number | null
  prevDownsideVol: number | null
}
```

Add `ColorMode` to the type definitions (after line 38, the `VolMetric` line):

```typescript
type ColorMode = 'quadrant' | 'sector'
```

- [ ] **Step 2: Add SECTOR_COLORS constant**

After the `QUADRANT_CONFIG` constant (after line 57), add:

```typescript
const SECTOR_COLORS: Record<string, string> = {
  'Technology':              '#60a5fa',
  'Healthcare':              '#4ade80',
  'Financial Services':      '#f59e0b',
  'Energy':                  '#ef4444',
  'Consumer Cyclical':       '#a78bfa',
  'Consumer Defensive':      '#2dd4bf',
  'Communication Services':  '#fb923c',
  'Industrials':             '#94a3b8',
  'Real Estate':             '#f472b6',
  'Basic Materials':         '#a3e635',
  'Utilities':               '#67e8f9',
  'Other':                   '#555555',
}
```

- [ ] **Step 3: Add pure computation functions**

After the `dotRadius` function (after line 85), add three pure functions:

```typescript
function computeConvexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return [...points]
  const sorted = [...points].sort((a, b) => a.x - b.x || b.y - a.y)
  const hull: { x: number; y: number }[] = []
  for (const p of sorted) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2]
      const b = hull[hull.length - 1]
      // Cross product: positive = counter-clockwise (keep), zero or negative = clockwise or collinear (pop)
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
      if (cross <= 0) hull.pop()
      else break
    }
    hull.push(p)
  }
  return hull
}

function catmullRomPath(points: { x: number; y: number }[], tension: number = 0.5): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`

  const alpha = 1 - tension
  let d = `M${points[0].x},${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) * alpha / 6
    const cp1y = p1.y + (p2.y - p0.y) * alpha / 6
    const cp2x = p2.x - (p3.x - p1.x) * alpha / 6
    const cp2y = p2.y - (p3.y - p1.y) * alpha / 6

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

function getArrowheadPoints(
  fromX: number, fromY: number, toX: number, toY: number, size: number = 6
): string {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  const x1 = toX - size * Math.cos(angle - Math.PI / 6)
  const y1 = toY - size * Math.sin(angle - Math.PI / 6)
  const x2 = toX - size * Math.cos(angle + Math.PI / 6)
  const y2 = toY - size * Math.sin(angle + Math.PI / 6)
  return `${toX},${toY} ${x1},${y1} ${x2},${y2}`
}
```

- [ ] **Step 4: Add new state variables**

In the main component function (after the existing state declarations around line 258), add:

```typescript
  const [colorMode, setColorMode] = useState<ColorMode>('quadrant')
  const [showTrails, setShowTrails] = useState(false)
  const [showFrontier, setShowFrontier] = useState(false)
  const [sectorFilter, setSectorFilter] = useState<string | null>(null)
  const [hoveredFrontier, setHoveredFrontier] = useState(false)
```

- [ ] **Step 5: Add a `getStockColor` helper**

Inside the component, after the `getVol` callback (after line 322), add a memoized helper:

```typescript
  const getStockColor = useCallback((s: MatrixStock) => {
    if (colorMode === 'sector') return SECTOR_COLORS[s.sector] || SECTOR_COLORS['Other']
    const sVol = volMetric === 'downside' ? s.downsideVol : s.vol
    const quad = getQuadrant(s.ret, sVol, spyRet, spyVol)
    return QUADRANT_CONFIG[quad].color
  }, [colorMode, volMetric, spyRet, spyVol])
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Clean build. New state variables are unused (warnings OK), no type errors.

- [ ] **Step 7: Commit**

```bash
git add components/MatrixScatter.tsx
git commit -m "feat(matrix): add types, constants, state for sector/trails/frontier"
```

---

### Task 4: Component — Two-row controls layout

**Files:**
- Modify: `components/MatrixScatter.tsx:374-470` (controls row restructuring)

This task restructures the existing single controls row into two rows and adds the new toggle buttons.

- [ ] **Step 1: Restructure controls into two rows**

Replace the entire controls `<div>` block (lines 374-470 — from `{/* Control row: source buttons left, toggles right */}` through its closing `</div>`) with:

```tsx
      {/* Row 1: Data selection — source left, period right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 }}>
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

        {/* Period selector — right */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
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

      {/* Row 2: View options — metrics left, overlays right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
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

        {/* Color mode toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['quadrant', 'sector'] as const).map(m => {
            const isActive = colorMode === m
            return (
              <button
                key={m}
                onClick={() => {
                  setColorMode(m)
                  setSectorFilter(null) // clear filter on mode switch
                }}
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
                {m.toUpperCase()}
              </button>
            )
          })}
        </div>

        {/* Overlay toggles — right */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {([
            { key: 'trails', label: 'TRAILS', active: showTrails, toggle: () => setShowTrails(v => !v) },
            { key: 'frontier', label: 'FRONTIER', active: showFrontier, toggle: () => setShowFrontier(v => !v) },
          ] as const).map(({ key, label, active, toggle }) => (
            <button
              key={key}
              onClick={toggle}
              style={{
                background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: `1px solid ${active ? 'rgba(255,255,255,0.15)' : '#1a1a1a'}`,
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.08em',
                color: active ? '#fff' : '#555',
                cursor: 'pointer',
                textTransform: 'uppercase' as const,
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap' as const,
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget).style.color = '#aaa' }}
              onMouseLeave={e => { if (!active) (e.currentTarget).style.color = '#555' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
```

- [ ] **Step 2: Verify build + visual check**

Run: `npm run build`
Expected: Clean build.

Start dev server (`npm run dev`), navigate to Matrix tab. Confirm:
- Row 1 shows source buttons left, period buttons right
- Row 2 shows vol toggle + color mode left, TRAILS + FRONTIER right
- TRAILS and FRONTIER toggle on/off visually (no functional effect yet)
- Switching QUADRANT/SECTOR toggles visually (no functional effect yet)

- [ ] **Step 3: Commit**

```bash
git add components/MatrixScatter.tsx
git commit -m "feat(matrix): two-row controls layout with color mode and overlay toggles"
```

---

### Task 5: Component — Sector coloring (dots, labels, drawdown rings, tooltip)

**Files:**
- Modify: `components/MatrixScatter.tsx` (stock dots section ~line 730, labels section ~line 827, tooltip section ~line 874)

- [ ] **Step 1: Wire sector colors into stock dots**

In the stock dots rendering block (starting around line 730 `{/* Stock dots — shapes layer */}`), replace the color computation. Change:

```tsx
const quad = getQuadrant(s.ret, sVol, spyRet, spyVol)
const color = QUADRANT_CONFIG[quad].color
```

to:

```tsx
const color = getStockColor(s)
const quad = getQuadrant(s.ret, sVol, spyRet, spyVol)
```

Also update the drawdown ring color. Find the `ddRing` block and change the 20% and 5% cases to use `color` for all cases (not just the high ones). Replace the existing `ddRing` computation:

```tsx
                const dd = s.maxDrawdown
                const ddRing = dd >= 0.40
                  ? { width: 3, color: '#ef4444', opacity: 0.8 }
                  : dd >= 0.20
                  ? { width: 2, color, opacity: 0.6 }
                  : dd >= 0.05
                  ? { width: 1, color, opacity: 0.4 }
                  : null
```

This already uses `color` for the 20% and 5% tiers and hardcodes red for 40%+. Keep this as-is — in sector mode, the 20%/5% tiers will naturally use the sector color since `color` is now set by `getStockColor(s)`.

- [ ] **Step 2: Add filtering opacity to dots**

In the same stock dots `<g>` element, add an opacity property based on the active filter. After the `const cx/cy` lines, add:

```tsx
                // Filtering: fade non-matching stocks
                const isFiltered = colorMode === 'sector' && sectorFilter
                  ? s.sector !== sectorFilter
                  : false
                const groupOpacity = isFiltered ? 0.06 : 1
```

Then wrap the `<g>` element's style to include opacity:

```tsx
                  <g
                    key={s.symbol}
                    style={{ cursor: 'pointer', opacity: groupOpacity, transition: 'opacity 0.3s ease' }}
                    ...
                  >
```

- [ ] **Step 3: Wire sector colors into stock labels**

In the labels rendering block (around line 827), replace the color computation. Change:

```tsx
const quad = getQuadrant(s.ret, sVol, spyRet, spyVol)
const color = QUADRANT_CONFIG[quad].color
```

to:

```tsx
const color = getStockColor(s)
```

Add the same filtering opacity to labels:

```tsx
                const isFiltered = colorMode === 'sector' && sectorFilter
                  ? s.sector !== sectorFilter
                  : false
```

And add `opacity` to the `<text>` element's style, combining with existing opacity:

```tsx
                    opacity={isFiltered ? 0.06 : (isActive ? 1 : 0.65)}
```

- [ ] **Step 4: Update tooltip to show sector and use sector color**

In the tooltip section (around line 874), update the border color and add sector line. Find `borderLeft: \`2px solid ${qColor}\`` and change it to:

```tsx
                  borderLeft: `2px solid ${stock ? getStockColor(stock) : qColor}`,
```

After the company name `<div>` (the one with `item.name`), add a sector line that only shows when colorMode is sector and the item is a stock:

```tsx
                  {stock && colorMode === 'sector' && (
                    <div style={{
                      fontSize: 9,
                      color: getStockColor(stock),
                      fontFamily: "'JetBrains Mono', monospace",
                      marginBottom: 10,
                      letterSpacing: '0.05em',
                    }}>
                      {stock.sector}
                    </div>
                  )}
```

- [ ] **Step 5: Verify build + visual check**

Run: `npm run build`
Expected: Clean build.

Dev server check:
- Toggle to SECTOR mode → dots change color based on sector
- Drawdown rings use sector color for 20%/5% tiers
- Tooltip shows sector name in sector color when in sector mode
- Tooltip left border uses sector color
- Toggle back to QUADRANT → original colors restored

- [ ] **Step 6: Commit**

```bash
git add components/MatrixScatter.tsx
git commit -m "feat(matrix): sector coloring for dots, labels, drawdown rings, tooltip"
```

---

### Task 6: Component — Sector legend with filtering

**Files:**
- Modify: `components/MatrixScatter.tsx` (after the SVG chart `</div>`, before the final closing tags)

- [ ] **Step 1: Add sector legend below the chart**

After the chart container's closing `</div>` (around line 972, after the tooltip), but still inside the `<>` fragment, add the sector legend. Find the closing `</>` for the chart conditional and add the legend just before it:

```tsx
          {/* Footer: quadrant counts or sector legend */}
          {colorMode === 'sector' ? (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 12,
              padding: '10px 0 4px',
            }}>
              {(() => {
                const sectorCounts: Record<string, number> = {}
                for (const s of data.stocks) {
                  sectorCounts[s.sector] = (sectorCounts[s.sector] || 0) + 1
                }
                return Object.entries(sectorCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([sector, count]) => {
                    const isActive = sectorFilter === sector
                    return (
                      <button
                        key={sector}
                        onClick={() => setSectorFilter(sectorFilter === sector ? null : sector)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          background: 'none', border: 'none',
                          cursor: 'pointer', padding: '2px 0',
                        }}
                      >
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: SECTOR_COLORS[sector] || SECTOR_COLORS['Other'],
                          flexShrink: 0,
                          opacity: isActive ? 1 : 0.7,
                        }} />
                        <span style={{
                          fontSize: 9,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: isActive ? '#fff' : '#555',
                          letterSpacing: '0.05em',
                          transition: 'color 0.2s ease',
                          whiteSpace: 'nowrap',
                        }}>
                          {sector} ({count})
                        </span>
                      </button>
                    )
                  })
              })()}
            </div>
          ) : null}
```

- [ ] **Step 2: Verify build + visual check**

Run: `npm run build`
Expected: Clean build.

Dev server check:
- Switch to SECTOR mode → legend appears below chart with colored dots and counts
- Click a sector badge → only those stocks are visible, others fade to 0.06
- Click same badge again → filter clears
- Switch to QUADRANT mode → legend disappears
- Switch from SECTOR (with active filter) to QUADRANT → filter clears

- [ ] **Step 3: Commit**

```bash
git add components/MatrixScatter.tsx
git commit -m "feat(matrix): sector legend with click-to-filter"
```

---

### Task 7: Component — Trajectory arrow rendering + interaction

**Files:**
- Modify: `components/MatrixScatter.tsx` (new SVG layer between quadrant washes and stock dots)

- [ ] **Step 1: Add trajectory arrows SVG layer**

In the SVG, after the Y-axis RETURN label (line ~728, the `<text>RETURN</text>` block) and before the stock dots section (`{/* Stock dots — shapes layer */}` around line 730), insert the trajectory arrows layer. This ensures arrows render behind dots but in front of grid/washes:

```tsx
              {/* Trajectory arrows — behind dots */}
              {showTrails && data.stocks.map(s => {
                const prevVolVal = volMetric === 'downside' ? s.prevDownsideVol : s.prevVol
                if (s.prevRet == null || prevVolVal == null) return null

                const fromX = toX(prevVolVal)
                const fromY = toY(s.prevRet)
                const curX = toX(getVol(s))
                const curY = toY(s.ret)

                // Skip if arrow is too short (<2px)
                const dx = curX - fromX
                const dy = curY - fromY
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist < 2) return null

                const color = getStockColor(s)
                const isHovered = activeSymbol === s.symbol
                const isOtherHovered = activeSymbol != null && activeSymbol !== s.symbol && !activeSymbol.startsWith('BENCH_')

                // Filtering
                const isFiltered = colorMode === 'sector' && sectorFilter
                  ? s.sector !== sectorFilter
                  : false
                if (isFiltered) return null

                const lineOpacity = isHovered ? 0.6 : isOtherHovered ? 0.08 : 0.25
                const headOpacity = isHovered ? 0.8 : isOtherHovered ? 0.12 : 0.4
                const ghostOpacity = isHovered ? 0.5 : isOtherHovered ? 0.06 : 0.2

                return (
                  <g key={`trail-${s.symbol}`} style={{ pointerEvents: 'none' }}>
                    {/* Arrow line */}
                    <line
                      x1={fromX} y1={fromY} x2={curX} y2={curY}
                      stroke={color} strokeWidth={1.5}
                      opacity={lineOpacity}
                      style={{ transition: 'opacity 0.2s ease' }}
                    />
                    {/* Arrowhead */}
                    <polygon
                      points={getArrowheadPoints(fromX, fromY, curX, curY, 6)}
                      fill={color}
                      opacity={headOpacity}
                      style={{ transition: 'opacity 0.2s ease' }}
                    />
                    {/* Ghost dot at previous position */}
                    <circle
                      cx={fromX} cy={fromY} r={3}
                      fill="none" stroke={color} strokeWidth={1}
                      opacity={ghostOpacity}
                      style={{ transition: 'opacity 0.2s ease' }}
                    />
                  </g>
                )
              })}
```

- [ ] **Step 2: Verify build + visual check**

Run: `npm run build`
Expected: Clean build.

Dev server check:
- Toggle TRAILS on → arrows appear from ghost dots to current dots
- Arrows colored by current color mode (quadrant or sector)
- Hover a dot → that arrow brightens, others dim
- Switch vol metric → arrow start positions update
- Switch to 3m period → no arrows visible (prevRet is null)
- Switch back to 12m → arrows return
- Toggle TRAILS off → arrows disappear

- [ ] **Step 3: Commit**

```bash
git add components/MatrixScatter.tsx
git commit -m "feat(matrix): trajectory arrows with hover interaction"
```

---

### Task 8: Component — Efficient frontier rendering + interaction

**Files:**
- Modify: `components/MatrixScatter.tsx` (new SVG layer, frontier tooltip in HTML overlay)

- [ ] **Step 1: Add frontier useMemo computation**

Inside the component, after the `allMcaps` useMemo (around line 340), add:

```typescript
  // Efficient frontier — upper convex hull of visible stocks
  const frontierPath = useMemo(() => {
    if (!showFrontier || !data || data.stocks.length < 3) return null

    const visibleStocks = data.stocks.filter(s => {
      if (colorMode === 'sector' && sectorFilter && s.sector !== sectorFilter) return false
      return true
    })
    if (visibleStocks.length < 3) return null

    const points = visibleStocks.map(s => ({
      x: getVol(s),
      y: s.ret,
    }))

    const hull = computeConvexHull(points)
    if (hull.length < 2) return null

    // Convert to screen coordinates
    const screenPoints = hull.map(p => ({ x: toX(p.x), y: toY(p.y) }))
    return {
      d: catmullRomPath(screenPoints),
      firstPoint: screenPoints[0],
    }
  }, [showFrontier, data, colorMode, sectorFilter, getVol, toX, toY])
```

- [ ] **Step 2: Add frontier SVG layer**

In the SVG, **before** the trajectory arrows block (so frontier renders behind arrows per spec render order). Insert right after the Y-axis RETURN label, before `{/* Trajectory arrows */}`:

```tsx
              {/* Efficient frontier line */}
              {frontierPath && (
                <g>
                  {/* Invisible hit area */}
                  <path
                    d={frontierPath.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                    onMouseEnter={() => setHoveredFrontier(true)}
                    onMouseLeave={() => setHoveredFrontier(false)}
                  />
                  {/* Visible line */}
                  <path
                    d={frontierPath.d}
                    fill="none"
                    stroke="rgba(255,255,255,1)"
                    strokeWidth={1.5}
                    strokeDasharray="4 6"
                    opacity={hoveredFrontier ? 0.3 : 0.12}
                    style={{ pointerEvents: 'none', transition: 'opacity 0.2s ease' }}
                  />
                  {/* Label at leftmost point */}
                  <text
                    x={frontierPath.firstPoint.x - 4}
                    y={frontierPath.firstPoint.y - 8}
                    fill="rgba(255,255,255,0.2)"
                    fontSize="8"
                    fontFamily="'JetBrains Mono', monospace"
                    textAnchor="end"
                    letterSpacing="0.1em"
                    style={{ pointerEvents: 'none' }}
                  >
                    FRONTIER
                  </text>
                </g>
              )}
```

- [ ] **Step 3: Add frontier hover tooltip**

In the HTML overlay area (after the existing stock tooltip block, inside the chart container `<div>`), add:

```tsx
            {/* Frontier tooltip */}
            {hoveredFrontier && frontierPath && (
              <div style={{
                position: 'absolute',
                left: dimensions.width / 2 - 120,
                top: PADDING.top + 10,
                width: 240,
                background: '#0a0a10',
                border: '1px solid #1a1a1a',
                borderLeft: '2px solid rgba(255,255,255,0.2)',
                borderRadius: 6,
                padding: '12px 14px',
                pointerEvents: 'none',
                zIndex: 50,
                animation: 'fadeIn 0.15s ease',
              }}>
                <div style={{
                  fontSize: 10,
                  color: '#888',
                  fontFamily: "'JetBrains Mono', monospace",
                  lineHeight: 1.5,
                }}>
                  Efficient frontier — upper bound of return for given volatility across displayed holdings
                </div>
              </div>
            )}
```

- [ ] **Step 4: Verify build + visual check**

Run: `npm run build`
Expected: Clean build.

Dev server check:
- Toggle FRONTIER on → dashed white curve appears tracing upper-left hull
- "FRONTIER" label at leftmost point
- Hover the line → brightens to 0.3, tooltip appears
- Mouse away → dims back to 0.12, tooltip gone
- Switch vol metric → frontier recalculates
- Activate sector filter → frontier recalculates from visible stocks only
- Filter to <3 stocks → frontier disappears
- Toggle FRONTIER off → line disappears

- [ ] **Step 5: Commit**

```bash
git add components/MatrixScatter.tsx
git commit -m "feat(matrix): efficient frontier line with hover tooltip"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Clean build with zero errors.

- [ ] **Step 2: Visual integration test**

Start `npm run dev` and verify all features work together:

1. Load Matrix with Reports source, 12m period
2. Toggle SECTOR → dots recolor by sector, legend appears
3. Click a sector badge → filter works
4. Toggle TRAILS → arrows appear from ghost positions
5. Toggle FRONTIER → dashed hull line appears
6. Hover a dot → arrow brightens, tooltip shows sector
7. Switch to QUADRANT → sector filter clears, dots recolor to quadrants
8. Switch to 3m → arrows disappear (no trajectory data)
9. Switch back to 12m → arrows return
10. Toggle all overlays off → clean scatter chart
11. Switch to Watchlist source → data reloads, all features still work
12. Switch to Custom → add tickers, features work

- [ ] **Step 3: Commit any fixups if needed**

```bash
git add -A
git commit -m "fix(matrix): integration fixups for sectors, trails, and frontier"
```
