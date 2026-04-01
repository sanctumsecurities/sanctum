'use client'

import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Area,
} from 'recharts'

// ─── TYPES ───
interface FinancialData {
  name: string
  exchange: string
  sector: string
  industry: string
  price: number
  previousClose: number
  fiftyTwoWeekHigh: number
  fiftyTwoWeekLow: number
  marketCap: number
  pe: number
  forwardPe: number
  pegRatio: number
  beta: number
  dividendYield: number
  dividendPerShare: number
  epsTrailing: number
  evToEbitda: number
  operatingMargins: number
  profitMargins: number
  grossMargins: number
  returnOnEquity: number
  debtToEquity: number
  totalCash: number
  totalDebt: number
  freeCashflow: number
  sharesOutstanding: number
  website?: string
  revenue: { year: string; revenue: number; netIncome: number }[]
  eps: { year: string; eps: number }[]
}

interface AIData {
  overview: {
    sentiment: string
    highlights: { icon: string; text: string }[]
  }
  strategy: { title: string; description: string; tag: string }[]
  risks: { title: string; level: string; text: string }[]
  bull_case: string[]
  bear_case: string[]
}

interface ReportViewProps {
  data: FinancialData
  ai: AIData
  ticker: string
}

// ─── HELPERS ───
const fmtCap = (n: number) => {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

const fmtB = (n: number) => {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`

// ─── SHARED STYLES ───
const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  borderRadius: 18,
  border: '1px solid #1a1a1a',
  boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
}

const chartTooltipStyle: React.CSSProperties = {
  background: 'rgba(10,10,10,0.95)',
  border: '1px solid #1a1a1a',
  borderRadius: 12,
  fontSize: 12,
}

// ─── COMPANY LOGO ───
const CompanyLogo = ({ ticker, website, name }: { ticker: string; website?: string; name: string }) => {
  const [imgError, setImgError] = useState(false)
  const domain = website ? website.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null
  const logoUrl = domain ? `https://logo.clearbit.com/${domain}` : null

  if (logoUrl && !imgError) {
    return (
      <div style={{
        width: 54, height: 54, borderRadius: 15, overflow: 'hidden',
        background: '#ffffff', flexShrink: 0,
        boxShadow: '0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3)',
      }}>
        <img
          src={logoUrl} alt={name} width={54} height={54}
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 7 }}
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  return (
    <div style={{
      width: 54, height: 54, borderRadius: 15, flexShrink: 0,
      background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(15,15,18,0.7) 100%)',
      border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 24, fontWeight: 700, color: '#e8ecf1',
      fontFamily: "'Instrument Serif', serif",
    }}>
      {(name.charAt(0) || ticker.charAt(0)).toUpperCase()}
    </div>
  )
}

// ─── KPI CARD ───
const KPI = ({ label, value, sub, color, children }: {
  label: string; value: string; sub?: string; color?: string; children?: React.ReactNode
}) => (
  <div style={{ ...glassCard, padding: '18px 16px', minWidth: 0 }}>
    <div style={{
      fontSize: 10, letterSpacing: 1.4, color: '#5a6475',
      textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 8,
    }}>{label}</div>
    <div style={{
      fontSize: 22, fontWeight: 700, color: color || '#e8ecf1',
      fontFamily: "'Instrument Serif', serif", lineHeight: 1.1,
    }}>{value}</div>
    {sub && (
      <div style={{
        fontSize: 11, marginTop: 5, fontFamily: "'DM Sans', sans-serif",
        color: sub.startsWith('+') || sub.startsWith('Strong') || sub.startsWith('Bull') ? '#4ade80'
          : sub.startsWith('-') || sub.startsWith('Bear') ? '#f87171'
          : '#5a6475',
      }}>{sub}</div>
    )}
    {children}
  </div>
)

// ─── SECTION HEADER ───
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 36 }}>
    <h2 style={{
      fontSize: 17, fontWeight: 700, color: '#e8ecf1',
      fontFamily: "'Instrument Serif', serif",
      marginBottom: 14, paddingBottom: 10,
      borderBottom: '1px solid #1a1a1a',
    }}>{title}</h2>
    {children}
  </div>
)

// ─── BADGE PILL ───
const Badge = ({ text, variant }: { text: string; variant?: string }) => {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    green: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.22)' },
    red: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.22)' },
    blue: { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: 'rgba(96,165,250,0.22)' },
    gray: { bg: 'rgba(255,255,255,0.06)', color: '#8b95a5', border: 'rgba(255,255,255,0.1)' },
  }
  const c = colors[variant || 'gray'] || colors.gray
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

