'use client'

import { useState, useEffect } from 'react'
import {
  RadarChart, PolarGrid, PolarAngleAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts'
import { MetricCard, SectionTitle, CTooltip, RangeBar, Badge, ConvictionBadge, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

const SEGMENT_COLORS = ['#60a5fa', '#4ade80', '#f59e0b', '#f87171', '#a78bfa', '#ec4899', '#2dd4bf', '#fb923c']

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

export default function OverviewTab({ overview, currentPrice, convictionScore, convictionDrivers }: {
  overview: StockReport['overview']
  currentPrice?: string
  convictionScore?: number
  convictionDrivers?: string
}) {
  const currentPriceNum = currentPrice
    ? parseFloat(currentPrice.replace(/[$,]/g, ''))
    : 0

  const isDesktop = useMediaQuery('(min-width: 1024px)')

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isDesktop ? '1.15fr 1fr' : '1fr',
      gap: isDesktop ? 12 : 24,
    }}>
      {/* ── Top-Left: Metrics + Business Overview ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: isDesktop ? 12 : 24,  }}>

        {/* 1. Key Metrics */}
        {overview.keyMetrics?.length > 0 && (
          <div>
          <SectionTitle>Key Metrics</SectionTitle>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(4, 1fr)',
            gap: 12,
          }}>
            {overview.keyMetrics.filter(m => m.value && m.value !== 'N/A').map((m, i) => (
              <MetricCard key={i} label={m.label} value={m.value} subtitle={m.subtitle} yoyChange={m.yoyChange} />
            ))}
          </div>
          </div>
        )}

        {/* 2. Business Overview */}
        <div>
          <SectionTitle>Business Overview</SectionTitle>
          {overview.businessSummary && (() => {
            const sections = typeof overview.businessSummary === 'string'
              ? [{ label: 'Business Model', text: overview.businessSummary }]
              : [
                  { label: 'Business Model', text: overview.businessSummary.businessModel },
                  { label: 'Financials', text: overview.businessSummary.financials },
                  { label: 'Valuation', text: overview.businessSummary.valuation },
                ].filter(s => s.text)
            return sections.map((s, i) => (
              <div key={i} style={{ marginBottom: i < sections.length - 1 ? 16 : 0 }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: '#5a6475',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                  marginBottom: 6,
                }}>{s.label}</div>
                <p style={{
                  fontSize: 13, color: '#b8c4d4', lineHeight: 1.8,
                  fontFamily: "'JetBrains Mono', monospace", margin: 0,
                }}>{s.text}</p>
              </div>
            ))
          })()}
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
          <div>
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

        {/* Institutional & Insider + Conviction Score */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            ? { label: 'STRONG BUY', color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.35)', glow: '0 0 10px 1px rgba(74,222,128,0.25)' }
            : totalScore >= 8
            ? { label: 'BUY', color: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.25)', glow: '0 0 10px 1px rgba(74,222,128,0.25)' }
            : totalScore >= 4
            ? { label: 'HOLD', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.25)', glow: '0 0 10px 1px rgba(96,165,250,0.25)' }
            : totalScore >= 1
            ? { label: 'SELL', color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', glow: '0 0 10px 1px rgba(248,113,113,0.25)' }
            : { label: 'STRONG SELL', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.35)', glow: '0 0 10px 1px rgba(248,113,113,0.25)' }

          return (
            <div>
              <SectionTitle>Institutional &amp; Insider</SectionTitle>
              <div style={{ ...glassCard, padding: '0', overflow: 'hidden' }}>
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
                    boxShadow: sentiment.glow,
                  }}>{sentiment.label} ({totalScore})</span>
                  {signals.map((s, i) => (
                    <span key={i} style={{
                      fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                      color: s.positive ? '#4ade80' : '#f87171',
                      background: s.positive ? 'rgba(74,222,128,0.10)' : 'rgba(248,113,113,0.10)',
                      border: `1px solid ${s.positive ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
                      borderRadius: 3, padding: '2px 7px', whiteSpace: 'nowrap',
                      boxShadow: s.positive ? '0 0 8px 1px rgba(74,222,128,0.2)' : '0 0 8px 1px rgba(248,113,113,0.2)',
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
                      fontSize: 12, color: '#5a6475', fontFamily: "'JetBrains Mono', monospace",
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
                          fontSize: 12, color: '#5a6475', fontFamily: "'JetBrains Mono', monospace",
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
                          fontSize: 12, color: '#5a6475', fontFamily: "'JetBrains Mono', monospace",
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

        {/* Conviction Score */}
        {convictionScore != null && (() => {
          const scoreColor = convictionScore >= 70 ? '#4ade80' : convictionScore >= 40 ? '#f59e0b' : '#f87171'
          const scoreBg = convictionScore >= 70 ? 'rgba(74,222,128,0.07)' : convictionScore >= 40 ? 'rgba(245,158,11,0.07)' : 'rgba(248,113,113,0.07)'
          const tier = convictionScore >= 80 ? 'STRONG' : convictionScore >= 60 ? 'MODERATE' : convictionScore >= 40 ? 'CAUTIOUS' : 'WEAK'
          // SVG arc gauge values
          const R = 42, cx = 60, cy = 58
          const startAngle = 200, endAngle = 340 // 140° sweep
          const toRad = (d: number) => (d * Math.PI) / 180
          const arcX = (angle: number) => cx + R * Math.cos(toRad(angle))
          const arcY = (angle: number) => cy + R * Math.sin(toRad(angle))
          const totalSweep = (endAngle - startAngle + 360) % 360 || 360
          const filled = (convictionScore / 100) * totalSweep
          const filledEnd = startAngle + filled
          const largeArcBg = totalSweep > 180 ? 1 : 0
          const largeArcFg = filled > 180 ? 1 : 0

          return (
            <div>
              <SectionTitle>Conviction</SectionTitle>
              <div style={{
                ...glassCard, padding: '0', overflow: 'hidden',
                height: 'calc(100% - 38px)', boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column',
              }}>
                {/* Gauge + tier */}
                <div style={{
                  background: scoreBg, borderBottom: '1px solid #1a1a1a',
                  padding: '16px 20px',
                  display: 'flex', alignItems: 'center', gap: 16,
                }}>
                  {/* Arc gauge */}
                  <svg width="120" height="72" viewBox="0 0 120 72" style={{ flexShrink: 0 }}>
                    <defs>
                      <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f87171" />
                        <stop offset="40%" stopColor="#fb923c" />
                        <stop offset="65%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#4ade80" />
                      </linearGradient>
                    </defs>
                    {/* Track */}
                    <path
                      d={`M ${arcX(startAngle)} ${arcY(startAngle)} A ${R} ${R} 0 ${largeArcBg} 1 ${arcX(endAngle)} ${arcY(endAngle)}`}
                      fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" strokeLinecap="round"
                    />
                    {/* Fill */}
                    <path
                      d={`M ${arcX(startAngle)} ${arcY(startAngle)} A ${R} ${R} 0 ${largeArcFg} 1 ${arcX(filledEnd)} ${arcY(filledEnd)}`}
                      fill="none" stroke="url(#arcGrad)" strokeWidth="6" strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 4px ${scoreColor}66)` }}
                    />
                    {/* Score label */}
                    <text x={cx} y={cy - 4} textAnchor="middle" fill={scoreColor}
                      fontSize="22" fontWeight="700" fontFamily="JetBrains Mono, monospace">{convictionScore}</text>
                    <text x={cx} y={cy + 12} textAnchor="middle" fill="#5a6475"
                      fontSize="8" fontFamily="JetBrains Mono, monospace" letterSpacing="1">/100</text>
                  </svg>
                  {/* Tier info */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 3, marginBottom: 8,
                      background: `rgba(${convictionScore >= 70 ? '74,222,128' : convictionScore >= 40 ? '245,158,11' : '248,113,113'},0.12)`,
                      border: `1px solid ${scoreColor}44`,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>{tier} SIGNAL</span>
                    </div>
                    {/* Segmented bar */}
                    <div style={{ display: 'flex', gap: 2 }}>
                      {Array.from({ length: 10 }).map((_, i) => {
                        const segColor = i < 3 ? '#f87171' : i < 5 ? '#fb923c' : i < 7 ? '#f59e0b' : '#4ade80'
                        const lit = i < Math.round(convictionScore / 10)
                        return (
                          <div key={i} style={{
                            flex: 1, height: 4, borderRadius: 1,
                            background: lit ? segColor : 'rgba(255,255,255,0.06)',
                            transition: 'background 0.3s ease',
                          }} />
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 8, color: '#333', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>WEAK</span>
                      <span style={{ fontSize: 8, color: '#333', fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>STRONG</span>
                    </div>
                  </div>
                </div>
                {/* Analysis */}
                {convictionDrivers && (
                  <div style={{ padding: '14px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: '#5a6475',
                        fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.15em', textTransform: 'uppercase',
                      }}>Sanctum Analysis</span>
                      <div style={{ flex: 1, height: 1, background: '#1a1a1a' }} />
                    </div>
                    <p style={{
                      fontSize: 11, color: '#8b95a5', lineHeight: 1.75,
                      fontFamily: "'JetBrains Mono', monospace", margin: 0,
                      borderLeft: `2px solid ${scoreColor}44`, paddingLeft: 10,
                    }}>{convictionDrivers}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
        </div>
      </div>

      {/* ── Right Column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: isDesktop ? 12 : 24, ...(isDesktop ? { alignSelf: 'start' } : {}) }}>

      {/* Revenue by Segment */}
      {overview.segmentBreakdown?.length > 0 && (
        <div>
          <SectionTitle>Revenue by Segment</SectionTitle>
          <div style={{ ...glassCard, padding: '28px 20px 20px', overflow: 'hidden' }}>
            {/* Stacked horizontal bar */}
            <div style={{ display: 'flex', height: 44, borderRadius: 6, overflow: 'hidden' }}>
              {overview.segmentBreakdown.map((seg, i) => (
                <div
                  key={i}
                  style={{
                    width: `${seg.percentage}%`,
                    background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    transition: 'filter 0.15s',
                  }}
                  title={`${seg.name}: ${seg.percentage}%`}
                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.25)')}
                  onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                >
                  <span style={{
                    fontSize: seg.percentage >= 8 ? 13 : 10,
                    fontWeight: 700,
                    color: '#fff',
                    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                    fontFamily: "'JetBrains Mono', monospace",
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}>
                    {seg.percentage}%
                  </span>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div style={{ marginTop: 28 }}>
              {overview.segmentBreakdown.map((seg, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                  borderBottom: i < overview.segmentBreakdown.length - 1 ? '1px solid #111' : 'none',
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                  <span style={{ flex: 1, fontSize: 14, color: '#b8c4d4', fontFamily: "'JetBrains Mono', monospace" }}>{seg.name}</span>
                  <span style={{ fontSize: 14, color: '#e8ecf1', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{seg.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Competitive Moat */}
      {overview.moatScores?.length > 0 && (() => {
        const hasSector = overview.sectorMoatScores?.length > 0
        const mergedMoatData = overview.moatScores.map((m, i) => ({
          metric: m.metric,
          score: m.score,
          ...(hasSector && overview.sectorMoatScores[i] ? { sectorScore: overview.sectorMoatScores[i].score } : {}),
        }))
        return (
          <div>
            <SectionTitle>Competitive Moat</SectionTitle>
            <div style={{ ...glassCard, padding: '20px 20px 10px 20px', overflow: 'hidden' }}>
              <ResponsiveContainer width="100%" height={isDesktop ? 420 : 320}>
                <RadarChart data={mergedMoatData} cx="50%" cy="50%" outerRadius="75%">
                  <PolarGrid stroke="rgba(255,255,255,0.06)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: '#5a6475', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }} />
                  {hasSector && <Radar dataKey="sectorScore" stroke="#a78bfa" fill="rgba(167,139,250,0.18)" strokeWidth={1.5} strokeDasharray="4 3" isAnimationActive={false} style={{ filter: 'url(#fGlow)' }} />}
                  <Radar dataKey="score" stroke="#60a5fa" fill="rgba(96,165,250,0.22)" strokeWidth={2} dot={{ r: 4, fill: '#60a5fa', strokeWidth: 0 }} isAnimationActive={false} style={{ filter: 'url(#fGlow)' }} />
                  <Tooltip content={<CTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>● Company</span>
                {hasSector && <span style={{ fontSize: 13, color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace" }}>- - Sector Avg</span>}
              </div>
            </div>
          </div>
        )
      })()}


      </div>
    </div>
  )
}
