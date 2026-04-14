'use client'

import { useState, useEffect, useCallback } from 'react'

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

export const DEFAULT_BANNER_TICKERS = TICKER_BAND_INSTRUMENTS.map(i => i.symbol)

const BANNER_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TICKER_BAND_INSTRUMENTS.map(({ symbol, label }) => [symbol, label])
)

type TickerItem = {
  symbol: string
  label: string
  price: number
  change: number
  changePct: number
}

interface TickerBannerProps {
  speed: number
  updateFreq: number
  tickers: string[]
  hoverPause: boolean
}

export default function TickerBanner({ speed, updateFreq, tickers, hoverPause }: TickerBannerProps) {
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
          <span style={{ color: '#666', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.12em' }}>
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
