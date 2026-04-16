# Portfolio Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Portfolio tab between Dashboard and Watchlist that tracks user-entered holdings with live prices, summary cards, allocation pie (sector ↔ position toggle), day's top movers (3 winners / 3 losers), and risk metrics (beta, 30d volatility, concentration).

**Architecture:** Supabase `holdings` table (RLS-scoped per user) for persistence. One new batch API route `/api/portfolio-snapshot` fetches price, prevClose, beta, sector, and 30-day volatility per ticker from Yahoo Finance. Client-side pure functions in `lib/portfolio/metrics.ts` derive all display metrics. `components/portfolio/` contains a container (`PortfolioPage`) plus focused widget components. Fixed 60s polling with visibility-based pause.

**Tech Stack:** Next.js 14 App Router (client + server), React 18, TypeScript 5.6, Supabase JS v2, yahoo-finance2 v3, Recharts v2.

**Spec reference:** `docs/superpowers/specs/2026-04-16-portfolio-tab-design.md`

**Testing approach:** This codebase has no configured test suite (per `CLAUDE.md`). Per-task verification uses TypeScript compilation (`npx tsc --noEmit`) as a correctness gate, plus targeted manual browser checks after user-visible tasks. End-to-end browser verification is Task 16.

---

## Task 1: Add holdings table to setup.sql

**Files:**
- Modify: `setup.sql` — append new section at end

- [ ] **Step 1: Append holdings schema**

Add this SQL at the end of `setup.sql`:

```sql

-- ── Portfolio Holdings ──

create table if not exists holdings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  shares numeric not null check (shares > 0),
  avg_cost numeric not null check (avg_cost > 0),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists holdings_user_id_idx on holdings(user_id);
create unique index if not exists holdings_user_ticker_idx on holdings(user_id, ticker);

alter table holdings enable row level security;

drop policy if exists "Users can read own holdings" on holdings;
drop policy if exists "Users can insert own holdings" on holdings;
drop policy if exists "Users can update own holdings" on holdings;
drop policy if exists "Users can delete own holdings" on holdings;

create policy "Users can read own holdings"
  on holdings for select
  using (auth.uid() = user_id);

create policy "Users can insert own holdings"
  on holdings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own holdings"
  on holdings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own holdings"
  on holdings for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply SQL in Supabase**

Paste the new section into the Supabase SQL Editor for this project and click **Run**. Verify under **Table Editor** that:
- `holdings` table exists with columns `id`, `user_id`, `ticker`, `shares`, `avg_cost`, `created_at`, `updated_at`
- **Policies** tab shows 4 policies on `holdings`
- RLS toggle is ON

Expected: "Success. No rows returned."

- [ ] **Step 3: Commit**

```bash
git add setup.sql
git commit -m "feat(portfolio): add holdings table schema + RLS policies"
```

---

## Task 2: Portfolio TypeScript types

**Files:**
- Create: `lib/portfolio/types.ts`

- [ ] **Step 1: Create `lib/portfolio/types.ts`**

```ts
export interface Holding {
  id: string
  user_id: string
  ticker: string
  shares: number
  avg_cost: number
  created_at: string
  updated_at: string
}

export interface HoldingSnapshot {
  ticker: string
  price: number | null
  prevClose: number | null
  beta: number | null
  volatility30d: number | null
  sector: string | null
  name: string | null
}

export type SnapshotMap = Record<string, HoldingSnapshot>

export interface EnrichedHolding extends Holding {
  snapshot: HoldingSnapshot | null
  marketValue: number | null
  costBasis: number
  plDollar: number | null
  plPercent: number | null
  dayChangeDollar: number | null
  dayChangePercent: number | null
  weight: number | null
}

export interface PortfolioTotals {
  totalValue: number
  totalCost: number
  totalPlDollar: number
  totalPlPercent: number
  dayChangeDollar: number
  dayChangePercent: number
  hasIncomplete: boolean
}

export interface AllocationSlice {
  label: string
  value: number
  percent: number
}

export interface TopMovers {
  winners: EnrichedHolding[]
  losers: EnrichedHolding[]
}

export interface RiskStats {
  beta: number | null
  volatility30d: number | null
  topHoldingTicker: string | null
  topHoldingWeight: number | null
  top3Concentration: number | null
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit, no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/portfolio/types.ts
git commit -m "feat(portfolio): add TypeScript types"
```

---

## Task 3: Pure metric-computation module

**Files:**
- Create: `lib/portfolio/metrics.ts`

- [ ] **Step 1: Create `lib/portfolio/metrics.ts`**

```ts
import type {
  Holding,
  SnapshotMap,
  EnrichedHolding,
  PortfolioTotals,
  AllocationSlice,
  TopMovers,
  RiskStats,
} from './types'

export function enrichHoldings(holdings: Holding[], snapshots: SnapshotMap): EnrichedHolding[] {
  const enriched = holdings.map(h => {
    const snapshot = snapshots[h.ticker] ?? null
    const price = snapshot?.price ?? null
    const prevClose = snapshot?.prevClose ?? null
    const costBasis = h.shares * h.avg_cost
    const marketValue = price != null ? h.shares * price : null
    const plDollar = marketValue != null ? marketValue - costBasis : null
    const plPercent = plDollar != null && costBasis > 0 ? plDollar / costBasis : null
    const dayChangeDollar = price != null && prevClose != null ? (price - prevClose) * h.shares : null
    const dayChangePercent = price != null && prevClose != null && prevClose > 0
      ? (price - prevClose) / prevClose
      : null
    return {
      ...h,
      snapshot,
      costBasis,
      marketValue,
      plDollar,
      plPercent,
      dayChangeDollar,
      dayChangePercent,
      weight: null as number | null,
    }
  })

  const totalValue = enriched.reduce((acc, e) => acc + (e.marketValue ?? 0), 0)
  for (const e of enriched) {
    e.weight = e.marketValue != null && totalValue > 0 ? e.marketValue / totalValue : null
  }

  enriched.sort((a, b) => (b.marketValue ?? -Infinity) - (a.marketValue ?? -Infinity))
  return enriched
}

export function computeTotals(holdings: EnrichedHolding[]): PortfolioTotals {
  let totalValue = 0
  let totalCost = 0
  let dayChangeDollar = 0
  let prevValueSum = 0
  let hasIncomplete = false

  for (const h of holdings) {
    totalCost += h.costBasis
    if (h.marketValue != null) {
      totalValue += h.marketValue
    } else {
      hasIncomplete = true
    }
    if (h.dayChangeDollar != null && h.snapshot?.prevClose != null) {
      dayChangeDollar += h.dayChangeDollar
      prevValueSum += h.snapshot.prevClose * h.shares
    }
  }

  const totalPlDollar = totalValue - totalCost
  const totalPlPercent = totalCost > 0 ? totalPlDollar / totalCost : 0
  const dayChangePercent = prevValueSum > 0 ? dayChangeDollar / prevValueSum : 0

  return {
    totalValue,
    totalCost,
    totalPlDollar,
    totalPlPercent,
    dayChangeDollar,
    dayChangePercent,
    hasIncomplete,
  }
}

export function computePositionAllocation(holdings: EnrichedHolding[]): AllocationSlice[] {
  const total = holdings.reduce((acc, h) => acc + (h.marketValue ?? 0), 0)
  if (total <= 0) return []
  return holdings
    .filter(h => h.marketValue != null && h.marketValue > 0)
    .map(h => ({
      label: h.ticker,
      value: h.marketValue!,
      percent: h.marketValue! / total,
    }))
    .sort((a, b) => b.value - a.value)
}

export function computeSectorAllocation(holdings: EnrichedHolding[]): AllocationSlice[] {
  const total = holdings.reduce((acc, h) => acc + (h.marketValue ?? 0), 0)
  if (total <= 0) return []
  const buckets = new Map<string, number>()
  for (const h of holdings) {
    if (h.marketValue == null || h.marketValue <= 0) continue
    const sector = h.snapshot?.sector?.trim() || 'Other'
    buckets.set(sector, (buckets.get(sector) ?? 0) + h.marketValue)
  }
  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value, percent: value / total }))
    .sort((a, b) => b.value - a.value)
}

