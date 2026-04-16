# Portfolio Tab — Design Spec

**Date:** 2026-04-16
**Status:** Draft — pending user review

## Summary

Add a **Portfolio** tab between Dashboard and Watchlist. Users manually enter holdings (ticker + shares + avg cost). The page renders a live portfolio view: summary cards, holdings table, allocation chart (toggle sector ↔ position), day's top movers (3 winners / 3 losers), and risk metrics (beta, 30-day volatility, concentration). Visual design matches Sanctum's existing terminal aesthetic.

## Goals

- Let users track real holdings and live performance from inside Sanctum, without leaving for a broker app.
- Reuse existing patterns (Yahoo Finance on the server, Supabase for persistence, modal-driven editing, polling for live data).
- Keep the page self-contained so it can be built, tested, and maintained independently of Dashboard/Watchlist.

## Non-Goals (v1)

- Portfolio value over time (line chart)
- Transaction log, realized P/L, tax lots
- CSV import or broker integration (Plaid, etc.)
- Dividends, cash balances, deposits/withdrawals
- Multi-portfolio support

---

## Data Model

### Supabase table: `holdings`

```sql
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

**Uniqueness:** one row per (user, ticker). Adding the same ticker twice updates the existing row rather than creating a duplicate — the modal detects this and pre-fills with current values.

### TypeScript types

```ts
interface Holding {
  id: string
  user_id: string
  ticker: string
  shares: number
  avg_cost: number
  created_at: string
  updated_at: string
}

interface HoldingSnapshot {
  ticker: string
  price: number | null
  prevClose: number | null
  beta: number | null
  volatility30d: number | null   // annualized, from daily returns
  sector: string | null
  name: string | null
}

interface EnrichedHolding extends Holding {
  snapshot: HoldingSnapshot | null  // null if snapshot fetch failed for this ticker
  marketValue: number | null
  costBasis: number                 // shares * avg_cost
  plDollar: number | null
  plPercent: number | null
  dayChangeDollar: number | null
  dayChangePercent: number | null
  weight: number | null             // marketValue / totalValue
}
```

---

## Architecture

### Request flow

```
Page load
  → fetch holdings from Supabase (RLS-scoped to user)
  → call /api/portfolio-snapshot?tickers=T1,T2,...
  → merge snapshot into holdings → compute metrics client-side
  → render

Poll every N ms (user-adjustable)
  → re-call /api/portfolio-snapshot with same tickers
  → update state; keep last-good data if request fails
```

### New API route: `/api/portfolio-snapshot`

`GET /api/portfolio-snapshot?tickers=AAPL,NVDA,SPY`

- `force-dynamic` (no caching)
- 5-second timeout via `withTimeout` (matches existing pattern)
- Batched Yahoo Finance calls:
  - `quote()` → price, prevClose
  - `quoteSummary(..., ['summaryDetail', 'summaryProfile', 'defaultKeyStatistics'])` → beta, sector, name
  - `historical(..., { period1: 45 days ago, interval: '1d' })` → 30-day daily closes → compute annualized volatility
- Returns `Record<ticker, HoldingSnapshot>`. Missing tickers return `null` values rather than omitted keys.
- Serially calls with `Promise.allSettled` so one ticker failure doesn't kill the batch.

### Metric computations (client-side, pure)

In `lib/portfolio/metrics.ts`:

- `marketValue = shares * price`
- `costBasis = shares * avgCost`
- `plDollar = marketValue - costBasis`
- `plPercent = plDollar / costBasis`
- `dayChangeDollar = (price - prevClose) * shares` per holding; sum for portfolio
- `weight = marketValue / totalMarketValue`
- **Portfolio Beta** = `Σ(weight × holding.beta)`, skipping holdings with null beta, renormalizing weights across included holdings
- **Portfolio Volatility (30d annualized)** = `Σ(weight × holding.volatility30d)` (weighted average — approximation that ignores cross-holding correlation; documented limitation)
- **Concentration**:
  - Top holding: ticker with largest weight + that weight %
  - Top-3: sum of three largest weights
- **Top movers**: sort holdings by `dayChangePercent`; take top 3 and bottom 3. If fewer than 3 holdings exist on a side, show what's available.

Holdings with `null` snapshot fields are excluded from aggregates with a visible "N/A" indicator per affected metric.

---

## UI / Layout

Layout **A (Sidebar)** confirmed. All colors/fonts match existing palette (`#0a0a0a` bg, `#1a1a1a`/`#2a2a2a` borders, JetBrains Mono everywhere, green `#22c55e` / red `#ef4444` for gain/loss).

**Hero title:** the word `PORTFOLIO` styled to match the Dashboard's `SANCTUM` — JetBrains Mono, fontSize 64, fontWeight 700, letterSpacing `0.08em`, white, lineHeight 1. At `<768px` it follows the same `.hero-title` media-query rule already in `app/page.tsx` (fontSize 36, letterSpacing `0.2em`). No Instrument Serif on this page.

