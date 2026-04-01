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
