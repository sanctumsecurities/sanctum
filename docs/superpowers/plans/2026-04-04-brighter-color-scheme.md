# Brighter Color Scheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add glow effects to accent-colored elements, bump badge background/border opacities, and increase chart fill opacities — no hex color changes.

**Architecture:** Purely visual changes across 8 files. All modifications are inline style edits matching existing patterns. No new components or abstractions.

**Tech Stack:** Next.js 14, React inline styles, Recharts, SVG

**Spec:** `docs/superpowers/specs/2026-04-04-brighter-color-scheme-design.md`

---

### Task 1: ReportUI.tsx — Badge Opacity Bump + Glow

**Files:**
- Modify: `components/reports/ReportUI.tsx:57-75`

- [ ] **Step 1: Update badgeColors opacity values**

Change the `badgeColors` object at line 57. Bump `bg` from `0.12` → `0.18` and `border` from `0.22` → `0.35` for all colored variants. Gray stays unchanged.

```typescript
const badgeColors: Record<string, { bg: string; color: string; border: string; glow: string }> = {
  green: { bg: 'rgba(74,222,128,0.18)', color: '#4ade80', border: 'rgba(74,222,128,0.35)', glow: '0 0 10px 1px rgba(74,222,128,0.25)' },
  red: { bg: 'rgba(248,113,113,0.18)', color: '#f87171', border: 'rgba(248,113,113,0.35)', glow: '0 0 10px 1px rgba(248,113,113,0.25)' },
  blue: { bg: 'rgba(96,165,250,0.18)', color: '#60a5fa', border: 'rgba(96,165,250,0.35)', glow: '0 0 10px 1px rgba(96,165,250,0.25)' },
  yellow: { bg: 'rgba(234,179,8,0.18)', color: '#eab308', border: 'rgba(234,179,8,0.35)', glow: '0 0 10px 1px rgba(234,179,8,0.25)' },
  gray: { bg: 'rgba(255,255,255,0.06)', color: '#8b95a5', border: 'rgba(255,255,255,0.1)', glow: 'none' },
}
```

- [ ] **Step 2: Add boxShadow to Badge component**

Update the Badge component's inline style at line 68 to include the glow:

```typescript
export function Badge({ text, variant = 'gray' }: { text: string; variant?: 'green' | 'red' | 'blue' | 'yellow' | 'gray' }) {
  const c = badgeColors[variant] || badgeColors.gray
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 4,
      fontSize: 10, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
      whiteSpace: 'nowrap',
      boxShadow: c.glow,
    }}>{text}</span>
  )
}
```

- [ ] **Step 3: Verify dev server renders badges with glow**

Run: `npm run dev` (if not already running)
Open any report page → check that BUY/SELL/HOLD badges have a subtle colored glow and slightly stronger background fill.

- [ ] **Step 4: Commit**

```bash
git add components/reports/ReportUI.tsx
git commit -m "style: add glow + opacity bump to Badge component"
```

---

### Task 2: VerdictTab.tsx — Scenario Card Glows + Chart Fill Opacity

**Files:**
- Modify: `components/reports/tabs/VerdictTab.tsx:60-73,166-178`

- [ ] **Step 1: Add boxShadow glow to scenario card border-top colors**

At line 70, add a `boxShadow` that matches the border color. The scenario cards are defined with `borderTop: '3px solid ${border}'`. Add a glow using the border color:

```typescript
return (
  <div key={key} style={{
    ...glassCard,
    borderTop: `3px solid ${border}`,
    padding: '20px',
    boxShadow: `0 -4px 12px -2px ${border}44`,
  }}>
```

The `44` suffix = ~27% opacity hex. The glow shines upward from the colored border-top.

- [ ] **Step 2: Bump Area fill opacity from 0.08 → 0.18**

At line 168, change the bull Area fill:
```typescript
<Area
  type="monotone" dataKey="bull" name="Bull"
  stroke="#4ade80" fill="rgba(74,222,128,0.18)" strokeWidth={2}
/>
```

At line 177, change the bear Area fill:
```typescript
<Area
  type="monotone" dataKey="bear" name="Bear"
  stroke="#f87171" fill="rgba(248,113,113,0.18)" strokeWidth={2}
  strokeDasharray="5 3"
/>
```

- [ ] **Step 3: Verify in dev server**

Open a report → Verdict tab → check:
- Scenario cards have a subtle colored glow along the top edge
- Price projection chart has more visible green/red area fills

- [ ] **Step 4: Commit**

```bash
git add components/reports/tabs/VerdictTab.tsx
git commit -m "style: add scenario card glow + bump chart fill opacity in VerdictTab"
```

