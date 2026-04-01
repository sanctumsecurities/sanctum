# Ticker Banner Design

**Date:** 2026-04-01  
**Status:** Approved

---

## Overview

A horizontally auto-scrolling ticker banner fixed just below the main nav bar, visible on all tabs. Displays live-updating prices for 7 market instruments with color-coded change indicators.

---

## Instruments

| Label | Yahoo Finance Symbol |
|---|---|
| S&P 500 (^GSPC) | `^GSPC` |
| NASDAQ (^IXIC) | `^IXIC` |
| DOW (^DJI) | `^DJI` |
| RUSSELL (^RUT) | `^RUT` |
| VIX (^VIX) | `^VIX` |
| GOLD (GC=F) | `GC=F` |
| OIL (CL=F) | `CL=F` |

---

## Layout

- **Position:** `fixed`, `top: 56px` (immediately below the existing 56px nav bar)
- **Height:** 28px
- **Width:** full viewport width
- **z-index:** 99 (below nav's 100)
- **Main content padding-top:** bumped from `56px` to `84px`

---

## API Route

**Path:** `GET /api/ticker-band`

Fetches all 7 symbols in parallel via `yahoo-finance2`. Returns:

```ts
type TickerItem = {
  symbol: string      // e.g. "^GSPC"
  label: string       // e.g. "S&P 500 (^GSPC)"
  price: number
  change: number
  changePct: number
}
```

Response: `TickerItem[]`

- `Cache-Control: no-store`
- On per-symbol error: omits that item from the array (graceful degradation)
- Timeout per fetch: 5000ms

---

## Component: `TickerBanner`

Isolated React component, lives in `page.tsx` alongside `Clock`.

**Data fetching:**
- Fetches `/api/ticker-band` on mount
- Polls every 60 seconds via `setInterval`
- While loading (first fetch): renders `—` placeholder for each instrument slot
- On error: retains last good data silently

**Scroll animation:**
- Container: `overflow: hidden`, `white-space: nowrap`, full width
- Inner div: two identical copies of the item list placed side by side (`display: inline-flex`)
- CSS `@keyframes tickerScroll`: `transform: translateX(0)` → `translateX(-50%)`
- Duration: 40s, linear, infinite
- `animation-play-state: paused` on container hover

**Item rendering format:**
```
LABEL  $price  ▲/▼ +X.XX%
```
- Label: `#444`, 10px, `letter-spacing: 0.12em`
- Price: `#888`, 10px
- Arrow + percent: green `#22c55e` if change ≥ 0, red `#f87171` if negative
- Separator between items: `·` in `#222`
- Font: JetBrains Mono throughout
- All text `font-size: 10px`

**Visual:**
- Background: `#080808`
- Bottom border: `1px solid #1a1a1a`
- No top border (nav's bottom border serves as visual separator)

---

## Layout Impact

| Element | Before | After |
|---|---|---|
| `<nav>` height | 56px | 56px (unchanged) |
| Ticker banner | — | 28px fixed at top: 56 |
| `<main>` padding-top | 56px | 84px |
| Mobile menu dropdown | `top: 56` | `top: 84` (must shift down to clear ticker) |

---

## Out of Scope

- No click-through to instrument detail pages
- No pre/post market indicators on the banner
- No mobile-specific hide/show behavior (banner visible at all viewport sizes)