export function computeTopMovers(holdings: EnrichedHolding[], count = 3): TopMovers {
  const withChange = holdings.filter(h => h.dayChangePercent != null)
  const sorted = [...withChange].sort(
    (a, b) => (b.dayChangePercent ?? 0) - (a.dayChangePercent ?? 0)
  )
  const winners = sorted.filter(h => (h.dayChangePercent ?? 0) > 0).slice(0, count)
  const losers = sorted
    .filter(h => (h.dayChangePercent ?? 0) < 0)
    .slice(-count)
    .reverse()
  return { winners, losers }
}

export function computeRiskStats(holdings: EnrichedHolding[]): RiskStats {
  const valid = holdings.filter(h => h.marketValue != null && h.marketValue > 0)
  const totalValid = valid.reduce((acc, h) => acc + (h.marketValue ?? 0), 0)

  const betaWeighted = valid.filter(h => h.snapshot?.beta != null)
  const betaWeight = betaWeighted.reduce((acc, h) => acc + (h.marketValue ?? 0), 0)
  const beta = betaWeight > 0
    ? betaWeighted.reduce((acc, h) => acc + h.snapshot!.beta! * ((h.marketValue ?? 0) / betaWeight), 0)
    : null

  const volWeighted = valid.filter(h => h.snapshot?.volatility30d != null)
  const volWeight = volWeighted.reduce((acc, h) => acc + (h.marketValue ?? 0), 0)
  const volatility30d = volWeight > 0
    ? volWeighted.reduce((acc, h) => acc + h.snapshot!.volatility30d! * ((h.marketValue ?? 0) / volWeight), 0)
    : null

  let topHoldingTicker: string | null = null
  let topHoldingWeight: number | null = null
  if (totalValid > 0) {
    const sorted = [...valid].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
    topHoldingTicker = sorted[0]?.ticker ?? null
    topHoldingWeight = sorted[0] ? (sorted[0].marketValue ?? 0) / totalValid : null
  }

  const top3Concentration = totalValid > 0
    ? [...valid]
        .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
        .slice(0, 3)
        .reduce((acc, h) => acc + (h.marketValue ?? 0), 0) / totalValid
    : null

  return { beta, volatility30d, topHoldingTicker, topHoldingWeight, top3Concentration }
}

export function computeAnnualizedVolatility(closes: number[]): number | null {
  if (closes.length < 2) return null
  const returns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]
    const curr = closes[i]
    if (prev > 0) returns.push((curr - prev) / prev)
  }
  if (returns.length < 2) return null
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(252)
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Sanity check via Node REPL (optional)**

Run the following to verify basic math:

```bash
node -e '
const { enrichHoldings, computeTotals } = require("./lib/portfolio/metrics.ts");
' 2>&1 || echo "skip — ts-node not needed; type-check is the gate"
```

(The above just illustrates intent; metrics will be exercised during Task 16 browser verification.)

- [ ] **Step 4: Commit**

```bash
git add lib/portfolio/metrics.ts
git commit -m "feat(portfolio): add pure metric-computation module"
```

---

## Task 4: Portfolio snapshot API route

**Files:**
- Create: `app/api/portfolio-snapshot/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'
import { withTimeout } from '@/lib/utils'
import { computeAnnualizedVolatility } from '@/lib/portfolio/metrics'
import type { HoldingSnapshot, SnapshotMap } from '@/lib/portfolio/types'

export const dynamic = 'force-dynamic'

const TICKER_PATTERN = /^[A-Z0-9.\-^=]{1,20}$/

async function fetchOne(ticker: string): Promise<HoldingSnapshot> {
  const empty: HoldingSnapshot = {
    ticker,
    price: null,
    prevClose: null,
    beta: null,
    volatility30d: null,
    sector: null,
    name: null,
  }
  try {
    const now = new Date()
    const period1 = new Date(now)
    period1.setDate(period1.getDate() - 45)

    const [quote, summary, historical] = await Promise.all([
      yahooFinance.quoteCombine(ticker).catch(() => null),
      yahooFinance
        .quoteSummary(ticker, { modules: ['summaryDetail', 'summaryProfile', 'defaultKeyStatistics'] })
        .catch(() => null),
      yahooFinance
        .historical(ticker, { period1, period2: now, interval: '1d' })
        .catch(() => null),
    ])

    const price = (quote as any)?.regularMarketPrice ?? null
    const prevClose =
      (quote as any)?.regularMarketPreviousClose ?? (quote as any)?.previousClose ?? null
    const name =
      (quote as any)?.shortName ?? (quote as any)?.longName ?? (summary as any)?.price?.shortName ?? null
    const beta =
      (summary as any)?.summaryDetail?.beta ??
      (summary as any)?.defaultKeyStatistics?.beta ??
      null
    const sector = (summary as any)?.summaryProfile?.sector ?? null

    const closes = Array.isArray(historical)
      ? (historical as any[])
          .map(row => Number(row.close))
          .filter(n => Number.isFinite(n) && n > 0)
          .slice(-31)
      : []
    const volatility30d = closes.length >= 5 ? computeAnnualizedVolatility(closes) : null

    return {
      ticker,
      price: typeof price === 'number' ? price : null,
      prevClose: typeof prevClose === 'number' ? prevClose : null,
      beta: typeof beta === 'number' ? beta : null,
      volatility30d,
      sector: typeof sector === 'string' ? sector : null,
      name: typeof name === 'string' ? name : null,
    }
  } catch (err) {
    console.error(`[portfolio-snapshot] ${ticker} failed:`, err)
    return empty
  }
}

export async function GET(request: NextRequest) {
  try {
    const tickersParam = request.nextUrl.searchParams.get('tickers') ?? ''
    const tickers = tickersParam
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0 && TICKER_PATTERN.test(t))
      .slice(0, 50)

    if (tickers.length === 0) {
      return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } })
    }

    const results = await withTimeout(
      Promise.all(tickers.map(t => fetchOne(t))),
      5000
    ).catch((): HoldingSnapshot[] =>
      tickers.map(t => ({
        ticker: t,
        price: null,
        prevClose: null,
        beta: null,
        volatility30d: null,
        sector: null,
        name: null,
      }))
    )

    const map: SnapshotMap = {}
    for (const snap of results) map[snap.ticker] = snap

    return NextResponse.json(map, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[portfolio-snapshot] failed:', err)
    return NextResponse.json(
      { error: 'Failed to fetch portfolio snapshot' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Manual smoke test**

Start dev server: `npm run dev`
Open: `http://localhost:3000/api/portfolio-snapshot?tickers=AAPL,NVDA,SPY`

