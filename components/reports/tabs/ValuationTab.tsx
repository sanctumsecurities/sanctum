'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import { SectionTitle, DataTable, RangeBar, CTooltip, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

export default function ValuationTab({ valuation }: { valuation: StockReport['valuation'] }) {
  return (
    <div>
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

      {valuation.metrics?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Valuation Metrics</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Metric', 'Current', '5-Year Avg', 'Sector Median', 'Commentary']}
              rows={valuation.metrics.map(m => [m.metric, m.current, m.fiveYearAvg, m.sectorMedian || 'N/A', m.commentary])}
              numericCols={[1, 2, 3]}
            />
          </div>
        </div>
      )}

      {valuation.analystTargetRange && valuation.analystTargetRange.numberOfAnalysts > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Analyst Price Targets</SectionTitle>
          <div style={{ ...glassCard, padding: '20px' }}>
            <RangeBar
              low={valuation.analystTargetRange.low}
              mean={valuation.analystTargetRange.mean}
              high={valuation.analystTargetRange.high}
              current={valuation.analystTargetRange.currentPrice}
              label="Target Range"
              count={valuation.analystTargetRange.numberOfAnalysts}
            />
          </div>
        </div>
      )}

      {valuation.historicalPE?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Historical P/E Ratio</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={valuation.historicalPE}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}x`} />
                <Tooltip content={<CTooltip />} />
                {valuation.sectorMedianPE > 0 && (
                  <ReferenceLine
                    y={valuation.sectorMedianPE}
                    stroke="#f59e0b"
                    strokeDasharray="6 3"
                    label={{
                      value: `Sector ${valuation.sectorMedianPE.toFixed(0)}x`,
                      position: 'right',
                      fill: '#f59e0b',
                      fontSize: 10,
                    }}
                  />
                )}
                <Line
                  type="monotone" dataKey="pe" name="P/E Ratio"
                  stroke="#60a5fa" strokeWidth={2.5}
                  dot={{ fill: '#60a5fa', r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9679; P/E</span>
              {valuation.sectorMedianPE > 0 && (
                <span style={{ fontSize: 11, color: '#f59e0b' }}>- - Sector Median</span>
              )}
            </div>
            <p style={{ fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '4px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
              P/E above sector median suggests premium valuation; below suggests potential value or concern.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
