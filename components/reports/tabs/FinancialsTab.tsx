'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  LineChart, ResponsiveContainer, Tooltip, Sankey, Layer, Rectangle,
} from 'recharts'
import { SectionTitle, CTooltip, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

function trend(values: number[]): { symbol: string; color: string } | null {
  if (values.length < 2) return null
  const first = values[0]
  const last = values[values.length - 1]
  const pctChange = first !== 0 ? (last - first) / Math.abs(first) : last > 0 ? 1 : last < 0 ? -1 : 0
  if (Math.abs(pctChange) < 0.03) return { symbol: '(-)', color: '#5a6475' }
  return pctChange > 0 ? { symbol: '(↑)', color: '#4ade80' } : { symbol: '(↓)', color: '#f87171' }
}

function TrendArrow({ values, invert }: { values: number[]; invert?: boolean }) {
  const t = trend(values)
  if (!t) return null
  const color = t.symbol === '(-)' ? t.color
    : invert ? (t.symbol === '(↑)' ? '#f87171' : '#4ade80')
    : t.color
  return <span style={{ color, marginLeft: 3 }}>{t.symbol}</span>
}

function fmtVal(v: number): string {
  if (Math.abs(v) < 1) return `$${(v * 1000).toFixed(0)}M`
  return `$${v.toFixed(1)}B`
}

const SANKEY_COLORS: Record<string, string> = {
  Revenue: '#60a5fa',
  'Cost of Revenue': '#f87171',
  'Gross Profit': '#4ade80',
  'Operating Expenses': '#fb923c',
  'Operating Income': '#2dd4bf',
  'Taxes & Interest': '#fbbf24',
  'Net Income': '#34d399',
}

function buildSankeyData(sd: NonNullable<StockReport['financials']['sankeyData']>) {
  const totalOpex = sd.rnd + sd.sga + sd.otherOpex
  const totalTax = sd.interestExpense + sd.taxExpense + sd.otherNonOp

  // Order: results on top, costs on bottom within each column to prevent link crossings
  const nodes = [
    { name: 'Revenue' },            // 0 — col 0
    { name: 'Gross Profit' },       // 1 — col 1 top
    { name: 'Cost of Revenue' },    // 2 — col 1 bottom
    { name: 'Operating Income' },   // 3 — col 2 top
    { name: 'Operating Expenses' }, // 4 — col 2 bottom
    { name: 'Net Income' },         // 5 — col 3 top
    { name: 'Taxes & Interest' },   // 6 — col 3 bottom
  ]

  const links = [
    { source: 0, target: 1, value: sd.grossProfit },          // Revenue → Gross Profit (top)
    { source: 0, target: 2, value: sd.cogs },                 // Revenue → COGS (bottom)
    { source: 1, target: 3, value: sd.operatingIncome },      // GP → Op Income (top)
    { source: 1, target: 4, value: totalOpex },               // GP → OpEx (bottom)
    { source: 3, target: 5, value: sd.netIncome },            // Op Income → Net Income (top)
    { source: 3, target: 6, value: totalTax },                // Op Income → Taxes (bottom)
  ].filter(l => l.value > 0)

  return { nodes, links }
}

function SankeyNode({ x, y, width, height, payload }: any) {
  if (!payload || height < 1) return null
  const color = SANKEY_COLORS[payload.name] || '#60a5fa'
  const isTerminal = !payload.sourceLinks || payload.sourceLinks.length === 0
  const labelX = isTerminal ? x - 8 : x + width + 8
  const anchor = isTerminal ? 'end' : 'start'
  const margin = payload.name !== 'Revenue' && payload.name !== 'Cost of Revenue'
    && payload.name !== 'Operating Expenses' && payload.name !== 'Taxes & Interest'
    && payload.value && payload.sourceLinks?.length === 0
    ? null : null

  return (
    <Layer>
      <Rectangle
        x={x} y={y} width={width} height={height}
        fill={color} fillOpacity={0.85} radius={[3, 3, 3, 3]}
      />
      {height > 8 && (
        <>
          <text
            x={labelX} y={y + height / 2 - (height > 30 ? 7 : 0)}
            textAnchor={anchor} dominantBaseline={height > 30 ? 'auto' : 'central'}
            fill="#c8d0dc" fontSize={11}
            fontFamily="'JetBrains Mono', monospace" fontWeight={600}
          >
            {payload.name}
          </text>
          {height > 30 && (
            <text
              x={labelX} y={y + height / 2 + 9}
              textAnchor={anchor} dominantBaseline="auto"
              fill="#5a6475" fontSize={10}
              fontFamily="'JetBrains Mono', monospace"
            >
              {fmtVal(payload.value ?? 0)}
            </text>
          )}
        </>
      )}
    </Layer>
  )
}

function SankeyLink({
  sourceX, sourceY, sourceControlX,
  targetX, targetY, targetControlX,
  linkWidth, payload,
}: any) {
  const color = SANKEY_COLORS[payload?.target?.name] || SANKEY_COLORS[payload?.source?.name] || '#60a5fa'
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, linkWidth)}
      strokeOpacity={0.18}
    />
  )
}

