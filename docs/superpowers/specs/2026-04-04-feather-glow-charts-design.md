# Feather Glow — Chart-Wide Luminescence

**Date:** 2026-04-04  
**Branch:** ticker-report-revamp  
**Status:** Approved

## Summary

Apply a consistent, barely-there SVG glow to every chart line, dot, and bar across the Sanctum app. The goal is to make charts feel luminous and alive without crossing into neon/cyberpunk territory. Clean foundation preserved; colors unchanged.

## Glow Specification

| Element | Technique | `stdDeviation` |
|---|---|---|
| Lines (strokes) | `feGaussianBlur` + `feMerge` over source | **1.6** |
| Dots / data points | same filter | **1.6** |
| Bars (`<rect>` fills) | same filter, lighter pass | **1.0** |
| Area fills | No filter — opacity bump only (see per-file details) | — |
| Dashed reference lines | same filter as lines | **1.6** |

Filter structure (single pass, no double-blur, no color matrix):

```svg
<filter id="fGlow" x="-40%" y="-40%" width="180%" height="180%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur"/>
  <feMerge>
    <feMergeNode in="blur"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>

<filter id="fGlowBar" x="-30%" y="-20%" width="160%" height="140%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="1.0" result="blur"/>
  <feMerge>
    <feMergeNode in="blur"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
```

Filters are defined once per chart container (injected via a `<defs>` block). All chart elements in that container reference them by ID.

## Implementation Approach

Recharts does not expose SVG `filter` natively on most primitives, so three techniques are used:

1. **Custom dot renderer** — `<Line dot={<CustomDot filter="url(#fGlow)" />}>`. The custom dot renders a `<circle>` with the filter attribute.
2. **`style={{ filter: 'url(#fGlow)' }}`** — `<Bar>` and `<Area>` forward `style` to the underlying SVG element. Use this directly on those components.
3. **`<defs>` injection** — A hidden `<svg style={{position:'absolute',width:0,height:0}}><defs>…</defs></svg>` rendered just before each `<ResponsiveContainer>` (or inside the chart via `<Customized>`). Filters defined here are accessible to all SVG in the document.
4. **MatrixScatter (raw SVG)** — Already hand-rolled SVG. Add `filter="url(#fGlow)"` directly to stock dot `<circle>` elements and the active pulse ring.

## Files & Changes

### `components/reports/tabs/FinancialsTab.tsx`
Three charts — all get the treatment:
- **Revenue vs COGS (ComposedChart):** `<Bar>` gets `style={{ filter: 'url(#fGlowBar)' }}`, `<Line>` gets custom dot + line filter.
- **Margin Trends (LineChart):** All three `<Line>` elements (gross/operating/net) get custom dot + line filter.
- **Revenue & EPS (ComposedChart):** `<Bar>` + `<Line>` same as above.
- **Dividend FCF chart:** Both `<Bar>` elements get bar filter.
- Area fill opacities bumped from `0.30–0.35` → `0.42–0.45`.

### `components/reports/tabs/ValuationTab.tsx`
- `<Line dataKey="pe">` — custom dot + line filter.
- `<ReferenceLine>` for sector median — add `style={{ filter: 'url(#fGlow)' }}`.

### `components/reports/tabs/VerdictTab.tsx`
- `<Area dataKey="bull">` and `<Area dataKey="bear">` — `style={{ filter: 'url(#fGlow)' }}` on the stroke; area fill opacity bumped slightly.
- `<Line dataKey="base">` and `<Line dataKey="analystMean">` — custom dot + line filter.

### `components/reports/tabs/CatalystsTab.tsx`
- Stacked `<Bar>` (buy/hold/sell) — `style={{ filter: 'url(#fGlowBar)' }}` on each bar.

### `components/reports/tabs/OverviewTab.tsx`
- `<Radar dataKey="score">` (company) — Recharts Radar does not reliably forward `style` to the SVG path. Use the `dot` prop with a custom dot component, and wrap the radar path via a `<Customized>` component that post-processes the rendered SVG node to add the filter attribute. If that proves complex, apply the filter to the wrapping `<RadarChart>` element instead (which does forward style to its `<svg>`), accepting that the grid lines also get a very faint glow.
- `<Radar dataKey="sectorScore">` (sector avg, dashed) — same approach.
- Revenue segment stacked bars — add `filter: 'url(#fGlowBar)'` to each segment's inline style.

### `components/MatrixScatter.tsx`
- Stock dot `<circle>` elements — add `filter="url(#fGlow)"`.
- Active pulse ring `<circle>` — add `filter="url(#fGlow)"`.
- Define `<defs>` block with `fGlow` / `fGlowBar` filters inside the main `<svg>`.

## What Does NOT Change

- Color values — all existing hex/rgba colors stay exactly the same.
- Existing glow on badges, FearGreedMeter ticks, conviction arc, insider dots — already have their own glow; leave untouched.
- Chart structure, data flow, layout — no refactoring.
- Non-chart UI (cards, tables, badges) — out of scope.

## Success Criteria

- Every Recharts line, dot, and bar in all report tabs has a soft luminescence visible against the `#0a0a0a` background.
- MatrixScatter stock dots glow at the same intensity.
- No chart element blooms, halos aggressively, or looks like "neon" — the effect reads as the element emitting faint light.
- No performance regression — filters are defined once and reused, not per-element.
