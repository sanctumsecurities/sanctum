# Codebase Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve code quality, error handling, type safety, and performance across the Sanctum codebase without any visible breaking changes.

**Architecture:** Extract components and hooks from the 2091-line `app/page.tsx` into focused files. Deduplicate shared code into `lib/hooks/`. Add error states, timeouts, and input validation at system boundaries. Move constants to module scope where they're recreated per render. No test suite exists, so verification is manual (`npm run build` + visual spot-check).

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, Supabase, Yahoo Finance, Google Gemini

---

## File Structure

### New files to create:
- `components/Clock.tsx` — Isolated 1-second clock component (extracted from page.tsx:43-59)
- `components/MarketStatus.tsx` — NYSE market hours + countdown (extracted from page.tsx:62-259)
- `components/TickerBanner.tsx` — Scrolling market ticker strip (extracted from page.tsx:262-392)
- `components/ReportCard.tsx` — Memoized report card with chart (extracted from page.tsx:394-934)
- `lib/hooks/useMediaQuery.ts` — Shared media query hook (deduplicated from 2 files)
- `lib/hooks/useHoverPopup.ts` — Shared hover popup logic (deduplicated from 3 components)

### Files to modify:
- `app/page.tsx` — Remove extracted components, import from new files
- `components/reports/StockReport.tsx` — Remove local useMediaQuery, import shared
- `components/reports/tabs/OverviewTab.tsx` — Remove local useMediaQuery, import shared
- `components/FearGreedMeter.tsx` — Add error state, use shared hover hook
- `app/actions/generateReport.ts` — Already has timeout (line 630: 120s), no change needed
- `app/api/analyze/route.ts` — Fix API key crash, add timeout to Gemini call
- `app/reports/[ticker]/page.tsx` — Add ticker validation, fix `.single()` → `.maybeSingle()`
- `lib/supabase.ts` — Remove silent placeholder fallback, warn on missing env vars

---

### Task 1: Extract shared `useMediaQuery` hook

**Files:**
- Create: `lib/hooks/useMediaQuery.ts`
- Modify: `components/reports/StockReport.tsx:145-155`
- Modify: `components/reports/tabs/OverviewTab.tsx:13-23`

- [ ] **Step 1: Create the shared hook file**

```ts
// lib/hooks/useMediaQuery.ts
'use client'

import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}
```

- [ ] **Step 2: Replace in StockReport.tsx**

Remove lines 145-155 (the local `useMediaQuery` function definition). Add import at the top:

```ts
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
```

- [ ] **Step 3: Replace in OverviewTab.tsx**

Remove lines 13-23 (the local `useMediaQuery` function definition). Add import:

```ts
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/useMediaQuery.ts components/reports/StockReport.tsx components/reports/tabs/OverviewTab.tsx
git commit -m "refactor: deduplicate useMediaQuery into shared hook"
```

---

### Task 2: Extract shared `useHoverPopup` hook

The exact same hover popup pattern (enter timer, leave timer, fade-out timer, callbacks) is repeated in `FearGreedMeter.tsx`, `MarketStatus` (page.tsx:62-259), and the health popup (page.tsx:968-1219). Extract once.

**Files:**
- Create: `lib/hooks/useHoverPopup.ts`
- Modify: `components/FearGreedMeter.tsx`

- [ ] **Step 1: Create the shared hook**

```ts
// lib/hooks/useHoverPopup.ts
'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export function useHoverPopup(enterDelay = 200, leaveDelay = 100, fadeDuration = 150) {
  const [showPopup, setShowPopup] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const hoverEnterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (hoverEnterTimer.current) clearTimeout(hoverEnterTimer.current)
      if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current)
      if (fadeOutTimer.current) clearTimeout(fadeOutTimer.current)
    }
  }, [])

  const startFadeOut = useCallback(() => {
    setFadingOut(true)
    fadeOutTimer.current = setTimeout(() => {
      setShowPopup(false)
      setFadingOut(false)
    }, fadeDuration)
  }, [fadeDuration])

  const cancelFadeOut = useCallback(() => {
    if (fadeOutTimer.current) {
      clearTimeout(fadeOutTimer.current)
      fadeOutTimer.current = null
    }
    setFadingOut(false)
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (hoverLeaveTimer.current) {
      clearTimeout(hoverLeaveTimer.current)
      hoverLeaveTimer.current = null
    }
    cancelFadeOut()
    if (!showPopup) {
      hoverEnterTimer.current = setTimeout(() => setShowPopup(true), enterDelay)
    }
  }, [showPopup, cancelFadeOut, enterDelay])

  const handleMouseLeave = useCallback(() => {
    if (hoverEnterTimer.current) {
      clearTimeout(hoverEnterTimer.current)
      hoverEnterTimer.current = null
    }
    hoverLeaveTimer.current = setTimeout(startFadeOut, leaveDelay)
  }, [startFadeOut, leaveDelay])

  const handlePopupMouseEnter = useCallback(() => {
    if (hoverLeaveTimer.current) {
      clearTimeout(hoverLeaveTimer.current)
      hoverLeaveTimer.current = null
    }
    cancelFadeOut()
  }, [cancelFadeOut])

  const handlePopupMouseLeave = useCallback(() => {
    startFadeOut()
  }, [startFadeOut])

  return {
    showPopup,
    fadingOut,
    handleMouseEnter,
    handleMouseLeave,
    handlePopupMouseEnter,
    handlePopupMouseLeave,
  }
}
```

