'use client'

import type { PortfolioTotals } from '@/lib/portfolio/types'
import { COLORS, MONO, fmtUsd, fmtPct, signColor } from './styles'

interface Props {
  totals: PortfolioTotals
}

export default function SummaryCards({ totals }: Props) {
  const cards: { label: string; value: string; sub?: string; subColor?: string }[] = [
    {
      label: 'TOTAL VALUE',
      value: fmtUsd(totals.totalValue),
      sub: `${fmtUsd(totals.dayChangeDollar, { signed: true })} today`,
      subColor: signColor(totals.dayChangeDollar),
    },
    {
      label: 'TOTAL COST',
      value: fmtUsd(totals.totalCost),
      sub: 'cost basis',
      subColor: COLORS.textMuted,
    },
    {
      label: 'TOTAL P/L',
      value: fmtUsd(totals.totalPlDollar, { signed: true }),
      sub: fmtPct(totals.totalPlPercent, { signed: true }),
      subColor: signColor(totals.totalPlDollar),
    },
    {
      label: 'DAY CHANGE',
      value: fmtUsd(totals.dayChangeDollar, { signed: true }),
      sub: fmtPct(totals.dayChangePercent, { signed: true }),
      subColor: signColor(totals.dayChangeDollar),
    },
  ]

  return (
    <div className="portfolio-summary-row" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 10,
      marginTop: 32,
      marginBottom: 20,
    }}>
      {cards.map(card => (
        <div key={card.label} style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 4,
          padding: '14px 16px',
        }}>
          <div style={{
            fontSize: 11, color: COLORS.textMuted,
            fontFamily: MONO, letterSpacing: '0.15em',
          }}>
            {card.label}
          </div>
          <div style={{
            color: COLORS.text,
            fontSize: 25,
            marginTop: 6,
            fontFamily: MONO,
            letterSpacing: '0.02em',
          }}>
            {card.value}
          </div>
          {card.sub && (
            <div style={{
              fontSize: 12, color: card.subColor ?? COLORS.textMuted,
              fontFamily: MONO, marginTop: 4,
            }}>
              {card.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
