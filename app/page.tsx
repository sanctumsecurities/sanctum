'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useHoverPopup } from '@/lib/hooks/useHoverPopup'
import Auth from '@/components/Auth'
import dynamic from 'next/dynamic'
import type { Session } from '@supabase/supabase-js'
import SettingsModal from '@/components/SettingsModal'
import FearGreedMeter from '@/components/FearGreedMeter'
import Clock from '@/components/Clock'
import MarketStatus from '@/components/MarketStatus'
import TickerBanner, { DEFAULT_BANNER_TICKERS } from '@/components/TickerBanner'
import ReportCard from '@/components/ReportCard'
import type { SavedReport } from '@/components/ReportCard'

const SectorHeatmap = dynamic(() => import('@/components/SectorHeatmap'), { ssr: false })
const PortfolioPage = dynamic(() => import('@/components/portfolio/PortfolioPage'), { ssr: false })

type HealthStatus = 'ok' | 'degraded' | 'down'
interface ServiceHealth { name: string; status: 'ok' | 'error' | 'unconfigured'; latency: number; detail?: string }
interface HealthData {
  services: ServiceHealth[]
  overallStatus: HealthStatus
  checkedAt: number
  spy?: { price: number; change: number; changePct: number }
}


const BANNER_SPEED_SECS = { fast: 45, regular: 60, slow: 75 } as const

const DEFAULT_SETTINGS = {
  clockFormat: '12h' as '12h' | '24h',
  bannerSpeed: 'regular' as 'fast' | 'regular' | 'slow',
  bannerUpdateFreq: 60_000,
  bannerTickers: DEFAULT_BANNER_TICKERS,
  bannerHoverPause: true,
}

type TabName = 'Dashboard' | 'Watchlist' | 'Portfolio'
const ACTIVE_TAB_KEY = 'sanctum-active-tab'
const VALID_TABS: readonly TabName[] = ['Dashboard', 'Watchlist', 'Portfolio']

function readInitialTab(): TabName {
  if (typeof window === 'undefined') return 'Dashboard'
  try {
    const stored = localStorage.getItem(ACTIVE_TAB_KEY)
    if (stored && VALID_TABS.includes(stored as TabName)) return stored as TabName
  } catch {}
  return 'Dashboard'
}

export type AppSettings = typeof DEFAULT_SETTINGS




