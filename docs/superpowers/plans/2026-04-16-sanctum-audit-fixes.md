# Sanctum Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply audit findings 1,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,28,29 — improving security, API cost, data integrity, and type safety without breaking existing functionality.

**Architecture:** Organized from simplest (deletions, one-liners) to most complex (auth guard, prompt caching, watchlist migration). Every task is independently deployable. No shared state between tasks. One new package required: `@supabase/ssr` for the server-action auth guard.

**Tech Stack:** Next.js 14 App Router, `@anthropic-ai/sdk` 0.90, `@supabase/supabase-js` 2.45, `@supabase/ssr` (new), TypeScript

---

## Critical Schema Note

The `reports` RLS DELETE policy is:
```sql
using (auth.uid() is not null)  -- any logged-in user can delete ANY report
```
This must be fixed in Supabase. The corrected policy is included in Task 4.

The `user_settings` table has only `(user_id, settings jsonb, updated_at)` — there is **no `watchlist` column**. The report page's `select('watchlist')` call silently returns null. The localStorage watchlist in `app/page.tsx` is the only working watchlist. Task 14 fixes this.

---

## File Map

| File | Changed by Tasks |
|------|-----------------|
| `app/api/chart/` (directory) | Task 1 — DELETE |
| `lib/tickers.ts` | Task 1 — DELETE |
| `components/ReportCard.tsx` | Tasks 2, 18 |
| `app/api/ticker-band/route.ts` | Task 3 |
| `lib/hooks/useMediaQuery.ts` | Task 4 |
| `lib/supabase.ts` | Task 5 |
| `app/page.tsx` | Tasks 6, 16, 19 |
| `lib/supabase-server.ts` | Task 7 — CREATE |
| `app/actions/generateReport.ts` | Tasks 7, 10, 11, 12, 13, 15, 16, 17, 20, 21 |
| `app/api/health/route.ts` | Task 8 |
| `lib/anthropic.ts` | Task 8 — CREATE |
| `lib/macroContext.ts` | Task 9 |
| `app/api/ticker-search/route.ts` | Task 10 |
| `app/api/portfolio-snapshot/route.ts` | Task 11 |
| `components/SectorHeatmap.tsx` | Task 12 |
| `app/api/sector-heatmap/route.ts` | Task 12 |
| `app/reports/[ticker]/page.tsx` | Tasks 13, 14 |
| `components/reports/StockReport.tsx` | Tasks 15, 16, 21 |
| `setup.sql` | Task 4 (instructions only — must be run in Supabase dashboard) |

---

## Task 1: Delete dead code (Findings 11, 12)

**Files:**
- Delete: `app/api/chart/route.ts` and its directory
- Delete: `lib/tickers.ts`

- [ ] **Step 1: Verify neither file is imported anywhere**
```bash
grep -r "from '@/api/chart'" "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities/app" --include="*.ts" --include="*.tsx"
grep -r "from '@/lib/tickers'" "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" --include="*.ts" --include="*.tsx"
```
Expected: no output (no imports)

- [ ] **Step 2: Delete the files**
```bash
rm -rf "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities/app/api/chart"
rm "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities/lib/tickers.ts"
```

- [ ] **Step 3: Verify build still passes**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run build 2>&1 | tail -20
```
Expected: no errors mentioning `chart` or `tickers`

- [ ] **Step 4: Commit**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities"
git add -A
git commit -m "chore: delete dead /api/chart route and lib/tickers.ts"
```

---

## Task 2: Delete dead ReportCard branches (Finding 13)

**Files:**
- Modify: `components/ReportCard.tsx`

These fields (`d.fiftyTwoWeekLow`, `d.fiftyTwoWeekHigh`, `d.sector`, `d.industry`) are never written to the Supabase `reports.data` column by `generateReport.ts`. The UI branches that depend on them silently render nothing.

- [ ] **Step 1: Remove the buyLow/buyHigh branch**

In `components/ReportCard.tsx`, replace the entire `{sentiment && (() => { ... })()}` block at lines ~152–183:

```tsx
// BEFORE (lines 152-183):
{sentiment && (() => {
  const low = d.fiftyTwoWeekLow
  const high = d.fiftyTwoWeekHigh
  const buyLow = low && high ? low + (high - low) * 0.05 : null
  const buyHigh = low && high ? low + (high - low) * 0.35 : null
  return (
    <div style={{ flexShrink: 0, textAlign: 'right' }}>
      <div style={{
        fontSize: 13, fontWeight: 700,
        color: sentimentColor,
        letterSpacing: '0.08em',
        fontFamily: "'JetBrains Mono', monospace",
        textTransform: 'uppercase',
      }}>
        {sentiment}
      </div>
      {buyLow != null && buyHigh != null && (
        <div style={{
          fontSize: 9, color: '#666',
          fontFamily: "'JetBrains Mono', monospace",
          marginTop: 3,
          letterSpacing: '0.03em',
        }}>
          BUY ${buyLow.toFixed(0)}–${buyHigh.toFixed(0)}
        </div>
      )}
    </div>
  )
})()}

// AFTER:
{sentiment && (
  <div style={{ flexShrink: 0, textAlign: 'right' }}>
    <div style={{
      fontSize: 13, fontWeight: 700,
      color: sentimentColor,
      letterSpacing: '0.08em',
      fontFamily: "'JetBrains Mono', monospace",
      textTransform: 'uppercase',
    }}>
      {sentiment}
    </div>
  </div>
)}
```

- [ ] **Step 2: Remove the sector/industry footer**

Find and remove these lines (~259-269):
```tsx
// REMOVE this entire block:
{(d.sector || d.industry) && (
  <div style={{
    fontSize: 11, color: '#666',
    fontFamily: "'DM Sans', sans-serif",
    marginBottom: 8,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }}>
    {[d.sector, d.industry].filter(Boolean).join(' · ')}
  </div>
)}
```

- [ ] **Step 3: Verify the card still renders in dev**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run dev &
# Open http://localhost:3000 and check report cards look correct
```

- [ ] **Step 4: Commit**
```bash
git add components/ReportCard.tsx
git commit -m "fix: remove dead fiftyTwoWeekLow/High and sector/industry branches in ReportCard"
```

---

## Task 3: Fix ticker-band cache key ordering (Finding 18)

**Files:**
- Modify: `app/api/ticker-band/route.ts`

Different clients sending the same tickers in different orders create separate cache entries.

- [ ] **Step 1: Fix the cache key**

In `app/api/ticker-band/route.ts`, find line `const cacheKey = symbols.join(',')` and change to:

```ts
// BEFORE:
const cacheKey = symbols.join(',')

// AFTER:
const cacheKey = symbols.slice().sort().join(',')
```

- [ ] **Step 2: Commit**
```bash
git add "app/api/ticker-band/route.ts"
git commit -m "fix: sort ticker-band cache key to prevent duplicate cache entries"
```

---

## Task 4: Fix useMediaQuery first-render flash (Finding 23)

**Files:**
- Modify: `lib/hooks/useMediaQuery.ts`

Currently returns `false` on first render before the effect runs, causing a layout flash (mobile layout renders briefly on desktop).

- [ ] **Step 1: Replace the file content**

Full replacement of `lib/hooks/useMediaQuery.ts`:

```ts
'use client'

import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )
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

- [ ] **Step 2: Commit**
```bash
git add "lib/hooks/useMediaQuery.ts"
git commit -m "fix: use lazy state init in useMediaQuery to eliminate first-render flash"
```

---

## Task 5: Fix supabase.ts fail-fast in production (Finding 19)

**Files:**
- Modify: `lib/supabase.ts`

Missing env vars currently produce confusing downstream errors instead of crashing at startup.

- [ ] **Step 1: Update lib/supabase.ts**

```ts
// FULL FILE REPLACEMENT:
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }
  console.warn('[supabase] env vars missing — database features will not work')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)
```

- [ ] **Step 2: Commit**
```bash
git add "lib/supabase.ts"
git commit -m "fix: throw in production when Supabase env vars are missing"
```

---

## Task 6: Fix document.fonts.ready unmount leak (Finding 28)

**Files:**
- Modify: `app/page.tsx`

`document.fonts.ready.then(measure)` fires after unmount and calls `setTitleWidth` on a stale component.

- [ ] **Step 1: Add cancelled guard**

Find the `useEffect` in `app/page.tsx` that contains `document.fonts.ready.then(measure)` (around line 218-227):

