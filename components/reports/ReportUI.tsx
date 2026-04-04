import type { TooltipProps } from 'recharts'

export const glassCard: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.025) 100%)',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 2px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
}

export function MetricCard({ label, value, subtitle, color }: {
  label: string; value: string; subtitle?: string; color?: string
}) {
  return (
    <div style={{ ...glassCard, padding: '18px 16px', minWidth: 0 }}>
      <div style={{
        fontSize: 10, letterSpacing: 1.4, color: '#5a6475',
        textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: color || '#e8ecf1',
        fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1,
      }}>{value}</div>
      {subtitle && (
        <div style={{
          fontSize: 11, marginTop: 5, fontFamily: "'DM Sans', sans-serif",
          color: subtitle.startsWith('+') ? '#4ade80'
            : subtitle.startsWith('-') ? '#f87171'
            : '#5a6475',
        }}>{subtitle}</div>
      )}
    </div>
  )
}

const badgeColors: Record<string, { bg: string; color: string; border: string }> = {
  green: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.22)' },
  red: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.22)' },
  blue: { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: 'rgba(96,165,250,0.22)' },
  yellow: { bg: 'rgba(234,179,8,0.12)', color: '#eab308', border: 'rgba(234,179,8,0.22)' },
  gray: { bg: 'rgba(255,255,255,0.06)', color: '#8b95a5', border: 'rgba(255,255,255,0.1)' },
}

export function Badge({ text, variant = 'gray' }: { text: string; variant?: 'green' | 'red' | 'blue' | 'yellow' | 'gray' }) {
  const c = badgeColors[variant] || badgeColors.gray
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
      fontSize: 10, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5,
      whiteSpace: 'nowrap',
    }}>{text}</span>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 17, fontWeight: 700, color: '#e8ecf1',
      fontFamily: "'Instrument Serif', serif",
      marginBottom: 14, paddingBottom: 10,
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      marginTop: 0,
    }}>{children}</h2>
  )
}

export function DataTable({ headers, rows, numericCols, boldLastRow }: {
  headers: string[]
  rows: (string | number)[][]
  numericCols?: number[]
  boldLastRow?: boolean
}) {
  const isNumeric = (colIdx: number) => numericCols?.includes(colIdx) ?? false
  const isNegative = (val: string | number) => {
    const s = String(val)
    return s.startsWith('-') || s.startsWith('(')
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontSize: 13, fontFamily: "'DM Sans', sans-serif",
      }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '10px 12px',
                textAlign: isNumeric(i) ? 'right' : 'left',
                color: '#5a6475', fontSize: 10, fontWeight: 600,
                letterSpacing: 1, textTransform: 'uppercase',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                fontFamily: "'DM Sans', sans-serif",
                whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const isLast = boldLastRow && ri === rows.length - 1
            return (
              <tr key={ri} style={{
                background: ri % 2 === 1 ? 'rgba(255,255,255,0.03)' : 'transparent',
              }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '10px 12px',
                    textAlign: isNumeric(ci) ? 'right' : 'left',
                    fontFamily: isNumeric(ci) ? "'JetBrains Mono', monospace" : "'DM Sans', sans-serif",
                    color: isNegative(cell) ? '#f87171' : '#e8ecf1',
                    fontWeight: isLast ? 700 : 400,
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    whiteSpace: 'nowrap',
                  }}>{cell}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(8,8,14,0.95)',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 12, fontSize: 12, padding: '10px 14px',
    }}>
      <div style={{ color: '#e8ecf1', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#8b95a5', marginBottom: 2 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </div>
      ))}
    </div>
  )
}
