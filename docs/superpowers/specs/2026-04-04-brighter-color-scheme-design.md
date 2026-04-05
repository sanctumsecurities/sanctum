# Brighter Color Scheme — Glow + Opacity Design

**Date:** 2026-04-04
**Status:** Approved

## Goal

Make the Sanctum UI more eye-catching and visually striking by adding glow effects to accent elements and increasing chart fill visibility — without changing any existing hex color values.

## Scope

Three changes applied across the entire site:

### 1. Glow Effects on Accent Elements

Add subtle `box-shadow` glows to elements that use the accent color palette (green, red, blue, amber). The glow color matches the element's accent color at ~25-45% opacity.

**Glow values by color:**

| Color | Hex | Glow shadow |
|-------|-----|-------------|
| Bullish Green | `#4ade80` | `0 0 12px 2px rgba(74,222,128,0.4)` |
| Positive Green | `#22c55e` | `0 0 12px 2px rgba(34,197,94,0.4)` |
| Bearish Red | `#f87171` | `0 0 12px 2px rgba(248,113,113,0.4)` |
| Alert Red | `#ef4444` | `0 0 12px 2px rgba(239,68,68,0.4)` |
| Hold Blue | `#60a5fa` | `0 0 12px 2px rgba(96,165,250,0.4)` |
| Warning Amber | `#eab308` | `0 0 12px 2px rgba(234,179,8,0.4)` |
| Amber | `#f59e0b` | `0 0 12px 2px rgba(245,158,11,0.4)` |

**Elements that get glows:**
- Signal badges (BUY/SELL/HOLD, quadrant labels like CORE/VOLATILE/DEFENSIVE/AT RISK)
- Verdict/recommendation badges
- Scenario card borders (Buy Case, Base Case, Bear Case)
- Fear & Greed meter needle/indicator
- Market status indicator dot
- Active tab indicators where colored
- Chart data points/dots on hover

**Elements that do NOT get glows:**
- Body text (even colored text like price changes)
- Table cells
- Axis labels
- Card backgrounds
- Borders/dividers (gray elements stay untouched)

### 2. Badge Background & Border Opacity Bump

Increase the presence of colored badges by raising their background and border opacity:

| Property | Current | Proposed |
|----------|---------|----------|
| Badge background | `rgba(color, 0.12)` | `rgba(color, 0.18)` |
| Badge border | `rgba(color, 0.22)` | `rgba(color, 0.35)` |

Applies to all badges that use the `rgba(accent, opacity)` pattern in ReportUI.tsx, VerdictTab.tsx, MatrixScatter.tsx, and page.tsx.

### 3. Chart Fill Opacity Increase

Increase area/gradient fill opacity under chart lines to make colored regions more visible:

| Property | Current | Proposed |
|----------|---------|----------|
| Area fill under lines | `rgba(color, 0.08)` | `rgba(color, 0.18)` |
| Gradient stops | `rgba(color, 0.08)` | `rgba(color, 0.18)` |

Applies to:
- Price chart area fills in `page.tsx`
- Revenue/income/margin chart fills in `FinancialsTab.tsx`
- Valuation chart fills in `ValuationTab.tsx`
- Bull/Bear scenario fills in `VerdictTab.tsx`
- Range bar gradient in `ReportUI.tsx`

## What Does NOT Change

- **No hex color values change** — all existing colors stay exactly as they are
- **No gray/neutral changes** — borders, dividers, backgrounds, secondary text all unchanged
- **No layout changes** — purely visual enhancement
- **No new colors introduced** — same palette, just more vivid presentation
- **Dark base stays** — `#0a0a0a` background untouched

## Files to Modify

| File | Changes |
|------|---------|
| `components/reports/ReportUI.tsx` | Badge opacity bump, glow on signal badges, range bar gradient opacity |
| `components/reports/tabs/VerdictTab.tsx` | Scenario card border glows, badge glows, chart fill opacity |
| `components/reports/tabs/FinancialsTab.tsx` | Chart area fill opacity |
| `components/reports/tabs/ValuationTab.tsx` | Chart area fill opacity |
| `components/reports/tabs/OverviewTab.tsx` | Badge glows if present |
| `components/reports/tabs/CatalystsTab.tsx` | Badge glows if present |
| `components/MatrixScatter.tsx` | Quadrant label badge glows |
| `components/FearGreedMeter.tsx` | Meter indicator glow |
| `app/page.tsx` | Price chart fill opacity, market status dot glow, signal badges |

## Glow Application Strategy

Glows are applied via inline `boxShadow` styles matching the existing inline style pattern used throughout the codebase. No CSS class abstractions — keep it consistent with current approach.

For Recharts SVG elements (dots, areas), use the `filter` or `style` prop where supported. For elements that don't support box-shadow natively in SVG, increase stroke width or opacity instead.
