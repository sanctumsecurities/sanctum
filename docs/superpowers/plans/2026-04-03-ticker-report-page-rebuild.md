# Ticker Report Page Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ticker report page with a full AI-generated equity research report using Gemini 2.0 Flash, rendered in a 5-tab layout matching SANCTUM's dark terminal aesthetic.

**Architecture:** Server action calls Gemini → returns typed `StockReport` JSON → client shell manages loading/tabs/error → each tab is an isolated component receiving its data slice. Shared UI primitives in `ReportUI.tsx`. Report page is a thin wrapper with Back + Watchlist buttons.

**Tech Stack:** Next.js 14 App Router, `@google/generative-ai` (Gemini 2.0 Flash), `recharts`, `@supabase/supabase-js`, TypeScript. All already installed — no new packages.

**Spec:** `docs/superpowers/specs/2026-04-03-ticker-report-page-rebuild-design.md`

---

## File Structure

```
types/report.ts                              — StockReport interface
app/actions/generateReport.ts                — "use server", Gemini 2.0 Flash call
components/reports/ReportUI.tsx              — MetricCard, Badge, SectionTitle, DataTable, CTooltip
components/reports/tabs/OverviewTab.tsx      — Key metrics, business summary, pie chart, radar
components/reports/tabs/FinancialsTab.tsx    — Revenue/EPS combo chart, data table, callout
components/reports/tabs/ValuationTab.tsx     — Bull/bear paragraphs, metrics table
components/reports/tabs/CatalystsTab.tsx     — Catalyst table, risk cards
components/reports/tabs/VerdictTab.tsx       — Scenarios, matrix, projections, chart, syndicate verdict
components/reports/StockReport.tsx           — Header + tab bar + loading/error + tab routing
app/reports/[ticker]/page.tsx               — Back + Watchlist + <StockReport>
```

---

### Task 1: TypeScript Interface

**Files:**
- Create: `types/report.ts`

- [ ] **Step 1: Create the StockReport interface**

```typescript
// types/report.ts

export interface StockReport {
  ticker: string
  companyName: string
  exchange: string
  currentPrice: string
  priceVsATH: string
  marketCap: string
  website: string
  verdict: 'BUY' | 'SELL' | 'HOLD' | 'AVOID'
  verdictSubtitle: string
  badges: string[]
  overview: {
    keyMetrics: { label: string; value: string; subtitle?: string; color?: string }[]
    businessSummary: string
    whatHasGoneWrong: string | null
    segmentBreakdown: { name: string; percentage: number }[]
    moatScores: { metric: string; score: number }[]
  }
  financials: {
    narrativeSummary: string
    annualData: {
      year: string
      revenue: number
      revenueGrowth: string
      adjEPS: number
      epsGrowth: string
      opCF: string
      keyMetric: string
    }[]
    callout: string
  }
  valuation: {
    bullCase: string
    bearCase: string
    metrics: { metric: string; current: string; fiveYearAvg: string; commentary: string }[]
  }
  catalysts: {
    catalystTable: { timeline: string; catalyst: string; impact: string; probability: string }[]
    risks: { risk: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; description: string }[]
  }
  verdictDetails: {
    bullCase: { priceTarget: string; return: string; description: string }
    baseCase: { priceTarget: string; return: string; description: string }
    bearCase: { priceTarget: string; return: string; description: string }
    scenarioMatrix: { scenario: string; probability: string; priceTarget: string; return: string; weighted: string }[]
    multiYearProjections: { horizon: string; bearCase: string; baseCase: string; bullCase: string; commentary: string }[]
    priceProjectionChart: { year: string; bear: number; base: number; bull: number }[]
    syndicateVerdict: {
      rating: 'BUY' | 'SELL' | 'HOLD' | 'AVOID'
      positionSizing: string
      keySignalTitle: string
      keySignalDetail: string
      honestRisk: string
      howToPosition: string
      longTermThesis: string
    }
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add types/report.ts
git commit -m "feat: add StockReport TypeScript interface"
```

---

### Task 2: Gemini Server Action

**Files:**
- Create: `app/actions/generateReport.ts`

- [ ] **Step 1: Create the server action**

```typescript
// app/actions/generateReport.ts
'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { StockReport } from '@/types/report'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function generateReport(ticker: string): Promise<StockReport | { error: string }> {
  const symbol = ticker.toUpperCase().trim()
  if (!symbol) return { error: 'Ticker is required' }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `You are a senior equity analyst at an elite hedge fund. Generate a deeply researched, institutional-quality stock analysis report for the ticker: ${symbol}.

Return ONLY a raw JSON object. No markdown. No backticks. No preamble. Just JSON.

