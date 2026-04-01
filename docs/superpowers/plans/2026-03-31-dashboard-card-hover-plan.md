# Dashboard Card Hover Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hover-expand cards with AI highlights, interactive sparkline with crosshair tooltip, and after-hours pricing to the dashboard.

**Architecture:** The `/api/chart` endpoint is extended to return timestamped price points and after-hours quote data. The dashboard page (`app/page.tsx`) consumes the new data format, adds a scale-overlay hover expansion with AI highlights, an interactive SVG sparkline with mouse tracking, and conditional after-hours pricing display.

**Tech Stack:** Next.js (App Router), React, yahoo-finance2, inline styles, SVG

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/api/chart/route.ts` | Modify | Return `{ time, price }` points + `afterHours` data from Yahoo Finance |
| `app/page.tsx` | Modify | Consume new data format, hover expansion, interactive chart, after-hours display |

---

### Task 1: Update `/api/chart` to return timestamps and after-hours data

**Files:**
- Modify: `app/api/chart/route.ts`

- [ ] **Step 1: Rewrite the GET handler to return timestamped points + afterHours**

Replace the entire content of `app/api/chart/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

export async function GET(req: NextRequest) {
  try {
    const ticker = req.nextUrl.searchParams.get('ticker')
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
    }

    const symbol = ticker.toUpperCase().trim()

    const [chartResult, quoteResult] = await Promise.all([
      yahooFinance.chart(symbol, {
        period1: new Date(Date.now() - 24 * 60 * 60 * 1000),
        period2: new Date(),
        interval: '5m' as any,
      }),
      yahooFinance.quote(symbol),
    ])

    const points = (chartResult.quotes || [])
      .filter((q: any) => q.close != null && q.date != null)
      .map((q: any) => ({
        time: new Date(q.date).toISOString(),
        price: q.close as number,
      }))

    // Build after-hours data
    let afterHours: { price: number; change: number; changePct: number; label: string } | null = null
    const marketState = (quoteResult as any).marketState as string | undefined

    if (marketState === 'POST' || marketState === 'CLOSED') {
      const postPrice = (quoteResult as any).postMarketPrice as number | undefined
      const postChange = (quoteResult as any).postMarketChange as number | undefined
      const postChangePct = (quoteResult as any).postMarketChangePercent as number | undefined
      if (postPrice != null && postChange != null && postChangePct != null) {
        afterHours = { price: postPrice, change: postChange, changePct: postChangePct, label: 'After Hours' }
      }
    } else if (marketState === 'PRE') {
      const prePrice = (quoteResult as any).preMarketPrice as number | undefined
      const preChange = (quoteResult as any).preMarketChange as number | undefined
      const preChangePct = (quoteResult as any).preMarketChangePercent as number | undefined
      if (prePrice != null && preChange != null && preChangePct != null) {
        afterHours = { price: prePrice, change: preChange, changePct: preChangePct, label: 'Pre-Market' }
      }
    }

    return NextResponse.json({ ticker: symbol, points, afterHours })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch chart' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify the endpoint works**

Run the dev server (`npm run dev`) and visit:
```
http://localhost:3000/api/chart?ticker=AAPL
```

Expected: JSON response with `points` as array of `{ time: "2026-...", price: 185.2 }` objects, and `afterHours` as either `null` or an object with `price`, `change`, `changePct`, `label`.

- [ ] **Step 3: Commit**

```bash
git add app/api/chart/route.ts
git commit -m "feat: return timestamps and after-hours data from chart API"
```

---

### Task 2: Update `chartData` state type and fetch logic in `page.tsx`

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add the ChartDataEntry interface and update state type**

At the top of the `Home` component (after the state declarations around line 33), find:

```ts
const [chartData, setChartData] = useState<Record<string, number[]>>({})
```

Replace with:

```ts
const [chartData, setChartData] = useState<Record<string, { points: { time: string; price: number }[]; afterHours: { price: number; change: number; changePct: number; label: string } | null }>>({})
```

- [ ] **Step 2: Update the chart data fetch handler**

Find the `useEffect` that fetches chart data (around line 80-94). Replace:

```ts
  // ── Fetch 1-day chart data for report tickers ──
  useEffect(() => {
    if (savedReports.length === 0) return
    const tickers = [...new Set(savedReports.map(r => r.ticker))]
    tickers.forEach(ticker => {
      if (chartData[ticker]) return
      fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}`)
        .then(r => r.json())
        .then(res => {
          if (res.points?.length) {
            setChartData(prev => ({ ...prev, [ticker]: res.points }))
          }
        })
        .catch(() => {})
    })
  }, [savedReports]) // eslint-disable-line react-hooks/exhaustive-deps