Expected JSON shape:
```json
{
  "AAPL": { "ticker": "AAPL", "price": 184.5, "prevClose": 183.1, "beta": 1.2, "volatility30d": 0.23, "sector": "Technology", "name": "Apple Inc." },
  "NVDA": { ... },
  "SPY":  { ... }
}
```

Every ticker key must exist; values may be `null` if Yahoo returned nothing for that field.

- [ ] **Step 4: Commit**

```bash
git add app/api/portfolio-snapshot/route.ts
git commit -m "feat(portfolio): add batch snapshot API route"
```

---

## Task 5: Shared style constants for portfolio components

**Files:**
- Create: `components/portfolio/styles.ts`

Shared style tokens avoid duplication across widgets.

- [ ] **Step 1: Create `components/portfolio/styles.ts`**

```ts
import type { CSSProperties } from 'react'

export const COLORS = {
  bg: '#0a0a0a',
  panel: '#0d0d0d',
  border: '#1a1a1a',
  borderStrong: '#2a2a2a',
  text: '#fff',
  textDim: '#888',
  textMuted: '#555',
  textFaint: '#444',
  divider: '#111',
  pos: '#22c55e',
  neg: '#ef4444',
  warn: '#f59e0b',
} as const

export const PIE_PALETTE = [
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#f59e0b',
  '#64748b',
  '#ec4899',
  '#14b8a6',
  '#eab308',
] as const

export const MONO = "'JetBrains Mono', monospace"

export const panelStyle: CSSProperties = {
  background: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  padding: '14px 16px',
}

export const sectionLabel: CSSProperties = {
  fontSize: 10,
  color: COLORS.textMuted,
  fontFamily: MONO,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
}

export const sectionHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: 10,
  marginBottom: 12,
  borderBottom: `1px solid ${COLORS.border}`,
}

export function signColor(n: number | null | undefined): string {
  if (n == null || n === 0) return COLORS.textDim
  return n > 0 ? COLORS.pos : COLORS.neg
}

export function fmtUsd(n: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = opts.signed && n > 0 ? '+' : ''
  const abs = Math.abs(n)
  const str = abs >= 1000
    ? abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${n < 0 ? '-' : sign}$${str}`
}

export function fmtPct(n: number | null | undefined, opts: { signed?: boolean; digits?: number } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const digits = opts.digits ?? 2
  const v = n * 100
  const sign = opts.signed && v > 0 ? '+' : ''
  return `${sign}${v.toFixed(digits)}%`
}

