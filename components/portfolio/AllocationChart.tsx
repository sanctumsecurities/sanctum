'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { EnrichedHolding } from '@/lib/portfolio/types'
import { computeSectorAllocation } from '@/lib/portfolio/metrics'
import { COLORS, MONO, PIE_PALETTE, fmtPct } from './styles'

interface Props {
  holdings: EnrichedHolding[]
}

export default function AllocationChart({ holdings }: Props) {
  const data = useMemo(() => computeSectorAllocation(holdings), [holdings])

  return (
    <div style={{
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4,
      padding: '14px 16px',
    }}>
      <div style={{
        paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 8,
      }}>
        <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          SECTOR ALLOCATION
        </span>
      </div>

      {data.length === 0 ? (
        <div style={{
          padding: '32px 0', textAlign: 'center',
          color: COLORS.textFaint, fontSize: 12, fontFamily: MONO,
        }}>
          No data
        </div>
      ) : (
        <>
          <div style={{ width: '100%', height: 160 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={38}
                  outerRadius={70}
                  stroke="#0a0a0a"
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#0a0a0a',
                    border: `1px solid ${COLORS.borderStrong}`,
                    borderRadius: 3,
                    fontFamily: MONO,
                    fontSize: 12,
                    color: COLORS.text,
                  }}
                  itemStyle={{ color: COLORS.text }}
                  labelStyle={{ color: COLORS.textMuted }}
                  formatter={(value: number, _name: string, item: any) =>
                    [`${fmtPct(item.payload.percent)} · $${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, item.payload.label]
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.map((slice, i) => (
              <div key={slice.label} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, fontFamily: MONO,
              }}>
                <span style={{ color: COLORS.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                    background: PIE_PALETTE[i % PIE_PALETTE.length],
                  }} />
                  {slice.label}
                </span>
                <span style={{ color: COLORS.text }}>{fmtPct(slice.percent, { digits: 1 })}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
