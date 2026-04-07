'use client'

import { useState, useCallback, useMemo, memo } from 'react'
import { useRouter } from 'next/navigation'

export interface SavedReport {
  id: string
  ticker: string
  data: any
  created_by: string
  created_by_email: string | null
  created_at: string
}

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

export default ReportCard
