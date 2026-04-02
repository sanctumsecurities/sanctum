# Market Session Markers on Sparkline Charts

**Date:** 2026-04-02  
**Status:** Approved

## Summary

Add subtle vertical dashed line markers with single-letter labels to the sparkline SVG on each stock report card, indicating the four market session boundaries visible within the 24h chart window.

## Session Boundaries

| Label | Time (ET) | Session transition |
|---|---|---|
| P | 4:00 AM | Pre-market opens |
| O | 9:30 AM | Regular market opens |
| C | 4:00 PM | Regular market closes |
| A | 8:00 PM | After-hours closes |

## Implementation

### Location

All changes are inside the existing IIFE in `app/page.tsx` that renders the sparkline SVG (`/* 1-Day Sparkline Chart */`, ~line 603). No new components, no new state, no new props.

### Position Calculation

Each boundary is placed by computing its X coordinate as a fraction of the SVG width:

```
startMs = new Date(pts[0].time).getTime()
endMs   = new Date(pts[pts.length - 1].time).getTime()

// For a given boundary time (ET), convert to UTC ms for the current data day
// then: x = ((boundaryMs - startMs) / (endMs - startMs)) * 300
```

Only render a marker if `x` falls within `[0, 300]` (the SVG viewBox width).

**ET → UTC conversion:** Use `Intl.DateTimeFormat` to determine the UTC offset for America/New_York on the data's date, then construct boundary timestamps accordingly. Alternatively, derive the offset directly from `pts[0].time` by comparing against a known ET reference — but the simplest correct approach is to compute each boundary as a `Date` using `toLocaleString` with the ET timezone, then call `.getTime()`.

### SVG Elements per Marker

```jsx
<line
  x1={x} y1={0} x2={x} y2={80}
  stroke="rgba(255,255,255,0.12)"
  strokeWidth="1"
  strokeDasharray="2,3"
/>
<text
  x={x} y={7}
  textAnchor="middle"
  fontSize="7"
  fill="rgba(255,255,255,0.30)"
  fontFamily="'JetBrains Mono', monospace"
>
  P | O | C | A
</text>
```

### Rendering Order

Markers are rendered **after** the fill polygon and line, but **before** the crosshair/dot/tooltip overlay elements. This keeps them behind the interactive layer.

## Visual Style

- Line: white at 12% opacity, 1px wide, dashed `2,3`
- Label: white at 30% opacity, 7px JetBrains Mono, centered on line, near top (y=7)
- No hover interaction — purely decorative/informational

## Non-Goals

- No tooltip or interactivity on the markers
- No color-coding per session type (kept monochrome to stay subtle)
- No changes to the API or data fetching
