'use client'

import { useEffect, useState } from 'react'

interface FGData {
  score: number
  rating: string
}

function getZone(score: number): { label: string; color: string } {
  if (score <= 25) return { label: 'EXTREME FEAR', color: '#ef4444' }
  if (score <= 45) return { label: 'FEAR', color: '#f0a030' }
  if (score <= 55) return { label: 'NEUTRAL', color: '#999999' }
  if (score <= 75) return { label: 'GREED', color: '#a0d040' }
  return { label: 'EXTREME GREED', color: '#22c55e' }
}

function getTickColor(index: number): string {
  if (index <= 12) return '#ef4444'   // Extreme Fear
  if (index <= 22) return '#f0a030'   // Fear
  if (index <= 27) return '#999999'   // Neutral
  if (index <= 37) return '#a0d040'   // Greed
  return '#22c55e'                    // Extreme Greed
}

export default function FearGreedMeter() {
  const [data, setData] = useState<FGData | null>(null)

  const fetchData = async () => {
    try {
      const res = await fetch('/api/fear-greed')
      if (!res.ok) return
      const json = await res.json()
      if (typeof json.score === 'number') setData(json)
    } catch {
      // silent fail — meter stays blank
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (!data) {
    return (
      <div
        id="fear-greed-meter"
        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.5px',
            color: '#555',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          —
        </span>
      </div>
    )
  }

  const { label, color } = getZone(data.score)
  const activeUpTo = Math.round((data.score / 100) * 49)

  return (
    <div
      id="fear-greed-meter"
      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
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
    </div>
  )
}