- [ ] **Step 2: Refactor FearGreedMeter to use the shared hook**

In `components/FearGreedMeter.tsx`, remove the manual timer state/refs/callbacks (lines 39-106) and replace with:

```ts
import { useHoverPopup } from '@/lib/hooks/useHoverPopup'

// Inside the component, replace the 6 state/ref lines and 6 callback definitions with:
const {
  showPopup, fadingOut,
  handleMouseEnter, handleMouseLeave,
  handlePopupMouseEnter, handlePopupMouseLeave,
} = useHoverPopup()
```

Keep the `data`, `refreshing`, and `fetchData` state/logic unchanged — only the hover popup boilerplate is replaced.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. FearGreedMeter hover popup works identically.

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/useHoverPopup.ts components/FearGreedMeter.tsx
git commit -m "refactor: extract shared useHoverPopup hook, apply to FearGreedMeter"
```

---

### Task 3: Add error state to FearGreedMeter

**Files:**
- Modify: `components/FearGreedMeter.tsx:46-55`

- [ ] **Step 1: Add error state and update fetchData**

Add an `error` state and update the fetch function to set it on failure instead of silently swallowing:

```ts
const [error, setError] = useState(false)

const fetchData = useCallback(async () => {
  try {
    const res = await fetch('/api/fear-greed')
    if (!res.ok) { setError(true); return }
    const json = await res.json()
    if (typeof json.score === 'number') {
      setData(json)
      setError(false)
    }
  } catch {
    setError(true)
  }
}, [])
```

- [ ] **Step 2: Update the null-data return to show error vs loading**

Replace the existing `if (!data)` block (lines 108-127) with:

```tsx
if (!data) {
  return (
    <div id="fear-greed-meter" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
        color: error ? '#ef4444' : '#555',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {error ? 'F&G UNAVAILABLE' : '\u2014'}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. When the Fear & Greed API is down, users see "F&G UNAVAILABLE" in red instead of a dash.

- [ ] **Step 4: Commit**

```bash
git add components/FearGreedMeter.tsx
git commit -m "fix: show error state in FearGreedMeter instead of silent failure"
```

---

### Task 4: Extract Clock, MarketStatus, TickerBanner from page.tsx

This is the largest task — extracting ~600 lines from the monolith. Each component is self-contained (no shared state with Home beyond props).

**Files:**
- Create: `components/Clock.tsx`
- Create: `components/MarketStatus.tsx`
- Create: `components/TickerBanner.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create Clock.tsx**

```tsx
// components/Clock.tsx
'use client'

import { useState, useEffect } from 'react'

export default function Clock({ format }: { format: '12h' | '24h' }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ fontSize: 14, color: '#666', fontFamily: "'JetBrains Mono', monospace" }}>
      {time.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      }) + ', ' + time.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: format === '12h',
      })}
    </span>
  )
}
```

- [ ] **Step 2: Create MarketStatus.tsx**

Copy the entire `MarketStatus` function (page.tsx lines 62-259) into `components/MarketStatus.tsx`. Key change: **move `NYSE_HOLIDAYS` to module scope** (outside the component) so it's not recreated every render.

The file structure:

```tsx
// components/MarketStatus.tsx
'use client'

import { useState, useEffect } from 'react'
import { useHoverPopup } from '@/lib/hooks/useHoverPopup'

// Module-level constant — created once, not on every render
const NYSE_HOLIDAYS = new Set([
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])