```ts
// BEFORE:
useEffect(() => {
  if (loading) return
  const measure = () => {
    if (titleRef.current) setTitleWidth(titleRef.current.offsetWidth)
  }
  measure()
  document.fonts.ready.then(measure)
  window.addEventListener('resize', measure)
  return () => window.removeEventListener('resize', measure)
}, [loading, activeTab])

// AFTER:
useEffect(() => {
  if (loading) return
  let cancelled = false
  const measure = () => {
    if (!cancelled && titleRef.current) setTitleWidth(titleRef.current.offsetWidth)
  }
  measure()
  document.fonts.ready.then(measure)
  window.addEventListener('resize', measure)
  return () => {
    cancelled = true
    window.removeEventListener('resize', measure)
  }
}, [loading, activeTab])
```

- [ ] **Step 2: Commit**
```bash
git add "app/page.tsx"
git commit -m "fix: guard document.fonts.ready callback against stale component ref"
```

---

## Task 7: Add auth guard to generateReport (Finding 1)

**Files:**
- Create: `lib/supabase-server.ts`
- Modify: `app/actions/generateReport.ts`

The `generateReport` server action currently accepts calls from anyone. We need to verify the caller is authenticated. This requires `@supabase/ssr` to read auth from Next.js request cookies.

- [ ] **Step 1: Install @supabase/ssr**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities"
npm install @supabase/ssr
```

- [ ] **Step 2: Create lib/supabase-server.ts**

Create `/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities/lib/supabase-server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll is called from a server component — cookie writes are allowed in actions
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Add auth check to generateReport**

In `app/actions/generateReport.ts`, add the import and auth check at the top of the `generateReport` function:

```ts
// Add at the top of the file (after existing imports):
import { createSupabaseServerClient } from '@/lib/supabase-server'

// Replace the start of generateReport (after the symbol validation):
export async function generateReport(ticker: string): Promise<StockReport | { error: string }> {
  const symbol = ticker.toUpperCase().trim()
  if (!symbol) return { error: 'Ticker is required' }
  if (symbol.length > 20 || !/^[A-Z0-9.\-^=]+$/.test(symbol)) return { error: 'Invalid ticker symbol' }

  // ── Auth guard: only authenticated users may generate reports ──
  const serverSupabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await serverSupabase.auth.getUser()
  if (authError || !user) return { error: 'You must be signed in to generate a report.' }

  try {
    // ... rest of function unchanged
```

- [ ] **Step 4: Fix the reports RLS DELETE policy (must be run in Supabase dashboard)**

The current policy `using (auth.uid() is not null)` lets any user delete any report. Update `setup.sql` with the correct policy and note that it must be run in the Supabase SQL Editor:

In `setup.sql`, change:
```sql
-- BEFORE:
create policy "Authenticated users can delete reports"
  on reports for delete
  using (auth.uid() is not null);

-- AFTER:
create policy "Authenticated users can delete reports"
  on reports for delete
  using (auth.uid() = created_by);
```

Then open the Supabase dashboard → SQL Editor and run:
```sql
drop policy if exists "Authenticated users can delete reports" on reports;
create policy "Authenticated users can delete reports"
  on reports for delete
  using (auth.uid() = created_by);
```

- [ ] **Step 5: Verify auth check works**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**
```bash
git add lib/supabase-server.ts "app/actions/generateReport.ts" setup.sql package.json package-lock.json
git commit -m "feat: add auth guard to generateReport server action"
```

---

## Task 8: Create lib/anthropic.ts singleton + fix health check (Findings 20, 21)

**Files:**
- Create: `lib/anthropic.ts`
- Modify: `app/api/health/route.ts`
- Modify: `app/actions/generateReport.ts`

The health check's `countTokens` call is an unnecessary Anthropic network round-trip. Checking env var existence is sufficient. Also, two separate Anthropic clients are instantiated — consolidate to one singleton.

- [ ] **Step 1: Create lib/anthropic.ts**

```ts
import Anthropic from '@anthropic-ai/sdk'

const key = process.env.ANTHROPIC_API_KEY
if (!key && process.env.NODE_ENV === 'production') {
  throw new Error('ANTHROPIC_API_KEY is required in production')
}

export const anthropic = key ? new Anthropic({ apiKey: key }) : null
```

- [ ] **Step 2: Update app/actions/generateReport.ts to use the singleton**

Remove the `getAnthropic()` factory function:
```ts
// REMOVE:
function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
  return new Anthropic({ apiKey: key })
}
```

Add import at top of file:
```ts
import { anthropic } from '@/lib/anthropic'
```

Inside `generateReport`, replace `const client = getAnthropic()` with:
```ts
if (!anthropic) return { error: 'ANTHROPIC_API_KEY is not configured' }
const client = anthropic
```

Also remove the `import Anthropic from '@anthropic-ai/sdk'` if it is only used by `getAnthropic` and the error type checks. Keep the import for `Anthropic.AuthenticationError` and `Anthropic.RateLimitError` checks — those type references still need the import:

```ts
import Anthropic from '@anthropic-ai/sdk'  // keep for error type checking
import { anthropic } from '@/lib/anthropic'
```

- [ ] **Step 3: Update app/api/health/route.ts — replace countTokens with env check**

Replace the `checkAnthropic` function:
```ts
// BEFORE:
async function checkAnthropic(): Promise<ServiceResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'placeholder') {
    return { name: 'Claude AI', status: 'unconfigured', latency: 0, detail: 'API key not set' }
  }
  const t0 = Date.now()
  try {
    const client = new Anthropic({ apiKey })
    await withTimeout(
      client.messages.countTokens({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'ping' }],
      }),
      5000
    )
    return { name: 'Claude AI', status: 'ok', latency: Date.now() - t0 }
  } catch (err: any) {
    return { name: 'Claude AI', status: 'error', latency: Date.now() - t0, detail: 'Claude health check failed' }
  }
}

// AFTER:
function checkAnthropic(): ServiceResult {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'placeholder') {
    return { name: 'Claude AI', status: 'unconfigured', latency: 0, detail: 'API key not set' }
  }
  return { name: 'Claude AI', status: 'ok', latency: 0 }
}
```

Also update the caller since it's no longer async:
```ts
// In the GET handler, change:
const [yahooResult, claudeResult, supabaseResult, fearGreedResult] = await Promise.all([
  checkYahooFinance(),
  checkAnthropic(),    // no longer async — but Promise.all handles non-promises fine
  checkSupabase(),
  checkFearGreed(),
])
```

Remove `import Anthropic from '@anthropic-ai/sdk'` from health route since it's no longer used there. Remove `withTimeout` import from health route if `checkAnthropic` was its only user — keep it if `checkYahooFinance` or `checkSupabase` still use it (they do, so keep it).

- [ ] **Step 4: Verify build**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**
```bash
git add lib/anthropic.ts "app/api/health/route.ts" "app/actions/generateReport.ts"
git commit -m "refactor: singleton Anthropic client, replace countTokens health check with env check"
```

---

## Task 9: Cache fetchMacroContext for 5 minutes (Finding 7)

**Files:**
- Modify: `lib/macroContext.ts`

`fetchMacroContext` fires 4 Yahoo calls on every report generation. VIX, yields, and SPX change slowly. A 5-minute module-level cache eliminates redundant calls for back-to-back report generations.

- [ ] **Step 1: Add module-level cache to lib/macroContext.ts**

Add at the top of the file (after imports):
```ts
// 5-minute module-level cache — macro data doesn't change tick-by-tick
let macroCache: { result: { formatted: string; data: MacroContext }; ts: number } | null = null
const MACRO_CACHE_TTL = 5 * 60 * 1000
```

Wrap the body of `fetchMacroContext` with a cache check:
```ts
export async function fetchMacroContext(): Promise<{ formatted: string; data: MacroContext }> {
  if (macroCache && Date.now() - macroCache.ts < MACRO_CACHE_TTL) {
    return macroCache.result
  }

  const data: MacroContext = { ... }  // existing implementation unchanged

  // ... existing fetch/process logic ...

  const result = { formatted, data }
  macroCache = { result, ts: Date.now() }
  return result
}
```

The full modified file (showing the cache wrapper around the existing logic):

