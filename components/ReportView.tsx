'use client'

import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ComposedChart, Area, ReferenceLine,
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

// ─── COMPONENTS ───
const KPI = ({ label, value, sub, color, children }: {
  label: string; value: string; sub?: string; color?: string; children?: React.ReactNode
}) => (
  <div style={{
    padding: '20px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.06)', flex: 1, minWidth: 160,
  }}>
    <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#8b95a5', textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: color || '#e8ecf1', fontFamily: "'Instrument Serif', serif", lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: sub.startsWith('+') || sub.startsWith('Strong') || sub.startsWith('Bull') ? '#4ade80' : sub.startsWith('-') || sub.startsWith('Bear') ? '#f87171' : '#8b95a5', marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{sub}</div>}
    {children}
  </div>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 40 }}>
    <h2 style={{
      fontSize: 20, fontWeight: 700, color: '#e8ecf1', fontFamily: "'Instrument Serif', serif",
      marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>{title}</h2>
    {children}
  </div>
)

const Pill = ({ text, variant }: { text: string; variant?: string }) => {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    green: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.2)' },
    red: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.2)' },
    blue: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.2)' },
    gray: { bg: 'rgba(255,255,255,0.06)', color: '#8b95a5', border: 'rgba(255,255,255,0.1)' },
  }
  const c = colors[variant || 'gray'] || colors.gray
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.5,
    }}>{text}</span>
  )
}

