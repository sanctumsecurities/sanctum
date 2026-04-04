'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// ── Types ──

interface MatrixStock {
  symbol: string
  name: string
  ret: number
  vol: number
  downsideVol: number
  maxDrawdown: number
  mcap: number
  sharpe: number
  price: number
  sector: string
  prevRet: number | null
  prevVol: number | null
  prevDownsideVol: number | null
}

interface MatrixBenchmark {
  symbol: string
  name: string
  ret: number
  vol: number
  downsideVol: number
  maxDrawdown: number
  sharpe: number
}

interface MatrixData {
  stocks: MatrixStock[]
  benchmarks: MatrixBenchmark[]
  riskFreeRate: number
  period: string
}

type DataSource = 'Reports' | 'Watchlist' | 'Custom'
type Quadrant = 'CORE' | 'VOLATILE' | 'DEFENSIVE' | 'AT RISK'
type VolMetric = 'total' | 'downside'
type ColorMode = 'quadrant' | 'sector'
type Period = '3m' | '6m' | '12m'

interface MatrixScatterProps {
  savedReports: Array<{ ticker: string }>
  watchlist: string[]
  titleWidth?: number
  onSelectStock?: (symbol: string | null) => void
  customTickers: string[]
  onCustomTickersChange: (tickers: string[]) => void
}

// ── Constants ──

const QUADRANT_CONFIG: Record<Quadrant, { color: string; position: 'tl' | 'tr' | 'bl' | 'br' }> = {
  'CORE': { color: '#22c55e', position: 'tl' },
  'VOLATILE': { color: '#f59e0b', position: 'tr' },
  'DEFENSIVE': { color: '#6366f1', position: 'bl' },
  'AT RISK': { color: '#ef4444', position: 'br' },
}

const SECTOR_COLORS: Record<string, string> = {
  'Technology':              '#60a5fa',
  'Healthcare':              '#4ade80',
  'Financial Services':      '#f59e0b',
  'Energy':                  '#ef4444',
  'Consumer Cyclical':       '#a78bfa',
  'Consumer Defensive':      '#2dd4bf',
  'Communication Services':  '#fb923c',
  'Industrials':             '#94a3b8',
  'Real Estate':             '#f472b6',
  'Basic Materials':         '#a3e635',
  'Utilities':               '#67e8f9',
  'Other':                   '#555555',
}

const PADDING = { top: 30, right: 20, bottom: 44, left: 48 }

function getQuadrant(ret: number, vol: number, benchRet: number, benchVol: number): Quadrant {
  if (ret >= benchRet && vol < benchVol) return 'CORE'
  if (ret >= benchRet && vol >= benchVol) return 'VOLATILE'
  if (ret < benchRet && vol < benchVol) return 'DEFENSIVE'
  return 'AT RISK'
}

