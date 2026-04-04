'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { generateReport } from '@/app/actions/generateReport'
import { supabase } from '@/lib/supabase'
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

const LOADING_PHRASES = [
  'INITIALIZING SANCTUM AI ENGINE...',
  'FETCHING INSTITUTIONAL DATA FOR {TICKER}...',
  'RUNNING VALUATION MODELS...',
  'GENERATING INSTITUTIONAL REPORT...',
  'AUTHENTICATING DATA SOURCES...',
  'PARSING FINANCIAL STATEMENTS...',
  'ANALYZING INSIDER TRANSACTIONS...',
  'SCORING FUNDAMENTAL STRENGTH...',
  'SIMULATING MARKET STRESS CONDITIONS...',
  'GENERATING ACTIONABLE INSIGHTS...',
  'CALCULATING RISK EXPOSURE...',
  'IDENTIFYING MISPRICING SIGNALS...',
]

function useTypewriter(ticker: string, reportReady: boolean, onComplete: () => void) {
  const [displayText, setDisplayText] = useState('')
  const [caretMode, setCaretMode] = useState<'blink' | 'solid' | 'hidden'>('hidden')
  const [progress, setProgress] = useState(0)
  const abortRef = useRef(false)
  const phrasesRef = useRef(
    LOADING_PHRASES.map(p => p.replace('{TICKER}', ticker.toUpperCase()))
  )

  const reportReadyRef = useRef(reportReady)
  useEffect(() => { reportReadyRef.current = reportReady }, [reportReady])

  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    abortRef.current = false
    const phrases = phrasesRef.current

    const sleep = (ms: number) => new Promise<void>((resolve, reject) => {
      const id = setTimeout(resolve, ms)
      const check = setInterval(() => {
        if (abortRef.current) { clearTimeout(id); clearInterval(check); reject('aborted') }
      }, 50)
      setTimeout(() => clearInterval(check), ms + 100)
    })

    const typeDelay = () => 27 + Math.random() * 45
    const deleteDelay = () => 20 + Math.random() * 33

    const run = async () => {
      try {
        setCaretMode('blink')
        await sleep(500)

        let phraseIdx = 0
        while (!abortRef.current) {
          const phrase = phrases[phraseIdx % phrases.length]

          setCaretMode('blink')
          const blinks = 2 + Math.round(Math.random())
          await sleep(blinks * 1000)

          for (let i = 0; i < phrase.length; i++) {
            if (abortRef.current) return
            setDisplayText(phrase.slice(0, i + 1))
            setCaretMode('solid')
            await sleep(typeDelay())
          }

          const progressPerPhrase = 88 / phrases.length
          setProgress(Math.min(90, (phraseIdx + 1) * progressPerPhrase))

          if (reportReadyRef.current) {
            setProgress(100)
            setCaretMode('blink')
            await sleep(1200)
            onCompleteRef.current()
            return
          }

          setCaretMode('blink')
          await sleep(3000)

          if (reportReadyRef.current) {
            setProgress(100)
            await sleep(1200)
            onCompleteRef.current()
            return
          }

          setCaretMode('solid')
          const text = phrase
          for (let i = text.length; i >= 0; i--) {
            if (abortRef.current) return
            setDisplayText(text.slice(0, i))
            setCaretMode('solid')
            await sleep(deleteDelay())
          }

          phraseIdx++
        }
      } catch (e) {
        if (e !== 'aborted') console.error(e)
      }
    }

    run()

    return () => { abortRef.current = true }
  }, [ticker])

  return { displayText, caretMode, progress }
}

