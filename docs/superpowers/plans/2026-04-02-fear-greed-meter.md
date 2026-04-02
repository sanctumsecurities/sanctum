# Fear & Greed Meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CNN Fear & Greed Index meter (score + 50-tick bar) to the nav bar between the Watchlist tab and settings icon.

**Architecture:** A Next.js proxy API route fetches from CNN's dataviz endpoint and returns `{ score, rating }`. A client component polls the proxy every 5 minutes and renders the label + tick bar inline in the nav's right icons section.

**Tech Stack:** Next.js 14 App Router, React (client component), TypeScript, inline styles

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/api/fear-greed/route.ts` | Proxy CNN F&G API, return `{ score, rating }` |
| Create | `components/FearGreedMeter.tsx` | Client component: fetch + render label + tick bar |
| Modify | `app/page.tsx` | Import component, insert into nav right icons section |

---

### Task 1: Create the `/api/fear-greed` proxy route

**Files:**
- Create: `app/api/fear-greed/route.ts`

> No test suite is configured in this project — verify manually in Task 3.

- [ ] **Step 1: Create the route file**

Create `app/api/fear-greed/route.ts` with this exact content:

```ts
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ])
}

export async function GET() {
  try {
    const res = await withTimeout(
      fetch(CNN_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
      5000
    )
    if (!res.ok) throw new Error(`CNN API responded ${res.status}`)
    const data = await res.json()
    const { score, rating } = data.fear_and_greed
    return NextResponse.json({ score: Math.round(score), rating })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/fear-greed/route.ts
git commit -m "feat: add /api/fear-greed proxy route"
```

---

### Task 2: Create the `FearGreedMeter` component

**Files:**
- Create: `components/FearGreedMeter.tsx`

- [ ] **Step 1: Create the component file**

Create `components/FearGreedMeter.tsx` with this exact content:

```tsx
'use client'

import { useEffect, useState } from 'react'

interface FGData {
  score: number
  rating: string
}

function getZone(score: number): { label: string; color: string } {
  if (score <= 25) return { label: 'EXTREME FEAR', color: '#ef4444' }
  if (score <= 45) return { label: 'FEAR', color: '#f0a030' }
  if (score <= 55) return { label: 'NEUTRAL', color: '#999999' }
  if (score <= 75) return { label: 'GREED', color: '#a0d040' }
  return { label: 'EXTREME GREED', color: '#22c55e' }
}

function getTickColor(index: number): string {
  if (index <= 16) return '#ef4444'
  if (index <= 33) return '#f0a030'
  return '#22c55e'
}

export default function FearGreedMeter() {
  const [data, setData] = useState<FGData | null>(null)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/fear-greed')
      if (!res.ok) return
      const json = await res.json()
      if (typeof json.score === 'number') setData(json)
    } catch {
      // silent fail — meter stays blank
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (!data) {
    return (
      <div
        id="fear-greed-meter"
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.5px',
            color: '#555',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          —
        </span>
      </div>
    )
  }

  const { label, color } = getZone(data.score)
  const activeUpTo = Math.round((data.score / 100) * 49)

  return (
    <div
      id="fear-greed-meter"
      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
          color,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {data.score} {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 16 }}>
        {Array.from({ length: 50 }, (_, i) => (
          <span
            key={i}
            style={{
              width: 2,
              height: 14,
              borderRadius: 1,
              flexShrink: 0,
              backgroundColor: getTickColor(i),
              opacity: i <= activeUpTo ? 1 : 0.25,
              display: 'block',
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/FearGreedMeter.tsx
git commit -m "feat: add FearGreedMeter component"
```

---

### Task 3: Integrate into `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

The nav's right icons section lives around line 1463. It is a `div` with `position: absolute; right: 0`. The meter goes in as the first child, wrapped in a `div` with `className="nav-links-desktop"` so the existing mobile media query hides it automatically (`display: none !important` below 768px).

- [ ] **Step 1: Add the import**

In `app/page.tsx`, after the existing component imports (around line 8), add:

```tsx
import FearGreedMeter from '@/components/FearGreedMeter'
```

The import block should look like:

```tsx
import Auth from '@/components/Auth'
import dynamic from 'next/dynamic'
import type { Session } from '@supabase/supabase-js'
import SettingsModal from '@/components/SettingsModal'
import FearGreedMeter from '@/components/FearGreedMeter'
```

- [ ] **Step 2: Insert the meter into the nav**

Find the right icons `div` comment and opening tag (around line 1463):

```tsx
        {/* Right: Icons — flush to viewport edge */}
        <div style={{
          position: 'absolute', right: 0, top: 0, height: 56,
          display: 'flex', alignItems: 'center',
          paddingRight: 40, gap: 12,
        }}>
            <button
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#888', padding: 4, display: 'flex', alignItems: 'center',
                transition: 'color 0.2s ease',
              }}
              onClick={() => setShowSettings(true)}
```

Insert the meter and separator immediately after the opening `>` of that div, before the settings `<button>`:

```tsx
        {/* Right: Icons — flush to viewport edge */}
        <div style={{
          position: 'absolute', right: 0, top: 0, height: 56,
          display: 'flex', alignItems: 'center',
          paddingRight: 40, gap: 12,
        }}>
            <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FearGreedMeter />
              <span style={{ width: 1, height: 16, background: '#2a2a2a', flexShrink: 0 }} />
            </div>
            <button
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#888', padding: 4, display: 'flex', alignItems: 'center',
                transition: 'color 0.2s ease',
              }}
              onClick={() => setShowSettings(true)}
```

- [ ] **Step 3: Verify in the browser**

Run `npm run dev` and open `http://localhost:3000`.

Check:
- The meter appears between the Watchlist tab and settings gear
- A score (e.g. `42 FEAR`) is shown in the correct zone color
- Ticks up to the active threshold are full opacity; the rest are 0.25
- Tick colors transition red → amber → green left to right
- Narrowing the window below 768px hides the meter
- Opening DevTools → Network → filter for `fear-greed` shows a 200 response from `/api/fear-greed` with `{ score, rating }`

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: integrate FearGreedMeter into nav bar"
```
