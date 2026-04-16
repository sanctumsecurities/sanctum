'use client'

import { COLORS, MONO } from './styles'

interface Props {
  onAddClick: () => void
}

export default function EmptyState({ onAddClick }: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: 'calc(100vh - 400px)',
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 4 4 5-5" />
      </svg>
      <p style={{
        fontSize: 14, color: COLORS.textDim, margin: '16px 0 4px',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Your portfolio is empty.
      </p>
      <p style={{
        fontSize: 12, color: COLORS.textMuted, margin: '0 0 20px',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Add a position to start tracking performance.
      </p>
      <button
        onClick={onAddClick}
        style={{
          background: 'transparent',
          border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: 4,
          color: COLORS.textDim,
          fontSize: 12,
          padding: '8px 18px',
          cursor: 'pointer',
          fontFamily: MONO,
          letterSpacing: '0.1em',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => { (e.currentTarget).style.color = '#fff'; (e.currentTarget).style.borderColor = '#444' }}
        onMouseLeave={e => { (e.currentTarget).style.color = COLORS.textDim; (e.currentTarget).style.borderColor = COLORS.borderStrong }}
      >
        + ADD POSITION
      </button>
    </div>
  )
}
