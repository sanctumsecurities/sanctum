# Ticker Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed, auto-scrolling market ticker banner between the nav bar and main content, showing live prices for 7 instruments pulled from Yahoo Finance.

**Architecture:** A new `/api/ticker-band` route fetches 7 symbols in parallel via `yahoo-finance2` and returns structured price/change data. A `TickerBanner` React component mounts in `page.tsx`, polls the route every 60s, and renders a CSS `@keyframes` marquee using doubled content for seamless looping. The existing nav stays at `top: 0 / height: 56px`; the banner sits at `top: 56 / height: 28px`; main content padding shifts from 56 to 84px.

**Tech Stack:** Next.js 14 (App Router), TypeScript, React hooks, yahoo-finance2, CSS keyframes, inline styles.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `app/api/ticker-band/route.ts` | Fetch 7 instruments in parallel, return `TickerItem[]` |
| Modify | `app/page.tsx` | Add `TickerItem` type, `TickerBanner` component, CSS keyframes, mount banner, fix layout |

---

## Task 1: Create `/api/ticker-band` route

**Files:**
- Create: `app/api/ticker-band/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/ticker-band/route.ts` with this exact content:

```typescript
import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

export const dynamic = 'force-dynamic'

const INSTRUMENTS = [
  { symbol: '^GSPC', label: 'S&P 500 (^GSPC)' },
  { symbol: '^IXIC', label: 'NASDAQ (^IXIC)' },
  { symbol: '^DJI', label: 'DOW (^DJI)' },
  { symbol: '^RUT', label: 'RUSSELL (^RUT)' },
  { symbol: '^VIX', label: 'VIX (^VIX)' },
  { symbol: 'GC=F', label: 'GOLD (GC=F)' },
  { symbol: 'CL=F', label: 'OIL (CL=F)' },
]

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

async function fetchInstrument(
  symbol: string,
  label: string
): Promise<{ symbol: string; label: string; price: number; change: number; changePct: number } | null> {
  try {
    const quote = await withTimeout(
      yahooFinance.quote(symbol, {
        fields: ['regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent'] as any,
      }),
      5000
    ) as any
    if (quote?.regularMarketPrice == null) return null
    return {
      symbol,
      label,
      price: quote.regularMarketPrice as number,
      change: (quote.regularMarketChange ?? 0) as number,
      changePct: (quote.regularMarketChangePercent ?? 0) as number,
    }
  } catch {
    return null
  }
}

export async function GET() {
  const results = await Promise.all(
    INSTRUMENTS.map(({ symbol, label }) => fetchInstrument(symbol, label))
  )
  const items = results.filter(Boolean)
  return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } })
}
```

- [ ] **Step 2: Start the dev server and verify the route**

```bash
# In a separate terminal, if not already running:
npm run dev
```

Then in another terminal:
```bash
curl -s http://localhost:3000/api/ticker-band | head -c 500
```

Expected: A JSON array with 7 objects, each like:
```json
[
  {"symbol":"^GSPC","label":"S&P 500 (^GSPC)","price":5218.19,"change":-12.3,"changePct":-0.235},
  ...
]
```
If fewer than 7 items appear, one or more symbols failed — that's fine (graceful degradation). If the array is empty, check that `yahoo-finance2` is installed (`npm ls yahoo-finance2`).

- [ ] **Step 3: Commit**

```bash
git add app/api/ticker-band/route.ts
git commit -m "feat: add /api/ticker-band route for market ticker data"
```

---

## Task 2: Add `TickerBanner` component and CSS to `page.tsx`

**Files:**
- Modify: `app/page.tsx` (add type, component, and CSS — do NOT mount yet)

- [ ] **Step 1: Add the `TickerItem` type**

In `app/page.tsx`, find the `HealthStatus` type near the top of the file (around line 21):

```typescript
type HealthStatus = 'ok' | 'degraded' | 'down'
```

Add the `TickerItem` type immediately after it:

```typescript
type TickerItem = {
  symbol: string
  label: string
  price: number
  change: number
  changePct: number
}
```

- [ ] **Step 2: Add the `TICKER_BAND_INSTRUMENTS` constant**

Find the `TICKER_LIST` constant (around line 449). Add the following immediately before it:

```typescript
const TICKER_BAND_INSTRUMENTS = [
  { symbol: '^GSPC', label: 'S&P 500 (^GSPC)' },
  { symbol: '^IXIC', label: 'NASDAQ (^IXIC)' },
  { symbol: '^DJI', label: 'DOW (^DJI)' },
  { symbol: '^RUT', label: 'RUSSELL (^RUT)' },
  { symbol: '^VIX', label: 'VIX (^VIX)' },
  { symbol: 'GC=F', label: 'GOLD (GC=F)' },
  { symbol: 'CL=F', label: 'OIL (CL=F)' },
]
```