---

### Task 3: OverviewTab.tsx — Sentiment Badge Glow + Radar Fill Opacity

**Files:**
- Modify: `components/reports/tabs/OverviewTab.tsx:235-243,254-260,262-267,516`

- [ ] **Step 1: Bump sentiment badge bg/border opacity and add glow**

At lines 235-243, update the sentiment object. Bump `bg` by ~50% and `border` by ~60%, and add a `glow` property:

```typescript
const sentiment = totalScore >= 12
  ? { label: 'STRONG BUY', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.35)', glow: '0 0 10px 1px rgba(74,222,128,0.25)' }
  : totalScore >= 8
  ? { label: 'BUY', color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.25)', glow: '0 0 10px 1px rgba(74,222,128,0.25)' }
  : totalScore >= 4
  ? { label: 'HOLD', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.25)', glow: '0 0 10px 1px rgba(96,165,250,0.25)' }
  : totalScore >= 1
  ? { label: 'SELL', color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', glow: '0 0 10px 1px rgba(248,113,113,0.25)' }
  : { label: 'STRONG SELL', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.35)', glow: '0 0 10px 1px rgba(248,113,113,0.25)' }
```

- [ ] **Step 2: Apply glow to the sentiment badge span**

At line 254, add `boxShadow: sentiment.glow` to the inline style of the sentiment badge span:

```typescript
<span style={{
  fontSize: 10, fontWeight: 700, color: sentiment.color,
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em',
  padding: '3px 9px', borderRadius: 3,
  border: `1px solid ${sentiment.border}`,
  whiteSpace: 'nowrap',
  boxShadow: sentiment.glow,
}}>{sentiment.label} ({totalScore})</span>
```

- [ ] **Step 3: Add glow to insider signal pills**

At lines 262-267, add boxShadow to the signal pills:

```typescript
{signals.map((s, i) => (
  <span key={i} style={{
    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
    color: s.positive ? '#4ade80' : '#f87171',
    background: s.positive ? 'rgba(74,222,128,0.10)' : 'rgba(248,113,113,0.10)',
    border: `1px solid ${s.positive ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
    borderRadius: 3, padding: '2px 7px', whiteSpace: 'nowrap',
    boxShadow: s.positive ? '0 0 8px 1px rgba(74,222,128,0.2)' : '0 0 8px 1px rgba(248,113,113,0.2)',
  }}>
    {s.positive ? '↑' : '↓'} {s.text}
  </span>
))}
```

- [ ] **Step 4: Bump radar chart sector fill from 0.08 → 0.18**

At line 516, change the sector Radar fill:

```typescript
{hasSector && <Radar dataKey="sectorScore" stroke="#a78bfa" fill="rgba(167,139,250,0.18)" strokeWidth={1.5} strokeDasharray="4 3" isAnimationActive={false} />}
```

- [ ] **Step 5: Verify in dev server**

Open a report → Overview tab → check:
- Institutional & Insider sentiment badge has colored glow
- Insider signal pills (ownership ↑/↓) have colored glow
- Competitive Moat radar's sector overlay is more visible

- [ ] **Step 6: Commit**

```bash
git add components/reports/tabs/OverviewTab.tsx
git commit -m "style: add glow to sentiment/insider badges, bump radar fill opacity in OverviewTab"
```

---

### Task 4: CatalystsTab.tsx — Risk Card Glow + Insider Dot Glow

**Files:**
- Modify: `components/reports/tabs/CatalystsTab.tsx:108-111,172-175`

- [ ] **Step 1: Add glow to risk assessment card borders**

At line 108, add a boxShadow that matches the severity border color:

```typescript
<div key={i} style={{
  ...glassCard,
  borderLeft: `3px solid ${severityBorder[risk.severity] || '#60a5fa'}`,
  padding: '16px 20px',
  boxShadow: `inset 3px 0 12px -4px ${severityBorder[risk.severity] || '#60a5fa'}44`,
}}>
```

This creates an inward glow from the left border.

- [ ] **Step 2: Add glow to insider activity dots**

At line 172, add boxShadow to the colored dot:

```typescript
<div style={{
  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
  background: txn.type === 'BUY' ? '#4ade80' : '#f87171',
  boxShadow: txn.type === 'BUY'
    ? '0 0 8px 2px rgba(74,222,128,0.4)'
    : '0 0 8px 2px rgba(248,113,113,0.4)',
}} />
```

- [ ] **Step 3: Verify in dev server**

Open a report → Catalysts tab → check:
- Risk cards have a subtle inward glow from the severity-colored left border
- Insider activity dots glow green (BUY) or red (SELL)

- [ ] **Step 4: Commit**

```bash
git add components/reports/tabs/CatalystsTab.tsx
git commit -m "style: add glow to risk cards and insider dots in CatalystsTab"
```

---

### Task 5: FearGreedMeter.tsx — Tick Bar Glow

**Files:**
- Modify: `components/FearGreedMeter.tsx:75-83,88-101`

- [ ] **Step 1: Add text-shadow glow to the score label**

At line 75, add textShadow to the score/label span:

```typescript
<span
  style={{
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
    color,
    fontFamily: "'JetBrains Mono', monospace",
    textShadow: `0 0 8px ${color}66`,
  }}