export default function MarketStatus() {
  // ... exact same component body, but:
  // 1. Remove NYSE_HOLIDAYS from inside the function (it's now at module scope)
  // 2. Replace manual hover timer state/refs/callbacks with useHoverPopup()
  // Keep all the market hours calculation logic unchanged
}
```

Replace the 6 manual hover refs/state/callbacks with:
```ts
const {
  showPopup, fadingOut,
  handleMouseEnter, handleMouseLeave,
  handlePopupMouseEnter, handlePopupMouseLeave,
} = useHoverPopup()
```

- [ ] **Step 3: Create TickerBanner.tsx**

Copy the `TickerBanner` function (page.tsx lines 292-392) plus its supporting constants into `components/TickerBanner.tsx`:

```tsx
// components/TickerBanner.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'

// Move these constants here from page.tsx
const TICKER_BAND_INSTRUMENTS = [
  { symbol: '^GSPC', label: 'S&P 500 (^GSPC)' },
  { symbol: '^IXIC', label: 'NASDAQ (^IXIC)' },
  { symbol: '^DJI', label: 'DOW (^DJI)' },
  { symbol: '^RUT', label: 'RUSSELL (^RUT)' },
  { symbol: '^VIX', label: 'VIX (^VIX)' },
  { symbol: 'GC=F', label: 'GOLD (GC=F)' },
  { symbol: 'CL=F', label: 'OIL (CL=F)' },
]

export const DEFAULT_BANNER_TICKERS = TICKER_BAND_INSTRUMENTS.map(i => i.symbol)

const BANNER_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TICKER_BAND_INSTRUMENTS.map(({ symbol, label }) => [symbol, label])
)

type TickerItem = {
  symbol: string
  label: string
  price: number
  change: number
  changePct: number
}

interface TickerBannerProps {
  speed: number
  updateFreq: number
  tickers: string[]
  hoverPause: boolean
}

export default function TickerBanner({ speed, updateFreq, tickers, hoverPause }: TickerBannerProps) {
  // ... exact same component body as page.tsx lines 299-391
}
```

- [ ] **Step 4: Update page.tsx imports**

Remove the extracted code (lines 42-392) and the constants that moved. Add imports at the top of page.tsx:

```ts
import Clock from '@/components/Clock'
import MarketStatus from '@/components/MarketStatus'
import TickerBanner, { DEFAULT_BANNER_TICKERS } from '@/components/TickerBanner'
```

Remove the `TickerItem` type from page.tsx (it moved to TickerBanner.tsx). Keep the `BANNER_SPEED_SECS` constant in page.tsx since it's used in the Home component's settings logic.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds. All three components render identically.

- [ ] **Step 6: Commit**

```bash
git add components/Clock.tsx components/MarketStatus.tsx components/TickerBanner.tsx app/page.tsx
git commit -m "refactor: extract Clock, MarketStatus, TickerBanner from page.tsx"
```

---

### Task 5: Extract ReportCard from page.tsx

**Files:**
- Create: `components/ReportCard.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create ReportCard.tsx**

Move the `ReportCard` component (page.tsx lines 394-934) plus its supporting types/constants into `components/ReportCard.tsx`:

```tsx
// components/ReportCard.tsx
'use client'

import { useState, useCallback, useMemo, memo } from 'react'
import { useRouter } from 'next/navigation'

// Move SavedReport interface here (from page.tsx:15-22)
export interface SavedReport {
  id: string
  ticker: string
  data: any
  created_by: string
  created_by_email: string | null
  created_at: string
}

const PERIODS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y'] as const
type Period = typeof PERIODS[number]

const etFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

// ... rest of ReportCardProps interface and ReportCard component (exact copy)

export default ReportCard
```

- [ ] **Step 2: Update page.tsx**

Remove the ReportCard component, SavedReport interface, PERIODS, etFormatter from page.tsx. Add imports:

```ts
import ReportCard from '@/components/ReportCard'
import type { SavedReport } from '@/components/ReportCard'
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. Report cards render identically with charts, period switching, tooltips.

- [ ] **Step 4: Commit**

```bash
git add components/ReportCard.tsx app/page.tsx
git commit -m "refactor: extract ReportCard component from page.tsx"
```

---

### Task 6: Fix analyze API route — API key crash + add Gemini timeout

**Files:**
- Modify: `app/api/analyze/route.ts:5, 177`

- [ ] **Step 1: Fix the non-null assertion crash on API key**

Replace line 5:

```ts
// Before:
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// After: lazy init — fails with clear error at request time, not at module load
function getGenAI() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not configured')
  return new GoogleGenerativeAI(key)
}
```

Update the usage (around line 120) from `genAI.getGenerativeModel(...)` to `getGenAI().getGenerativeModel(...)`.

- [ ] **Step 2: Add timeout to the Gemini call**

Import `withTimeout` and wrap the AI call:

```ts
import { withTimeout } from '@/lib/utils'