const MetricRow = ({ label, value, highlight }: { label: string; value: string; highlight?: string }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
  }}>
    <span style={{ color: '#8b95a5', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
    <span style={{
      color: highlight === 'green' ? '#4ade80' : highlight === 'red' ? '#f87171' : '#e8ecf1',
      fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
    }}>{value}</span>
  </div>
)

const Collapsible = ({ title, level, color, text }: { title: string; level: string; color: string; text: string }) => {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      background: 'rgba(255,255,255,0.035)', borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.04)', marginBottom: 10, overflow: 'hidden',
    }}>
      <div onClick={() => setOpen(!open)} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px', cursor: 'pointer', userSelect: 'none',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#e8ecf1', fontFamily: "'Instrument Serif', serif" }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill text={level} variant={color} />
          <span style={{
            color: '#555', fontSize: 14, transition: 'transform 0.3s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block',
          }}>&#9662;</span>
        </div>
      </div>
      <div style={{
        maxHeight: open ? 300 : 0, overflow: 'hidden',
        transition: 'max-height 0.4s ease',
      }}>
        <p style={{ fontSize: 12, color: '#8b95a5', margin: 0, lineHeight: 1.7, padding: '0 16px 14px' }}>{text}</p>
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

  const cardBg = 'rgba(255,255,255,0.035)'
  const changeFromHigh = data.fiftyTwoWeekHigh > 0
    ? (((data.price - data.fiftyTwoWeekHigh) / data.fiftyTwoWeekHigh) * 100).toFixed(1)
    : null

  // Risk color mapping
  const riskColor = (level: string) => {
    if (level.includes('HIGH')) return 'red'
    if (level === 'MEDIUM') return 'blue'
    if (level.includes('LOW')) return 'gray'
    return 'blue'
  }

  // Margin data for profitability bars
  const marginData = [
    { label: 'Gross Margin', val: data.grossMargins * 100, display: fmtPct(data.grossMargins) },
    { label: 'Operating Margin', val: data.operatingMargins * 100, display: fmtPct(data.operatingMargins) },
    { label: 'Net Margin', val: data.profitMargins * 100, display: fmtPct(data.profitMargins) },
  ].filter(m => m.val > 0)

  return (
    <div style={{ minHeight: '100vh', background: '#000000', color: '#e8ecf1', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{
        padding: '32px 28px 20px',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: '#111111',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 700, color: '#3b82f6', fontFamily: "'Instrument Serif', serif",
            }}>
              {ticker.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Instrument Serif', serif", lineHeight: 1.1 }}>{data.name}</div>
              <div style={{ fontSize: 12, color: '#8b95a5', marginTop: 2 }}>{data.exchange}: {ticker} &middot; {data.sector}{data.industry ? ` / ${data.industry}` : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '16px 0 6px' }}>
            <span style={{ fontSize: 38, fontWeight: 700, fontFamily: "'Instrument Serif', serif" }}>${data.price.toFixed(2)}</span>
            {changeFromHigh && parseFloat(changeFromHigh) < 0 && (
              <span style={{ fontSize: 14, color: '#f87171', fontWeight: 600 }}>&#9660; {Math.abs(parseFloat(changeFromHigh))}% from 52w high</span>
            )}
            {changeFromHigh && parseFloat(changeFromHigh) >= 0 && (
              <span style={{ fontSize: 14, color: '#4ade80', fontWeight: 600 }}>At 52-week high</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#8b95a5' }}>
            52-week range: ${data.fiftyTwoWeekLow.toFixed(2)} &ndash; ${data.fiftyTwoWeekHigh.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', padding: '0 28px' }}>
          {tabs.map(t => (
            <button key={t} onClick={() => switchTab(t)} style={{
              padding: '14px 20px 12px', fontSize: 13,
              fontWeight: activeTab === t ? 700 : 500,
              color: activeTab === t ? '#60a5fa' : '#555555',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === t ? '2px solid #3b82f6' : '2px solid transparent',
              fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
              transition: 'all 0.25s ease',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '32px 28px 60px',
        opacity: animating ? 0 : 1,
        transform: animating ? 'translateY(8px)' : 'translateY(0)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }}>

        {/* ── OVERVIEW ── */}
        {activeTab === 'Overview' && <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
            <KPI label="Market Cap" value={fmtCap(data.marketCap)} sub={data.sector} />
            <KPI label="P/E Ratio" value={data.pe > 0 ? `${data.pe.toFixed(1)}x` : 'N/A'} sub={data.forwardPe > 0 ? `Fwd: ${data.forwardPe.toFixed(1)}x` : ''} />
            <KPI
              label="Sentiment"
              value={ai.overview.sentiment}
              color={ai.overview.sentiment === 'Bullish' ? '#4ade80' : ai.overview.sentiment === 'Bearish' ? '#f87171' : '#f59e0b'}
            />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
            <KPI label="Beta" value={data.beta > 0 ? data.beta.toFixed(2) : 'N/A'} sub={data.beta < 1 ? 'Lower vol than market' : data.beta > 1 ? 'Higher vol than market' : 'Market average'} />
            <KPI label="Div Yield" value={data.dividendYield > 0 ? fmtPct(data.dividendYield) : 'N/A'} sub={data.dividendPerShare > 0 ? `$${data.dividendPerShare.toFixed(2)}/yr` : 'No dividend'} />
            <KPI label="EPS (TTM)" value={data.epsTrailing !== 0 ? `$${data.epsTrailing.toFixed(2)}` : 'N/A'} sub={data.pegRatio > 0 ? `PEG: ${data.pegRatio.toFixed(2)}` : ''} />
          </div>

          <Section title="Investment Highlights">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(ai.overview.highlights || []).map((item, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, padding: '14px 16px',
                  background: cardBg, borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1.4 }}>{item.icon}</span>
                  <span style={{ fontSize: 13, color: '#c0c8d4', lineHeight: 1.5 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* 52-Week Price Range */}
          <Section title="52-Week Price Range">
            <div style={{ background: cardBg, borderRadius: 12, padding: '24px 24px 16px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: '#444' }}>${data.fiftyTwoWeekLow.toFixed(0)}</span>
                <span style={{ fontSize: 10, color: '#444' }}>${data.fiftyTwoWeekHigh.toFixed(0)}</span>
              </div>
              <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                {(() => {
                  const range = data.fiftyTwoWeekHigh - data.fiftyTwoWeekLow
                  const pct = range > 0 ? ((data.price - data.fiftyTwoWeekLow) / range) * 100 : 50
                  return (
                    <>
                      <div style={{
                        position: 'absolute', left: 0, width: `${pct}%`, top: 0, height: 6,
                        background: 'linear-gradient(90deg, #f87171, #f59e0b, #4ade80)',
                        borderRadius: 3, opacity: 0.6,
                      }} />
                      <div style={{
                        position: 'absolute', left: `${pct}%`, top: -4,
                        width: 0, height: 0,
                        borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
                        borderTop: '8px solid #60a5fa',
                        transform: 'translateX(-50%)',
                      }} />
                    </>
                  )
                })()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 11, color: '#8b95a5' }}>52w Low</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>${data.fiftyTwoWeekLow.toFixed(2)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#8b95a5' }}>Current</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#60a5fa' }}>${data.price.toFixed(2)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#8b95a5' }}>52w High</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>${data.fiftyTwoWeekHigh.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </Section>
        </>}

        {/* ── FINANCIALS ── */}
        {activeTab === 'Financials' && <>
          {data.revenue.length > 0 && (
            <Section title="Revenue & Net Income ($B)">
              <div style={{ background: cardBg, borderRadius: 12, padding: '16px 8px 8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.revenue} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="year" tick={{ fill: '#8b95a5', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#8b95a5', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#e8ecf1' }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="netIncome" name="Net Income" fill="#4ade80" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 8 }}>
                  <span style={{ fontSize: 11, color: '#3b82f6' }}>&#9679; Revenue</span>
                  <span style={{ fontSize: 11, color: '#4ade80' }}>&#9679; Net Income</span>
                </div>
              </div>
            </Section>
          )}

          {data.eps.length > 0 && (
            <Section title="EPS Growth Trajectory">
              <div style={{ background: cardBg, borderRadius: 12, padding: '16px 8px 8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.eps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="year" tick={{ fill: '#8b95a5', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#8b95a5', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'EPS']} />
                    <Line type="monotone" dataKey="eps" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: '#f59e0b', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          {data.revenue.length >= 2 && (
            <Section title="Revenue Growth">
              <div style={{ background: cardBg, borderRadius: 12, padding: '16px 8px 8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={data.revenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="year" tick={{ fill: '#8b95a5', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#8b95a5', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="rgba(59,130,246,0.08)" strokeWidth={2} name="Revenue ($B)" dot={{ r: 3, fill: '#3b82f6' }} />
                    <Line type="monotone" dataKey="netIncome" stroke="#4ade80" strokeWidth={2} name="Net Income ($B)" dot={{ r: 3, fill: '#4ade80' }} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 8 }}>
                  <span style={{ fontSize: 11, color: '#3b82f6' }}>&#9679; Revenue</span>
                  <span style={{ fontSize: 11, color: '#4ade80' }}>&#9679; Net Income</span>
                </div>
              </div>
            </Section>
          )}

          <Section title="Key Financial Metrics">
            <div style={{ background: cardBg, borderRadius: 12, padding: '4px 16px', border: '1px solid rgba(255,255,255,0.04)' }}>
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
                return <MetricRow label="YoY Revenue Growth" value={typeof growth === 'string' ? growth : `${Number(growth) >= 0 ? '+' : ''}${growth}%`} highlight={Number(growth) >= 0 ? 'green' : 'red'} />
              })()}
              <MetricRow label="Free Cash Flow" value={fmtB(data.freeCashflow)} />
              <MetricRow label="Shares Outstanding" value={fmtB(data.sharesOutstanding).replace('$', '')} />
            </div>
          </Section>
        </>}

        {/* ── VALUATION ── */}
        {activeTab === 'Valuation' && <>
          <Section title="Valuation Multiples">
            <div style={{ background: cardBg, borderRadius: 12, padding: '4px 16px', border: '1px solid rgba(255,255,255,0.04)' }}>
              <MetricRow label="Trailing P/E" value={data.pe > 0 ? `${data.pe.toFixed(1)}x` : 'N/A'} />
              <MetricRow label="Forward P/E" value={data.forwardPe > 0 ? `${data.forwardPe.toFixed(1)}x` : 'N/A'} />
              <MetricRow label="PEG Ratio" value={data.pegRatio > 0 ? data.pegRatio.toFixed(2) : 'N/A'} />
              <MetricRow label="EV/EBITDA" value={data.evToEbitda > 0 ? `${data.evToEbitda.toFixed(1)}x` : 'N/A'} />
              <MetricRow label="Beta" value={data.beta > 0 ? `${data.beta.toFixed(2)}` : 'N/A'} />
            </div>
          </Section>

          {marginData.length > 0 && (
            <Section title="Profitability Profile">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {marginData.map((m, i) => (
                  <div key={i} style={{ background: cardBg, borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: '#8b95a5' }}>{m.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: m.val > 20 ? '#4ade80' : m.val > 0 ? '#f59e0b' : '#f87171' }}>{m.display}</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                      <div style={{ height: 6, borderRadius: 3, width: `${Math.min(m.val, 100)}%`, background: 'linear-gradient(90deg, #3b82f6, #4ade80)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Returns & Capital Structure">
            <div style={{ background: cardBg, borderRadius: 12, padding: '4px 16px', border: '1px solid rgba(255,255,255,0.04)' }}>
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
          <Section title="Strategic Catalysts & Initiatives">
            {(ai.strategy || []).map((item, i) => (
              <div key={i} style={{
                background: cardBg, borderRadius: 10, padding: '14px 16px',
                border: '1px solid rgba(255,255,255,0.04)', marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#e8ecf1', fontFamily: "'Instrument Serif', serif" }}>{item.title}</span>
                  <Pill text={item.tag} variant="blue" />
                </div>
                <p style={{ fontSize: 12, color: '#8b95a5', margin: 0, lineHeight: 1.6 }}>{item.description}</p>
              </div>
            ))}
          </Section>

          <Section title="Key Metrics Summary">
            <div style={{ background: cardBg, borderRadius: 12, padding: '4px 16px', border: '1px solid rgba(255,255,255,0.04)' }}>
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
            <p style={{ fontSize: 12, color: '#555', marginBottom: 12, marginTop: 0 }}>Click a card to expand details</p>
            {(ai.risks || []).map((r, i) => (
              <Collapsible key={i} title={r.title} level={r.level} color={riskColor(r.level)} text={r.text} />
            ))}
          </Section>

          <Section title="Bull vs Bear">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280, background: 'rgba(74,222,128,0.04)', borderRadius: 12, padding: 20, border: '1px solid rgba(74,222,128,0.1)' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#4ade80', marginBottom: 12, fontFamily: "'Instrument Serif', serif" }}>Bull Case</div>
                {(ai.bull_case || []).map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#c0c8d4', padding: '4px 0', display: 'flex', gap: 6 }}>
                    <span style={{ color: '#4ade80' }}>+</span> {t}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 280, background: 'rgba(248,113,113,0.04)', borderRadius: 12, padding: 20, border: '1px solid rgba(248,113,113,0.1)' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f87171', marginBottom: 12, fontFamily: "'Instrument Serif', serif" }}>Bear Case</div>
                {(ai.bear_case || []).map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#c0c8d4', padding: '4px 0', display: 'flex', gap: 6 }}>
                    <span style={{ color: '#f87171' }}>&minus;</span> {t}
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