### Page structure

```
┌──────────────────────────────────────────────────────────────────┐
│  PORTFOLIO (JetBrains Mono 64px, like "SANCTUM")  [+ ADD POSITION]│
│  "8 positions · live" subtitle                                   │
├──────────────────────────────────────────────────────────────────┤
│  [TOTAL VALUE] [TOTAL COST] [TOTAL P/L] [DAY CHANGE]             │
├───────────────────────────────┬──────────────────────────────────┤
│                               │  ALLOCATION  [Sector | Position] │
│  HOLDINGS · N POSITIONS       │  (pie/donut chart)               │
│  TICKER SHARES AVG_COST       ├──────────────────────────────────┤
│  PRICE  MKT_VAL  P/L   W%     │  TOP MOVERS TODAY                │
│  ───────────────────────      │  Winners: 3 rows                 │
│  (rows, hover reveals trash)  │  Losers:  3 rows                 │
│                               ├──────────────────────────────────┤
│                               │  RISK METRICS                    │
│                               │  Beta | Vol 30d                  │
│                               │  Top Holding: SPY · 44.7%        │
│                               │  Top 3: 72.5%                    │
└───────────────────────────────┴──────────────────────────────────┘
```

- Main grid: two columns, `grid-template-columns: 2fr 1fr`, gap 16–20px.
- Each box: `border: 1px solid #1a1a1a`, `background: #0d0d0d`, thin header row with uppercase JetBrains Mono label.
- Summary cards: 4 columns, collapse to 2x2 on mobile.
- Section headers: same style as Dashboard's "RECENT REPORTS" divider.

### Holdings table

Columns: **TICKER · SHARES · AVG COST · PRICE · MKT VALUE · P/L · WEIGHT**. P/L cell shows both dollar and percent stacked (e.g. `+$1,120` on line 1, `+12.1%` on line 2), color-coded by sign. Plus a trash icon that fades in on row hover (rightmost cell).

- Click anywhere on a row (except the trash icon) → opens edit modal pre-filled with that holding's values.
- Trash icon: first click turns it into a red "CONFIRM" label for 3 seconds; second click deletes. If 3s elapses without a second click, it reverts. No separate confirm modal.
- Sort: default by market value desc; column headers are not clickable in v1 (keep it simple).

### Add/Edit Position Modal

Reuses SettingsModal visual language (dark overlay, centered panel, thin border). Fields:

- **Ticker** — text input with autocomplete dropdown backed by `/api/ticker-search` (same as the Dashboard search). Must resolve to a known equity/ETF; free-text not accepted.
- **Shares** — numeric input, must be > 0, allows decimals (for fractional shares).
- **Avg Cost** — numeric input, must be > 0, USD.
- Primary button: **SAVE** (or **UPDATE** in edit mode). Secondary: **CANCEL**. Edit mode shows a **DELETE** button on the lower-left (with confirm).
- On save: upsert to Supabase keyed on (user_id, ticker). On success, close modal and refresh holdings + snapshot.

### Allocation chart (tab toggle)

Two views of the same pie chart, swapped via a small tab toggle in the section header:

- **Sector** — groups holdings by `sector` from Yahoo, sums weights. Holdings with unknown sector get grouped into "Other".
- **Position** — one slice per ticker.

Uses Recharts (already in project). Colors cycle through a predefined palette of 8 muted-but-distinct values. Legend shown below the pie, each entry showing label + %.

### Top movers

Two sub-sections ("WINNERS" / "LOSERS"), each listing up to 3 rows:

```
AAPL  +2.8%  (+$184)
NVDA  +1.4%  (+$95)
```

Ticker, day %, absolute $ day change. Color-coded. No rows shown for a side that has nothing positive/negative.

### Risk metrics

Grid layout:

```
BETA      VOL 30D
1.12       18.4%

TOP HOLDING
SPY · 44.7%

TOP 3 CONCENTRATION
72.5%
```

Each metric in a small card with `.lbl` + `.val` styling.

### Empty state (no holdings)

Centered like the existing Dashboard and Watchlist empty states:

```
   [icon]
   Your portfolio is empty.
   Add a position to get started.
   [+ ADD POSITION]
```

### Mobile (< 768px)

- Summary cards collapse to 2×2
- Right-rail widgets stack below the holdings table (single column)
- Add Position button moves below the hero
- Holdings table: hide Avg Cost, Mkt Value, and Weight columns on narrow screens. Kept columns: Ticker, Shares, Price, P/L. Row click still opens the edit modal with full data.

---

## Settings Integration

One addition to `DEFAULT_SETTINGS`:

```ts
defaultTab: 'Dashboard' | 'Watchlist' | 'Portfolio'   // widen union
```

### SettingsModal changes

- Widen the existing **"Default tab"** option list to include `Portfolio` as a third choice.

No refresh-interval control in v1. Polling interval is a hardcoded constant in `PortfolioPage`. Making it user-adjustable is a deliberate follow-up, tracked in "Known Limitations" below.

