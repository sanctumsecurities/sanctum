# Feather Glow Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a consistent, barely-there SVG glow (feather glow) to every Recharts chart line, dot, and bar across all report tabs, plus MatrixScatter dots.

**Architecture:** Define two SVG filter primitives (`fGlow` for lines/dots at stdDeviation=1.6, `fGlowBar` for bars at stdDeviation=1.0) in a single hidden SVG injected into `StockReport.tsx`. Because inline SVG filter IDs are resolved document-wide in HTML, all Recharts charts in every tab can reference these filters via `style={{ filter: 'url(#fGlow)' }}` without any per-chart defs injection. MatrixScatter is raw SVG and gets `filter="url(#fGlow)"` directly on its circle elements, with its own `<defs>` block.

**Tech Stack:** React, Recharts v2, raw SVG (MatrixScatter)

---

### Task 1: Inject filter defs into StockReport.tsx

**Files:**
- Modify: `components/reports/StockReport.tsx:201-205`

The hidden SVG must be the first child of the root `<div>` so that filter IDs are registered in the document before any chart renders.

- [ ] **Step 1: Add the hidden SVG defs block**

In `components/reports/StockReport.tsx`, find the `return (` at line 201. The root `<div>` starts at line 202. Add a hidden SVG as the first child of that div:

```tsx
  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)', background: '#0a0a0a',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Global SVG filter defs — referenced by all charts via url(#fGlow) / url(#fGlowBar) */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
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
        </defs>
      </svg>
      <style>{`