function formatMktCap(val: number): string {
  if (!val) return '—'
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`
  return `$${val.toLocaleString()}`
}

function dotRadius(mcap: number, allMcaps: number[]): number {
  if (allMcaps.length === 0 || mcap <= 0) return 6
  const logMin = Math.log10(Math.max(1, Math.min(...allMcaps)))
  const logMax = Math.log10(Math.max(1, Math.max(...allMcaps)))
  const logVal = Math.log10(Math.max(1, mcap))
  const range = logMax - logMin
  if (range === 0) return 17
  const t = Math.max(0, Math.min(1, (logVal - logMin) / range))
  return 6 + t * 22
}

function computeConvexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return [...points]
  const sorted = [...points].sort((a, b) => a.x - b.x || b.y - a.y)
  const hull: { x: number; y: number }[] = []
  for (const p of sorted) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2]
      const b = hull[hull.length - 1]
      // Cross product: positive = counter-clockwise (keep), zero or negative = clockwise or collinear (pop)
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
      if (cross <= 0) hull.pop()
      else break
    }
    hull.push(p)
  }
  return hull
}

function catmullRomPath(points: { x: number; y: number }[], tension: number = 0.5): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`

  const alpha = 1 - tension
  let d = `M${points[0].x},${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) * alpha / 6
    const cp1y = p1.y + (p2.y - p0.y) * alpha / 6
    const cp2x = p2.x - (p3.x - p1.x) * alpha / 6
    const cp2y = p2.y - (p3.y - p1.y) * alpha / 6

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return d
}

function getArrowheadPoints(
  fromX: number, fromY: number, toX: number, toY: number, size: number = 6
): string {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  const x1 = toX - size * Math.cos(angle - Math.PI / 6)
  const y1 = toY - size * Math.sin(angle - Math.PI / 6)
  const x2 = toX - size * Math.cos(angle + Math.PI / 6)
  const y2 = toY - size * Math.sin(angle + Math.PI / 6)
  return `${toX},${toY} ${x1},${y1} ${x2},${y2}`
}

// ── Ticker Search for Custom mode ──

function TickerInput({ onAdd }: { onAdd: (symbol: string) => void }) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<Array<{ symbol: string; name: string }>>([])
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [focused, setFocused] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setSuggestions([])
        setHighlightedIdx(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setSuggestions(data)
        setHighlightedIdx(-1)
      } catch { setSuggestions([]) }
    }, 200)
  }, [])

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const submit = (sym: string) => {
    if (sym.trim()) {
      onAdd(sym.trim().toUpperCase())
      setValue('')
      setSuggestions([])
      setHighlightedIdx(-1)
    }
  }

  return (
    <div ref={barRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 0',
        background: 'transparent',
      }}>
        <span style={{
          fontSize: 12, color: focused ? '#fff' : '#444',
          fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0, userSelect: 'none',
          transition: 'color 0.2s ease',
        }}>
          &gt;
        </span>
        <input
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value.toUpperCase()); search(e.target.value) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlightedIdx(prev => Math.min(prev + 1, suggestions.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlightedIdx(prev => Math.max(prev - 1, -1))
            } else if (e.key === 'Enter') {
              if (highlightedIdx >= 0 && suggestions[highlightedIdx]) {
                submit(suggestions[highlightedIdx].symbol)
              } else {
                submit(value)
              }
            } else if (e.key === 'Escape') {
              setSuggestions([])
              setHighlightedIdx(-1)
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="ENTER TICKER TO ADD"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em',
            outline: 'none',
          }}
        />
      </div>

      <div className={`shimmer-underline${focused ? ' active' : ''}`} />

      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#0a0a0a',
          border: '1px solid #444',
          borderTop: 'none',
          borderRadius: '0 0 4px 4px',
          zIndex: 50,
          overflow: 'hidden',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.symbol}
              onMouseDown={e => {
                e.preventDefault()
                submit(s.symbol)
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
                {s.symbol}
              </span>
              <span style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#444',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {s.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ──

export default function MatrixScatter({ savedReports, watchlist, titleWidth, onSelectStock, customTickers, onCustomTickersChange }: MatrixScatterProps) {
  const [source, setSource] = useState<DataSource>('Reports')
  const [volMetric, setVolMetric] = useState<VolMetric>('total')
  const [period, setPeriod] = useState<Period>('12m')
  const [data, setData] = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null)
  const [pinnedSymbol, setPinnedSymbol] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('quadrant')
  const [showTrails, setShowTrails] = useState(false)
  const [showFrontier, setShowFrontier] = useState(false)
  const [sectorFilter, setSectorFilter] = useState<string | null>(null)
  const [hoveredFrontier, setHoveredFrontier] = useState(false)

  // Responsive sizing — fill remaining viewport
  // Re-run when data loads so containerRef is available
  const hasData = !!(data && data.stocks.length > 0 && !loading)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const compute = () => {
      const rect = el.getBoundingClientRect()
      const w = rect.width
      const remaining = window.innerHeight - rect.top - 40
      setDimensions({ width: w, height: Math.max(340, remaining) })
    }
    compute()
    const observer = new ResizeObserver(() => compute())
    observer.observe(el)
    window.addEventListener('resize', compute)
    return () => { observer.disconnect(); window.removeEventListener('resize', compute) }
  }, [hasData])

  // Determine tickers for current source
  const tickers = useMemo(() => {
    switch (source) {
      case 'Reports': return [...new Set(savedReports.map(r => r.ticker))]
      case 'Watchlist': return [...watchlist]
      case 'Custom': return [...customTickers]
    }
  }, [source, savedReports, watchlist, customTickers])

  // Fetch data when tickers change
  useEffect(() => {
    if (tickers.length === 0) { setData(null); return }
    let cancelled = false
    setLoading(true)
    setError('')
    setMounted(false)

    fetch(`/api/matrix?tickers=${encodeURIComponent(tickers.join(','))}&period=${period}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load matrix data')
        return r.json()
      })
      .then((d: MatrixData) => {
        if (!cancelled) {
          setData(d)
          setLoading(false)
          // Trigger staggered mount animation
          requestAnimationFrame(() => { if (!cancelled) setMounted(true) })
        }
      })
      .catch(err => {
        if (!cancelled) { setError(err.message); setLoading(false) }
      })

    return () => { cancelled = true }
  }, [tickers, period])

  const spyBenchmark = useMemo(() => data?.benchmarks.find(b => b.symbol === 'SPY') ?? null, [data])
  const spyRet = spyBenchmark?.ret ?? 0
  const spyVol = spyBenchmark ? (volMetric === 'downside' ? spyBenchmark.downsideVol : spyBenchmark.vol) : 0.35

  const getVol = useCallback((s: { vol: number; downsideVol: number }) =>
    volMetric === 'downside' ? s.downsideVol : s.vol, [volMetric])

  const getStockColor = useCallback((s: MatrixStock) => {
    if (colorMode === 'sector') return SECTOR_COLORS[s.sector] || SECTOR_COLORS['Other']
    const sVol = volMetric === 'downside' ? s.downsideVol : s.vol
    const quad = getQuadrant(s.ret, sVol, spyRet, spyVol)
    return QUADRANT_CONFIG[quad].color
  }, [colorMode, volMetric, spyRet, spyVol])

  // Axis ranges — computed from data, with some padding
  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    if (!data || data.stocks.length === 0) {
      return { xMin: 0, xMax: 0.8, yMin: -0.3, yMax: 0.6 }
    }
    const allVols = [...data.stocks.map(s => getVol(s)), ...data.benchmarks.map(b => getVol(b))]
    const allRets = [...data.stocks.map(s => s.ret), ...data.benchmarks.map(b => b.ret)]
    const vMin = Math.min(0, ...allVols)
    const vMax = Math.max(0.8, ...allVols)
    const rMin = Math.min(-0.3, ...allRets)
    const rMax = Math.max(0.6, ...allRets)
    const vPad = (vMax - vMin) * 0.08
    const rPad = (rMax - rMin) * 0.08
    return { xMin: vMin - vPad, xMax: vMax + vPad, yMin: rMin - rPad, yMax: rMax + rPad }
  }, [data, getVol])

  const allMcaps = useMemo(() => data ? data.stocks.map(s => s.mcap) : [], [data])

  // Coordinate mappers
  const chartW = dimensions.width - PADDING.left - PADDING.right
  const chartH = dimensions.height - PADDING.top - PADDING.bottom

  const toX = useCallback((vol: number) => PADDING.left + ((vol - xMin) / (xMax - xMin)) * chartW, [xMin, xMax, chartW])
  const toY = useCallback((ret: number) => PADDING.top + ((yMax - ret) / (yMax - yMin)) * chartH, [yMin, yMax, chartH])

  // Active/hovered symbol
  const activeSymbol = pinnedSymbol ?? hoveredSymbol

  // ── Render ──

  const sourceButtons: { label: DataSource; flex: number }[] = [
    { label: 'Reports', flex: 0.9 },
    { label: 'Watchlist', flex: 1.2 },
    { label: 'Custom', flex: 0.9 },
  ]

  return (
    <div>
      {/* Period subtitle */}
      <div style={{
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        color: '#444',
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        marginTop: 6,
      }}>
        TRAILING {period.toUpperCase()}
      </div>

      {/* Row 1: Data selection — source left, period right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 }}>
        {/* Source buttons — left */}
        <div style={{ display: 'flex', gap: 8, width: titleWidth ?? 420, flexShrink: 0 }}>
          {sourceButtons.map(({ label, flex }) => {
            const isActive = label === source
            return (
              <button
                key={label}
                onClick={() => { setSource(label); setPinnedSymbol(null); onSelectStock?.(null) }}
                style={{
                  flex,
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : '#1a1a1a'}`,
                  borderRadius: 4,
                  padding: '6px 0',
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.08em',
                  color: isActive ? '#fff' : '#555',
                  cursor: 'pointer',
                  textTransform: 'uppercase' as const,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget).style.color = '#aaa' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget).style.color = '#555' }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Period selector — right */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {(['3m', '6m', '12m'] as const).map(p => {
            const isActive = period === p
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : '#1a1a1a'}`,
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.08em',
                  color: isActive ? '#fff' : '#555',
                  cursor: 'pointer',
                  textTransform: 'uppercase' as const,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget).style.color = '#aaa' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget).style.color = '#555' }}
              >
                {p.toUpperCase()}
              </button>
            )
          })}
        </div>
      </div>

      {/* Row 2: View options — metrics left, overlays right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {/* Vol metric toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['total', 'downside'] as const).map(v => {
            const isActive = volMetric === v
            return (
              <button
                key={v}
                onClick={() => setVolMetric(v)}
                style={{
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : '#1a1a1a'}`,
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.08em',
                  color: isActive ? '#fff' : '#555',
                  cursor: 'pointer',
                  textTransform: 'uppercase' as const,
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap' as const,
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget).style.color = '#aaa' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget).style.color = '#555' }}
              >
                {v === 'total' ? 'TOTAL VOL' : 'DOWNSIDE VOL'}
              </button>
            )
          })}
        </div>

        {/* Color mode toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['quadrant', 'sector'] as const).map(m => {
            const isActive = colorMode === m
            return (
              <button
                key={m}
                onClick={() => {
                  setColorMode(m)
                  setSectorFilter(null) // clear filter on mode switch
                }}
                style={{
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : '#1a1a1a'}`,
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.08em',
                  color: isActive ? '#fff' : '#555',
                  cursor: 'pointer',
                  textTransform: 'uppercase' as const,
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap' as const,
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget).style.color = '#aaa' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget).style.color = '#555' }}
              >
                {m.toUpperCase()}
              </button>
            )
          })}
        </div>

        {/* Overlay toggles — right */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {([
            { key: 'trails', label: 'TRAILS', active: showTrails, toggle: () => setShowTrails(v => !v) },
            { key: 'frontier', label: 'FRONTIER', active: showFrontier, toggle: () => setShowFrontier(v => !v) },
          ] as const).map(({ key, label, active, toggle }) => (
            <button
              key={key}
              onClick={toggle}
              style={{
                background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: `1px solid ${active ? 'rgba(255,255,255,0.15)' : '#1a1a1a'}`,
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.08em',
                color: active ? '#fff' : '#555',
                cursor: 'pointer',
                textTransform: 'uppercase' as const,
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap' as const,
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget).style.color = '#aaa' }}
              onMouseLeave={e => { if (!active) (e.currentTarget).style.color = '#555' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom mode: search bar + ticker chips in one row */}
      {source === 'Custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: titleWidth ?? 420, flexShrink: 0 }}>
            <TickerInput onAdd={(sym) => {
              if (!customTickers.includes(sym)) onCustomTickersChange([...customTickers, sym])
            }} />
          </div>
          {customTickers.length > 0 && customTickers.map(t => (
            <div key={t} style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #1a1a1a',
              borderRadius: 4, padding: '4px 10px',
            }}>
              <span style={{ fontSize: 11, color: '#ccc', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>{t}</span>
              <button
                onClick={() => onCustomTickersChange(customTickers.filter(x => x !== t))}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#444', fontSize: 14, lineHeight: 1, padding: 0,
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={e => (e.currentTarget).style.color = '#f87171'}
                onMouseLeave={e => (e.currentTarget).style.color = '#444'}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 400,
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '2px solid #1a1a1a', borderTopColor: '#fff',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span style={{
            fontSize: 12, color: '#555', marginTop: 16,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.12em',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            LOADING MATRIX...
          </span>
        </div>
      )}

      {/* Empty state */}
      {!loading && tickers.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 400,
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
          </svg>
          <p style={{ fontSize: 14, color: '#666', margin: '16px 0 4px', fontFamily: "'DM Sans', sans-serif" }}>
            {source === 'Custom' ? 'No tickers added yet.' : source === 'Reports' ? 'No reports generated yet.' : 'Your watchlist is empty.'}
          </p>
          <p style={{ fontSize: 12, color: '#555', margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
            {source === 'Custom' ? 'Add tickers above to plot the matrix.' : 'Select a data source above to plot the matrix.'}
          </p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div style={{
          padding: 20, textAlign: 'center',
          fontSize: 12, color: '#f87171',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          ERROR: {error}
        </div>
      )}

      {/* Chart */}
      {!loading && !error && data && data.stocks.length > 0 && (
        <>
          {/* SVG Chart */}
          <div
            ref={containerRef}
            style={{
              background: 'transparent',
              position: 'relative',
              overflow: 'hidden',
              width: '100%',
              height: dimensions.height,
            }}
          >
            <svg
              width={dimensions.width}
              height={dimensions.height}
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              style={{ display: 'block' }}
            >

              <defs>
                <radialGradient id="grad-core" cx="25%" cy="25%" r="60%">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="grad-volatile" cx="75%" cy="25%" r="60%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="grad-defensive" cx="25%" cy="75%" r="60%">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="grad-atrisk" cx="75%" cy="75%" r="60%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Quadrant background washes */}
              {(() => {
                const divX = toX(spyVol)
                const divY = toY(spyRet)
                return (
                  <>
                    <rect x={PADDING.left} y={PADDING.top} width={divX - PADDING.left} height={divY - PADDING.top} fill="url(#grad-core)" />
                    <rect x={divX} y={PADDING.top} width={dimensions.width - PADDING.right - divX} height={divY - PADDING.top} fill="url(#grad-volatile)" />
                    <rect x={PADDING.left} y={divY} width={divX - PADDING.left} height={dimensions.height - PADDING.bottom - divY} fill="url(#grad-defensive)" />
                    <rect x={divX} y={divY} width={dimensions.width - PADDING.right - divX} height={dimensions.height - PADDING.bottom - divY} fill="url(#grad-atrisk)" />
                  </>
                )
              })()}


              {/* Quadrant divider lines */}
              <line
                x1={toX(spyVol)} y1={PADDING.top}
                x2={toX(spyVol)} y2={dimensions.height - PADDING.bottom}
                stroke="#1a1a1e" strokeWidth="1"
                strokeDasharray="6,4"
                style={{ animation: mounted ? undefined : 'none' }}
              />
              <line
                x1={PADDING.left} y1={toY(spyRet)}
                x2={dimensions.width - PADDING.right} y2={toY(spyRet)}
                stroke="#1a1a1e" strokeWidth="1"
                strokeDasharray="6,4"
              />

              {/* SPY crosshair labels */}
              <text
                x={dimensions.width - PADDING.right - 4}
                y={toY(spyRet) - 6}
                fill="#444"
                fontSize="9"
                fontFamily="'JetBrains Mono', monospace"
                textAnchor="end"
              >
                SPY {(spyRet * 100).toFixed(1)}%
              </text>
              <text
                x={toX(spyVol) + 6}
                y={PADDING.top + 12}
                fill="#444"
                fontSize="9"
                fontFamily="'JetBrains Mono', monospace"
              >
                SPY {(spyVol * 100).toFixed(1)}%
              </text>

              {/* Quadrant labels */}
              {(() => {
                const divX = toX(spyVol)
                const divY = toY(spyRet)
                const labels: { text: string; x: number; y: number; color: string }[] = [
                  { text: 'CORE', x: PADDING.left + 10, y: PADDING.top + 18, color: '#22c55e' },
                  { text: 'VOLATILE', x: dimensions.width - PADDING.right - 10, y: PADDING.top + 18, color: '#f59e0b' },
                  { text: 'DEFENSIVE', x: PADDING.left + 10, y: dimensions.height - PADDING.bottom - 10, color: '#6366f1' },
                  { text: 'AT RISK', x: dimensions.width - PADDING.right - 10, y: dimensions.height - PADDING.bottom - 10, color: '#ef4444' },
                ]
                return labels.map(l => (
                  <text
                    key={l.text}
                    x={l.x}
                    y={l.y}
                    fill={l.color}
                    opacity={0.35}
                    fontSize="11"
                    fontFamily="'JetBrains Mono', monospace"
                    fontWeight="600"
                    letterSpacing="0.12em"
                    textAnchor={l.x > divX ? 'end' : 'start'}
                  >
                    {l.text}
                  </text>
                ))
              })()}

              {/* X-axis ticks */}
              {(() => {
                const ticks: number[] = []
                const step = 0.1
                let v = Math.ceil(xMin / step) * step
                while (v <= xMax) { ticks.push(v); v += step }
                return ticks.map(v => (
                  <text
                    key={`xt-${v}`}
                    x={toX(v)} y={dimensions.height - PADDING.bottom + 20}
                    fill="#444" fontSize="10" textAnchor="middle"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {(v * 100).toFixed(0)}%
                  </text>
                ))
              })()}
              <text
                x={dimensions.width / 2} y={dimensions.height - 8}
                fill="#333" fontSize="10" textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
                letterSpacing="0.12em"
              >
                {volMetric === 'downside' ? 'DOWNSIDE VOLATILITY' : 'VOLATILITY'}
              </text>

              {/* Y-axis ticks */}
              {(() => {
                const ticks: number[] = []
                const step = 0.1
                let v = Math.ceil(yMin / step) * step
                while (v <= yMax) { ticks.push(v); v += step }
                return ticks.map(r => (
                  <text
                    key={`yt-${r}`}
                    x={PADDING.left - 10} y={toY(r) + 4}
                    fill="#444" fontSize="10" textAnchor="end"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {Math.abs(r) < 0.001 ? '0' : (r * 100).toFixed(0)}%
                  </text>
                ))
              })()}
              <text
                x={14} y={dimensions.height / 2}
                fill="#333" fontSize="10" textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
                letterSpacing="0.12em"
                transform={`rotate(-90, 14, ${dimensions.height / 2})`}
              >
                RETURN
              </text>

              {/* Stock dots — shapes layer */}
              {data.stocks.map((s, i) => {
                const sVol = getVol(s)
                const color = getStockColor(s)
                const quad = getQuadrant(s.ret, sVol, spyRet, spyVol)
                const r = dotRadius(s.mcap, allMcaps)
                const isActive = activeSymbol === s.symbol
                const cx = toX(sVol)
                const cy = toY(s.ret)

                // Filtering: fade non-matching stocks
                const isFiltered = colorMode === 'sector' && sectorFilter
                  ? s.sector !== sectorFilter
                  : false
                const groupOpacity = isFiltered ? 0.06 : 1

                // Drawdown border ring
                const dd = s.maxDrawdown
                const ddRing = dd >= 0.40
                  ? { width: 3, color: '#ef4444', opacity: 0.8 }
                  : dd >= 0.20
                  ? { width: 2, color, opacity: 0.6 }
                  : dd >= 0.05
                  ? { width: 1, color, opacity: 0.4 }
                  : null

                return (
                  <g
                    key={s.symbol}
                    style={{ cursor: 'pointer', opacity: groupOpacity, transition: 'opacity 0.3s ease' }}
                    onMouseEnter={() => setHoveredSymbol(s.symbol)}
                    onMouseLeave={() => setHoveredSymbol(null)}
                    onClick={() => {
                      const next = pinnedSymbol === s.symbol ? null : s.symbol
                      setPinnedSymbol(next)
                      onSelectStock?.(next)
                    }}
                  >
                    {isActive && (
                      <circle
                        cx={cx} cy={cy} r={r + 6}
                        fill="none" stroke={color} strokeWidth="1.5"
                        opacity={0.3}
                        style={{ animation: 'pulse 2s ease-in-out infinite' }}
                      />
                    )}
                    {ddRing && (
                      <circle
                        cx={cx} cy={cy}
                        r={(isActive ? r + 2 : r) + ddRing.width + 1}
                        fill="none"
                        stroke={ddRing.color}
                        strokeWidth={ddRing.width}
                        opacity={ddRing.opacity}
                        style={{
                          transform: mounted ? 'scale(1)' : 'scale(0)',
                          transformOrigin: `${cx}px ${cy}px`,
                          transition: `transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 25}ms`,
                        }}
                      />
                    )}
                    <circle
                      cx={cx} cy={cy}
                      r={isActive ? r + 2 : r}
                      fill={color} fillOpacity={0.15}
                      stroke={color} strokeWidth={isActive ? 2 : 1.5}
                      style={{
                        transform: mounted ? 'scale(1)' : 'scale(0)',
                        transformOrigin: `${cx}px ${cy}px`,
                        transition: `transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 25}ms, r 0.2s ease`,
                      }}
                    />
                  </g>
                )
              })}

              {/* Benchmark diamonds — shapes layer */}
              {data.benchmarks.map((bench, bi) => {
                const bx = toX(getVol(bench))
                const by = toY(bench.ret)
                const benchKey = `BENCH_${bench.symbol}`
                return (
                  <g
                    key={benchKey}
                    onMouseEnter={() => setHoveredSymbol(benchKey)}
                    onMouseLeave={() => setHoveredSymbol(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={bx - 5} y={by - 5} width={10} height={10}
                      fill="#fff" fillOpacity={0.15}
                      stroke="#fff" strokeWidth="1.5"
                      transform={`rotate(45, ${bx}, ${by})`}
                      style={{
                        transform: mounted ? `rotate(45deg)` : 'rotate(45deg) scale(0)',
                        transformOrigin: `${bx}px ${by}px`,
                        transition: `transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${bi * 50}ms`,
                      }}
                    />
                  </g>
                )
              })}

              {/* Labels layer — rendered last so they appear on top of all shapes */}
              {data.stocks.map(s => {
                const sVol = getVol(s)
                const color = getStockColor(s)
                const r = dotRadius(s.mcap, allMcaps)
                const isActive = activeSymbol === s.symbol
                const cx = toX(sVol)
                const cy = toY(s.ret)

                const isFiltered = colorMode === 'sector' && sectorFilter
                  ? s.sector !== sectorFilter
                  : false

                return (
                  <text
                    key={`label-${s.symbol}`}
                    x={cx} y={cy - r - 6}
                    fill={isActive ? '#fff' : color}
                    opacity={isFiltered ? 0.06 : (isActive ? 1 : 0.65)}
                    fontSize="10"
                    fontFamily="'JetBrains Mono', monospace"
                    fontWeight={isActive ? 700 : 500}
                    textAnchor="middle"
                    style={{
                      transition: 'fill 0.2s ease, opacity 0.2s ease',
                      pointerEvents: 'none',
                    }}
                  >
                    {s.symbol}
                  </text>
                )
              })}

              {/* Benchmark labels — on top */}
              {data.benchmarks.map(bench => {
                const bx = toX(getVol(bench))
                const by = toY(bench.ret)
                const benchKey = `BENCH_${bench.symbol}`
                const isActive = activeSymbol === benchKey
                return isActive ? (
                  <g key={`label-${benchKey}`} style={{ pointerEvents: 'none' }}>
                    <text x={bx} y={by - 16} fill="#fff" fontSize="10" fontFamily="'JetBrains Mono', monospace" fontWeight="700" textAnchor="middle">{bench.symbol}</text>
                    <text x={bx} y={by - 26} fill="#888" fontSize="8" fontFamily="'JetBrains Mono', monospace" textAnchor="middle" letterSpacing="0.1em">BENCHMARK</text>
                  </g>
                ) : (
                  <text key={`label-${benchKey}`} x={bx} y={by - 14} fill="#888" fontSize="9" fontFamily="'JetBrains Mono', monospace" fontWeight="500" textAnchor="middle" opacity={0.6} style={{ pointerEvents: 'none' }}>{bench.symbol}</text>
                )
              })}
            </svg>

            {/* Hover tooltip */}
            {activeSymbol && (() => {
              const isBench = activeSymbol?.startsWith('BENCH_')
              const stock = isBench
                ? null
                : data.stocks.find(s => s.symbol === activeSymbol)
              const bench = isBench ? data.benchmarks.find(b => `BENCH_${b.symbol}` === activeSymbol) ?? null : null
              const item = stock || bench
              if (!item) return null

              const vol = getVol(item)
              const ret = item.ret
              const px = toX(vol)
              const py = toY(ret)

              // Flip tooltip to left side if near right edge
              const flipLeft = px > dimensions.width * 0.65
              const tooltipLeft = flipLeft ? px - 200 : px + 20
              const tooltipTop = Math.max(PADDING.top, Math.min(py - 40, dimensions.height - PADDING.bottom - 140))

              const quad = getQuadrant(ret, vol, spyRet, spyVol)
              const qColor = QUADRANT_CONFIG[quad].color
              const sharpeColor = item.sharpe >= 1 ? '#22c55e' : item.sharpe >= 0.5 ? '#f59e0b' : item.sharpe >= 0 ? '#888' : '#ef4444'

              return (
                <div style={{
                  position: 'absolute',
                  left: tooltipLeft,
                  top: tooltipTop,
                  width: 180,
                  background: '#0a0a10',
                  border: '1px solid #1a1a1a',
                  borderLeft: `2px solid ${stock ? getStockColor(stock) : qColor}`,
                  borderRadius: 6,
                  padding: '12px 14px',
                  pointerEvents: 'none',
                  zIndex: 50,
                  animation: 'fadeIn 0.15s ease',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>
                    {item.symbol}
                  </div>
                  {'name' in item && (
                    <div style={{ fontSize: 10, color: '#555', fontFamily: "'DM Sans', sans-serif", marginBottom: colorMode === 'sector' && stock ? 2 : 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                  )}
                  {stock && colorMode === 'sector' && (
                    <div style={{
                      fontSize: 9,
                      color: getStockColor(stock),
                      fontFamily: "'JetBrains Mono', monospace",
                      marginBottom: 10,
                      letterSpacing: '0.05em',
                    }}>
                      {stock.sector}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>RETURN</span>
                      <span style={{ fontSize: 10, color: ret >= 0 ? '#22c55e' : '#f87171', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                        {ret >= 0 ? '+' : ''}{(ret * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>{volMetric === 'downside' ? 'DOWNSIDE VOL' : 'VOLATILITY'}</span>
                      <span style={{ fontSize: 10, color: '#ccc', fontFamily: "'JetBrains Mono', monospace" }}>
                        {(vol * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>DOWNSIDE VOL</span>
                      <span style={{ fontSize: 10, color: '#ccc', fontFamily: "'JetBrains Mono', monospace" }}>
                        {(item.downsideVol * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>MAX DD</span>
                      <span style={{ fontSize: 10, color: '#ef4444', fontFamily: "'JetBrains Mono', monospace" }}>
                        -{(item.maxDrawdown * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>SHARPE</span>
                      <span style={{ fontSize: 10, color: sharpeColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                        {item.sharpe.toFixed(1)}
                      </span>
                    </div>
                    {stock && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>MKT CAP</span>
                          <span style={{ fontSize: 10, color: '#ccc', fontFamily: "'JetBrains Mono', monospace" }}>
                            {formatMktCap(stock.mcap)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>PRICE</span>
                          <span style={{ fontSize: 10, color: '#ccc', fontFamily: "'JetBrains Mono', monospace" }}>
                            ${stock.price.toFixed(2)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}
