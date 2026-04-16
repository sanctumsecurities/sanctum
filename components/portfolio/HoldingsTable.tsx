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

const GRID_COLS = '1fr 0.6fr 0.7fr 0.7fr 0.9fr 0.9fr 0.6fr 28px'
const ROW_EXIT_MS = 220

export default function HoldingsTable({ holdings, onRowClick, onDelete }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const startDelete = (e: React.MouseEvent, h: EnrichedHolding) => {
    e.stopPropagation()
    if (armedId === h.id) {
      setArmedId(null)
      setDeletingId(h.id)
      setTimeout(() => {
        setDeletingId(null)
        onDelete(h)
      }, ROW_EXIT_MS)
      return
    }
    setArmedId(h.id)
    setTimeout(() => setArmedId(prev => (prev === h.id ? null : prev)), 3000)
  }

  return (
    <div style={{
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4,
      padding: '14px 16px',
    }}>
      <style>{`
        @keyframes trashArmedPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(1.15); }
        }
      `}</style>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}`,
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
          HOLDINGS · {holdings.length} POSITION{holdings.length === 1 ? '' : 'S'}
        </span>
      </div>

      {/* Header row */}
      <div className="holdings-head" style={{
        display: 'grid',
        gridTemplateColumns: GRID_COLS,
        padding: '8px 4px',
        fontSize: 10,
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
        const isArmed = armedId === h.id
        const isDeleting = deletingId === h.id
        const trashColor = isArmed ? COLORS.neg : (isHover ? COLORS.textDim : 'transparent')
        return (
          <div
            key={h.id}
            className="holdings-row"
            onClick={() => { if (!isDeleting) onRowClick(h) }}
            onMouseEnter={() => setHoverId(h.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: GRID_COLS,
              alignItems: 'center',
              padding: '10px 4px',
              fontSize: 13,
              fontFamily: MONO,
              color: COLORS.text,
              borderBottom: `1px solid ${COLORS.divider}`,
              cursor: isDeleting ? 'default' : 'pointer',
              background: isHover && !isDeleting ? 'rgba(255,255,255,0.02)' : 'transparent',
              opacity: isDeleting ? 0 : 1,
              transform: isDeleting ? 'translateX(12px)' : 'translateX(0)',
              transition: `opacity ${ROW_EXIT_MS}ms ease, transform ${ROW_EXIT_MS}ms ease, background 0.1s ease`,
              pointerEvents: isDeleting ? 'none' : 'auto',
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
              <div style={{ fontSize: 11, opacity: 0.8 }}>
                {h.plPercent != null ? fmtPct(h.plPercent, { signed: true }) : ''}
              </div>
            </div>
            <div className="holdings-col-hideable" style={{ textAlign: 'right', color: COLORS.textDim }}>
              {h.weight != null ? fmtPct(h.weight, { digits: 1 }) : '—'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={e => startDelete(e, h)}
                aria-label={isArmed ? 'Click again to confirm delete' : 'Delete position'}
                title={isArmed ? 'Click again to confirm' : undefined}
                style={{
                  background: 'none',
                  border: 'none',
                  color: trashColor,
                  cursor: 'pointer',
                  padding: 0,
                  width: 20,
                  height: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s ease',
                  animation: isArmed ? 'trashArmedPulse 0.9s ease-in-out infinite' : 'none',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isArmed ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