- [ ] **Step 3: Add the `TickerBanner` component**

Find the `Clock` component (around line 40). Add the following immediately after it (after the closing `}` of `Clock`):

```tsx
function TickerBanner() {
  const [items, setItems] = useState<TickerItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/ticker-band')
      if (!res.ok) return
      const data: TickerItem[] = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setItems(data)
        setLoaded(true)
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  const displayItems: TickerItem[] = loaded
    ? items
    : TICKER_BAND_INSTRUMENTS.map(i => ({ ...i, price: 0, change: 0, changePct: 0 }))

  const renderStrip = (keyPrefix: string) =>
    displayItems.map((item, idx) => {
      const isUp = item.change >= 0
      const color = loaded ? (isUp ? '#22c55e' : '#f87171') : '#333'
      const sign = item.change >= 0 ? '+' : ''
      const pctStr = loaded ? `${sign}${item.changePct.toFixed(2)}%` : '\u2014'
      const priceStr = loaded
        ? item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '\u2014'
      const arrow = loaded ? (isUp ? '\u25b2' : '\u25bc') : ''

      return (
        <span
          key={`${keyPrefix}-${item.symbol}-${idx}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingRight: 28 }}
        >
          <span style={{
            color: '#444', fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.12em',
          }}>
            {item.label}
          </span>
          <span style={{ color: '#888', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
            {priceStr}
          </span>
          <span style={{ color, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
            {arrow ? `${arrow} ` : ''}{pctStr}
          </span>
          <span style={{ color: '#1e1e1e', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
            ·
          </span>
        </span>
      )
    })

  return (
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0, zIndex: 99,
      height: 28,
      background: '#080808',
      borderBottom: '1px solid #1a1a1a',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center',
    }}>
      <div
        className="ticker-scroll"
        style={{ display: 'inline-flex', whiteSpace: 'nowrap', alignItems: 'center' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', paddingLeft: 20 }}>
          {renderStrip('a')}
        </span>
        <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', paddingLeft: 20 }}>
          {renderStrip('b')}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add CSS keyframes and class to the `<style>` block**

In `app/page.tsx`, find the `<style>` block (around line 1048). Find the `@keyframes spin` keyframe, which ends with:

```
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
```

Add the following immediately after that closing `}`, before the `@media` rules:

```css
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .ticker-scroll {
          animation: tickerScroll 40s linear infinite;
        }
        .ticker-scroll:hover {
          animation-play-state: paused;
        }
```

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add TickerBanner component and ticker-scroll CSS"
```

---

## Task 3: Mount banner and fix layout

**Files:**
- Modify: `app/page.tsx` (mount `<TickerBanner />`, adjust padding, fix mobile menu)

- [ ] **Step 1: Mount `<TickerBanner />` between nav and main**

In `app/page.tsx`, find the line:

```tsx
      </nav>

      {/* ── Main Content ── */}
      <main style={{ paddingTop: 56 }}>
```

Replace it with:

```tsx
      </nav>

      <TickerBanner />

      {/* ── Main Content ── */}
      <main style={{ paddingTop: 84 }}>
```

- [ ] **Step 2: Fix mobile menu dropdown position**

In `app/page.tsx`, find the mobile menu dropdown (inside the nav, around line 1316):

```tsx
          <div className="mobile-menu" style={{
            position: 'absolute', top: 56, left: 0, right: 0,
```

Change `top: 56` to `top: 84`:

```tsx
          <div className="mobile-menu" style={{
            position: 'absolute', top: 84, left: 0, right: 0,
```

This places the mobile dropdown below the ticker banner instead of overlapping it.

- [ ] **Step 3: Verify visually in the browser**

With `npm run dev` running, open `http://localhost:3000`.

Check:
- [ ] Ticker banner appears as a thin bar immediately below the nav
- [ ] Banner is fixed — stays pinned when you scroll
- [ ] 7 instruments display with label, price, and colored change percentage
- [ ] Prices scroll continuously right-to-left
- [ ] Scrolling pauses when you hover over the banner
- [ ] No content is hidden behind the banner (hero title "sanctum" is fully visible)
- [ ] Switch to Watchlist tab — banner still present
- [ ] On mobile viewport (DevTools): banner still visible, mobile menu opens below the banner

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: mount TickerBanner, fix layout padding and mobile menu offset"
```