```ts
// ── Macro Environment Overlay ──
import { yahooFinance } from '@/lib/yahoo'
import { withTimeout } from '@/lib/utils'

export interface MacroContext {
  vix: { level: number; classification: string } | null
  tenYearYield: number | null
  sp500: { price: number; fiftyDayAvg: number; twoHundredDayAvg: number } | null
  yieldCurve: { spread: number; status: 'inverted' | 'flat' | 'normal' } | null
  fetchedAt: string
}

function classifyVIX(level: number): string {
  if (level < 15) return 'low fear'
  if (level <= 25) return 'moderate'
  if (level <= 35) return 'elevated'
  return 'extreme fear'
}

let macroCache: { result: { formatted: string; data: MacroContext }; ts: number } | null = null
const MACRO_CACHE_TTL = 5 * 60 * 1000

export async function fetchMacroContext(): Promise<{ formatted: string; data: MacroContext }> {
  if (macroCache && Date.now() - macroCache.ts < MACRO_CACHE_TTL) {
    return macroCache.result
  }

  const data: MacroContext = {
    vix: null,
    tenYearYield: null,
    sp500: null,
    yieldCurve: null,
    fetchedAt: new Date().toISOString(),
  }

  const [vixResult, tnxResult, gspcResult, fvxResult] = await Promise.allSettled([
    withTimeout(yahooFinance.quote('^VIX', {}, { validateResult: false } as any), 5000),
    withTimeout(yahooFinance.quote('^TNX', {}, { validateResult: false } as any), 5000),
    withTimeout(yahooFinance.quote('^GSPC', {}, { validateResult: false } as any), 5000),
    withTimeout(yahooFinance.quote('^FVX', {}, { validateResult: false } as any), 5000),
  ])

  if (vixResult.status === 'fulfilled' && vixResult.value) {
    const q = vixResult.value as any
    const level = q.regularMarketPrice ?? 0
    if (level > 0) data.vix = { level, classification: classifyVIX(level) }
  }

  let tenY = 0
  if (tnxResult.status === 'fulfilled' && tnxResult.value) {
    const q = tnxResult.value as any
    tenY = q.regularMarketPrice ?? 0
    if (tenY > 0) data.tenYearYield = tenY
  }

  if (gspcResult.status === 'fulfilled' && gspcResult.value) {
    const q = gspcResult.value as any
    const price = q.regularMarketPrice ?? 0
    if (price > 0) {
      data.sp500 = {
        price,
        fiftyDayAvg: q.fiftyDayAverage ?? 0,
        twoHundredDayAvg: q.twoHundredDayAverage ?? 0,
      }
    }
  }

  let fiveY = 0
  if (fvxResult.status === 'fulfilled' && fvxResult.value) {
    const q = fvxResult.value as any
    fiveY = q.regularMarketPrice ?? 0
  }
  if (tenY > 0 && fiveY > 0) {
    const spread = tenY - fiveY
    let status: 'inverted' | 'flat' | 'normal'
    if (spread < 0) status = 'inverted'
    else if (spread < 0.2) status = 'flat'
    else status = 'normal'
    data.yieldCurve = { spread: parseFloat(spread.toFixed(2)), status }
  }

  const lines: string[] = []
  if (data.vix) lines.push(`- VIX: ${data.vix.level.toFixed(1)} (${data.vix.classification})`)
  if (data.tenYearYield != null) lines.push(`- US 10-Year Yield: ${data.tenYearYield.toFixed(2)}%`)
  if (data.sp500) {
    lines.push(`- S&P 500: ${data.sp500.price.toFixed(0)} (50-day avg: ${data.sp500.fiftyDayAvg.toFixed(0)}, 200-day avg: ${data.sp500.twoHundredDayAvg.toFixed(0)})`)
  }
  if (data.yieldCurve) {
    lines.push(`- Yield Curve (10Y vs 5Y): ${data.yieldCurve.spread >= 0 ? '+' : ''}${data.yieldCurve.spread.toFixed(2)}% spread (${data.yieldCurve.status})`)
  }

  const formatted = lines.length > 0
    ? `MACRO ENVIRONMENT (as of ${new Date().toISOString().split('T')[0]}):\n${lines.join('\n')}`
    : ''

  const result = { formatted, data }
  macroCache = { result, ts: Date.now() }
  return result
}
```

- [ ] **Step 2: Commit**
```bash
git add "lib/macroContext.ts"
git commit -m "perf: add 5-minute module-level cache to fetchMacroContext"
```

---

## Task 10: Add in-memory cache to ticker-search (Finding 17)

**Files:**
- Modify: `app/api/ticker-search/route.ts`

Every debounced keystroke hits Yahoo. A 5-minute server cache eliminates repeat lookups for the same prefix.

- [ ] **Step 1: Add cache to ticker-search/route.ts**

Full replacement of `app/api/ticker-search/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'

export const dynamic = 'force-dynamic'

const cache = new Map<string, { data: any[]; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 20)
  if (!query) return NextResponse.json([])

  const cached = cache.get(query)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  try {
    const results = await yahooFinance.search(
      query,
      { quotesCount: 8, newsCount: 0, enableFuzzyQuery: true },
      { validateResult: false }
    ) as any

    const suggestions = ((results as any).quotes ?? [])
      .filter((q: any) => {
        if (!q.isYahooFinance || !q.symbol) return false
        if (!['EQUITY', 'ETF'].includes(q.quoteType)) return false
        const exchange = (q.exchange || '').toUpperCase()
        return ['NYQ', 'NMS', 'NGM', 'NCM', 'NYS', 'NAS', 'PCX', 'BTS'].includes(exchange)
      })
      .slice(0, 7)
      .map((q: any) => ({
        symbol: q.symbol as string,
        name: (q.shortname || q.longname || q.symbol) as string,
      }))

    cache.set(query, { data: suggestions, ts: Date.now() })

    // Evict stale entries
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (now - entry.ts > CACHE_TTL * 2) cache.delete(key)
    }

    return NextResponse.json(suggestions)
  } catch (err) {
    console.error('[ticker-search] search failed:', err)
    return NextResponse.json([])
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add "app/api/ticker-search/route.ts"
git commit -m "perf: add 5-minute server cache to ticker-search route"
```

---

## Task 11: Add metadata TTL cache to portfolio-snapshot (Finding 8)

**Files:**
- Modify: `app/api/portfolio-snapshot/route.ts`

`quoteSummary` (sector, beta) and `historical` (30d volatility) are fetched every 60s but only change daily. A 6-hour server cache for these fields eliminates the expensive Yahoo calls while keeping prices fresh.

- [ ] **Step 1: Add metadata cache to portfolio-snapshot/route.ts**

Add at the top of the file (after imports):
```ts
// Metadata (sector, beta, volatility) changes at most daily — cache 6 hours
interface MetadataCache {
  beta: number | null
  volatility30d: number | null
  sector: string | null
  name: string | null
  ts: number
}
const metadataCache = new Map<string, MetadataCache>()
const METADATA_TTL = 6 * 60 * 60 * 1000
```

Replace the `fetchOne` function body to use the cache:
```ts
async function fetchOne(ticker: string): Promise<HoldingSnapshot> {
  const empty: HoldingSnapshot = {
    ticker, price: null, prevClose: null,
    beta: null, volatility30d: null, sector: null, name: null,
  }
  try {
    // Always fetch fresh price data
    const quote = await yahooFinance.quoteCombine(ticker).catch(() => null)
    const price = (quote as any)?.regularMarketPrice ?? null
    const prevClose = (quote as any)?.regularMarketPreviousClose ?? (quote as any)?.previousClose ?? null
    const name = (quote as any)?.shortName ?? (quote as any)?.longName ?? null

    // Use cached metadata if still fresh
    const cachedMeta = metadataCache.get(ticker)
    if (cachedMeta && Date.now() - cachedMeta.ts < METADATA_TTL) {
      return {
        ticker,
        price: typeof price === 'number' ? price : null,
        prevClose: typeof prevClose === 'number' ? prevClose : null,
        beta: cachedMeta.beta,
        volatility30d: cachedMeta.volatility30d,
        sector: cachedMeta.sector,
        name: typeof name === 'string' ? name : cachedMeta.name,
      }
    }

    // Cache miss — fetch expensive metadata
    const now = new Date()
    const period1 = new Date(now)
    period1.setDate(period1.getDate() - 45)

    const [summary, historical] = await Promise.all([
      yahooFinance
        .quoteSummary(ticker, { modules: ['summaryDetail', 'summaryProfile', 'defaultKeyStatistics'] })
        .catch(() => null),
      yahooFinance
        .historical(ticker, { period1, period2: now, interval: '1d' })
        .catch(() => null),
    ])

    const beta =
      (summary as any)?.summaryDetail?.beta ??
      (summary as any)?.defaultKeyStatistics?.beta ??
      null
    const quoteType = (quote as any)?.quoteType ?? null
    const rawSector = (summary as any)?.summaryProfile?.sector ?? null
    const sector = typeof rawSector === 'string' && rawSector.trim()
      ? rawSector
      : (quoteType === 'ETF' ? 'ETF' : null)

    const closes = Array.isArray(historical)
      ? (historical as any[])
          .map(row => Number(row.close))
          .filter(n => Number.isFinite(n) && n > 0)
          .slice(-31)
      : []
    const volatility30d = closes.length >= 5 ? computeAnnualizedVolatility(closes) : null

    const meta: MetadataCache = {
      beta: typeof beta === 'number' ? beta : null,
      volatility30d,
      sector: typeof sector === 'string' ? sector : null,
      name: typeof name === 'string' ? name : null,
      ts: Date.now(),
    }
    metadataCache.set(ticker, meta)

    return {
      ticker,
      price: typeof price === 'number' ? price : null,
      prevClose: typeof prevClose === 'number' ? prevClose : null,
      ...meta,
    }
  } catch (err) {
    console.error(`[portfolio-snapshot] ${ticker} failed:`, err)
    return empty
  }
}
```