// ─── METRIC ROW ───
const MetricRow = ({ label, value, highlight }: { label: string; value: string; highlight?: string }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
  }}>
    <span style={{ color: '#5a6475', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
    <span style={{
      color: highlight === 'green' ? '#4ade80' : highlight === 'red' ? '#f87171' : '#e8ecf1',
      fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
    }}>{value}</span>
  </div>
)

// ─── COLLAPSIBLE RISK ───
const Collapsible = ({ title, level, color, text }: {
  title: string; level: string; color: string; text: string
}) => {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ ...glassCard, marginBottom: 8, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 14, fontWeight: 700, color: '#e8ecf1',
          fontFamily: "'Instrument Serif', serif", flex: 1, marginRight: 12,
        }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Badge text={level} variant={color} />
          <span style={{
            color: '#444', fontSize: 13, transition: 'transform 0.3s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block',
          }}>▾</span>
        </div>
      </div>
      <div style={{ maxHeight: open ? 300 : 0, overflow: 'hidden', transition: 'max-height 0.35s ease' }}>
        <p style={{
          fontSize: 12, color: '#8b95a5', margin: 0,
          lineHeight: 1.7, padding: '0 16px 14px',
        }}>{text}</p>
      </div>
    </div>
  )
}

// ─── MAIN ───
const tabs = ['Overview', 'Financials', 'Valuation', 'Strategy', 'Risks']

