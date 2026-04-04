'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { generateReport } from '@/app/actions/generateReport'
import { Badge } from './ReportUI'
import OverviewTab from './tabs/OverviewTab'
import FinancialsTab from './tabs/FinancialsTab'
import ValuationTab from './tabs/ValuationTab'
import CatalystsTab from './tabs/CatalystsTab'
import VerdictTab from './tabs/VerdictTab'
import type { StockReport as StockReportType } from '@/types/report'

const TABS = ['Overview', 'Financials', 'Valuation', 'Catalysts', 'Verdict'] as const

const verdictBadgeColor: Record<string, 'green' | 'red' | 'blue'> = {
  BUY: 'green', SELL: 'red', HOLD: 'blue', AVOID: 'red',
}

const LOADING_LINES = [
  'INITIALIZING SANCTUM AI ENGINE...',
  'FETCHING INSTITUTIONAL DATA FOR {TICKER}...',
  'RUNNING VALUATION MODELS...',
  'GENERATING SYNDICATE REPORT...',
]

function CompanyLogo({ ticker, website }: { ticker: string; website?: string }) {
  const [imgError, setImgError] = useState(false)
  const domain = website ? website.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null
  const logoUrl = domain ? `https://logo.clearbit.com/${domain}` : null

  if (logoUrl && !imgError) {
    return (
      <div style={{
        width: 54, height: 54, borderRadius: 15, overflow: 'hidden',
        background: '#ffffff', flexShrink: 0,
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      }}>
        <Image
          src={logoUrl} alt={ticker} width={54} height={54}
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }}
          onError={() => setImgError(true)}
          unoptimized
        />
      </div>
    )
  }

  return (
    <div style={{
      width: 54, height: 54, borderRadius: 15, flexShrink: 0,
      background: '#0f0f0f', border: '1px solid #1a1a1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 16, fontWeight: 700, color: '#e8ecf1',
      fontFamily: "'JetBrains Mono', monospace",
      letterSpacing: '0.05em',
    }}>
      {ticker.slice(0, 3)}
    </div>
  )
}

export default function StockReport({ ticker }: { ticker: string }) {
  const [report, setReport] = useState<StockReportType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Overview')
  const [animating, setAnimating] = useState(false)
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    setReport(null)
    const result = await generateReport(ticker)
    if ('error' in result) {
      setError(result.error)
    } else {
      setReport(result)
    }
    setLoading(false)
  }, [ticker])

  useEffect(() => {
    fetchReport()
    return () => { if (switchTimer.current) clearTimeout(switchTimer.current) }
  }, [fetchReport])

  const switchTab = (t: typeof TABS[number]) => {
    if (t === activeTab) return
    if (switchTimer.current) clearTimeout(switchTimer.current)
    setAnimating(true)
    switchTimer.current = setTimeout(() => {
      setActiveTab(t)
      setAnimating(false)
      switchTimer.current = null
    }, 200)
  }

  if (loading) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 56px)', background: '#0a0a0a',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: 40,
      }}>
        <style>{`
          @keyframes termFadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}</style>
        <div style={{ maxWidth: 500 }}>
          {LOADING_LINES.map((line, i) => {
            const text = line.replace('{TICKER}', ticker)
            const isLast = i === LOADING_LINES.length - 1
            return (
              <div key={i} style={{
                fontSize: 13, color: '#555',
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 12,
                opacity: 0,
                animation: `termFadeIn 0.4s ease ${i * 150}ms forwards`,
              }}>
                <span style={{ color: '#444', marginRight: 8 }}>&gt;</span>
                {text}
                {isLast && (
                  <span style={{
                    display: 'inline-block', width: 8, height: 16,
                    background: '#555', marginLeft: 4, verticalAlign: 'middle',
                    animation: 'blink 1s step-end infinite',
                  }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 56px)', background: '#0a0a0a',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: 40, gap: 16,
      }}>
        <span style={{
          fontSize: 13, color: '#f87171',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          ERROR: {error}
        </span>
        <button
          onClick={fetchReport}
          style={{
            background: 'none', border: '1px solid #2a2a2a', borderRadius: 4,
            color: '#888', fontSize: 12, padding: '8px 16px', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em', transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}
        >
          &gt; RETRY
        </button>
      </div>
    )
  }

  if (!report) return null

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e8ecf1', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{
        padding: '28px 20px 24px',
        background: 'linear-gradient(180deg, rgba(24,48,120,0.18) 0%, transparent 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <CompanyLogo ticker={report.ticker} website={report.website} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 20, fontWeight: 700, color: '#ffffff',
                fontFamily: "'Instrument Serif', serif", lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{report.companyName}</div>
              <div style={{ fontSize: 11, color: '#5a6475', marginTop: 3, letterSpacing: 0.3 }}>
                {report.exchange} &middot; {report.ticker}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <span style={{
              fontSize: 36, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace", color: '#ffffff', lineHeight: 1,
            }}>{report.currentPrice}</span>
            {report.priceVsATH && (
              <span style={{
                fontSize: 13, color: '#5a6475', paddingBottom: 4,
                fontFamily: "'JetBrains Mono', monospace",
              }}>{report.priceVsATH}</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <Badge text={report.verdict} variant={verdictBadgeColor[report.verdict] || 'blue'} />
            <span style={{
              fontSize: 13, color: '#b8c4d4',
              fontFamily: "'DM Sans', sans-serif",
            }}>{report.verdictSubtitle}</span>
          </div>

          {report.badges?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {report.badges.map((b, i) => (
                <Badge key={i} text={b} variant="gray" />
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', overflowX: 'auto' }}>
        <div style={{
          maxWidth: 900, margin: '0 auto',
          padding: '10px 20px', display: 'flex', gap: 6,
        }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                padding: '8px 18px', borderRadius: 9999, fontSize: 13,
                fontWeight: activeTab === t ? 600 : 400,
                color: activeTab === t ? '#ffffff' : 'rgba(255,255,255,0.35)',
                background: activeTab === t
                  ? 'linear-gradient(135deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.07) 100%)'
                  : 'transparent',
                border: activeTab === t
                  ? '1px solid rgba(255,255,255,0.13)'
                  : '1px solid transparent',
                boxShadow: activeTab === t
                  ? 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.3)'
                  : 'none',
                cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.2s ease',
              }}
            >{t}</button>
          ))}
        </div>
      </div>

      <div style={{
        maxWidth: 900, margin: '0 auto', padding: '28px 20px 72px',
        opacity: animating ? 0 : 1,
        transform: animating ? 'translateY(6px)' : 'translateY(0)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }}>
        {activeTab === 'Overview' && <OverviewTab overview={report.overview} />}
        {activeTab === 'Financials' && <FinancialsTab financials={report.financials} />}
        {activeTab === 'Valuation' && <ValuationTab valuation={report.valuation} />}
        {activeTab === 'Catalysts' && <CatalystsTab catalysts={report.catalysts} />}
        {activeTab === 'Verdict' && <VerdictTab verdictDetails={report.verdictDetails} verdict={report.verdict} />}
      </div>
    </div>
  )
}