Schema:
{
  "ticker": "string",
  "companyName": "string",
  "exchange": "string",
  "currentPrice": "string (e.g. '$174.50')",
  "priceVsATH": "string (e.g. '-55% from ATH $627')",
  "marketCap": "string (e.g. '~$256B')",
  "website": "string (company website URL, e.g. 'https://www.apple.com')",
  "verdict": "BUY" | "SELL" | "HOLD" | "AVOID",
  "verdictSubtitle": "string — one-line thesis",
  "badges": ["string — contextual badges like 'DOJ Investigation', 'Buffett Bought', 'Mkt Cap ~$256B'"],
  "overview": {
    "keyMetrics": [
      { "label": "string", "value": "string", "subtitle": "string or omit", "color": "string hex or omit" }
    ],
    "businessSummary": "string — 3 paragraphs separated by \\n\\n",
    "whatHasGoneWrong": "string or null — if company is under stress, explain what went wrong",
    "segmentBreakdown": [{ "name": "string", "percentage": number }],
    "moatScores": [{ "metric": "string", "score": number 0-100 }]
  },
  "financials": {
    "narrativeSummary": "string — 2-3 paragraphs separated by \\n\\n",
    "annualData": [
      { "year": "string", "revenue": number (in billions), "revenueGrowth": "string (e.g. '+8.2%')", "adjEPS": number, "epsGrowth": "string", "opCF": "string (e.g. '$24.3B')", "keyMetric": "string (relevant KPI)" }
    ],
    "callout": "string — single most important financial warning or insight"
  },
  "valuation": {
    "bullCase": "string — detailed bull case paragraph",
    "bearCase": "string — detailed bear case paragraph",
    "metrics": [{ "metric": "string", "current": "string", "fiveYearAvg": "string", "commentary": "string" }]
  },
  "catalysts": {
    "catalystTable": [{ "timeline": "string", "catalyst": "string", "impact": "string (use arrow like '↑ Positive' or '↓ Negative')", "probability": "string" }],
    "risks": [{ "risk": "string", "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "description": "string" }]
  },
  "verdictDetails": {
    "bullCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "baseCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "bearCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "scenarioMatrix": [{ "scenario": "string", "probability": "string", "priceTarget": "string", "return": "string", "weighted": "string" }],
    "multiYearProjections": [{ "horizon": "string", "bearCase": "string", "baseCase": "string", "bullCase": "string", "commentary": "string" }],
    "priceProjectionChart": [{ "year": "string", "bear": number, "base": number, "bull": number }],
    "syndicateVerdict": {
      "rating": "BUY" | "SELL" | "HOLD" | "AVOID",
      "positionSizing": "string — position sizing recommendation",
      "keySignalTitle": "string — dynamic signal title (e.g. 'The Buffett Signal')",
      "keySignalDetail": "string — paragraph explaining the signal",
      "honestRisk": "string — paragraph on the honest risk",
      "howToPosition": "string — paragraph on entry strategy and sizing",
      "longTermThesis": "string — paragraph on 5-10 year outlook"
    }
  }
}

Requirements:
- overview.keyMetrics: exactly 6 items: Market Cap, FY Revenue, Next Year Revenue Est., Adj EPS, Op Cash Flow, Dividend/Yield
- overview.moatScores: exactly 6 items scoring competitive advantages on 0-100 scale
- overview.segmentBreakdown: 3-8 revenue segments that sum close to 100
- financials.annualData: 4-5 years of data
- catalysts.catalystTable: 4-6 catalysts
- catalysts.risks: 4-6 risks ordered by severity
- verdictDetails.scenarioMatrix: 3 rows (Bull/Base/Bear) + 1 Expected Value row
- verdictDetails.multiYearProjections: 3 rows (3-year, 5-year, 10-year)
- verdictDetails.priceProjectionChart: 5-6 data points for chart (current year through 5 years out)
- Be specific to THIS company — no generic filler
- Return ONLY the JSON object, no wrapping`

    const result = await model.generateContent(prompt)
    const text = result.response.text()
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as StockReport
    return parsed
  } catch (err: any) {
    return { error: err.message || 'Failed to generate report' }
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/actions/generateReport.ts
git commit -m "feat: add Gemini server action for report generation"
```

---

### Task 3: Shared UI Primitives

**Files:**
- Create: `components/reports/ReportUI.tsx`

- [ ] **Step 1: Create all shared primitives**

Reference existing codebase patterns:
- `glassCard` style from `components/ReportView.tsx:71-76`
- `chartTooltipStyle` from `components/ReportView.tsx:78-83`
- `Badge` from `components/ReportView.tsx:161-178`
- `Section` from `components/ReportView.tsx:148-158`
- `KPI` from `components/ReportView.tsx:122-145`

```tsx
// components/reports/ReportUI.tsx
import type { TooltipProps } from 'recharts'

// ── Shared Styles ──
export const glassCard: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.025) 100%)',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 2px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
}

// ── MetricCard ──
export function MetricCard({ label, value, subtitle, color }: {
  label: string; value: string; subtitle?: string; color?: string
}) {
  return (
    <div style={{ ...glassCard, padding: '18px 16px', minWidth: 0 }}>
      <div style={{
        fontSize: 10, letterSpacing: 1.4, color: '#5a6475',
        textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: color || '#e8ecf1',
        fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1,
      }}>{value}</div>
      {subtitle && (
        <div style={{
          fontSize: 11, marginTop: 5, fontFamily: "'DM Sans', sans-serif",
          color: subtitle.startsWith('+') ? '#4ade80'
            : subtitle.startsWith('-') ? '#f87171'
            : '#5a6475',
        }}>{subtitle}</div>
      )}
    </div>
  )
}

// ── Badge ──
const badgeColors: Record<string, { bg: string; color: string; border: string }> = {
  green: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.22)' },
  red: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.22)' },
  blue: { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: 'rgba(96,165,250,0.22)' },
  yellow: { bg: 'rgba(234,179,8,0.12)', color: '#eab308', border: 'rgba(234,179,8,0.22)' },
  gray: { bg: 'rgba(255,255,255,0.06)', color: '#8b95a5', border: 'rgba(255,255,255,0.1)' },
}

export function Badge({ text, variant = 'gray' }: { text: string; variant?: 'green' | 'red' | 'blue' | 'yellow' | 'gray' }) {
  const c = badgeColors[variant] || badgeColors.gray
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
      fontSize: 10, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5,
      whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

// ── SectionTitle ──
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 17, fontWeight: 700, color: '#e8ecf1',
      fontFamily: "'Instrument Serif', serif",
      marginBottom: 14, paddingBottom: 10,
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      marginTop: 0,
    }}>{children}</h2>
  )
}

// ── DataTable ──
export function DataTable({ headers, rows, numericCols, boldLastRow }: {
  headers: string[]
  rows: (string | number)[][]
  numericCols?: number[]
  boldLastRow?: boolean
}) {
  const isNumeric = (colIdx: number) => numericCols?.includes(colIdx) ?? false
  const isNegative = (val: string | number) => {
    const s = String(val)
    return s.startsWith('-') || s.startsWith('(')
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontSize: 13, fontFamily: "'DM Sans', sans-serif",
      }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '10px 12px',
                textAlign: isNumeric(i) ? 'right' : 'left',
                color: '#5a6475', fontSize: 10, fontWeight: 600,
                letterSpacing: 1, textTransform: 'uppercase',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                fontFamily: "'DM Sans', sans-serif",
                whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const isLast = boldLastRow && ri === rows.length - 1
            return (
              <tr key={ri} style={{
                background: ri % 2 === 1 ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '10px 12px',
                    textAlign: isNumeric(ci) ? 'right' : 'left',
                    fontFamily: isNumeric(ci) ? "'JetBrains Mono', monospace" : "'DM Sans', sans-serif",
                    color: isNegative(cell) ? '#f87171' : '#e8ecf1',
                    fontWeight: isLast ? 700 : 400,
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    whiteSpace: 'nowrap',
                  }}>{cell}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── CTooltip (Recharts custom tooltip) ──
export function CTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(8,8,14,0.95)',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 12, fontSize: 12, padding: '10px 14px',
    }}>
      <div style={{ color: '#e8ecf1', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#8b95a5', marginBottom: 2 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/reports/ReportUI.tsx
git commit -m "feat: add shared UI primitives for report tabs"
```

---

### Task 4: Overview Tab

**Files:**
- Create: `components/reports/tabs/OverviewTab.tsx`

- [ ] **Step 1: Create the Overview tab component**

```tsx
// components/reports/tabs/OverviewTab.tsx
'use client'

import {
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts'
import { MetricCard, SectionTitle, CTooltip, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

const SEGMENT_COLORS = ['#60a5fa', '#4ade80', '#f59e0b', '#f87171', '#a78bfa', '#ec4899', '#2dd4bf', '#fb923c']

export default function OverviewTab({ overview }: { overview: StockReport['overview'] }) {
  return (
    <div>
      {/* Key Metrics Bar */}
      {overview.keyMetrics?.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12, marginBottom: 32,
        }}>
          {overview.keyMetrics.map((m, i) => (
            <MetricCard key={i} label={m.label} value={m.value} subtitle={m.subtitle} color={m.color} />
          ))}
        </div>
      )}

      {/* Business Overview */}
      <div style={{ marginBottom: 32 }}>
        <SectionTitle>Business Overview</SectionTitle>
        {overview.businessSummary?.split('\n\n').map((p, i) => (
          <p key={i} style={{
            fontSize: 14, color: '#b8c4d4', lineHeight: 1.8,
            fontFamily: "'DM Sans', sans-serif", margin: '0 0 16px',
          }}>{p}</p>
        ))}
        {overview.whatHasGoneWrong && (
          <div style={{
            ...glassCard,
            borderLeft: '3px solid #f87171',
            padding: '16px 20px', marginTop: 16,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: '#f87171',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.05em', marginBottom: 8,
              textTransform: 'uppercase',
            }}>What Has Gone Wrong</div>
            <p style={{
              fontSize: 13, color: '#b8c4d4', lineHeight: 1.7,
              fontFamily: "'DM Sans', sans-serif", margin: 0,
            }}>{overview.whatHasGoneWrong}</p>
          </div>
        )}
      </div>

      {/* Revenue by Segment */}
      {overview.segmentBreakdown?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Revenue by Segment</SectionTitle>
          <div style={{ ...glassCard, padding: '20px', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ width: 220, height: 220, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={overview.segmentBreakdown}
                    dataKey="percentage"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    strokeWidth={0}
                  >
                    {overview.segmentBreakdown.map((_, i) => (
                      <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              {overview.segmentBreakdown.map((seg, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                    background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                  }} />
                  <span style={{ flex: 1, fontSize: 13, color: '#b8c4d4', fontFamily: "'DM Sans', sans-serif" }}>
                    {seg.name}
                  </span>
                  <span style={{ fontSize: 13, color: '#e8ecf1', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    {seg.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Moat Radar */}
      {overview.moatScores?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Competitive Moat Analysis</SectionTitle>
          <div style={{ ...glassCard, padding: '20px' }}>
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={overview.moatScores} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: '#5a6475', fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}
                />
                <Radar
                  dataKey="score"
                  stroke="#60a5fa"
                  fill="rgba(96,165,250,0.20)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#60a5fa', strokeWidth: 0 }}
                />
                <Tooltip content={<CTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
            <p style={{
              fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '8px 0 0',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Scores out of 100. Higher values indicate stronger competitive positioning in each dimension.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/reports/tabs/OverviewTab.tsx
git commit -m "feat: add Overview tab with metrics, pie chart, radar"
```

---

### Task 5: Financials Tab

**Files:**
- Create: `components/reports/tabs/FinancialsTab.tsx`

- [ ] **Step 1: Create the Financials tab component**

```tsx
// components/reports/tabs/FinancialsTab.tsx
'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { SectionTitle, DataTable, CTooltip, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

export default function FinancialsTab({ financials }: { financials: StockReport['financials'] }) {
  const data = financials.annualData || []

  return (
    <div>
      {/* Narrative Summary */}
      {financials.narrativeSummary && (
        <div style={{ marginBottom: 32 }}>
          {financials.narrativeSummary.split('\n\n').map((p, i) => (
            <p key={i} style={{
              fontSize: 14, color: '#b8c4d4', lineHeight: 1.8,
              fontFamily: "'DM Sans', sans-serif", margin: '0 0 16px',
            }}>{p}</p>
          ))}
        </div>
      )}

      {/* Revenue & EPS Combo Chart */}
      {data.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Revenue & EPS</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: '#5a6475', fontSize: 12 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  yAxisId="revenue"
                  tick={{ fill: '#5a6475', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `$${v}B`}
                />
                <YAxis
                  yAxisId="eps"
                  orientation="right"
                  tick={{ fill: '#5a6475', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <Tooltip content={<CTooltip />} />
                <Bar yAxisId="revenue" dataKey="revenue" name="Revenue ($B)" fill="rgba(96,165,250,0.6)" radius={[5, 5, 0, 0]} />
                <Line yAxisId="eps" type="monotone" dataKey="adjEPS" name="Adj EPS" stroke="#4ade80" strokeWidth={2.5} dot={{ fill: '#4ade80', r: 4, strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9632; Revenue</span>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9679; Adj EPS</span>
            </div>
          </div>
        </div>
      )}

      {/* Annual Data Table */}
      {data.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Annual Financial Data</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Year', 'Revenue', 'Growth', 'Adj EPS', 'EPS Growth', 'Op CF', 'Key Metric']}
              rows={data.map(d => [
                d.year,
                `$${d.revenue}B`,
                d.revenueGrowth,
                `$${d.adjEPS.toFixed(2)}`,
                d.epsGrowth,
                d.opCF,
                d.keyMetric,
              ])}
              numericCols={[1, 2, 3, 4, 5]}
            />
          </div>
        </div>
      )}

      {/* Callout Card */}
      {financials.callout && (
        <div style={{
          ...glassCard,
          borderLeft: '3px solid #f87171',
          padding: '16px 20px',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#f87171',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em', marginBottom: 8,
            textTransform: 'uppercase',
          }}>Key Financial Insight</div>
          <p style={{
            fontSize: 13, color: '#b8c4d4', lineHeight: 1.7,
            fontFamily: "'DM Sans', sans-serif", margin: 0,
          }}>{financials.callout}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/reports/tabs/FinancialsTab.tsx
git commit -m "feat: add Financials tab with combo chart, table, callout"
```

---

### Task 6: Valuation Tab

**Files:**
- Create: `components/reports/tabs/ValuationTab.tsx`

- [ ] **Step 1: Create the Valuation tab component**

```tsx
// components/reports/tabs/ValuationTab.tsx
import { SectionTitle, DataTable, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

export default function ValuationTab({ valuation }: { valuation: StockReport['valuation'] }) {
  return (
    <div>
      {/* Bull Case */}
      {valuation.bullCase && (
        <div style={{
          ...glassCard,
          borderLeft: '3px solid #4ade80',
          padding: '16px 20px', marginBottom: 16,
        }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#4ade80',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em', marginBottom: 8,
            textTransform: 'uppercase',
          }}>Bull Case</div>
          <p style={{
            fontSize: 13, color: '#b8c4d4', lineHeight: 1.7,
            fontFamily: "'DM Sans', sans-serif", margin: 0,
          }}>{valuation.bullCase}</p>
        </div>
      )}

      {/* Bear Case */}
      {valuation.bearCase && (
        <div style={{
          ...glassCard,
          borderLeft: '3px solid #f87171',
          padding: '16px 20px', marginBottom: 32,
        }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#f87171',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em', marginBottom: 8,
            textTransform: 'uppercase',
          }}>Bear Case</div>
          <p style={{
            fontSize: 13, color: '#b8c4d4', lineHeight: 1.7,
            fontFamily: "'DM Sans', sans-serif", margin: 0,
          }}>{valuation.bearCase}</p>
        </div>
      )}

      {/* Valuation Metrics Table */}
      {valuation.metrics?.length > 0 && (
        <div>
          <SectionTitle>Valuation Metrics</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Metric', 'Current', '5-Year Avg', 'Commentary']}
              rows={valuation.metrics.map(m => [m.metric, m.current, m.fiveYearAvg, m.commentary])}
              numericCols={[1, 2]}
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/reports/tabs/ValuationTab.tsx
git commit -m "feat: add Valuation tab with bull/bear cases and metrics table"
```

---

### Task 7: Catalysts Tab

**Files:**
- Create: `components/reports/tabs/CatalystsTab.tsx`

- [ ] **Step 1: Create the Catalysts tab component**

```tsx
// components/reports/tabs/CatalystsTab.tsx
import { SectionTitle, Badge, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

const severityColor: Record<string, 'red' | 'yellow' | 'blue' | 'green'> = {
  CRITICAL: 'red',
  HIGH: 'yellow',
  MEDIUM: 'blue',
  LOW: 'green',
}

const severityBorder: Record<string, string> = {
  CRITICAL: '#f87171',
  HIGH: '#eab308',
  MEDIUM: '#60a5fa',
  LOW: '#4ade80',
}

function impactColor(impact: string): string {
  const s = impact.toLowerCase()
  if (s.includes('↑') || s.includes('positive') || s.includes('upside')) return '#4ade80'
  if (s.includes('↓') || s.includes('negative') || s.includes('downside')) return '#f87171'
  return '#e8ecf1'
}

export default function CatalystsTab({ catalysts }: { catalysts: StockReport['catalysts'] }) {
  return (
    <div>
      {/* Catalyst Calendar Table */}
      {catalysts.catalystTable?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Catalyst Calendar</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden', overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontSize: 13, fontFamily: "'DM Sans', sans-serif",
            }}>
              <thead>
                <tr>
                  {['Timeline', 'Catalyst', 'Impact', 'Probability'].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 12px', textAlign: 'left',
                      color: '#5a6475', fontSize: 10, fontWeight: 600,
                      letterSpacing: 1, textTransform: 'uppercase',
                      borderBottom: '1px solid rgba(255,255,255,0.07)',
                      fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalysts.catalystTable.map((row, ri) => (
                  <tr key={ri} style={{
                    background: ri % 2 === 1 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  }}>
                    <td style={{
                      padding: '10px 12px', color: '#e8ecf1',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                      borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
                    }}>{row.timeline}</td>
                    <td style={{
                      padding: '10px 12px', color: '#b8c4d4',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>{row.catalyst}</td>
                    <td style={{
                      padding: '10px 12px', color: impactColor(row.impact),
                      fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.04)',
                      whiteSpace: 'nowrap',
                    }}>{row.impact}</td>
                    <td style={{
                      padding: '10px 12px', color: '#8b95a5',
                      borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
                    }}>{row.probability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Risk Cards */}
      {catalysts.risks?.length > 0 && (
        <div>
          <SectionTitle>Risk Assessment</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {catalysts.risks.map((risk, i) => (
              <div key={i} style={{
                ...glassCard,
                borderLeft: `3px solid ${severityBorder[risk.severity] || '#60a5fa'}`,
                padding: '16px 20px',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 10,
                }}>
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: '#e8ecf1',
                    fontFamily: "'Instrument Serif', serif",
                  }}>{risk.risk}</span>
                  <Badge text={risk.severity} variant={severityColor[risk.severity] || 'blue'} />
                </div>
                <p style={{
                  fontSize: 13, color: '#8b95a5', lineHeight: 1.7,
                  fontFamily: "'DM Sans', sans-serif", margin: 0,
                }}>{risk.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/reports/tabs/CatalystsTab.tsx
git commit -m "feat: add Catalysts tab with catalyst table and risk cards"
```

---

### Task 8: Verdict Tab

**Files:**
- Create: `components/reports/tabs/VerdictTab.tsx`

- [ ] **Step 1: Create the Verdict tab component**

```tsx
// components/reports/tabs/VerdictTab.tsx
'use client'

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { SectionTitle, DataTable, Badge, CTooltip, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

const ratingColor: Record<string, 'green' | 'red' | 'blue'> = {
  BUY: 'green',
  SELL: 'red',
  HOLD: 'blue',
  AVOID: 'red',
}

function formatYAxis(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${value}`
}

export default function VerdictTab({ verdictDetails, verdict }: {
  verdictDetails: StockReport['verdictDetails']
  verdict: StockReport['verdict']
}) {
  const sv = verdictDetails.syndicateVerdict

  return (
    <div>
      {/* Three Scenario Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 12, marginBottom: 32,
      }}>
        {([
          { key: 'bullCase' as const, label: 'Bull Case', border: '#4ade80', emoji: '\ud83d\udc02' },
          { key: 'baseCase' as const, label: 'Base Case', border: '#60a5fa', emoji: '\u2696\ufe0f' },
          { key: 'bearCase' as const, label: 'Bear Case', border: '#f87171', emoji: '\ud83d\udc3b' },
        ]).map(({ key, label, border, emoji }) => {
          const scenario = verdictDetails[key]
          if (!scenario) return null
          return (
            <div key={key} style={{
              ...glassCard,
              borderTop: `3px solid ${border}`,
              padding: '20px',
            }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: border,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em', marginBottom: 12,
              }}>{emoji} {label}</div>
              <div style={{
                fontSize: 24, fontWeight: 700, color: '#e8ecf1',
                fontFamily: "'JetBrains Mono', monospace", marginBottom: 4,
              }}>{scenario.priceTarget}</div>
              <div style={{
                fontSize: 13, color: border, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace", marginBottom: 12,
              }}>{scenario.return}</div>
              <p style={{
                fontSize: 12, color: '#8b95a5', lineHeight: 1.7,
                fontFamily: "'DM Sans', sans-serif", margin: 0,
              }}>{scenario.description}</p>
            </div>
          )
        })}
      </div>

      {/* Risk-to-Reward Matrix */}
      {verdictDetails.scenarioMatrix?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Risk-to-Reward Matrix</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Scenario', 'Probability', 'Price Target', 'Return', 'Weighted']}
              rows={verdictDetails.scenarioMatrix.map(r => [
                r.scenario, r.probability, r.priceTarget, r.return, r.weighted,
              ])}
              numericCols={[1, 2, 3, 4]}
              boldLastRow
            />
          </div>
        </div>
      )}

      {/* Multi-Year Projections */}
      {verdictDetails.multiYearProjections?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Multi-Year Projections</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Horizon', 'Bear Case', 'Base Case', 'Bull Case', 'Commentary']}
              rows={verdictDetails.multiYearProjections.map(r => [
                r.horizon, r.bearCase, r.baseCase, r.bullCase, r.commentary,
              ])}
              numericCols={[1, 2, 3]}
            />
          </div>
        </div>
      )}

      {/* Price Projection Chart */}
      {verdictDetails.priceProjectionChart?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Price Projection</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={verdictDetails.priceProjectionChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: '#5a6475', fontSize: 12 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#5a6475', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  tickFormatter={formatYAxis}
                />
                <Tooltip content={<CTooltip />} />
                <Area
                  type="monotone" dataKey="bull" name="Bull"
                  stroke="#4ade80" fill="rgba(74,222,128,0.08)" strokeWidth={2}
                />
                <Line
                  type="monotone" dataKey="base" name="Base"
                  stroke="#60a5fa" strokeWidth={2.5}
                  dot={{ fill: '#60a5fa', r: 4, strokeWidth: 0 }}
                />
                <Area
                  type="monotone" dataKey="bear" name="Bear"
                  stroke="#f87171" fill="rgba(248,113,113,0.08)" strokeWidth={2}
                  strokeDasharray="5 3"
                />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9650; Bull</span>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9679; Base</span>
              <span style={{ fontSize: 11, color: '#f87171' }}>&#9660; Bear</span>
            </div>
          </div>
        </div>
      )}

      {/* SANCTUM Syndicate Verdict Card */}
      {sv && (
        <div style={{
          border: '1px solid rgba(234,179,8,0.4)',
          borderRadius: 12,
          padding: 32,
          background: 'linear-gradient(160deg, rgba(234,179,8,0.06) 0%, rgba(234,179,8,0.02) 100%)',
        }}>
          {/* Top row: Rating + subtitle + position sizing */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
              <Badge text={sv.rating} variant={ratingColor[sv.rating] || 'blue'} />
              <span style={{
                fontSize: 16, fontWeight: 700, color: '#e8ecf1',
                fontFamily: "'Instrument Serif', serif",
              }}>{verdictDetails.baseCase?.priceTarget ? `Target: ${verdictDetails.baseCase.priceTarget}` : ''}</span>
            </div>
            <p style={{
              fontSize: 13, color: '#8b95a5', margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}>{sv.positionSizing}</p>
          </div>

          <div style={{ height: 1, background: 'rgba(234,179,8,0.2)', marginBottom: 24 }} />

          {/* Four rich text blocks */}
          {([
            { title: sv.keySignalTitle, body: sv.keySignalDetail },
            { title: 'The Honest Risk', body: sv.honestRisk },
            { title: 'How to Position', body: sv.howToPosition },
            { title: 'The Long-Term Thesis', body: sv.longTermThesis },
          ]).map((block, i) => (
            block.body ? (
              <div key={i} style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: '#eab308',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.03em', marginBottom: 8,
                }}>{block.title}</div>
                <p style={{
                  fontSize: 13, color: '#b8c4d4', lineHeight: 1.8,
                  fontFamily: "'DM Sans', sans-serif", margin: 0,
                }}>{block.body}</p>
              </div>
            ) : null
          ))}

          {/* Disclaimer */}
          <p style={{
            fontSize: 11, color: '#5a6475', margin: '16px 0 0',
            fontFamily: "'DM Sans', sans-serif", fontStyle: 'italic',
          }}>
            SANCTUM Syndicate Report &middot; AI-Generated &middot; Not financial advice &middot; Do your own due diligence
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/reports/tabs/VerdictTab.tsx
git commit -m "feat: add Verdict tab with scenarios, projections, syndicate card"
```

---

### Task 9: StockReport Shell (Header + Tabs + Loading/Error)

**Files:**
- Create: `components/reports/StockReport.tsx`

- [ ] **Step 1: Create the StockReport client shell**

```tsx
// components/reports/StockReport.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { generateReport } from '@/app/actions/generateReport'
import { Badge } from './ReportUI'
import OverviewTab from './tabs/OverviewTab'
import FinancialsTab from './tabs/FinancialsTab'
import ValuationTab from './tabs/ValuationTab'
import CatalystsTab from './tabs/CatalystsTab'
import VerdictTab from './tabs/VerdictTab'
import type { StockReport as StockReportType } from '@/types/report'

const TABS = ['Overview', 'Financials', 'Valuation', 'Catalysts', 'Verdict'] as const

const verdictBadgeColor: Record<string, 'green' | 'red' | 'blue'> = {
  BUY: 'green', SELL: 'red', HOLD: 'blue', AVOID: 'red',
}

const LOADING_LINES = [
  'INITIALIZING SANCTUM AI ENGINE...',
  // {TICKER} is replaced at render time
  'FETCHING INSTITUTIONAL DATA FOR {TICKER}...',
  'RUNNING VALUATION MODELS...',
  'GENERATING SYNDICATE REPORT...',
]

// ── Company Logo (Clearbit with fallback) ──
function CompanyLogo({ ticker, website }: { ticker: string; website?: string }) {
  const [imgError, setImgError] = useState(false)
  const domain = website ? website.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null
  const logoUrl = domain ? `https://logo.clearbit.com/${domain}` : null

  if (logoUrl && !imgError) {
    return (
      <div style={{
        width: 48, height: 48, borderRadius: 12, overflow: 'hidden',
        background: '#ffffff', flexShrink: 0,
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      }}>
        <Image
          src={logoUrl} alt={ticker} width={48} height={48}
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }}
          onError={() => setImgError(true)}
          unoptimized
        />
      </div>
    )
  }

  return (
    <div style={{
      width: 48, height: 48, borderRadius: 12, flexShrink: 0,
      background: '#0f0f0f', border: '1px solid #1a1a1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 16, fontWeight: 700, color: '#e8ecf1',
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: '0.05em',
    }}>
      {ticker.slice(0, 3)}
    </div>
  )
}

export default function StockReport({ ticker }: { ticker: string }) {
  const [report, setReport] = useState<StockReportType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Overview')
  const [animating, setAnimating] = useState(false)
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    setReport(null)
    const result = await generateReport(ticker)
    if ('error' in result) {
      setError(result.error)
    } else {
      setReport(result)
    }
    setLoading(false)
  }, [ticker])

  useEffect(() => {
    fetchReport()
    return () => { if (switchTimer.current) clearTimeout(switchTimer.current) }
  }, [fetchReport])

  const switchTab = (t: typeof TABS[number]) => {
    if (t === activeTab) return
    if (switchTimer.current) clearTimeout(switchTimer.current)
    setAnimating(true)
    switchTimer.current = setTimeout(() => {
      setActiveTab(t)
      setAnimating(false)
      switchTimer.current = null
    }, 200)
  }

  // ── Loading Screen ──
  if (loading) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 56px)', background: '#0a0a0a',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: 40,
      }}>
        <style>{`
          @keyframes termFadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}</style>
        <div style={{ maxWidth: 500 }}>
          {LOADING_LINES.map((line, i) => {
            const text = line.replace('{TICKER}', ticker)
            const isLast = i === LOADING_LINES.length - 1
            return (
              <div key={i} style={{
                fontSize: 13, color: '#555',
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 12,
                opacity: 0,
                animation: `termFadeIn 0.4s ease ${i * 150}ms forwards`,
              }}>
                <span style={{ color: '#444', marginRight: 8 }}>&gt;</span>
                {text}
                {isLast && (
                  <span style={{
                    display: 'inline-block', width: 8, height: 16,
                    background: '#555', marginLeft: 4, verticalAlign: 'middle',
                    animation: 'blink 1s step-end infinite',
                  }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Error Screen ──
  if (error) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 56px)', background: '#0a0a0a',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: 40, gap: 16,
      }}>
        <span style={{
          fontSize: 13, color: '#f87171',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          ERROR: {error}
        </span>
        <button
          onClick={fetchReport}
          style={{
            background: 'none', border: '1px solid #2a2a2a', borderRadius: 4,
            color: '#888', fontSize: 12, padding: '8px 16px', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em', transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}
        >
          &gt; RETRY
        </button>
      </div>
    )
  }

  if (!report) return null

  // ── Report Render ──
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e8ecf1', fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{
        padding: '28px 20px 24px',
        background: 'linear-gradient(180deg, rgba(24,48,120,0.18) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {/* Company identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <CompanyLogo ticker={report.ticker} website={report.website} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 20, fontWeight: 700, color: '#ffffff',
                fontFamily: "'Instrument Serif', serif", lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{report.companyName}</div>
              <div style={{ fontSize: 11, color: '#5a6475', marginTop: 3, letterSpacing: 0.3 }}>
                {report.exchange} &middot; {report.ticker}
              </div>
            </div>
          </div>

          {/* Price + ATH */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <span style={{
              fontSize: 36, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace", color: '#ffffff', lineHeight: 1,
            }}>{report.currentPrice}</span>
            {report.priceVsATH && (
              <span style={{
                fontSize: 13, color: '#5a6475', paddingBottom: 4,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{report.priceVsATH}</span>
            )}
          </div>

          {/* Verdict badge + subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <Badge text={report.verdict} variant={verdictBadgeColor[report.verdict] || 'blue'} />
            <span style={{
              fontSize: 13, color: '#b8c4d4',
              fontFamily: "'DM Sans', sans-serif",
            }}>{report.verdictSubtitle}</span>
          </div>

          {/* Context badges */}
          {report.badges?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {report.badges.map((b, i) => (
                <Badge key={i} text={b} variant="gray" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', overflowX: 'auto' }}>
        <div style={{
          maxWidth: 900, margin: '0 auto',
          padding: '10px 20px', display: 'flex', gap: 6,
        }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                padding: '8px 18px', borderRadius: 9999, fontSize: 13,
                fontWeight: activeTab === t ? 600 : 400,
                color: activeTab === t ? '#ffffff' : 'rgba(255,255,255,0.35)',
                background: activeTab === t
                  ? 'linear-gradient(135deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.07) 100%)'
                  : 'transparent',
                border: activeTab === t
                  ? '1px solid rgba(255,255,255,0.13)'
                  : '1px solid transparent',
                boxShadow: activeTab === t
                  ? 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.3)'
                  : 'none',
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.2s ease',
              }}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div style={{
        maxWidth: 900, margin: '0 auto', padding: '28px 20px 72px',
        opacity: animating ? 0 : 1,
        transform: animating ? 'translateY(6px)' : 'translateY(0)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }}>
        {activeTab === 'Overview' && <OverviewTab overview={report.overview} />}
        {activeTab === 'Financials' && <FinancialsTab financials={report.financials} />}
        {activeTab === 'Valuation' && <ValuationTab valuation={report.valuation} />}
        {activeTab === 'Catalysts' && <CatalystsTab catalysts={report.catalysts} />}
        {activeTab === 'Verdict' && <VerdictTab verdictDetails={report.verdictDetails} verdict={report.verdict} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/reports/StockReport.tsx
git commit -m "feat: add StockReport shell with header, tabs, loading/error"
```

---

### Task 10: Update Report Page

**Files:**
- Modify: `app/reports/[ticker]/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the report page**

The page needs:
- Back button (top-left, navigates to `/`)
- Watchlist button (top-right, reads/writes Supabase user settings)
- `<StockReport ticker={ticker} />` as main content

```tsx
// app/reports/[ticker]/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import StockReport from '@/components/reports/StockReport'

export default function ReportPage() {
  const params = useParams()
  const router = useRouter()
  const ticker = (params.ticker as string).toUpperCase()

  const [watchlist, setWatchlist] = useState<string[]>([])
  const [session, setSession] = useState<any>(null)

  // Load session + watchlist
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) loadWatchlist(s.user.id)
    })
  }, [])

  const loadWatchlist = async (userId: string) => {
    const { data } = await supabase
      .from('user_settings')
      .select('watchlist')
      .eq('user_id', userId)
      .single()
    if (data?.watchlist) setWatchlist(data.watchlist)
  }

  const toggleWatchlist = useCallback(async () => {
    if (!session) return
    const isOn = watchlist.includes(ticker)
    const updated = isOn
      ? watchlist.filter(t => t !== ticker)
      : [...watchlist, ticker]
    setWatchlist(updated)
    await supabase
      .from('user_settings')
      .upsert({ user_id: session.user.id, watchlist: updated }, { onConflict: 'user_id' })
  }, [session, watchlist, ticker])

  const isOnWatchlist = watchlist.includes(ticker)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      {/* ── Navigation Bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1a1a1a',
        padding: '0 40px',
      }}>
        <div style={{
          maxWidth: 1400, margin: '0 auto', width: '100%',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          height: 56,
        }}>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'none', border: '1px solid #2a2a2a', borderRadius: 4,
              color: '#888', fontSize: 12, padding: '8px 16px', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.05em', transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}
          >
            &larr; BACK
          </button>
          {session && (
            <button
              onClick={toggleWatchlist}
              style={{
                background: isOnWatchlist ? 'rgba(34,197,94,0.08)' : 'transparent',
                border: `1px solid ${isOnWatchlist ? 'rgba(34,197,94,0.4)' : '#2a2a2a'}`,
                borderRadius: 4,
                color: isOnWatchlist ? '#22c55e' : '#888',
                fontSize: 12, padding: '8px 16px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em', transition: 'all 0.2s ease',
              }}
            >
              {isOnWatchlist ? 'ON WATCHLIST' : '+ WATCHLIST'}
            </button>
          )}
        </div>
      </div>

      {/* ── Report Content ── */}
      <StockReport ticker={ticker} />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds, `/reports/[ticker]` route listed as dynamic

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Navigate to `http://localhost:3000/reports/AAPL`
Expected:
1. Terminal loading screen appears with staggered lines
2. After Gemini responds (~5-15s), report renders with header + 5 tabs
3. Back button navigates to `/`
4. All 5 tabs render their content
5. Charts render inside ResponsiveContainer

