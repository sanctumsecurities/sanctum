# Matrix Tab — Sector Coloring, Trajectory Arrows, Efficient Frontier

## Overview

Three visual features layered onto the existing Matrix scatter chart: sector-based coloring as an alternative to quadrant coloring, trajectory arrows showing where stocks have moved from, and an efficient frontier envelope line. All three are toggle-controlled and off by default (except sector/quadrant which defaults to quadrant).

**Files changed:**
- `app/api/matrix/route.ts` — add `sector`, `prevRet`, `prevVol`, `prevDownsideVol` to each stock
- `components/MatrixScatter.tsx` — new toggles, rendering layers, interaction logic

**File structure decision:** Keep MatrixScatter.tsx monolithic (will grow from ~977 to ~1400 lines). Extract pure computation functions inline: `computeConvexHull()`, `getSectorColor()`, `catmullRomPath()`. Rationale: the overlays share the SVG coordinate system, scales, hover state, and 15+ pieces of state — prop drilling a sub-component would be worse than the line count.

**No new dependencies.**

---

## 1. Controls Row — Two-Row Layout

Restructure the existing single-row controls into two semantic rows.

**Row 1 — Data Selection** (what data is shown):
```
[REPORTS] [WATCHLIST] [CUSTOM]                    [3M] [6M] [12M]
```
Source selector left-aligned, period selector right-aligned. Same styling as current.

**Row 2 — View Options** (how data is visualized):
```
[TOTAL VOL | DOWNSIDE]  [QUADRANT | SECTOR]       [TRAILS] [FRONTIER]
```
Metric toggles left-aligned, overlay toggles right-aligned. Same button styling as current (JetBrains Mono, uppercase, 12px, active = white text + subtle border, inactive = gray text).

Subtle gap or pipe between the two toggle pairs on each side is not needed — the grouping is clear from proximity and the row separation provides enough visual structure.

---

## 2. Sector Coloring

### 2A. API: Add sector field

In `app/api/matrix/route.ts`, for each ticker being processed:

1. First, check if the existing `yahooFinance.quote(symbol)` response includes `sector` — the `yahoo-finance2` quote response type may not include it, but the raw response sometimes does.
2. If not available from `quote()`, add a `yahooFinance.quoteSummary(symbol, { modules: ['summaryProfile'] })` call alongside the existing data fetch. Extract `summaryProfile.sector`.
3. Wrap in try/catch — if the call fails or sector is missing, default to `"Other"`.
4. Add to the stock response object: `sector: string`.

**Benchmark objects do not get a sector field** — they remain unchanged.

Updated stock shape:
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
  sector: string          // NEW — e.g., "Technology", "Healthcare"
  prevRet: number | null  // NEW — see section 3A
  prevVol: number | null
  prevDownsideVol: number | null
}
```

### 2B. Sector color palette

Constant at the top of `MatrixScatter.tsx`:

```typescript
const SECTOR_COLORS: Record<string, string> = {
  'Technology':              '#60a5fa',
  'Healthcare':              '#4ade80',
  'Financial Services':      '#f59e0b',
  'Energy':                  '#ef4444',
  'Consumer Cyclical':       '#a78bfa',
  'Consumer Defensive':      '#2dd4bf',
  'Communication Services':  '#fb923c',
  'Industrials':             '#94a3b8',
  'Real Estate':             '#f472b6',
  'Basic Materials':         '#a3e635',
  'Utilities':               '#67e8f9',
  'Other':                   '#555555',
}
```

These are Yahoo Finance's GICS sector names. The `Other` fallback handles any unknown sector.

### 2C. Color mode toggle

New state: `colorMode: 'quadrant' | 'sector'` (default `'quadrant'`).

Two-button toggle in Row 2 of controls, same styling as the vol metric toggle.

**When `colorMode === 'sector'`:**
- Dot fill and stroke use `SECTOR_COLORS[stock.sector]` instead of `QUADRANT_CONFIG[quadrant].color`
- Ticker label above dot uses sector color at 0.65 opacity
- Drawdown border ring uses sector color (keeping existing width/opacity logic based on drawdown severity)
- Tooltip left border uses sector color
- Tooltip gains a new line below the company name: sector name in sector color, 9px JetBrains Mono

**Unchanged in sector mode:**
- Quadrant background gradient washes (they show zones regardless of coloring)
- Quadrant corner labels (CORE, VOLATILE, DEFENSIVE, AT RISK)
- SPY crosshair lines and labels
- Benchmark diamond rendering (stays white)

### 2D. Sector legend

When `colorMode === 'sector'`, render a legend below the chart in the same location as the existing quadrant count footer. In `quadrant` mode, the quadrant footer renders as before.

Legend layout:
- Horizontal `flex-wrap` row
- Each badge: 5px colored circle + sector name in 9px JetBrains Mono `#555` + count in parentheses
- Example: `● Technology (4)  ● Healthcare (2)  ● Energy (1)`
- Only sectors present in the current data are shown
- Gap between badges: ~12px