- [ ] **Step 2: Verify build**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**
```bash
git add "app/api/portfolio-snapshot/route.ts"
git commit -m "perf: add 6-hour metadata cache to portfolio-snapshot (beta, sector, volatility)"
```

---

## Task 12: Increase banner and heatmap poll intervals (Finding 16)

**Files:**
- Modify: `app/page.tsx` (banner default)
- Modify: `components/SectorHeatmap.tsx` (client poll interval)
- Modify: `app/api/sector-heatmap/route.ts` (server-side TTL)

Reduces Yahoo API call volume by ~80% for these two features.

- [ ] **Step 1: Change banner default to 5 minutes**

In `app/page.tsx`, find `DEFAULT_SETTINGS`:
```ts
// BEFORE:
bannerUpdateFreq: 60_000,

// AFTER:
bannerUpdateFreq: 5 * 60_000,
```

- [ ] **Step 2: Change heatmap client poll to 5 minutes**

In `components/SectorHeatmap.tsx`, find the `setInterval` call:
```ts
// BEFORE:
intervalRef.current = setInterval(() => fetchData(period), 2 * 60 * 1000)

// AFTER:
intervalRef.current = setInterval(() => fetchData(period), 5 * 60 * 1000)
```

- [ ] **Step 3: Add period-aware TTL to sector-heatmap server route**

In `app/api/sector-heatmap/route.ts`, replace the single `CACHE_TTL` constant with period-aware TTLs:

```ts
// BEFORE:
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes

// AFTER: 1D refreshes every 5min; historical periods change only after market close — 1 hour
function getCacheTTL(period: string): number {
  if (period === '1D') return 5 * 60 * 1000
  return 60 * 60 * 1000  // 1 hour for 5D/3M/6M/YTD/1Y
}
```

And update both cache checks to use the function:
```ts
// Cache check (first use):
if (cached && Date.now() - cached.ts < getCacheTTL(period)) {

// Eviction (second use):
if (now - val.ts > getCacheTTL(period) * 2) cache.delete(key)
```

- [ ] **Step 4: Commit**
```bash
git add "app/page.tsx" "components/SectorHeatmap.tsx" "app/api/sector-heatmap/route.ts"
git commit -m "perf: reduce banner/heatmap poll frequency and add period-aware heatmap TTL"
```

---

## Task 13: Fix React hook order in reports page (Finding 5)

**Files:**
- Modify: `app/reports/[ticker]/page.tsx`

The ticker regex validation early return currently comes BEFORE `useState`/`useEffect` hooks. React's Rules of Hooks require that hooks must not be called conditionally. An early return before hooks is only legal if it comes before ALL hooks.

- [ ] **Step 1: Move validation after hooks**

The current file structure is:
```
export default function ReportPage() {
  const params = useParams()
  const router = useRouter()
  const ticker = ...

  if (!/regex/.test(ticker)) {    // ← PROBLEM: early return here
    return <invalid ticker UI>
  }

  const [watchlist, setWatchlist] = useState([])  // hooks come AFTER the return
  const [session, setSession] = useState(null)
  ...
}
```

Full replacement of `app/reports/[ticker]/page.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import StockReport from '@/components/reports/StockReport'

export default function ReportPage() {
  const params = useParams()
  const router = useRouter()
  const rawTicker = (params.ticker as string).toUpperCase()
  const isValidTicker = /^[A-Z0-9.\-^=]{1,20}$/.test(rawTicker)

  // All hooks must come before any conditional returns
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    if (!isValidTicker) return
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) loadWatchlist(s.user.id)
    })
  }, [isValidTicker])

  const loadWatchlist = async (userId: string) => {
    const { data } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle()
    const wl = data?.settings?.watchlist
    if (Array.isArray(wl)) setWatchlist(wl)
  }

  const toggleWatchlist = useCallback(async () => {
    if (!session || !isValidTicker) return
    const isOn = watchlist.includes(rawTicker)
    const updated = isOn
      ? watchlist.filter(t => t !== rawTicker)
      : [...watchlist, rawTicker]
    setWatchlist(updated)
    // Store watchlist inside settings JSONB
    const { data: existing } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', session.user.id)
      .maybeSingle()
    const currentSettings = existing?.settings ?? {}
    await supabase
      .from('user_settings')
      .upsert(
        { user_id: session.user.id, settings: { ...currentSettings, watchlist: updated }, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
  }, [session, watchlist, rawTicker, isValidTicker])

  // Now safe to do conditional render — all hooks have been called unconditionally above
  if (!isValidTicker) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#ef4444', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>
          Invalid ticker symbol.
        </p>
      </div>
    )
  }

  const isOnWatchlist = watchlist.includes(rawTicker)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1a1a1a',
        padding: '0 40px',
      }}>
        <div style={{
          maxWidth: 1880, margin: '0 auto', width: '100%',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          height: 56,
        }}>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'none', border: '1px solid #2a2a2a', borderRadius: 4,
              color: '#888', fontSize: 12, padding: '8px 16px', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.05em', transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}
          >
            &larr; BACK
          </button>
          {session && (
            <button
              onClick={toggleWatchlist}
              style={{
                background: isOnWatchlist ? 'rgba(34,197,94,0.08)' : 'transparent',
                border: `1px solid ${isOnWatchlist ? 'rgba(34,197,94,0.4)' : '#2a2a2a'}`,
                borderRadius: 4,
                color: isOnWatchlist ? '#22c55e' : '#888',
                fontSize: 12, padding: '8px 16px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em', transition: 'all 0.2s ease',
              }}
            >
              {isOnWatchlist ? 'ON WATCHLIST' : '+ WATCHLIST'}
            </button>
          )}
        </div>
      </div>

      <StockReport ticker={rawTicker} />
    </div>
  )
}
```

Note: `loadWatchlist` now reads from `settings.watchlist` (inside the JSONB) instead of a non-existent top-level `watchlist` column. This aligns with Task 14.

- [ ] **Step 2: Verify build**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**
```bash
git add "app/reports/[ticker]/page.tsx"
git commit -m "fix: move ticker validation after hooks in ReportPage, fix watchlist storage key"
```

---

## Task 14: Fix watchlist to use Supabase as single source of truth (Finding 3)

**Files:**
- Modify: `app/page.tsx`

The Dashboard reads watchlist from `localStorage` only. The report page (after Task 13) writes to `user_settings.settings.watchlist`. These need to share the same source: `user_settings.settings.watchlist` (inside the JSONB).

- [ ] **Step 1: Remove the localStorage watchlist load**

In `app/page.tsx`, find and remove this entire `useEffect`:
```ts
// REMOVE this effect entirely:
// ── Load watchlist from localStorage ──
useEffect(() => {
  try {
    const stored = localStorage.getItem('sanctum-watchlist')
    if (stored) setWatchlist(JSON.parse(stored))
  } catch {}
}, [])
```

- [ ] **Step 2: Load watchlist from Supabase inside loadSettingsFromSupabase**

In `app/page.tsx`, update `loadSettingsFromSupabase`:
```ts
// BEFORE:
const loadSettingsFromSupabase = useCallback(async (userId: string) => {
  try {
    const { data } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .single()
    if (data?.settings) {
      const merged = { ...DEFAULT_SETTINGS, ...data.settings }
      setSettings(merged)
      localStorage.setItem('sanctum-settings', JSON.stringify(merged))
    }
  } catch {}
}, [])

// AFTER:
const loadSettingsFromSupabase = useCallback(async (userId: string) => {
  try {
    const { data } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .single()
    if (data?.settings) {
      // Extract watchlist from settings JSONB before merging into AppSettings
      const { watchlist: wl, ...settingsOnly } = data.settings
      const merged = { ...DEFAULT_SETTINGS, ...settingsOnly }
      setSettings(merged)
      localStorage.setItem('sanctum-settings', JSON.stringify(merged))
      if (Array.isArray(wl)) setWatchlist(wl)
    }
  } catch {}
}, [])
```

