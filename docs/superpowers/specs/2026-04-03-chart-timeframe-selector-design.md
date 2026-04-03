# Chart Timeframe Selector — Design Spec

**Date:** 2026-04-03  
**Status:** Approved

---

## Overview

Replace the hardcoded 24h sparkline on each report card with a multi-timeframe chart. Each card gets its own independent timeframe selector (1D / 1W / 1M / 3M / YTD / 1Y), left-aligned above the chart.

---

## Timeframe Definitions

| Period | `period1` | `period2` | interval |
|--------|-----------|-----------|----------|
| 1D | 4:00 AM ET today | 8:00 PM ET today (or now if session active) | 5m |
| 1W | 7 days ago | now | 1h |
| 1M | 1 month ago | now | 1d |
| 3M | 3 months ago | now | 1d |
| YTD | Jan 1 current year (midnight ET) | now | 1d |
| 1Y | 1 year ago | now | 1d |

"Today" for 1D is determined in `America/New_York` timezone so it stays correct for all user locations and server timezones.

---

## API Changes — `/api/charts`

- Accept optional `period` query param (default: `1D`).
- Compute `period1`/`period2`/`interval` from the table above.
- 1D `period1`: compute ET midnight for the current trading day using `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York' })`, then add 4 hours. `period2`: ET midnight + 20 hours, capped at `Date.now()`.
- Return shape is unchanged: `{ [ticker]: { points, afterHours } }`. `afterHours` is only populated for 1D; null for all other periods.
- `/api/chart` (single-ticker) gets the same `period` param for consistency.

---

## Client Changes — `app/page.tsx`

### Chart data cache

Change `chartData` state key from `ticker` to `ticker:period`:

```ts
// before
chartData: Record<string, { points, afterHours }>

// after
chartData: Record<string, { points, afterHours }>  // key = "AAPL:1D", "AAPL:1W", etc.
```

On mount, fetch all tickers at `1D` as before. When a card switches period, fetch only that ticker at the new period (single-ticker `/api/charts?tickers=X&period=Y`) and merge into the cache. Cached entries are never re-fetched within a session.

### `ReportCard` component

- Add `selectedPeriod` state (default `1D`) — local to each card, not lifted.
- Render left-aligned pill row above the chart: `1D 1W 1M 3M YTD 1Y`. Active pill: slightly brighter text + subtle border highlight. Clicking fires a fetch if the `ticker:period` key isn't cached, then sets `selectedPeriod`.
- Pass `tickerChart` from `chartData[report.ticker + ':' + selectedPeriod]`.

### Chart rendering adjustments

- **Session markers (P/O/A/C):** only rendered when `selectedPeriod === '1D'`.
- **After-hours indicator** (price/change below main price): only shown when `selectedPeriod === '1D'`.
- **Tooltip time format:** unchanged — `toLocaleTimeString` already uses the browser's local timezone.
- **No x-axis labels** for non-1D periods (sparkline stays label-free; the period pill makes context clear).

---

## Out of Scope

- Persisting per-card timeframe selection across page reloads.
- A global "change all cards" control.
- Candlestick or OHLC chart rendering (sparkline only).
