# Market Session Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four subtle vertical dashed line markers (P, O, C, A) to the sparkline SVG on each stock report card, indicating pre-market open, market open, market close, and after-hours close in ET.

**Architecture:** All changes are inside the existing IIFE in `app/page.tsx` that renders the sparkline SVG (~line 603). Compute ET session boundaries from the data's time range using `Intl.DateTimeFormat` to derive the ET offset, then check both the ET day of `pts[0]` and the next ET day so all visible boundaries within the 24h window are rendered.

**Tech Stack:** React (inline SVG), `Intl.DateTimeFormat`, TypeScript

---

### Task 1: Add session markers to sparkline SVG

**Files:**
- Modify: `app/page.tsx:631-639` (the SVG return inside the IIFE)

No test suite is configured. Manual verification: run `npm run dev`, open the app, confirm markers appear on report cards.

- [ ] **Step 1: Read the current SVG render block**

Open `app/page.tsx` and locate the SVG return (~line 631). It currently looks like:

```tsx
return (
  <svg
    viewBox={`0 0 ${w} ${h}`}
    preserveAspectRatio="none"
    style={{ width: '100%', height: '100%', minHeight: 40, display: 'block' }}
  >
    <polygon points={fillPoints} fill={fillColor} />
    <polyline points={linePoints} fill="none" stroke={strokeColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
  </svg>
)
```

- [ ] **Step 2: Insert the marker computation and SVG elements**

Replace the SVG return block with the following. The marker computation goes between the `fillColor` assignment and the `return`, then the `<g>` of markers is inserted between the polyline and the closing `</svg>`.

Replace:
```tsx
          const up = prices[prices.length - 1] >= prices[0]
          const strokeColor = up ? '#22c55e' : '#f87171'
          const fillColor = up ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)'
          return (
            <svg
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', minHeight: 40, display: 'block' }}
            >
              <polygon points={fillPoints} fill={fillColor} />
              <polyline points={linePoints} fill="none" stroke={strokeColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
          )
```

With:
```tsx
          const up = prices[prices.length - 1] >= prices[0]
          const strokeColor = up ? '#22c55e' : '#f87171'
          const fillColor = up ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)'

          // Compute ET session boundary markers
          const startMs = new Date(pts[0].time).getTime()
          const endMs = new Date(pts[pts.length - 1].time).getTime()
          const probeDate = new Date(startMs)
          const etParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
          }).formatToParts(probeDate)
          const pyr = etParts.find(p => p.type === 'year')!.value
          const pmo = etParts.find(p => p.type === 'month')!.value
          const pda = etParts.find(p => p.type === 'day')!.value
          const pH  = String(parseInt(etParts.find(p => p.type === 'hour')!.value) % 24).padStart(2, '0')
          const pM  = etParts.find(p => p.type === 'minute')!.value
          const pS  = etParts.find(p => p.type === 'second')!.value
          const probeEtFakeUtcMs = Date.parse(`${pyr}-${pmo}-${pda}T${pH}:${pM}:${pS}Z`)
          const offsetMs = startMs - probeEtFakeUtcMs
          const etMidnightUtcMs = Date.parse(`${pyr}-${pmo}-${pda}T00:00:00Z`) + offsetMs
          const sessionBoundaries = [
            { label: 'P', etH: 4,  etM: 0  },
            { label: 'O', etH: 9,  etM: 30 },
            { label: 'C', etH: 16, etM: 0  },
            { label: 'A', etH: 20, etM: 0  },
          ]
          const sessionMarkers: { x: number; label: string }[] = []
          for (const { label: bLabel, etH, etM } of sessionBoundaries) {
            for (const dayShift of [0, 86400000]) {
              const bMs = etMidnightUtcMs + dayShift + (etH * 60 + etM) * 60000
              const x = ((bMs - startMs) / (endMs - startMs)) * w
              if (x > 0 && x < w) sessionMarkers.push({ x, label: bLabel })
            }
          }

          return (
            <svg
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', minHeight: 40, display: 'block' }}
            >
              <polygon points={fillPoints} fill={fillColor} />
              <polyline points={linePoints} fill="none" stroke={strokeColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              {sessionMarkers.map(({ x, label: mLabel }) => (
                <g key={mLabel}>
                  <line
                    x1={x} y1={0} x2={x} y2={h}
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
                    {mLabel}
                  </text>
                </g>
              ))}
            </svg>
          )
```

- [ ] **Step 3: Verify the app compiles and markers appear**

```bash
npm run dev
```

Open `http://localhost:3000`. With at least one report card loaded:
- During market hours (9:30 AM–4:00 PM ET): expect O marker visible on the left portion of the chart, C marker not yet visible or near right edge
- During after-hours: expect C and possibly A visible
- Markers should be subtle dashed white lines with small letters at the top
- Hover/crosshair behavior should be unaffected (markers are inside the SVG, overlays are in sibling `<div>` elements)

- [ ] **Step 4: Commit**

```bash
git add "app/page.tsx"
git commit -m "feat: add subtle ET session boundary markers to sparkline charts"
```
