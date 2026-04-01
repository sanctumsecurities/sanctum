# Settings Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat settings modal with a tabbed (vertical left nav) modal featuring 4 tabs — General, Display, Data, Account — with 3 new banner settings (scroll speed, update frequency, custom tickers) persisted per-user in Supabase.

**Architecture:** Settings are stored in a `user_settings` Supabase table (already created) and cached in `localStorage` (`sanctum-settings`). On mount, localStorage is read first for instant paint; Supabase is fetched in the background and wins on conflict. On save, both are written simultaneously. `TickerBanner` accepts `speed`, `updateFreq`, and `tickers` as props so it reacts to changes without re-mounting. A new `components/SettingsModal.tsx` replaces the inline 200-line modal block in `page.tsx`.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase JS client, inline styles (no Tailwind in components), Yahoo Finance 2

---

## Files

- **Create:** `components/SettingsModal.tsx` — tabbed settings modal, all UI, no data fetching
- **Modify:** `app/api/ticker-band/route.ts` — accept `?tickers=` query param for custom symbols
- **Modify:** `app/page.tsx` — extend settings type/state/persistence, TickerBanner props, wire SettingsModal

---

### Task 1: Extend ticker-band API for custom tickers

**Files:**
- Modify: `app/api/ticker-band/route.ts`

The API currently fetches a hardcoded INSTRUMENTS list. We need it to accept a `?tickers=^GSPC,AAPL,...` query param. For unknown symbols, use the Yahoo Finance `shortName` as the label.

- [ ] **Step 1: Update `app/api/ticker-band/route.ts`** — replace the entire file:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

export const dynamic = 'force-dynamic'

const DEFAULT_INSTRUMENTS = [
  { symbol: '^GSPC', label: 'S&P 500 (^GSPC)' },
  { symbol: '^IXIC', label: 'NASDAQ (^IXIC)' },
  { symbol: '^DJI', label: 'DOW (^DJI)' },
  { symbol: '^RUT', label: 'RUSSELL (^RUT)' },
  { symbol: '^VIX', label: 'VIX (^VIX)' },
  { symbol: 'GC=F', label: 'GOLD (GC=F)' },
  { symbol: 'CL=F', label: 'OIL (CL=F)' },
]

const DEFAULT_LABEL_MAP: Record<string, string> = Object.fromEntries(
  DEFAULT_INSTRUMENTS.map(({ symbol, label }) => [symbol, label])
)

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

async function fetchInstrument(
  symbol: string,
  label: string
): Promise<{ symbol: string; label: string; price: number; change: number; changePct: number } | null> {
  try {
    const quote = await withTimeout(yahooFinance.quote(symbol), 5000) as any
    if (quote?.regularMarketPrice == null) return null
    return {
      symbol,
      label,
      price: quote.regularMarketPrice as number,
      change: (quote.regularMarketChange ?? 0) as number,
      changePct: (quote.regularMarketChangePercent ?? 0) as number,
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const tickersParam = request.nextUrl.searchParams.get('tickers')
    const instruments = tickersParam
      ? tickersParam.split(',').filter(Boolean).map(s => s.trim().toUpperCase()).map(symbol => ({
          symbol,
          label: DEFAULT_LABEL_MAP[symbol] ?? symbol,
        }))
      : DEFAULT_INSTRUMENTS

    const results = await Promise.all(
      instruments.map(({ symbol, label }) => fetchInstrument(symbol, label))
    )
    const items = results.filter((r): r is NonNullable<typeof r> => r !== null)
    return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch ticker data' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/api/ticker-band/route.ts"
git commit -m "feat: ticker-band API accepts custom ?tickers= query param"
```

---

### Task 2: Extend settings type, state, and TickerBanner in page.tsx

**Files:**
- Modify: `app/page.tsx`

Three changes in this task: (a) extend the settings type with 3 new fields, (b) update TickerBanner to accept props, (c) make the ticker-scroll animation duration dynamic.

- [ ] **Step 1: Add `DEFAULT_SETTINGS` constant and `AppSettings` type before the `Home` component** (insert after the `TICKER_BAND_INSTRUMENTS` constant, around line 74):

```typescript
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
```

- [ ] **Step 2: Update `TickerBanner` to accept props** — replace the function signature and internals (lines 76–170):

```typescript
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
```

- [ ] **Step 3: Replace the `settings` useState at line 780** — change from:

```typescript
const [settings, setSettings] = useState({ defaultTab: 'Dashboard' as 'Dashboard' | 'Watchlist', clockFormat: '12h' as '12h' | '24h' })
```

to:

```typescript
const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
```

- [ ] **Step 4: Replace the load-settings useEffect (lines 862–877)** — change from:

```typescript
  // ── Load settings from localStorage ──
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sanctum-settings')
      if (stored) {
        const parsed = JSON.parse(stored)
        setSettings(prev => ({ ...prev, ...parsed }))
        if (parsed.defaultTab) setActiveTab(parsed.defaultTab)
      }
    } catch {}
  }, [])

  const updateSettings = (patch: Partial<typeof settings>) => {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    localStorage.setItem('sanctum-settings', JSON.stringify(updated))
  }