// Replace the direct model.generateContent(prompt) call with:
const aiResult = await withTimeout(model.generateContent(prompt), 90_000)
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. Analyze endpoint now returns a clear 500 error if GEMINI_API_KEY is missing, and times out after 90s.

- [ ] **Step 4: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "fix: prevent API key crash and add 30s timeout to analyze route"
```

---

### Task 7: Add ticker validation + fix Supabase `.single()` on report page

**Files:**
- Modify: `app/reports/[ticker]/page.tsx:11, 24-29`

- [ ] **Step 1: Add ticker validation**

After line 11 (`const ticker = ...`), add validation:

```tsx
const ticker = (params.ticker as string).toUpperCase()

// Validate ticker format
if (!/^[A-Z0-9.\-^=]{1,20}$/.test(ticker)) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#ef4444', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>
        Invalid ticker symbol.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Fix `.single()` to `.maybeSingle()`**

Replace line 28 (`.single()`) with `.maybeSingle()` so missing rows don't throw:

```ts
const loadWatchlist = async (userId: string) => {
  const { data } = await supabase
    .from('user_settings')
    .select('watchlist')
    .eq('user_id', userId)
    .maybeSingle()
  if (data?.watchlist) setWatchlist(data.watchlist)
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. `/reports/!!!` shows "Invalid ticker symbol" instead of crashing.

- [ ] **Step 4: Commit**

```bash
git add app/reports/[ticker]/page.tsx
git commit -m "fix: validate ticker input and use maybeSingle for watchlist query"
```

---

### Task 8: Fix Supabase placeholder fallback

**Files:**
- Modify: `lib/supabase.ts`

- [ ] **Step 1: Remove silent placeholder and add warning**

Replace the entire file:

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing — database features will not work')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)
```

The fallback values are still needed for build time (Next.js static analysis), but we now log a visible warning instead of silently connecting to nothing.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. If env vars are set, no warning. If missing, a clear console warning appears.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase.ts
git commit -m "fix: warn when Supabase env vars are missing instead of silent failure"
```

---

### Task 9: Apply useHoverPopup to MarketStatus and Health popup in page.tsx

After Task 4 extracted MarketStatus, this task wires up the shared hook to the health popup that remains in page.tsx.

**Files:**
- Modify: `app/page.tsx` (health popup section, ~lines 968-1219)

- [ ] **Step 1: Replace health popup boilerplate in Home component**

In the `Home` component, remove the health popup hover state/refs/callbacks:
- Remove: `showHealthPopup`, `healthPopupFadingOut` state
- Remove: `healthHoverEnterTimer`, `healthHoverLeaveTimer`, `healthFadeOutTimer` refs
- Remove: `startFadeOut`, `cancelFadeOut`, `handleStatusMouseEnter`, `handleStatusMouseLeave`, `handlePopupMouseEnter`, `handlePopupMouseLeave` callbacks
- Remove: The cleanup useEffect for health timers

Replace with:

```ts
import { useHoverPopup } from '@/lib/hooks/useHoverPopup'

// Inside Home():
const {
  showPopup: showHealthPopup,
  fadingOut: healthPopupFadingOut,
  handleMouseEnter: handleStatusMouseEnter,
  handleMouseLeave: handleStatusMouseLeave,
  handlePopupMouseEnter: handlePopupMouseEnter,
  handlePopupMouseLeave: handlePopupMouseLeave,
} = useHoverPopup()
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. Health popup hover behavior unchanged.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "refactor: use shared useHoverPopup for health popup in page.tsx"
```

---

### Task 10: Final build verification

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: Clean build, no errors, no new warnings.

- [ ] **Step 2: Dev server smoke test**

Run: `npm run dev`

Manually verify:
1. Dashboard loads, ticker banner scrolls, clock ticks
2. MarketStatus shows correct phase and countdown
3. Fear & Greed meter displays score
4. Health popup appears on hover over status indicator
5. Report cards render with charts
6. Navigating to `/reports/AAPL` loads the report page
7. Navigating to `/reports/!!!` shows "Invalid ticker symbol"

- [ ] **Step 3: Commit any remaining fixes**

If any issues found, fix and commit.
