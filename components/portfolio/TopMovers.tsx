'use client'

import type { EnrichedHolding } from '@/lib/portfolio/types'
import { COLORS, MONO, fmtUsd, fmtPct } from './styles'

interface Props {
  winners: EnrichedHolding[]
  losers: EnrichedHolding[]
}

function Row({ h, positive }: { h: EnrichedHolding; positive: boolean }) {
  const pctColor = positive ? COLORS.pos : COLORS.neg
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto auto',
      gap: 8,
      padding: '4px 0',
      fontSize: 11,
      fontFamily: MONO,
      borderBottom: `1px solid ${COLORS.divider}`,
    }}>
      <span style={{ color: COLORS.text, letterSpacing: '0.05em' }}>{h.ticker}</span>
      <span style={{ color: pctColor, textAlign: 'right' }}>
        {fmtPct(h.dayChangePercent, { signed: true, digits: 2 })}
      </span>
      <span style={{ color: COLORS.textMuted, textAlign: 'right', fontSize: 10 }}>
        {fmtUsd(h.dayChangeDollar, { signed: true })}
      </span>
    </div>
  )
}

export default function TopMovers({ winners, losers }: Props) {
  return (
    <div style={{
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4,
      padding: '14px 16px',
    }}>
      <div style={{
        paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 10,
      }}>
        <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          TOP MOVERS TODAY
        </span>
      </div>

      {winners.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em', marginBottom: 4 }}>
            WINNERS
          </div>
          {winners.map(h => <Row key={h.id} h={h} positive />)}
        </>
      )}

      {losers.length > 0 && (
        <>
          <div style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em', margin: `${winners.length > 0 ? 10 : 0}px 0 4px` }}>
            LOSERS
          </div>
          {losers.map(h => <Row key={h.id} h={h} positive={false} />)}
        </>
      )}

      {winners.length === 0 && losers.length === 0 && (
        <div style={{ color: COLORS.textFaint, fontSize: 11, fontFamily: MONO, textAlign: 'center', padding: '12px 0' }}>
          No moves yet today
        </div>
      )}
    </div>
  )
}