export default function ReportView({ data, ai, ticker }: ReportViewProps) {
  const [activeTab, setActiveTab] = useState('Overview')
  const [animating, setAnimating] = useState(false)

  const switchTab = (t: string) => {
    if (t === activeTab) return
    setAnimating(true)
    setTimeout(() => {
      setActiveTab(t)
      setTimeout(() => setAnimating(false), 30)
    }, 150)
  }

  const dailyChange = data.previousClose > 0
    ? ((data.price - data.previousClose) / data.previousClose) * 100
    : null
  const dailyDollar = data.previousClose > 0
    ? data.price - data.previousClose
    : null

  const riskColor = (level: string) => {
    if (level.includes('HIGH')) return 'red'
    if (level === 'MEDIUM') return 'blue'
    if (level.includes('LOW')) return 'gray'
    return 'blue'
  }

  const marginData = [
    { label: 'Gross Margin', val: data.grossMargins * 100, display: fmtPct(data.grossMargins) },
    { label: 'Operating Margin', val: data.operatingMargins * 100, display: fmtPct(data.operatingMargins) },
    { label: 'Net Margin', val: data.profitMargins * 100, display: fmtPct(data.profitMargins) },
  ].filter(m => m.val > 0)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e8ecf1', fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{
        padding: '28px 64px 24px',
        background: '#0a0a0a',
        borderBottom: '1px solid #1a1a1a',
      }}>
        <div style={{ width: '100%' }}>

          {/* Company identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
            <CompanyLogo ticker={ticker} website={data.website} name={data.name} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 20, fontWeight: 700, color: '#ffffff',
                fontFamily: "'Instrument Serif', serif", lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{data.name}</div>
              <div style={{ fontSize: 11, color: '#4a5568', marginTop: 3, letterSpacing: 0.3 }}>
                {data.exchange}: {ticker}{data.sector ? ` · ${data.sector}` : ''}
              </div>
            </div>
          </div>

          {/* Price */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 44, fontWeight: 700, letterSpacing: '-0.02em',
              fontFamily: "'Instrument Serif', serif", color: '#ffffff', lineHeight: 1,
            }}>${data.price.toFixed(2)}</span>
            {dailyChange !== null && dailyDollar !== null && (
              <span style={{
                fontSize: 14, fontWeight: 600, paddingBottom: 5,
                color: dailyChange >= 0 ? '#4ade80' : '#f87171',
              }}>
                {dailyChange >= 0 ? '+' : ''}{dailyDollar.toFixed(2)}&nbsp;
                ({dailyChange >= 0 ? '+' : ''}{dailyChange.toFixed(2)}%)
              </span>
            )}
          </div>

        </div>
      </div>

      {/* ── PILL TABS ── */}
      <div style={{ borderBottom: '1px solid #1a1a1a', overflowX: 'auto' }}>
        <div style={{
          width: '100%',
          padding: '10px 64px', display: 'flex', gap: 6,
        }}>
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                padding: '8px 18px',
                borderRadius: 9999,
                fontSize: 13,
                fontWeight: activeTab === t ? 600 : 400,
                color: activeTab === t ? '#ffffff' : 'rgba(255,255,255,0.35)',
                background: activeTab === t
                  ? 'rgba(255,255,255,0.06)'
                  : 'transparent',
                border: activeTab === t
                  ? '1px solid #2a2a2a'
                  : '1px solid transparent',
                boxShadow: 'none',
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{
        width: '100%', padding: '28px 64px 72px',
        opacity: animating ? 0 : 1,
        transform: animating ? 'translateY(6px)' : 'translateY(0)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }}>

        {/* ── OVERVIEW ── */}
        {activeTab === 'Overview' && <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-7">
            <KPI label="Market Cap" value={fmtCap(data.marketCap)} sub={data.sector} />
            <KPI
              label="P/E Ratio"
              value={data.pe > 0 ? `${data.pe.toFixed(1)}x` : 'N/A'}
              sub={data.forwardPe > 0 ? `Fwd: ${data.forwardPe.toFixed(1)}x` : ''}
            />
            <KPI
              label="Sentiment"
              value={ai.overview.sentiment}
              color={
                ai.overview.sentiment === 'Bullish' ? '#4ade80'
                : ai.overview.sentiment === 'Bearish' ? '#f87171'
                : '#f59e0b'
              }
            />
            <KPI
              label="Beta"
              value={data.beta > 0 ? data.beta.toFixed(2) : 'N/A'}
              sub={data.beta < 1 ? 'Lower vol' : data.beta > 1 ? 'Higher vol' : 'Market avg'}
            />
            <KPI
              label="Div Yield"
              value={data.dividendYield > 0 ? fmtPct(data.dividendYield) : 'N/A'}
              sub={data.dividendPerShare > 0 ? `$${data.dividendPerShare.toFixed(2)}/yr` : 'No dividend'}
            />
            <KPI
              label="EPS (TTM)"
              value={data.epsTrailing !== 0 ? `$${data.epsTrailing.toFixed(2)}` : 'N/A'}
              sub={data.pegRatio > 0 ? `PEG: ${data.pegRatio.toFixed(2)}` : ''}
            />
          </div>

          <Section title="Investment Highlights">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(ai.overview.highlights || []).map((item, i) => (
                <div key={i} style={{
                  ...glassCard,
                  display: 'flex', gap: 13, padding: '14px 16px', alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1.4, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: 13, color: '#b8c4d4', lineHeight: 1.6 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="52-Week Range">
            <div style={{ ...glassCard, padding: '22px 20px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#5a6475', marginBottom: 3 }}>52w Low</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f87171' }}>${data.fiftyTwoWeekLow.toFixed(2)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#5a6475', marginBottom: 3 }}>Current</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#e8ecf1' }}>${data.price.toFixed(2)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#5a6475', marginBottom: 3 }}>52w High</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#4ade80' }}>${data.fiftyTwoWeekHigh.toFixed(2)}</div>
                </div>
              </div>
              <div style={{ position: 'relative', height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)' }}>
                {(() => {
                  const range = data.fiftyTwoWeekHigh - data.fiftyTwoWeekLow
                  const pct = range > 0 ? Math.min(100, Math.max(0, ((data.price - data.fiftyTwoWeekLow) / range) * 100)) : 50
                  return (
                    <>
                      <div style={{
                        position: 'absolute', left: 0, width: `${pct}%`, top: 0, height: 6,
                        background: 'linear-gradient(90deg, #f87171, #f59e0b, #4ade80)',
                        borderRadius: 99, opacity: 0.65,
                      }} />
                      <div style={{
                        position: 'absolute', left: `${pct}%`, top: -5,
                        width: 16, height: 16, borderRadius: 9999,
                        background: '#a0a8b4',
                        boxShadow: '0 0 12px rgba(160,168,180,0.45)',
                        transform: 'translateX(-50%)',
                        border: '2px solid rgba(255,255,255,0.2)',
                      }} />
                    </>
                  )
                })()}
              </div>
            </div>
          </Section>
        </>}

        {/* ── FINANCIALS ── */}
        {activeTab === 'Financials' && <>
          {data.revenue.length > 0 && (
            <Section title="Revenue & Net Income">
              <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.revenue} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: '#e8ecf1' }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="netIncome" name="Net Income" fill="#4ade80" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#3b82f6' }}>● Revenue</span>
                  <span style={{ fontSize: 11, color: '#4ade80' }}>● Net Income</span>
                </div>
              </div>
            </Section>
          )}

          {data.eps.length > 0 && (
            <Section title="EPS Growth">
              <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.eps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'EPS']} />
                    <Line type="monotone" dataKey="eps" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: '#f59e0b', r: 4, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          {data.revenue.length >= 2 && (
            <Section title="Revenue Trend">
              <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={data.revenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="rgba(59,130,246,0.08)" strokeWidth={2} name="Revenue ($B)" dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="netIncome" stroke="#4ade80" strokeWidth={2} name="Net Income ($B)" dot={{ r: 3, fill: '#4ade80', strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
                  <span style={{ fontSize: 11, color: '#3b82f6' }}>● Revenue</span>
                  <span style={{ fontSize: 11, color: '#4ade80' }}>● Net Income</span>
                </div>
              </div>
            </Section>
          )}

          <Section title="Key Financial Metrics">
            <div style={{ ...glassCard, padding: '4px 16px' }}>
              {data.revenue.length > 0 && (
                <MetricRow label="Latest Revenue" value={`$${data.revenue[data.revenue.length - 1].revenue}B`} />
              )}
              {data.revenue.length > 0 && (
                <MetricRow label="Latest Net Income" value={`$${data.revenue[data.revenue.length - 1].netIncome}B`} />
              )}
              <MetricRow label="EPS (TTM)" value={`$${data.epsTrailing.toFixed(2)}`} />
              {data.revenue.length >= 2 && (() => {
                const curr = data.revenue[data.revenue.length - 1].revenue
                const prev = data.revenue[data.revenue.length - 2].revenue
                const growth = prev > 0 ? ((curr - prev) / prev * 100).toFixed(1) : 'N/A'
                return (
                  <MetricRow
                    label="YoY Revenue Growth"
                    value={typeof growth === 'string' ? growth : `${Number(growth) >= 0 ? '+' : ''}${growth}%`}
                    highlight={Number(growth) >= 0 ? 'green' : 'red'}
                  />
                )
              })()}
              <MetricRow label="Free Cash Flow" value={fmtB(data.freeCashflow)} />
              <MetricRow label="Shares Outstanding" value={fmtB(data.sharesOutstanding).replace('$', '')} />
            </div>
          </Section>
        </>}

        {/* ── VALUATION ── */}
        {activeTab === 'Valuation' && <>
          <Section title="Valuation Multiples">
            <div style={{ ...glassCard, padding: '4px 16px' }}>
              <MetricRow label="Trailing P/E" value={data.pe > 0 ? `${data.pe.toFixed(1)}x` : 'N/A'} />
              <MetricRow label="Forward P/E" value={data.forwardPe > 0 ? `${data.forwardPe.toFixed(1)}x` : 'N/A'} />
              <MetricRow label="PEG Ratio" value={data.pegRatio > 0 ? data.pegRatio.toFixed(2) : 'N/A'} />
              <MetricRow label="EV/EBITDA" value={data.evToEbitda > 0 ? `${data.evToEbitda.toFixed(1)}x` : 'N/A'} />
              <MetricRow label="Beta" value={data.beta > 0 ? `${data.beta.toFixed(2)}` : 'N/A'} />
            </div>
          </Section>

          {marginData.length > 0 && (
            <Section title="Profitability">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {marginData.map((m, i) => (
                  <div key={i} style={{ ...glassCard, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: '#8b95a5' }}>{m.label}</span>
                      <span style={{
                        fontSize: 14, fontWeight: 700,
                        color: m.val > 20 ? '#4ade80' : m.val > 0 ? '#f59e0b' : '#f87171',
                      }}>{m.display}</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 99 }}>
                      <div style={{
                        height: 5, borderRadius: 99,
                        width: `${Math.min(m.val, 100)}%`,
                        background: 'linear-gradient(90deg, #3b82f6, #4ade80)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Returns & Capital Structure">
            <div style={{ ...glassCard, padding: '4px 16px' }}>
              <MetricRow label="Return on Equity (ROE)" value={data.returnOnEquity !== 0 ? fmtPct(data.returnOnEquity) : 'N/A'} highlight={data.returnOnEquity > 0.15 ? 'green' : undefined} />
              <MetricRow label="Free Cash Flow" value={fmtB(data.freeCashflow)} />
              <MetricRow label="Debt / Equity" value={data.debtToEquity > 0 ? `${data.debtToEquity.toFixed(1)}%` : 'N/A'} />
              <MetricRow label="Total Cash" value={fmtB(data.totalCash)} />
              <MetricRow label="Total Debt" value={fmtB(data.totalDebt)} />
            </div>
          </Section>
        </>}

        {/* ── STRATEGY ── */}
        {activeTab === 'Strategy' && <>
          <Section title="Strategic Catalysts">
            {(ai.strategy || []).map((item, i) => (
              <div key={i} style={{ ...glassCard, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', marginBottom: 8, gap: 10,
                }}>
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: '#e8ecf1',
                    fontFamily: "'Instrument Serif', serif", flex: 1,
                  }}>{item.title}</span>
                  <Badge text={item.tag} variant="blue" />
                </div>
                <p style={{ fontSize: 12, color: '#8b95a5', margin: 0, lineHeight: 1.65 }}>{item.description}</p>
              </div>
            ))}
          </Section>

          <Section title="Key Metrics">
            <div style={{ ...glassCard, padding: '4px 16px' }}>
              <MetricRow label="Market Cap" value={fmtCap(data.marketCap)} />
              <MetricRow label="P/E Ratio" value={data.pe > 0 ? `${data.pe.toFixed(1)}x` : 'N/A'} />
              <MetricRow label="Operating Margin" value={fmtPct(data.operatingMargins)} highlight={data.operatingMargins > 0.2 ? 'green' : undefined} />
              <MetricRow label="Free Cash Flow" value={fmtB(data.freeCashflow)} />
              <MetricRow label="Dividend Yield" value={data.dividendYield > 0 ? fmtPct(data.dividendYield) : 'N/A'} />
            </div>
          </Section>
        </>}

        {/* ── RISKS ── */}
        {activeTab === 'Risks' && <>
          <Section title="Risk Assessment">
            <p style={{ fontSize: 12, color: '#3a4050', marginBottom: 12, marginTop: -8 }}>Tap a card to expand</p>
            {(ai.risks || []).map((r, i) => (
              <Collapsible key={i} title={r.title} level={r.level} color={riskColor(r.level)} text={r.text} />
            ))}
          </Section>

          <Section title="Bull vs Bear">
            <div className="flex flex-col sm:flex-row gap-4">
              <div style={{
                flex: 1,
                background: 'linear-gradient(160deg, rgba(74,222,128,0.06) 0%, rgba(74,222,128,0.02) 100%)',
                borderRadius: 18, padding: '20px 18px',
                border: '1px solid rgba(74,222,128,0.12)',
                boxShadow: 'inset 0 1px 0 rgba(74,222,128,0.08)',
              }}>
                <div style={{
                  fontSize: 15, fontWeight: 700, color: '#4ade80',
                  marginBottom: 14, fontFamily: "'Instrument Serif', serif",
                }}>Bull Case</div>
                {(ai.bull_case || []).map((t, i) => (
                  <div key={i} style={{
                    fontSize: 12, color: '#b8c4d4', padding: '5px 0',
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}>
                    <span style={{ color: '#4ade80', flexShrink: 0, marginTop: 1, fontWeight: 700 }}>+</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
              <div style={{
                flex: 1,
                background: 'linear-gradient(160deg, rgba(248,113,113,0.06) 0%, rgba(248,113,113,0.02) 100%)',
                borderRadius: 18, padding: '20px 18px',
                border: '1px solid rgba(248,113,113,0.12)',
                boxShadow: 'inset 0 1px 0 rgba(248,113,113,0.08)',
              }}>
                <div style={{
                  fontSize: 15, fontWeight: 700, color: '#f87171',
                  marginBottom: 14, fontFamily: "'Instrument Serif', serif",
                }}>Bear Case</div>
                {(ai.bear_case || []).map((t, i) => (
                  <div key={i} style={{
                    fontSize: 12, color: '#b8c4d4', padding: '5px 0',
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}>
                    <span style={{ color: '#f87171', flexShrink: 0, marginTop: 1, fontWeight: 700 }}>−</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        </>}

      </div>
    </div>
  )
}
