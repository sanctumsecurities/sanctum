'use client'

import { useEffect, useState, useCallback } from 'react'
import { useHoverPopup } from '@/lib/hooks/useHoverPopup'

interface Indicator {
  label: string
  score: number
  rating: string
}

interface FGData {
  score: number
  rating: string
  previousClose: number | null
  previous1Week: number | null
  previous1Month: number | null
  previous1Year: number | null
  indicators: Indicator[]
}

function getZone(score: number): { label: string; color: string } {
  if (score <= 25) return { label: 'EXTREME FEAR', color: '#ef4444' }
  if (score <= 45) return { label: 'FEAR', color: '#f0a030' }
  if (score <= 55) return { label: 'NEUTRAL', color: '#999999' }
  if (score <= 75) return { label: 'GREED', color: '#a0d040' }
  return { label: 'EXTREME GREED', color: '#22c55e' }
}

function getTickColor(index: number): string {
  if (index <= 12) return '#ef4444'
  if (index <= 22) return '#f0a030'
  if (index <= 27) return '#999999'
  if (index <= 37) return '#a0d040'
  return '#22c55e'
}

export default function FearGreedMeter() {
  const [data, setData] = useState<FGData | null>(null)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const {
    showPopup, fadingOut,
    handleMouseEnter, handleMouseLeave,
    handlePopupMouseEnter, handlePopupMouseLeave,
  } = useHoverPopup()

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/fear-greed')
      if (!res.ok) { setError(true); return }
      const json = await res.json()
      if (typeof json.score === 'number') {
        setData(json)
        setError(false)
      }
    } catch {
      setError(true)
    }
  }, [])

  const handleRefresh = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }, [fetchData])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (!data) {
    return (
      <div id="fear-greed-meter" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
          color: error ? '#ef4444' : '#555',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {error ? 'F&G UNAVAILABLE' : '\u2014'}
        </span>
      </div>
    )
  }

  const { label, color } = getZone(data.score)
  const activeUpTo = Math.round((data.score / 100) * 49)

  const historicalRows: { label: string; value: number | null }[] = [
    { label: 'PREV CLOSE', value: data.previousClose },
    { label: '1 WEEK AGO', value: data.previous1Week },
    { label: '1 MONTH AGO', value: data.previous1Month },
    { label: '1 YEAR AGO', value: data.previous1Year },
  ]

  return (
    <div
      id="fear-greed-meter"
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, cursor: 'default' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
          color,
          fontFamily: "'JetBrains Mono', monospace",
          textShadow: `0 0 8px ${color}66`,
        }}
      >
        {data.score} {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 16 }}>
        {Array.from({ length: 50 }, (_, i) => {
          const tickColor = getTickColor(i)
          const isActive = i <= activeUpTo
          return (
            <span
              key={i}
              style={{
                width: 2,
                height: 14,
                borderRadius: 1,
                flexShrink: 0,
                backgroundColor: tickColor,
                opacity: isActive ? 1 : 0.25,
                display: 'block',
                boxShadow: isActive ? `0 0 4px 1px ${tickColor}55` : 'none',
              }}
            />
          )
        })}
      </div>

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
          {/* Sub-indicators header */}
          <div style={{ fontSize: 10, color: '#444', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em', marginBottom: 6, textAlign: 'center' }}>
            PROPRIETARY CNN SCORING (0-100)
          </div>

          {/* Sub-indicators */}
          {data.indicators.map((ind) => {
            const zone = getZone(ind.score)
            return (
              <div key={ind.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ fontSize: 12, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
                  {ind.label.toUpperCase()}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: zone.color, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
                    {ind.score}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Separator */}
          <div style={{ height: 1, background: '#1a1a1a', margin: '6px 0' }} />

          {/* Historical */}
          {historicalRows.map((row) => {
            if (row.value == null) return null
            const diff = row.value - data.score
            const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→'
            const diffColor = diff > 0 ? '#a0d040' : diff < 0 ? '#ef4444' : '#555'
            const zone = getZone(row.value)
            return (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ fontSize: 11, color: '#333', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
                  {row.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: zone.color, fontFamily: "'JetBrains Mono', monospace" }}>
                    {row.value}
                  </span>
                  <span style={{ fontSize: 10, color: diffColor, fontFamily: "'JetBrains Mono', monospace" }}>
                    {arrow}{Math.abs(diff)}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Footer */}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                background: 'none', border: 'none', cursor: refreshing ? 'default' : 'pointer',
                color: refreshing ? '#444' : '#333',
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.1em', padding: 0,
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={e => { if (!refreshing) (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = refreshing ? '#444' : '#333' }}
            >
              {refreshing ? 'CHECKING...' : '↺ REFRESH'}
            </button>
            <span style={{ fontSize: 11, color: '#444', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
              CNN FEAR & GREED
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
