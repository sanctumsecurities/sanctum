'use client'

import type { RiskStats } from '@/lib/portfolio/types'
import { COLORS, MONO, fmtNumber, fmtPct } from './styles'

interface Props {
  stats: RiskStats
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, color: COLORS.text, fontFamily: MONO, marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}

export default function RiskMetrics({ stats }: Props) {
  return (
    <div style={{
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4,
      padding: '14px 16px',
    }}>
      <div style={{
        paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 12,
      }}>
        <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          RISK METRICS
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Stat label="BETA" value={fmtNumber(stats.beta, 2)} />
        <Stat label="VOL 30D" value={stats.volatility30d != null ? fmtPct(stats.volatility30d, { digits: 1 }) : '—'} />
      </div>
      <div style={{ paddingTop: 10, borderTop: `1px solid ${COLORS.divider}` }}>
        <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          TOP HOLDING
        </div>
        <div style={{ fontSize: 13, color: COLORS.text, fontFamily: MONO, marginTop: 4 }}>
          {stats.topHoldingTicker ?? '—'}
          {stats.topHoldingWeight != null && (
            <span style={{ color: COLORS.textDim }}> · {fmtPct(stats.topHoldingWeight, { digits: 1 })}</span>
          )}
        </div>
      </div>
      <div style={{ paddingTop: 10, marginTop: 10, borderTop: `1px solid ${COLORS.divider}` }}>
        <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          TOP 3 CONCENTRATION
        </div>
        <div style={{ fontSize: 13, color: COLORS.text, fontFamily: MONO, marginTop: 4 }}>
          {stats.top3Concentration != null ? fmtPct(stats.top3Concentration, { digits: 1 }) : '—'}
        </div>
      </div>
    </div>
  )
}
