'use client'

import {
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts'
import { MetricCard, SectionTitle, CTooltip, RangeBar, Badge, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

const SEGMENT_COLORS = ['#60a5fa', '#4ade80', '#f59e0b', '#f87171', '#a78bfa', '#ec4899', '#2dd4bf', '#fb923c']

export default function OverviewTab({ overview }: { overview: StockReport['overview'] }) {
  return (
    <div>
      {overview.keyMetrics?.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12, marginBottom: 32,
        }}>
          {overview.keyMetrics.map((m, i) => (
            <MetricCard key={i} label={m.label} value={m.value} subtitle={m.subtitle} color={m.color} yoyChange={m.yoyChange} />
          ))}
        </div>
      )}

      {overview.analystConsensus && overview.analystConsensus.numberOfAnalysts > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Analyst Consensus</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 20px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
            }}>
              <Badge
                text={overview.analystConsensus.recommendation}
                variant={
                  overview.analystConsensus.recommendation.toLowerCase().includes('buy') ? 'green'
                  : overview.analystConsensus.recommendation.toLowerCase().includes('sell') ? 'red'
                  : 'blue'
                }
              />
              <span style={{
                fontSize: 12, color: '#5a6475',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {overview.analystConsensus.numberOfAnalysts} analysts
              </span>
            </div>
            <RangeBar
              low={parseFloat(overview.analystConsensus.lowTarget.replace(/[$,]/g, '')) || 0}
              mean={parseFloat(overview.analystConsensus.meanTarget.replace(/[$,]/g, '')) || 0}
              high={parseFloat(overview.analystConsensus.highTarget.replace(/[$,]/g, '')) || 0}
              current={parseFloat(overview.analystConsensus.meanTarget.replace(/[$,]/g, '')) || 0}
              label="Price Target Range"
              count={overview.analystConsensus.numberOfAnalysts}
            />
          </div>
        </div>
      )}

      {(overview.institutionalOwnership !== 'N/A' || overview.insiderActivity) && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Institutional &amp; Insider Signals</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 20px' }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {overview.institutionalOwnership && overview.institutionalOwnership !== 'N/A' && (
                <div>
                  <div style={{
                    fontSize: 10, letterSpacing: 1.4, color: '#5a6475',
                    textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 6,
                  }}>Institutional Ownership</div>
                  <div style={{
                    fontSize: 20, fontWeight: 700, color: '#e8ecf1',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{overview.institutionalOwnership}</div>
                </div>
              )}
              {overview.insiderActivity && (
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{
                    fontSize: 10, letterSpacing: 1.4, color: '#5a6475',
                    textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 6,
                  }}>Recent Insider Activity</div>
                  <div style={{
                    fontSize: 13, color: overview.insiderActivity.netBuys90Days > 0 ? '#4ade80' : overview.insiderActivity.netBuys90Days < 0 ? '#f87171' : '#8b95a5',
                    fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6,
                  }}>
                    Net {overview.insiderActivity.netBuys90Days >= 0 ? 'buys' : 'sells'} (90d): {Math.abs(overview.insiderActivity.netBuys90Days)}
                  </div>
                  <div style={{
                    fontSize: 12, color: '#8b95a5', marginTop: 4,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>{overview.insiderActivity.notable}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 32 }}>
        <SectionTitle>Business Overview</SectionTitle>
        {overview.businessSummary?.split('\n\n').map((p, i) => (
          <p key={i} style={{
            fontSize: 14, color: '#b8c4d4', lineHeight: 1.8,
            fontFamily: "'DM Sans', sans-serif", margin: '0 0 16px',
          }}>{p}</p>
        ))}
        {overview.whatHasGoneWrong && (
          <div style={{
            ...glassCard,
            borderLeft: '3px solid #f87171',
            padding: '16px 20px', marginTop: 16,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: '#f87171',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.05em', marginBottom: 8,
              textTransform: 'uppercase',
            }}>What Has Gone Wrong</div>
            <p style={{
              fontSize: 13, color: '#b8c4d4', lineHeight: 1.7,
              fontFamily: "'DM Sans', sans-serif", margin: 0,
            }}>{overview.whatHasGoneWrong}</p>
          </div>
        )}
      </div>

      {overview.segmentBreakdown?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Revenue by Segment</SectionTitle>
          <div style={{ ...glassCard, padding: '20px', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ width: 220, height: 220, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={overview.segmentBreakdown}
                    dataKey="percentage"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    strokeWidth={0}
                  >
                    {overview.segmentBreakdown.map((_, i) => (
                      <Cell key={i} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              {overview.segmentBreakdown.map((seg, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                    background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                  }} />
                  <span style={{ flex: 1, fontSize: 13, color: '#b8c4d4', fontFamily: "'DM Sans', sans-serif" }}>
                    {seg.name}
                  </span>
                  <span style={{ fontSize: 13, color: '#e8ecf1', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    {seg.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {overview.moatScores?.length > 0 && (() => {
        const hasSector = overview.sectorMoatScores?.length > 0
        const mergedMoatData = overview.moatScores.map((m, i) => ({
          metric: m.metric,
          score: m.score,
          ...(hasSector && overview.sectorMoatScores[i]
            ? { sectorScore: overview.sectorMoatScores[i].score }
            : {}),
        }))
        return (
          <div style={{ marginBottom: 32 }}>
            <SectionTitle>Competitive Moat Analysis</SectionTitle>
            <div style={{ ...glassCard, padding: '20px' }}>
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={mergedMoatData} cx="50%" cy="50%" outerRadius="75%">
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fill: '#5a6475', fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}
                  />
                  {hasSector && (
                    <Radar
                      dataKey="sectorScore"
                      stroke="#a78bfa"
                      fill="rgba(167,139,250,0.08)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  )}
                  <Radar
                    dataKey="score"
                    stroke="#60a5fa"
                    fill="rgba(96,165,250,0.20)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#60a5fa', strokeWidth: 0 }}
                  />
                  <Tooltip content={<CTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#60a5fa' }}>● Company</span>
                {hasSector && (
                  <span style={{ fontSize: 11, color: '#a78bfa' }}>- - Sector Avg</span>
                )}
              </div>
              <p style={{
                fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '8px 0 0',
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Scores out of 100. Higher values indicate stronger competitive positioning in each dimension.
              </p>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