```

to:

```typescript
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
```

- [ ] **Step 5: Find the `<TickerBanner />` render call (around line 1470)** and update it to pass props:

```typescript
<TickerBanner
  speed={BANNER_SPEED_SECS[settings.bannerSpeed]}
  updateFreq={settings.bannerUpdateFreq}
  tickers={settings.bannerTickers}
/>
```

- [ ] **Step 6: Commit**

```bash
git add "app/page.tsx"
git commit -m "feat: extend settings type and TickerBanner accepts speed/updateFreq/tickers props"
```

---

### Task 3: Add Supabase settings sync on login and sign-out cleanup

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add `loadSettingsFromSupabase` after the `updateSettings` function** (insert around line 878, after `updateSettings`):

```typescript
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
```

- [ ] **Step 2: Call `loadSettingsFromSupabase` when a session is established** — find the auth useEffect (lines 802–811) and update it:

```typescript
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
        // User signed out — reset to defaults and clear cache
        setSettings(DEFAULT_SETTINGS)
        localStorage.removeItem('sanctum-settings')
      }
    })
    return () => subscription.unsubscribe()
  }, [loadSettingsFromSupabase])
```

- [ ] **Step 3: Commit**

```bash
git add "app/page.tsx"
git commit -m "feat: sync settings with Supabase on login, reset on sign-out"
```

---

### Task 4: Create SettingsModal component

**Files:**
- Create: `components/SettingsModal.tsx`

- [ ] **Step 1: Create `components/SettingsModal.tsx`**:

```typescript
'use client'

import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AppSettings } from '@/app/page'

const DEFAULT_BANNER_TICKERS = ['^GSPC', '^IXIC', '^DJI', '^RUT', '^VIX', 'GC=F', 'CL=F']

const FREQ_OPTIONS: { label: string; value: number }[] = [
  { label: '3s', value: 3_000 },
  { label: '10s', value: 10_000 },
  { label: '1m', value: 60_000 },
  { label: '5m', value: 300_000 },
  { label: '10m', value: 600_000 },
]

const BTN = (active: boolean): React.CSSProperties => ({
  background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
  border: `1px solid ${active ? 'rgba(255,255,255,0.3)' : '#1a1a1a'}`,
  borderRadius: 4,
  color: active ? '#fff' : '#555',
  fontSize: 12,
  padding: '6px 14px',
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: '0.05em',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
})

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10,
  color: '#444',
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: '0.15em',
  marginBottom: 16,
  textTransform: 'uppercase',
}

const FIELD_LABEL: React.CSSProperties = {
  fontSize: 12,
  color: '#888',
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: '0.05em',
  marginBottom: 8,
}

type Tab = 'general' | 'display' | 'data' | 'account'

interface Props {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  watchlist: string[]
  saveWatchlist: (list: string[]) => void
  session: Session | null
  onClose: () => void
}