export default function FinancialsTab({ financials }: { financials: StockReport['financials'] }) {
  const data = financials.annualData || []

  const summary = financials.financialSummary
  const summarySections = summary ? [
    { label: 'Revenue & Growth Overview', text: summary.revenueGrowth },
    { label: 'Profitability & Margins', text: summary.profitabilityMargins },
    { label: 'Financial Health & Stability', text: summary.financialHealth },
  ].filter(s => s.text) : []

  return (
    <div>
      {(() => {
        const cagrItems = financials.cagrs ? [
          { label: 'Revenue', five: financials.cagrs.revenue.fiveYear, ten: financials.cagrs.revenue.tenYear },
          { label: 'Net Income', five: financials.cagrs.netIncome.fiveYear, ten: financials.cagrs.netIncome.tenYear },
          { label: 'EPS', five: financials.cagrs.eps.fiveYear, ten: financials.cagrs.eps.tenYear },
        ].filter(c => c.five && c.five !== 'N/A') : []

        const divMetrics = financials.dividendData ? [
          { label: 'Yield', value: financials.dividendData.currentYield },
          { label: 'Payout Ratio', value: financials.dividendData.payoutRatio },
          { label: '5yr CAGR', value: financials.dividendData.fiveYearCagr },
          ...(financials.dividendData.tenYearCagr ? [{ label: '10yr CAGR', value: financials.dividendData.tenYearCagr }] : []),
          ...(financials.dividendData.consecutiveYearsGrowth != null ? [{ label: 'Consec. Yrs Growth', value: String(financials.dividendData.consecutiveYearsGrowth) }] : []),
        ].filter(m => m.value && m.value !== 'N/A') : []

        const hasPanel = cagrItems.length > 0 || divMetrics.length > 0 || financials.callout

        const labelStyle = {
          fontSize: 10, fontWeight: 700 as const, color: '#5a6475',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.15em', textTransform: 'uppercase' as const,
          marginBottom: 10,
        }

        const rowStyle = {
          display: 'flex', justifyContent: 'space-between' as const, alignItems: 'baseline' as const,
          padding: '6px 0',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }

        return (
          <div style={{
            display: 'grid',
            gridTemplateColumns: hasPanel && summarySections.length > 0 ? '1fr 340px' : '1fr',
            gap: 24,
            marginBottom: 32,
          }}>
            {summarySections.length > 0 && (
              <div>
                <SectionTitle>Financial Summary</SectionTitle>
                {summarySections.map((s, i) => (
                  <div key={i} style={{ marginBottom: i < summarySections.length - 1 ? 16 : 0 }}>
                    <div style={labelStyle}>{s.label}</div>
                    <p style={{
                      fontSize: 13, color: '#b8c4d4', lineHeight: 1.8,
                      fontFamily: "'JetBrains Mono', monospace", margin: 0,
                    }}>{s.text}</p>
                  </div>
                ))}
              </div>
            )}

            {hasPanel && (
              <div style={{ ...glassCard, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                {cagrItems.length > 0 && (
                  <div style={{ marginBottom: divMetrics.length > 0 || financials.callout ? 18 : 0 }}>
                    <div style={labelStyle}>Growth Rates (5yr CAGR)</div>
                    {cagrItems.map((c, i) => (
                      <div key={i} style={{ ...rowStyle, ...(i === cagrItems.length - 1 && !divMetrics.length && !financials.callout ? { borderBottom: 'none' } : {}) }}>
                        <span style={{ fontSize: 11, color: '#8b95a5', fontFamily: "'JetBrains Mono', monospace" }}>{c.label}</span>
                        <div>
                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            fontFamily: "'JetBrains Mono', monospace",
                            color: c.five?.startsWith('+') ? '#4ade80' : c.five?.startsWith('-') ? '#f87171' : '#e8ecf1',
                          }}>{c.five}</span>
                          {c.ten && c.ten !== 'N/A' && (
                            <span style={{
                              fontSize: 10, color: '#5a6475', marginLeft: 8,
                              fontFamily: "'JetBrains Mono', monospace",
                            }}>10yr {c.ten}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {divMetrics.length > 0 && (
                  <div style={{ marginBottom: financials.callout ? 18 : 0 }}>
                    <div style={labelStyle}>Dividend</div>
                    {divMetrics.map((m, i) => (
                      <div key={i} style={{ ...rowStyle, ...(i === divMetrics.length - 1 && !financials.callout ? { borderBottom: 'none' } : {}) }}>
                        <span style={{ fontSize: 11, color: '#8b95a5', fontFamily: "'JetBrains Mono', monospace" }}>{m.label}</span>
                        <span style={{
                          fontSize: 13, fontWeight: 700, color: '#e8ecf1',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>{m.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {financials.callout && (
                  <div style={{
                    borderTop: cagrItems.length > 0 || divMetrics.length > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    paddingTop: cagrItems.length > 0 || divMetrics.length > 0 ? 14 : 0,
                  }}>
                    <div style={{ ...labelStyle, color: '#fbbf24', marginBottom: 8 }}>Key Insight</div>
                    <p style={{
                      fontSize: 12, color: '#8b95a5', lineHeight: 1.7,
                      fontFamily: "'JetBrains Mono', monospace", margin: 0,
                    }}>{financials.callout}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 20,
        marginBottom: 32,
      }}>
        {financials.revenueVsCogs?.length > 0 && (
          <div>
            <SectionTitle>Revenue vs Cost of Revenue</SectionTitle>
            <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={financials.revenueVsCogs}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#5a6475', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}B`} />
                  <Tooltip content={<CTooltip />} />
                  <Bar dataKey="revenue" name="Revenue ($B)" fill="rgba(96,165,250,0.42)" radius={[5, 5, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                  <Bar dataKey="cogs" name="COGS ($B)" fill="rgba(248,113,113,0.38)" radius={[5, 5, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                  <Bar dataKey="grossProfit" name="Gross Profit ($B)" fill="rgba(74,222,128,0.40)" radius={[5, 5, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                  <Line type="monotone" dataKey="grossProfit" name="Gross Profit Trend" stroke="#e8ecf1" strokeWidth={2} dot={{ fill: '#e8ecf1', r: 3.5, strokeWidth: 0 }} style={{ filter: 'url(#fGlow)' }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: '#60a5fa' }}>&#9632; Revenue <TrendArrow values={financials.revenueVsCogs!.map(d => d.revenue)} /></span>
                <span style={{ fontSize: 10, color: '#f87171' }}>&#9632; COGS <TrendArrow values={financials.revenueVsCogs!.map(d => d.cogs)} /></span>
                <span style={{ fontSize: 10, color: '#4ade80' }}>&#9632; Gross Profit <TrendArrow values={financials.revenueVsCogs!.map(d => d.grossProfit)} /></span>
                <span style={{ fontSize: 10, color: '#e8ecf1' }}>&#9679; Trend</span>
              </div>
            </div>
          </div>
        )}

        {financials.marginTrends?.length > 0 && (
          <div>
            <SectionTitle>Margin Trends</SectionTitle>
            <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={financials.marginTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#5a6475', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                  <Tooltip content={<CTooltip />} />
                  <Line type="monotone" dataKey="gross" name="Gross Margin %" stroke="#4ade80" strokeWidth={2} dot={{ fill: '#4ade80', r: 3, strokeWidth: 0 }} style={{ filter: 'url(#fGlow)' }} />
                  <Line type="monotone" dataKey="operating" name="Operating Margin %" stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 3, strokeWidth: 0 }} style={{ filter: 'url(#fGlow)' }} />
                  <Line type="monotone" dataKey="net" name="Net Margin %" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3, strokeWidth: 0 }} style={{ filter: 'url(#fGlow)' }} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingBottom: 6 }}>
                <span style={{ fontSize: 10, color: '#4ade80' }}>&#9679; Gross <TrendArrow values={financials.marginTrends!.map(d => d.gross)} /></span>
                <span style={{ fontSize: 10, color: '#60a5fa' }}>&#9679; Operating <TrendArrow values={financials.marginTrends!.map(d => d.operating)} /></span>
                <span style={{ fontSize: 10, color: '#a78bfa' }}>&#9679; Net <TrendArrow values={financials.marginTrends!.map(d => d.net)} /></span>
              </div>
            </div>
          </div>
        )}

        {data.length > 0 && (
          <div>
            <SectionTitle>Revenue &amp; EPS</SectionTitle>
            <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="year"
                    tick={{ fill: '#5a6475', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    yAxisId="revenue"
                    tick={{ fill: '#5a6475', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => `$${v}B`}
                  />
                  <YAxis
                    yAxisId="eps"
                    orientation="right"
                    tick={{ fill: '#5a6475', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <Tooltip content={<CTooltip />} />
                  <Bar yAxisId="revenue" dataKey="revenue" name="Revenue ($B)" fill="rgba(96,165,250,0.65)" radius={[5, 5, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                  <Line yAxisId="eps" type="monotone" dataKey="adjEPS" name="Adj EPS" stroke="#4ade80" strokeWidth={2.5} dot={{ fill: '#4ade80', r: 4, strokeWidth: 0 }} style={{ filter: 'url(#fGlow)' }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingBottom: 6 }}>
                <span style={{ fontSize: 10, color: '#60a5fa' }}>&#9632; Revenue <TrendArrow values={data.map(d => d.revenue)} /></span>
                <span style={{ fontSize: 10, color: '#4ade80' }}>&#9679; Adj EPS <TrendArrow values={data.map(d => d.adjEPS)} /></span>
              </div>
            </div>
          </div>
        )}

        {financials.dividendData && financials.dividendData.fcfVsDividends?.length > 0 ? (
          <div>
            <SectionTitle>Dividend — FCF vs Paid</SectionTitle>
            <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={financials.dividendData.fcfVsDividends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#5a6475', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}B`} />
                  <Tooltip content={<CTooltip />} />
                  <Bar dataKey="fcf" name="Free Cash Flow ($B)" fill="rgba(74,222,128,0.62)" radius={[4, 4, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                  <Bar dataKey="dividendsPaid" name="Dividends Paid ($B)" fill="rgba(248,113,113,0.62)" radius={[4, 4, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingBottom: 6 }}>
                <span style={{ fontSize: 10, color: '#4ade80' }}>&#9632; Free Cash Flow <TrendArrow values={financials.dividendData!.fcfVsDividends!.map(d => d.fcf)} /></span>
                <span style={{ fontSize: 10, color: '#f87171' }}>&#9632; Dividends Paid <TrendArrow values={financials.dividendData!.fcfVsDividends!.map(d => d.dividendsPaid)} /></span>
              </div>
            </div>
          </div>
        ) : financials.fcfHistory?.length > 0 ? (
          <div>
            <SectionTitle>Free Cash Flow</SectionTitle>
            <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={financials.fcfHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#5a6475', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}B`} />
                  <Tooltip content={<CTooltip />} />
                  <Bar dataKey="fcf" name="FCF ($B)" fill="rgba(74,222,128,0.62)" radius={[4, 4, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingBottom: 6 }}>
                <span style={{ fontSize: 10, color: '#4ade80' }}>&#9632; Free Cash Flow <TrendArrow values={financials.fcfHistory!.map(d => d.fcf)} /></span>
              </div>
            </div>
          </div>
        ) : null}

        {financials.sharesOutstanding?.length > 0 && (() => {
          const maxShares = Math.max(...financials.sharesOutstanding.map(s => s.shares))
          const isSubBillion = maxShares < 1
          return (
            <div>
              <SectionTitle>Shares Outstanding</SectionTitle>
              <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={isSubBillion
                    ? financials.sharesOutstanding.map(s => ({ ...s, sharesM: Math.round(s.shares * 1000) }))
                    : financials.sharesOutstanding
                  }>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fill: '#5a6475', fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={isSubBillion
                        ? (v: number) => `${v.toFixed(0)}M`
                        : (v: number) => `${v.toFixed(1)}B`
                      }
                      {...(isSubBillion ? { domain: [0, (dm: number) => Math.ceil(dm / 100) * 100], ticks: Array.from({ length: Math.ceil(maxShares * 1000 / 100) + 1 }, (_, i) => i * 100) } : {})}
                    />
                    <Tooltip content={<CTooltip />} />
                    <Bar
                      dataKey={isSubBillion ? 'sharesM' : 'shares'}
                      name={isSubBillion ? 'Shares (M)' : 'Shares (B)'}
                      fill="rgba(167,139,250,0.62)"
                      radius={[4, 4, 0, 0]}
                      style={{ filter: 'url(#fGlowBar)' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingBottom: 6 }}>
                  <span style={{ fontSize: 10, color: '#a78bfa' }}>&#9632; Diluted Shares <TrendArrow values={financials.sharesOutstanding!.map(d => d.shares)} invert /></span>
                </div>
              </div>
            </div>
          )
        })()}

        {financials.debtToEquity?.length > 0 && (
          <div>
            <SectionTitle>Debt-to-Equity Ratio</SectionTitle>
            <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={financials.debtToEquity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#5a6475', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(1)}x`} />
                  <Tooltip content={<CTooltip />} />
                  <Bar dataKey="ratio" name="D/E Ratio" fill="rgba(251,191,36,0.62)" radius={[4, 4, 0, 0]} style={{ filter: 'url(#fGlowBar)' }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingBottom: 6 }}>
                <span style={{ fontSize: 10, color: '#fbbf24' }}>&#9632; Debt / Equity <TrendArrow values={financials.debtToEquity!.map(d => d.ratio)} invert /></span>
              </div>
            </div>
          </div>
        )}
      </div>

      {financials.sankeyData && (() => {
        const sankeyChart = buildSankeyData(financials.sankeyData)
        if (sankeyChart.links.length === 0) return null
        return (
          <div>
            <SectionTitle>Income Statement ({financials.sankeyData.year})</SectionTitle>
            <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
              <ResponsiveContainer width="100%" height={340}>
                <Sankey
                  data={sankeyChart}
                  node={<SankeyNode />}
                  link={<SankeyLink />}
                  nodePadding={40}
                  nodeWidth={10}
                  linkCurvature={0.4}
                  margin={{ top: 12, right: 150, bottom: 12, left: 12 }}
                  sort={false}
                >
                  <Tooltip
                    content={({ payload }: any) => {
                      if (!payload?.length) return null
                      const item = payload[0]?.payload
                      if (!item) return null
                      const isLink = item.source && item.target
                      return (
                        <div style={{
                          background: 'rgba(12,16,24,0.95)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 8, padding: '8px 14px',
                          fontFamily: "'JetBrains Mono', monospace",
                          backdropFilter: 'blur(12px)',
                        }}>
                          <div style={{ fontSize: 11, color: '#b8c4d4', marginBottom: 3 }}>
                            {isLink ? `${item.source.name} → ${item.target.name}` : item.name}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#e8ecf1' }}>
                            {fmtVal(item.value ?? 0)}
                          </div>
                        </div>
                      )
                    }}
                  />
                </Sankey>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
