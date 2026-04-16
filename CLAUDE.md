# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:3000
npm run build     # Production build
npm run start     # Start production server
```

No test suite or linter is configured.

## Architecture

**Sanctum** is an AI-powered stock research terminal — a Next.js 14 App Router monolith backed by Supabase (auth + storage), Yahoo Finance (market data), and Anthropic Claude (AI analysis, `claude-sonnet-4-6` with adaptive thinking + web search).

### Top-level surfaces

- **`/`** (`app/page.tsx`) — Large client component holding all main state: tab system (`Dashboard` / `Watchlist` / `Portfolio`), auth session, settings, banner, saved reports list. Active tab persists to `localStorage` under `sanctum-active-tab`.
- **`/reports/[ticker]`** (`app/reports/[ticker]/page.tsx`) — Dedicated report page. Navigation target when the user clicks a saved report or generates a new one. Validates ticker against `/^[A-Z0-9.\-^=]{1,20}$/`.

### Report generation flow

`components/reports/StockReport.tsx` calls the `generateReport` server action (`app/actions/generateReport.ts`), which orchestrates: Yahoo Finance fetch → `computeQuantSignal` (quant pre-score) → `fetchMacroContext` (VIX/10Y/SPX/5Y) → Claude call (`claude-sonnet-4-6`, `thinking: {type: 'adaptive'}`, `web_search_20260209` tool, streamed) → `validateReport` (post-AI sanity check) → `resolveVerdict` (quant can veto the AI verdict by >1 notch of bullishness).

Verdict ranks: `AVOID=1 < SELL=2 < HOLD=3 < BUY=4`. The AI may always go more cautious than quant, but never more than one notch bullish above it. Internal variable names still say `gemini` (veto helper, merge comments, subtitle map) — functionally identical, just stale naming from the prior provider.

### API Routes (`app/api/`)

| Route | Purpose |
|---|---|
| `/api/chart` | Single-ticker intraday 5m chart + quote (24h window) |
| `/api/charts` | Multi-period chart data (1D/5D/1M/6M/1Y/5Y) with ET timezone handling |
| `/api/ticker-band` | Multi-ticker price feed; polled every 60s by `TickerBanner` |
| `/api/ticker-search` | Yahoo autocomplete; up to 7 EQUITY/ETF/INDEX/MUTUALFUND matches |
| `/api/fear-greed` | CNN Fear & Greed proxy; polled every 5 min by `FearGreedMeter` |
| `/api/sector-heatmap` | 11 SPDR sector ETFs (XLK/XLV/…/XLB) over 1D/5D/3M/6M/YTD/1Y |
| `/api/portfolio-snapshot` | Batch holdings snapshot: price, prevClose, beta, 30d volatility, sector |
| `/api/health` | Service health (Yahoo, Gemini, Supabase, SPY price) |

All routes use `force-dynamic` to disable caching. External calls use `withTimeout` from `lib/utils.ts` (5s default).

### Key files

- **`app/actions/generateReport.ts`** — Server action orchestrating the full report pipeline (see above).
- **`components/reports/StockReport.tsx`** — Top-level report component with typewriter loading animation and tab router. Dynamically imported.
- **`components/reports/tabs/`** — `OverviewTab`, `FinancialsTab`, `ValuationTab`, `CatalystsTab`, `VerdictTab` — one per report section.
- **`components/reports/ReportUI.tsx`** — Shared primitives (e.g. `Badge`) for report tabs.
- **`components/portfolio/PortfolioPage.tsx`** — Portfolio tab root; polls `/api/portfolio-snapshot` every 60s; holdings live in Supabase `holdings` table.
- **`components/portfolio/`** — `HoldingsTable`, `SummaryCards`, `AllocationChart`, `TopMovers`, `RiskMetrics`, `EmptyState`, `AddPositionModal`, `AddCashModal`, plus shared `styles.ts` (COLORS, MONO).
- **`components/TickerBanner.tsx`** — Scrolling ticker strip; exports `DEFAULT_BANNER_TICKERS`.
- **`components/SectorHeatmap.tsx`** / **`components/FearGreedMeter.tsx`** / **`components/Clock.tsx`** / **`components/MarketStatus.tsx`** — Dashboard widgets.
- **`components/SettingsModal.tsx`** — Vertical-tab settings UI; persists preferences to `user_settings.settings`.
- **`components/ReportCard.tsx`** — Saved-report card on Dashboard; exports `SavedReport` type.
- **`components/Auth.tsx`** — Email/password Supabase auth with animated orb background (pure CSS, no Framer Motion).
- **`lib/yahoo.ts`** — `yahoo-finance2` client singleton with `suppressNotices` set.
- **`lib/supabase.ts`** — Supabase client singleton.
- **`lib/quantScore.ts`** — 0-100 quant signal computed from Yahoo data before Gemini.
- **`lib/macroContext.ts`** — Fetches VIX, 10Y yield, S&P 500, 5Y yield for macro overlay.
- **`lib/reportValidation.ts`** — Scans Gemini output strings for numeric claims and cross-checks against Yahoo ground truth. Flags but does not auto-correct; thresholds differ by type (margins=200bps, growth=5pp, P/E=15%, dollars=10%).
- **`lib/portfolio/metrics.ts`** / **`lib/portfolio/types.ts`** — Portfolio math: enrichment, totals, top movers, risk stats, annualized volatility, cash-holding helpers.
- **`lib/hooks/`** — `useHoverPopup`, `useMediaQuery`.
- **`lib/utils.ts`** — `withTimeout` and shared helpers.
- **`lib/tickers.ts`** — Ticker universe / metadata.
- **`types/report.ts`** — `StockReport` type, the shape returned by `generateReport`.
- **`setup.sql`** — Schema + RLS policies for all tables.

### Database Schema

```sql
reports        (id, ticker, data jsonb, ai jsonb, created_by, created_by_email, created_at)
user_settings  (user_id PK, settings jsonb, updated_at)
holdings       (id, user_id, ticker, shares, avg_cost, created_at, updated_at)
               -- unique(user_id, ticker), shares>0, avg_cost>0
```

**RLS:**
- `reports`: anyone can read; only authenticated users can insert (must set `created_by = auth.uid()`) or delete.
- `user_settings` and `holdings`: users can only read/write their own rows.

### Environment Variables

Required in `.env.local`:
```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Tech Stack Notes

- **Tailwind CSS 4.x** via `@tailwindcss/postcss` — config is in `postcss.config.js`, no `tailwind.config.js`. Most components use inline styles rather than Tailwind classes.
- **`yahoo-finance2`** runs server-side only — declared as `serverComponentsExternalPackages` in `next.config.js`.
- **Path alias:** `@/*` maps to the repo root.
- **Fonts:** DM Sans, Instrument Serif, JetBrains Mono loaded via `next/font/google` in `app/layout.tsx`.
- **Ticker validation regex** (shared convention): `/^[A-Z0-9.\-^=]{1,20}$/` — allows `^VIX`, `^TNX`, indices, and class shares like `BRK-B`.
