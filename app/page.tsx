'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Auth from '@/components/Auth'
import ReportView from '@/components/ReportView'
import type { Session } from '@supabase/supabase-js'

interface SavedReport {
  id: string
  ticker: string
  data: any
  ai: any
  created_by: string
  created_by_email: string | null
  created_at: string
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Watchlist'>('Dashboard')
  const [searchTicker, setSearchTicker] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const [currentReport, setCurrentReport] = useState<SavedReport | null>(null)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [showReport, setShowReport] = useState(false)

  const [watchlist, setWatchlist] = useState<string[]>([])
  const [chartData, setChartData] = useState<Record<string, { points: { time: string; price: number }[]; afterHours: { price: number; change: number; changePct: number; label: string } | null }>>({})

  const [currentTime, setCurrentTime] = useState(new Date())
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({ defaultTab: 'Dashboard' as 'Dashboard' | 'Watchlist', clockFormat: '12h' as '12h' | '24h' })

  // ── Live Clock ──
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // ── Auth ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    }).catch(() => setLoading(false))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Load saved reports ──
  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) {
      const deleted = (() => {
        try {
          const stored = localStorage.getItem('sanctum-deleted-reports')
          return stored ? JSON.parse(stored) : []
        } catch { return [] }
      })()
      setSavedReports(data.filter((r: SavedReport) => !deleted.includes(r.id)))
    }
  }, [])

  useEffect(() => {
    if (session) loadReports()
  }, [session, loadReports])

  // ── Fetch 1-day chart data for report tickers ──
  useEffect(() => {
    if (savedReports.length === 0) return
    const tickers = [...new Set(savedReports.map(r => r.ticker))]
    tickers.forEach(ticker => {
      if (chartData[ticker]) return
      fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}`)
        .then(r => r.json())
        .then(res => {
          if (res.points?.length) {
            setChartData(prev => ({ ...prev, [ticker]: { points: res.points, afterHours: res.afterHours || null } }))
          }
        })
        .catch(() => {})
    })
  }, [savedReports]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load watchlist from localStorage ──
  useEffect(() => {
    const stored = localStorage.getItem('sanctum-watchlist')
    if (stored) setWatchlist(JSON.parse(stored))
  }, [])

  // ── Load settings from localStorage ──
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sanctum-settings')
      if (stored) {
        const parsed = JSON.parse(stored)
        setSettings(prev => ({ ...prev, ...parsed }))
        if (parsed.defaultTab) setActiveTab(parsed.defaultTab)
      }
    } catch {}
  }, [])

  const updateSettings = (patch: Partial<typeof settings>) => {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    localStorage.setItem('sanctum-settings', JSON.stringify(updated))
  }

  const saveWatchlist = (list: string[]) => {
    setWatchlist(list)
    localStorage.setItem('sanctum-watchlist', JSON.stringify(list))
  }

  const addToWatchlist = (ticker: string) => {
    const upper = ticker.toUpperCase()
    if (!watchlist.includes(upper)) saveWatchlist([...watchlist, upper])
  }

  const removeFromWatchlist = (ticker: string) => {
    saveWatchlist(watchlist.filter(t => t !== ticker))
  }

  const getDeletedIds = (): string[] => {
    try {
      const stored = localStorage.getItem('sanctum-deleted-reports')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  }

  const deleteReport = async (id: string) => {
    await supabase.from('reports').delete().eq('id', id)
    const deleted = getDeletedIds()
    localStorage.setItem('sanctum-deleted-reports', JSON.stringify([...deleted, id]))
    setSavedReports(prev => prev.filter(r => r.id !== id))
  }

  // ── Generate Report ──
  const generateReport = async () => {
    if (!searchTicker.trim()) return
    setGenerating(true)
    setError('')
    setShowReport(false)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: searchTicker.trim() }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate report')
      }

      const { data, ai } = await res.json()
      const ticker = searchTicker.trim().toUpperCase()

      const { data: inserted, error: insertError } = await supabase
        .from('reports')
        .insert({
          ticker,
          data,
          ai,
          created_by: session!.user.id,
          created_by_email: session!.user.email || null,
        })
        .select()
        .single()

      if (insertError) console.error('Save error:', insertError)

      const report: SavedReport = inserted || {
        id: crypto.randomUUID(),
        ticker,
        data,
        ai,
        created_by: session!.user.id,
        created_by_email: session!.user.email || null,
        created_at: new Date().toISOString(),
      }

      setCurrentReport(report)
      setShowReport(true)
      setShowGenerateModal(false)
      setSearchTicker('')
      loadReports()
    } catch (err: any) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a0a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: 14, fontWeight: 500, color: '#fff',
          letterSpacing: '0.3em', fontFamily: "'DM Sans', sans-serif",
        }}>
          SANCTUM
        </span>
      </div>
    )
  }

  if (!session) return <Auth />

  // ── Viewing a report ──
  if (showReport && currentReport) {
    return (
      <div>
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1a1a1a',
          padding: '0 40px',
        }}>
          <div style={{
            maxWidth: 1400, margin: '0 auto', width: '100%',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            height: 56,
          }}>
            <button
              onClick={() => setShowReport(false)}
              style={{
                background: 'none', border: '1px solid #2a2a2a', borderRadius: 4,
                color: '#888', fontSize: 12, padding: '8px 16px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { (e.currentTarget).style.borderColor = '#444'; (e.currentTarget).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget).style.borderColor = '#2a2a2a'; (e.currentTarget).style.color = '#888' }}
            >
              &larr; BACK
            </button>
            <button
              onClick={() => addToWatchlist(currentReport.ticker)}
              style={{
                background: watchlist.includes(currentReport.ticker) ? 'rgba(34,197,94,0.08)' : 'transparent',
                border: `1px solid ${watchlist.includes(currentReport.ticker) ? 'rgba(34,197,94,0.4)' : '#2a2a2a'}`,
                borderRadius: 4,
                color: watchlist.includes(currentReport.ticker) ? '#22c55e' : '#888',
                fontSize: 12, padding: '8px 16px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
                transition: 'all 0.2s ease',
              }}
            >
              {watchlist.includes(currentReport.ticker) ? 'ON WATCHLIST' : '+ WATCHLIST'}
            </button>
          </div>
        </div>
        <ReportView data={currentReport.data} ai={currentReport.ai} ticker={currentReport.ticker} />
      </div>
    )
  }

  // ── Format time ──
  const formattedTime = currentTime.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }) + ', ' + currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: settings.clockFormat === '12h',
  })

  // ── Main Shell ──
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .nav-links-desktop { display: none !important; }
          .hamburger-btn { display: flex !important; }
          .hero-title { font-size: 36px !important; letter-spacing: 0.2em !important; }
          .main-content { padding-left: 24px !important; padding-right: 24px !important; }
          .nav-inner { padding-left: 20px !important; padding-right: 20px !important; }
          .reports-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (min-width: 769px) and (max-width: 1200px) {
          .reports-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (min-width: 769px) {
          .nav-links-desktop { display: flex !important; }
          .hamburger-btn { display: none !important; }
          .mobile-menu { display: none !important; }
        }
      `}</style>

      {/* ── Fixed Navigation ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#0a0a0a',
        borderBottom: '1px solid #1a1a1a',
        height: 56,
      }}>
        <div className="nav-inner" style={{
          maxWidth: 1400, margin: '0 auto', padding: '0 40px',
          display: 'flex', alignItems: 'center',
          height: '100%', position: 'relative',
        }}>
          {/* Left: Name */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 14, fontWeight: 500, color: '#fff',
              letterSpacing: '0.3em', fontFamily: "'DM Sans', sans-serif",
            }}>
              SANCTUM SECURITIES
            </span>
          </div>

          {/* Center: Nav links (desktop) */}
          <div className="nav-links-desktop" style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 32,
          }}>
            {(['Dashboard', 'Watchlist'] as const).map(tab => {
              const isActive = tab === activeTab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 400,
                    color: isActive ? '#fff' : '#888',
                    fontFamily: "'DM Sans', sans-serif",
                    padding: '4px 0',
                    borderBottom: isActive ? '1px solid #fff' : '1px solid transparent',
                    paddingBottom: 2,
                    transition: 'color 0.2s ease',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget).style.color = '#bbb' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget).style.color = '#888' }}
                >
                  {tab}
                </button>
              )
            })}
          </div>

          {/* Right: Icons */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
            <button
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#888', padding: 4, display: 'flex', alignItems: 'center',
                transition: 'color 0.2s ease',
              }}
              onClick={() => setShowSettings(true)}
              onMouseEnter={e => (e.currentTarget).style.color = '#fff'}
              onMouseLeave={e => (e.currentTarget).style.color = '#888'}
              aria-label="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#888', padding: 4, display: 'flex', alignItems: 'center',
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={e => (e.currentTarget).style.color = '#fff'}
              onMouseLeave={e => (e.currentTarget).style.color = '#888'}
              aria-label="Sign out"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>

            {/* Hamburger (mobile only) */}
            <button
              className="hamburger-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#888', padding: 4, display: 'none', alignItems: 'center',
              }}
              aria-label="Menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {mobileMenuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="mobile-menu" style={{
            position: 'absolute', top: 56, left: 0, right: 0,
            background: '#0a0a0a', borderBottom: '1px solid #1a1a1a',
            padding: '8px 20px 16px',
            display: 'flex', flexDirection: 'column', gap: 0,
          }}>
            {(['Dashboard', 'Watchlist'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setMobileMenuOpen(false) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, color: tab === activeTab ? '#fff' : '#888',
                  fontFamily: "'DM Sans', sans-serif",
                  padding: '12px 0', textAlign: 'left',
                  borderBottom: '1px solid #1a1a1a',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* ── Main Content ── */}
      <main style={{ paddingTop: 56 }}>

        {/* ══ DASHBOARD ══ */}
        {activeTab === 'Dashboard' && (
          <div className="main-content" style={{
            padding: '80px 64px 0',
            maxWidth: '100%', margin: '0 auto',
            animation: 'fadeIn 0.3s ease',
          }}>
            {/* Hero heading */}
            <h1 className="hero-title" style={{
              fontSize: 64, fontWeight: 700, color: '#fff',
              letterSpacing: '0.08em',
              fontFamily: "'Instrument Serif', serif",
              margin: 0, lineHeight: 1,
            }}>
              SANCTUM
            </h1>

            {/* Date/time + terminal status */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 20,
              marginTop: 16, flexWrap: 'wrap',
            }}>
              <span style={{
                fontSize: 14, color: '#666',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {formattedTime}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#22c55e',
                  animation: 'pulse 2s ease-in-out infinite',
                }} />
                <span style={{
                  fontSize: 11, color: '#22c55e',
                  letterSpacing: '0.15em',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 500,
                }}>
                  TERMINAL ACTIVE
                </span>
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={() => { setShowGenerateModal(true); setError(''); setSearchTicker('') }}
              style={{
                marginTop: 40,
                background: 'transparent',
                border: '1px solid #2a2a2a',
                borderRadius: 4,
                color: '#fff',
                fontSize: 14,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
                padding: '14px 28px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget).style.borderColor = '#444'
                ;(e.currentTarget).style.background = 'rgba(255,255,255,0.03)'
              }}
              onMouseLeave={e => {
                (e.currentTarget).style.borderColor = '#2a2a2a'
                ;(e.currentTarget).style.background = 'transparent'
              }}
            >
              + GENERATE NEW REPORT
            </button>

            {/* Content: empty state or reports list */}
            {savedReports.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                minHeight: 'calc(100vh - 340px)',
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <p style={{
                  fontSize: 14, color: '#666', margin: '16px 0 4px',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  No reports generated yet.
                </p>
                <p style={{
                  fontSize: 12, color: '#555', margin: 0,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Click &quot;Generate New Report&quot; to analyze a stock.
                </p>
              </div>
            ) : (
              <div style={{ marginTop: 56, paddingBottom: 60 }}>
                <div style={{
                  fontSize: 12, color: '#555',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.1em',
                  marginBottom: 24, paddingBottom: 14,
                  borderBottom: '1px solid #1a1a1a',
                }}>
                  RECENT REPORTS
                </div>
                <div className="reports-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 14,
                }}>
                  {savedReports.map(report => {
                    const d = report.data || {}
                    const sentiment = report.ai?.overview?.sentiment || ''
                    const price = d.price
                    const prevClose = d.previousClose
                    const priceChange = price && prevClose ? price - prevClose : null
                    const priceChangePct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : null
                    const isUp = priceChange !== null && priceChange >= 0
                    const tickerChart = chartData[report.ticker]
                    const ah = tickerChart?.afterHours || null

                    const formatMktCap = (val: number) => {
                      if (!val) return '—'
                      if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
                      if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
                      if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`
                      return `$${val.toLocaleString()}`
                    }

                    const sentimentColor = sentiment === 'Bullish' ? '#22c55e'
                      : sentiment === 'Bearish' ? '#f87171' : '#eab308'
                    const sentimentBg = sentiment === 'Bullish' ? 'rgba(34,197,94,0.08)'
                      : sentiment === 'Bearish' ? 'rgba(248,113,113,0.08)' : 'rgba(234,179,8,0.08)'

                    const creatorEmail = report.created_by_email || ''
                    const creatorName = creatorEmail ? creatorEmail.split('@')[0] : 'unknown'

                    return (
                      <div
                        key={report.id}
                        style={{
                          background: '#0f0f0f',
                          border: '1px solid #1a1a1a',
                          borderRadius: 6,
                          padding: 20,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex', flexDirection: 'column',
                          aspectRatio: '1 / 1',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget).style.borderColor = '#2a2a2a'
                          ;(e.currentTarget).style.background = '#111'
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget).style.borderColor = '#1a1a1a'
                          ;(e.currentTarget).style.background = '#0f0f0f'
                        }}
                        onClick={() => { setCurrentReport(report); setShowReport(true) }}
                      >
                        {/* Header: Ticker + Sentiment */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{
                              fontSize: 20, fontWeight: 700, color: '#fff',
                              letterSpacing: '0.05em',
                              fontFamily: "'JetBrains Mono', monospace",
                            }}>
                              {report.ticker}
                            </div>
                            <div style={{
                              fontSize: 12, color: '#555', marginTop: 2,
                              fontFamily: "'DM Sans', sans-serif",
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              maxWidth: 160,
                            }}>
                              {d.name || ''}
                            </div>
                          </div>
                          {sentiment && (
                            <span style={{
                              fontSize: 10, fontWeight: 600,
                              color: sentimentColor,
                              background: sentimentBg,
                              border: `1px solid ${sentimentColor}22`,
                              borderRadius: 3,
                              padding: '3px 8px',
                              letterSpacing: '0.08em',
                              fontFamily: "'JetBrains Mono', monospace",
                              textTransform: 'uppercase',
                              flexShrink: 0,
                            }}>
                              {sentiment}
                            </span>
                          )}
                        </div>

                        {/* Price */}
                        <div style={{ marginBottom: 14 }}>
                          <span style={{
                            fontSize: 24, fontWeight: 600, color: '#fff',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {price ? `$${price.toFixed(2)}` : '—'}
                          </span>
                          {priceChange !== null && priceChangePct !== null && (
                            <span style={{
                              fontSize: 12, marginLeft: 8,
                              color: isUp ? '#22c55e' : '#f87171',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontWeight: 500,
                            }}>
                              {isUp ? '+' : ''}{priceChange.toFixed(2)} ({isUp ? '+' : ''}{priceChangePct.toFixed(2)}%)
                            </span>
                          )}
                        </div>

                        {/* After Hours / Pre-Market */}
                        {ah && (
                          <div style={{ marginBottom: 10, marginTop: -8 }}>
                            <span style={{
                              fontSize: 11, color: '#555',
                              fontFamily: "'JetBrains Mono', monospace",
                            }}>
                              {ah.label}:
                            </span>
                            <span style={{
                              fontSize: 11, color: '#999',
                              fontFamily: "'JetBrains Mono', monospace",
                              marginLeft: 6,
                            }}>
                              ${ah.price.toFixed(2)}
                            </span>
                            <span style={{
                              fontSize: 11,
                              fontFamily: "'JetBrains Mono', monospace",
                              marginLeft: 6,
                              color: ah.change >= 0 ? '#22c55e' : '#f87171',
                            }}>
                              {ah.change >= 0 ? '+' : ''}{ah.changePct.toFixed(2)}%
                            </span>
                          </div>
                        )}

                        {/* Metrics Grid */}
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 1fr',
                          gap: '10px 16px', marginBottom: 14,
                        }}>
                          <div>
                            <div style={{ fontSize: 10, color: '#444', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em', marginBottom: 2 }}>
                              MKT CAP
                            </div>
                            <div style={{ fontSize: 14, color: '#ccc', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                              {formatMktCap(d.marketCap)}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: '#444', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em', marginBottom: 2 }}>
                              P/E
                            </div>
                            <div style={{ fontSize: 14, color: '#ccc', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                              {d.pe ? d.pe.toFixed(2) : '—'}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: '#444', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em', marginBottom: 2 }}>
                              BETA
                            </div>
                            <div style={{ fontSize: 14, color: '#ccc', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                              {d.beta ? d.beta.toFixed(2) : '—'}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: '#444', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em', marginBottom: 2 }}>
                              DIV YIELD
                            </div>
                            <div style={{ fontSize: 14, color: '#ccc', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                              {d.dividendYield ? `${(d.dividendYield * 100).toFixed(2)}%` : '—'}
                            </div>
                          </div>
                        </div>

                        {/* Sector + Industry */}
                        {(d.sector || d.industry) && (
                          <div style={{
                            fontSize: 11, color: '#444',
                            fontFamily: "'DM Sans', sans-serif",
                            marginBottom: 8,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {[d.sector, d.industry].filter(Boolean).join(' · ')}
                          </div>
                        )}

                        {/* 1-Day Sparkline Chart */}
                        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end' }}>
                          {(() => {
                            const pts = chartData[report.ticker]?.points?.map(p => p.price)
                            if (!pts || pts.length < 2) return (
                              <div style={{
                                width: '100%', height: '100%', minHeight: 40,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <span style={{ fontSize: 10, color: '#222', fontFamily: "'JetBrains Mono', monospace" }}>
                                  loading chart...
                                </span>
                              </div>
                            )
                            const min = Math.min(...pts)
                            const max = Math.max(...pts)
                            const range = max - min || 1
                            const w = 300
                            const h = 80
                            const pad = 2
                            const linePoints = pts.map((v, i) => {
                              const x = (i / (pts.length - 1)) * w
                              const y = pad + (1 - (v - min) / range) * (h - pad * 2)
                              return `${x},${y}`
                            }).join(' ')
                            const fillPoints = `0,${h} ${linePoints} ${w},${h}`
                            const up = pts[pts.length - 1] >= pts[0]
                            const strokeColor = up ? '#22c55e' : '#f87171'
                            const fillColor = up ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)'
                            return (
                              <svg
                                viewBox={`0 0 ${w} ${h}`}
                                preserveAspectRatio="none"
                                style={{ width: '100%', height: '100%', minHeight: 40, display: 'block' }}
                              >
                                <polygon points={fillPoints} fill={fillColor} />
                                <polyline points={linePoints} fill="none" stroke={strokeColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                              </svg>
                            )
                          })()}
                        </div>

                        {/* Footer: Date | Created by + Remove */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          paddingTop: 12,
                          borderTop: '1px solid #1a1a1a',
                        }}>
                          <span style={{
                            fontSize: 11, color: '#333',
                            fontFamily: "'JetBrains Mono', monospace",
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}>
                            {new Date(report.created_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric',
                            })}
                            <span style={{ color: '#222', margin: '0 6px' }}>|</span>
                            <span style={{ color: '#444' }}>{creatorName}</span>
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); deleteReport(report.id) }}
                            style={{
                              background: 'none', border: '1px solid #1a1a1a',
                              borderRadius: 3, color: '#444', fontSize: 10,
                              padding: '4px 10px', cursor: 'pointer',
                              fontFamily: "'JetBrains Mono', monospace",
                              letterSpacing: '0.05em',
                              transition: 'all 0.2s ease',
                              flexShrink: 0,
                            }}
                            onMouseEnter={e => { (e.currentTarget).style.color = '#f87171'; (e.currentTarget).style.borderColor = 'rgba(248,113,113,0.3)' }}
                            onMouseLeave={e => { (e.currentTarget).style.color = '#444'; (e.currentTarget).style.borderColor = '#1a1a1a' }}
                          >
                            REMOVE
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ WATCHLIST ══ */}
        {activeTab === 'Watchlist' && (
          <div className="main-content" style={{
            padding: '60px 48px 0',
            maxWidth: 1400, margin: '0 auto',
            animation: 'fadeIn 0.3s ease',
          }}>
            <h2 className="hero-title" style={{
              fontSize: 48, fontWeight: 700, color: '#fff',
              letterSpacing: '-0.02em',
              fontFamily: "'Instrument Serif', serif",
              margin: 0, lineHeight: 1,
            }}>
              WATCHLIST
            </h2>
            <p style={{
              fontSize: 13, color: '#555', margin: '16px 0 40px',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              Tickers you&apos;re tracking. Click to generate a fresh report.
            </p>

            {watchlist.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                minHeight: 'calc(100vh - 340px)',
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <p style={{
                  fontSize: 14, color: '#666', margin: '16px 0 4px',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Your watchlist is empty.
                </p>
                <p style={{
                  fontSize: 12, color: '#555', margin: 0,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Add tickers from a report page.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {watchlist.map(ticker => (
                  <div
                    key={ticker}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '14px 16px',
                      borderBottom: '1px solid #111',
                    }}
                  >
                    <span style={{
                      fontSize: 14, fontWeight: 600, color: '#fff',
                      letterSpacing: '0.05em',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {ticker}
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          setSearchTicker(ticker)
                          setActiveTab('Dashboard')
                          setShowGenerateModal(true)
                          setError('')
                        }}
                        style={{
                          background: 'transparent', border: '1px solid #2a2a2a',
                          borderRadius: 4, color: '#888', fontSize: 12,
                          padding: '6px 14px', cursor: 'pointer',
                          fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: '0.05em',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => { (e.currentTarget).style.color = '#fff'; (e.currentTarget).style.borderColor = '#444' }}
                        onMouseLeave={e => { (e.currentTarget).style.color = '#888'; (e.currentTarget).style.borderColor = '#2a2a2a' }}
                      >
                        GENERATE
                      </button>
                      <button
                        onClick={() => removeFromWatchlist(ticker)}
                        style={{
                          background: 'none', border: '1px solid #2a2a2a',
                          borderRadius: 4, color: '#555', fontSize: 12,
                          padding: '6px 12px', cursor: 'pointer',
                          fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: '0.05em',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => { (e.currentTarget).style.color = '#f87171'; (e.currentTarget).style.borderColor = 'rgba(248,113,113,0.3)' }}
                        onMouseLeave={e => { (e.currentTarget).style.color = '#555'; (e.currentTarget).style.borderColor = '#2a2a2a' }}
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Generate Report Modal ── */}
      {showGenerateModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease',
          }}
          onClick={e => {
            if (e.target === e.currentTarget && !generating) {
              setShowGenerateModal(false)
              setError('')
              setSearchTicker('')
            }
          }}
        >
          <div style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 4,
            padding: 32,
            width: '100%', maxWidth: 420,
            margin: '0 20px',
          }}>
            <div style={{
              fontSize: 11, color: '#555',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.15em',
              marginBottom: 24,
            }}>
              GENERATE REPORT
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 14, color: '#fff',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                &gt;
              </span>
              <input
                type="text"
                value={searchTicker}
                onChange={e => setSearchTicker(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && !generating && searchTicker.trim() && generateReport()}
                placeholder="ENTER TICKER"
                disabled={generating}
                autoFocus
                style={{
                  flex: 1, padding: '10px 0',
                  fontSize: 14, background: 'transparent',
                  border: 'none', borderBottom: '1px solid #1a1a1a',
                  color: '#fff', outline: 'none',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.05em',
                }}
              />
            </div>

            {error && (
              <div style={{
                fontSize: 12, color: '#f87171',
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: 16, padding: '8px 0',
              }}>
                ERROR: {error}
              </div>
            )}

            {generating && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginTop: 16,
              }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%',
                  border: '2px solid #1a1a1a',
                  borderTopColor: '#fff',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{
                  fontSize: 12, color: '#fff',
                  fontFamily: "'JetBrains Mono', monospace",
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}>
                  ANALYZING {searchTicker}...
                </span>
              </div>
            )}

            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 12,
              marginTop: 24,
            }}>
              <button
                onClick={() => {
                  if (!generating) {
                    setShowGenerateModal(false)
                    setError('')
                    setSearchTicker('')
                  }
                }}
                disabled={generating}
                style={{
                  background: 'transparent',
                  border: '1px solid #1a1a1a',
                  borderRadius: 4, color: '#555',
                  fontSize: 12, padding: '8px 20px',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.05em',
                  cursor: generating ? 'default' : 'pointer',
                  opacity: generating ? 0.4 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                CANCEL
              </button>
              <button
                onClick={generateReport}
                disabled={generating || !searchTicker.trim()}
                style={{
                  background: generating || !searchTicker.trim() ? 'transparent' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${generating || !searchTicker.trim() ? '#1a1a1a' : 'rgba(255,255,255,0.3)'}`,
                  borderRadius: 4,
                  color: generating || !searchTicker.trim() ? '#555' : '#fff',
                  fontSize: 12, padding: '8px 20px',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.05em',
                  cursor: generating || !searchTicker.trim() ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {generating ? 'GENERATING...' : 'GENERATE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowSettings(false) }}
        >
          <div style={{
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 4,
            padding: 32,
            width: '100%', maxWidth: 420,
            margin: '0 20px',
          }}>
            <div style={{
              fontSize: 11, color: '#555',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.15em',
              marginBottom: 24,
            }}>
              SETTINGS
            </div>

            {/* ── Preferences ── */}
            <div style={{
              fontSize: 10, color: '#444',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.15em',
              marginBottom: 16,
            }}>
              PREFERENCES
            </div>

            {/* Default Tab */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 12, color: '#888',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
                marginBottom: 8,
              }}>
                DEFAULT TAB
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['Dashboard', 'Watchlist'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => updateSettings({ defaultTab: tab })}
                    style={{
                      background: settings.defaultTab === tab ? 'rgba(255,255,255,0.06)' : 'transparent',
                      border: `1px solid ${settings.defaultTab === tab ? 'rgba(255,255,255,0.3)' : '#1a1a1a'}`,
                      borderRadius: 4,
                      color: settings.defaultTab === tab ? '#fff' : '#555',
                      fontSize: 12, padding: '6px 14px',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Clock Format */}
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 12, color: '#888',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
                marginBottom: 8,
              }}>
                CLOCK FORMAT
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['12h', '24h'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => updateSettings({ clockFormat: fmt })}
                    style={{
                      background: settings.clockFormat === fmt ? 'rgba(255,255,255,0.06)' : 'transparent',
                      border: `1px solid ${settings.clockFormat === fmt ? 'rgba(255,255,255,0.3)' : '#1a1a1a'}`,
                      borderRadius: 4,
                      color: settings.clockFormat === fmt ? '#fff' : '#555',
                      fontSize: 12, padding: '6px 14px',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderBottom: '1px solid #1a1a1a', margin: '0 0 24px' }} />

            {/* ── Data ── */}
            <div style={{
              fontSize: 10, color: '#444',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.15em',
              marginBottom: 16,
            }}>
              DATA
            </div>

            {/* Clear Watchlist */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 24,
            }}>
              <div>
                <div style={{
                  fontSize: 12, color: '#888',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.05em',
                }}>
                  CLEAR WATCHLIST
                </div>
                <div style={{
                  fontSize: 11, color: '#444',
                  fontFamily: "'JetBrains Mono', monospace",
                  marginTop: 2,
                }}>
                  {watchlist.length} item{watchlist.length !== 1 ? 's' : ''}
                </div>
              </div>
              <button
                onClick={() => { saveWatchlist([]); }}
                disabled={watchlist.length === 0}
                style={{
                  background: watchlist.length > 0 ? 'rgba(248,113,113,0.08)' : 'transparent',
                  border: `1px solid ${watchlist.length > 0 ? 'rgba(248,113,113,0.3)' : '#1a1a1a'}`,
                  borderRadius: 4,
                  color: watchlist.length > 0 ? '#f87171' : '#333',
                  fontSize: 12, padding: '6px 14px',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.05em',
                  cursor: watchlist.length > 0 ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                }}
              >
                CLEAR
              </button>
            </div>

            <div style={{ borderBottom: '1px solid #1a1a1a', margin: '0 0 24px' }} />

            {/* ── Account ── */}
            <div style={{
              fontSize: 10, color: '#444',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.15em',
              marginBottom: 16,
            }}>
              ACCOUNT
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, color: '#555',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
                marginBottom: 4,
              }}>
                SIGNED IN AS
              </div>
              <div style={{
                fontSize: 13, color: '#888',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {session?.user?.email || '—'}
              </div>
            </div>

            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                background: 'transparent',
                border: '1px solid #2a2a2a',
                borderRadius: 4,
                color: '#888',
                fontSize: 12, padding: '8px 20px',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                width: '100%',
              }}
              onMouseEnter={e => { (e.currentTarget).style.color = '#f87171'; (e.currentTarget).style.borderColor = 'rgba(248,113,113,0.3)' }}
              onMouseLeave={e => { (e.currentTarget).style.color = '#888'; (e.currentTarget).style.borderColor = '#2a2a2a' }}
            >
              SIGN OUT
            </button>

            <div style={{ borderBottom: '1px solid #1a1a1a', margin: '24px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #1a1a1a',
                  borderRadius: 4, color: '#555',
                  fontSize: 12, padding: '8px 20px',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
