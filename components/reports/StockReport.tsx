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
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'

const TABS = ['Overview', 'Financials', 'Valuation', 'Catalysts', 'Verdict'] as const

const verdictBadgeColor: Record<string, 'green' | 'red' | 'blue' | 'yellow'> = {
  BUY: 'green', SELL: 'red', HOLD: 'yellow', AVOID: 'red',
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

  // Smooth time-based progress: starts after typewriter begins typing
  useEffect(() => {
    if (reportReady) return
    let intervalId: ReturnType<typeof setInterval>
    let startTime: number
    const delayId = setTimeout(() => {
      startTime = Date.now()
      intervalId = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000
        // ~50% at 4s, ~70% at 7s, asymptotically approaches 99%
        const p = 99 * (1 - Math.exp(-elapsed / 5))
        setProgress(p)
      }, 60)
    }, 500) // match typewriter's initial sleep
    return () => { clearTimeout(delayId); clearInterval(intervalId) }
  }, [ticker, reportReady])

  // Snap to 100% when report arrives
  useEffect(() => {
    if (!reportReady) return
    setProgress(100)
    const id = setTimeout(() => onCompleteRef.current(), 800)
    return () => clearTimeout(id)
  }, [reportReady])

  useEffect(() => {
    abortRef.current = false
    phrasesRef.current = LOADING_PHRASES.map(p => p.replace('{TICKER}', ticker.toUpperCase()))
    const phrases = phrasesRef.current

    const sleep = (ms: number) => new Promise<void>((resolve, reject) => {
      const id = setTimeout(resolve, ms)
      const check = setInterval(() => {
        if (abortRef.current || reportReadyRef.current) { clearTimeout(id); clearInterval(check); reject('ready') }
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
            if (reportReadyRef.current) return
            setDisplayText(phrase.slice(0, i + 1))
            setCaretMode('solid')
            await sleep(typeDelay())
          }

          if (reportReadyRef.current) return

          setCaretMode('blink')
          await sleep(3000)

          if (reportReadyRef.current) return

          setCaretMode('solid')
          const text = phrase
          for (let i = text.length; i >= 0; i--) {
            if (abortRef.current) return
            if (reportReadyRef.current) return
            setDisplayText(text.slice(0, i))
            setCaretMode('solid')
            await sleep(deleteDelay())
          }

          phraseIdx++
        }
      } catch (e) {
        if (e !== 'ready' && e !== 'aborted') console.error(e)
      }
    }

    run()

    return () => { abortRef.current = true }
  }, [ticker])

  return { displayText, caretMode, progress }
}


