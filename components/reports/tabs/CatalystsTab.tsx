'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import { SectionTitle, Badge, CTooltip, glassCard } from '../ReportUI'
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

const timeframeColor: Record<string, 'green' | 'blue' | 'yellow'> = {
  NEAR: 'green',
  MEDIUM: 'blue',
  LONG: 'yellow',
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
                  {['Timeline', 'Catalyst', 'Impact', 'Probability', 'Timeframe', 'Conviction'].map((h, i) => (
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
                    <td style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
                    }}>
                      {row.timeframe && <Badge text={row.timeframe} variant={timeframeColor[row.timeframe] || 'gray'} />}
                    </td>
                    <td style={{
                      padding: '10px 12px', color: '#e8ecf1',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                      borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap',
                    }}>{row.conviction != null ? `${row.conviction}/100` : ''}</td>
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
                boxShadow: `inset 3px 0 12px -4px ${severityBorder[risk.severity] || '#60a5fa'}44`,
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 10, gap: 8, flexWrap: 'wrap',
                }}>
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: '#e8ecf1',
                    fontFamily: "'Instrument Serif', serif",
                  }}>{risk.risk}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Badge text={risk.severity} variant={severityColor[risk.severity] || 'blue'} />
                    {risk.likelihood && <Badge text={`${risk.likelihood} likelihood`} variant={risk.likelihood === 'HIGH' ? 'red' : risk.likelihood === 'MEDIUM' ? 'yellow' : 'green'} />}
                    {risk.timeframe && <Badge text={risk.timeframe} variant={timeframeColor[risk.timeframe] || 'gray'} />}
                  </div>
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

      {catalysts.recommendationTrend?.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <SectionTitle>Analyst Recommendation Trend</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={catalysts.recommendationTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CTooltip />} />
                <Bar dataKey="buy" name="Buy" stackId="a" fill="rgba(74,222,128,0.7)" />
                <Bar dataKey="hold" name="Hold" stackId="a" fill="rgba(96,165,250,0.7)" />
                <Bar dataKey="sell" name="Sell" stackId="a" fill="rgba(248,113,113,0.7)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9632; Buy</span>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9632; Hold</span>
              <span style={{ fontSize: 11, color: '#f87171' }}>&#9632; Sell</span>
            </div>
          </div>
        </div>
      )}

      {catalysts.insiderTimeline && catalysts.insiderTimeline.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <SectionTitle>Insider Activity</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catalysts.insiderTimeline.map((txn, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 0',
                  borderBottom: i < catalysts.insiderTimeline!.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: txn.type === 'BUY' ? '#4ade80' : '#f87171',
                    boxShadow: txn.type === 'BUY'
                      ? '0 0 8px 2px rgba(74,222,128,0.4)'
                      : '0 0 8px 2px rgba(248,113,113,0.4)',
                  }} />
                  <span style={{
                    fontSize: 11, color: '#5a6475', fontFamily: "'JetBrains Mono', monospace",
                    minWidth: 80,
                  }}>{txn.date}</span>
                  <Badge text={txn.type} variant={txn.type === 'BUY' ? 'green' : 'red'} />
                  <span style={{
                    fontSize: 12, color: '#e8ecf1', fontFamily: "'JetBrains Mono', monospace",
                  }}>{txn.shares.toLocaleString()} shares</span>
                  <span style={{
                    fontSize: 12, color: '#5a6475', fontFamily: "'JetBrains Mono', monospace",
                    marginLeft: 'auto',
                  }}>{txn.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
