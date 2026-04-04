# Overview Tab Desktop Layout Redesign

## Problem

The ticker report page constrains all content to `maxWidth: 900px` centered, leaving ~540px of unused space on each side of a typical 1440px desktop viewport. The overview tab stacks 6 sections vertically, making the page unnecessarily long when horizontal space is available.

## Design Decisions

- **Content priority**: Key Metrics and Business Overview are the primary focus
- **Viewport target**: Fluid layout from ~1024px to ultrawide
- **Visual density**: Modern Dashboard — generous spacing, clear visual hierarchy, rounded glass cards
- **Layout**: Two-Column Fixed Split (left 56%, right 44%)

## Container Changes

### StockReport.tsx

- **Max-width**: increase from `900px` to `1400px` on three containers:
  - Header area (company name, price, badges)
  - Tab bar
  - Tab content area
- **Padding**: increase horizontal padding from `20px` to `40px` at desktop widths (>=1024px)
- Breakpoint: `1024px` — below this, everything falls back to current single-column behavior

### No changes to:
- `ReportUI.tsx` shared components (MetricCard, SectionTitle, Badge, RangeBar, DataTable, CTooltip, ConvictionBadge)
- Other tabs (Financials, Valuation, Catalysts, Verdict) — they render single-column within the wider container
- Loading screen, error state, or CompanyLogo component

## Overview Tab Layout (>=1024px)

### Two-Column Grid

```
+------------------------------------------+
|  Left Column (56%)  |  Right Column (44%) |
+------------------------------------------+
```

- CSS grid: `grid-template-columns: 1.3fr 1fr`
- Gap: `24px`
- Activates at viewport width >= `1024px`

### Left Column — Primary Content

Top to bottom:

1. **Key Metrics** — 2x2 grid (`grid-template-columns: 1fr 1fr`, gap `12px`)
   - Existing `MetricCard` component, no changes
   - Changes from current 4-column to 2x2 to fit narrower column width

2. **Business Overview** — full left-column width, `glassCard` wrapper
   - `businessSummary` paragraphs render as-is
   - `whatHasGoneWrong` callout nested inside same card (red left border)
   - No text styling changes

3. **Analyst Consensus** — full left-column width, `glassCard` wrapper
   - Badge + `RangeBar` component unchanged
   - Natural conclusion to left column narrative: metrics → story → analyst opinion

Section spacing: `marginBottom: 24px` between each.

### Right Column — Supporting Data

Top to bottom:

1. **Revenue by Segment** — `glassCard` wrapper
   - Layout shifts from horizontal (donut + legend side-by-side) to **vertical** (donut on top, legend list below)
   - Donut chart: `200px` height via `ResponsiveContainer`
   - Legend items below with color squares + percentages

2. **Competitive Moat Analysis** — `glassCard` wrapper, `flex: 1` to absorb extra vertical space
   - Radar chart at full column width
   - `ResponsiveContainer` height: `280px`
   - Company vs Sector legend below chart
   - Sector comparison dashed overlay if data available

3. **Institutional & Insider** — `glassCard` wrapper
   - Sentiment header bar (colored background + signal badges)
   - Institutional ownership row
   - Net buys/sells rows
   - No component changes

Section spacing: `marginBottom: 24px` between each.

## Responsive Collapse (<1024px)

Below `1024px`, the layout reverts to the existing single-column vertical stack:

- Two-column grid becomes `grid-template-columns: 1fr`
- Key Metrics grid returns to `repeat(4, 1fr)` (current 4-column)
- Segment breakdown returns to horizontal layout (donut + legend side-by-side via `flex` row)
- Padding returns to `28px 20px`
- Section order: Metrics → Business Overview → Analyst Consensus → Segments → Moat → Institutional

This is identical to the current behavior — no mobile regression.

## CSS Approach

Inline styles with a custom `useMediaQuery` hook defined at the top of `OverviewTab.tsx`. The hook uses `useState` + `useEffect` with `window.matchMedia('(min-width: 1024px)')` and listens for changes. This matches the existing codebase pattern of inline styles throughout the report components.

The hook returns a boolean `isDesktop` used in `OverviewTab.tsx` to toggle:
- Grid template columns on the overview container (`1.3fr 1fr` vs `1fr`)
- Metric card grid columns (`1fr 1fr` vs `repeat(4, 1fr)`)
- Segment breakdown flex direction (`column` with centered donut vs `row` with side-by-side)

`StockReport.tsx` also needs the same `isDesktop` boolean to toggle max-width and padding on the header/tabs/content containers. Either import the hook or duplicate it locally.

## Files Modified

| File | Change |
|------|--------|
| `components/reports/tabs/OverviewTab.tsx` | Add `useMediaQuery` hook, wrap sections in two-column grid, adjust metrics to 2x2, adjust segment layout to vertical, add responsive collapse |
| `components/reports/StockReport.tsx` | Add `useMediaQuery` hook, widen max-width from 900px to 1400px, increase desktop horizontal padding to 40px |