function CompanyLogo({ ticker, website }: { ticker: string; website?: string }) {
  const [attempt, setAttempt] = useState(0)
  const domain = website ? website.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null
  const clearbitUrl = domain ? `https://logo.clearbit.com/${domain}` : null
  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null

  const logoUrl = attempt === 0 ? clearbitUrl : attempt === 1 ? faviconUrl : null

  if (logoUrl) {
    return (
      <div style={{
        width: 54, height: 54, borderRadius: 10, overflow: 'hidden',
        background: '#ffffff', flexShrink: 0,
        boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
      }}>
        <Image
          src={logoUrl} alt={ticker} width={54} height={54}
          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }}
          onError={() => setAttempt(a => a + 1)}
          unoptimized
        />
      </div>
    )
  }

  return (
    <div style={{
      width: 54, height: 54, borderRadius: 10, flexShrink: 0,
      background: '#0f0f0f', border: '1px solid #1a1a1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 700, color: '#e8ecf1',
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
  const [showCRT, setShowCRT] = useState(false)
  const [reportReady, setReportReady] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    setReport(null)
    setReportReady(false)
    setShowCRT(false)
    setShowReport(false)

    const { data: existing } = await supabase
      .from('reports')
      .select('data')
      .eq('ticker', ticker)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing?.data?.companyName) {
      setReport(existing.data as StockReportType)
      setReportReady(true)
      return
    }

    const result = await generateReport(ticker)
    if ('error' in result) {
      setError(result.error)
      setLoading(false)
      return
    }

    setReport(result)
    setReportReady(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await supabase.from('reports').delete().eq('ticker', ticker)
      await supabase.from('reports').insert({
        ticker,
        data: result,
        ai: {},
        created_by: session.user.id,
        created_by_email: session.user.email ?? null,
      })
    }
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
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e8ecf1', fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{
        padding: '28px 20px 24px',
        background: 'transparent',
        borderBottom: '1px solid #1a1a1a',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <CompanyLogo ticker={report.ticker} website={report.website} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 18, fontWeight: 600, color: '#ffffff',
                fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{report.companyName}</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap',
              }}>
                <span style={{
                  fontSize: 11, color: '#5a6475', letterSpacing: 0.5,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {report.exchange} &middot; {report.ticker}
                </span>
                <span style={{ color: '#5a6475', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>&middot;</span>
                <Badge text={report.verdict} variant={verdictBadgeColor[report.verdict] || 'blue'} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <span style={{
              fontSize: 36, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace", color: '#ffffff', lineHeight: 1,
            }}>{report.currentPrice}</span>
            {report.priceVsATH && (() => {
              const s = report.priceVsATH
              const dollarIdx = s.lastIndexOf('$')
              const isNeg = s.startsWith('-')
              const isPos = s.startsWith('+') || (!isNeg && parseFloat(s) > 0)
              const athColor = isNeg ? '#f87171' : isPos ? '#4ade80' : '#5a6475'
              if (dollarIdx > 0) {
                const labelPart = s.slice(0, dollarIdx).trim()
                const pricePart = s.slice(dollarIdx)
                return (
                  <span style={{ fontSize: 13, paddingBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                    <span style={{ color: athColor }}>{labelPart} </span>
                    <span style={{ color: '#5a6475' }}>{pricePart}</span>
                  </span>
                )
              }
              return (
                <span style={{ fontSize: 13, color: athColor, paddingBottom: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                  {s}
                </span>
              )
            })()}
          </div>

          {report.badges?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {report.badges
                .filter(b => !b.toLowerCase().includes('52wk') && !b.toLowerCase().includes('52-week') && !b.toLowerCase().includes('52 week'))
                .slice(0, 6)
                .map((b, i) => (
                <Badge key={i} text={b} variant="gray" />
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #1a1a1a', overflowX: 'auto' }}>
        <div style={{
          maxWidth: 900, margin: '0 auto',
          padding: '0 20px', display: 'flex', gap: 0,
        }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                padding: '14px 18px', borderRadius: 0, fontSize: 11,
                fontWeight: 600,
                color: activeTab === t ? '#ffffff' : '#5a6475',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === t ? '2px solid #ffffff' : '2px solid transparent',
                cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
                whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s ease',
                letterSpacing: '0.08em', textTransform: 'uppercase',
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
        {activeTab === 'Overview' && <OverviewTab overview={report.overview} currentPrice={report.currentPrice} />}
        {activeTab === 'Financials' && <FinancialsTab financials={report.financials} />}
        {activeTab === 'Valuation' && <ValuationTab valuation={report.valuation} />}
        {activeTab === 'Catalysts' && <CatalystsTab catalysts={report.catalysts} />}
        {activeTab === 'Verdict' && <VerdictTab verdictDetails={report.verdictDetails} verdict={report.verdict} />}
      </div>
    </div>
  )
}