- [ ] **Step 3: Update saveWatchlist to write to Supabase**

In `app/page.tsx`, update `saveWatchlist` and the auth state change cleanup:

```ts
// BEFORE:
const saveWatchlist = (list: string[]) => {
  setWatchlist(list)
  localStorage.setItem('sanctum-watchlist', JSON.stringify(list))
}

// AFTER:
const saveWatchlist = useCallback((list: string[]) => {
  setWatchlist(list)
  if (session?.user?.id) {
    // Store watchlist inside settings JSONB alongside app settings
    supabase
      .from('user_settings')
      .upsert({
        user_id: session.user.id,
        settings: { ...settings, watchlist: list },
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => { if (error) console.error('[watchlist] save failed:', error) })
  }
}, [session?.user?.id, settings])
```

Note: `saveWatchlist` now depends on `settings` so it needs `useCallback` with the right deps. Make sure to add `useCallback` import if not already there (it is imported).

- [ ] **Step 4: Update onAuthStateChange cleanup to clear watchlist**

In `app/page.tsx`, find the `onAuthStateChange` handler and add watchlist clear on sign-out:
```ts
const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
  setSession(session)
  if (session?.user?.id) {
    loadSettingsFromSupabase(session.user.id)
  } else {
    setSettings(DEFAULT_SETTINGS)
    setWatchlist([])  // ADD THIS LINE
    localStorage.removeItem('sanctum-settings')
  }
})
```

- [ ] **Step 5: Also remove localStorage.setItem from old saveWatchlist usages**

Check that `addToWatchlist` and `removeFromWatchlist` still use `saveWatchlist` (they do). Since `saveWatchlist` no longer touches localStorage for the watchlist itself, that's correct.

Also remove the localStorage watchlist remnant from the settings modal if it touches it (check `SettingsModal.tsx` for `sanctum-watchlist` references):
```bash
grep -n "sanctum-watchlist" "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities/components/SettingsModal.tsx"
```

If found, update those references to also call `saveWatchlist` instead of writing to localStorage directly.

- [ ] **Step 6: Verify watchlist works end-to-end in dev**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run dev
```
1. Sign in, add AAPL to watchlist from a report page
2. Navigate back to Dashboard → Watchlist tab should show AAPL
3. Reload — watchlist should persist (from Supabase)

- [ ] **Step 7: Commit**
```bash
git add "app/page.tsx"
git commit -m "fix: migrate watchlist to Supabase settings JSONB as single source of truth"
```

---

## Task 15: Fix StockReport cross-user DELETE scope (Finding 4 in audit)

**Files:**
- Modify: `components/reports/StockReport.tsx`

The delete in `StockReport` has no `user_id` filter. Combined with the permissive RLS policy (now fixed in Task 7 Step 4), this would delete all users' reports for a ticker.

- [ ] **Step 1: Scope the delete by current user**

In `components/reports/StockReport.tsx`, find the save logic inside `fetchReport` (around line 437-447):

```ts
// BEFORE:
const { data: { session } } = await supabase.auth.getSession()
if (session?.user) {
  await supabase.from('reports').delete().eq('ticker', ticker)
  await supabase.from('reports').insert({
    ticker,
    data: result,
    ai: {},
    created_by: session.user.id,
    created_by_email: session.user.email ?? null,
  })
}

// AFTER: scope delete to current user and use upsert-style insert
const { data: { session } } = await supabase.auth.getSession()
if (session?.user) {
  await supabase.from('reports')
    .delete()
    .eq('ticker', ticker)
    .eq('created_by', session.user.id)
  await supabase.from('reports').insert({
    ticker,
    data: result,
    ai: {},
    created_by: session.user.id,
    created_by_email: session.user.email ?? null,
  })
}
```

- [ ] **Step 2: Commit**
```bash
git add "components/reports/StockReport.tsx"
git commit -m "fix: scope reports DELETE to current user to prevent cross-user data loss"
```

---

## Task 16: Claude API cost reduction (audit Finding 2)

**Files:**
- Modify: `app/actions/generateReport.ts`

Remove `thinking: { type: 'adaptive' }`, remove `web_search_20260209` tool, reduce `max_tokens` from 32000 to 12000. Expected savings: ~50% per report.

- [ ] **Step 1: Update the stream call**

In `app/actions/generateReport.ts`, find the `client.messages.stream({...})` call (around line 704-710):

```ts
// BEFORE:
const stream = client.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 32000,
  thinking: { type: 'adaptive' },
  tools: [{ type: 'web_search_20260209', name: 'web_search' }],
  messages: [{ role: 'user', content: prompt }],
})

// AFTER:
const stream = client.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 12000,
  messages: [{ role: 'user', content: prompt }],
})
```

- [ ] **Step 2: Update the response text extraction**

Currently the code filters for `type === 'text'` blocks and takes the last one (because web_search emits multiple blocks). Without web_search, there will always be exactly one text block. Simplify (but the existing code still works correctly — this is optional cleanup):

```ts
// Current (still works, just takes last text block):
const textBlocks = message.content.filter(
  (b): b is Anthropic.TextBlock => b.type === 'text'
)
const lastText = textBlocks[textBlocks.length - 1]?.text ?? ''
```

Leave this as-is — it works correctly for single-block responses.

- [ ] **Step 3: Verify a report can still be generated in dev**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run dev
# Generate a test report (e.g., MSFT) and verify it completes without error
```

- [ ] **Step 4: Commit**
```bash
git add "app/actions/generateReport.ts"
git commit -m "perf: reduce Claude max_tokens to 12k, remove adaptive thinking and web_search tool"
```

---

## Task 17: Remove overwritten subtitle prompt instructions (Finding 14)

**Files:**
- Modify: `app/actions/generateReport.ts`

Claude is asked to generate subtitles for P/E, Beta, and Dividend Yield, but those subtitles are unconditionally overwritten server-side (lines 843-872). This wastes input tokens.

- [ ] **Step 1: Update the keyMetrics instruction in the prompt**

In `app/actions/generateReport.ts`, find the `Requirements:` section at the end of the prompt. Find the `overview.keyMetrics` requirement line and update it:

```
// BEFORE (in the Requirements block):
- overview.keyMetrics: copy the PRE-BUILT KEY METRICS from context exactly (label, value, yoyChange are already correct real-time data — do NOT change them). Your only job per metric is to add a "subtitle" field: 3-5 words of sharp interpretation (e.g. "above sector avg", "accelerating trend", "historically cheap", "crowded valuation", "near multi-year low"). Use your web search knowledge and the provided financials to make these insightful, not generic.

// AFTER:
- overview.keyMetrics: copy the PRE-BUILT KEY METRICS from context exactly (label, value, yoyChange are already correct real-time data — do NOT change them). Your only job per metric is to add a "subtitle" field: 3-5 words of sharp interpretation (e.g. "above sector avg", "accelerating trend", "historically cheap", "crowded valuation", "near multi-year low"). EXCEPTION: do NOT include "subtitle" for metrics with label "P/E (TTM)", "Beta", or "Dividend Yield" — these subtitles are computed server-side.
```

- [ ] **Step 2: Commit**
```bash
git add "app/actions/generateReport.ts"
git commit -m "perf: tell Claude to skip subtitle for P/E, Beta, Dividend Yield (computed server-side)"
```

---

## Task 18: Convert JSON-stringified tables to CSV in prompt (Finding 15)

**Files:**
- Modify: `app/actions/generateReport.ts`

`JSON.stringify` for `revenueVsCogs` and `marginTrends` produces verbose, token-hungry output. Pipe-delimited tables are ~35% shorter.

- [ ] **Step 1: Replace the revenueVsCogs JSON.stringify**

In `app/actions/generateReport.ts`, find (around line 552):
```ts
// BEFORE:
- Revenue vs COGS: ${JSON.stringify(yahoo.revenueVsCogs.map((r: any) => ({ year: r.year, revenue: r.revenue + 'B', cogs: r.cogs + 'B', grossProfit: r.grossProfit + 'B' })))}
- Margin Trends: ${JSON.stringify(yahoo.marginTrends.map((m: any) => ({ year: m.year, gross: m.gross.toFixed(1) + '%', operating: m.operating.toFixed(1) + '%', net: m.net.toFixed(1) + '%' })))}

// AFTER:
- Revenue vs COGS (year|rev$B|cogs$B|gp$B):
${yahoo.revenueVsCogs.map((r: any) => `  ${r.year}|${r.revenue}|${r.cogs}|${r.grossProfit}`).join('\n')}
- Margin Trends (year|gross%|op%|net%):
${yahoo.marginTrends.map((m: any) => `  ${m.year}|${m.gross.toFixed(1)}|${m.operating.toFixed(1)}|${m.net.toFixed(1)}`).join('\n')}
```

