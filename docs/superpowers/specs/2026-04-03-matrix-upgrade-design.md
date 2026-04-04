# Matrix Tab Upgrade — Smarter Classification Logic

## Overview

Upgrade the Matrix tab's calculation logic and visualization. The core change: replace hardcoded quadrant boundaries with SPY-relative crosshairs so stocks are classified as "better or worse than the market." Add downside deviation, max drawdown, lookback periods, and visual encoding of risk.

## API Route: `/api/matrix/route.ts`

### A. Dynamic Risk-Free Rate

Fetch the 13-week T-bill rate via `yahooFinance.quote('^IRX')` alongside the existing benchmark fetches.

- The value comes back as a percentage (e.g., 4.5 meaning 4.5%) — divide by 100
- Use this rate for all Sharpe calculations instead of the hardcoded `0.05`
- If the fetch fails, fall back to `0.05`
- Return as a top-level response field: `riskFreeRate: number`

### B. Downside Deviation

After computing the daily returns array for each stock/benchmark:

- Filter to only negative daily returns
- Compute standard deviation of those negative returns
- Annualize: `downsideDev * Math.sqrt(252)`
- Return as new field `downsideVol` on each stock and each benchmark

### C. Max Drawdown

From the daily closing prices array for each stock/benchmark:

- Track running peak (highest close seen so far)
- At each day: `drawdown = (peak - close) / peak`
- `maxDrawdown` = largest drawdown value
- Return as new field `maxDrawdown` (positive decimal, e.g., 0.25 = 25% drawdown)

### D. Lookback Period Parameter

Accept optional query param `period` with values: `3m`, `6m`, `12m` (default `12m`).

| Period | `period1` offset |
|--------|-----------------|
| `3m`   | 90 days ago     |
| `6m`   | 180 days ago    |
| `12m`  | 365 days ago    |

- Annualization already adjusts to actual trading days via `(252 / tradingDays)`, so this just works
- Cache key must include the period: `${period}:${tickers.sort().join(',')}`
- Apply the same period to benchmark fetches (SPY, QQQ)

### E. Updated Response Shape

```typescript
interface MatrixStock {
  symbol: string
  name: string
  ret: number
  vol: number
  downsideVol: number
  maxDrawdown: number
  mcap: number
  sharpe: number
  price: number
}

interface MatrixBenchmark {
  symbol: string
  name: string
  ret: number
  vol: number
  downsideVol: number
  maxDrawdown: number
  sharpe: number
}

interface MatrixResponse {
  stocks: MatrixStock[]
  benchmarks: MatrixBenchmark[]
  riskFreeRate: number
  period: string
}
```

### F. Benchmarks

- **SPY** is the primary benchmark — its values define quadrant crosshairs
- **QQQ** is a secondary reference — appears as a diamond on the chart but does not affect classification
- Both are always fetched regardless of user tickers

## Frontend: `MatrixScatter.tsx`

### A. Control Layout — Single Row

Remove the quadrant filter pills entirely. Replace the current two-row layout (source buttons + quadrant pills) with a single row:

- **Left side** (constrained to `titleWidth`): Source buttons (Reports / Watchlist / Custom) — unchanged styling
- **Right side** (`marginLeft: 'auto'`): Two small button groups separated by a gap:
  - **Vol toggle**: `TOTAL VOL` | `DOWNSIDE VOL`
  - **Period selector**: `3M` | `6M` | `12M`
- All buttons use same style: JetBrains Mono, uppercase, 12px, active = white text + subtle border, inactive = gray

When Custom is active, the ticker input + chips row appears below as a second row (unchanged from current behavior).

### B. Dynamic Quadrant Boundaries (SPY-Relative Crosshairs)

Remove hardcoded `VOL_THRESHOLD = 0.35` and `RET_THRESHOLD = 0`. Replace with SPY benchmark values from the API response:

- **Horizontal crosshair** (return threshold) = SPY `ret`
- **Vertical crosshair** (volatility threshold) = SPY `vol` (or SPY `downsideVol` when downside toggle is active)

Quadrant classification updates accordingly:
- Stocks with higher return AND lower vol than SPY = CORE (top-left)
- Higher return AND higher vol = VOLATILE (top-right)
- Lower return AND lower vol = DEFENSIVE (bottom-left)
- Lower return AND higher vol = AT RISK (bottom-right)

**Crosshair labels**: Small text near the crosshair lines showing SPY values, e.g., `SPY 12.3%` on the return axis and `SPY 18.1%` on the vol axis. Style: JetBrains Mono, 9px, #444, positioned just outside the crosshair intersection.

Quadrant background washes and corner labels reposition based on these dynamic values.

### C. Bubble Sizing

The existing `dotRadius()` function already uses log-scale. Change:
- Min radius: 6 (unchanged)
- Max radius: 28 (was 18)

### D. Max Drawdown Border Rings

Encode max drawdown as a border ring on each dot, replacing the current uniform stroke:

| Drawdown Range | Border | Color |
|---------------|--------|-------|
| 0–5%          | None (keep default stroke) | — |
| 5–20%         | 1px    | Quadrant color at 0.4 opacity |
| 20–40%        | 2px    | Quadrant color at 0.6 opacity |
| 40%+          | 3px    | `#ef4444` at 0.8 opacity |

### E. Volatility Metric Toggle

Two buttons: `TOTAL VOL` (default) and `DOWNSIDE VOL`. When toggled:

- X-axis label changes from `VOLATILITY` to `DOWNSIDE VOLATILITY`
- All dot x-positions recalculate using `downsideVol` field
- SPY benchmark crosshair repositions to `benchmark.downsideVol`
- QQQ diamond repositions to its `downsideVol`
- Axis range recalculates from the active vol field

### F. Lookback Period Selector

Three buttons: `3M` | `6M` | `12M` (default `12M`). When changed:

- Re-fetch `/api/matrix` with the new `period` param
- All chart data updates (dots, crosshairs, benchmarks)
- Subtitle below MATRIX heading shows active period: `TRAILING 12M`
  - Style: JetBrains Mono, ~11px, #444, uppercase, letter-spacing 0.08em

### G. Tooltip Additions

Add to the hover tooltip alongside existing fields:

- `DOWNSIDE VOL` — formatted as percentage
- `MAX DD` — formatted as percentage
- `SHARPE` — 1 decimal place (already present but ensure 1 decimal)

## Implementation Notes

- Keep existing inline style conventions, no Tailwind classes
- All new calculations happen server-side in the API route
- No new npm dependencies — all math is basic arithmetic on arrays
- Maintain backward compatibility: API without `period` param defaults to `12m`
- The `getQuadrant()` function becomes dynamic — accepts benchmark ret/vol as parameters instead of using constants
- `activeQuadrant` state and quadrant pill UI are fully removed
