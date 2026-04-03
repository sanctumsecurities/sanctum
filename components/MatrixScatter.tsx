'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// ── Types ──

interface MatrixStock {
  symbol: string
  name: string
  ret: number
  vol: number
  mcap: number
  sharpe: number
  price: number
}

interface MatrixBenchmark {
  symbol: string
  name: string
  ret: number
  vol: number
  sharpe: number
}

interface MatrixData {
  stocks: MatrixStock[]
  benchmark: MatrixBenchmark
}

type DataSource = 'Reports' | 'Watchlist' | 'Custom'
type Quadrant = 'CORE' | 'VOLATILE' | 'DEFENSIVE' | 'AT RISK'

interface MatrixScatterProps {
  savedReports: Array<{ ticker: string }>
  watchlist: string[]
}

// ── Constants ──

const VOL_THRESHOLD = 0.35
const RET_THRESHOLD = 0.15

const QUADRANT_CONFIG: Record<Quadrant, { color: string; position: 'tl' | 'tr' | 'bl' | 'br' }> = {
  'CORE': { color: '#22c55e', position: 'tl' },
  'VOLATILE': { color: '#f59e0b', position: 'tr' },
  'DEFENSIVE': { color: '#6366f1', position: 'bl' },
  'AT RISK': { color: '#ef4444', position: 'br' },
}

const PADDING = { top: 44, right: 28, bottom: 52, left: 56 }

function getQuadrant(ret: number, vol: number): Quadrant {
  if (ret >= RET_THRESHOLD && vol < VOL_THRESHOLD) return 'CORE'
  if (ret >= RET_THRESHOLD && vol >= VOL_THRESHOLD) return 'VOLATILE'
  if (ret < RET_THRESHOLD && vol < VOL_THRESHOLD) return 'DEFENSIVE'
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
  if (range === 0) return 12
  const t = Math.max(0, Math.min(1, (logVal - logMin) / range))
  return 6 + t * 12
}

// ── Ticker Search for Custom mode ──

function TickerInput({ onAdd }: { onAdd: (symbol: string) => void }) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<Array<{ symbol: string; name: string }>>([])
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
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
        setOpen(true)
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
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        border: '1px solid #1a1a1a', borderRadius: 4,
        padding: '6px 10px', background: '#0a0a0a',
      }}>
        <span style={{ fontSize: 11, color: '#444', fontFamily: "'JetBrains Mono', monospace" }}>&gt;</span>
        <input
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value.toUpperCase()); search(e.target.value) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIdx(p => Math.min(p + 1, suggestions.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIdx(p => Math.max(p - 1, -1)) }
            else if (e.key === 'Enter') {
              if (highlightedIdx >= 0 && suggestions[highlightedIdx]) submit(suggestions[highlightedIdx].symbol)
              else submit(value)
            }
            else if (e.key === 'Escape') { setOpen(false); setSuggestions([]) }
          }}
          onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
          placeholder="ADD TICKER"
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: '#fff', fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em', width: 100,
          }}
        />
      </div>
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, minWidth: 220,
          background: '#0a0a0a', border: '1px solid #1a1a1a', borderTop: 'none',
          borderRadius: '0 0 4px 4px', zIndex: 60, overflow: 'hidden',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.symbol}
              onMouseDown={e => { e.preventDefault(); submit(s.symbol) }}
              onMouseEnter={() => setHighlightedIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', cursor: 'pointer',
                background: highlightedIdx === i ? 'rgba(255,255,255,0.05)' : 'transparent',
                borderTop: i > 0 ? '1px solid #111' : 'none',
              }}
            >
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#ccc', minWidth: 48 }}>{s.symbol}</span>
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ──

