# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:3000
npm run build     # Production build
npm run start     # Start production server
```

No test suite is configured.

## Architecture

**Sanctum** is an AI-powered stock research terminal — a Next.js 14 App Router monolith backed by Supabase (auth + storage), Yahoo Finance (market data), and Google Gemini (AI analysis).

### Request Flow

User enters a ticker → `components/reports/StockReport.tsx` calls the `generateReport` server action → server fetches Yahoo Finance data + calls Gemini → structured JSON returned → `components/reports/StockReport.tsx` renders charts and AI insights → user can save report to Supabase `reports` table.

### API Routes (`app/api/`)

| Route | Purpose |
|---|---|
| `/api/charts` | Multi-period chart data with ET timezone handling; supports 1D, 5D, 1M, 6M, 1Y, 5Y periods |
| `/api/ticker-band` | Multi-ticker price feed; polled every 60s by TickerBanner |
| `/api/ticker-search` | Yahoo Finance autocomplete search; returns up to 7 EQUITY/ETF/INDEX/MUTUALFUND matches |
| `/api/fear-greed` | CNN Fear & Greed index proxy; polled every 5 minutes by FearGreedMeter |
| `/api/health` | Service health check (Yahoo, Gemini, Supabase, SPY price) |

All routes use `force-dynamic` to disable caching. External API calls have 5-second timeouts.

### Key Files

- **`app/page.tsx`** — Large monolithic client component: tab system (Dashboard/Watchlist), auth state, TickerBanner integration, settings, and report saving. All main state lives here.
- **`components/reports/StockReport.tsx`** — Renders financial metrics + Recharts visualizations via the `generateReport` server action. Dynamically imported for code-splitting.
- **`components/FearGreedMeter.tsx`** — CNN Fear & Greed gauge; polls `/api/fear-greed` every 5 minutes, renders a semicircular dial with color-coded zones.
- **`components/SettingsModal.tsx`** — Vertical-tab settings UI; user preferences (theme, banner speed, tickers) persisted to Supabase.
- **`components/Auth.tsx`** — Email/password login with Framer Motion animations.
- **`lib/supabase.ts`** — Supabase client singleton (uses `NEXT_PUBLIC_SUPABASE_*` env vars).
- **`lib/yahoo.ts`** — Yahoo Finance client singleton with `suppressNotices` config; imported by API routes.
- **`lib/utils.ts`** — Shared utilities (e.g. `withTimeout` for promise timeouts).
- **`lib/quantScore.ts`** — Quant pre-score engine: computes a 0-100 signal from Yahoo Finance data before the Gemini call.
- **`lib/macroContext.ts`** — Fetches VIX, 10Y yield, S&P 500, and 5Y yield for macro environment overlay.
- **`app/actions/generateReport.ts`** — Server action: orchestrates Yahoo Finance data fetch, quant scoring, macro context, and Gemini AI call to produce a full `StockReport`.
- **`setup.sql`** — Database schema + RLS policies (reports readable by all, write/delete requires auth).

### Database Schema

```sql
reports (id uuid, ticker text, data jsonb, ai jsonb, created_by uuid, created_by_email text, created_at timestamp)
```
RLS: anyone can read; only authenticated users can insert or delete their own rows.

### Environment Variables

Required in `.env.local`:
```
GEMINI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Tech Stack Notes

- **Tailwind CSS 4.x** via `@tailwindcss/postcss` — config is in `postcss.config.js`, not a `tailwind.config.js`
- **`yahoo-finance2`** runs server-side only — declared as `serverComponentsExternalPackages` in `next.config.js`
- **Path alias:** `@/*` maps to the repo root
- **Fonts:** DM Sans, Instrument Serif, JetBrains Mono loaded via `next/font/google` in `app/layout.tsx`
