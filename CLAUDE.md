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

User enters a ticker → `app/page.tsx` calls `/api/analyze` → server fetches Yahoo Finance data + calls Gemini 2.0 Flash → structured JSON returned → `components/ReportView.tsx` renders charts and AI insights → user can save report to Supabase `reports` table.

### API Routes (`app/api/`)

| Route | Purpose |
|---|---|
| `/api/analyze` | Core: fetches Yahoo Finance data, sends to Gemini, returns combined financial + AI JSON |
| `/api/chart` | 24h price data + pre/post-market for a single ticker |
| `/api/ticker-band` | Multi-ticker price feed; polled every 60s by TickerBanner |
| `/api/health` | Service health check (Yahoo, Gemini, Supabase, SPY price) |

All routes use `force-dynamic` to disable caching. External API calls have 5-second timeouts.

### Key Files

- **`app/page.tsx`** — Large monolithic client component: tab system (Dashboard/Watchlist), auth state, TickerBanner integration, settings, and report saving. All main state lives here.
- **`components/ReportView.tsx`** — Renders financial metrics + Recharts visualizations from `/api/analyze` response. Dynamically imported for code-splitting.
- **`components/SettingsModal.tsx`** — Vertical-tab settings UI; user preferences (theme, banner speed, tickers) persisted to Supabase.
- **`components/Auth.tsx`** — Email/password login with Framer Motion animations.
- **`lib/supabase.ts`** — Supabase client singleton (uses `NEXT_PUBLIC_SUPABASE_*` env vars).
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