>
  {data.score} {label}
</span>
```

The `66` suffix = 40% opacity hex appended to the zone color.

- [ ] **Step 2: Add glow to active tick bars**

At line 88, add boxShadow to active ticks only:

```typescript
{Array.from({ length: 50 }, (_, i) => {
  const tickColor = getTickColor(i)
  const isActive = i <= activeUpTo
  return (
    <span
      key={i}
      style={{
        width: 2,
        height: 14,
        borderRadius: 1,
        flexShrink: 0,
        backgroundColor: tickColor,
        opacity: isActive ? 1 : 0.25,
        display: 'block',
        boxShadow: isActive ? `0 0 4px 1px ${tickColor}55` : 'none',
      }}
    />
  )
})}
```

- [ ] **Step 3: Verify in dev server**

Open dashboard → check the Fear & Greed meter in the header:
- Score text has a subtle colored glow
- Active tick bars have a faint glow matching their color

- [ ] **Step 4: Commit**

```bash
git add components/FearGreedMeter.tsx
git commit -m "style: add glow to Fear & Greed meter score and ticks"
```

---

### Task 6: page.tsx — Price Chart Fill Opacity + Status Dot Glow

**Files:**
- Modify: `app/page.tsx:812,1366-1372`

- [ ] **Step 1: Bump price chart fill opacity from 0.08 → 0.18**

At line 812, change the fillColor:

```typescript
const fillColor = up ? 'rgba(34,197,94,0.18)' : 'rgba(248,113,113,0.18)'
```

- [ ] **Step 2: Add glow to the health status dot**

At line 1366, add boxShadow to the status dot:

```typescript
<div style={{
  width: 7, height: 7, borderRadius: '50%',
  background: statusColor,
  animation: 'pulse 2s ease-in-out infinite',
  flexShrink: 0,
  transition: 'background 0.4s ease',
  boxShadow: `0 0 8px 2px ${statusColor}66`,
}} />
```

- [ ] **Step 3: Verify in dev server**

Check:
- Dashboard price charts have more visible colored fill under the line
- Health status dot in bottom-left glows green/yellow/red

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "style: bump chart fill opacity + add status dot glow in page.tsx"
```

---

### Task 7: MatrixScatter.tsx — Quadrant Gradient Opacity Bump

**Files:**
- Modify: `components/MatrixScatter.tsx` (quadrant radial gradients)

- [ ] **Step 1: Bump quadrant background gradient opacity from 0.06 → 0.12**

Find the radial gradient `<defs>` block with `stopOpacity="0.06"` and change to `0.12`:

```jsx
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
</defs>
```

- [ ] **Step 2: Verify in dev server**

Open Dashboard → Matrix tab → check that quadrant backgrounds have more visible colored tinting.

- [ ] **Step 3: Commit**

```bash
git add components/MatrixScatter.tsx
git commit -m "style: bump quadrant gradient opacity in MatrixScatter"
```

---

### Task 8: Final Visual QA Pass

- [ ] **Step 1: Full walkthrough**

Navigate through every section of the app and confirm:
- [ ] Dashboard price charts — fills more visible
- [ ] Fear & Greed meter — score text and ticks glow
- [ ] Health status dot — glows
- [ ] Matrix scatter — quadrant backgrounds more visible
- [ ] Any report → Overview tab — sentiment badge glows, insider signals glow, radar fill stronger
- [ ] Any report → Catalysts tab — risk cards glow from left border, insider dots glow
- [ ] Any report → Verdict tab — scenario cards glow from top border, area chart fills stronger
- [ ] All Badge components across every tab — glow + stronger bg/border

- [ ] **Step 2: Check for visual regressions**

Ensure no elements look broken, overlapping, or too bright. Glows should be subtle enhancement, not overpowering.

- [ ] **Step 3: Final commit if any touch-ups needed**

```bash
git add -A
git commit -m "style: final QA touch-ups for brighter color scheme"
```
