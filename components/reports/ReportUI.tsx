import { useState, useRef, useEffect } from 'react'
import type { TooltipProps } from 'recharts'

export const glassCard: React.CSSProperties = {
  background: '#0d0d0d',
  borderRadius: 8,
  border: '1px solid #1a1a1a',
  boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
}

export function MetricCard({ label, value, subtitle, yoyChange, footer }: {
  label: string; value: string; subtitle?: string; yoyChange?: string; footer?: string[]
}) {
  const isCagr = /cagr/i.test(label)
  const changeColor = yoyChange?.startsWith('+') ? '#4ade80'
    : yoyChange?.startsWith('-') ? '#f87171'
    : '#5a6475'

  const valueColor = value.startsWith('+') ? '#4ade80'
    : value.startsWith('-') ? '#f87171'
    : '#e8ecf1'

  return (
    <div style={{
      ...glassCard, padding: '18px 16px', minWidth: 0,
      height: '100%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        fontSize: 13, letterSpacing: 1.4, color: '#5a6475',
        textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace", marginBottom: 8,
        minHeight: 14,
      }}>{label}</div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      }}>
        <div style={{
          fontSize: 24, fontWeight: 700, color: valueColor,
          fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1,
        }}>{value}</div>
        {yoyChange && !isCagr && (
          <span style={{
            fontSize: 12, fontWeight: 600, color: changeColor,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{yoyChange}<span style={{ color: '#5a6475', fontWeight: 400 }}> YoY</span></span>
        )}
      </div>
      {subtitle && (
        <div style={{
          fontSize: 12, marginTop: 'auto', paddingTop: 8, fontFamily: "'JetBrains Mono', monospace",
          color: '#5a6475',
        }}>{subtitle}</div>
      )}
      {footer && footer.length > 0 && (
        <div style={{
          marginTop: subtitle ? 4 : 'auto', paddingTop: subtitle ? 0 : 8,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {footer.map((line, i) => (
            <div key={i} style={{
              fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
              color: '#4a5568', lineHeight: 1.4,
            }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}

const badgeColors: Record<string, { bg: string; color: string; border: string; glow: string }> = {
  green: { bg: 'rgba(74,222,128,0.18)', color: '#4ade80', border: 'rgba(74,222,128,0.35)', glow: '0 0 10px 1px rgba(74,222,128,0.25)' },
  red: { bg: 'rgba(248,113,113,0.18)', color: '#f87171', border: 'rgba(248,113,113,0.35)', glow: '0 0 10px 1px rgba(248,113,113,0.25)' },
  blue: { bg: 'rgba(96,165,250,0.18)', color: '#60a5fa', border: 'rgba(96,165,250,0.35)', glow: '0 0 10px 1px rgba(96,165,250,0.25)' },
  yellow: { bg: 'rgba(234,179,8,0.18)', color: '#eab308', border: 'rgba(234,179,8,0.35)', glow: '0 0 10px 1px rgba(234,179,8,0.25)' },
  gray: { bg: 'rgba(255,255,255,0.06)', color: '#8b95a5', border: 'rgba(255,255,255,0.1)', glow: 'none' },
}

export function Badge({ text, variant = 'gray', tooltip }: { text: string; variant?: 'green' | 'red' | 'blue' | 'yellow' | 'gray'; tooltip?: string }) {
  const c = badgeColors[variant] || badgeColors.gray
  const [show, setShow] = useState(false)
  const tipRef = useRef<HTMLSpanElement>(null)
  const [nudge, setNudge] = useState(0)

  useEffect(() => {
    if (!show || !tipRef.current) { setNudge(0); return }
    const rect = tipRef.current.getBoundingClientRect()
    const pad = 8
    if (rect.left < pad) setNudge(pad - rect.left)
    else if (rect.right > window.innerWidth - pad) setNudge(window.innerWidth - pad - rect.right)
    else setNudge(0)
  }, [show])

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => tooltip && setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{
        display: 'inline-block', padding: '3px 10px', borderRadius: 4,
        fontSize: 10, fontWeight: 600,
        background: c.bg, color: c.color, border: `1px solid ${c.border}`,
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
        whiteSpace: 'nowrap',
        boxShadow: c.glow,
        cursor: tooltip ? 'help' : undefined,
      }}>{text}</span>
      {show && tooltip && (
        <span ref={tipRef} style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: `translateX(calc(-50% + ${nudge}px))`,
          background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
          padding: '8px 12px', fontSize: 11, lineHeight: 1.5, color: '#c8d0dc',
          fontFamily: "'JetBrains Mono', monospace", fontWeight: 400,
          width: 240, whiteSpace: 'normal', zIndex: 50,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>{tooltip}</span>
      )}
    </span>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 13, fontWeight: 700, color: '#e8ecf1',
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: '0.05em', textTransform: 'uppercase',
      marginBottom: 14, paddingBottom: 10,
      borderBottom: '1px solid #1a1a1a',
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
        fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
      }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '10px 12px',
                textAlign: isNumeric(i) ? 'right' : 'left',
                color: '#5a6475', fontSize: 10, fontWeight: 600,
                letterSpacing: 1, textTransform: 'uppercase',
                borderBottom: '1px solid #1a1a1a',
                fontFamily: "'JetBrains Mono', monospace",
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
                background: ri % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
              }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '10px 12px',
                    textAlign: isNumeric(ci) ? 'right' : 'left',
                    fontFamily: "'JetBrains Mono', monospace",
                    color: isNegative(cell) ? '#f87171' : '#e8ecf1',
                    fontWeight: isLast ? 700 : 400,
                    borderBottom: '1px solid #111',
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
  const range = high - low
  const pct = (v: number) => range > 0 ? Math.min(100, Math.max(0, ((v - low) / range) * 100)) : 50

  return (
    <div style={{ padding: '12px 0' }}>
      {label && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 600, color: '#5a6475',
            fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase',
            letterSpacing: 1,
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
        position: 'relative', height: 6, borderRadius: 2,
        background: 'rgba(255,255,255,0.06)',
      }}>
        {/* Gradient fill spanning full track (low → high) */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 2,
          background: 'linear-gradient(90deg, rgba(248,113,113,0.4), rgba(96,165,250,0.3), rgba(74,222,128,0.4))',
        }} />
        {/* Mean marker */}
        <div style={{
          position: 'absolute', top: -3, width: 2, height: 12, borderRadius: 1,
          left: `${pct(mean)}%`, background: '#60a5fa',
          transform: 'translateX(-50%)',
        }} />
        {/* Current price marker */}
        <div style={{
          position: 'absolute', top: -5, width: 3, height: 16, borderRadius: 1,
          left: `${pct(current)}%`, background: '#ffffff',
          transform: 'translateX(-50%)',
        }} />
      </div>
      <div style={{ position: 'relative', height: 20, marginTop: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
        <span style={{ position: 'absolute', left: 0, color: '#f87171' }}>${low.toFixed(0)}</span>
        <span style={{
          position: 'absolute',
          left: `clamp(0%, ${pct(mean)}%, 100%)`,
          transform: `translateX(${pct(mean) < 15 ? '0%' : pct(mean) > 85 ? '-100%' : '-50%'})`,
          color: '#60a5fa', whiteSpace: 'nowrap',
        }}>Mean ${mean.toFixed(0)}</span>
        <span style={{ position: 'absolute', right: 0, color: '#4ade80' }}>${high.toFixed(0)}</span>
      </div>
      <div style={{ position: 'relative', height: 18, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
        <span style={{
          position: 'absolute',
          left: `clamp(0%, ${pct(current)}%, 100%)`,
          transform: `translateX(${pct(current) < 15 ? '0%' : pct(current) > 85 ? '-100%' : '-50%'})`,
          whiteSpace: 'nowrap', color: '#5a6475',
        }}>now <span style={{ color: '#e8ecf1' }}>${current.toFixed(0)}</span></span>
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