export default function MatrixScatter({ savedReports, watchlist }: MatrixScatterProps) {
  const [source, setSource] = useState<DataSource>('Reports')
  const [customTickers, setCustomTickers] = useState<string[]>([])
  const [data, setData] = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null)
  const [pinnedSymbol, setPinnedSymbol] = useState<string | null>(null)
  const [activeQuadrant, setActiveQuadrant] = useState<Quadrant | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Responsive sizing — fill remaining viewport
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const compute = () => {
      const rect = el.getBoundingClientRect()
      const w = rect.width
      const remaining = window.innerHeight - rect.top - 24 // 24px bottom breathing room
      setDimensions({ width: w, height: Math.max(340, remaining) })
    }
    compute()
    const observer = new ResizeObserver(() => compute())
    observer.observe(el)
    window.addEventListener('resize', compute)
    return () => { observer.disconnect(); window.removeEventListener('resize', compute) }
  }, [])

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

    fetch(`/api/matrix?tickers=${encodeURIComponent(tickers.join(','))}`)
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
  }, [tickers])

  // Quadrant counts
  const quadrantCounts = useMemo(() => {
    const counts: Record<Quadrant, number> = { 'CORE': 0, 'VOLATILE': 0, 'DEFENSIVE': 0, 'AT RISK': 0 }
    if (!data) return counts
    for (const s of data.stocks) {
      counts[getQuadrant(s.ret, s.vol)]++
    }
    return counts
  }, [data])

  // Axis ranges — computed from data, with some padding
  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    if (!data || data.stocks.length === 0) {
      return { xMin: 0, xMax: 0.8, yMin: -0.3, yMax: 0.6 }
    }
    const allVols = [...data.stocks.map(s => s.vol), data.benchmark.vol]
    const allRets = [...data.stocks.map(s => s.ret), data.benchmark.ret]
    const vMin = Math.min(0, ...allVols)
    const vMax = Math.max(0.8, ...allVols)
    const rMin = Math.min(-0.3, ...allRets)
    const rMax = Math.max(0.6, ...allRets)
    const vPad = (vMax - vMin) * 0.08
    const rPad = (rMax - rMin) * 0.08
    return { xMin: vMin - vPad, xMax: vMax + vPad, yMin: rMin - rPad, yMax: rMax + rPad }
  }, [data])

  const allMcaps = useMemo(() => data ? data.stocks.map(s => s.mcap) : [], [data])

  // Coordinate mappers
  const chartW = dimensions.width - PADDING.left - PADDING.right
  const chartH = dimensions.height - PADDING.top - PADDING.bottom

  const toX = useCallback((vol: number) => PADDING.left + ((vol - xMin) / (xMax - xMin)) * chartW, [xMin, xMax, chartW])
  const toY = useCallback((ret: number) => PADDING.top + ((yMax - ret) / (yMax - yMin)) * chartH, [yMin, yMax, chartH])

  // Active/hovered symbol
  const activeSymbol = pinnedSymbol ?? hoveredSymbol

  // ── Render ──

  const sourceButtons: DataSource[] = ['Reports', 'Watchlist', 'Custom']

  return (
    <div>
      {/* Data source selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        {sourceButtons.map(s => {
          const isActive = s === source
          return (
            <button
              key={s}
              onClick={() => { setSource(s); setPinnedSymbol(null); setActiveQuadrant(null) }}
              style={{
                background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : '#1a1a1a'}`,
                borderRadius: 4,
                padding: '6px 14px',
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
              {s}
            </button>
          )
        })}
      </div>

      {/* Custom mode: ticker chips + input */}
      {source === 'Custom' && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
          marginBottom: 20,
          padding: '12px 0',
          borderTop: '1px solid #111',
          borderBottom: '1px solid #111',
        }}>
          {customTickers.map(t => (
            <div key={t} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #1a1a1a',
              borderRadius: 4, padding: '4px 10px',
            }}>
              <span style={{ fontSize: 11, color: '#ccc', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>{t}</span>
              <button
                onClick={() => setCustomTickers(prev => prev.filter(x => x !== t))}
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
          <TickerInput onAdd={(sym) => {
            if (!customTickers.includes(sym)) setCustomTickers(prev => [...prev, sym])
          }} />
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
          {/* Quadrant filter pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            {(Object.keys(QUADRANT_CONFIG) as Quadrant[]).map(q => {
              const cfg = QUADRANT_CONFIG[q]
              const count = quadrantCounts[q]
              const isActive = activeQuadrant === q
              return (
                <button
                  key={q}
                  onClick={() => setActiveQuadrant(activeQuadrant === q ? null : q)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: `1px solid ${isActive ? cfg.color + '44' : '#1a1a1a'}`,
                    borderRadius: 4,
                    padding: '5px 10px',
                    fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.08em',
                    color: isActive ? cfg.color : '#555',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget).style.color = cfg.color }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget).style.color = '#555' }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: cfg.color,
                    opacity: isActive ? 1 : 0.5,
                  }} />
                  {q}
                  <span style={{ color: '#333', marginLeft: 2 }}>{count}</span>
                </button>
              )
            })}
            {activeQuadrant && (
              <button
                onClick={() => setActiveQuadrant(null)}
                style={{
                  background: 'none', border: '1px solid #1a1a1a', borderRadius: 4,
                  padding: '5px 10px', fontSize: 10, color: '#555', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em',
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={e => (e.currentTarget).style.color = '#fff'}
                onMouseLeave={e => (e.currentTarget).style.color = '#555'}
              >
                CLEAR
              </button>
            )}
          </div>

          {/* SVG Chart */}
          <div
            ref={containerRef}
            style={{
              background: '#08080c',
              border: '1px solid #111',
              borderRadius: 8,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <svg
              width={dimensions.width}
              height={dimensions.height}
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            >
              <defs>
                {/* Quadrant gradient washes */}
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
                const divX = toX(VOL_THRESHOLD)
                const divY = toY(RET_THRESHOLD)
                return (
                  <>
                    <rect x={PADDING.left} y={PADDING.top} width={divX - PADDING.left} height={divY - PADDING.top} fill="url(#grad-core)" />
                    <rect x={divX} y={PADDING.top} width={dimensions.width - PADDING.right - divX} height={divY - PADDING.top} fill="url(#grad-volatile)" />
                    <rect x={PADDING.left} y={divY} width={divX - PADDING.left} height={dimensions.height - PADDING.bottom - divY} fill="url(#grad-defensive)" />
                    <rect x={divX} y={divY} width={dimensions.width - PADDING.right - divX} height={dimensions.height - PADDING.bottom - divY} fill="url(#grad-atrisk)" />
                  </>
                )
              })()}

              {/* Grid lines — X axis (volatility) */}
              {[0, 0.2, 0.4, 0.6, 0.8].filter(v => v >= xMin && v <= xMax).map(v => (
                <line key={`xg-${v}`} x1={toX(v)} y1={PADDING.top} x2={toX(v)} y2={dimensions.height - PADDING.bottom} stroke="#0e0e12" strokeWidth="1" />
              ))}

              {/* Grid lines — Y axis (return) - contextual ticks */}
              {(() => {
                const ticks: number[] = []
                const step = 0.1
                let v = Math.ceil(yMin / step) * step
                while (v <= yMax) { ticks.push(v); v += step }
                return ticks.map(r => (
                  <line
                    key={`yg-${r}`}
                    x1={PADDING.left} y1={toY(r)}
                    x2={dimensions.width - PADDING.right} y2={toY(r)}
                    stroke={Math.abs(r) < 0.001 ? '#222' : '#0e0e12'}
                    strokeWidth="1"
                    strokeDasharray={Math.abs(r) < 0.001 ? '4,4' : 'none'}
                  />
                ))
              })()}

              {/* Quadrant divider lines */}
              <line
                x1={toX(VOL_THRESHOLD)} y1={PADDING.top}
                x2={toX(VOL_THRESHOLD)} y2={dimensions.height - PADDING.bottom}
                stroke="#1a1a1e" strokeWidth="1"
                strokeDasharray="6,4"
                style={{ animation: mounted ? undefined : 'none' }}
              />
              <line
                x1={PADDING.left} y1={toY(RET_THRESHOLD)}
                x2={dimensions.width - PADDING.right} y2={toY(RET_THRESHOLD)}
                stroke="#1a1a1e" strokeWidth="1"
                strokeDasharray="6,4"
              />

              {/* Quadrant labels */}
              {(() => {
                const divX = toX(VOL_THRESHOLD)
                const divY = toY(RET_THRESHOLD)
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
              {[0, 0.2, 0.4, 0.6, 0.8].filter(v => v >= xMin && v <= xMax).map(v => (
                <text
                  key={`xt-${v}`}
                  x={toX(v)} y={dimensions.height - PADDING.bottom + 20}
                  fill="#444" fontSize="10" textAnchor="middle"
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {(v * 100).toFixed(0)}%
                </text>
              ))}
              <text
                x={dimensions.width / 2} y={dimensions.height - 8}
                fill="#333" fontSize="10" textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
                letterSpacing="0.12em"
              >
                VOLATILITY
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
                    {(r * 100).toFixed(0)}%
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

              {/* Stock dots */}
              {data.stocks.map((s, i) => {
                const quad = getQuadrant(s.ret, s.vol)
                const color = QUADRANT_CONFIG[quad].color
                const r = dotRadius(s.mcap, allMcaps)
                const isFiltered = activeQuadrant !== null && activeQuadrant !== quad
                const isActive = activeSymbol === s.symbol
                const opacity = isFiltered ? 0.06 : 1
                const cx = toX(s.vol)
                const cy = toY(s.ret)

                return (
                  <g
                    key={s.symbol}
                    style={{
                      opacity,
                      transition: 'opacity 0.3s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setHoveredSymbol(s.symbol)}
                    onMouseLeave={() => setHoveredSymbol(null)}
                    onClick={() => setPinnedSymbol(pinnedSymbol === s.symbol ? null : s.symbol)}
                  >
                    {/* Glow ring on hover */}
                    {isActive && (
                      <circle
                        cx={cx} cy={cy} r={r + 6}
                        fill="none" stroke={color} strokeWidth="1.5"
                        opacity={0.3}
                        style={{ animation: 'pulse 2s ease-in-out infinite' }}
                      />
                    )}
                    {/* Dot */}
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
                    {/* Label */}
                    <text
                      x={cx} y={cy - r - 6}
                      fill={isActive ? '#fff' : color}
                      opacity={isActive ? 1 : 0.65}
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
                  </g>
                )
              })}

              {/* SPY Benchmark diamond */}
              {(() => {
                const bx = toX(data.benchmark.vol)
                const by = toY(data.benchmark.ret)
                const isActive = activeSymbol === 'SPY_BENCH'
                return (
                  <g
                    onMouseEnter={() => setHoveredSymbol('SPY_BENCH')}
                    onMouseLeave={() => setHoveredSymbol(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Crosshair lines */}
                    <line x1={bx - 18} y1={by} x2={bx + 18} y2={by} stroke="#fff" strokeWidth="0.5" opacity={0.3} />
                    <line x1={bx} y1={by - 18} x2={bx} y2={by + 18} stroke="#fff" strokeWidth="0.5" opacity={0.3} />
                    {/* Diamond (rotated square) */}
                    <rect
                      x={bx - 5} y={by - 5} width={10} height={10}
                      fill="#fff" fillOpacity={0.15}
                      stroke="#fff" strokeWidth="1.5"
                      transform={`rotate(45, ${bx}, ${by})`}
                      style={{
                        transform: mounted ? `rotate(45deg)` : 'rotate(45deg) scale(0)',
                        transformOrigin: `${bx}px ${by}px`,
                        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0ms',
                      }}
                    />
                    {/* Labels */}
                    {isActive && (
                      <>
                        <text x={bx} y={by - 16} fill="#fff" fontSize="10" fontFamily="'JetBrains Mono', monospace" fontWeight="700" textAnchor="middle">SPY</text>
                        <text x={bx} y={by - 26} fill="#888" fontSize="8" fontFamily="'JetBrains Mono', monospace" textAnchor="middle" letterSpacing="0.1em">BENCHMARK</text>
                      </>
                    )}
                    {!isActive && (
                      <text x={bx} y={by - 14} fill="#888" fontSize="9" fontFamily="'JetBrains Mono', monospace" fontWeight="500" textAnchor="middle" opacity={0.6}>SPY</text>
                    )}
                  </g>
                )
              })()}
            </svg>

            {/* Hover tooltip */}
            {activeSymbol && (() => {
              const stock = activeSymbol === 'SPY_BENCH'
                ? null
                : data.stocks.find(s => s.symbol === activeSymbol)
              const bench = activeSymbol === 'SPY_BENCH' ? data.benchmark : null
              const item = stock || bench
              if (!item) return null

              const vol = 'mcap' in item ? item.vol : (item as MatrixBenchmark).vol
              const ret = 'mcap' in item ? item.ret : (item as MatrixBenchmark).ret
              const px = toX(vol)
              const py = toY(ret)

              // Flip tooltip to left side if near right edge
              const flipLeft = px > dimensions.width * 0.65
              const tooltipLeft = flipLeft ? px - 200 : px + 20
              const tooltipTop = Math.max(PADDING.top, Math.min(py - 40, dimensions.height - PADDING.bottom - 140))

              const quad = getQuadrant(ret, vol)
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
                  borderLeft: `2px solid ${qColor}`,
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
                    <div style={{ fontSize: 10, color: '#555', fontFamily: "'DM Sans', sans-serif", marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
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
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>VOLATILITY</span>
                      <span style={{ fontSize: 10, color: '#ccc', fontFamily: "'JetBrains Mono', monospace" }}>
                        {(vol * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#555', fontFamily: "'JetBrains Mono', monospace" }}>SHARPE</span>
                      <span style={{ fontSize: 10, color: sharpeColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                        {item.sharpe.toFixed(2)}
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