export default function SettingsModal({ settings, updateSettings, watchlist, saveWatchlist, session, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('general')
  const [tickerInput, setTickerInput] = useState('')
  const [addingTicker, setAddingTicker] = useState(false)

  const navItem = (tab: Tab, label: string) => (
    <div
      key={tab}
      onClick={() => setActiveTab(tab)}
      style={{
        padding: '9px 16px',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: activeTab === tab ? '#fff' : '#555',
        background: activeTab === tab ? 'rgba(255,255,255,0.06)' : 'transparent',
        borderRight: `2px solid ${activeTab === tab ? '#fff' : 'transparent'}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  )

  const addTicker = () => {
    const sym = tickerInput.trim().toUpperCase()
    if (!sym || settings.bannerTickers.includes(sym)) {
      setTickerInput('')
      setAddingTicker(false)
      return
    }
    updateSettings({ bannerTickers: [...settings.bannerTickers, sym] })
    setTickerInput('')
    setAddingTicker(false)
  }

  const removeTicker = (sym: string) => {
    updateSettings({ bannerTickers: settings.bannerTickers.filter(t => t !== sym) })
  }

  const resetTickers = () => {
    updateSettings({ bannerTickers: DEFAULT_BANNER_TICKERS })
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: 4,
        width: '100%',
        maxWidth: 560,
        margin: '0 20px',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 80px)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px 14px',
          borderBottom: '1px solid #1a1a1a',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.15em' }}>
            SETTINGS
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#555', fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left nav */}
          <div style={{ width: 130, borderRight: '1px solid #1a1a1a', paddingTop: 12, flexShrink: 0 }}>
            {navItem('general', 'General')}
            {navItem('display', 'Display')}
            {navItem('data', 'Data')}
            {navItem('account', 'Account')}
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>

            {/* ── GENERAL ── */}
            {activeTab === 'general' && (
              <>
                <div style={SECTION_LABEL}>Preferences</div>

                <div style={{ marginBottom: 20 }}>
                  <div style={FIELD_LABEL}>DEFAULT TAB</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['Dashboard', 'Watchlist'] as const).map(tab => (
                      <button key={tab} onClick={() => updateSettings({ defaultTab: tab })} style={BTN(settings.defaultTab === tab)}>
                        {tab.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={FIELD_LABEL}>CLOCK FORMAT</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['12h', '24h'] as const).map(fmt => (
                      <button key={fmt} onClick={() => updateSettings({ clockFormat: fmt })} style={BTN(settings.clockFormat === fmt)}>
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── DISPLAY ── */}
            {activeTab === 'display' && (
              <>
                <div style={SECTION_LABEL}>Banner</div>

                <div style={{ marginBottom: 20 }}>
                  <div style={FIELD_LABEL}>SCROLL SPEED</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['fast', 'regular', 'slow'] as const).map(s => (
                      <button key={s} onClick={() => updateSettings({ bannerSpeed: s })} style={BTN(settings.bannerSpeed === s)}>
                        {s.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={FIELD_LABEL}>UPDATE FREQUENCY</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {FREQ_OPTIONS.map(({ label, value }) => (
                      <button key={value} onClick={() => updateSettings({ bannerUpdateFreq: value })} style={BTN(settings.bannerUpdateFreq === value)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={FIELD_LABEL}>TICKERS</div>
                  <div style={{
                    background: '#0f0f0f',
                    border: '1px solid #1a1a1a',
                    borderRadius: 4,
                    padding: '10px 12px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    minHeight: 48,
                    alignItems: 'flex-start',
                  }}>
                    {settings.bannerTickers.map(sym => (
                      <span
                        key={sym}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 8px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid #2a2a2a',
                          borderRadius: 3,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11,
                          color: '#ccc',
                        }}
                      >
                        {sym}
                        <button
                          onClick={() => removeTicker(sym)}
                          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#555')}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {addingTicker ? (
                      <input
                        autoFocus
                        value={tickerInput}
                        onChange={e => setTickerInput(e.target.value.toUpperCase())}
                        onKeyDown={e => {
                          if (e.key === 'Enter') addTicker()
                          if (e.key === 'Escape') { setTickerInput(''); setAddingTicker(false) }
                        }}
                        onBlur={addTicker}
                        placeholder="SYMBOL"
                        style={{
                          background: 'transparent',
                          border: '1px dashed #444',
                          borderRadius: 3,
                          color: '#ccc',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11,
                          padding: '3px 8px',
                          width: 80,
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => setAddingTicker(true)}
                        style={{
                          background: 'transparent',
                          border: '1px dashed #333',
                          borderRadius: 3,
                          color: '#444',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11,
                          padding: '3px 10px',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#555' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#444'; e.currentTarget.style.borderColor = '#333' }}
                      >
                        + add
                      </button>
                    )}
                  </div>
                  <button
                    onClick={resetTickers}
                    style={{
                      background: 'none', border: 'none',
                      color: '#444',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      padding: '6px 0 0',
                      textDecoration: 'underline',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#888')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#444')}
                  >
                    Reset to defaults
                  </button>
                </div>
              </>
            )}

            {/* ── DATA ── */}
            {activeTab === 'data' && (
              <>
                <div style={SECTION_LABEL}>Watchlist</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#888', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}>
                      CLEAR WATCHLIST
                    </div>
                    <div style={{ fontSize: 11, color: '#444', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                      {watchlist.length} item{watchlist.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => saveWatchlist([])}
                    disabled={watchlist.length === 0}
                    style={{
                      background: watchlist.length > 0 ? 'rgba(248,113,113,0.08)' : 'transparent',
                      border: `1px solid ${watchlist.length > 0 ? 'rgba(248,113,113,0.3)' : '#1a1a1a'}`,
                      borderRadius: 4,
                      color: watchlist.length > 0 ? '#f87171' : '#333',
                      fontSize: 12, padding: '6px 14px',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '0.05em',
                      cursor: watchlist.length > 0 ? 'pointer' : 'default',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    CLEAR
                  </button>
                </div>
              </>
            )}

            {/* ── ACCOUNT ── */}
            {activeTab === 'account' && (
              <>
                <div style={SECTION_LABEL}>Account</div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em', marginBottom: 4 }}>
                    SIGNED IN AS
                  </div>
                  <div style={{ fontSize: 13, color: '#888', fontFamily: "'JetBrains Mono', monospace" }}>
                    {session?.user?.email || '—'}
                  </div>
                </div>
                <button
                  onClick={() => supabase.auth.signOut()}
                  style={{
                    background: 'transparent',
                    border: '1px solid #2a2a2a',
                    borderRadius: 4,
                    color: '#888',
                    fontSize: 12, padding: '8px 20px',
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    width: '100%',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#2a2a2a' }}
                >
                  SIGN OUT
                </button>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "components/SettingsModal.tsx"
git commit -m "feat: add SettingsModal component with vertical tabs"
```

---

### Task 5: Wire SettingsModal into page.tsx

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add import at the top of `app/page.tsx`** (after the existing imports, around line 9):

```typescript
import SettingsModal from '@/components/SettingsModal'
```

- [ ] **Step 2: Replace the settings modal block (lines 1956–2183)** — find the comment `{/* ── Settings Modal ── */}` and replace the entire block through the closing `)}`:

```tsx
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
```

- [ ] **Step 3: Verify the app builds**

```bash
npm run build
```

Expected: no TypeScript errors, successful build output.

- [ ] **Step 4: Commit**

```bash
git add "app/page.tsx"
git commit -m "feat: wire SettingsModal into page, settings persisted per-user in Supabase"
```

---

## Completion Checklist

- [ ] Custom tickers in banner reflect changes immediately after saving
- [ ] Scroll speed changes take effect on next render
- [ ] Update frequency changes restart the poll interval
- [ ] Settings survive page refresh (localStorage)
- [ ] Settings survive sign-out + sign-in on a fresh device (Supabase)
- [ ] Sign-out resets settings to defaults
- [ ] Ticker chip editor: add, remove, reset to defaults all work
- [ ] All 4 tabs render without errors