**Filtering:** Clicking a sector badge activates a filter — non-matching dots fade to 0.06 opacity (same behavior as existing quadrant pills). Click the same badge again to clear. Only one sector filter active at a time.

### 2E. Filter clearing on color mode switch

When switching between `quadrant` and `sector` color modes, any active filter (quadrant or sector) is cleared. Clean slate.

---

## 3. Trajectory Arrows

### 3A. API: Compute historical position

In `app/api/matrix/route.ts`, for each stock, compute where it would have plotted at an earlier point in time using the same period's worth of data.

**Lookback mapping:**
| Current Period | Historical Offset | Trading Days Back |
|---|---|---|
| 12m | ~3 months ago | 63 trading days |
| 6m | ~2 months ago | 42 trading days |
| 3m | Skip (not enough history) | — |

**Computation (for each stock with enough price data):**

Given the full daily closing prices array (already fetched for the current period):

1. Let `N = prices.length` and `offset = 63` (or 42 for 6m)
2. If `N < offset + 20` (not enough data for meaningful computation), set `prevRet`, `prevVol`, `prevDownsideVol` to `null`
3. Take the subset `prices[0 .. N - offset - 1]` (prices up to ~3 months ago)
4. Compute `prevRet`: annualized return from first close to last close of the subset, using the same formula as current `ret`
5. Compute `prevVol`: annualized standard deviation of daily returns within the subset
6. Compute `prevDownsideVol`: annualized standard deviation of only negative daily returns within the subset

**Response fields added to each stock:**
```
prevRet: number | null
prevVol: number | null
prevDownsideVol: number | null
```

Null when period is 3m or when insufficient price history exists.

**Cache key:** The existing cache key already includes `period:tickers` — no change needed since trajectory data is derived from the same price history.

### 3B. Rendering in MatrixScatter.tsx

New state: `showTrails: boolean` (default `false`).

For each stock with non-null `prevRet` and `prevVol`:

**Arrow line:**
- From `(prevVol, prevRet)` to `(vol, ret)` in data coordinates, mapped through existing scale functions
- When vol metric is `'downside'`, the start x-position uses `prevDownsideVol` instead of `prevVol`
- Stroke color: the stock's current color (respects `colorMode` — quadrant or sector color)
- Stroke opacity: 0.25
- Stroke width: 1.5px

**Arrowhead at current position:**
- Small triangle (6px side length), pointing in the direction of the prev→current vector (compute angle with `Math.atan2(dy, dx)`)
- Same color as line, 0.4 opacity
- Implemented as a manual SVG polygon rotated to the movement angle (not a marker def, to allow per-arrow coloring)

**Ghost dot at previous position:**
- Hollow circle, 3px radius, stroke only
- Same color, 0.2 opacity

**SVG render order** (back to front):
1. Grid lines and tick labels
2. Quadrant background gradient washes
3. Efficient frontier line (when active)
4. Trajectory arrows, ghost dots (when active)
5. SPY crosshair lines
6. Drawdown rings
7. Stock dots
8. Ticker labels
9. Benchmark diamonds + labels
10. Tooltip

Arrows render behind dots so dots remain interactive and visually dominant.

### 3C. Trails toggle

Single button in Row 2 controls, right-aligned group: `TRAILS`.

Active = white text + subtle border. Inactive = gray text. Same style as other toggles.

### 3D. Arrow interaction on hover

When `showTrails` is active and a dot is hovered/pinned:
- That stock's arrow brightens: line to 0.6 opacity, arrowhead to 0.8 opacity, ghost dot to 0.5 opacity
- All other arrows dim further: line to 0.08 opacity, arrowhead to 0.12 opacity, ghost dots to 0.06 opacity
- On hover end (if not pinned), all arrows return to default opacity

This reuses the existing `hoveredSymbol` / `pinnedSymbol` state — no new state needed.

---

## 4. Efficient Frontier Line

### 4A. Computation (client-side)

Pure function extracted at the top of MatrixScatter.tsx:

