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

      {data.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Revenue &amp; EPS</SectionTitle>
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
