'use client'

import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Auth from '@/components/Auth'
import dynamic from 'next/dynamic'
import type { Session } from '@supabase/supabase-js'
import SettingsModal from '@/components/SettingsModal'
import FearGreedMeter from '@/components/FearGreedMeter'

const MatrixScatter = dynamic(() => import('@/components/MatrixScatter'), { ssr: false })

interface SavedReport {
  id: string
  ticker: string
  data: any
  created_by: string
  created_by_email: string | null
  created_at: string
}

type HealthStatus = 'ok' | 'degraded' | 'down'
type TickerItem = {
  symbol: string
  label: string
  price: number
  change: number
  changePct: number
}
interface ServiceHealth { name: string; status: 'ok' | 'error' | 'unconfigured'; latency: number; detail?: string }
interface HealthData {
  services: ServiceHealth[]
  overallStatus: HealthStatus
  checkedAt: number
  spy?: { price: number; change: number; changePct: number }
}



// ── Isolated Clock (re-renders only itself every second) ──
function Clock({ format }: { format: '12h' | '24h' }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ fontSize: 14, color: '#666', fontFamily: "'JetBrains Mono', monospace" }}>
      {time.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      }) + ', ' + time.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: format === '12h',
      })}
    </span>
  )
}

// ── Market Hours Status ──
function MarketStatus() {
  const [now, setNow] = useState(new Date())
  const [showPopup, setShowPopup] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const [userTz] = useState<string>(() => {
    const parts = Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value ?? 'LOCAL'
  })
  const hoverEnterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    return () => {
      if (hoverEnterTimer.current) clearTimeout(hoverEnterTimer.current)
      if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current)
      if (fadeOutTimer.current) clearTimeout(fadeOutTimer.current)
    }
  }, [])

  const pad = (n: number) => n.toString().padStart(2, '0')

  // NYSE market holidays (YYYY-MM-DD in ET)
  const NYSE_HOLIDAYS = new Set([
    // 2025
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
    '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
    // 2026
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    // 2027
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
    '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  ])

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now)
  const etH = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
  const etM = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
  const etS = parseInt(parts.find(p => p.type === 'second')?.value ?? '0')
  const etDayName = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  const etDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(etDayName)
  const etYear = parts.find(p => p.type === 'year')?.value ?? '2025'
  const etMonth = parts.find(p => p.type === 'month')?.value ?? '01'
  const etDate = parts.find(p => p.type === 'day')?.value ?? '01'
  const etDateStr = `${etYear}-${etMonth}-${etDate}`
  const totalSec = etH * 3600 + etM * 60 + etS
  const isWeekend = etDay === 0 || etDay === 6
  const isHoliday = NYSE_HOLIDAYS.has(etDateStr)

  let label: string, color: string, nextPhase: string, nextPhaseColor: string, secsUntil: number

  const isTradingDay = !isWeekend && !isHoliday
  if (isTradingDay && totalSec >= 4 * 3600 && totalSec < 9 * 3600 + 1800) {
    label = 'PRE-MARKET'; color = '#eab308'
    nextPhase = 'MARKET OPEN'; nextPhaseColor = '#22c55e'
    secsUntil = (9 * 3600 + 1800) - totalSec
  } else if (isTradingDay && totalSec >= 9 * 3600 + 1800 && totalSec < 16 * 3600) {
    label = 'MARKET OPEN'; color = '#22c55e'
    nextPhase = 'AFTER-HOURS'; nextPhaseColor = '#f97316'
    secsUntil = 16 * 3600 - totalSec
  } else if (isTradingDay && totalSec >= 16 * 3600 && totalSec < 20 * 3600) {
    label = 'AFTER-HOURS'; color = '#f97316'
    nextPhase = 'MARKET CLOSED'; nextPhaseColor = '#444'
    secsUntil = 20 * 3600 - totalSec
  } else {
    label = 'MARKET CLOSED'; color = '#444'
    nextPhase = 'PRE-MARKET'; nextPhaseColor = '#eab308'
    // Start from next day if we're on a non-trading day or past 8pm
    let daysAhead = (isWeekend || isHoliday || totalSec >= 20 * 3600) ? 1 : 0
    // Skip forward past weekends and holidays to find the next actual trading day
    while (daysAhead > 0) {
      const checkDate = new Date(now.getTime() + daysAhead * 86400 * 1000)
      const checkParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      }).formatToParts(checkDate)
      const checkDayName = checkParts.find(p => p.type === 'weekday')?.value ?? 'Mon'
      const checkDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(checkDayName)
      const checkDateStr = `${checkParts.find(p => p.type === 'year')?.value}-${checkParts.find(p => p.type === 'month')?.value}-${checkParts.find(p => p.type === 'day')?.value}`
      if (checkDay !== 0 && checkDay !== 6 && !NYSE_HOLIDAYS.has(checkDateStr)) break
      daysAhead++
    }
    secsUntil = daysAhead * 86400 + 4 * 3600 - totalSec
  }

  const countdownDays = Math.floor(secsUntil / 86400)
  const countdownRem = secsUntil % 86400
  const countdown = countdownDays > 0
    ? `${pad(countdownDays)}:${pad(Math.floor(countdownRem / 3600))}:${pad(Math.floor((countdownRem % 3600) / 60))}:${pad(countdownRem % 60)}`
    : `${pad(Math.floor(secsUntil / 3600))}:${pad(Math.floor((secsUntil % 3600) / 60))}:${pad(secsUntil % 60)}`

  const startFadeOut = useCallback(() => {
    setFadingOut(true)
    fadeOutTimer.current = setTimeout(() => { setShowPopup(false); setFadingOut(false) }, 150)
  }, [])

  const cancelFadeOut = useCallback(() => {
    if (fadeOutTimer.current) { clearTimeout(fadeOutTimer.current); fadeOutTimer.current = null }
    setFadingOut(false)
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (hoverLeaveTimer.current) { clearTimeout(hoverLeaveTimer.current); hoverLeaveTimer.current = null }
    cancelFadeOut()
    if (!showPopup) hoverEnterTimer.current = setTimeout(() => setShowPopup(true), 200)
  }, [showPopup, cancelFadeOut])

  const handleMouseLeave = useCallback(() => {
    if (hoverEnterTimer.current) { clearTimeout(hoverEnterTimer.current); hoverEnterTimer.current = null }
    hoverLeaveTimer.current = setTimeout(startFadeOut, 100)
  }, [startFadeOut])

  const handlePopupMouseEnter = useCallback(() => {
    if (hoverLeaveTimer.current) { clearTimeout(hoverLeaveTimer.current); hoverLeaveTimer.current = null }
    cancelFadeOut()
  }, [cancelFadeOut])

  const handlePopupMouseLeave = useCallback(() => {
    startFadeOut()
  }, [startFadeOut])

  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span style={{
        fontSize: 11, color,
        letterSpacing: '0.15em',
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 500,
        transition: 'color 0.4s ease',
      }}>
        {label}
      </span>

      {showPopup && (
        <div
          onMouseEnter={handlePopupMouseEnter}
          onMouseLeave={handlePopupMouseLeave}
          style={{
            position: 'absolute',
            top: 'calc(100% + 22px)',
            left: '50%',
            marginLeft: -155,
            width: 310,
            background: '#0f0f0f',
            border: '1px solid #1a1a1a',
            borderRadius: 4,
            padding: '16px 20px',
            zIndex: 200,
            animation: fadingOut ? 'fadeOut 0.15s ease forwards' : 'fadeIn 0.15s ease',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
        >
          {/* Rows */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #111' }}>
            <span style={{ fontSize: 12, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
              NEXT PHASE
            </span>
            <span style={{ fontSize: 11, color: nextPhaseColor, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
              {nextPhase}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #111' }}>
            <span style={{ fontSize: 12, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
              TIME REMAINING
            </span>
            <span style={{ fontSize: 13, color: '#bbb', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
              {countdown}
            </span>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#444', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
              YOUR TIMEZONE
            </span>
            <span style={{ fontSize: 11, color: '#333', fontFamily: "'JetBrains Mono', monospace" }}>
              {userTz}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Instrument list — keep in sync with INSTRUMENTS in app/api/ticker-band/route.ts
const TICKER_BAND_INSTRUMENTS = [
  { symbol: '^GSPC', label: 'S&P 500 (^GSPC)' },
  { symbol: '^IXIC', label: 'NASDAQ (^IXIC)' },
  { symbol: '^DJI', label: 'DOW (^DJI)' },
  { symbol: '^RUT', label: 'RUSSELL (^RUT)' },
  { symbol: '^VIX', label: 'VIX (^VIX)' },
  { symbol: 'GC=F', label: 'GOLD (GC=F)' },
  { symbol: 'CL=F', label: 'OIL (CL=F)' },
]

const DEFAULT_BANNER_TICKERS = TICKER_BAND_INSTRUMENTS.map(i => i.symbol)

const BANNER_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TICKER_BAND_INSTRUMENTS.map(({ symbol, label }) => [symbol, label])
)

const BANNER_SPEED_SECS = { fast: 45, regular: 60, slow: 75 } as const

const DEFAULT_SETTINGS = {
  defaultTab: 'Dashboard' as 'Dashboard' | 'Matrix' | 'Watchlist',
  clockFormat: '12h' as '12h' | '24h',
  bannerSpeed: 'regular' as 'fast' | 'regular' | 'slow',
  bannerUpdateFreq: 60_000,
  bannerTickers: DEFAULT_BANNER_TICKERS,
  bannerHoverPause: true,
  matrixCustomTickers: [] as string[],
}

export type AppSettings = typeof DEFAULT_SETTINGS

interface TickerBannerProps {
  speed: number
  updateFreq: number
  tickers: string[]
  hoverPause: boolean
}

function TickerBanner({ speed, updateFreq, tickers, hoverPause }: TickerBannerProps) {
  const [items, setItems] = useState<TickerItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [stale, setStale] = useState(false)

  const tickersKey = tickers.join(',')

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ tickers: tickersKey })
      const res = await fetch(`/api/ticker-band?${params}`)
      if (!res.ok) { setStale(true); return }
      const data: TickerItem[] = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setItems(data)
        setLoaded(true)
        setStale(false)
      }
    } catch (err) {
      setStale(true)
      if (process.env.NODE_ENV === 'development') console.warn('[TickerBanner] fetch failed:', err)
    }
  }, [tickersKey])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, updateFreq)
    return () => clearInterval(id)
  }, [fetchData, updateFreq])

  const displayItems: TickerItem[] = loaded
    ? items
    : tickers.map(symbol => ({ symbol, label: BANNER_LABEL_MAP[symbol] ?? symbol, price: 0, change: 0, changePct: 0 }))

  const renderStrip = (keyPrefix: string) =>
    displayItems.flatMap((item) => {
      const isUp = item.change >= 0
      const color = loaded ? (isUp ? '#22c55e' : '#f87171') : '#333'
      const sign = item.change > 0 ? '+' : ''
      const pctStr = loaded ? `${sign}${item.changePct.toFixed(2)}%` : '\u2014'
      const priceStr = loaded
        ? item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '\u2014'
      const arrow = loaded ? (isUp ? '\u25b2' : '\u25bc') : ''

      return [
        <span
          key={`${keyPrefix}-${item.symbol}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span style={{ color: '#444', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em' }}>
            {item.label}
          </span>
          <span style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            {priceStr}
          </span>
          <span style={{ color, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            {arrow ? `${arrow} ` : ''}{pctStr}
          </span>
        </span>,
        <span
          key={`${keyPrefix}-${item.symbol}-sep`}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, color: '#2a2a2a', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
        >
          ·
        </span>,
      ]
    })

  return (
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0, zIndex: 99,
      height: 34,
      background: '#080808',
      borderBottom: '1px solid #1a1a1a',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center',
      opacity: stale ? 0.45 : 1,
      transition: 'opacity 0.5s ease',
    }}>
      <div
        className={hoverPause ? 'ticker-scroll ticker-hover-pause' : 'ticker-scroll'}
        style={{ display: 'inline-flex', whiteSpace: 'nowrap', alignItems: 'center', animationDuration: `${speed}s` }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {renderStrip('a')}
        </span>
        <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
          {renderStrip('b')}
        </span>
      </div>
    </div>
  )
}

// ── Memoized Report Card (skips re-render unless its own data changes) ──
interface ReportCardProps {
  report: SavedReport
  chartData: { points: { time: string; price: number }[]; afterHours: { price: number; change: number; changePct: number; label: string } | null; chartPreviousClose: number | null } | undefined
  focusedCardId: string | null
  colIndex: number
  onDelete: (id: string) => void
  onFocus: (id: string | null) => void
}

const PERIODS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y'] as const
type Period = typeof PERIODS[number]

const etFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

const ReportCard = memo(function ReportCard({ report, chartData: initialChartData, focusedCardId, colIndex, onDelete, onFocus }: ReportCardProps) {
  const router = useRouter()
  const d = report.data || {}
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('1D')
  const [periodCache, setPeriodCache] = useState<
    Record<string, { points: { time: string; price: number }[]; afterHours: { price: number; change: number; changePct: number; label: string } | null; chartPreviousClose: number | null } | null>
  >({})
  const [isFetchingPeriod, setIsFetchingPeriod] = useState(false)

  // Active chart data: 1D uses prop from parent; other periods use local cache
  const tickerChart = selectedPeriod === '1D'
    ? initialChartData
    : (periodCache[selectedPeriod] ?? undefined)

  const sentiment = d.verdict || ''
  const price = parseFloat(String(d.currentPrice).replace(/[^0-9.]/g, '')) || null

  // For non-1D periods, use chartPreviousClose (close of last session before period) as reference
  const chartPoints = tickerChart?.points
  const periodRef = chartPoints && chartPoints.length >= 2 && selectedPeriod !== '1D' ? (tickerChart?.chartPreviousClose ?? chartPoints[0].price) : null
  const periodLast = chartPoints && chartPoints.length >= 2 ? chartPoints[chartPoints.length - 1].price : null
  const periodPriceChange = periodRef && periodLast ? periodLast - periodRef : null
  const periodPriceChangePct = periodRef && periodLast ? ((periodLast - periodRef) / periodRef) * 100 : null

  // For 1D, derive change from chart data
  const chart1DRef = selectedPeriod === '1D' && chartPoints && chartPoints.length >= 2
    ? (tickerChart?.chartPreviousClose ?? chartPoints[0].price) : null
  const chart1DLast = selectedPeriod === '1D' && chartPoints && chartPoints.length >= 2
    ? chartPoints[chartPoints.length - 1].price : null
  const chart1DChange = chart1DRef && chart1DLast ? chart1DLast - chart1DRef : null
  const chart1DChangePct = chart1DRef && chart1DLast ? ((chart1DLast - chart1DRef) / chart1DRef) * 100 : null

  const priceChange = selectedPeriod === '1D' ? chart1DChange : periodPriceChange
  const priceChangePct = selectedPeriod === '1D' ? chart1DChangePct : periodPriceChangePct
  const isUp = priceChange !== null && priceChange >= 0
  const ah = selectedPeriod === '1D' ? (tickerChart?.afterHours || null) : null

  // Compute 1D ET time window for consistent time-based positioning (chart + tooltip)
  const dayWindow = useMemo(() => {
    const pts = tickerChart?.points
    if (selectedPeriod !== '1D' || !pts || pts.length < 2) return null
    const endMs = new Date(pts[pts.length - 1].time).getTime()
    const etParts = etFormatter.formatToParts(new Date(endMs))
    const pyr = etParts.find(p => p.type === 'year')?.value ?? '2024'
    const pmo = etParts.find(p => p.type === 'month')?.value ?? '01'
    const pda = etParts.find(p => p.type === 'day')?.value ?? '01'
    const pH  = etParts.find(p => p.type === 'hour')?.value ?? '00'
    const pM  = etParts.find(p => p.type === 'minute')?.value ?? '00'
    const pS  = etParts.find(p => p.type === 'second')?.value ?? '00'
    const probeEtFakeUtcMs = Date.parse(`${pyr}-${pmo}-${pda}T${pH}:${pM}:${pS}Z`)
    const offsetMs = endMs - probeEtFakeUtcMs
    const etMidnightUtcMs = Date.parse(`${pyr}-${pmo}-${pda}T00:00:00Z`) + offsetMs
    return {
      period1Ms: etMidnightUtcMs + 4  * 60 * 60 * 1000,  // 4 AM ET
      period2Ms: etMidnightUtcMs + 20 * 60 * 60 * 1000,  // 8 PM ET
      etMidnightUtcMs,
    }
  }, [tickerChart?.points, selectedPeriod])

  const handlePeriodSelect = useCallback(async (period: Period) => {
    setSelectedPeriod(period)
    if (period === '1D' || periodCache[period] !== undefined) return
    setIsFetchingPeriod(true)
    try {
      const res = await fetch(`/api/charts?tickers=${encodeURIComponent(report.ticker)}&period=${period}`)
      const data = await res.json()
      setPeriodCache(prev => ({ ...prev, [period]: data[report.ticker] ?? null }))
    } catch {
      setPeriodCache(prev => ({ ...prev, [period]: null }))
    } finally {
      setIsFetchingPeriod(false)
    }
  }, [periodCache, report.ticker])

  const sentimentColor = sentiment === 'BUY' ? '#22c55e'
    : (sentiment === 'SELL' || sentiment === 'AVOID') ? '#f87171' : '#eab308'

  const creatorEmail = report.created_by_email || ''
  const creatorName = creatorEmail ? creatorEmail.split('@')[0] : 'unknown'

  return (
    <div
      className="report-card"
      style={{
        background: '#0f0f0f',
        border: '1px solid #1a1a1a',
        borderRadius: 6,
        padding: 14,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        aspectRatio: 'auto',
        position: 'relative',
        transformOrigin: colIndex === 0 ? 'left center' : colIndex === 3 ? 'right center' : 'center center',
      }}
      onClick={() => {
        router.push(`/reports/${report.ticker}`)
      }}
      onTouchStart={() => {
        onFocus(focusedCardId === report.id ? null : report.id)
      }}
    >
      {/* Header: Ticker + Sentiment */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{
            fontSize: 17, fontWeight: 700, color: '#fff',
            letterSpacing: '0.05em',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {report.ticker}
          </div>
          <div style={{
            fontSize: 11, color: '#555', marginTop: 2,
            fontFamily: "'DM Sans', sans-serif",
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 140,
          }}>
            {d.companyName || ''}
          </div>
        </div>
        {sentiment && (() => {
          const low = d.fiftyTwoWeekLow
          const high = d.fiftyTwoWeekHigh
          const buyLow = low && high ? low + (high - low) * 0.05 : null
          const buyHigh = low && high ? low + (high - low) * 0.35 : null
          return (
            <div style={{
              flexShrink: 0,
              textAlign: 'right',
            }}>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: sentimentColor,
                letterSpacing: '0.08em',
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: 'uppercase',
              }}>
                {sentiment}
              </div>
              {buyLow != null && buyHigh != null && (
                <div style={{
                  fontSize: 9, color: '#666',
                  fontFamily: "'JetBrains Mono', monospace",
                  marginTop: 3,
                  letterSpacing: '0.03em',
                }}>
                  BUY ${buyLow.toFixed(0)}–${buyHigh.toFixed(0)}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Price */}
      <div style={{ marginBottom: 14 }}>
        <span style={{
          fontSize: 26, fontWeight: 600, color: '#fff',
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
        gap: '8px', marginBottom: 14,
      }}>
        {(() => {
          const km = d.overview?.keyMetrics || []
          const find = (s: string) => km.find((k: any) => k.label?.toLowerCase().includes(s))?.value || '—'
          return [
            { label: 'MKT CAP', value: d.marketCap || find('market cap') },
            { label: 'FWD P/E', value: find('p/e') },
            { label: 'BETA', value: find('beta') },
            { label: 'DIV YIELD', value: find('dividend') },
          ]
        })().map((m, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em', marginBottom: 4 }}>
              {m.label}
            </div>
            <div style={{ fontSize: 16, color: '#ddd', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
              {m.value}
            </div>
          </div>
        ))}
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
        {/* Timeframe selector */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={e => { e.stopPropagation(); handlePeriodSelect(p) }}
              style={{
                fontSize: 9,
                padding: '2px 5px',
                background: selectedPeriod === p ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: selectedPeriod === p ? '#ccc' : '#3a3a3a',
                border: `1px solid ${selectedPeriod === p ? 'rgba(255,255,255,0.12)' : 'transparent'}`,
                borderRadius: 3,
                cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.04em',
                lineHeight: 1,
              }}
            >
              {p}
            </button>
          ))}
        </div>
      <div
        style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', position: 'relative' }}
        onMouseMove={e => {
          const container = e.currentTarget
          const rect = container.getBoundingClientRect()
          const crosshair = container.querySelector('[data-crosshair]') as HTMLElement | null
          const dot = container.querySelector('[data-dot]') as HTMLElement | null
          const tip = container.querySelector('[data-tip]') as HTMLElement | null
          const pts = tickerChart?.points
          if (!crosshair || !dot || !tip || !pts || pts.length < 2) return

          const localW = rect.width
          const localH = rect.height
          const x = e.clientX - rect.left
          const pct = Math.max(0, Math.min(1, x / localW))
          let idx: number
          if (selectedPeriod === '1D' && dayWindow) {
            // Time-based lookup: match the chart's time-based x positioning
            const cursorMs = dayWindow.period1Ms + pct * (dayWindow.period2Ms - dayWindow.period1Ms)
            idx = 0
            let bestDist = Infinity
            for (let i = 0; i < pts.length; i++) {
              const dist = Math.abs(new Date(pts[i].time).getTime() - cursorMs)
              if (dist < bestDist) { bestDist = dist; idx = i }
            }
          } else {
            idx = Math.round(pct * (pts.length - 1))
          }
          const pt = pts[idx]
          const refPrice = (selectedPeriod !== '1D' && tickerChart?.chartPreviousClose) ? tickerChart.chartPreviousClose : pts[0].price
          const changeFromRef = refPrice > 0 ? ((pt.price - refPrice) / refPrice) * 100 : 0
          const isChartUp = pt.price >= refPrice

          const min = Math.min(...pts.map(p => p.price))
          const max = Math.max(...pts.map(p => p.price))
          const range = max - min || 1
          const padRatio = 12 / 80
          const rangeRatio = (80 - 12 - 2) / 80
          const yPct = padRatio + (1 - (pt.price - min) / range) * rangeRatio
          const dotY = yPct * localH

          crosshair.style.left = `${x}px`
          crosshair.style.display = 'block'
          dot.style.left = `${x}px`
          dot.style.top = `${dotY}px`
          dot.style.display = 'block'
          dot.style.background = isChartUp ? '#22c55e' : '#f87171'

          const timeStr = selectedPeriod === '1D'
            ? new Date(pt.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : selectedPeriod === '5D'
            ? new Date(pt.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + new Date(pt.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : new Date(pt.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const changeStr = `${changeFromRef >= 0 ? '+' : ''}${changeFromRef.toFixed(2)}%`
          const changeColor = changeFromRef >= 0 ? '#22c55e' : '#f87171'

          tip.innerHTML = `<div style="font-size:10px;color:#555;margin-bottom:2px">${timeStr}</div><div><span style="color:#fff;font-weight:600">$${pt.price.toFixed(2)}</span> <span style="color:${changeColor}">${changeStr}</span></div>`
          tip.style.display = 'block'
          const tipLeft = Math.max(0, Math.min(x - 50, localW - 110))
          tip.style.left = `${tipLeft}px`
        }}
        onMouseLeave={e => {
          const container = e.currentTarget
          const crosshair = container.querySelector('[data-crosshair]') as HTMLElement | null
          const dot = container.querySelector('[data-dot]') as HTMLElement | null
          const tip = container.querySelector('[data-tip]') as HTMLElement | null
          if (crosshair) crosshair.style.display = 'none'
          if (dot) dot.style.display = 'none'
          if (tip) tip.style.display = 'none'
        }}
      >
        {(() => {
          const pts = tickerChart?.points
          if (isFetchingPeriod) return (
            <div style={{
              width: '100%', height: '100%', minHeight: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 10, color: '#444', fontFamily: "'JetBrains Mono', monospace" }}>
                loading...
              </span>
            </div>
          )
          if (!pts || pts.length < 2) return (
            <div style={{
              width: '100%', height: '100%', minHeight: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 10, color: '#222', fontFamily: "'JetBrains Mono', monospace" }}>
                no data
              </span>
            </div>
          )
          const prices = pts.map(p => p.price)
          const min = Math.min(...prices)
          const max = Math.max(...prices)
          const range = max - min || 1
          const w = 300
          const h = 80
          const padTop = 12
          const padBottom = 2

          // For 1D: reuse the precomputed ET window (4 AM – 8 PM) so the chart fills
          // left-to-right as the day progresses rather than always stretching to fill width
          const period1Ms = dayWindow?.period1Ms ?? 0
          const period2Ms = dayWindow?.period2Ms ?? 0
          const etMidnightUtcMs = dayWindow?.etMidnightUtcMs ?? 0
          const sessionMarkers: { x: number; label: string; key: string }[] = []
          if (selectedPeriod === '1D' && dayWindow) {
            const endMs = new Date(pts[pts.length - 1].time).getTime()

            const sessionBoundaries = [
              { label: 'P', etH: 4,  etM: 0  },
              { label: 'O', etH: 9,  etM: 30 },
              { label: 'A', etH: 16, etM: 0  },
              { label: 'C', etH: 20, etM: 0  },
            ]
            const startMs = new Date(pts[0].time).getTime()
            for (const { label: bLabel, etH, etM } of sessionBoundaries) {
              const bMs = etMidnightUtcMs + (etH * 60 + etM) * 60000
              if (bMs < startMs || bMs > endMs) continue
              const x = ((bMs - period1Ms) / (period2Ms - period1Ms)) * w
              sessionMarkers.push({ x, label: bLabel, key: bLabel })
            }
          }

          const ptX = (ptTime: string, i: number) => {
            if (selectedPeriod === '1D' && period2Ms > period1Ms) {
              return ((new Date(ptTime).getTime() - period1Ms) / (period2Ms - period1Ms)) * w
            }
            return (i / (pts.length - 1)) * w
          }

          const linePoints = pts.map((pt, i) => {
            const x = ptX(pt.time, i)
            const y = padTop + (1 - (pt.price - min) / range) * (h - padTop - padBottom)
            return `${x},${y}`
          }).join(' ')
          const lastX = ptX(pts[pts.length - 1].time, pts.length - 1)
          const fillPoints = `0,${h} ${linePoints} ${lastX},${h}`
          const up = prices[prices.length - 1] >= prices[0]
          const strokeColor = up ? '#22c55e' : '#f87171'
          const fillColor = up ? 'rgba(34,197,94,0.18)' : 'rgba(248,113,113,0.18)'

          return (
            <svg
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', minHeight: 40, display: 'block' }}
            >
              <polygon points={fillPoints} fill={fillColor} />
              <polyline points={linePoints} fill="none" stroke={strokeColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              {sessionMarkers.map(({ x, label: mLabel, key: mKey }) => (
                <g key={mKey}>
                  <line
                    x1={x} y1={10} x2={x} y2={h}
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="1"
                    strokeDasharray="2,3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={Math.max(x, 5)} y={8}
                    textAnchor="middle"
                    fontSize="7"
                    fill="rgba(255,255,255,0.30)"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {mLabel}
                  </text>
                </g>
              ))}
            </svg>
          )
        })()}

        {/* Crosshair line */}
        <div data-crosshair style={{
          display: 'none', position: 'absolute', top: 0, bottom: 0, width: 1,
          background: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
        }} />

        {/* Snap dot */}
        <div data-dot style={{
          display: 'none', position: 'absolute', width: 8, height: 8, borderRadius: '50%',
          transform: 'translate(-50%, -50%)', pointerEvents: 'none',
          boxShadow: '0 0 6px rgba(255,255,255,0.3)',
        }} />

        {/* Tooltip */}
        <div data-tip style={{
          display: 'none', position: 'absolute', top: -42, width: 110,
          background: 'rgba(10,10,10,0.95)', border: '1px solid #1a1a1a',
          borderRadius: 8, padding: '6px 8px',
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          pointerEvents: 'none', zIndex: 5,
        }} />
      </div>

      {/* Footer: Date | Created by */}
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
      </div>

      {/* Delete X — visible on hover (CSS) / tap (focusedCardId) */}
      <button
        data-delete-btn
        className="delete-btn"
        onClick={e => { e.stopPropagation(); onDelete(report.id) }}
        onTouchStart={e => { e.stopPropagation() }}
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          background: 'rgba(0,0,0,0.6)',
          border: 'none',
          borderRadius: '50%',
          width: 22,
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          opacity: focusedCardId === report.id ? 1 : 0,
          zIndex: 5,
          padding: 0,
          lineHeight: 1,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
          <line x1="2" y1="2" x2="10" y2="10" />
          <line x1="10" y1="2" x2="2" y2="10" />
        </svg>
      </button>
    </div>
  )
}, (prev, next) =>
  // Callbacks (onDelete, onFocus) omitted — they are stable refs (useCallback/setState)
  prev.report.id === next.report.id &&
  prev.chartData === next.chartData &&
  prev.focusedCardId === next.focusedCardId &&
  prev.colIndex === next.colIndex
)

export default function Home() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Matrix' | 'Watchlist'>('Dashboard')
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
  const matrixTitleRef = useRef<HTMLHeadingElement>(null)
  const [matrixTitleWidth, setMatrixTitleWidth] = useState<number | undefined>(undefined)
  const [matrixSelectedTicker, setMatrixSelectedTicker] = useState<string | null>(null)

  // ── Health popup ──
  const [healthData, setHealthData] = useState<HealthData | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [showHealthPopup, setShowHealthPopup] = useState(false)
  const [healthPopupFadingOut, setHealthPopupFadingOut] = useState(false)
  const healthHoverEnterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const healthHoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const healthFadeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
        if (merged.defaultTab) setActiveTab(merged.defaultTab)
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
        // Only set activeTab from localStorage if no session (Supabase will override if logged in)
        if (!session && merged.defaultTab) setActiveTab(merged.defaultTab)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      if (matrixTitleRef.current) setMatrixTitleWidth(matrixTitleRef.current.offsetWidth)
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

  // ── Health popup hover handlers ──
  const startFadeOut = useCallback(() => {
    setHealthPopupFadingOut(true)
    healthFadeOutTimer.current = setTimeout(() => {
      setShowHealthPopup(false)
      setHealthPopupFadingOut(false)
    }, 150)
  }, [])

  const cancelFadeOut = useCallback(() => {
    if (healthFadeOutTimer.current) { clearTimeout(healthFadeOutTimer.current); healthFadeOutTimer.current = null }
    setHealthPopupFadingOut(false)
  }, [])

  const handleStatusMouseEnter = useCallback(() => {
    if (healthHoverLeaveTimer.current) { clearTimeout(healthHoverLeaveTimer.current); healthHoverLeaveTimer.current = null }
    cancelFadeOut()
    if (!showHealthPopup) healthHoverEnterTimer.current = setTimeout(() => setShowHealthPopup(true), 200)
  }, [showHealthPopup, cancelFadeOut])

  const handleStatusMouseLeave = useCallback(() => {
    if (healthHoverEnterTimer.current) { clearTimeout(healthHoverEnterTimer.current); healthHoverEnterTimer.current = null }
    healthHoverLeaveTimer.current = setTimeout(startFadeOut, 100)
  }, [startFadeOut])

  const handlePopupMouseEnter = useCallback(() => {
    if (healthHoverLeaveTimer.current) { clearTimeout(healthHoverLeaveTimer.current); healthHoverLeaveTimer.current = null }
    cancelFadeOut()
  }, [cancelFadeOut])

  const handlePopupMouseLeave = useCallback(() => {
    startFadeOut()
  }, [startFadeOut])

  useEffect(() => {
    return () => {
      if (healthHoverEnterTimer.current) clearTimeout(healthHoverEnterTimer.current)
      if (healthHoverLeaveTimer.current) clearTimeout(healthHoverLeaveTimer.current)
      if (healthFadeOutTimer.current) clearTimeout(healthFadeOutTimer.current)
    }
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
          paddingLeft: 40, zIndex: 1,
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
                      <span style={{ fontSize: 11, color: '#444', letterSpacing: '0.2em', fontFamily: "'JetBrains Mono', monospace" }}>
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
                        <span style={{ fontSize: 12, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
                          {svc.name.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: statusColor, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
                          {statusLabel}
                        </span>
                      </div>
                      {svc.detail && !isOnline && (
                        <div style={{ fontSize: 9, color: '#333', fontFamily: "'JetBrains Mono', monospace", marginTop: 2, textAlign: 'right' }}>
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
                      color: healthLoading ? '#444' : '#333',
                      fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '0.1em', padding: 0,
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={e => { if (!healthLoading) (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = healthLoading ? '#444' : '#333' }}
                  >
                    {healthLoading ? 'CHECKING...' : '↺ REFRESH'}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#444', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
                      UPTIME
                    </span>
                    <span style={{ fontSize: 11, color: '#333', fontFamily: "'JetBrains Mono', monospace" }}>
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
          maxWidth: 1400, margin: '0 auto', padding: '0 40px',
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
            {(['Dashboard', 'Matrix', 'Watchlist'] as const).map(tab => {
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
          paddingRight: 40, gap: 12,
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
            {(['Dashboard', 'Matrix', 'Watchlist'] as const).map(tab => (
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
            padding: '40px 40px 0',
            maxWidth: '100%', margin: '0 auto',
            animation: 'fadeIn 0.3s ease',
            boxSizing: 'border-box',
            overflowX: 'hidden',
          }}>
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

        {/* ══ MATRIX ══ */}
        {activeTab === 'Matrix' && (() => {
          const matrixReport = matrixSelectedTicker
            ? savedReports.find(r => r.ticker === matrixSelectedTicker) ?? null
            : null
          return (
            <div className="main-content" style={{
              display: 'flex',
              gap: 0,
              padding: '40px 40px 0',
              maxWidth: '100%',
              animation: 'fadeIn 0.3s ease',
              boxSizing: 'border-box',
              overflowX: 'hidden',
              height: 'calc(100vh - 140px)',
            }}>
              {/* Left: Chart */}
              <div style={{
                flex: '0 0 65%',
                minWidth: 0,
                borderRight: '1px solid #1a1a1a',
                paddingRight: 24,
              }}>
                <h1 ref={matrixTitleRef} className="hero-title" style={{
                  fontSize: 64, fontWeight: 700, color: '#fff',
                  letterSpacing: '0.08em',
                  fontFamily: "'JetBrains Mono', monospace",
                  margin: 0, lineHeight: 1,
                  width: 'fit-content',
                }}>
                  MATRIX
                </h1>
                <MatrixScatter
                  savedReports={savedReports}
                  watchlist={watchlist}
                  titleWidth={matrixTitleWidth}
                  onSelectStock={setMatrixSelectedTicker}
                  customTickers={settings.matrixCustomTickers}
                  onCustomTickersChange={(tickers) => updateSettings({ matrixCustomTickers: tickers })}
                />
              </div>

              {/* Right: Report card */}
              {matrixReport && (
                <div style={{
                  flex: '0 0 35%',
                  minWidth: 0,
                  paddingLeft: 32,
                  borderLeft: '1px solid #1a1a1a',
                  overflowY: 'auto',
                  animation: 'fadeIn 0.3s ease',
                }}>
                  <ReportCard
                    report={matrixReport}
                    chartData={chartData[matrixReport.ticker]}
                    focusedCardId={null}
                    colIndex={0}
                    onDelete={deleteReport}
                    onFocus={() => {}}
                  />
                </div>
              )}

              {/* Right: Empty state when ticker has no report */}
              {matrixSelectedTicker && !matrixReport && (
                <div style={{
                  flex: '0 0 35%',
                  minWidth: 0,
                  paddingLeft: 32,
                  borderLeft: '1px solid #1a1a1a',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'fadeIn 0.3s ease',
                }}>
                  <p style={{
                    fontSize: 12, color: '#555',
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.08em',
                    textAlign: 'center',
                  }}>
                    No report for {matrixSelectedTicker}.
                  </p>
                  <button
                    onClick={() => openReport(matrixSelectedTicker)}
                    style={{
                      marginTop: 16,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 4,
                      padding: '8px 20px',
                      fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '0.08em',
                      color: '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                  >
                    GENERATE REPORT
                  </button>
                </div>
              )}
            </div>
          )
        })()}

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