export default function Home() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<TabName>(readInitialTab)
  const [searchTicker, setSearchTicker] = useState('')

  const [savedReports, setSavedReports] = useState<SavedReport[]>([])

  const [watchlist, setWatchlist] = useState<string[]>([])
  const [chartData, setChartData] = useState<Record<string, { points: { time: string; price: number }[]; afterHours: { price: number; change: number; changePct: number; label: string } | null; chartPreviousClose: number | null }>>({})

  const [chartRefreshKey, setChartRefreshKey] = useState(0)

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  const [tickerSuggestions, setTickerSuggestions] = useState<Array<{ symbol: string; name: string }>>([])
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [searchFocused, setSearchFocused] = useState(false)
  const searchBarRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [titleWidth, setTitleWidth] = useState<number | undefined>(undefined)
  // ── Health popup ──
  const [healthData, setHealthData] = useState<HealthData | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const {
    showPopup: showHealthPopup,
    fadingOut: healthPopupFadingOut,
    handleMouseEnter: handleStatusMouseEnter,
    handleMouseLeave: handleStatusMouseLeave,
    handlePopupMouseEnter: handlePopupMouseEnter,
    handlePopupMouseLeave: handlePopupMouseLeave,
  } = useHoverPopup()
  const sessionStartRef = useRef<number>(Date.now())
  const [sessionUptimeDisplay, setSessionUptimeDisplay] = useState('00:00:00')

  const loadSettingsFromSupabase = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', userId)
        .single()
      if (data?.settings) {
        const merged = { ...DEFAULT_SETTINGS, ...data.settings }
        setSettings(merged)
        localStorage.setItem('sanctum-settings', JSON.stringify(merged))
      }
    } catch {}
  }, [])

  // ── Auth ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
      if (session?.user?.id) loadSettingsFromSupabase(session.user.id)
    }).catch(() => setLoading(false))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user?.id) {
        loadSettingsFromSupabase(session.user.id)
      } else {
        setSettings(DEFAULT_SETTINGS)
        localStorage.removeItem('sanctum-settings')
      }
    })
    return () => subscription.unsubscribe()
  }, [loadSettingsFromSupabase])

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

  // ── Fetch 1-day chart data for report tickers (batch endpoint) ──
  const fetchedTickersRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (savedReports.length === 0) return
    const tickers = [...new Set(savedReports.map(r => r.ticker))]
    const unfetched = tickers.filter(t => !fetchedTickersRef.current.has(t))
    if (unfetched.length === 0) return
    unfetched.forEach(t => fetchedTickersRef.current.add(t))

    // Batch all tickers into one request
    fetch(`/api/charts?tickers=${encodeURIComponent(unfetched.join(','))}`)
      .then(r => r.json())
      .then((chartMap: Record<string, { points: { time: string; price: number }[]; afterHours: any; chartPreviousClose: number | null }>) => {
        if (chartMap && typeof chartMap === 'object' && !chartMap.error) {
          setChartData(prev => ({ ...prev, ...chartMap }))
        }
      })
      .catch(err => console.error('[charts] batch fetch failed:', err))
  }, [savedReports, chartRefreshKey])

  // Refresh chart data every 5 minutes
  useEffect(() => {
    const id = setInterval(() => {
      fetchedTickersRef.current.clear()
      setChartRefreshKey(k => k + 1)
    }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // ── Load watchlist from localStorage ──
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sanctum-watchlist')
      if (stored) setWatchlist(JSON.parse(stored))
    } catch {}
  }, [])

  // ── Load settings from localStorage (immediate fallback before Supabase responds) ──
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sanctum-settings')
      if (stored) {
        const parsed = JSON.parse(stored)
        const merged = { ...DEFAULT_SETTINGS, ...parsed }
        setSettings(merged)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Persist active tab so refresh keeps the user on the same page ──
  useEffect(() => {
    try { localStorage.setItem(ACTIVE_TAB_KEY, activeTab) } catch {}
  }, [activeTab])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...patch }
      localStorage.setItem('sanctum-settings', JSON.stringify(updated))
      if (session?.user?.id) {
        supabase.from('user_settings')
          .upsert({ user_id: session.user.id, settings: updated, updated_at: new Date().toISOString() })
          .then(({ error }) => { if (error) console.error('[settings] save failed:', error) })
      }
      return updated
    })
  }, [session?.user?.id])

  // ── Measure title widths for search bars ──
  useEffect(() => {
    if (loading) return
    const measure = () => {
      if (titleRef.current) setTitleWidth(titleRef.current.offsetWidth)
    }
    measure()
    document.fonts.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [loading, activeTab])

  // ── Cleanup search debounce on unmount ──
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [])

  // ── Ticker search autocomplete ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchBarRef.current && !searchBarRef.current.contains(e.target as Node)) {
        setTickerSuggestions([])
        setHighlightedIdx(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleTickerSearch = (value: string) => {
    const upper = value.toUpperCase()
    setSearchTicker(upper)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!upper) {
      setTickerSuggestions([])
      setHighlightedIdx(-1)
      return
    }
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(upper)}`)
        const suggestions = await res.json()
        setTickerSuggestions(suggestions)
        setHighlightedIdx(-1)
      } catch {
        setTickerSuggestions([])
      }
    }, 200)
  }

  // ── Health checks ──
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const res = await fetch('/api/health')
      const json = await res.json()
      setHealthData(json)
    } catch {
      setHealthData({ services: [], overallStatus: 'down', checkedAt: Date.now() })
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    fetchHealth()
    const id = setInterval(fetchHealth, 120_000)
    return () => clearInterval(id)
  }, [session, fetchHealth])

  // ── Session uptime ──
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000)
      const h = Math.floor(elapsed / 3600).toString().padStart(2, '0')
      const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0')
      const s = (elapsed % 60).toString().padStart(2, '0')
      setSessionUptimeDisplay(`${h}:${m}:${s}`)
    }, 1000)
    return () => clearInterval(id)
  }, [])

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

  const deleteReport = useCallback(async (id: string) => {
    const { error } = await supabase.from('reports').delete().eq('id', id)
    if (error) {
      console.error('[reports] delete failed:', error)
      return
    }
    setSavedReports(prev => prev.filter(r => r.id !== id))
  }, [])

  const openReport = useCallback((ticker: string) => {
    router.push(`/reports/${ticker.trim().toUpperCase()}`)
  }, [router])

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

  // ── Main Shell ──
  const statusColor = healthData?.overallStatus === 'down' ? '#ef4444'
    : healthData?.overallStatus === 'degraded' ? '#eab308'
    : '#22c55e'
  const statusLabel = healthData?.overallStatus === 'down' ? 'TERMINAL DOWN'
    : healthData?.overallStatus === 'degraded' ? 'TERMINAL DEGRADED'
    : 'TERMINAL ACTIVE'

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', overflowX: 'hidden', maxWidth: '100vw' }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(8px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .ticker-scroll {
          animation: tickerScroll 60s linear infinite;
        }
        .ticker-scroll.ticker-hover-pause:hover {
          animation-play-state: paused;
        }
        @keyframes shimmerSweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(167%); }
        }
        .shimmer-underline {
          position: relative;
          height: 1px;
          width: 100%;
          background: #333;
          overflow: hidden;
        }
        .shimmer-underline.active::after {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 60%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent              0%,
            transparent              5%,
            rgba(255,255,255,0.42)  40%,
            rgba(255,255,255,0.50)  50%,
            rgba(255,255,255,0.42)  60%,
            transparent             95%,
            transparent            100%
          );
          animation: shimmerSweep 3.5s linear infinite;
        }
        @media (max-width: 768px) {
          .nav-links-desktop { display: none !important; }
          .hamburger-btn { display: flex !important; }
          .hero-title { font-size: 36px !important; letter-spacing: 0.2em !important; }
          .main-content { padding-left: 24px !important; padding-right: 24px !important; }
          .nav-inner { padding-left: 20px !important; padding-right: 20px !important; }
          .reports-grid { grid-template-columns: 1fr 1fr !important; }
          .reports-grid > div { transform-origin: center center !important; }
          .nav-status { display: none !important; }
          .sector-heatmap-desktop { display: none !important; }
        }
        @media (min-width: 769px) and (max-width: 1200px) {
          .reports-grid { grid-template-columns: repeat(4, 1fr) !important; gap: 10px !important; }
          .reports-grid > div:nth-child(4n+1) { transform-origin: left center !important; }
          .reports-grid > div:nth-child(4n) { transform-origin: right center !important; }
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
        {/* Left: Terminal status + clock — flush to viewport edge */}
        <div className="nav-status" style={{
          position: 'absolute', left: 0, top: 0, height: 56,
          display: 'flex', alignItems: 'center', gap: 0,
          paddingLeft: 'clamp(20px, 2.5vw, 56px)', zIndex: 1,
          maxWidth: 'calc(50% - 160px)',
        }}>
          {/* Hoverable status indicator with popup */}
          <div
            style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}
            onMouseEnter={handleStatusMouseEnter}
            onMouseLeave={handleStatusMouseLeave}
          >
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: statusColor,
              animation: 'pulse 2s ease-in-out infinite',
              flexShrink: 0,
              transition: 'background 0.4s ease',
              boxShadow: `0 0 8px 2px ${statusColor}66`,
            }} />
            <span style={{
              fontSize: 11, color: statusColor,
              letterSpacing: '0.15em',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 500,
              transition: 'color 0.4s ease',
            }}>
              {statusLabel}
            </span>

            {/* ── Health Popup Panel ── */}
            {showHealthPopup && (
              <div
                onMouseEnter={handlePopupMouseEnter}
                onMouseLeave={handlePopupMouseLeave}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 22px)',
                  left: -20,
                  width: 310,
                  background: '#0f0f0f',
                  border: '1px solid #1a1a1a',
                  borderRadius: 4,
                  padding: '16px 20px',
                  zIndex: 200,
                  animation: healthPopupFadingOut ? 'fadeOut 0.15s ease forwards' : 'fadeIn 0.15s ease',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                }}
              >
                {/* Header */}
                {(() => {
                  const total = healthData?.services.length ?? 0
                  const active = healthData?.services.filter(s => s.status === 'ok').length ?? 0
                  const activeColor = active === total && total > 0 ? '#22c55e' : active <= 1 ? '#ef4444' : '#f59e0b'
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <span style={{ fontSize: 11, color: '#666', letterSpacing: '0.2em', fontFamily: "'JetBrains Mono', monospace" }}>
                        SYSTEM HEALTH
                      </span>
                      <span style={{ fontSize: 11, color: activeColor, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
                        {active}/{total} ACTIVE
                      </span>
                    </div>
                  )
                })()}

                {/* Service rows */}
                {(healthData?.services ?? []).map(svc => {
                  const isOnline = svc.status === 'ok'
                  const isUnconfigured = svc.status === 'unconfigured'
                  const statusLabel = isOnline ? 'ONLINE' : isUnconfigured ? 'N/A' : 'OFFLINE'
                  const statusColor = isOnline ? '#22c55e' : isUnconfigured ? '#555' : '#ef4444'
                  return (
                    <div key={svc.name} style={{ padding: '8px 0', borderBottom: '1px solid #111' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#777', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
                          {svc.name.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: statusColor, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
                          {statusLabel}
                        </span>
                      </div>
                      {svc.detail && !isOnline && (
                        <div style={{ fontSize: 9, color: '#555', fontFamily: "'JetBrains Mono', monospace", marginTop: 2, textAlign: 'right' }}>
                          {svc.detail.slice(0, 50)}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Footer */}
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={e => { e.stopPropagation(); fetchHealth() }}
                    disabled={healthLoading}
                    style={{
                      background: 'none', border: 'none', cursor: healthLoading ? 'default' : 'pointer',
                      color: healthLoading ? '#666' : '#555',
                      fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '0.1em', padding: 0,
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={e => { if (!healthLoading) (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = healthLoading ? '#666' : '#555' }}
                  >
                    {healthLoading ? 'CHECKING...' : '↺ REFRESH'}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#666', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
                      UPTIME
                    </span>
                    <span style={{ fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>
                      {sessionUptimeDisplay}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <span style={{
            color: '#333', fontSize: 14,
            margin: '0 18px',
            userSelect: 'none',
            lineHeight: 1,
          }}>|</span>
          <MarketStatus />
          <span style={{
            color: '#333', fontSize: 14,
            margin: '0 18px',
            userSelect: 'none',
            lineHeight: 1,
          }}>|</span>
          <FearGreedMeter />
        </div>

        <div className="nav-inner" style={{
          maxWidth: 1800, margin: '0 auto', padding: '0 40px',
          display: 'flex', alignItems: 'center',
          height: '100%', position: 'relative',
        }}>
          {/* Center: Nav links (desktop) */}
          <div className="nav-links-desktop" style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 32,
            background: '#0a0a0a', padding: '0 20px',
            zIndex: 2,
          }}>
            {(['Dashboard', 'Portfolio', 'Watchlist'] as const).map(tab => {
              const isActive = tab === activeTab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 400,
                    color: isActive ? '#fff' : '#888',
                    fontFamily: "'JetBrains Mono', monospace",
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

        </div>

        {/* Right: Icons — flush to viewport edge */}
        <div style={{
          position: 'absolute', right: 0, top: 0, height: 56,
          display: 'flex', alignItems: 'center',
          paddingRight: 'clamp(20px, 2.5vw, 56px)', gap: 12,
          maxWidth: 'calc(50% - 160px)',
        }}>
            <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Clock format={settings.clockFormat} />
              <span style={{ width: 1, height: 16, background: '#2a2a2a', flexShrink: 0 }} />
            </div>
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

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <div className="mobile-menu" style={{
            position: 'absolute', top: 84 /* 56 nav + 28 ticker banner */, left: 0, right: 0,
            background: '#0a0a0a', borderBottom: '1px solid #1a1a1a',
            padding: '8px 20px 16px',
            display: 'flex', flexDirection: 'column', gap: 0,
          }}>
            {(['Dashboard', 'Portfolio', 'Watchlist'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setMobileMenuOpen(false) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, color: tab === activeTab ? '#fff' : '#888',
                  fontFamily: "'JetBrains Mono', monospace",
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

      <TickerBanner
        speed={BANNER_SPEED_SECS[settings.bannerSpeed]}
        updateFreq={settings.bannerUpdateFreq}
        tickers={settings.bannerTickers}
        hoverPause={settings.bannerHoverPause}
      />

      {/* ── Main Content ── */}
      <main style={{ paddingTop: 84 }}>

        {/* ══ DASHBOARD ══ */}
        {activeTab === 'Dashboard' && (
          <div className="main-content" style={{
            padding: '40px clamp(24px, 3vw, 64px) 0',
            maxWidth: '100%', margin: '0 auto',
            animation: 'fadeIn 0.3s ease',
            boxSizing: 'border-box',
            overflowX: 'hidden',
          }}>
            {/* Hero row: title + search on left, heatmap on right */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flexShrink: 0 }}>
            {/* Hero heading */}
            <h1 ref={titleRef} className="hero-title" style={{
              fontSize: 64, fontWeight: 700, color: '#fff',
              letterSpacing: '0.08em',
              fontFamily: "'JetBrains Mono', monospace",
              margin: 0, lineHeight: 1,
              width: 'fit-content',
            }}>
              SANCTUM
            </h1>

            {/* Ticker search bar */}
            <div
              ref={searchBarRef}
              style={{ marginTop: 40, position: 'relative', width: titleWidth ?? 420 }}
            >
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 0',
                  background: 'transparent',
                }}
              >
                <span style={{
                    fontSize: 12, color: searchFocused ? '#fff' : '#444',
                    fontFamily: "'JetBrains Mono', monospace",
                    flexShrink: 0, userSelect: 'none',
                    transition: 'color 0.2s ease',
                  }}>
                    &gt;
                  </span>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTicker}
                  onChange={e => handleTickerSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onKeyDown={e => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setHighlightedIdx(prev => Math.min(prev + 1, tickerSuggestions.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setHighlightedIdx(prev => Math.max(prev - 1, -1))
                    } else if (e.key === 'Enter') {
                      if (highlightedIdx >= 0 && tickerSuggestions[highlightedIdx]) {
                        const t = tickerSuggestions[highlightedIdx]
                        setSearchTicker('')
                        setTickerSuggestions([])
                        setHighlightedIdx(-1)
                        openReport(t.symbol)
                      } else if (searchTicker.trim()) {
                        setTickerSuggestions([])
                        openReport(searchTicker)
                      }
                    } else if (e.key === 'Escape') {
                      setTickerSuggestions([])
                      setHighlightedIdx(-1)
                    }
                  }}
                  placeholder="ENTER TICKER TO GENERATE REPORT"
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.05em',
                    outline: 'none',
                    cursor: 'text',
                  }}
                />
              </div>

              <div className={`shimmer-underline${searchFocused ? ' active' : ''}`} />

              {/* Autocomplete suggestions */}
              {tickerSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  background: '#0a0a0a',
                  border: '1px solid #444',
                  borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  zIndex: 50,
                  overflow: 'hidden',
                }}>
                  {tickerSuggestions.map((t, i) => (
                    <div
                      key={t.symbol}
                      onMouseDown={e => {
                        e.preventDefault()
                        setSearchTicker('')
                        setTickerSuggestions([])
                        setHighlightedIdx(-1)
                        openReport(t.symbol)
                      }}
                      onMouseEnter={() => setHighlightedIdx(i)}
                      onMouseLeave={() => setHighlightedIdx(-1)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '10px 16px',
                        background: highlightedIdx === i ? 'rgba(255,255,255,0.05)' : 'transparent',
                        cursor: 'pointer',
                        borderTop: i > 0 ? '1px solid #1a1a1a' : 'none',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <span style={{
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: highlightedIdx === i ? '#fff' : '#ccc',
                        letterSpacing: '0.05em',
                        minWidth: 56,
                        flexShrink: 0,
                        transition: 'color 0.1s ease',
                      }}>
                        {t.symbol}
                      </span>
                      <span style={{
                        fontSize: 11,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: '#444',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {t.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

            </div>
            </div>{/* end hero-left */}

            {/* Sector Heatmap — desktop only */}
            <div className="sector-heatmap-desktop" style={{ flexShrink: 0, width: 'clamp(600px, 50vw, 1100px)', marginTop: 4 }}>
              <SectorHeatmap />
            </div>
            </div>{/* end hero row */}

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
                  Type a ticker above to analyze a stock.
                </p>
              </div>
            ) : (
              <div style={{ marginTop: 56, paddingBottom: 60, overflowX: 'clip' }}>
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
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 10,
                }}>
                  {savedReports.map((report, index) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      chartData={chartData[report.ticker]}
                      focusedCardId={focusedCardId}
                      colIndex={index % 4}
                      onDelete={deleteReport}
                      onFocus={setFocusedCardId}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ PORTFOLIO ══ */}
        {activeTab === 'Portfolio' && session && (
          <PortfolioPage session={session} />
        )}

        {/* ══ WATCHLIST ══ */}
        {activeTab === 'Watchlist' && (
          <div className="main-content" style={{
            padding: '60px clamp(24px, 3vw, 64px) 0',
            maxWidth: 1800, margin: '0 auto',
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
                        onClick={() => openReport(ticker)}
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

      {/* ── Settings Modal ── */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          updateSettings={updateSettings}
          watchlist={watchlist}
          saveWatchlist={saveWatchlist}
          session={session}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
