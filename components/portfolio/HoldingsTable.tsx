'use client'

import { useState } from 'react'
import type { EnrichedHolding } from '@/lib/portfolio/types'
import { COLORS, MONO, fmtUsd, fmtPct, fmtNumber, signColor } from './styles'

interface Props {
  holdings: EnrichedHolding[]
  onRowClick: (holding: EnrichedHolding) => void
  onDelete: (holding: EnrichedHolding) => void
}

const HEADERS = [
  { key: 'ticker',    label: 'TICKER',    align: 'left'  as const, mobile: true  },
  { key: 'shares',    label: 'SHARES',    align: 'right' as const, mobile: true  },
  { key: 'avg_cost',  label: 'AVG COST',  align: 'right' as const, mobile: false },
  { key: 'price',     label: 'PRICE',     align: 'right' as const, mobile: true  },
  { key: 'mkt_value', label: 'MKT VALUE', align: 'right' as const, mobile: false },
  { key: 'pl',        label: 'P/L',       align: 'right' as const, mobile: true  },
  { key: 'weight',    label: 'WEIGHT',    align: 'right' as const, mobile: false },
]

export default function HoldingsTable({ holdings, onRowClick, onDelete }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const startDelete = (e: React.MouseEvent, h: EnrichedHolding) => {
    e.stopPropagation()
    if (confirmId === h.id) {
      setConfirmId(null)
      onDelete(h)
      return
    }
    setConfirmId(h.id)
    setTimeout(() => setConfirmId(prev => (prev === h.id ? null : prev)), 3000)
  }

  return (
    <div style={{
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4,
      padding: '14px 16px',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}`,
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          HOLDINGS · {holdings.length} POSITION{holdings.length === 1 ? '' : 'S'}
        </span>
      </div>

      {/* Header row */}
      <div className="holdings-head" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 0.6fr 0.7fr 0.7fr 0.9fr 0.9fr 0.6fr 24px',
        padding: '8px 4px',
        fontSize: 9,
        color: COLORS.textMuted,
        fontFamily: MONO,
        letterSpacing: '0.12em',
        borderBottom: `1px solid ${COLORS.divider}`,
      }}>
        {HEADERS.map(h => (
          <div key={h.key} className={h.mobile ? '' : 'holdings-col-hideable'} style={{ textAlign: h.align }}>{h.label}</div>
        ))}
        <div />
      </div>

      {holdings.map(h => {
        const isHover = hoverId === h.id
        const isConfirming = confirmId === h.id
        return (
          <div
            key={h.id}
            className="holdings-row"
            onClick={() => onRowClick(h)}
            onMouseEnter={() => setHoverId(h.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 0.6fr 0.7fr 0.7fr 0.9fr 0.9fr 0.6fr 24px',
              alignItems: 'center',
              padding: '10px 4px',
              fontSize: 12,
              fontFamily: MONO,
              color: COLORS.text,
              borderBottom: `1px solid ${COLORS.divider}`,
              cursor: 'pointer',
              background: isHover ? 'rgba(255,255,255,0.02)' : 'transparent',
              transition: 'background 0.1s ease',
            }}
          >
            <div style={{ letterSpacing: '0.05em' }}>{h.ticker}</div>
            <div style={{ textAlign: 'right', color: COLORS.textDim }}>{fmtNumber(h.shares, h.shares % 1 === 0 ? 0 : 4)}</div>
            <div className="holdings-col-hideable" style={{ textAlign: 'right', color: COLORS.textDim }}>{fmtUsd(h.avg_cost)}</div>
            <div style={{ textAlign: 'right', color: h.snapshot?.price != null ? COLORS.text : COLORS.textFaint }}>
              {h.snapshot?.price != null ? fmtUsd(h.snapshot.price) : 'N/A'}
            </div>
            <div className="holdings-col-hideable" style={{ textAlign: 'right' }}>
              {h.marketValue != null ? fmtUsd(h.marketValue) : 'N/A'}
            </div>
            <div style={{ textAlign: 'right', color: signColor(h.plDollar), lineHeight: 1.3 }}>
              <div>{h.plDollar != null ? fmtUsd(h.plDollar, { signed: true }) : 'N/A'}</div>
              <div style={{ fontSize: 10, opacity: 0.8 }}>
                {h.plPercent != null ? fmtPct(h.plPercent, { signed: true }) : ''}
              </div>
            </div>
            <div className="holdings-col-hideable" style={{ textAlign: 'right', color: COLORS.textDim }}>
              {h.weight != null ? fmtPct(h.weight, { digits: 1 }) : '—'}
            </div>
            <div style={{ textAlign: 'right' }}>
              <button
                onClick={e => startDelete(e, h)}
                aria-label={isConfirming ? 'Confirm delete' : 'Delete position'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isConfirming ? COLORS.neg : (isHover ? COLORS.textMuted : 'transparent'),
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: isConfirming ? 9 : 14,
                  fontFamily: MONO,
                  letterSpacing: '0.1em',
                  transition: 'color 0.15s ease',
                }}
              >
                {isConfirming ? 'CONFIRM' : '🗑'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