```

(The `<style>` block continues as before on the next line.)

- [ ] **Step 2: Start the dev server and verify the defs are in the DOM**

```bash
npm run dev
```

Open http://localhost:3000, search any ticker (e.g. AAPL), wait for report. Open browser DevTools → Elements panel → search for `id="fGlow"` in the DOM. You should see the hidden SVG with both filter elements.

Expected: `<filter id="fGlow">` and `<filter id="fGlowBar">` present in the DOM.

- [ ] **Step 3: Commit**

```bash
git add components/reports/StockReport.tsx
git commit -m "style: inject global SVG glow filter defs into StockReport"
```

---

### Task 2: Glow FinancialsTab — all four charts

**Files:**
- Modify: `components/reports/tabs/FinancialsTab.tsx`

Four charts: Revenue vs COGS (ComposedChart, line 31), Margin Trends (LineChart, line 57), Revenue & EPS (ComposedChart, line 81), Dividend FCF (ComposedChart, line 220).

- [ ] **Step 1: Apply glow to Revenue vs COGS chart (lines 36–39)**

Replace the four chart element lines with filter-enhanced versions:

```tsx
                <Bar dataKey="revenue" name="Revenue ($B)" fill="rgba(96,165,250,0.42)" radius={[5, 5, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                <Bar dataKey="cogs" name="COGS ($B)" fill="rgba(248,113,113,0.38)" radius={[5, 5, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                <Bar dataKey="grossProfit" name="Gross Profit ($B)" fill="rgba(74,222,128,0.40)" radius={[5, 5, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                <Line type="monotone" dataKey="grossProfit" name="Gross Profit Trend" stroke="#e8ecf1" strokeWidth={2} dot={{ fill: '#e8ecf1', r: 3.5, strokeWidth: 0 }} style={{ filter: 'url(#fGlow)' }} />
```

(Fill opacities bumped from 0.30–0.35 → 0.38–0.42 to compensate for the blur slightly washing out the color.)

- [ ] **Step 2: Apply glow to Margin Trends chart (lines 62–64)**

```tsx
                <Line type="monotone" dataKey="gross" name="Gross Margin %" stroke="#4ade80" strokeWidth={2} dot={{ fill: '#4ade80', r: 3, strokeWidth: 0 }} style={{ filter: 'url(#fGlow)' }} />
                <Line type="monotone" dataKey="operating" name="Operating Margin %" stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 3, strokeWidth: 0 }} style={{ filter: 'url(#fGlow)' }} />
                <Line type="monotone" dataKey="net" name="Net Margin %" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3, strokeWidth: 0 }} style={{ filter: 'url(#fGlow)' }} />
```

- [ ] **Step 3: Apply glow to Revenue & EPS chart (lines 102–103)**

```tsx
                <Bar yAxisId="revenue" dataKey="revenue" name="Revenue ($B)" fill="rgba(96,165,250,0.65)" radius={[5, 5, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                <Line yAxisId="eps" type="monotone" dataKey="adjEPS" name="Adj EPS" stroke="#4ade80" strokeWidth={2.5} dot={{ fill: '#4ade80', r: 4, strokeWidth: 0 }} style={{ filter: 'url(#fGlow)' }} />
```

- [ ] **Step 4: Apply glow to Dividend FCF chart (lines 225–226)**

```tsx
                  <Bar dataKey="fcf" name="Free Cash Flow ($B)" fill="rgba(74,222,128,0.62)" radius={[4, 4, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                  <Bar dataKey="dividendsPaid" name="Dividends Paid ($B)" fill="rgba(248,113,113,0.62)" radius={[4, 4, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
```

- [ ] **Step 5: Verify visually**

With the dev server running, open a ticker that has dividend data (e.g. AAPL or JNJ). Navigate to the Financials tab. All chart bars should have a soft luminescence; all lines should glow slightly. If the glow is not visible, open DevTools and inspect one of the `<path>` elements — confirm it has `filter: url(#fGlowBar)` in its computed styles.

- [ ] **Step 6: Commit**

```bash
git add components/reports/tabs/FinancialsTab.tsx
git commit -m "style: add feather glow to FinancialsTab charts"
```

---

### Task 3: Glow ValuationTab — P/E chart

**Files:**
- Modify: `components/reports/tabs/ValuationTab.tsx`

One chart: Historical P/E LineChart (lines 85–108).

- [ ] **Step 1: Apply glow to P/E line and reference line (lines 103–107)**

```tsx
                <Line
                  type="monotone" dataKey="pe" name="P/E Ratio"
                  stroke="#60a5fa" strokeWidth={2.5}
                  dot={{ fill: '#60a5fa', r: 4, strokeWidth: 0 }}
                  style={{ filter: 'url(#fGlow)' }}
                />
```

For the `<ReferenceLine>` (lines 91–101), Recharts' ReferenceLine renders an SVG `<line>` element. Add `style={{ filter: 'url(#fGlow)' }}`:

```tsx
                {valuation.sectorMedianPE > 0 && (
                  <ReferenceLine
                    y={valuation.sectorMedianPE}
                    stroke="#f59e0b"
                    strokeDasharray="6 3"
                    style={{ filter: 'url(#fGlow)' }}
                    label={{
                      value: `Sector ${valuation.sectorMedianPE.toFixed(0)}x`,
                      position: 'right',
                      fill: '#f59e0b',
                      fontSize: 10,
                    }}
                  />
                )}
```

- [ ] **Step 2: Verify visually**

Open any ticker with P/E history. Navigate to the Valuation tab. The blue P/E line and amber sector median dashed line should glow softly.

- [ ] **Step 3: Commit**

```bash
git add components/reports/tabs/ValuationTab.tsx
git commit -m "style: add feather glow to ValuationTab P/E chart"
```

---

### Task 4: Glow VerdictTab — Price Projection chart

**Files:**
- Modify: `components/reports/tabs/VerdictTab.tsx`

One chart: Price Projection ComposedChart (lines 154–186). It has two `<Area>` elements and two `<Line>` elements.

- [ ] **Step 1: Apply glow to all chart elements (lines 167–185)**

```tsx
                <Area
                  type="monotone" dataKey="bull" name="Bull"
                  stroke="#4ade80" fill="rgba(74,222,128,0.18)" strokeWidth={2}
                  style={{ filter: 'url(#fGlow)' }}
                />
                <Line
                  type="monotone" dataKey="base" name="Base"
                  stroke="#60a5fa" strokeWidth={2.5}
                  dot={{ fill: '#60a5fa', r: 4, strokeWidth: 0 }}
                  style={{ filter: 'url(#fGlow)' }}
                />
                <Area
                  type="monotone" dataKey="bear" name="Bear"
                  stroke="#f87171" fill="rgba(248,113,113,0.18)" strokeWidth={2}
                  strokeDasharray="5 3"
                  style={{ filter: 'url(#fGlow)' }}
                />
                <Line
                  type="monotone" dataKey="analystMean" name="Analyst Mean"
                  stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3"
                  dot={false}
                  style={{ filter: 'url(#fGlow)' }}
                />
```

- [ ] **Step 2: Verify visually**

Open a ticker and go to the Verdict tab. The Price Projection chart's bull (green), base (blue), bear (red dashed) areas/lines and analyst mean (amber dashed) should all have the feather glow.

- [ ] **Step 3: Commit**

```bash
git add components/reports/tabs/VerdictTab.tsx
git commit -m "style: add feather glow to VerdictTab price projection chart"
```

---

### Task 5: Glow CatalystsTab — Analyst Recommendation stacked bar

**Files:**
- Modify: `components/reports/tabs/CatalystsTab.tsx`

One chart: Analyst Recommendation Trend BarChart (lines 143–150).

- [ ] **Step 1: Apply glow to stacked bars (lines 148–150)**

```tsx
                <Bar dataKey="buy" name="Buy" stackId="a" fill="rgba(74,222,128,0.72)" style={{ filter: 'url(#fGlowBar)' }} />
                <Bar dataKey="hold" name="Hold" stackId="a" fill="rgba(96,165,250,0.72)" style={{ filter: 'url(#fGlowBar)' }} />
                <Bar dataKey="sell" name="Sell" stackId="a" fill="rgba(248,113,113,0.72)" radius={[4, 4, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
```

(Fill opacity bumped from 0.70 → 0.72 slightly.)

- [ ] **Step 2: Verify visually**

Open a ticker and go to Catalysts tab. The stacked bar chart (Buy/Hold/Sell) should show bars with a soft glow.

- [ ] **Step 3: Commit**

```bash
git add components/reports/tabs/CatalystsTab.tsx
git commit -m "style: add feather glow to CatalystsTab recommendation bars"
```

---

### Task 6: Glow OverviewTab — Competitive Moat radar

**Files:**
- Modify: `components/reports/tabs/OverviewTab.tsx:518-519`

One chart: Competitive Moat RadarChart. Recharts' `<Radar>` component renders SVG paths and does forward the `style` prop to its group element. The `<RadarChart>` contains all radar paths in the same SVG, so `url(#fGlow)` resolves to the defs injected by StockReport.

- [ ] **Step 1: Apply glow to both Radar elements (lines 518–519)**

```tsx
                  {hasSector && <Radar dataKey="sectorScore" stroke="#a78bfa" fill="rgba(167,139,250,0.18)" strokeWidth={1.5} strokeDasharray="4 3" isAnimationActive={false} style={{ filter: 'url(#fGlow)' }} />}
                  <Radar dataKey="score" stroke="#60a5fa" fill="rgba(96,165,250,0.22)" strokeWidth={2} dot={{ r: 4, fill: '#60a5fa', strokeWidth: 0 }} isAnimationActive={false} style={{ filter: 'url(#fGlow)' }} />
```

(Also bump company score fill from 0.20 → 0.22.)

- [ ] **Step 2: Verify visually**

Open a ticker and go to the Overview tab. The Competitive Moat radar chart strokes should glow. If the `style` prop is not forwarded by Recharts' Radar (i.e., no visible change), the fallback is to wrap the `<ResponsiveContainer>` in a `<div style={{ filter: 'url(#fGlow)' }}>` — but try the `style` prop first.

- [ ] **Step 3: Commit**

```bash
git add components/reports/tabs/OverviewTab.tsx
git commit -m "style: add feather glow to OverviewTab radar chart"
```

---

### Task 7: Glow MatrixScatter — stock dots

**Files:**
- Modify: `components/MatrixScatter.tsx:829-846` (existing `<defs>` block) and `~1128-1161` (stock dot circles)

MatrixScatter already has a `<defs>` block at line 829 with radial gradients. We add the glow filters there and apply them to the three stock dot circles.

- [ ] **Step 1: Add glow filters to the existing `<defs>` block (after line 846)**

The existing `<defs>` block ends at line 846 with `</defs>`. Add the two filters before the closing tag:

```tsx
              <defs>
                <radialGradient id="grad-core" cx="25%" cy="25%" r="60%">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="grad-volatile" cx="75%" cy="25%" r="60%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="grad-defensive" cx="25%" cy="75%" r="60%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="grad-atrisk" cx="75%" cy="75%" r="60%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                </radialGradient>
                <filter id="fGlowDot" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur"/>
                  <feMerge>
                    <feMergeNode in="blur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
```

(Using `id="fGlowDot"` instead of `fGlow` to avoid conflict with the StockReport-level filter, since both are in the same document. The larger `x/y/width/height` percentages give more room for the glow on small circles.)

- [ ] **Step 2: Add filter to the pulse ring circle (~line 1129)**

```tsx
                    {isActive && (
                      <circle
                        cx={cx} cy={cy} r={r + 6}
                        fill="none" stroke={color} strokeWidth="1.5"
                        opacity={0.3}
                        filter="url(#fGlowDot)"
                        style={{ animation: 'pulse 2s ease-in-out infinite' }}
                      />
                    )}
```

- [ ] **Step 3: Add filter to the main stock dot circle (~line 1151)**

```tsx
                    <circle
                      cx={cx} cy={cy}
                      r={isActive ? r + 2 : r}
                      fill={color} fillOpacity={0.15}
                      stroke={color} strokeWidth={isActive ? 2 : 1.5}
                      filter="url(#fGlowDot)"
                      style={{
                        transform: mounted ? 'scale(1)' : 'scale(0)',
                        transformOrigin: `${cx}px ${cy}px`,
                        transition: `transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 25}ms, r 0.2s ease`,
                      }}
                    />
```

(Leave the drawdown ring circle without a filter — it already has opacity-based styling and adding glow could make risk indicators look over-styled.)

- [ ] **Step 4: Verify visually**

Navigate to the Matrix tab (Dashboard → Matrix view). The stock dots should have a subtle luminescence matching the charts. The active (pinned/hovered) dot's pulse ring should also glow.

- [ ] **Step 5: Commit**

```bash
git add components/MatrixScatter.tsx
git commit -m "style: add feather glow to MatrixScatter stock dots"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Lines/dots glow (stdDeviation=1.6): Tasks 2–6
- ✅ Bars glow (stdDeviation=1.0): Tasks 2, 4, 5
- ✅ Area elements glow: Task 4
- ✅ MatrixScatter dots glow: Task 7
- ✅ Filter defs defined once, no per-chart duplication: Task 1
- ✅ Colors unchanged: all color values are preserved across tasks
- ✅ Existing badge/FearGreed/conviction glow untouched: not modified in any task

**Filter ID consistency:**
- `fGlow` / `fGlowBar`: defined in StockReport hidden SVG, used by all Recharts tab charts
- `fGlowDot`: defined inside MatrixScatter's own SVG `<defs>` (different SVG document context)

**No placeholders present.**