- [ ] **Step 2: Commit**
```bash
git add "app/actions/generateReport.ts"
git commit -m "perf: replace JSON.stringify tables with pipe-delimited CSV in prompt (~35% fewer tokens)"
```

---

## Task 19: Enable Anthropic prompt caching on static schema block (Finding 6)

**Files:**
- Modify: `app/actions/generateReport.ts`

The 200-line schema + instructions are static and sent as plain text on every call. Moving them to a system message with `cache_control: { type: 'ephemeral' }` saves ~90% of input token costs for the schema portion after the first call per 5-minute cache window.

- [ ] **Step 1: Split the prompt into static + dynamic parts**

The current `prompt` string combines dynamic data (yahoo, quant, macro) and static content (schema, instructions, directives). We need to:
1. Put the static parts in a `system` message with `cache_control`
2. Put only the dynamic per-ticker data in the `user` message

In `app/actions/generateReport.ts`, restructure the prompt building and the `client.messages.stream` call.

Replace the current single `prompt` string with two separate strings:

```ts
// ── STATIC SYSTEM CONTENT (cached by Anthropic for 5 min) ──
const systemPrompt = `You are a quantitative equity strategist at a multi-strategy hedge fund. You write dense, forward-looking analysis. Every sentence either cites a number or makes a falsifiable prediction. No filler. If a sentence could apply to any company, delete it.

You are provided with a quantitative pre-score computed from market data. Your job is to CONFIRM, OVERRIDE, or NUANCE this signal with qualitative reasoning. If you disagree with the quant signal, you must explicitly state why.

When the data is ambiguous or insufficient to support a strong directional call, default to HOLD. Never manufacture conviction.

Your task is to ANALYZE provided market data, not repeat it. Data-sourced fields (prices, margins, analyst targets, insider activity) are injected separately into the report — you do not generate them. Focus on interpretation, thesis, and forward scenarios.

CHAIN-OF-THOUGHT:
Before generating the final JSON, internally reason through these steps in order:
1. Evaluate the quant signal — which factors do you agree with and which do you think are misleading for this specific company?
2. Identify 1-3 qualitative factors NOT captured in the quant data (competitive dynamics, management quality, regulatory risk, product cycle) that should shift the verdict
3. Determine if macro conditions amplify or dampen the stock-specific thesis
4. Arrive at your final verdict and conviction score, noting any divergence from the quant signal

Embed your reasoning chain in a top-level field called "reasoningTrace" in the JSON output — this should be a structured object with keys: quantAgreement, qualitativeOverrides, macroImpact, finalRationale — each being 1-3 sentences.

SPLIT SIGNAL:
If your verdict DISAGREES with the quant pre-score verdict, you MUST set "splitSignal": true at the root level and explain the divergence in reasoningTrace.finalRationale. If you agree, set "splitSignal": false.

