'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Sector {
  name: string
  short: string
  etf: string
  weight: number
  change: number
}

interface Rect extends Sector {
  x: number
  y: number
  w: number
  h: number
}

const PERIODS = ['1D', '5D', '3M', '6M', 'YTD', '1Y'] as const

function getColor(change: number): string {
  const abs = Math.abs(change)
  if (abs < 0.15) return '#1a1a1a'
  if (change > 0) {
    if (abs >= 2.0) return '#16a34a'
    if (abs >= 1.0) return '#15803d'
    if (abs >= 0.5) return '#166534'
    return '#14532d'
  } else {
    if (abs >= 2.0) return '#dc2626'
    if (abs >= 1.0) return '#b91c1c'
    if (abs >= 0.5) return '#991b1b'
    return '#7f1d1d'
  }
}

function getPctColor(change: number): string {
  if (Math.abs(change) < 0.15) return '#5a6475'
  return change >= 0 ? '#4ade80' : '#f87171'
}

// Squarified treemap algorithm
function squarify(items: Sector[], x: number, y: number, w: number, h: number): Rect[] {
  const rects: Rect[] = []
  let remaining = [...items]
  let cx = x, cy = y, cw = w, ch = h

  while (remaining.length > 0) {
    const areaLeft = remaining.reduce((s, d) => s + d.weight, 0)
    const isWide = cw >= ch
    const side = isWide ? ch : cw

    let row = [remaining[0]]
    let rowSum = remaining[0].weight

    for (let i = 1; i < remaining.length; i++) {
      const testRow = [...row, remaining[i]]
      const testSum = rowSum + remaining[i].weight
      const rowFraction = testSum / areaLeft
      const rowSide = isWide ? cw * rowFraction : ch * rowFraction

      let worst = 0
      for (const item of testRow) {
        const itemFraction = item.weight / testSum
        const itemLen = side * itemFraction
        worst = Math.max(worst, Math.max(rowSide / itemLen, itemLen / rowSide))
      }

      const curFraction = rowSum / areaLeft
      const curSide = isWide ? cw * curFraction : ch * curFraction
      let curWorst = 0
      for (const item of row) {
        const itemFraction = item.weight / rowSum
        const itemLen = side * itemFraction
        curWorst = Math.max(curWorst, Math.max(curSide / itemLen, itemLen / curSide))
      }

      if (worst <= curWorst) {
        row = testRow
        rowSum = testSum
      } else {
        break
      }
    }

    const rowFraction = rowSum / areaLeft
    if (isWide) {
      const rowW = cw * rowFraction
      let ry = cy
      for (const item of row) {
        const itemH = ch * (item.weight / rowSum)
        rects.push({ ...item, x: cx, y: ry, w: rowW, h: itemH })
        ry += itemH
      }
      cx += rowW
      cw -= rowW
    } else {
      const rowH = ch * rowFraction
      let rx = cx
      for (const item of row) {
        const itemW = cw * (item.weight / rowSum)
        rects.push({ ...item, x: rx, y: cy, w: itemW, h: rowH })
        rx += itemW
      }
      cy += rowH
      ch -= rowH
    }

    remaining = remaining.slice(row.length)
  }

  return rects
}

export default function SectorHeatmap() {
  const [period, setPeriod] = useState<string>('1D')
  const [sectors, setSectors] = useState<Sector[] | null>(null)
  const [rects, setRects] = useState<Rect[]>([])
  const [tooltip, setTooltip] = useState<{ rect: Rect; x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const HEIGHT = 200

  const fetchData = useCallback(async (p: string) => {
    try {
      const res = await fetch(`/api/sector-heatmap?period=${p}`)
      if (!res.ok) return
      const json = await res.json()
      if (json.sectors) setSectors(json.sectors)
    } catch { /* silent */ }
  }, [])

  // Fetch on mount and when period changes
  useEffect(() => {
    fetchData(period)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => fetchData(period), 2 * 60 * 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [period, fetchData])

  // Recompute layout when sectors or container size changes
  useEffect(() => {
    if (!sectors || !containerRef.current) return
    const w = containerRef.current.offsetWidth
    if (w <= 0) return
    setRects(squarify(sectors, 0, 0, w, HEIGHT))
  }, [sectors])

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      if (!sectors || !containerRef.current) return
      const w = containerRef.current.offsetWidth
      if (w <= 0) return
      setRects(squarify(sectors, 0, 0, w, HEIGHT))
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [sectors])

  return (
    <div>
      {/* Period selector */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: 2, marginBottom: 8,
      }}>
        {PERIODS.map(p => (
          <span
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              fontSize: 9,
              padding: '3px 7px',
              borderRadius: 3,
              cursor: 'pointer',
              color: period === p ? '#fff' : '#555',
              background: period === p ? 'rgba(255,255,255,0.08)' : 'transparent',
              fontFamily: "'JetBrains Mono', monospace",
              transition: 'all 0.15s',
              userSelect: 'none',
            }}
          >{p}</span>
        ))}
      </div>

      {/* Treemap */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: HEIGHT,
          borderRadius: 4,
          overflow: 'visible',
          position: 'relative',
        }}
      >
        {rects.map((r, i) => {
          const area = r.w * r.h
          const nameSize = area > 8000 ? 12 : area > 4000 ? 10 : area > 2000 ? 9 : 8
          const pctSize = area > 8000 ? 9 : area > 4000 ? 8 : 7
          const sign = r.change >= 0 ? '+' : ''

          return (
            <div
              key={r.etf}
              onMouseEnter={e => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setTooltip({ rect: r, x: rect.left + rect.width / 2, y: rect.top })
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{
                position: 'absolute',
                left: r.x,
                top: r.y,
                width: r.w,
                height: r.h,
                background: getColor(r.change),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'default',
                transition: 'filter 0.15s',
                border: '0.5px solid rgba(0,0,0,0.4)',
                overflow: 'hidden',
              }}
              onMouseOver={e => (e.currentTarget.style.filter = 'brightness(1.3)')}
              onMouseOut={e => (e.currentTarget.style.filter = 'none')}
            >
              <span style={{
                fontSize: nameSize,
                fontWeight: 700,
                color: '#fff',
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                whiteSpace: 'nowrap',
                fontFamily: "'JetBrains Mono', monospace",
              }}>{r.short}</span>
              {area > 1500 && (
                <span style={{
                  fontSize: pctSize,
                  color: 'rgba(255,255,255,0.75)',
                  marginTop: 1,
                  whiteSpace: 'nowrap',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{sign}{r.change.toFixed(2)}%</span>
              )}
            </div>
          )
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const r = tooltip.rect
          const sign = r.change >= 0 ? '+' : ''
          // Position tooltip above the hovered cell
          const tipLeft = tooltip.x - (containerRef.current?.getBoundingClientRect().left ?? 0)
          return (
            <div style={{
              position: 'absolute',
              bottom: HEIGHT - tooltip.rect.y + 6,
              left: tipLeft,
              transform: 'translateX(-50%)',
              background: '#1a1f2e',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              padding: '8px 12px',
              whiteSpace: 'nowrap',
              zIndex: 50,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}>
              <div style={{ fontSize: 11, color: '#e8ecf1', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{r.name}</div>
              <div style={{ fontSize: 9, color: '#5a6475', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{r.etf}</div>
              <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: getPctColor(r.change), fontFamily: "'JetBrains Mono', monospace" }}>
                {sign}{r.change.toFixed(2)}%
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
