'use client'

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ResponsiveContainer, Tooltip,
} from 'recharts'
import { SectionTitle, DataTable, Badge, ConvictionBadge, CTooltip, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

const ratingColor: Record<string, 'green' | 'red' | 'blue'> = {
  BUY: 'green',
  SELL: 'red',
  HOLD: 'blue',
  AVOID: 'red',
}

function formatYAxis(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${value}`
}

export default function VerdictTab({ verdictDetails, verdict }: {
  verdictDetails: StockReport['verdictDetails']
  verdict: StockReport['verdict']
}) {
  const sv = verdictDetails.syndicateVerdict

  return (
    <div>
      {/* Conviction Score */}
      {verdictDetails.convictionScore != null && (
        <div style={{
          ...glassCard,
          display: 'flex', alignItems: 'center', gap: 20,
          padding: '20px 24px', marginBottom: 32,
        }}>
          <ConvictionBadge score={verdictDetails.convictionScore} size="large" />
          <div>
            <div style={{
              fontSize: 12, fontWeight: 700, color: '#5a6475',
              fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 4,
            }}>CONVICTION SCORE</div>
            {verdictDetails.convictionDrivers && (
              <p style={{
                fontSize: 13, color: '#b8c4d4', lineHeight: 1.6,
                fontFamily: "'DM Sans', sans-serif", margin: 0,
              }}>{verdictDetails.convictionDrivers}</p>
            )}
          </div>
        </div>
      )}

      {/* Three Scenario Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 12, marginBottom: 32,
      }}>
        {([
          { key: 'bullCase' as const, label: 'Bull Case', border: '#4ade80', emoji: '\ud83d\udc02' },
          { key: 'baseCase' as const, label: 'Base Case', border: '#60a5fa', emoji: '\u2696\ufe0f' },
          { key: 'bearCase' as const, label: 'Bear Case', border: '#f87171', emoji: '\ud83d\udc3b' },
        ]).map(({ key, label, border, emoji }) => {
          const scenario = verdictDetails[key]
          if (!scenario) return null
          const matrixEntry = verdictDetails.scenarioMatrix?.find(
            s => s.scenario.toLowerCase().includes(key.replace('Case', '').toLowerCase())
          )
          return (
            <div key={key} style={{
              ...glassCard,
              borderTop: `3px solid ${border}`,
              padding: '20px',
              boxShadow: `0 -4px 12px -2px ${border}44`,
            }}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: border,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em', marginBottom: 12,
              }}>{emoji} {label}</div>
              <div style={{
                fontSize: 24, fontWeight: 700, color: '#e8ecf1',
                fontFamily: "'JetBrains Mono', monospace", marginBottom: 4,
              }}>{scenario.priceTarget}</div>
              <div style={{
                fontSize: 13, color: border, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace", marginBottom: 12,
              }}>{scenario.return}</div>
              <p style={{
                fontSize: 12, color: '#8b95a5', lineHeight: 1.7,
                fontFamily: "'DM Sans', sans-serif", margin: 0,
              }}>{scenario.description}</p>
              {(matrixEntry?.keyAssumptions?.length ?? 0) > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: '#5a6475',
                    fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase',
                    letterSpacing: 1, marginBottom: 6,
                  }}>Key Assumptions</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {matrixEntry?.keyAssumptions?.map((a, ai) => (
                      <li key={ai} style={{
                        fontSize: 11, color: '#8b95a5', lineHeight: 1.6,
                        fontFamily: "'DM Sans', sans-serif",
                      }}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Risk-to-Reward Matrix */}
      {verdictDetails.scenarioMatrix?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Risk-to-Reward Matrix</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Scenario', 'Probability', 'Price Target', 'Return', 'Weighted']}
              rows={verdictDetails.scenarioMatrix.map(r => [
                r.scenario, r.probability, r.priceTarget, r.return, r.weighted,
              ])}
              numericCols={[1, 2, 3, 4]}
              boldLastRow
            />
          </div>
        </div>
      )}

      {/* Multi-Year Projections */}
      {verdictDetails.multiYearProjections?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Multi-Year Projections</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Horizon', 'Bear Case', 'Base Case', 'Bull Case', 'Implied CAGR', 'Commentary']}
              rows={verdictDetails.multiYearProjections.map(r => [
                r.horizon, r.bearCase, r.baseCase, r.bullCase, r.impliedCagr || '—', r.commentary,
              ])}
              numericCols={[1, 2, 3, 4]}
            />
          </div>
        </div>
      )}

      {/* Price Projection Chart */}
      {verdictDetails.priceProjectionChart?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Price Projection</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={verdictDetails.priceProjectionChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: '#5a6475', fontSize: 12 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#5a6475', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  tickFormatter={formatYAxis}
                />
                <Tooltip content={<CTooltip />} />
                <Area
                  type="monotone" dataKey="bull" name="Bull"
                  stroke="#4ade80" fill="rgba(74,222,128,0.18)" strokeWidth={2}
                  style={{ filter: 'url(#fGlow)' }}
                />
                <Line
                  type="monotone" dataKey="base" name="Base"
                  stroke="#60a5fa" strokeWidth={2.5}
                  dot={{ fill: '#60a5fa', r: 4, strokeWidth: 0 }}
                  style={{ filter: 'url(#fGlow)' }}
                />
                <Area
                  type="monotone" dataKey="bear" name="Bear"
                  stroke="#f87171" fill="rgba(248,113,113,0.18)" strokeWidth={2}
                  strokeDasharray="5 3"
                  style={{ filter: 'url(#fGlow)' }}
                />
                <Line
                  type="monotone" dataKey="analystMean" name="Analyst Mean"
                  stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3"
                  dot={false}
                  style={{ filter: 'url(#fGlow)' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9650; Bull</span>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9679; Base</span>
              <span style={{ fontSize: 11, color: '#f87171' }}>&#9660; Bear</span>
              <span style={{ fontSize: 11, color: '#f59e0b' }}>- - Analyst Mean</span>
            </div>
          </div>
        </div>
      )}

      {/* SANCTUM Syndicate Verdict Card */}
      {sv && (
        <div style={{
          border: '1px solid rgba(234,179,8,0.4)',
          borderRadius: 12,
          padding: 32,
          background: 'linear-gradient(160deg, rgba(234,179,8,0.06) 0%, rgba(234,179,8,0.02) 100%)',
        }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
              <Badge text={sv.rating} variant={ratingColor[sv.rating] || 'blue'} />
              <ConvictionBadge score={verdictDetails.convictionScore} />
              <span style={{
                fontSize: 16, fontWeight: 700, color: '#e8ecf1',
                fontFamily: "'Instrument Serif', serif",
              }}>{verdictDetails.baseCase?.priceTarget ? `Target: ${verdictDetails.baseCase.priceTarget}` : ''}</span>
            </div>
            <p style={{
              fontSize: 13, color: '#8b95a5', margin: 0,
              fontFamily: "'DM Sans', sans-serif",
            }}>{sv.positionSizing}</p>
          </div>

          <div style={{ height: 1, background: 'rgba(234,179,8,0.2)', marginBottom: 24 }} />

          {([
            { title: sv.keySignalTitle, body: sv.keySignalDetail },
            { title: 'The Honest Risk', body: sv.honestRisk },
            { title: 'How to Position', body: sv.howToPosition },
            { title: 'The Long-Term Thesis', body: sv.longTermThesis },
          ]).map((block, i) => (
            block.body ? (
              <div key={i} style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: '#eab308',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.03em', marginBottom: 8,
                }}>{block.title}</div>
                <p style={{
                  fontSize: 13, color: '#b8c4d4', lineHeight: 1.8,
                  fontFamily: "'DM Sans', sans-serif", margin: 0,
                }}>{block.body}</p>
              </div>
            ) : null
          ))}

          <p style={{
            fontSize: 11, color: '#5a6475', margin: '16px 0 0',
            fontFamily: "'DM Sans', sans-serif", fontStyle: 'italic',
          }}>
            SANCTUM Syndicate Report &middot; AI-Generated &middot; Not financial advice &middot; Do your own due diligence
          </p>
        </div>
      )}
    </div>
  )
}
