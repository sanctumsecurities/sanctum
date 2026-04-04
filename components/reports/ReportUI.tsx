import type { TooltipProps } from 'recharts'

export const glassCard: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.025) 100%)',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 2px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
}

export function MetricCard({ label, value, subtitle, color, yoyChange }: {
  label: string; value: string; subtitle?: string; color?: string; yoyChange?: string
}) {
  const changeColor = yoyChange?.startsWith('+') ? '#4ade80'
    : yoyChange?.startsWith('-') ? '#f87171'
    : '#5a6475'

  return (
    <div style={{
      ...glassCard, padding: '18px 16px', minWidth: 0,
      height: '100%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 1.4, color: '#5a6475',
        textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 8,
        minHeight: 14,
      }}>{label}</div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      }}>
        <div style={{
          fontSize: 22, fontWeight: 700, color: color || '#e8ecf1',
          fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1,
        }}>{value}</div>
        {yoyChange && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: changeColor,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{yoyChange}</span>
        )}
      </div>
      {subtitle && (
        <div style={{
          fontSize: 11, marginTop: 'auto', paddingTop: 8, fontFamily: "'DM Sans', sans-serif",
          color: '#5a6475',
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

export function RangeBar({ low, mean, high, current, label, count }: {
  low: number; mean: number; high: number; current: number; label?: string; count?: number
}) {
  const min = Math.min(low, current) * 0.95
  const max = Math.max(high, current) * 1.05
  const range = max - min
  const pct = (v: number) => ((v - min) / range) * 100

  return (
    <div style={{ padding: '12px 0' }}>
      {label && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: '#e8ecf1',
            fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>{label}</span>
          {count != null && (
            <span style={{
              fontSize: 11, color: '#5a6475',
              fontFamily: "'JetBrains Mono', monospace",
            }}>{count} analysts</span>
          )}
        </div>
      )}
      <div style={{
        position: 'relative', height: 8, borderRadius: 4,
        background: 'rgba(255,255,255,0.06)',
      }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0, borderRadius: 4,
          left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%`,
          background: 'linear-gradient(90deg, rgba(248,113,113,0.3), rgba(96,165,250,0.3), rgba(74,222,128,0.3))',
        }} />
        <div style={{
          position: 'absolute', top: -4, width: 2, height: 16, borderRadius: 1,
          left: `${pct(mean)}%`, background: '#60a5fa',
        }} />
        <div style={{
          position: 'absolute', top: -6, width: 3, height: 20, borderRadius: 1.5,
          left: `${pct(current)}%`, background: '#e8ecf1',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 8,
        fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
      }}>
        <span style={{ color: '#f87171' }}>${low.toFixed(0)}</span>
        <span style={{ color: '#60a5fa' }}>Mean ${mean.toFixed(0)}</span>
        <span style={{ color: '#4ade80' }}>${high.toFixed(0)}</span>
      </div>
      <div style={{
        textAlign: 'center', marginTop: 4,
        fontSize: 10, color: '#5a6475', fontFamily: "'DM Sans', sans-serif",
      }}>
        Current: <span style={{ color: '#e8ecf1', fontFamily: "'JetBrains Mono', monospace" }}>${current.toFixed(0)}</span>
      </div>
    </div>
  )
}

export function ConvictionBadge({ score, size = 'default' }: {
  score: number; size?: 'default' | 'large'
}) {
  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#f59e0b' : '#f87171'
  const isLarge = size === 'large'

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: isLarge ? 10 : 6,
    }}>
      <span style={{
        fontSize: isLarge ? 36 : 16, fontWeight: 700, color,
        fontFamily: "'JetBrains Mono', monospace", lineHeight: 1,
      }}>{score}</span>
      <span style={{
        fontSize: isLarge ? 13 : 10, color: '#5a6475',
        fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>/100</span>
    </div>
  )
}