---

## Refresh / Polling Behavior

- Fixed 60-second interval for v1 (constant `PORTFOLIO_POLL_MS = 60_000` in `PortfolioPage`).
- On each poll: re-fetch `/api/portfolio-snapshot` with current tickers. Supabase holdings are not re-fetched on every tick — only when the user adds/edits/deletes.
- If the request fails: keep last-good snapshot in state; show a subtle stale indicator in the hero row (e.g. "updated 14:32:05 ET · stale").
- Poll pauses when the page/tab is hidden (use `document.visibilityState`) to save requests.

---

## Error Handling

| Case | Behavior |
|---|---|
| Yahoo returns no quote for a ticker | `snapshot.price = null` → table shows "N/A"; ticker excluded from totals; warning dot next to row |
| `/api/portfolio-snapshot` fails entirely | Retain prior snapshot, show stale indicator, auto-retry on next tick |
| Supabase fetch of holdings fails | Show inline error panel with "Retry" button — no partial page |
| User submits modal with invalid ticker | Inline error "Select a ticker from the dropdown"; save disabled until valid |
| Yahoo is slow (>5s) | `withTimeout` aborts request; treated as "failed entirely" |

---

## File Layout

### New files

- `app/api/portfolio-snapshot/route.ts` — batch snapshot endpoint
- `components/portfolio/PortfolioPage.tsx` — top-level container; owns polling and state
- `components/portfolio/SummaryCards.tsx`
- `components/portfolio/HoldingsTable.tsx`
- `components/portfolio/AllocationChart.tsx`
- `components/portfolio/TopMovers.tsx`
- `components/portfolio/RiskMetrics.tsx`
- `components/portfolio/AddPositionModal.tsx`
- `components/portfolio/EmptyState.tsx`
- `lib/portfolio/metrics.ts` — pure metric-computation functions

### Modified files

- `app/page.tsx` — widen `activeTab` type union to include `'Portfolio'`, add it between Dashboard and Watchlist in both nav arrays (desktop + mobile), render `<PortfolioPage>` when active. Should remain lean — all portfolio logic lives in `PortfolioPage`.
- `components/SettingsModal.tsx` — widen default-tab options to include `Portfolio`. No new section.
- `setup.sql` — append `holdings` table + RLS policies (above).

### Why split PortfolioPage into multiple components

`app/page.tsx` is already a ~1050-line monolith. Adding the portfolio feature inline would worsen that. By keeping PortfolioPage and its widgets in `components/portfolio/`, each widget stays focused and independently testable, and `page.tsx` only grows by a few lines.

---

## Testing (manual — no test suite configured)

Per `CLAUDE.md`, verify via browser:

1. **CRUD:** add position (ticker autocomplete, shares, cost); edit by clicking row; delete via trash icon.
2. **Duplicate ticker:** adding an existing ticker opens edit modal instead of creating a duplicate.
3. **Summary math:** manually compute total value / P/L from inputs, verify cards match.
4. **Holdings table:** spot-check weights sum to ~100%; P/L colors match sign.
5. **Allocation toggle:** switch Sector ↔ Position; verify Sector bucketing is sensible.
6. **Top movers:** verify winners/losers ordering; test with <3 gainers to confirm no phantom rows.
7. **Risk metrics:** confirm beta/vol display; Top Holding matches largest row in table.
8. **Polling:** wait one minute, confirm prices re-fetch automatically.
9. **Visibility:** switch tabs/minimize; confirm polling pauses.
10. **Empty state:** delete all positions; verify CTA renders.
11. **Invalid ticker:** enter nonsense in modal; verify save blocked and message shown.
12. **Offline / API failure:** block `/api/portfolio-snapshot` in devtools; verify stale indicator, last-good data preserved.
13. **Mobile:** resize to <768px; verify 2×2 summary cards, stacked widgets, hidden columns.
14. **Navigation:** confirm Portfolio appears between Dashboard and Watchlist in desktop nav and mobile hamburger menu. Setting default tab to Portfolio works.

---

## Open Questions (for user review)

None currently — all decisions pinned in Q1–Q5. Flag anything in this spec that doesn't match your mental model.

## Known Limitations

- **Portfolio volatility uses a weighted average of individual 30-day volatilities** rather than the correlation-aware portfolio stdev. This overstates risk (ignores diversification). Acceptable for v1 — documented here so future work can upgrade if desired.
- **Cost basis is a single avg** rather than tax-lot level. Users with multiple buys at different prices must average manually. Upgrade path: transaction-log data model (out of scope for v1).
- **No historical portfolio chart in v1.** Adding one later would need either (a) daily snapshot cron or (b) the "derived from current holdings" approximation discussed during brainstorming.
- **Refresh interval is hardcoded at 60s in v1.** Exposing it in SettingsModal (and persisting via `user_settings.portfolioUpdateFreq`) is a planned follow-up.