DIRECTIVES:
1. Ground every claim in provided data — reference specific margins, growth rates, and multiples.
2. Focus on what changes from here. Historical context only to support a forward thesis.
3. Incorporate the recent news and events into your catalysts and risk assessment. Use your broader knowledge of market conditions, regulatory environment, and industry trends to fill gaps.
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
  "splitSignal": boolean,
  "reasoningTrace": {
    "quantAgreement": "string — 1-3 sentences on which quant factors you agree/disagree with",
    "qualitativeOverrides": "string — 1-3 sentences on qualitative factors not in the quant data",
    "macroImpact": "string — 1-3 sentences on how macro conditions affect the thesis",
    "finalRationale": "string — 1-3 sentences on your final verdict and any divergence from quant"
  },
  "badges": [{ "text": "string — qualitative/narrative tag about the company", "sentiment": "'positive' | 'negative' | 'neutral' | 'caution'", "reason": "string — 1-2 sentences explaining why this tag is relevant" }],
  "dividendHistory": "string or null — ONLY for companies that do NOT currently pay dividends. null if the company currently pays dividends.",
  "overview": {
    "keyMetrics": [
      { "label": "string", "value": "string", "subtitle": "string or omit", "color": "hex or omit", "yoyChange": "string like '+12.3%'" }
    ],
    "businessSummary": {
      "businessModel": "string — detailed paragraph of 4-5 sentences",
      "financials": "string — detailed paragraph of 4-5 sentences",
      "valuation": "string — detailed paragraph of 4-5 sentences"
    },
    "whatHasGoneWrong": "string or null",
    "segmentBreakdown": [{ "name": "string", "percentage": number }],
    "moatScores": [{ "metric": "string", "score": number }],
    "sectorMoatScores": [{ "metric": "string", "score": number }]
  },
  "financials": {
    "financialSummary": {
      "revenueGrowth": "string — exactly 4 sentences",
      "profitabilityMargins": "string — exactly 4 sentences",
      "financialHealth": "string — exactly 4 sentences"
    },
    "annualData": [
      { "year": "string", "revenue": number, "revenueGrowth": "string", "adjEPS": number, "epsGrowth": "string", "opCF": "string", "keyMetric": "string" }
    ],
    "callout": "string — single most important financial insight or warning"
  },
  "valuation": {
    "bullCase": "string — 2-3 sentences with price math",
    "bearCase": "string — 2-3 sentences with price math",
    "metrics": [{ "metric": "string", "current": "string", "fiveYearAvg": "string", "sectorMedian": "string", "commentary": "string — one sentence" }],
    "historicalPE": [{ "year": "string", "pe": number }],
    "sectorMedianPE": number,
    "sectorMedianBeta": number
  },
  "catalysts": {
    "catalystTable": [{ "timeline": "string", "catalyst": "string", "impact": "string", "probability": "string", "timeframe": "NEAR" | "MEDIUM" | "LONG", "conviction": number }],
    "risks": [{ "risk": "string", "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "description": "string", "likelihood": "HIGH" | "MEDIUM" | "LOW", "timeframe": "NEAR" | "MEDIUM" | "LONG" }]
  },
  "verdictDetails": {
    "bullCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "baseCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "bearCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "scenarioMatrix": [{ "scenario": "string", "probability": "string", "priceTarget": "string", "return": "string", "weighted": "string", "keyAssumptions": ["string"] }],
    "multiYearProjections": [{ "horizon": "string", "bearCase": "string", "baseCase": "string", "bullCase": "string", "commentary": "string", "impliedCagr": "string" }],
    "priceProjectionChart": [{ "year": "string", "bear": number, "base": number, "bull": number, "analystMean": number }],
    "syndicateVerdict": {
      "rating": "BUY" | "SELL" | "HOLD" | "AVOID",
      "positionSizing": "string — specific portfolio % range with rationale",
      "keySignalTitle": "string",
      "keySignalDetail": "string — 2-3 sentences",
      "honestRisk": "string — 2-3 sentences",
      "howToPosition": "string — 2-3 sentences",
      "longTermThesis": "string — 2-3 sentences"
    },
    "convictionScore": number,
    "convictionDrivers": "string — 2-3 sentences"
  }
}

Requirements:
- badges: 5-6 objects. Each tag must be qualitative/narrative — NEVER include numeric metrics (market cap, P/E, dividend yield, revenue, EPS, beta, CAGR, margins). Good: 'DOJ Investigation', 'Buffett Favorite', 'AI Tailwind', 'Founder-Led', 'Dividend Aristocrat', 'Tariff Exposed'. Sentiment must reflect whether the tag is bullish, bearish, informational, or a warning.
- overview.keyMetrics: copy the PRE-BUILT KEY METRICS from context exactly (label, value, yoyChange — do NOT change them). Add a "subtitle" field (3-5 words of sharp interpretation) for each metric EXCEPT "P/E (TTM)", "Beta", and "Dividend Yield" — those are computed server-side.
- overview.moatScores: exactly 6 items, 0-100 scale
- overview.sectorMoatScores: exactly 6 items matching moatScores metrics
- overview.segmentBreakdown: 3-8 segments summing close to 100
- financials.annualData: 4-5 years
- valuation.historicalPE: 4-5 years
- catalysts.catalystTable: 4-6 catalysts
- catalysts.risks: 4-6 risks ordered by severity
- verdictDetails.scenarioMatrix: 3 rows (Bull/Base/Bear) + 1 Expected Value row, each with keyAssumptions (2-3 per scenario)
- verdictDetails.multiYearProjections: 3 rows (3-year, 5-year, 10-year) each with impliedCagr
- verdictDetails.priceProjectionChart: 5-6 data points each with analystMean
- verdictDetails.syndicateVerdict.positionSizing: specific portfolio % range with rationale
- Be specific to THIS company — no generic filler`

// ── DYNAMIC USER CONTENT (not cached — changes per ticker) ──
const userPrompt = `Analyze ${symbol} as of ${new Date().toISOString().split('T')[0]}.

=== MARKET DATA ===
${yahooContext}

=== QUANTITATIVE PRE-SCORE ===
${quantContext}

=== MACRO ENVIRONMENT ===
${macroContextStr || 'Macro data unavailable.'}
Consider the current macro environment when evaluating risk and positioning. A rising rate / high VIX environment should increase your skepticism of growth-dependent theses.`
```

Then update the stream call:

```ts
const stream = client.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 12000,
  system: [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' },
    } as any,  // cache_control is a beta feature; 'as any' avoids SDK type mismatch
  ],
  messages: [{ role: 'user', content: userPrompt }],
})
```

- [ ] **Step 2: Add the beta header required for prompt caching**

Anthropic prompt caching is a beta feature that requires the `anthropic-beta: prompt-caching-2024-07-31` header. Update `lib/anthropic.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'

const key = process.env.ANTHROPIC_API_KEY
if (!key && process.env.NODE_ENV === 'production') {
  throw new Error('ANTHROPIC_API_KEY is required in production')
}

export const anthropic = key
  ? new Anthropic({
      apiKey: key,
      defaultHeaders: {
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
    })
  : null
```

- [ ] **Step 3: Generate a test report and verify it works**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run dev
# Generate a report for AAPL, then immediately generate one for MSFT
# The second call should be faster (cache hit on the system prompt)
# Check Anthropic dashboard for cache_read_input_tokens in usage
```

- [ ] **Step 4: Commit**
```bash
git add "app/actions/generateReport.ts" "lib/anthropic.ts"
git commit -m "perf: enable Anthropic prompt caching on static schema block (~90% input token savings)"
```

---

## Task 20: Add fetchYahooData critical-field guard (Finding 9)

**Files:**
- Modify: `app/actions/generateReport.ts`

If Yahoo fetch fails silently, Claude is called with an essentially empty data block — you pay for hallucinations.

- [ ] **Step 1: Add early return on critical field failure**

In `app/actions/generateReport.ts`, find where `yahoo` is used after the parallel fetch (around line 529-532):

```ts
// BEFORE (the quant signal uses a fallback but then continues to call Claude):
const quantSignal: QuantSignal = yahoo
  ? computeQuantSignal(yahoo)
  : { score: 50, verdict: 'HOLD', factors: [], skippedFactors: ['all (Yahoo data unavailable)'] }

// AFTER — fail fast if price and marketCap are both missing:
if (!yahoo || (yahoo.livePrice <= 0 && yahoo.marketCapRaw <= 0)) {
  return { error: 'Market data unavailable for this ticker. Please verify the symbol and try again.' }
}

const quantSignal: QuantSignal = computeQuantSignal(yahoo)
```

Note: Remove the Yahoo null fallback from `buildKeyMetricsFromYahoo` call and `preBuiltMetrics` null check — since we now guarantee `yahoo` is non-null at this point:
```ts
// Since yahoo is guaranteed non-null after the guard:
const preBuiltMetrics = buildKeyMetricsFromYahoo(yahoo)
```

Also update the downstream `yahoo ?` ternaries throughout the function to remove the null checks (since `yahoo` is now guaranteed). Key ones:
- `const yahooContext = yahoo ? \`...\` : ''` → always non-empty
- `if (yahoo) { ... merged fields ... } else { ... safe defaults ... }` → always enter the `if` branch

But be careful — the `else` branch sets safe defaults. Since we now fail fast, the `else` branch is dead code. Leave it in place for safety (it won't run), or remove it — removing it is cleaner.

**Simpler approach to avoid deep refactor:** Keep the `yahoo` null checks as-is throughout the function, just add the early return:

```ts
// Add after the parallel fetch:
const [yahoo, macroResult] = await Promise.all([...])

if (!yahoo || (yahoo.livePrice <= 0 && yahoo.marketCapRaw <= 0)) {
  return { error: 'Market data unavailable for this ticker. Please verify the symbol and try again.' }
}
```

This is the minimal safe change. Leave all the downstream null checks in place.

- [ ] **Step 2: Commit**
```bash
git add "app/actions/generateReport.ts"
git commit -m "fix: return error early when Yahoo data is missing to prevent hallucinated reports"
```

---

## Task 21: Add TTL to Supabase reports cache (Finding 10)

**Files:**
- Modify: `components/reports/StockReport.tsx`

Reports are cached forever — a 6-month-old report is served until manually deleted. Add a 4-hour TTL: serve from cache if fresh, regenerate if stale.

- [ ] **Step 1: Update the fetchReport function**

In `components/reports/StockReport.tsx`, find the `fetchReport` callback and update the Supabase lookup:

```ts
// BEFORE:
const { data: existing } = await supabase
  .from('reports')
  .select('data')
  .eq('ticker', ticker)
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

if (myId !== fetchIdRef.current) return

if (existing?.data?.companyName) {
  setReport(existing.data as StockReportType)
  setReportReady(true)
  setLoading(false)
  setShowReport(true)
  return
}

// AFTER: also fetch created_at to check TTL
const { data: existing } = await supabase
  .from('reports')
  .select('data, created_at')
  .eq('ticker', ticker)
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

if (myId !== fetchIdRef.current) return

const REPORT_TTL_MS = 4 * 60 * 60 * 1000  // 4 hours
const isFresh = existing?.created_at
  ? Date.now() - new Date(existing.created_at).getTime() < REPORT_TTL_MS
  : false

if (existing?.data?.companyName && isFresh) {
  setReport(existing.data as StockReportType)
  setReportReady(true)
  setLoading(false)
  setShowReport(true)
  return
}
```

- [ ] **Step 2: Commit**
```bash
git add "components/reports/StockReport.tsx"
git commit -m "fix: add 4-hour TTL to Supabase report cache to prevent serving stale reports"
```

---

## Task 22: Type report.data as StockReport (Finding 22)

**Files:**
- Modify: `components/ReportCard.tsx`

`SavedReport.data: any` is the root cause of silently dead UI code (the deleted branches in Task 2). Typing it properly catches these issues at compile time.

- [ ] **Step 1: Update SavedReport type in ReportCard.tsx**

In `components/ReportCard.tsx`:

```ts
// BEFORE (top of file):
import { useState, useCallback, useMemo, memo } from 'react'
import { useRouter } from 'next/navigation'

export interface SavedReport {
  id: string
  ticker: string
  data: any     // ← problem
  created_by: string
  created_by_email: string | null
  created_at: string
}

// AFTER:
import { useState, useCallback, useMemo, memo } from 'react'
import { useRouter } from 'next/navigation'
import type { StockReport } from '@/types/report'

export interface SavedReport {
  id: string
  ticker: string
  data: StockReport
  created_by: string
  created_by_email: string | null
  created_at: string
}
```

- [ ] **Step 2: Fix any type errors from the stricter type**

Run the TypeScript compiler to find errors:
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npx tsc --noEmit 2>&1 | grep "ReportCard"
```

The most likely errors:
- `d.companyName` — `StockReport` has `companyName: string` ✓
- `d.verdict` — `StockReport` has `verdict: 'BUY' | 'SELL' | 'HOLD' | 'AVOID'` ✓
- `d.currentPrice` — `StockReport` has `currentPrice: string` ✓
- `d.marketCap` — `StockReport` has `marketCap: string` ✓
- `d.overview?.keyMetrics` — `StockReport.overview.keyMetrics` ✓

Fix any remaining type errors shown.

- [ ] **Step 3: Commit**
```bash
git add "components/ReportCard.tsx"
git commit -m "fix: type SavedReport.data as StockReport instead of any"
```

---

## Task 23: Debounce settings upsert (Finding 24)

**Files:**
- Modify: `app/page.tsx`

Every settings toggle immediately fires a Supabase upsert. Rapid changes (e.g., adjusting banner speed) create unnecessary write spam.

- [ ] **Step 1: Add debounce ref and wrap the Supabase call**

In `app/page.tsx`, add a debounce ref near the other refs at the top of the component:
```ts
const settingsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

Update `updateSettings`:
```ts
// BEFORE:
const updateSettings = useCallback((patch: Partial<AppSettings>) => {
  setSettings(prev => {
    const updated = { ...prev, ...patch }
    localStorage.setItem('sanctum-settings', JSON.stringify(updated))
    if (session?.user?.id) {
      supabase.from('user_settings')
        .upsert({ user_id: session.user.id, settings: updated, updated_at: new Date().toISOString() })
        .then(({ error }) => { if (error) console.error('[settings] save failed:', error) })
    }
    return updated
  })
}, [session?.user?.id])

// AFTER:
const updateSettings = useCallback((patch: Partial<AppSettings>) => {
  setSettings(prev => {
    const updated = { ...prev, ...patch }
    localStorage.setItem('sanctum-settings', JSON.stringify(updated))
    if (session?.user?.id) {
      if (settingsSaveRef.current) clearTimeout(settingsSaveRef.current)
      settingsSaveRef.current = setTimeout(() => {
        supabase.from('user_settings')
          .upsert({ user_id: session.user.id, settings: updated, updated_at: new Date().toISOString() })
          .then(({ error }) => { if (error) console.error('[settings] save failed:', error) })
      }, 500)
    }
    return updated
  })
}, [session?.user?.id])
```

- [ ] **Step 2: Commit**
```bash
git add "app/page.tsx"
git commit -m "fix: debounce settings Supabase upsert to 500ms to prevent write spam"
```

---

## Task 24: Add in-memory cache to StockReport (Finding 25)

**Files:**
- Modify: `components/reports/StockReport.tsx`

Navigating away and back to the same report page triggers a full Supabase fetch + potential re-generation. A module-level Map cache serves the report instantly on re-visit.

- [ ] **Step 1: Add module-level report cache**

In `components/reports/StockReport.tsx`, add at the module level (outside the component, near the top):

```ts
// Module-level cache: serves previously fetched reports instantly on re-navigation
const reportCache = new Map<string, StockReportType>()
```

Update `fetchReport` to check and populate the cache:

```ts
const fetchReport = useCallback(async () => {
  const myId = ++fetchIdRef.current

  // Check module-level cache first
  const cached = reportCache.get(ticker)
  if (cached) {
    setReport(cached)
    setReportReady(true)
    setLoading(false)
    setShowReport(true)
    return
  }

  setLoading(true)
  setError(null)
  setReport(null)
  setReportReady(false)
  setShowCRT(false)
  setShowReport(false)

  // ... existing Supabase fetch + generateReport logic ...

  // After successfully setting the report, add to module cache:
  // (Add this line after setReport(result) or after setReport(existing.data...))
  // For the "use existing" path:
  if (existing?.data?.companyName && isFresh) {
    reportCache.set(ticker, existing.data as StockReportType)
    setReport(existing.data as StockReportType)
    // ...
  }
  // For the "generate new" path:
  if (!('error' in result)) {
    reportCache.set(ticker, result)
    setReport(result)
    // ...
  }
}, [ticker])
```

- [ ] **Step 2: Commit**
```bash
git add "components/reports/StockReport.tsx"
git commit -m "perf: add module-level report cache to StockReport to skip re-fetch on back-navigation"
```

---

## Task 25: Dynamic import tab components (Finding 26)

**Files:**
- Modify: `components/reports/StockReport.tsx`

All tab components (including Recharts, ~200KB min+gzip) load on every report page visit regardless of which tab is active.

- [ ] **Step 1: Replace static imports with dynamic imports**

In `components/reports/StockReport.tsx`, replace the static tab imports:

```ts
// BEFORE:
import OverviewTab from './tabs/OverviewTab'
import FinancialsTab from './tabs/FinancialsTab'
import ValuationTab from './tabs/ValuationTab'
import CatalystsTab from './tabs/CatalystsTab'
import VerdictTab from './tabs/VerdictTab'

// AFTER:
import dynamic from 'next/dynamic'

const OverviewTab = dynamic(() => import('./tabs/OverviewTab'), { ssr: false })
const FinancialsTab = dynamic(() => import('./tabs/FinancialsTab'), { ssr: false })
const ValuationTab = dynamic(() => import('./tabs/ValuationTab'), { ssr: false })
const CatalystsTab = dynamic(() => import('./tabs/CatalystsTab'), { ssr: false })
const VerdictTab = dynamic(() => import('./tabs/VerdictTab'), { ssr: false })
```

Note: `StockReport` is already `'use client'` and the report page already lazy-loads `StockReport` itself via `next/dynamic`, so adding `ssr: false` here is safe.

- [ ] **Step 2: Verify tab switching works in dev**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run dev
# Navigate to a report page, switch through all 5 tabs, verify each loads correctly
```

- [ ] **Step 3: Commit**
```bash
git add "components/reports/StockReport.tsx"
git commit -m "perf: dynamic import report tab components to split Recharts bundle per tab"
```

---

## Task 26: Fix veto logic — lock to quant verdict on override (Finding 29)

**Files:**
- Modify: `app/actions/generateReport.ts`

When the AI verdict is 2+ notches more bullish than quant, the current code clamps to `qRank + 1` (one notch ABOVE quant). This means an AVOID quant signal gets softened to SELL — the AI always gets some uplift even when vetoed. The correct behavior is to lock to the quant verdict.

- [ ] **Step 1: Update resolveVerdict**

In `app/actions/generateReport.ts`:

```ts
// BEFORE:
// Gemini trying to go 2+ notches more bullish — veto, clamp to one above quant
return { verdict: RANK_TO_VERDICT[qRank + 1], vetoed: true }

// AFTER:
// AI trying to go 2+ notches more bullish — veto, lock to quant verdict
return { verdict: RANK_TO_VERDICT[qRank], vetoed: true }
```

Also update the comment at the top of `resolveVerdict`:
```ts
// BEFORE comment:
// Gemini can always go more cautious than quant, but cannot go more than
// one notch bullish above quant. If it tries, clamp to one above.

// AFTER comment:
// AI can always go more cautious than quant, but cannot go more than
// one notch bullish above quant. If it tries, lock to quant verdict.
```

- [ ] **Step 2: Commit**
```bash
git add "app/actions/generateReport.ts"
git commit -m "fix: lock verdict to quant rank on veto (was incorrectly allowing one-notch uplift)"
```

---

## Final Verification

- [ ] **Full build check**
```bash
cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npm run build 2>&1
```
Expected: clean build, no TypeScript errors.

- [ ] **Smoke test in dev**
```bash
npm run dev
```
1. Dashboard loads — ticker banner shows, sector heatmap shows
2. Search for AAPL, navigate to report page
3. Report generates (or loads from cache)
4. All 5 tabs switch correctly
5. Add AAPL to watchlist — navigate to Dashboard → Watchlist tab → AAPL appears
6. Reload page — watchlist persists
7. Settings modal — change banner speed — no errors in console
8. Portfolio tab — holdings table loads with prices

- [ ] **Supabase RLS fix reminder**
Run this in your Supabase dashboard → SQL Editor (required for Task 7 Step 4):
```sql
drop policy if exists "Authenticated users can delete reports" on reports;
create policy "Authenticated users can delete reports"
  on reports for delete
  using (auth.uid() = created_by);
```

---

## Summary of changes by finding number

| Finding | Task | Description |
|---------|------|-------------|
| 1 | 7 | Auth guard on generateReport |
| 3 | 14 | Watchlist → Supabase single source |
| 5 | 13 | React hook order fix in reports page |
| 6 | 19 | Anthropic prompt caching |
| 7 | 9 | fetchMacroContext 5-min cache |
| 8 | 11 | Portfolio snapshot metadata 6h cache |
| 9 | 20 | fetchYahooData critical-field guard |
| 10 | 21 | Report TTL (4h) |
| 11 | 1 | Delete /api/chart/ |
| 12 | 1 | Delete lib/tickers.ts |
| 13 | 2 | Delete dead ReportCard branches |
| 14 | 17 | Remove overwritten subtitle instructions |
| 15 | 18 | CSV tables in prompt |
| 16 | 12 | Banner/heatmap poll frequency |
| 17 | 10 | ticker-search cache |
| 18 | 3 | ticker-band cache key stability |
| 19 | 5 | supabase.ts fail-fast |
| 20 | 8 | Anthropic singleton + health check |
| 21 | 8 | Replace countTokens with env check |
| 22 | 22 | SavedReport.data typed as StockReport |
| 23 | 4 | useMediaQuery first-render flash |
| 24 | 23 | Settings upsert debounce |
| 25 | 24 | StockReport in-memory cache |
| 26 | 25 | Dynamic import tab components |
| 28 | 6 | document.fonts.ready unmount leak |
| 29 | 26 | Veto logic lock to quant rank |
