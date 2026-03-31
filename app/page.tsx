'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Auth from '@/components/Auth'
import ReportView from '@/components/ReportView'
import type { Session, User } from '@supabase/supabase-js'

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

  // App state
  const [mainTab, setMainTab] = useState<'Reports' | 'Watchlist'>('Reports')
  const [searchTicker, setSearchTicker] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  // Report state
  const [currentReport, setCurrentReport] = useState<SavedReport | null>(null)
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [showReport, setShowReport] = useState(false)

  // Watchlist
  const [watchlist, setWatchlist] = useState<string[]>([])

  // ── Auth ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
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
    if (data) setSavedReports(data)
  }, [])

  useEffect(() => {
    if (session) loadReports()
  }, [session, loadReports])

  // ── Load watchlist from localStorage ──
  useEffect(() => {
    const stored = localStorage.getItem('sanctum-watchlist')
    if (stored) setWatchlist(JSON.parse(stored))
  }, [])

  const saveWatchlist = (list: string[]) => {
    setWatchlist(list)
    localStorage.setItem('sanctum-watchlist', JSON.stringify(list))
  }

  const addToWatchlist = (ticker: string) => {
    const upper = ticker.toUpperCase()
    if (!watchlist.includes(upper)) {
      saveWatchlist([...watchlist, upper])
    }
  }

  const removeFromWatchlist = (ticker: string) => {
    saveWatchlist(watchlist.filter(t => t !== ticker))
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

      // Save to Supabase
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

      if (insertError) {
        console.error('Save error:', insertError)
      }

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
      setSearchTicker('')
      loadReports()
    } catch (err: any) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  // ── Loading / Auth gate ──
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#e8ecf1', fontFamily: "'Instrument Serif', serif" }}>Sanctum</div>
      </div>
    )
  }

  if (!session) return <Auth />

  // ── Viewing a report ──
  if (showReport && currentReport) {
    return (
      <div>
        {/* Back bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '10px 28px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setShowReport(false)}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                color: '#8b95a5', fontSize: 13, padding: '8px 16px', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'rgba(59,130,246,0.4)'; (e.target as HTMLElement).style.color = '#e8ecf1' }}
              onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.target as HTMLElement).style.color = '#8b95a5' }}
            >
              &larr; Back
            </button>
            <button
              onClick={() => addToWatchlist(currentReport.ticker)}
              style={{
                background: watchlist.includes(currentReport.ticker) ? 'rgba(74,222,128,0.12)' : 'rgba(59,130,246,0.12)',
                border: `1px solid ${watchlist.includes(currentReport.ticker) ? 'rgba(74,222,128,0.3)' : 'rgba(59,130,246,0.3)'}`,
                borderRadius: 8,
                color: watchlist.includes(currentReport.ticker) ? '#4ade80' : '#60a5fa',
                fontSize: 13, padding: '8px 16px', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                transition: 'all 0.2s ease',
              }}
            >
              {watchlist.includes(currentReport.ticker) ? 'On Watchlist' : '+ Add to Watchlist'}
            </button>
          </div>
        </div>
        <ReportView data={currentReport.data} ai={currentReport.ai} ticker={currentReport.ticker} />
      </div>
    )
  }

  // ── Main App Shell ──
  return (
    <div style={{ minHeight: '100vh', background: '#000000' }}>
      {/* Top Navigation */}
      <nav style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '0 28px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <h1 style={{
              fontSize: 22, fontWeight: 700, color: '#e8ecf1',
              fontFamily: "'Instrument Serif', serif", margin: 0, padding: '16px 0',
            }}>
              Sanctum
            </h1>
            <div style={{ display: 'flex', gap: 0 }}>
              {(['Reports', 'Watchlist'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setMainTab(tab)}
                  style={{
                    padding: '18px 16px 16px', fontSize: 13,
                    fontWeight: mainTab === tab ? 700 : 500,
                    color: mainTab === tab ? '#60a5fa' : '#555',
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: mainTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                    fontFamily: "'DM Sans', sans-serif",
                    transition: 'all 0.25s ease',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 12, color: '#555' }}>{session.user.email}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                color: '#555', fontSize: 12, padding: '6px 12px', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = '#f87171'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = '#555'}
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 28px' }}>

        {/* ── REPORTS TAB ── */}
        {mainTab === 'Reports' && (
          <div style={{
            opacity: 1,
            animation: 'fadeIn 0.3s ease',
          }}>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>

            {/* Search Bar */}
            <div style={{
              display: 'flex', justifyContent: 'center',
              padding: '48px 0 40px',
            }}>
              <div style={{
                width: '100%', maxWidth: 560,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              }}>
                <h2 style={{
                  fontSize: 28, fontWeight: 700, color: '#e8ecf1',
                  fontFamily: "'Instrument Serif', serif", margin: 0, textAlign: 'center',
                }}>
                  Research Terminal
                </h2>
                <p style={{ fontSize: 13, color: '#555', margin: 0, textAlign: 'center' }}>
                  Generate AI-powered equity research reports
                </p>
                <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 8 }}>
                  <input
                    type="text"
                    value={searchTicker}
                    onChange={e => setSearchTicker(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && !generating && generateReport()}
                    placeholder="Enter ticker (AAPL)"
                    disabled={generating}
                    style={{
                      flex: 1, padding: '14px 18px', fontSize: 15,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10, color: '#e8ecf1', outline: 'none',
                      fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                      letterSpacing: 1,
                      transition: 'border-color 0.2s ease',
                    }}
                    onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,0.4)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                  <button
                    onClick={generateReport}
                    disabled={generating || !searchTicker.trim()}
                    style={{
                      padding: '14px 28px', fontSize: 14, fontWeight: 600,
                      background: generating || !searchTicker.trim() ? 'rgba(59,130,246,0.3)' : '#3b82f6',
                      color: '#fff', border: 'none', borderRadius: 10,
                      cursor: generating || !searchTicker.trim() ? 'default' : 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s ease',
                      transform: 'scale(1)',
                    }}
                    onMouseDown={e => { if (!generating) (e.target as HTMLElement).style.transform = 'scale(0.97)' }}
                    onMouseUp={e => (e.target as HTMLElement).style.transform = 'scale(1)'}
                    onMouseLeave={e => (e.target as HTMLElement).style.transform = 'scale(1)'}
                  >
                    {generating ? 'Generating report...' : 'Generate Report'}
                  </button>
                </div>
                {error && (
                  <div style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(248,113,113,0.1)',
                    border: '1px solid rgba(248,113,113,0.2)',
                    borderRadius: 8, fontSize: 13, color: '#f87171',
                  }}>
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* Generating animation */}
            {generating && (
              <div style={{
                display: 'flex', justifyContent: 'center', padding: '20px 0 40px',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '16px 24px', background: 'rgba(59,130,246,0.06)',
                  border: '1px solid rgba(59,130,246,0.15)', borderRadius: 12,
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid rgba(59,130,246,0.3)',
                    borderTopColor: '#3b82f6',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  <span style={{ fontSize: 13, color: '#60a5fa' }}>
                    Analyzing {searchTicker}... Fetching data & generating AI report
                  </span>
                </div>
              </div>
            )}

            {/* Saved Reports Feed */}
            <div style={{ paddingBottom: 60 }}>
              <h3 style={{
                fontSize: 16, fontWeight: 700, color: '#e8ecf1',
                fontFamily: "'Instrument Serif', serif",
                marginBottom: 16, paddingBottom: 10,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                Saved Reports
              </h3>
              {savedReports.length === 0 && !generating && (
                <div style={{
                  textAlign: 'center', padding: '40px 0',
                  color: '#555', fontSize: 13,
                }}>
                  No reports yet. Generate your first report above.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {savedReports.map(report => (
                  <button
                    key={report.id}
                    onClick={() => { setCurrentReport(report); setShowReport(true) }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%', padding: '14px 18px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: 10, cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'left',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.2)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.05)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 8,
                        background: 'rgba(59,130,246,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, color: '#60a5fa',
                        fontFamily: "'DM Sans', sans-serif",
                      }}>
                        {report.ticker.slice(0, 3)}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#e8ecf1', letterSpacing: 0.5 }}>
                          {report.ticker}
                          <span style={{ fontWeight: 400, color: '#555', marginLeft: 8, fontSize: 12 }}>
                            {report.data?.name || ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                          by {report.created_by_email || report.created_by.slice(0, 8)}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#555' }}>
                        {new Date(report.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>
                        {new Date(report.created_at).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── WATCHLIST TAB ── */}
        {mainTab === 'Watchlist' && (
          <div style={{
            paddingTop: 40, paddingBottom: 60,
            animation: 'fadeIn 0.3s ease',
          }}>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>

            <h2 style={{
              fontSize: 24, fontWeight: 700, color: '#e8ecf1',
              fontFamily: "'Instrument Serif', serif", margin: 0, marginBottom: 8,
            }}>
              Watchlist
            </h2>
            <p style={{ fontSize: 13, color: '#555', margin: '0 0 28px' }}>
              Tickers you&apos;re tracking. Click to generate a fresh report.
            </p>

            {watchlist.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '60px 0',
                color: '#555', fontSize: 13,
              }}>
                Your watchlist is empty. Add tickers from a report page.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {watchlist.map(ticker => (
                <div
                  key={ticker}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 18px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 10,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 8,
                      background: 'rgba(59,130,246,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, color: '#60a5fa',
                      fontFamily: "'DM Sans', sans-serif",
                    }}>
                      {ticker.slice(0, 3)}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#e8ecf1', letterSpacing: 1 }}>{ticker}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => {
                        setSearchTicker(ticker)
                        setMainTab('Reports')
                        setTimeout(() => generateReport(), 100)
                      }}
                      style={{
                        background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                        borderRadius: 6, color: '#60a5fa', fontSize: 12, padding: '6px 14px',
                        cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={e => (e.target as HTMLElement).style.background = 'rgba(59,130,246,0.2)'}
                      onMouseLeave={e => (e.target as HTMLElement).style.background = 'rgba(59,130,246,0.1)'}
                    >
                      Generate Report
                    </button>
                    <button
                      onClick={() => removeFromWatchlist(ticker)}
                      style={{
                        background: 'none', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 6, color: '#555', fontSize: 12, padding: '6px 12px',
                        cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={e => { (e.target as HTMLElement).style.color = '#f87171'; (e.target as HTMLElement).style.borderColor = 'rgba(248,113,113,0.3)' }}
                      onMouseLeave={e => { (e.target as HTMLElement).style.color = '#555'; (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