- [ ] **Step 4: Commit**

```bash
git add app/reports/\[ticker\]/page.tsx
git commit -m "feat: rebuild report page with AI-generated tabbed report"
```

---

## Self-Review

**Spec coverage:**
- [x] TypeScript interface → Task 1
- [x] Server action with Gemini → Task 2
- [x] Shared UI primitives (MetricCard, Badge, SectionTitle, DataTable, CTooltip) → Task 3
- [x] Overview tab (key metrics, business summary, pie chart, radar) → Task 4
- [x] Financials tab (combo chart, data table, callout) → Task 5
- [x] Valuation tab (bull/bear cases, metrics table) → Task 6
- [x] Catalysts tab (catalyst table, risk cards) → Task 7
- [x] Verdict tab (scenarios, matrix, projections, chart, syndicate card) → Task 8
- [x] StockReport shell (header with logo, tab bar, loading, error) → Task 9
- [x] Report page (back button, watchlist button, StockReport) → Task 10
- [x] Company logo via Clearbit with fallback → Task 9 (CompanyLogo component)
- [x] Terminal loading screen with staggered fade-in → Task 9
- [x] Error state with retry → Task 9
- [x] Null/missing field handling → All tab components use `?.` and conditional rendering
- [x] overview.keyMetrics in Gemini prompt → Task 2
- [x] financials.callout in Gemini prompt → Task 2

**Placeholder scan:** No TBD, TODO, or vague steps found. All steps have complete code.

**Type consistency:** All files import `StockReport` from `@/types/report`. Property names match across Tasks 1-10. `verdictDetails` used consistently (not `verdict` object).
