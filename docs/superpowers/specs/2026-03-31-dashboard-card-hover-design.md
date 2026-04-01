# Dashboard Card Hover Interactions & Pricing Enhancements

**Date:** 2026-03-31
**Status:** Approved

## Summary

Enhance the dashboard report cards with three features:
1. Hover-expand cards to reveal AI Investment Highlights (scale overlay pattern)
2. Interactive sparkline chart with crosshair tooltip (price + time + change from open)
3. After-hours / pre-market pricing display below the main price

## 1. Card Hover Expansion

### Default State
Cards sit in the 4-column grid at `aspect-ratio: 1/1`, showing: ticker, name, sentiment badge, price + daily change, metrics grid (MKT CAP, P/E, BETA, DIV YIELD), sector/industry, 1-day sparkline, and footer (date, creator, remove).

### Hover State
- Card scales to `~1.15x` via `transform: scale(1.15)`
- `z-index` jumps to 10 to float above neighbors
- `box-shadow` increases: `0 12px 40px rgba(0,0,0,0.6)`
- Border brightens: `#1a1a1a` -> `#3a3a3a`
- Transition: `all 250ms cubic-bezier(0.2, 0, 0, 1)`

### Expanded Content
Below the sparkline chart (pushing footer down), AI Investment Highlights appear with a fade-in:
- Label: "HIGHLIGHTS" (small, muted, JetBrains Mono)
- Highlight bullet points (icon + text) from `report.ai.overview.highlights`
- Capped at 3 items
- Each highlight in compact single-line format, truncated with ellipsis if too long

### Edge Handling
- Cards on the left edge: `transform-origin: left center`
- Cards on the right edge: `transform-origin: right center`
- Center cards: `transform-origin: center center`

## 2. Interactive Sparkline Chart

### Current State
Static SVG polyline + polygon fill, rendered from raw price numbers with no timestamps.

### Hover Behavior (active when card is in hovered/expanded state)
- **Crosshair**: Vertical 1px line, `rgba(255,255,255,0.3)`, full chart height, follows mouse horizontally
- **Snap dot**: 4px radius circle snaps to nearest price point, colored green (up) or red (down)
- **Tooltip** appears above crosshair:
  ```
  10:35 AM
  $185.20  +1.2%
  ```
  - Line 1: Time (smaller, muted)
  - Line 2: Price (white) + change from open (green/red)
- Styled to match existing `chartTooltipStyle` (dark bg, rounded, subtle border)
- Crosshair and tooltip disappear when mouse leaves chart area

### Data Format Change
**Before:** `{ ticker: string, points: number[] }`
**After:** `{ ticker: string, points: { time: string, price: number }[], afterHours: { ... } | null }`

The `yahoo-finance2` chart response already includes timestamps on each quote — currently discarded. The first data point serves as the "open" price for computing change-from-open percentage.

## 3. After-Hours Pricing

### Data Source
`yahoo-finance2` `quote()` endpoint provides:
- `postMarketPrice`, `postMarketChange`, `postMarketChangePercent`
- `preMarketPrice`, `preMarketChange`, `preMarketChangePercent`
- `marketState`: `"PRE"` | `"POST"` | `"REGULAR"` | `"CLOSED"`

### API Change
Extend `/api/chart` response to include:
```ts
afterHours: {
  price: number
  change: number
  changePct: number
  label: string  // "After Hours" or "Pre-Market"
} | null
```
Returns `null` when `marketState` is `"REGULAR"`. When `marketState` is `"POST"` or `"CLOSED"` and post-market data exists, returns after-hours data with label "After Hours". When `marketState` is `"PRE"` and pre-market data exists, returns with label "Pre-Market".

### Display on Card
Below the main price + daily change line:
```
After Hours: $186.45  +0.68%
```
- Font: 11px, JetBrains Mono
- "After Hours:" / "Pre-Market:" label in `#555`
- Price in `#999`
- Change colored green/red
- Hidden when market is open (`"REGULAR"`) or when no extended-hours data is available

### Staleness
Fetched once on dashboard load (alongside chart data). No polling or live updates.

## 4. File Changes

### Modified Files

1. **`app/api/chart/route.ts`**
   - Return `{ time, price }` objects instead of raw numbers
   - Call `yahooFinance.quote()` alongside `yahooFinance.chart()` to get after-hours data
   - Return `afterHours` field in response

2. **`app/page.tsx`**
   - Update `chartData` state type to hold `{ points: { time: string, price: number }[], afterHours: { ... } | null }`
   - Add after-hours display below the price line on each card
   - Replace static sparkline SVG with interactive chart (mouse events, crosshair, tooltip)
   - Add hover expansion: scale transform, z-index, AI highlights reveal (capped at 3)
   - Adjust `transform-origin` for edge cards (first/last in each row)

### Untouched
- `components/ReportView.tsx`
- `app/api/analyze/route.ts`
- Auth flow, watchlist, modal, responsive breakpoints
- Card click behavior (still opens the report)