```typescript
function computeConvexHull(points: { x: number; y: number }[]): { x: number; y: number }[]
```

**Algorithm — upper-left convex hull:**
1. Collect all visible (non-filtered) stock points as `{ x: vol, y: ret }`
   - When vol metric is `'downside'`, use `downsideVol` for x
2. Sort by `x` ascending, then by `y` descending for ties
3. Build upper hull using Andrew's monotone chain:
   - Iterate through sorted points
   - For each point, while the stack has >= 2 points and the last three make a clockwise turn (or are collinear), pop
   - Push the new point
4. Return the hull points (the frontier from lowest vol to highest vol)

**Minimum points:** If fewer than 3 stocks are visible, do not render the frontier. A 2-point "frontier" is just a line between two stocks and adds no insight.

**Recalculation triggers:** Period change, source change, vol metric change, filter activation/clearing, data reload.

### 4B. Smoothed rendering

Pure function for Catmull-Rom spline interpolation:

```typescript
function catmullRomPath(points: { x: number; y: number }[], tension?: number): string
```

Converts hull points to a smooth SVG `<path>` d-attribute using Catmull-Rom to cubic bezier conversion. Default tension 0.5.

**Rendering:**
- Stroke: `rgba(255, 255, 255, 0.12)`
- Stroke width: 1.5px
- Dash pattern: `4 6` (4px dash, 6px gap)
- No fill
- SVG render order: behind dots and arrows, in front of grid and quadrant washes (see 3B render order)

**Frontier label:**
- At the leftmost hull point
- Text: `"FRONTIER"` in JetBrains Mono, 8px
- Fill: `rgba(255, 255, 255, 0.2)`
- Positioned 8px above and 4px left of the first hull point (offset so it doesn't overlap the line)

### 4C. Frontier toggle

Single button in Row 2 controls: `FRONTIER`. Same style as `TRAILS`. Default off.

### 4D. Frontier interaction

**Hover hit area:** Invisible `<path>` with same `d` attribute, stroke-width 12px, stroke transparent, `pointer-events: stroke`. This provides a ~6px hover zone on each side.

**On hover:**
- Visible path brightens to 0.3 opacity
- Tooltip appears at cursor position:
  - Content: `"Efficient frontier — upper bound of return for given volatility across displayed holdings"`
  - Style: same dark tooltip card as stock tooltips (`#0a0a10` background, 6px border-radius, 12px 14px padding)
  - Font: JetBrains Mono 10px, `#888` color
  - Max width: 240px
  - Left border: white at 0.2 opacity (neutral, not colored by any stock)

**On hover end:** Path returns to 0.12 opacity, tooltip disappears.

---

## 5. State Interactions Matrix

How the three features interact with each other and existing features:

| State Change | Sector Coloring | Trails | Frontier |
|---|---|---|---|
| Switch color mode | Dots recolor, filter clears | Arrow colors update to new mode | No effect |
| Switch vol metric | No effect | Arrow start x uses prevVol or prevDownsideVol | Frontier recomputes with new x-axis |
| Change period | Sector stays, data reloads | prevRet/prevVol reloaded (null for 3m) | Recomputes from new data |
| Change source | Sector stays, data reloads | New trajectory data | Recomputes from new data |
| Activate quadrant filter | Only in quadrant mode | Arrows for filtered stocks fade with dots | Recomputes from visible stocks only |
| Activate sector filter | Only in sector mode | Arrows for filtered stocks fade with dots | Recomputes from visible stocks only |
| Hover a dot (trails on) | Normal hover behavior | Hovered arrow brightens, others dim | No effect |
| Hover frontier line | No effect | No effect | Line brightens, tooltip shows |

---

## 6. Edge Cases

- **Stock with no sector data:** Falls back to `"Other"` sector and gets gray (`#555`) coloring.
- **All stocks in one sector:** Sector legend shows one badge. Filter does nothing useful but still works.
- **Trajectory where prev and current are same point:** Arrow has zero length — skip rendering for that stock (distance threshold: <2px in screen coordinates).
- **Frontier with all stocks at similar volatility:** Hull degenerates to near-vertical. Still renders — the smoothing handles it gracefully.
- **Period 3m with trails on:** Arrows simply don't render (prevRet/prevVol are null). Toggle stays active but no arrows visible. No special messaging needed.
- **Filter active when frontier on:** Frontier recomputes from visible stocks only. If filter reduces to <3 stocks, frontier hides.
- **Benchmarks:** Never included in frontier computation or trajectory arrows. They're reference points, not portfolio candidates.
