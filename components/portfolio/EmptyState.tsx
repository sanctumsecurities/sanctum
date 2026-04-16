'use client'

import { COLORS } from './styles'

export default function EmptyState() {
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
        fontSize: 15, color: COLORS.textDim, margin: '16px 0 4px',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Your portfolio is empty.
      </p>
      <p style={{
        fontSize: 13, color: COLORS.textMuted, margin: 0,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Add a position to start tracking performance.
      </p>
    </div>
  )
}
