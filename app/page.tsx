'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { supabase } from '@/lib/supabase'
import Auth from '@/components/Auth'
import dynamic from 'next/dynamic'
import type { Session } from '@supabase/supabase-js'
import SettingsModal from '@/components/SettingsModal'

const ReportView = dynamic(() => import('@/components/ReportView'), { ssr: false })

interface SavedReport {
  id: string
  ticker: string
  data: any
  ai: any
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


const formatMktCap = (val: number) => {
  if (!val) return '\u2014'
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`
  return `$${val.toLocaleString()}`
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
  defaultTab: 'Dashboard' as 'Dashboard' | 'Watchlist',
  clockFormat: '12h' as '12h' | '24h',
  bannerSpeed: 'regular' as 'fast' | 'regular' | 'slow',
  bannerUpdateFreq: 60_000,
  bannerTickers: DEFAULT_BANNER_TICKERS,
}

export type AppSettings = typeof DEFAULT_SETTINGS

interface TickerBannerProps {
  speed: number
  updateFreq: number
  tickers: string[]
}

function TickerBanner({ speed, updateFreq, tickers }: TickerBannerProps) {
  const [items, setItems] = useState<TickerItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ tickers: tickers.join(',') })
      const res = await fetch(`/api/ticker-band?${params}`)
      if (!res.ok) return
      const data: TickerItem[] = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setItems(data)
        setLoaded(true)
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') console.warn('[TickerBanner] fetch failed:', err)
    }
  }, [tickers])

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
          <span style={{ color: '#444', fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em' }}>
            {item.label}
          </span>
          <span style={{ color: '#888', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
            {priceStr}
          </span>
          <span style={{ color, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
            {arrow ? `${arrow} ` : ''}{pctStr}
          </span>
        </span>,
        <span
          key={`${keyPrefix}-${item.symbol}-sep`}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, color: '#2a2a2a', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
        >
          ·
        </span>,
      ]
    })

  return (
    <div style={{
      position: 'fixed', top: 56, left: 0, right: 0, zIndex: 99,
      height: 28,
      background: '#080808',
      borderBottom: '1px solid #1a1a1a',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center',
    }}>
      <div
        className="ticker-scroll"
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
  chartData: { points: { time: string; price: number }[]; afterHours: { price: number; change: number; changePct: number; label: string } | null } | undefined
  focusedCardId: string | null
  colIndex: number
  onOpen: (report: SavedReport) => void
  onDelete: (id: string) => void
  onFocus: (id: string | null) => void
}

const ReportCard = memo(function ReportCard({ report, chartData: tickerChart, focusedCardId, colIndex, onOpen, onDelete, onFocus }: ReportCardProps) {
  const d = report.data || {}
  const sentiment = report.ai?.overview?.sentiment || ''
  const price = d.price
  const prevClose = d.previousClose
  const priceChange = price && prevClose ? price - prevClose : null
  const priceChangePct = price && prevClose ? ((price - prevClose) / prevClose) * 100 : null
  const isUp = priceChange !== null && priceChange >= 0
  const ah = tickerChart?.afterHours || null

  const sentimentColor = sentiment === 'Bullish' ? '#22c55e'
    : sentiment === 'Bearish' ? '#f87171' : '#eab308'

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
        if (focusedCardId === report.id) {
          onOpen(report)
        }
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
            {d.name || ''}
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
        {[
          { label: 'MKT CAP', value: formatMktCap(d.marketCap) },
          { label: 'P/E', value: d.pe ? d.pe.toFixed(2) : '—' },
          { label: 'BETA', value: d.beta ? d.beta.toFixed(2) : '—' },
          { label: 'DIV YIELD', value: d.dividendYield ? `${(d.dividendYield * 100).toFixed(2)}%` : '—' },
        ].map((m, i) => (
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

          const scale = 1.15
          const localW = rect.width / scale
          const localH = rect.height / scale
          const x = (e.clientX - rect.left) / scale
          const pct = Math.max(0, Math.min(1, x / localW))
          const idx = Math.round(pct * (pts.length - 1))
          const pt = pts[idx]
          const openPrice = pts[0].price
          const changeFromOpen = openPrice > 0 ? ((pt.price - openPrice) / openPrice) * 100 : 0
          const isChartUp = pt.price >= openPrice

          const min = Math.min(...pts.map(p => p.price))
          const max = Math.max(...pts.map(p => p.price))
          const range = max - min || 1
          const padRatio = 2 / 80
          const rangeRatio = 76 / 80
          const yPct = padRatio + (1 - (pt.price - min) / range) * rangeRatio
          const dotY = yPct * localH

          crosshair.style.left = `${x}px`
          crosshair.style.display = 'block'
          dot.style.left = `${x}px`
          dot.style.top = `${dotY}px`
          dot.style.display = 'block'
          dot.style.background = isChartUp ? '#22c55e' : '#f87171'

          const timeStr = new Date(pt.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
          const changeStr = `${changeFromOpen >= 0 ? '+' : ''}${changeFromOpen.toFixed(2)}%`
          const changeColor = changeFromOpen >= 0 ? '#22c55e' : '#f87171'

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
          const prices = pts.map(p => p.price)
          const min = Math.min(...prices)
          const max = Math.max(...prices)
          const range = max - min || 1
          const w = 300
          const h = 80
          const pad = 2
          const linePoints = prices.map((v, i) => {
            const x = (i / (prices.length - 1)) * w
            const y = pad + (1 - (v - min) / range) * (h - pad * 2)
            return `${x},${y}`
          }).join(' ')
          const fillPoints = `0,${h} ${linePoints} ${w},${h}`
          const up = prices[prices.length - 1] >= prices[0]
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

      {/* AI Highlights (visible on hover via CSS) */}
      {report.ai?.overview?.highlights?.length > 0 && (
        <div data-highlights>
          <div style={{
            fontSize: 10, color: '#444',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}>
            HIGHLIGHTS
          </div>
          {(report.ai.overview.highlights as { icon: string; text: string }[]).slice(0, 3).map((h, i) => (
            <div key={i} style={{
              display: 'flex', gap: 6, alignItems: 'center',
              fontSize: 11, color: '#777',
              fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1.3,
              marginBottom: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <span style={{ flexShrink: 0, fontSize: 12 }}>{h.icon}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text}</span>
            </div>
          ))}
        </div>
      )}

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
  // Callbacks (onOpen, onDelete, onFocus) omitted — they are stable refs (useCallback/setState)
  prev.report.id === next.report.id &&
  prev.chartData === next.chartData &&
  prev.focusedCardId === next.focusedCardId &&
  prev.colIndex === next.colIndex
)

const TICKER_LIST: { symbol: string; name: string }[] = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'GOOG', name: 'Alphabet Inc. Class C' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'AVGO', name: 'Broadcom Inc.' },
  { symbol: 'ORCL', name: 'Oracle Corporation' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'ADBE', name: 'Adobe Inc.' },
  { symbol: 'CRM', name: 'Salesforce Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.' },
  { symbol: 'INTC', name: 'Intel Corporation' },
  { symbol: 'QCOM', name: 'Qualcomm Inc.' },
  { symbol: 'TXN', name: 'Texas Instruments Inc.' },
  { symbol: 'AMAT', name: 'Applied Materials Inc.' },
  { symbol: 'MU', name: 'Micron Technology Inc.' },
  { symbol: 'ASML', name: 'ASML Holding N.V.' },
  { symbol: 'KLAC', name: 'KLA Corporation' },
  { symbol: 'LRCX', name: 'Lam Research Corporation' },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.' },
  { symbol: 'IBM', name: 'International Business Machines' },
  { symbol: 'NOW', name: 'ServiceNow Inc.' },
  { symbol: 'WDAY', name: 'Workday Inc.' },
  { symbol: 'SNOW', name: 'Snowflake Inc.' },
  { symbol: 'DDOG', name: 'Datadog Inc.' },
  { symbol: 'NET', name: 'Cloudflare Inc.' },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings Inc.' },
  { symbol: 'ZS', name: 'Zscaler Inc.' },
  { symbol: 'PANW', name: 'Palo Alto Networks Inc.' },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.' },
  { symbol: 'COIN', name: 'Coinbase Global Inc.' },
  { symbol: 'HOOD', name: 'Robinhood Markets Inc.' },
  { symbol: 'SHOP', name: 'Shopify Inc.' },
  { symbol: 'SQ', name: 'Block Inc.' },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.' },
  { symbol: 'UBER', name: 'Uber Technologies Inc.' },
  { symbol: 'LYFT', name: 'Lyft Inc.' },
  { symbol: 'ABNB', name: 'Airbnb Inc.' },
  { symbol: 'BKNG', name: 'Booking Holdings Inc.' },
  { symbol: 'RBLX', name: 'Roblox Corporation' },
  { symbol: 'SNAP', name: 'Snap Inc.' },
  { symbol: 'PINS', name: 'Pinterest Inc.' },
  { symbol: 'SPOT', name: 'Spotify Technology S.A.' },
  { symbol: 'TTD', name: 'The Trade Desk Inc.' },
  { symbol: 'TWLO', name: 'Twilio Inc.' },
  { symbol: 'HUBS', name: 'HubSpot Inc.' },
  { symbol: 'TEAM', name: 'Atlassian Corporation' },
  { symbol: 'MDB', name: 'MongoDB Inc.' },
  { symbol: 'ZM', name: 'Zoom Video Communications Inc.' },
  { symbol: 'DOCU', name: 'DocuSign Inc.' },
  { symbol: 'SOFI', name: 'SoFi Technologies Inc.' },
  { symbol: 'AFRM', name: 'Affirm Holdings Inc.' },
  { symbol: 'UPST', name: 'Upstart Holdings Inc.' },
  { symbol: 'RIVN', name: 'Rivian Automotive Inc.' },
  { symbol: 'LCID', name: 'Lucid Group Inc.' },
  { symbol: 'NIO', name: 'NIO Inc.' },
  { symbol: 'XPEV', name: 'XPeng Inc.' },
  { symbol: 'LI', name: 'Li Auto Inc.' },
  { symbol: 'BABA', name: 'Alibaba Group Holding Ltd.' },
  { symbol: 'JD', name: 'JD.com Inc.' },
  { symbol: 'PDD', name: 'PDD Holdings Inc.' },
  { symbol: 'SE', name: 'Sea Limited' },
  { symbol: 'MELI', name: 'MercadoLibre Inc.' },
  { symbol: 'GME', name: 'GameStop Corp.' },
  { symbol: 'AMC', name: 'AMC Entertainment Holdings Inc.' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
  { symbol: 'BAC', name: 'Bank of America Corporation' },
  { symbol: 'GS', name: 'The Goldman Sachs Group Inc.' },
  { symbol: 'MS', name: 'Morgan Stanley' },
  { symbol: 'C', name: 'Citigroup Inc.' },
  { symbol: 'WFC', name: 'Wells Fargo & Company' },
  { symbol: 'AXP', name: 'American Express Company' },
  { symbol: 'BLK', name: 'BlackRock Inc.' },
  { symbol: 'SCHW', name: 'The Charles Schwab Corporation' },
  { symbol: 'COF', name: 'Capital One Financial Corporation' },
  { symbol: 'V', name: 'Visa Inc.' },
  { symbol: 'MA', name: 'Mastercard Inc.' },
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.' },
  { symbol: 'JNJ', name: 'Johnson & Johnson' },
  { symbol: 'PFE', name: 'Pfizer Inc.' },
  { symbol: 'MRK', name: 'Merck & Co. Inc.' },
  { symbol: 'ABBV', name: 'AbbVie Inc.' },
  { symbol: 'LLY', name: 'Eli Lilly and Company' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb Company' },
  { symbol: 'AMGN', name: 'Amgen Inc.' },
  { symbol: 'GILD', name: 'Gilead Sciences Inc.' },
  { symbol: 'REGN', name: 'Regeneron Pharmaceuticals Inc.' },
  { symbol: 'VRTX', name: 'Vertex Pharmaceuticals Inc.' },
  { symbol: 'MRNA', name: 'Moderna Inc.' },
  { symbol: 'ABT', name: 'Abbott Laboratories' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.' },
  { symbol: 'MDT', name: 'Medtronic plc' },
  { symbol: 'DHR', name: 'Danaher Corporation' },
  { symbol: 'CVS', name: 'CVS Health Corporation' },
  { symbol: 'ISRG', name: 'Intuitive Surgical Inc.' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation' },
  { symbol: 'CVX', name: 'Chevron Corporation' },
  { symbol: 'COP', name: 'ConocoPhillips' },
  { symbol: 'SLB', name: 'SLB (Schlumberger)' },
  { symbol: 'EOG', name: 'EOG Resources Inc.' },
  { symbol: 'OXY', name: 'Occidental Petroleum Corporation' },
  { symbol: 'DVN', name: 'Devon Energy Corporation' },
  { symbol: 'WMT', name: 'Walmart Inc.' },
  { symbol: 'COST', name: 'Costco Wholesale Corporation' },
  { symbol: 'TGT', name: 'Target Corporation' },
  { symbol: 'HD', name: 'The Home Depot Inc.' },
  { symbol: 'LOW', name: "Lowe's Companies Inc." },
  { symbol: 'MCD', name: "McDonald's Corporation" },
  { symbol: 'SBUX', name: 'Starbucks Corporation' },
  { symbol: 'NKE', name: 'NIKE Inc.' },
  { symbol: 'DIS', name: 'The Walt Disney Company' },
  { symbol: 'PG', name: 'Procter & Gamble Co.' },
  { symbol: 'KO', name: 'The Coca-Cola Company' },
  { symbol: 'PEP', name: 'PepsiCo Inc.' },
  { symbol: 'PM', name: 'Philip Morris International Inc.' },
  { symbol: 'MO', name: 'Altria Group Inc.' },
  { symbol: 'BA', name: 'The Boeing Company' },
  { symbol: 'CAT', name: 'Caterpillar Inc.' },
  { symbol: 'DE', name: 'Deere & Company' },
  { symbol: 'GE', name: 'GE Aerospace' },
  { symbol: 'HON', name: 'Honeywell International Inc.' },
  { symbol: 'MMM', name: '3M Company' },
  { symbol: 'UPS', name: 'United Parcel Service Inc.' },
  { symbol: 'FDX', name: 'FedEx Corporation' },
  { symbol: 'RTX', name: 'RTX Corporation' },
  { symbol: 'LMT', name: 'Lockheed Martin Corporation' },
  { symbol: 'NOC', name: 'Northrop Grumman Corporation' },
  { symbol: 'GD', name: 'General Dynamics Corporation' },
  { symbol: 'VZ', name: 'Verizon Communications Inc.' },
  { symbol: 'T', name: 'AT&T Inc.' },
  { symbol: 'TMUS', name: 'T-Mobile US Inc.' },
  { symbol: 'CMCSA', name: 'Comcast Corporation' },
  { symbol: 'AMT', name: 'American Tower Corporation' },
  { symbol: 'PLD', name: 'Prologis Inc.' },
  { symbol: 'EQIX', name: 'Equinix Inc.' },
  { symbol: 'O', name: 'Realty Income Corporation' },
  { symbol: 'SPG', name: 'Simon Property Group Inc.' },
  { symbol: 'NEE', name: 'NextEra Energy Inc.' },
  { symbol: 'DUK', name: 'Duke Energy Corporation' },
  { symbol: 'SO', name: 'The Southern Company' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF' },
  { symbol: 'GLD', name: 'SPDR Gold Shares' },
  { symbol: 'SLV', name: 'iShares Silver Trust' },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF' },
  { symbol: 'HYG', name: 'iShares High Yield Corporate Bond ETF' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund' },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund' },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
  { symbol: 'BND', name: 'Vanguard Total Bond Market ETF' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF' },
  { symbol: 'IAU', name: 'iShares Gold Trust' },
  { symbol: 'SCHD', name: 'Schwab US Dividend Equity ETF' },
  { symbol: 'VIG', name: 'Vanguard Dividend Appreciation ETF' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B' },
  { symbol: 'BRK.A', name: 'Berkshire Hathaway Inc. Class A' },
  { symbol: 'WBD', name: 'Warner Bros. Discovery Inc.' },
  { symbol: 'PARA', name: 'Paramount Global' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'SONY', name: 'Sony Group Corporation' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing' },
  { symbol: 'SAMSUNG', name: 'Samsung Electronics Co. Ltd.' },
  { symbol: 'RACE', name: 'Ferrari N.V.' },
  { symbol: 'LVMH', name: 'LVMH Moët Hennessy Louis Vuitton' },
  { symbol: 'TM', name: 'Toyota Motor Corporation' },
  { symbol: 'HMC', name: 'Honda Motor Co. Ltd.' },
  { symbol: 'F', name: 'Ford Motor Company' },
  { symbol: 'GM', name: 'General Motors Company' },
  { symbol: 'STLA', name: 'Stellantis N.V.' },
  { symbol: 'WOLF', name: 'Wolfspeed Inc.' },
  { symbol: 'ARM', name: 'Arm Holdings plc' },
  { symbol: 'SMCI', name: 'Super Micro Computer Inc.' },
  { symbol: 'DELL', name: 'Dell Technologies Inc.' },
  { symbol: 'HPQ', name: 'HP Inc.' },
  { symbol: 'HPE', name: 'Hewlett Packard Enterprise Co.' },
  { symbol: 'ACN', name: 'Accenture plc' },
  { symbol: 'SAP', name: 'SAP SE' },
  { symbol: 'INTU', name: 'Intuit Inc.' },
  { symbol: 'MSCI', name: 'MSCI Inc.' },
  { symbol: 'SPGI', name: 'S&P Global Inc.' },
  { symbol: 'MCO', name: "Moody's Corporation" },
  { symbol: 'ICE', name: 'Intercontinental Exchange Inc.' },
  { symbol: 'CME', name: 'CME Group Inc.' },
  { symbol: 'NDAQ', name: 'Nasdaq Inc.' },
  { symbol: 'USB', name: 'U.S. Bancorp' },
  { symbol: 'PNC', name: 'PNC Financial Services Group Inc.' },
  { symbol: 'TFC', name: 'Truist Financial Corporation' },
]

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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  const [tickerSuggestions, setTickerSuggestions] = useState<Array<{ symbol: string; name: string }>>([])
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [searchFocused, setSearchFocused] = useState(false)
  const searchBarRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [titleWidth, setTitleWidth] = useState<number | undefined>(undefined)

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

  // ── Fetch 1-day chart data for report tickers ──
  const fetchedTickersRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (savedReports.length === 0) return
    const tickers = [...new Set(savedReports.map(r => r.ticker))]
    const unfetched = tickers.filter(t => !fetchedTickersRef.current.has(t))
    if (unfetched.length === 0) return
    unfetched.forEach(t => fetchedTickersRef.current.add(t))
    Promise.all(
      unfetched.map(ticker =>
        fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}`)
          .then(r => r.json())
          .then(res => ({ ticker, data: res }))
          .catch(() => ({ ticker, data: null }))
      )
    ).then(results => {
      const newData: Record<string, { points: { time: string; price: number }[]; afterHours: { price: number; change: number; changePct: number; label: string } | null }> = {}
      results.forEach(({ ticker, data: res }) => {
        if (res?.points?.length) {
          newData[ticker] = { points: res.points, afterHours: res.afterHours || null }
        }
      })
      if (Object.keys(newData).length > 0) {
        setChartData(prev => ({ ...prev, ...newData }))
      }
    })
  }, [savedReports])

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
        const merged = { ...DEFAULT_SETTINGS, ...parsed }
        setSettings(merged)
        if (merged.defaultTab) setActiveTab(merged.defaultTab)
      }
    } catch {}
  }, [])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...patch }
      localStorage.setItem('sanctum-settings', JSON.stringify(updated))
      supabase.from('user_settings')
        .upsert({ user_id: session?.user?.id, settings: updated, updated_at: new Date().toISOString() })
        .then(() => {})
      return updated
    })
  }, [session?.user?.id])

  // ── Measure title width for search bar ──
  useEffect(() => {
    if (loading) return
    const measure = () => {
      if (titleRef.current) setTitleWidth(titleRef.current.offsetWidth)
    }
    measure()
    document.fonts.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [loading])

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
    setError('')
    if (!upper) {
      setTickerSuggestions([])
      setHighlightedIdx(-1)
      return
    }
    const matches = TICKER_LIST.filter(t =>
      t.symbol.startsWith(upper) ||
      t.name.toLowerCase().includes(upper.toLowerCase())
    ).slice(0, 5)
    setTickerSuggestions(matches)
    setHighlightedIdx(-1)
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
    await supabase.from('reports').delete().eq('id', id)
    setSavedReports(prev => prev.filter(r => r.id !== id))
  }, [])

  const handleOpenReport = useCallback((report: SavedReport) => {
    setCurrentReport(report)
    setShowReport(true)
  }, [])

  // ── Generate Report ──
  const generateReport = async (tickerOverride?: string) => {
    const resolvedTicker = (tickerOverride || searchTicker).trim().toUpperCase()
    if (!resolvedTicker) return
    setGenerating(true)
    setError('')
    setShowReport(false)
    setTickerSuggestions([])

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: resolvedTicker }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate report')
      }

      const { data, ai } = await res.json()
      const ticker = resolvedTicker

      // Delete any existing reports for this ticker globally
      await supabase.from('reports').delete().eq('ticker', ticker)

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
          position: 'sticky', top: 84, zIndex: 50,
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
        .ticker-scroll:hover {
          animation-play-state: paused;
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
          paddingLeft: 40,
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
                  left: 0,
                  width: 268,
                  background: '#0f0f0f',
                  border: '1px solid #1a1a1a',
                  borderRadius: 4,
                  padding: '14px 16px',
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 9, color: '#444', letterSpacing: '0.2em', fontFamily: "'JetBrains Mono', monospace" }}>
                        SYSTEM HEALTH
                      </span>
                      <span style={{ fontSize: 9, color: activeColor, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
                        {active}/{total} ACTIVE
                      </span>
                    </div>
                  )
                })()}

                {/* Service rows */}
                {(healthData?.services ?? []).map(svc => {
                  const isOnline = svc.status === 'ok'
                  return (
                    <div key={svc.name} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 0', borderBottom: '1px solid #111',
                    }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
                        {svc.name.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 9, color: isOnline ? '#22c55e' : '#ef4444', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                  )
                })}

                {/* Footer */}
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={e => { e.stopPropagation(); fetchHealth() }}
                    disabled={healthLoading}
                    style={{
                      background: 'none', border: 'none', cursor: healthLoading ? 'default' : 'pointer',
                      color: healthLoading ? '#2a2a2a' : '#333',
                      fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '0.1em', padding: 0,
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={e => { if (!healthLoading) (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = healthLoading ? '#2a2a2a' : '#333' }}
                  >
                    {healthLoading ? 'CHECKING...' : '↺ REFRESH'}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 9, color: '#2a2a2a', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
                      UPTIME
                    </span>
                    <span style={{ fontSize: 9, color: '#333', fontFamily: "'JetBrains Mono', monospace" }}>
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
          <Clock format={settings.clockFormat} />
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
        }}>
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
            {(['Dashboard', 'Watchlist'] as const).map(tab => (
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
                  border: `1px solid ${searchFocused ? '#444' : '#2a2a2a'}`,
                  borderRadius: tickerSuggestions.length > 0 && !generating ? '4px 4px 0 0' : '4px',
                  padding: '12px 16px',
                  background: searchFocused ? 'rgba(255,255,255,0.02)' : 'transparent',
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                }}
              >
                {generating ? (
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    border: '1.5px solid #333',
                    borderTopColor: '#fff',
                    animation: 'spin 0.8s linear infinite',
                    flexShrink: 0,
                  }} />
                ) : (
                  <span style={{
                    fontSize: 12, color: searchFocused ? '#fff' : '#444',
                    fontFamily: "'JetBrains Mono', monospace",
                    flexShrink: 0, userSelect: 'none',
                    transition: 'color 0.2s ease',
                  }}>
                    &gt;
                  </span>
                )}
                <input
                  ref={searchInputRef}
                  type="text"
                  value={generating ? `ANALYZING ${searchTicker}...` : searchTicker}
                  onChange={e => !generating && handleTickerSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onKeyDown={e => {
                    if (generating) return
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setHighlightedIdx(prev => Math.min(prev + 1, tickerSuggestions.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setHighlightedIdx(prev => Math.max(prev - 1, -1))
                    } else if (e.key === 'Enter') {
                      if (highlightedIdx >= 0 && tickerSuggestions[highlightedIdx]) {
                        const t = tickerSuggestions[highlightedIdx]
                        setSearchTicker(t.symbol)
                        setTickerSuggestions([])
                        setHighlightedIdx(-1)
                        generateReport(t.symbol)
                      } else if (searchTicker.trim()) {
                        setTickerSuggestions([])
                        generateReport()
                      }
                    } else if (e.key === 'Escape') {
                      setTickerSuggestions([])
                      setHighlightedIdx(-1)
                    }
                  }}
                  placeholder="ENTER TICKER TO GENERATE REPORT"
                  disabled={generating}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: generating ? '#555' : '#fff',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.05em',
                    outline: 'none',
                    cursor: generating ? 'default' : 'text',
                  }}
                />
              </div>

              {/* Autocomplete suggestions */}
              {!generating && tickerSuggestions.length > 0 && (
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
                        setSearchTicker(t.symbol)
                        setTickerSuggestions([])
                        setHighlightedIdx(-1)
                        generateReport(t.symbol)
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

              {/* Inline error */}
              {error && !generating && (
                <div style={{
                  marginTop: 8,
                  fontSize: 12, color: '#f87171',
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.03em',
                }}>
                  ERROR: {error}
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
                      onOpen={handleOpenReport}
                      onDelete={deleteReport}
                      onFocus={setFocusedCardId}
                    />
                  ))}
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
                onClick={() => generateReport()}
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