```

With:

```ts
  // ── Fetch 1-day chart data for report tickers ──
  useEffect(() => {
    if (savedReports.length === 0) return
    const tickers = [...new Set(savedReports.map(r => r.ticker))]
    tickers.forEach(ticker => {
      if (chartData[ticker]) return
      fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}`)
        .then(r => r.json())
        .then(res => {
          if (res.points?.length) {
            setChartData(prev => ({ ...prev, [ticker]: { points: res.points, afterHours: res.afterHours || null } }))
          }
        })
        .catch(() => {})
    })
  }, [savedReports]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Update existing sparkline to use new data shape**

The existing sparkline code (around line 718) does `const pts = chartData[report.ticker]` which now returns `{ points, afterHours }` instead of `number[]`. Update this single line to keep the app functional. Find:

```ts
                            const pts = chartData[report.ticker]
```

Replace with:

```ts
                            const pts = chartData[report.ticker]?.points?.map(p => p.price)
```

This is a temporary bridge — Task 5 will replace the entire sparkline block.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: update chartData state to hold timestamps and after-hours data"
```

---

### Task 3: Add after-hours pricing display to cards

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add after-hours data extraction inside the card map**

Inside the `savedReports.map(report => { ... })` block (around line 560), find the line:

```ts
const isUp = priceChange !== null && priceChange >= 0
```

Add immediately after it:

```ts
                    const tickerChart = chartData[report.ticker]
                    const ah = tickerChart?.afterHours || null
```

- [ ] **Step 2: Add after-hours display below the price section**

Find the closing `</div>` of the price section (the `marginBottom: 14` div, around line 662). This is the div that starts with `{/* Price */}`. After the closing `</div>` of that section, add:

```tsx
                        {/* After Hours / Pre-Market */}
                        {ah && (
                          <div style={{ marginBottom: 10, marginTop: -8 }}>
                            <span style={{
                              fontSize: 11, color: '#555',
                              fontFamily: "'JetBrains Mono', monospace",
                            }}>
                              {ah.label}:
                            </span>
                            <span style={{
                              fontSize: 11, color: '#999',
                              fontFamily: "'JetBrains Mono', monospace",
                              marginLeft: 6,
                            }}>
                              ${ah.price.toFixed(2)}
                            </span>
                            <span style={{
                              fontSize: 11,
                              fontFamily: "'JetBrains Mono', monospace",
                              marginLeft: 6,
                              color: ah.change >= 0 ? '#22c55e' : '#f87171',
                            }}>
                              {ah.change >= 0 ? '+' : ''}{ah.changePct.toFixed(2)}%
                            </span>
                          </div>
                        )}
```

- [ ] **Step 3: Verify in browser**

Run dev server, load the dashboard. If the market is currently in after-hours or pre-market, you should see the secondary pricing line below the main price on each card. If the market is open, the line should be absent.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: display after-hours and pre-market pricing on dashboard cards"
```

---

### Task 4: Add card hover expansion with AI highlights

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update the card container styles and hover handlers**

Find the card's outer `<div>` (around line 585) with its current inline styles and hover handlers. Replace this entire block:

```tsx
                      <div
                        key={report.id}
                        style={{
                          background: '#0f0f0f',
                          border: '1px solid #1a1a1a',
                          borderRadius: 6,
                          padding: 20,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex', flexDirection: 'column',
                          aspectRatio: '1 / 1',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget).style.borderColor = '#2a2a2a'
                          ;(e.currentTarget).style.background = '#111'
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget).style.borderColor = '#1a1a1a'
                          ;(e.currentTarget).style.background = '#0f0f0f'
                        }}
                        onClick={() => { setCurrentReport(report); setShowReport(true) }}
                      >
```

With:

```tsx
                      <div
                        key={report.id}
                        style={{
                          background: '#0f0f0f',
                          border: '1px solid #1a1a1a',
                          borderRadius: 6,
                          padding: 20,
                          cursor: 'pointer',
                          transition: 'all 250ms cubic-bezier(0.2, 0, 0, 1)',
                          display: 'flex', flexDirection: 'column',
                          aspectRatio: '1 / 1',
                          position: 'relative',
                          transformOrigin: (() => {
                            const colCount = 4
                            const col = savedReports.indexOf(report) % colCount
                            if (col === 0) return 'left center'
                            if (col === colCount - 1) return 'right center'
                            return 'center center'
                          })(),
                        }}
                        onMouseEnter={e => {
                          const el = e.currentTarget
                          el.style.transform = 'scale(1.15)'
                          el.style.zIndex = '10'
                          el.style.boxShadow = '0 12px 40px rgba(0,0,0,0.6)'
                          el.style.borderColor = '#3a3a3a'
                          el.style.background = '#111'
                          const highlights = el.querySelector('[data-highlights]') as HTMLElement | null
                          if (highlights) highlights.style.opacity = '1'
                        }}
                        onMouseLeave={e => {
                          const el = e.currentTarget
                          el.style.transform = 'scale(1)'
                          el.style.zIndex = '0'
                          el.style.boxShadow = 'none'
                          el.style.borderColor = '#1a1a1a'
                          el.style.background = '#0f0f0f'
                          const highlights = el.querySelector('[data-highlights]') as HTMLElement | null
                          if (highlights) highlights.style.opacity = '0'
                        }}
                        onClick={() => { setCurrentReport(report); setShowReport(true) }}
                      >
```

- [ ] **Step 2: Add AI highlights section before the footer**

Find the `{/* Footer: Date | Created by + Remove */}` comment (around line 757). Immediately before it, add:

```tsx
                        {/* AI Highlights (visible on hover) */}
                        {report.ai?.overview?.highlights?.length > 0 && (
                          <div
                            data-highlights
                            style={{
                              opacity: 0,
                              transition: 'opacity 250ms ease',
                              marginTop: 10,
                              marginBottom: 6,
                            }}
                          >
                            <div style={{
                              fontSize: 10, color: '#444',
                              fontFamily: "'JetBrains Mono', monospace",
                              letterSpacing: '0.08em',
                              marginBottom: 6,
                            }}>
                              HIGHLIGHTS
                            </div>
                            {(report.ai.overview.highlights as { icon: string; text: string }[]).slice(0, 3).map((h, i) => (
                              <div key={i} style={{
                                display: 'flex', gap: 6, alignItems: 'center',
                                fontSize: 11, color: '#777',
                                fontFamily: "'DM Sans', sans-serif",
                                lineHeight: 1.3,
                                marginBottom: 3,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                <span style={{ flexShrink: 0, fontSize: 12 }}>{h.icon}</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
```

- [ ] **Step 3: Add responsive transform-origin overrides in the style block**

Find the existing `<style>` block (around line 268). Inside the `@media (max-width: 768px)` rule, add:

```css
.reports-grid > div { transform-origin: center center !important; }
```

Inside the `@media (min-width: 769px) and (max-width: 1200px)` rule, add:

```css
.reports-grid > div:nth-child(3n+1) { transform-origin: left center !important; }
.reports-grid > div:nth-child(3n) { transform-origin: right center !important; }
```

So the two media query blocks become:

```css
@media (max-width: 768px) {
  .nav-links-desktop { display: none !important; }
  .hamburger-btn { display: flex !important; }
  .hero-title { font-size: 36px !important; letter-spacing: 0.2em !important; }
  .main-content { padding-left: 24px !important; padding-right: 24px !important; }
  .nav-inner { padding-left: 20px !important; padding-right: 20px !important; }
  .reports-grid { grid-template-columns: 1fr 1fr !important; }
  .reports-grid > div { transform-origin: center center !important; }
}
@media (min-width: 769px) and (max-width: 1200px) {
  .reports-grid { grid-template-columns: repeat(3, 1fr) !important; }
  .reports-grid > div:nth-child(3n+1) { transform-origin: left center !important; }
  .reports-grid > div:nth-child(3n) { transform-origin: right center !important; }
}
```

- [ ] **Step 4: Verify in browser**

Hover over a card. It should scale up 1.15x, lift with shadow, brighten border, and reveal the HIGHLIGHTS section with up to 3 bullet points. Moving the mouse away should smoothly reverse all effects.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add hover-expand cards with AI highlights and edge-aware scaling"
```

---

### Task 5: Add interactive sparkline chart with crosshair tooltip

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace the static sparkline rendering with an interactive version**

Find the `{/* 1-Day Sparkline Chart */}` section (around line 715-755). Replace the entire block from `{/* 1-Day Sparkline Chart */}` through its closing `</div>` with:

```tsx
                        {/* 1-Day Sparkline Chart */}
                        <div
                          style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', position: 'relative' }}
                          onMouseMove={e => {
                            const container = e.currentTarget
                            const rect = container.getBoundingClientRect()
                            const crosshair = container.querySelector('[data-crosshair]') as HTMLElement | null
                            const dot = container.querySelector('[data-dot]') as HTMLElement | null
                            const tip = container.querySelector('[data-tip]') as HTMLElement | null
                            const pts = tickerChart?.points
                            if (!crosshair || !dot || !tip || !pts || pts.length < 2) return

                            const x = e.clientX - rect.left
                            const pct = Math.max(0, Math.min(1, x / rect.width))
                            const idx = Math.round(pct * (pts.length - 1))
                            const pt = pts[idx]
                            const openPrice = pts[0].price
                            const changeFromOpen = openPrice > 0 ? ((pt.price - openPrice) / openPrice) * 100 : 0
                            const isChartUp = pt.price >= openPrice

                            const min = Math.min(...pts.map(p => p.price))
                            const max = Math.max(...pts.map(p => p.price))
                            const range = max - min || 1
                            const yPct = 1 - (pt.price - min) / range
                            const dotY = yPct * rect.height

                            crosshair.style.left = `${x}px`
                            crosshair.style.display = 'block'
                            dot.style.left = `${x}px`
                            dot.style.top = `${dotY}px`
                            dot.style.display = 'block'
                            dot.style.background = isChartUp ? '#22c55e' : '#f87171'

                            const timeStr = new Date(pt.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                            const changeStr = `${changeFromOpen >= 0 ? '+' : ''}${changeFromOpen.toFixed(2)}%`
                            const changeColor = changeFromOpen >= 0 ? '#22c55e' : '#f87171'

                            tip.innerHTML = `<div style="font-size:10px;color:#555;margin-bottom:2px">${timeStr}</div><div><span style="color:#fff;font-weight:600">$${pt.price.toFixed(2)}</span> <span style="color:${changeColor}">${changeStr}</span></div>`
                            tip.style.display = 'block'
                            const tipLeft = Math.max(0, Math.min(x - 50, rect.width - 110))
                            tip.style.left = `${tipLeft}px`
                          }}
                          onMouseLeave={e => {
                            const container = e.currentTarget
                            const crosshair = container.querySelector('[data-crosshair]') as HTMLElement | null
                            const dot = container.querySelector('[data-dot]') as HTMLElement | null
                            const tip = container.querySelector('[data-tip]') as HTMLElement | null
                            if (crosshair) crosshair.style.display = 'none'
                            if (dot) dot.style.display = 'none'
                            if (tip) tip.style.display = 'none'
                          }}
                        >
                          {(() => {
                            const pts = tickerChart?.points
                            if (!pts || pts.length < 2) return (
                              <div style={{
                                width: '100%', height: '100%', minHeight: 40,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <span style={{ fontSize: 10, color: '#222', fontFamily: "'JetBrains Mono', monospace" }}>
                                  loading chart...
                                </span>
                              </div>
                            )
                            const prices = pts.map(p => p.price)
                            const min = Math.min(...prices)
                            const max = Math.max(...prices)
                            const range = max - min || 1
                            const w = 300
                            const h = 80
                            const pad = 2
                            const linePoints = prices.map((v, i) => {
                              const x = (i / (prices.length - 1)) * w
                              const y = pad + (1 - (v - min) / range) * (h - pad * 2)
                              return `${x},${y}`
                            }).join(' ')
                            const fillPoints = `0,${h} ${linePoints} ${w},${h}`
                            const up = prices[prices.length - 1] >= prices[0]
                            const strokeColor = up ? '#22c55e' : '#f87171'
                            const fillColor = up ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)'
                            return (
                              <svg
                                viewBox={`0 0 ${w} ${h}`}
                                preserveAspectRatio="none"
                                style={{ width: '100%', height: '100%', minHeight: 40, display: 'block' }}
                              >
                                <polygon points={fillPoints} fill={fillColor} />
                                <polyline points={linePoints} fill="none" stroke={strokeColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                              </svg>
                            )
                          })()}

                          {/* Crosshair line */}
                          <div data-crosshair style={{
                            display: 'none', position: 'absolute', top: 0, bottom: 0, width: 1,
                            background: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
                          }} />

                          {/* Snap dot */}
                          <div data-dot style={{
                            display: 'none', position: 'absolute', width: 8, height: 8, borderRadius: '50%',
                            transform: 'translate(-50%, -50%)', pointerEvents: 'none',
                            boxShadow: '0 0 6px rgba(255,255,255,0.3)',
                          }} />

                          {/* Tooltip */}
                          <div data-tip style={{
                            display: 'none', position: 'absolute', top: -42, width: 110,
                            background: 'rgba(10,10,10,0.95)', border: '1px solid #1a1a1a',
                            borderRadius: 8, padding: '6px 8px',
                            fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                            pointerEvents: 'none', zIndex: 5,
                          }} />
                        </div>
```

- [ ] **Step 2: Verify in browser**

Hover over a card, then hover specifically over the sparkline chart area. You should see:
- A vertical crosshair line following your mouse
- A dot snapping to the price curve
- A tooltip above showing time, price, and change from open (colored green/red)

Moving the mouse away from the chart area should hide all interactive elements.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add interactive sparkline chart with crosshair tooltip"
```

---

### Task 6: Final integration verification

- [ ] **Step 1: Full browser test**

Run `npm run dev` and verify all three features work together:

1. **Hover expansion**: Hover over a card — it scales up 1.15x, shadow lifts, border brightens, HIGHLIGHTS section fades in with up to 3 bullet points
2. **Interactive chart**: While hovering a card, move the mouse over the sparkline — crosshair, dot, and tooltip appear showing time, price, and change from open
3. **After-hours pricing**: If outside market hours, verify the "After Hours: $X.XX +Y.YY%" or "Pre-Market:" line appears below the main price. If during market hours, verify it's absent.
4. **Edge handling**: Hover cards in the leftmost and rightmost columns — they should expand inward
5. **Card click**: Clicking a card should still navigate to the full report view
6. **Responsive**: Resize to tablet (769-1200px) and mobile (<768px) widths — cards should still hover correctly

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: No TypeScript errors, clean build.

- [ ] **Step 3: Final commit (if any cleanup needed)**

```bash
git add app/page.tsx
git commit -m "fix: address integration issues from hover feature testing"
```

Only needed if Step 1 or 2 revealed issues that needed fixing.
