import { SectionTitle, Badge, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

const severityColor: Record<string, 'red' | 'yellow' | 'blue' | 'green'> = {
  CRITICAL: 'red',
  HIGH: 'yellow',
  MEDIUM: 'blue',
  LOW: 'green',
}

const severityBorder: Record<string, string> = {
  CRITICAL: '#f87171',
  HIGH: '#eab308',
  MEDIUM: '#60a5fa',
  LOW: '#4ade80',
}

function impactColor(impact: string): string {
  const s = impact.toLowerCase()
  if (s.includes('\u2191') || s.includes('positive') || s.includes('upside')) return '#4ade80'
  if (s.includes('\u2193') || s.includes('negative') || s.includes('downside')) return '#f87171'
  return '#e8ecf1'
}

export default function CatalystsTab({ catalysts }: { catalysts: StockReport['catalysts'] }) {
  return (
    <div>
      {catalysts.catalystTable?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Catalyst Calendar</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden', overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontSize: 13, fontFamily: "'DM Sans', sans-serif",
            }}>
              <thead>
                <tr>
                  {['Timeline', 'Catalyst', 'Impact', 'Probability'].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 12px', textAlign: 'left',
                      color: '#5a6475', fontSize: 10, fontWeight: 600,
                      letterSpacing: 1, textTransform: 'uppercase',
                      borderBottom: '1px solid rgba(255,255,255,0.07)',
                      fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalysts.catalystTable.map((row, ri) => (
                  <tr key={ri} style={{
                    background: ri % 2 === 1 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  }}>
                    <td style={{
                      padding: '10px 12px', color: '#e8ecf1',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                      borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
                    }}>{row.timeline}</td>
                    <td style={{
                      padding: '10px 12px', color: '#b8c4d4',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>{row.catalyst}</td>
                    <td style={{
                      padding: '10px 12px', color: impactColor(row.impact),
                      fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.04)',
                      whiteSpace: 'nowrap',
                    }}>{row.impact}</td>
                    <td style={{
                      padding: '10px 12px', color: '#8b95a5',
                      borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
                    }}>{row.probability}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {catalysts.risks?.length > 0 && (
        <div>
          <SectionTitle>Risk Assessment</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {catalysts.risks.map((risk, i) => (
              <div key={i} style={{
                ...glassCard,
                borderLeft: `3px solid ${severityBorder[risk.severity] || '#60a5fa'}`,
                padding: '16px 20px',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 10,
                }}>
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: '#e8ecf1',
                    fontFamily: "'Instrument Serif', serif",
                  }}>{risk.risk}</span>
                  <Badge text={risk.severity} variant={severityColor[risk.severity] || 'blue'} />
                </div>
                <p style={{
                  fontSize: 13, color: '#8b95a5', lineHeight: 1.7,
                  fontFamily: "'DM Sans', sans-serif", margin: 0,
                }}>{risk.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