export function fmtNumber(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add components/portfolio/styles.ts
git commit -m "feat(portfolio): add shared style tokens and formatters"
```

---

## Task 6: EmptyState component

**Files:**
- Create: `components/portfolio/EmptyState.tsx`

- [ ] **Step 1: Create `components/portfolio/EmptyState.tsx`**

```tsx
'use client'

import { COLORS, MONO } from './styles'

interface Props {
  onAddClick: () => void
}

export default function EmptyState({ onAddClick }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: 'calc(100vh - 400px)',
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 4 4 5-5" />
      </svg>
      <p style={{
        fontSize: 14, color: COLORS.textDim, margin: '16px 0 4px',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Your portfolio is empty.
      </p>
      <p style={{
        fontSize: 12, color: COLORS.textMuted, margin: '0 0 20px',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Add a position to start tracking performance.
      </p>
      <button
        onClick={onAddClick}
        style={{
          background: 'transparent',
          border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: 4,
          color: COLORS.textDim,
          fontSize: 12,
          padding: '8px 18px',
          cursor: 'pointer',
          fontFamily: MONO,
          letterSpacing: '0.1em',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => { (e.currentTarget).style.color = '#fff'; (e.currentTarget).style.borderColor = '#444' }}
        onMouseLeave={e => { (e.currentTarget).style.color = COLORS.textDim; (e.currentTarget).style.borderColor = COLORS.borderStrong }}
      >
        + ADD POSITION
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add components/portfolio/EmptyState.tsx
git commit -m "feat(portfolio): add EmptyState component"
```

---

## Task 7: SummaryCards component

**Files:**
- Create: `components/portfolio/SummaryCards.tsx`

- [ ] **Step 1: Create `components/portfolio/SummaryCards.tsx`**

```tsx
'use client'

import type { PortfolioTotals } from '@/lib/portfolio/types'
import { COLORS, MONO, fmtUsd, fmtPct, signColor } from './styles'

interface Props {
  totals: PortfolioTotals
}

export default function SummaryCards({ totals }: Props) {
  const cards: { label: string; value: string; sub?: string; subColor?: string }[] = [
    {
      label: 'TOTAL VALUE',
      value: fmtUsd(totals.totalValue),
      sub: `${fmtUsd(totals.dayChangeDollar, { signed: true })} today`,
      subColor: signColor(totals.dayChangeDollar),
    },
    {
      label: 'TOTAL COST',
      value: fmtUsd(totals.totalCost),
      sub: 'cost basis',
      subColor: COLORS.textMuted,
    },
    {
      label: 'TOTAL P/L',
      value: fmtUsd(totals.totalPlDollar, { signed: true }),
      sub: fmtPct(totals.totalPlPercent, { signed: true }),
      subColor: signColor(totals.totalPlDollar),
    },
    {
      label: 'DAY CHANGE',
      value: fmtUsd(totals.dayChangeDollar, { signed: true }),
      sub: fmtPct(totals.dayChangePercent, { signed: true }),
      subColor: signColor(totals.dayChangeDollar),
    },
  ]

  return (
    <div className="portfolio-summary-row" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 10,
      marginTop: 32,
      marginBottom: 20,
    }}>
      {cards.map(card => (
        <div key={card.label} style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 4,
          padding: '14px 16px',
        }}>
          <div style={{
            fontSize: 10, color: COLORS.textMuted,
            fontFamily: MONO, letterSpacing: '0.15em',
          }}>
            {card.label}
          </div>
          <div style={{
            color: COLORS.text,
            fontSize: 24,
            marginTop: 6,
            fontFamily: MONO,
            letterSpacing: '0.02em',
          }}>
            {card.value}
          </div>
          {card.sub && (
            <div style={{
              fontSize: 11, color: card.subColor ?? COLORS.textMuted,
              fontFamily: MONO, marginTop: 4,
            }}>
              {card.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add components/portfolio/SummaryCards.tsx
git commit -m "feat(portfolio): add SummaryCards component"
```

---

## Task 8: AddPositionModal component

**Files:**
- Create: `components/portfolio/AddPositionModal.tsx`

- [ ] **Step 1: Create `components/portfolio/AddPositionModal.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Holding } from '@/lib/portfolio/types'
import { COLORS, MONO } from './styles'

interface Suggestion {
  symbol: string
  name: string
}

interface Props {
  userId: string
  existing?: Holding
  existingByTicker: Record<string, Holding>
  onClose: () => void
  onSaved: () => void
}

export default function AddPositionModal({ userId, existing, existingByTicker, onClose, onSaved }: Props) {
  const openedInEditMode = !!existing
  const [matchedExisting, setMatchedExisting] = useState<Holding | undefined>(existing)
  const isEdit = !!matchedExisting
  const [ticker, setTicker] = useState(existing?.ticker ?? '')
  const [tickerResolved, setTickerResolved] = useState<boolean>(openedInEditMode)
  const [shares, setShares] = useState(existing ? String(existing.shares) : '')
  const [avgCost, setAvgCost] = useState(existing ? String(existing.avg_cost) : '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  const fetchSuggestions = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const upper = value.toUpperCase()
    if (!upper) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(upper)}`)
        const json = (await res.json()) as Suggestion[]
        setSuggestions(json ?? [])
        setHighlightedIdx(-1)
      } catch {
        setSuggestions([])
      }
    }, 180)
  }

  const onTickerChange = (value: string) => {
    const upper = value.toUpperCase()
    setTicker(upper)
    setTickerResolved(false)
    setError(null)
    // If we had auto-matched an existing row but the user is now editing
    // the ticker field, drop out of edit mode (unless the modal was opened
    // in explicit edit mode for that row).
    if (!openedInEditMode) {
      setMatchedExisting(undefined)
      setShares('')
      setAvgCost('')
    }
    fetchSuggestions(upper)
  }

  const chooseSuggestion = (s: Suggestion) => {
    setTicker(s.symbol)
    setTickerResolved(true)
    setSuggestions([])
    setHighlightedIdx(-1)
    // If this ticker is already in the portfolio, switch into edit mode
    // and pre-fill shares + avg cost from the existing row.
    const match = existingByTicker[s.symbol]
    if (match && !openedInEditMode) {
      setMatchedExisting(match)
      setShares(String(match.shares))
      setAvgCost(String(match.avg_cost))
      setError(null)
    }
  }

  const validate = (): string | null => {
    if (!ticker.trim()) return 'Ticker is required.'
    if (!tickerResolved) return 'Select a ticker from the dropdown.'
    const sharesNum = Number(shares)
    const costNum = Number(avgCost)
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) return 'Shares must be greater than 0.'
    if (!Number.isFinite(costNum) || costNum <= 0) return 'Avg cost must be greater than 0.'
    return null
  }

  const save = async () => {
    const msg = validate()
    if (msg) { setError(msg); return }
    setSaving(true)
    setError(null)
    const payload = {
      user_id: userId,
      ticker: ticker.trim().toUpperCase(),
      shares: Number(shares),
      avg_cost: Number(avgCost),
      updated_at: new Date().toISOString(),
    }
    const { error: dbError } = await supabase
      .from('holdings')
      .upsert(payload, { onConflict: 'user_id,ticker' })
    setSaving(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    onSaved()
    onClose()
  }

  const del = async () => {
    if (!matchedExisting) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      setTimeout(() => setConfirmingDelete(false), 3000)
      return
    }
    setDeleting(true)
    const { error: dbError } = await supabase
      .from('holdings')
      .delete()
      .eq('id', matchedExisting.id)
    setDeleting(false)
    if (dbError) { setError(dbError.message); return }
    onSaved()
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 220,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div ref={containerRef} style={{
        background: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 4,
        width: '100%', maxWidth: 440,
        margin: '0 20px',
        padding: '20px 24px',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: 14, borderBottom: `1px solid ${COLORS.border}`,
          marginBottom: 18,
        }}>
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
            {isEdit ? 'EDIT POSITION' : 'ADD POSITION'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.textMuted, fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {/* Ticker */}
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <div style={{ fontSize: 12, color: COLORS.textDim, fontFamily: MONO, letterSpacing: '0.05em', marginBottom: 6 }}>
            TICKER
          </div>
          <input
            type="text"
            value={ticker}
            disabled={openedInEditMode}
            onChange={e => onTickerChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIdx(i => Math.min(i + 1, suggestions.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIdx(i => Math.max(i - 1, -1)) }
              else if (e.key === 'Enter' && highlightedIdx >= 0) {
                e.preventDefault()
                chooseSuggestion(suggestions[highlightedIdx])
              }
            }}
            placeholder="AAPL"
            style={{
              width: '100%',
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLORS.text,
              fontFamily: MONO,
              fontSize: 13,
              letterSpacing: '0.05em',
              outline: 'none',
              opacity: openedInEditMode ? 0.6 : 1,
            }}
          />
          {isEdit && !openedInEditMode && (
            <div style={{
              marginTop: 6, fontSize: 10, color: COLORS.warn,
              fontFamily: MONO, letterSpacing: '0.05em',
            }}>
              You already own {ticker}. Saving will update your existing position.
            </div>
          )}
          {!isEdit && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: COLORS.bg,
              border: `1px solid ${COLORS.borderStrong}`,
              borderTop: 'none',
              borderRadius: '0 0 3px 3px',
              zIndex: 5,
              maxHeight: 240,
              overflowY: 'auto',
            }}>
              {suggestions.map((s, i) => (
                <div
                  key={s.symbol}
                  onMouseDown={e => { e.preventDefault(); chooseSuggestion(s) }}
                  onMouseEnter={() => setHighlightedIdx(i)}
                  style={{
                    display: 'flex', gap: 10, padding: '8px 12px',
                    background: highlightedIdx === i ? 'rgba(255,255,255,0.05)' : 'transparent',
                    cursor: 'pointer',
                    borderTop: i > 0 ? `1px solid ${COLORS.divider}` : 'none',
                  }}
                >
                  <span style={{ color: COLORS.text, fontFamily: MONO, fontSize: 12, minWidth: 56 }}>{s.symbol}</span>
                  <span style={{ color: COLORS.textFaint, fontFamily: MONO, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Shares */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: COLORS.textDim, fontFamily: MONO, letterSpacing: '0.05em', marginBottom: 6 }}>
            SHARES
          </div>
          <input
            type="number"
            step="any"
            value={shares}
            onChange={e => { setShares(e.target.value); setError(null) }}
            placeholder="50"
            style={{
              width: '100%',
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLORS.text,
              fontFamily: MONO,
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {/* Avg Cost */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: COLORS.textDim, fontFamily: MONO, letterSpacing: '0.05em', marginBottom: 6 }}>
            AVG COST (USD)
          </div>
          <input
            type="number"
            step="any"
            value={avgCost}
            onChange={e => { setAvgCost(e.target.value); setError(null) }}
            placeholder="185.50"
            style={{
              width: '100%',
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLORS.text,
              fontFamily: MONO,
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {error && (
          <div style={{ color: COLORS.neg, fontSize: 11, fontFamily: MONO, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {/* Action row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div>
            {isEdit && (
              <button
                onClick={del}
                disabled={deleting}
                style={{
                  background: confirmingDelete ? 'rgba(248,113,113,0.15)' : 'transparent',
                  border: `1px solid ${confirmingDelete ? 'rgba(248,113,113,0.5)' : COLORS.borderStrong}`,
                  color: confirmingDelete ? COLORS.neg : COLORS.textMuted,
                  borderRadius: 3, fontSize: 11,
                  padding: '7px 14px', fontFamily: MONO,
                  letterSpacing: '0.1em', cursor: 'pointer',
                }}
              >
                {deleting ? 'DELETING...' : confirmingDelete ? 'CONFIRM DELETE' : 'DELETE'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.borderStrong}`,
                color: COLORS.textDim,
                borderRadius: 3, fontSize: 11,
                padding: '7px 14px', fontFamily: MONO,
                letterSpacing: '0.1em', cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: `1px solid rgba(255,255,255,0.3)`,
                color: COLORS.text,
                borderRadius: 3, fontSize: 11,
                padding: '7px 18px', fontFamily: MONO,
                letterSpacing: '0.1em', cursor: 'pointer',
              }}
            >
              {saving ? 'SAVING...' : isEdit ? 'UPDATE' : 'SAVE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add components/portfolio/AddPositionModal.tsx
git commit -m "feat(portfolio): add AddPositionModal"
```

---

## Task 9: HoldingsTable component

**Files:**
- Create: `components/portfolio/HoldingsTable.tsx`

- [ ] **Step 1: Create `components/portfolio/HoldingsTable.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { EnrichedHolding } from '@/lib/portfolio/types'
import { COLORS, MONO, fmtUsd, fmtPct, fmtNumber, signColor } from './styles'

interface Props {
  holdings: EnrichedHolding[]
  onRowClick: (holding: EnrichedHolding) => void
  onDelete: (holding: EnrichedHolding) => void
}

const HEADERS = [
  { key: 'ticker',    label: 'TICKER',    align: 'left'  as const, mobile: true  },
  { key: 'shares',    label: 'SHARES',    align: 'right' as const, mobile: true  },
  { key: 'avg_cost',  label: 'AVG COST',  align: 'right' as const, mobile: false },
  { key: 'price',     label: 'PRICE',     align: 'right' as const, mobile: true  },
  { key: 'mkt_value', label: 'MKT VALUE', align: 'right' as const, mobile: false },
  { key: 'pl',        label: 'P/L',       align: 'right' as const, mobile: true  },
  { key: 'weight',    label: 'WEIGHT',    align: 'right' as const, mobile: false },
]

export default function HoldingsTable({ holdings, onRowClick, onDelete }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const startDelete = (e: React.MouseEvent, h: EnrichedHolding) => {
    e.stopPropagation()
    if (confirmId === h.id) {
      setConfirmId(null)
      onDelete(h)
      return
    }
    setConfirmId(h.id)
    setTimeout(() => setConfirmId(prev => (prev === h.id ? null : prev)), 3000)
  }

  return (
    <div style={{
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4,
      padding: '14px 16px',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}`,
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          HOLDINGS · {holdings.length} POSITION{holdings.length === 1 ? '' : 'S'}
        </span>
      </div>

      {/* Header row */}
      <div className="holdings-head" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 0.6fr 0.7fr 0.7fr 0.9fr 0.9fr 0.6fr 24px',
        padding: '8px 4px',
        fontSize: 9,
        color: COLORS.textMuted,
        fontFamily: MONO,
        letterSpacing: '0.12em',
        borderBottom: `1px solid ${COLORS.divider}`,
      }}>
        {HEADERS.map(h => (
          <div key={h.key} className={h.mobile ? '' : 'holdings-col-hideable'} style={{ textAlign: h.align }}>{h.label}</div>
        ))}
        <div />
      </div>

      {holdings.map(h => {
        const isHover = hoverId === h.id
        const isConfirming = confirmId === h.id
        return (
          <div
            key={h.id}
            className="holdings-row"
            onClick={() => onRowClick(h)}
            onMouseEnter={() => setHoverId(h.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 0.6fr 0.7fr 0.7fr 0.9fr 0.9fr 0.6fr 24px',
              alignItems: 'center',
              padding: '10px 4px',
              fontSize: 12,
              fontFamily: MONO,
              color: COLORS.text,
              borderBottom: `1px solid ${COLORS.divider}`,
              cursor: 'pointer',
              background: isHover ? 'rgba(255,255,255,0.02)' : 'transparent',
              transition: 'background 0.1s ease',
            }}
          >
            <div style={{ letterSpacing: '0.05em' }}>{h.ticker}</div>
            <div style={{ textAlign: 'right', color: COLORS.textDim }}>{fmtNumber(h.shares, h.shares % 1 === 0 ? 0 : 4)}</div>
            <div className="holdings-col-hideable" style={{ textAlign: 'right', color: COLORS.textDim }}>{fmtUsd(h.avg_cost)}</div>
            <div style={{ textAlign: 'right', color: h.snapshot?.price != null ? COLORS.text : COLORS.textFaint }}>
              {h.snapshot?.price != null ? fmtUsd(h.snapshot.price) : 'N/A'}
            </div>
            <div className="holdings-col-hideable" style={{ textAlign: 'right' }}>
              {h.marketValue != null ? fmtUsd(h.marketValue) : 'N/A'}
            </div>
            <div style={{ textAlign: 'right', color: signColor(h.plDollar), lineHeight: 1.3 }}>
              <div>{h.plDollar != null ? fmtUsd(h.plDollar, { signed: true }) : 'N/A'}</div>
              <div style={{ fontSize: 10, opacity: 0.8 }}>
                {h.plPercent != null ? fmtPct(h.plPercent, { signed: true }) : ''}
              </div>
            </div>
            <div className="holdings-col-hideable" style={{ textAlign: 'right', color: COLORS.textDim }}>
              {h.weight != null ? fmtPct(h.weight, { digits: 1 }) : '—'}
            </div>
            <div style={{ textAlign: 'right' }}>
              <button
                onClick={e => startDelete(e, h)}
                aria-label={isConfirming ? 'Confirm delete' : 'Delete position'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isConfirming ? COLORS.neg : (isHover ? COLORS.textMuted : 'transparent'),
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: isConfirming ? 9 : 14,
                  fontFamily: MONO,
                  letterSpacing: '0.1em',
                  transition: 'color 0.15s ease',
                }}
              >
                {isConfirming ? 'CONFIRM' : '🗑'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add components/portfolio/HoldingsTable.tsx
git commit -m "feat(portfolio): add HoldingsTable component"
```

---

## Task 10: AllocationChart component

**Files:**
- Create: `components/portfolio/AllocationChart.tsx`

- [ ] **Step 1: Create `components/portfolio/AllocationChart.tsx`**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { EnrichedHolding } from '@/lib/portfolio/types'
import { computePositionAllocation, computeSectorAllocation } from '@/lib/portfolio/metrics'
import { COLORS, MONO, PIE_PALETTE, fmtPct } from './styles'

interface Props {
  holdings: EnrichedHolding[]
}

type Mode = 'sector' | 'position'

export default function AllocationChart({ holdings }: Props) {
  const [mode, setMode] = useState<Mode>('sector')
  const data = useMemo(
    () => (mode === 'sector' ? computeSectorAllocation(holdings) : computePositionAllocation(holdings)),
    [holdings, mode]
  )

  return (
    <div style={{
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4,
      padding: '14px 16px',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 8,
      }}>
        <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          ALLOCATION
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['sector', 'position'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: mode === m ? COLORS.text : COLORS.textMuted,
                fontSize: 9, fontFamily: MONO, letterSpacing: '0.15em',
                padding: '2px 0',
                borderBottom: mode === m ? `1px solid ${COLORS.text}` : '1px solid transparent',
              }}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div style={{
          padding: '32px 0', textAlign: 'center',
          color: COLORS.textFaint, fontSize: 11, fontFamily: MONO,
        }}>
          No data
        </div>
      ) : (
        <>
          <div style={{ width: '100%', height: 160 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={38}
                  outerRadius={70}
                  stroke="#0a0a0a"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#0a0a0a',
                    border: `1px solid ${COLORS.borderStrong}`,
                    borderRadius: 3,
                    fontFamily: MONO,
                    fontSize: 11,
                    color: COLORS.text,
                  }}
                  formatter={(value: number, _name: string, item: any) =>
                    [`${fmtPct(item.payload.percent)} · $${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, item.payload.label]
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.map((slice, i) => (
              <div key={slice.label} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 10, fontFamily: MONO,
              }}>
                <span style={{ color: COLORS.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                    background: PIE_PALETTE[i % PIE_PALETTE.length],
                  }} />
                  {slice.label}
                </span>
                <span style={{ color: COLORS.text }}>{fmtPct(slice.percent, { digits: 1 })}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add components/portfolio/AllocationChart.tsx
git commit -m "feat(portfolio): add AllocationChart with sector/position toggle"
```

---

## Task 11: TopMovers component

**Files:**
- Create: `components/portfolio/TopMovers.tsx`

- [ ] **Step 1: Create `components/portfolio/TopMovers.tsx`**

```tsx
'use client'

import type { EnrichedHolding } from '@/lib/portfolio/types'
import { COLORS, MONO, fmtUsd, fmtPct } from './styles'

interface Props {
  winners: EnrichedHolding[]
  losers: EnrichedHolding[]
}

function Row({ h, positive }: { h: EnrichedHolding; positive: boolean }) {
  const pctColor = positive ? COLORS.pos : COLORS.neg
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto auto',
      gap: 8,
      padding: '4px 0',
      fontSize: 11,
      fontFamily: MONO,
      borderBottom: `1px solid ${COLORS.divider}`,
    }}>
      <span style={{ color: COLORS.text, letterSpacing: '0.05em' }}>{h.ticker}</span>
      <span style={{ color: pctColor, textAlign: 'right' }}>
        {fmtPct(h.dayChangePercent, { signed: true, digits: 2 })}
      </span>
      <span style={{ color: COLORS.textMuted, textAlign: 'right', fontSize: 10 }}>
        {fmtUsd(h.dayChangeDollar, { signed: true })}
      </span>
    </div>
  )
}

export default function TopMovers({ winners, losers }: Props) {
  return (
    <div style={{
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4,
      padding: '14px 16px',
    }}>
      <div style={{
        paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 10,
      }}>
        <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          TOP MOVERS TODAY
        </span>
      </div>

      {winners.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em', marginBottom: 4 }}>
            WINNERS
          </div>
          {winners.map(h => <Row key={h.id} h={h} positive />)}
        </>
      )}

      {losers.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em', margin: `${winners.length > 0 ? 10 : 0}px 0 4px` }}>
            LOSERS
          </div>
          {losers.map(h => <Row key={h.id} h={h} positive={false} />)}
        </>
      )}

      {winners.length === 0 && losers.length === 0 && (
        <div style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: MONO, textAlign: 'center', padding: '12px 0' }}>
          No moves yet today
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add components/portfolio/TopMovers.tsx
git commit -m "feat(portfolio): add TopMovers component"
```

---

## Task 12: RiskMetrics component

**Files:**
- Create: `components/portfolio/RiskMetrics.tsx`

- [ ] **Step 1: Create `components/portfolio/RiskMetrics.tsx`**

```tsx
'use client'

import type { RiskStats } from '@/lib/portfolio/types'
import { COLORS, MONO, fmtNumber, fmtPct } from './styles'

interface Props {
  stats: RiskStats
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, color: COLORS.text, fontFamily: MONO, marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}

export default function RiskMetrics({ stats }: Props) {
  return (
    <div style={{
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4,
      padding: '14px 16px',
    }}>
      <div style={{
        paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 12,
      }}>
        <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          RISK METRICS
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Stat label="BETA" value={fmtNumber(stats.beta, 2)} />
        <Stat label="VOL 30D" value={stats.volatility30d != null ? fmtPct(stats.volatility30d, { digits: 1 }) : '—'} />
      </div>
      <div style={{ paddingTop: 10, borderTop: `1px solid ${COLORS.divider}` }}>
        <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          TOP HOLDING
        </div>
        <div style={{ fontSize: 13, color: COLORS.text, fontFamily: MONO, marginTop: 4 }}>
          {stats.topHoldingTicker ?? '—'}
          {stats.topHoldingWeight != null && (
            <span style={{ color: COLORS.textDim }}> · {fmtPct(stats.topHoldingWeight, { digits: 1 })}</span>
          )}
        </div>
      </div>
      <div style={{ paddingTop: 10, marginTop: 10, borderTop: `1px solid ${COLORS.divider}` }}>
        <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          TOP 3 CONCENTRATION
        </div>
        <div style={{ fontSize: 13, color: COLORS.text, fontFamily: MONO, marginTop: 4 }}>
          {stats.top3Concentration != null ? fmtPct(stats.top3Concentration, { digits: 1 }) : '—'}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add components/portfolio/RiskMetrics.tsx
git commit -m "feat(portfolio): add RiskMetrics component"
```

---

## Task 13: PortfolioPage container

**Files:**
- Create: `components/portfolio/PortfolioPage.tsx`

This is the orchestrator. It owns holdings state, snapshot state, polling, modal state, and wires everything together.

- [ ] **Step 1: Create `components/portfolio/PortfolioPage.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { EnrichedHolding, Holding, SnapshotMap } from '@/lib/portfolio/types'
import {
  enrichHoldings,
  computeTotals,
  computeTopMovers,
  computeRiskStats,
} from '@/lib/portfolio/metrics'
import EmptyState from './EmptyState'
import SummaryCards from './SummaryCards'
import HoldingsTable from './HoldingsTable'
import AllocationChart from './AllocationChart'
import TopMovers from './TopMovers'
import RiskMetrics from './RiskMetrics'
import AddPositionModal from './AddPositionModal'
import { COLORS, MONO } from './styles'

const PORTFOLIO_POLL_MS = 60_000

interface Props {
  session: Session
}

export default function PortfolioPage({ session }: Props) {
  const userId = session.user.id

  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loadingHoldings, setLoadingHoldings] = useState(true)
  const [holdingsError, setHoldingsError] = useState<string | null>(null)

  const [snapshots, setSnapshots] = useState<SnapshotMap>({})
  const [lastSnapshotAt, setLastSnapshotAt] = useState<number | null>(null)
  const [snapshotStale, setSnapshotStale] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Holding | undefined>(undefined)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load holdings from Supabase
  const loadHoldings = useCallback(async () => {
    setHoldingsError(null)
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    setLoadingHoldings(false)
    if (error) {
      setHoldingsError(error.message)
      return
    }
    setHoldings((data ?? []) as Holding[])
  }, [userId])

  useEffect(() => { loadHoldings() }, [loadHoldings])

  // Fetch snapshot for current tickers
  const fetchSnapshot = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) {
      setSnapshots({})
      setSnapshotStale(false)
      setLastSnapshotAt(Date.now())
      return
    }
    try {
      const res = await fetch(`/api/portfolio-snapshot?tickers=${encodeURIComponent(tickers.join(','))}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as SnapshotMap
      setSnapshots(json)
      setSnapshotStale(false)
      setLastSnapshotAt(Date.now())
    } catch (err) {
      console.error('[portfolio] snapshot fetch failed:', err)
      setSnapshotStale(true)
    }
  }, [])

  // Initial snapshot on holdings change
  useEffect(() => {
    const tickers = holdings.map(h => h.ticker)
    fetchSnapshot(tickers)
  }, [holdings, fetchSnapshot])

  // Polling (with visibility pause)
  useEffect(() => {
    const tickers = holdings.map(h => h.ticker)
    if (tickers.length === 0) return

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      fetchSnapshot(tickers)
    }

    pollRef.current = setInterval(tick, PORTFOLIO_POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [holdings, fetchSnapshot])

  // Derived data
  const enriched: EnrichedHolding[] = useMemo(
    () => enrichHoldings(holdings, snapshots),
    [holdings, snapshots]
  )
  const totals = useMemo(() => computeTotals(enriched), [enriched])
  const movers = useMemo(() => computeTopMovers(enriched, 3), [enriched])
  const risk = useMemo(() => computeRiskStats(enriched), [enriched])
  const holdingsByTicker = useMemo(() => {
    const m: Record<string, Holding> = {}
    for (const h of holdings) m[h.ticker] = h
    return m
  }, [holdings])

  // Modal handlers
  const openAdd = () => { setEditing(undefined); setModalOpen(true) }
  const openEdit = (h: EnrichedHolding) => {
    const original = holdings.find(x => x.id === h.id)
    if (original) { setEditing(original); setModalOpen(true) }
  }
  const closeModal = () => { setModalOpen(false); setEditing(undefined) }
  const onSaved = () => { loadHoldings() }

  const deleteHolding = async (h: EnrichedHolding) => {
    const { error } = await supabase.from('holdings').delete().eq('id', h.id)
    if (error) { console.error('[portfolio] delete failed:', error); return }
    loadHoldings()
  }

  // Subtitle text
  const subtitle = (() => {
    if (loadingHoldings) return 'Loading…'
    const n = holdings.length
    if (n === 0) return 'No positions yet.'
    const countStr = `${n} position${n === 1 ? '' : 's'}`
    if (!lastSnapshotAt) return `${countStr} · live`
    const ts = new Date(lastSnapshotAt).toLocaleTimeString('en-US', { hour12: false })
    return `${countStr} · updated ${ts} ET${snapshotStale ? ' · stale' : ''}`
  })()

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .portfolio-main-grid { grid-template-columns: 1fr !important; }
          .portfolio-summary-row { grid-template-columns: 1fr 1fr !important; }
          .portfolio-hero-row { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
          .portfolio-add-btn { align-self: flex-start !important; }
          .holdings-col-hideable { display: none !important; }
        }
      `}</style>

      <div className="main-content" style={{
        padding: '40px clamp(24px, 3vw, 64px) 60px',
        maxWidth: 1800, margin: '0 auto',
        animation: 'fadeIn 0.3s ease',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}>
        {/* Hero row: title + add button */}
        <div className="portfolio-hero-row" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        }}>
          <div>
            <h1 className="hero-title" style={{
              fontSize: 64, fontWeight: 700, color: COLORS.text,
              letterSpacing: '0.08em', fontFamily: MONO,
              margin: 0, lineHeight: 1,
            }}>
              PORTFOLIO
            </h1>
            <div style={{
              fontSize: 11, color: COLORS.textMuted,
              fontFamily: MONO, letterSpacing: '0.1em',
              marginTop: 14,
            }}>
              {subtitle}
            </div>
          </div>
          <button
            className="portfolio-add-btn"
            onClick={openAdd}
            style={{
              background: 'transparent',
              border: `1px solid ${COLORS.borderStrong}`,
              borderRadius: 4,
              color: COLORS.textDim,
              fontSize: 12,
              padding: '9px 18px',
              fontFamily: MONO,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { (e.currentTarget).style.color = '#fff'; (e.currentTarget).style.borderColor = '#444' }}
            onMouseLeave={e => { (e.currentTarget).style.color = COLORS.textDim; (e.currentTarget).style.borderColor = COLORS.borderStrong }}
          >
            + ADD POSITION
          </button>
        </div>

        {holdingsError && (
          <div style={{
            marginTop: 28,
            background: 'rgba(248,113,113,0.05)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 4, padding: '12px 16px',
            color: COLORS.neg, fontSize: 12, fontFamily: MONO,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Failed to load holdings: {holdingsError}</span>
            <button
              onClick={loadHoldings}
              style={{
                background: 'none', border: 'none', color: COLORS.neg, cursor: 'pointer',
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textDecoration: 'underline',
              }}
            >
              RETRY
            </button>
          </div>
        )}

        {!loadingHoldings && !holdingsError && holdings.length === 0 ? (
          <EmptyState onAddClick={openAdd} />
        ) : (
          <>
            <SummaryCards totals={totals} />
            <div className="portfolio-main-grid" style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: 16,
              marginTop: 4,
            }}>
              <HoldingsTable
                holdings={enriched}
                onRowClick={openEdit}
                onDelete={deleteHolding}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <AllocationChart holdings={enriched} />
                <TopMovers winners={movers.winners} losers={movers.losers} />
                <RiskMetrics stats={risk} />
              </div>
            </div>
          </>
        )}

        {modalOpen && (
          <AddPositionModal
            userId={userId}
            existing={editing}
            existingByTicker={holdingsByTicker}
            onClose={closeModal}
            onSaved={onSaved}
          />
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add components/portfolio/PortfolioPage.tsx
git commit -m "feat(portfolio): add PortfolioPage container"
```

---

## Task 14: Integrate Portfolio tab into `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

Three changes: widen `activeTab` type, add `'Portfolio'` between Dashboard and Watchlist in both nav arrays, and render `<PortfolioPage>` when active.

- [ ] **Step 1: Widen `activeTab` type union**

In `app/page.tsx`, find line ~33 and ~51.

Replace:
```ts
  defaultTab: 'Dashboard' as 'Dashboard' | 'Watchlist',
```
with:
```ts
  defaultTab: 'Dashboard' as 'Dashboard' | 'Watchlist' | 'Portfolio',
```

Replace:
```ts
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Watchlist'>('Dashboard')
```
with:
```ts
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Watchlist' | 'Portfolio'>('Dashboard')
```

- [ ] **Step 2: Import PortfolioPage**

In `app/page.tsx`, find the existing dynamic import line near the top (~line 18):

```tsx
const SectorHeatmap = dynamic(() => import('@/components/SectorHeatmap'), { ssr: false })
```

Add below it:

```tsx
const PortfolioPage = dynamic(() => import('@/components/portfolio/PortfolioPage'), { ssr: false })
```

- [ ] **Step 3: Add `'Portfolio'` to desktop nav array**

Find the desktop nav links array (~line 579):

```tsx
            {(['Dashboard', 'Watchlist'] as const).map(tab => {
```

Replace with:

```tsx
            {(['Dashboard', 'Portfolio', 'Watchlist'] as const).map(tab => {
```

- [ ] **Step 4: Add `'Portfolio'` to mobile nav array**

Find the mobile menu tabs array (~line 686):

```tsx
            {(['Dashboard', 'Watchlist'] as const).map(tab => (
```

Replace with:

```tsx
            {(['Dashboard', 'Portfolio', 'Watchlist'] as const).map(tab => (
```

- [ ] **Step 5: Render `<PortfolioPage>` between Dashboard and Watchlist blocks**

Find the end of the Dashboard block (~line 930, closing `{activeTab === 'Dashboard' && (...)}`):

```tsx
          </div>
        )}

        {/* ══ WATCHLIST ══ */}
        {activeTab === 'Watchlist' && (
```

Insert a Portfolio block in between so it reads:

```tsx
          </div>
        )}

        {/* ══ PORTFOLIO ══ */}
        {activeTab === 'Portfolio' && session && (
          <PortfolioPage session={session} />
        )}

        {/* ══ WATCHLIST ══ */}
        {activeTab === 'Watchlist' && (
```

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 7: Build the project**

Run: `npm run build`
Expected: Next.js build succeeds without type errors or warnings related to these files.

- [ ] **Step 8: Manual smoke test**

Run: `npm run dev`
Open: `http://localhost:3000`

Verify:
- Desktop nav shows **Dashboard | Portfolio | Watchlist** in that order
- Clicking `Portfolio` renders the empty state CTA
- Mobile hamburger menu (resize to <768px) also shows all three
- No console errors

- [ ] **Step 9: Commit**

```bash
git add app/page.tsx
git commit -m "feat(portfolio): add Portfolio tab to app navigation"
```

---

## Task 15: Widen "Default tab" setting to include Portfolio

**Files:**
- Modify: `components/SettingsModal.tsx`

- [ ] **Step 1: Update the DEFAULT TAB button row**

In `components/SettingsModal.tsx`, find (~line 170):

```tsx
                    {(['Dashboard', 'Watchlist'] as const).map(tab => (
                      <button key={tab} onClick={() => updateSettings({ defaultTab: tab })} style={BTN(settings.defaultTab === tab)}>
                        {tab.toUpperCase()}
                      </button>
                    ))}
```

Replace with:

```tsx
                    {(['Dashboard', 'Portfolio', 'Watchlist'] as const).map(tab => (
                      <button key={tab} onClick={() => updateSettings({ defaultTab: tab })} style={BTN(settings.defaultTab === tab)}>
                        {tab.toUpperCase()}
                      </button>
                    ))}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Manual smoke test**

With `npm run dev` running, open Settings → General. Verify three buttons: **DASHBOARD · PORTFOLIO · WATCHLIST**. Clicking PORTFOLIO should highlight it, and reloading the page should land on the Portfolio tab.

- [ ] **Step 4: Commit**

```bash
git add components/SettingsModal.tsx
git commit -m "feat(portfolio): allow Portfolio as default tab in settings"
```

---

## Task 16: End-to-end manual verification

**Files:** none (browser-only validation)

Walk through every scenario from the spec's Testing section. For each, record PASS/FAIL before moving on. Fix any FAIL by returning to the relevant task.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Sign in with a valid Supabase account so `session` is present.

- [ ] **Step 2: CRUD flow**

- Click **+ ADD POSITION**. Type `AAPL` — dropdown appears. Select Apple.
- Enter shares `50`, avg cost `150`. Click **SAVE**.
- Row should appear in the holdings table.
- Repeat with 2–3 more tickers (e.g. `NVDA`, `SPY`, `TSLA`).
- Click a row → edit modal opens pre-filled. Change shares; **UPDATE**. Row updates.
- Hover a row → trash icon appears. Click once → it becomes "CONFIRM". Click again → row deleted. Wait 3 seconds after a first click and verify it reverts.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 3: Duplicate ticker**

- Click **+ ADD POSITION**. Type a ticker you already own and select it from the dropdown.
- Verify: shares and avg cost fields auto-populate with current values, the warn message "You already own X. Saving will update your existing position." appears, and the primary button reads **UPDATE**.
- Change the shares value, click **UPDATE**.
- Verify: no duplicate row in the table; the existing row's values are updated.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 4: Summary math**

- Pick a position, multiply shares × current price → verify it appears in the ticker's row.
- Sum all market values → verify matches TOTAL VALUE.
- TOTAL P/L should equal TOTAL VALUE − TOTAL COST.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 5: Holdings table weights**

- Sum the WEIGHT column → should be ~100% (±0.1% rounding).
- Rows are ordered by MKT VALUE descending.
- P/L cell is green when positive, red when negative.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 6: Allocation chart toggle**

- Default tab is **SECTOR**. Pie shows sector grouping.
- Click **POSITION**. Pie shows one slice per ticker.
- Legend below updates to match.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 7: Top movers**

- Verify winners are sorted most-positive-first; losers are sorted most-negative-first.
- If fewer than 3 positive movers exist, verify no phantom rows appear.
- Temporarily delete all but one position with a positive day change → verify only that one appears under WINNERS and LOSERS shows no rows.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 8: Risk metrics**

- Beta is a number around 0.5–2.0 (typical range).
- Vol 30d is a percent (e.g. "18.4%").
- TOP HOLDING matches the row with the largest market value.
- TOP 3 CONCENTRATION is ≥ TOP HOLDING's weight and ≤ 100%.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 9: Polling**

- Open browser devtools → Network tab. Filter by `portfolio-snapshot`.
- Leave the tab open for 65–70 seconds.
- Verify a second request fires ~60s after the first.
- Verify the subtitle "updated HH:MM:SS ET" increments.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 10: Visibility pause**

- Switch to a different browser tab and wait 2 minutes.
- Return. Check Network — **no** `portfolio-snapshot` requests fired while hidden.
- A new one should fire on the next interval after returning.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 11: Empty state**

- Delete all positions (confirm twice each).
- Verify empty-state CTA appears centered with "Your portfolio is empty."

Record: ☐ PASS ☐ FAIL

- [ ] **Step 12: Invalid ticker**

- Click **+ ADD POSITION**. Type gibberish (e.g. `ZZZZZZZZ`) without selecting a dropdown entry.
- Enter shares + cost. Click **SAVE**.
- Expect error: "Select a ticker from the dropdown."

Record: ☐ PASS ☐ FAIL

- [ ] **Step 13: API failure handling**

- In devtools → Network → right-click `/api/portfolio-snapshot` → **Block request URL**.
- Wait for the next poll.
- Verify prices don't go blank. Subtitle shows "stale".
- Unblock and verify next poll clears "stale".

Record: ☐ PASS ☐ FAIL

- [ ] **Step 14: Mobile layout**

- Resize window to ~375px wide.
- Summary cards collapse to 2×2.
- Right-rail widgets stack below the holdings table.
- Holdings table shows only Ticker · Shares · Price · P/L (Avg Cost, Mkt Value, Weight hidden).
- Add Position button appears below the title.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 15: Navigation + default tab**

- In Settings → General, set default tab to **PORTFOLIO** and close.
- Hard-refresh the page (Cmd/Ctrl+Shift+R).
- Portfolio tab is selected on load.
- Reset default to Dashboard afterwards.

Record: ☐ PASS ☐ FAIL

- [ ] **Step 16: Final build gate**

Run: `npm run build`
Expected: build succeeds with no new type errors or warnings.

- [ ] **Step 17: Commit the plan completion marker (optional)**

If any fixes were made during E2E, commit them. Otherwise nothing to do.

```bash
git status
# If changes exist:
# git add -A && git commit -m "fix(portfolio): e2e verification fixes"
```

---

## Completion checklist

When all tasks above are done, the following should all be true:

- [ ] `setup.sql` contains the `holdings` table + RLS
- [ ] `lib/portfolio/types.ts` and `lib/portfolio/metrics.ts` exist
- [ ] `/api/portfolio-snapshot` returns a JSON map for `?tickers=...`
- [ ] `components/portfolio/` contains: `styles.ts`, `EmptyState.tsx`, `SummaryCards.tsx`, `HoldingsTable.tsx`, `AllocationChart.tsx`, `TopMovers.tsx`, `RiskMetrics.tsx`, `AddPositionModal.tsx`, `PortfolioPage.tsx`
- [ ] `app/page.tsx` renders the tab in the correct position (Dashboard | Portfolio | Watchlist)
- [ ] `components/SettingsModal.tsx` allows Portfolio as default tab
- [ ] `npm run build` passes
- [ ] All 15 E2E scenarios in Task 16 pass
