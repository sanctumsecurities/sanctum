'use client'

import {
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts'
import { MetricCard, SectionTitle, CTooltip, RangeBar, Badge, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

const SEGMENT_COLORS = ['#60a5fa', '#4ade80', '#f59e0b', '#f87171', '#a78bfa', '#ec4899', '#2dd4bf', '#fb923c']

export default function OverviewTab({ overview, currentPrice }: {
  overview: StockReport['overview']
  currentPrice?: string
}) {
  const currentPriceNum = currentPrice
    ? parseFloat(currentPrice.replace(/[$,]/g, ''))
    : 0

  return (
    <div>
      {/* 1. Key Metrics */}
      {overview.keyMetrics?.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12, marginBottom: 32,
        }}>
          {overview.keyMetrics.map((m, i) => (
            <MetricCard key={i} label={m.label} value={m.value} subtitle={m.subtitle} yoyChange={m.yoyChange} />
          ))}
        </div>
      )}

      {/* 2. Business Overview */}
      <div style={{ marginBottom: 32 }}>
        <SectionTitle>Business Overview</SectionTitle>
        {overview.businessSummary?.split('\n\n').map((p, i) => (
          <p key={i} style={{
            fontSize: 13, color: '#b8c4d4', lineHeight: 1.8,
            fontFamily: "'JetBrains Mono', monospace", margin: '0 0 16px',
          }}>{p}</p>
        ))}
        {overview.whatHasGoneWrong && (
          <div style={{
            ...glassCard,
            borderLeft: '3px solid #f87171',
            padding: '16px 20px', marginTop: 16,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#f87171',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.1em', marginBottom: 8,
              textTransform: 'uppercase',
            }}>What Has Gone Wrong</div>
            <p style={{
              fontSize: 12, color: '#b8c4d4', lineHeight: 1.7,
              fontFamily: "'JetBrains Mono', monospace", margin: 0,
            }}>{overview.whatHasGoneWrong}</p>
          </div>
        )}
      </div>

      {/* 3. Analyst Consensus */}
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
              current={currentPriceNum}
              label="Price Target Range"
              count={overview.analystConsensus.numberOfAnalysts}
            />
          </div>
        </div>
      )}

      {/* 4. Revenue by Segment */}
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
                  padding: '8px 0', borderBottom: '1px solid #111',
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                    background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                  }} />
                  <span style={{ flex: 1, fontSize: 12, color: '#b8c4d4', fontFamily: "'JetBrains Mono', monospace" }}>
                    {seg.name}
                  </span>
                  <span style={{ fontSize: 12, color: '#e8ecf1', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    {seg.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. Competitive Moat */}
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
                  <PolarGrid stroke="rgba(255,255,255,0.06)" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fill: '#5a6475', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
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
                <span style={{ fontSize: 11, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>● Company</span>
                {hasSector && (
                  <span style={{ fontSize: 11, color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace" }}>- - Sector Avg</span>
                )}
              </div>
              <p style={{
                fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '8px 0 0',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                Scores out of 100. Higher values indicate stronger competitive positioning.
              </p>
            </div>
          </div>
        )
      })()}

      {/* 6. Institutional & Insider (bottom) */}
      {(overview.institutionalOwnership !== 'N/A' || overview.insiderActivity) && (() => {
        const instPct = parseFloat((overview.institutionalOwnership || '').replace(/[%,]/g, ''))
        const netBuys = overview.insiderActivity?.netBuys90Days ?? 0
        const notable = overview.insiderActivity?.notable?.toLowerCase() ?? ''
        const signals: { text: string; positive: boolean }[] = []

        // — Insider base score —
        let insiderBase = 0
        if (netBuys > 0) {
          // Volume tiers (superlinear)
          insiderBase += netBuys >= 5 ? 5 : netBuys >= 3 ? 3 : 1
          // Rank bonus
          if (/\bceo\b/.test(notable)) {
            insiderBase += 3
            signals.push({ text: 'CEO buying', positive: true })
          } else if (/\bcfo\b/.test(notable)) {
            insiderBase += 2
            signals.push({ text: 'CFO buying', positive: true })
          } else if (/\bdirector\b/.test(notable)) {
            insiderBase += 1
            signals.push({ text: 'Director buying', positive: true })
          } else {
            signals.push({ text: `+${netBuys} insider buy${netBuys > 1 ? 's' : ''}`, positive: true })
          }
          // Dollar size
          const dm = notable.match(/\$(\d+(?:\.\d+)?)\s*(m(?:illion)?|k)\b/i)
          if (dm) {
            const val = parseFloat(dm[1]) * (/^m/i.test(dm[2]) ? 1_000_000 : 1_000)
            if (val >= 2_000_000) {
              insiderBase += 2
              signals.push({ text: `$${dm[1]}M buy`, positive: true })
            } else if (val >= 500_000) {
              insiderBase += 1
              signals.push({ text: `$${dm[1]}${/^k/i.test(dm[2]) ? 'K' : 'M'} buy`, positive: true })
            }
          }
        } else if (netBuys < 0) {
          const sellers = Math.abs(netBuys)
          insiderBase += sellers >= 5 ? -5 : sellers >= 3 ? -3 : -1
          signals.push({ text: `${sellers} insider sell${sellers > 1 ? 's' : ''}`, positive: false })
        }

        // — Context multiplier (price position relative to range) —
        let contextMult = 1.0
        if (/near\s+(52.?week\s+)?low|multi.?year\s+low|year.?to.?date\s+low/.test(notable)) {
          contextMult = 1.5
          signals.push({ text: 'near lows ×1.5', positive: true })
        } else if (/near\s+(52.?week\s+)?high|all.?time\s+high|ath/.test(notable)) {
          contextMult = 0.7
          signals.push({ text: 'near highs ×0.7', positive: false })
        }

        // — Recency multiplier —
        let recencyMult = 0.8
        if (/\b(\d+\s+days?\s+ago|this\s+week|last\s+week|\d+\s+days?\s+old)\b/.test(notable) ||
            /within\s+(the\s+)?(past\s+)?(7|seven)\s+days/.test(notable)) {
          recencyMult = 1.3
          signals.push({ text: '<7d ×1.3', positive: true })
        } else if (/\b(this\s+month|last\s+month|\d+\s+weeks?\s+ago)\b/.test(notable) ||
                   /within\s+(the\s+)?(past\s+)?(30|thirty)\s+days/.test(notable)) {
          recencyMult = 1.1
          signals.push({ text: '<30d ×1.1', positive: true })
        } else if (netBuys !== 0) {
          signals.push({ text: '>30d ×0.8', positive: false })
        }

        // — Institutional score —
        let instScore = 0
        if (!isNaN(instPct)) {
          if (instPct >= 85) {
            signals.push({ text: `${instPct.toFixed(0)}% inst. (crowded)`, positive: false })
          } else if (instPct >= 65) {
            instScore = 2
            signals.push({ text: `${instPct.toFixed(0)}% institutional`, positive: true })
          } else if (instPct < 20) {
            instScore = -1
            signals.push({ text: `${instPct.toFixed(0)}% inst. (avoided)`, positive: false })
          }
          if (/increas|accumulat|rais/.test(notable)) {
            instScore += 1
            signals.push({ text: 'ownership ↑', positive: true })
          } else if (/decreas|reduc|trim|lower/.test(notable)) {
            instScore -= 1
            signals.push({ text: 'ownership ↓', positive: false })
          }
        }

        // Final Score = (insiderBase × context × recency) + institutional
        const totalScore = Math.round((insiderBase * contextMult * recencyMult) + instScore)

        const sentiment = totalScore >= 12
          ? { label: 'STRONG BUY', color: '#4ade80', bg: 'rgba(74,222,128,0.07)', border: 'rgba(74,222,128,0.22)' }
          : totalScore >= 8
          ? { label: 'BUY', color: '#4ade80', bg: 'rgba(74,222,128,0.05)', border: 'rgba(74,222,128,0.16)' }
          : totalScore >= 4
          ? { label: 'HOLD', color: '#60a5fa', bg: 'rgba(96,165,250,0.05)', border: 'rgba(96,165,250,0.16)' }
          : totalScore >= 1
          ? { label: 'SELL', color: '#f87171', bg: 'rgba(248,113,113,0.05)', border: 'rgba(248,113,113,0.16)' }
          : { label: 'STRONG SELL', color: '#f87171', bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.22)' }

        return (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Institutional &amp; Insider</SectionTitle>
          <div style={{ ...glassCard, padding: '0', overflow: 'hidden' }}>
            {/* Sentiment indicator */}
            <div style={{
              padding: '14px 20px', borderBottom: '1px solid #111',
              background: sentiment.bg,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: sentiment.color,
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em',
                padding: '3px 9px', borderRadius: 3,
                border: `1px solid ${sentiment.border}`,
                whiteSpace: 'nowrap',
              }}>{sentiment.label} ({totalScore})</span>
              {signals.map((s, i) => (
                <span key={i} style={{
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  color: s.positive ? '#4ade80' : '#f87171',
                  background: s.positive ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)',
                  border: `1px solid ${s.positive ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)'}`,
                  borderRadius: 3, padding: '2px 7px', whiteSpace: 'nowrap',
                }}>
                  {s.positive ? '↑' : '↓'} {s.text}
                </span>
              ))}
            </div>
            {overview.institutionalOwnership && overview.institutionalOwnership !== 'N/A' && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 20px', borderBottom: overview.insiderActivity ? '1px solid #111' : 'none',
              }}>
                <span style={{
                  fontSize: 10, color: '#5a6475', fontFamily: "'JetBrains Mono', monospace",
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>Institutional Ownership</span>
                <span style={{
                  fontSize: 16, fontWeight: 700, color: '#e8ecf1',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{overview.institutionalOwnership}</span>
              </div>
            )}
            {overview.insiderActivity && (() => {
              const net = overview.insiderActivity!.netBuys90Days
              const buys = net > 0 ? net : 0
              const sells = net < 0 ? Math.abs(net) : 0
              return (
                <>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 20px', borderBottom: '1px solid #111',
                  }}>
                    <span style={{
                      fontSize: 10, color: '#5a6475', fontFamily: "'JetBrains Mono', monospace",
                      textTransform: 'uppercase', letterSpacing: 1,
                    }}>Net Insider Buys (90d)</span>
                    <span style={{
                      fontSize: 16, fontWeight: 700,
                      color: buys > 0 ? '#4ade80' : '#8b95a5',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>{buys > 0 ? `+${buys}` : '0'}</span>
                  </div>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 20px',
                  }}>
                    <span style={{
                      fontSize: 10, color: '#5a6475', fontFamily: "'JetBrains Mono', monospace",
                      textTransform: 'uppercase', letterSpacing: 1,
                    }}>Net Insider Sells (90d)</span>
                    <span style={{
                      fontSize: 16, fontWeight: 700,
                      color: sells > 0 ? '#f87171' : '#8b95a5',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>{sells > 0 ? `-${sells}` : '0'}</span>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )
      })()}
    </div>
  )
}