function ReportLoadingScreen({
  ticker,
  reportReady,
  showCRT,
  onCRTStart,
  onCRTDone,
}: {
  ticker: string
  reportReady: boolean
  showCRT: boolean
  onCRTStart: () => void
  onCRTDone: () => void
}) {
  const { displayText, caretMode, progress } = useTypewriter(ticker, reportReady, onCRTStart)
  const loadingRef = useRef<HTMLDivElement>(null)
  const crtLineRef = useRef<HTMLDivElement>(null)
  const sweepTopRef = useRef<HTMLDivElement>(null)
  const sweepBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showCRT) return
    const loading = loadingRef.current
    const crtLine = crtLineRef.current
    const sweepTop = sweepTopRef.current
    const sweepBottom = sweepBottomRef.current
    if (!loading || !crtLine || !sweepTop || !sweepBottom) return

    loading.classList.add('crt-collapsing')

    // Step 2: Show CRT line after collapse finishes (500ms)
    const t1 = setTimeout(() => {
      crtLine.classList.add('crt-line-visible')
    }, 500)

    // Step 3: Sweep white outward 150ms after line appears
    const t2 = setTimeout(() => {
      sweepTop.classList.add('crt-sweeping')
      sweepBottom.classList.add('crt-sweeping')
      crtLine.style.transition = 'opacity 400ms ease-out'
      crtLine.style.opacity = '0'
    }, 650)

    // Step 4: Done — collapse(500) + line(150) + sweep(600) + reveal delay(200) ≈ 1450
    const t3 = setTimeout(() => {
      onCRTDone()
    }, 1450)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [showCRT, onCRTDone])

  const caretStyle: React.CSSProperties = {
    display: 'inline-block', width: 8, height: 15,
    background: '#555', verticalAlign: 'middle', marginLeft: 2,
    ...(caretMode === 'blink' ? { animation: 'loadingBlink 1s step-end infinite' } : {}),
    ...(caretMode === 'hidden' ? { opacity: 0 } : { opacity: 1 }),
  }

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)', background: '#0a0a0a',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Global SVG filter defs — referenced by all charts via url(#fGlow) / url(#fGlowBar) */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <filter id="fGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="fGlowBar" x="-30%" y="-20%" width="160%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.0" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      </svg>
      <style>{`
        @keyframes loadingBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes crtCollapse {
          0%   { transform: scaleY(1) scaleX(1); opacity: 1; filter: brightness(1); }
          50%  { transform: scaleY(0.008) scaleX(1.02); opacity: 1; filter: brightness(2.5); }
          100% { transform: scaleY(0) scaleX(0.5); opacity: 0; filter: brightness(3); }
        }
        .crt-collapsing {
          animation: crtCollapse 500ms cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        .crt-line-visible {
          opacity: 1 !important;
          transition: opacity 150ms ease-out;
        }
        @keyframes sweepUpWhite {
          0%   { height: 0%; opacity: 1; }
          60%  { height: 50%; opacity: 0.8; }
          100% { height: 50%; opacity: 0; }
        }
        @keyframes sweepDownWhite {
          0%   { height: 0%; opacity: 1; }
          60%  { height: 50%; opacity: 0.8; }
          100% { height: 50%; opacity: 0; }
        }
        .crt-sweeping.crt-sweep-top {
          animation: sweepUpWhite 600ms cubic-bezier(0.25, 0, 0.4, 1) forwards;
        }
        .crt-sweeping.crt-sweep-bottom {
          animation: sweepDownWhite 600ms cubic-bezier(0.25, 0, 0.4, 1) forwards;
        }
        @keyframes shimmerSweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>

      {/* Loading content */}
      <div ref={loadingRef} style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 340 }}>
          {/* Terminal line */}
          <div style={{
            fontSize: 13, color: '#555',
            fontFamily: "'JetBrains Mono', monospace",
            height: 20, lineHeight: '20px',
            whiteSpace: 'nowrap', overflow: 'visible',
            textAlign: 'left', alignSelf: 'flex-start',
          }}>
            <span style={{ color: '#444', marginRight: 8 }}>&gt;</span>
            <span>{displayText}</span>
            <span style={caretStyle} />
          </div>

          {/* Progress bar */}
          <div style={{ width: 340, marginTop: 32 }}>
            <div style={{
              width: '100%', height: 1, background: '#1a1a1a',
              borderRadius: 1, overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                height: '100%', width: `${progress}%`, background: '#555',
                borderRadius: 1, transition: 'width 200ms linear',
              }} />
              <div style={{
                position: 'absolute', top: 0, left: 0,
                width: '100%', height: '100%', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '60%', height: '100%',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 40%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.3) 60%, transparent 100%)',
                  animation: 'shimmerSweep 2.5s linear infinite',
                }} />
              </div>
            </div>
            <div style={{
              fontSize: 14, color: progress >= 100 ? '#555' : '#333',
              marginTop: 8, textAlign: 'right', letterSpacing: '0.05em',
              transition: 'color 300ms',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {Math.round(progress)}%
            </div>
          </div>
        </div>
      </div>

      {/* CRT transition elements */}
      <div ref={crtLineRef} style={{
        position: 'absolute', left: 0, right: 0, top: '50%', zIndex: 15,
        height: 2, transform: 'translateY(-50%)',
        background: 'rgba(255,255,255,0.9)',
        boxShadow: '0 0 30px rgba(255,255,255,0.5), 0 0 80px rgba(255,255,255,0.2)',
        opacity: 0, pointerEvents: 'none',
      }} />
      <div ref={sweepTopRef} className="crt-sweep-top" style={{
        position: 'absolute', left: 0, right: 0, bottom: '50%', zIndex: 14,
        background: 'rgba(255,255,255,0.12)',
        pointerEvents: 'none', height: '0%',
      }} />
      <div ref={sweepBottomRef} className="crt-sweep-bottom" style={{
        position: 'absolute', left: 0, right: 0, top: '50%', zIndex: 14,
        background: 'rgba(255,255,255,0.12)',
        pointerEvents: 'none', height: '0%',
      }} />
    </div>
  )
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
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const fetchIdRef = useRef(0)

  const fetchReport = useCallback(async () => {
    const myId = ++fetchIdRef.current

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

    if (myId !== fetchIdRef.current) return

    if (existing?.data?.companyName) {
      setReport(existing.data as StockReportType)
      setReportReady(true)
      setLoading(false)
      setShowReport(true)
      return
    }

    const result = await generateReport(ticker)

    if (myId !== fetchIdRef.current) return

    if ('error' in result) {
      setError(result.error)
      setLoading(false)
      return
    }

    setReport(result)
    setReportReady(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await supabase.from('reports').delete().eq('ticker', ticker).eq('created_by', session.user.id)
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
    return () => {
      fetchIdRef.current++ // invalidate any in-flight request for this ticker
      if (switchTimer.current) clearTimeout(switchTimer.current)
    }
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

  if (loading || showCRT) {
    return (
      <ReportLoadingScreen
        ticker={ticker}
        reportReady={reportReady}
        showCRT={showCRT}
        onCRTStart={() => setShowCRT(true)}
        onCRTDone={() => { setShowCRT(false); setLoading(false); setShowReport(true) }}
      />
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
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#e8ecf1',
      fontFamily: "'JetBrains Mono', monospace",
      animation: showReport ? 'reportReveal 500ms ease-out 200ms both' : undefined,
    }}>
      {/* Global SVG filter defs — referenced by all charts via url(#fGlow) / url(#fGlowBar) */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <filter id="fGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="fGlowBar" x="-30%" y="-20%" width="160%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.0" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      </svg>
      <style>{`
        @keyframes reportReveal {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div style={{
        padding: isDesktop ? '20px 40px 16px' : '28px 20px 24px',
        background: 'transparent',
        borderBottom: '1px solid #1a1a1a',
      }}>
        <div style={{ maxWidth: isDesktop ? 1880 : 900, margin: '0 auto' }}>
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

          {report.badges?.length > 0 && (() => {
            const sentimentToVariant: Record<string, 'green' | 'red' | 'blue' | 'yellow' | 'gray'> = {
              positive: 'green',
              negative: 'red',
              neutral: 'blue',
              caution: 'yellow',
            }
            const variantOrder: Record<string, number> = { green: 0, blue: 1, yellow: 2, red: 3, gray: 4 }
            const badges = report.badges.slice(0, 10).map(b =>
              typeof b === 'string'
                ? { text: b, variant: 'gray' as const, reason: undefined as string | undefined }
                : { text: b.text, variant: sentimentToVariant[b.sentiment] || 'gray' as const, reason: b.reason }
            ).filter(b => {
              const bl = b.text.toLowerCase()
              if (bl.includes('52wk') || bl.includes('52-week') || bl.includes('52 week')) return false
              if (/\$[\d.,]+|\d+(\.\d+)?[%x]|\d+(\.\d+)?\s*[btm]\b/i.test(b.text)) return false
              if (/\b(mkt cap|market cap|p\/e|forward p\/e|trailing p\/e|eps|dividend yield|div yield|beta|cagr|revenue|cash flow|net income|op margin|gross margin)\b/i.test(bl)) return false
              return true
            }).sort((a, b) => (variantOrder[a.variant] ?? 4) - (variantOrder[b.variant] ?? 4))
            return (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflow: 'visible' }}>
                {badges.map((b, i) => (
                  <Badge key={i} text={b.text} variant={b.variant} tooltip={b.reason} />
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #1a1a1a', overflowX: 'auto', padding: isDesktop ? '0 40px' : '0 20px' }}>
        <div style={{
          maxWidth: isDesktop ? 1880 : 900, margin: '0 auto',
          display: 'flex', gap: 0,
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
        padding: isDesktop ? '20px 40px 40px' : '28px 20px 72px',
      }}>
        <div style={{
          maxWidth: isDesktop ? 1880 : 900, margin: '0 auto',
          opacity: animating ? 0 : 1,
          transform: animating ? 'translateY(6px)' : 'translateY(0)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}>
          {activeTab === 'Overview' && <OverviewTab overview={report.overview} currentPrice={report.currentPrice} convictionScore={report.convictionScore} convictionDrivers={report.verdictDetails?.convictionDrivers} />}
          {activeTab === 'Financials' && <FinancialsTab financials={report.financials} />}
          {activeTab === 'Valuation' && <ValuationTab valuation={report.valuation} />}
          {activeTab === 'Catalysts' && <CatalystsTab catalysts={report.catalysts} />}
          {activeTab === 'Verdict' && <VerdictTab verdictDetails={report.verdictDetails} verdict={report.verdict} />}
        </div>
      </div>
    </div>
  )
}
