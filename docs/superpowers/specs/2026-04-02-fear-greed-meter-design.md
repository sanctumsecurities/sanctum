# Fear & Greed Meter — Design Spec

**Date:** 2026-04-02
**Status:** Approved

---

## Overview

Add a CNN Fear & Greed Index meter to the nav bar, positioned visually between the Watchlist tab and the settings gear icon. The meter shows a numeric score and a color-coded 50-tick bar that fills based on sentiment.

---

## Architecture

Two new files, one edit to `app/page.tsx`.

### 1. `/api/fear-greed/route.ts` — Proxy route

- `export const dynamic = 'force-dynamic'`
- Fetches `https://production.dataviz.cnn.io/index/fearandgreed/graphdata` with a 5-second timeout
- Extracts `data.fear_and_greed.score` and `data.fear_and_greed.rating`
- Returns `NextResponse.json({ score: number, rating: string })`
- On error, returns `NextResponse.json({ error: 'unavailable' }, { status: 502 })`

### 2. `components/FearGreedMeter.tsx` — Client component

**Data fetching:**
- `'use client'`
- `useEffect` fetches `/api/fear-greed` on mount
- Polls every 5 minutes (`setInterval(fetch, 5 * 60 * 1000)`)
- State: `{ score: number | null, rating: string | null, loading: boolean }`
- While loading or on error: renders an em-dash (`—`) in place of label and bar

**Rendering:**
- Wrapper: `id="fear-greed-meter"`, `display: flex`, `alignItems: center`, `gap: 10px`
- Label: score number + zone label (e.g. `42 FEAR`), styled per zone (see color table below)
- Bar: 50 tick `<span>` elements, each 2×14px, border-radius 1px, gap 1px

**Zone / color table:**

| Score | Label | Label color | Tick color |
|---|---|---|---|
| 0–25 | EXTREME FEAR | `#ef4444` | red ticks only |
| 26–45 | FEAR | `#f0a030` | — |
| 46–55 | NEUTRAL | `#999999` | — |
| 56–75 | GREED | `#a0d040` | — |
| 76–100 | EXTREME GREED | `#22c55e` | — |

**Tick color by index:**
- Ticks 0–16: `#ef4444` (red)
- Ticks 17–33: `#f0a030` (amber)
- Ticks 34–49: `#22c55e` (green)

**Active tick threshold:** `Math.round((score / 100) * 49)` — all ticks at or below this index are full opacity; others are 0.25 opacity.

**CSS classes (inline styles, matching spec):**
```
#fear-greed-meter: display flex, alignItems center, gap 10
.fg-label: fontSize 11, fontWeight 700, letterSpacing 0.5px, whiteSpace nowrap
.fg-bar: display flex, alignItems center, gap 1, height 16
.fg-tick: width 2, height 14, borderRadius 1, flexShrink 0, opacity 0.25
.fg-tick.active: opacity 1
```

Label renders as: `{score} {zone}` — e.g. `42 FEAR`

### 3. `app/page.tsx` — Nav integration

Insert `<FearGreedMeter />` as the first child of the right icons `div` (the `position: absolute; right: 0` section, before the settings button).

Add a thin vertical separator `<span>` (`width: 1px, height: 16px, background: #2a2a2a`) between the meter and the settings button to delineate the meter from the icon group.

The meter is wrapped in a `<div className="nav-links-desktop">` so it inherits the existing media query that hides it below the desktop breakpoint — no new CSS needed.

---

## Error handling

- Network error or non-200 from proxy → component silently shows `—` (no alert, no console noise in prod)
- CNN API shape change → score is `null`, same silent fallback

---

## Non-goals

- No caching (2–3 concurrent users, not needed)
- No historical chart / sparkline
- No click interaction on the meter
