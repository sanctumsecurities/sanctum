'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Holding } from '@/lib/portfolio/types'
import { COLORS, MONO } from './styles'

interface Suggestion {
  symbol: string
  name: string
}

interface Props {
  userId: string
  existing?: Holding
  existingByTicker: Record<string, Holding>
  onClose: () => void
  onSaved: () => void
}

export default function AddPositionModal({ userId, existing, existingByTicker, onClose, onSaved }: Props) {
  const openedInEditMode = !!existing
  const [matchedExisting, setMatchedExisting] = useState<Holding | undefined>(existing)
  const isEdit = !!matchedExisting
  const [ticker, setTicker] = useState(existing?.ticker ?? '')
  const [tickerResolved, setTickerResolved] = useState<boolean>(openedInEditMode)
  const [shares, setShares] = useState(existing ? String(existing.shares) : '')
  const [avgCost, setAvgCost] = useState(existing ? String(existing.avg_cost) : '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  const fetchSuggestions = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const upper = value.toUpperCase()
    if (!upper) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(upper)}`)
        const json = (await res.json()) as Suggestion[]
        setSuggestions(json ?? [])
        setHighlightedIdx(-1)
      } catch {
        setSuggestions([])
      }
    }, 180)
  }

  const onTickerChange = (value: string) => {
    const upper = value.toUpperCase()
    setTicker(upper)
    setTickerResolved(false)
    setError(null)
    // If we had auto-matched an existing row but the user is now editing
    // the ticker field, drop out of edit mode (unless the modal was opened
    // in explicit edit mode for that row).
    if (!openedInEditMode) {
      setMatchedExisting(undefined)
      setShares('')
      setAvgCost('')
    }
    fetchSuggestions(upper)
  }

  const chooseSuggestion = (s: Suggestion) => {
    setTicker(s.symbol)
    setTickerResolved(true)
    setSuggestions([])
    setHighlightedIdx(-1)
    // If this ticker is already in the portfolio, switch into edit mode
    // and pre-fill shares + avg cost from the existing row.
    const match = existingByTicker[s.symbol]
    if (match && !openedInEditMode) {
      setMatchedExisting(match)
      setShares(String(match.shares))
      setAvgCost(String(match.avg_cost))
      setError(null)
    }
  }

  const validate = (): string | null => {
    if (!ticker.trim()) return 'Ticker is required.'
    if (!tickerResolved) return 'Select a ticker from the dropdown.'
    const sharesNum = Number(shares)
    const costNum = Number(avgCost)
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) return 'Shares must be greater than 0.'
    if (!Number.isFinite(costNum) || costNum <= 0) return 'Avg cost must be greater than 0.'
    return null
  }

  const save = async () => {
    const msg = validate()
    if (msg) { setError(msg); return }
    setSaving(true)
    setError(null)
    const payload = {
      user_id: userId,
      ticker: ticker.trim().toUpperCase(),
      shares: Number(shares),
      avg_cost: Number(avgCost),
      updated_at: new Date().toISOString(),
    }
    const { error: dbError } = await supabase
      .from('holdings')
      .upsert(payload, { onConflict: 'user_id,ticker' })
    setSaving(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    onSaved()
    onClose()
  }

  const del = async () => {
    if (!matchedExisting) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      setTimeout(() => setConfirmingDelete(false), 3000)
      return
    }
    setDeleting(true)
    const { error: dbError } = await supabase
      .from('holdings')
      .delete()
      .eq('id', matchedExisting.id)
    setDeleting(false)
    if (dbError) { setError(dbError.message); return }
    onSaved()
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 220,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div ref={containerRef} style={{
        background: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 4,
        width: '100%', maxWidth: 440,
        margin: '0 20px',
        padding: '20px 24px',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: 14, borderBottom: `1px solid ${COLORS.border}`,
          marginBottom: 18,
        }}>
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
            {isEdit ? 'EDIT POSITION' : 'ADD POSITION'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.textMuted, fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {/* Ticker */}
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <div style={{ fontSize: 12, color: COLORS.textDim, fontFamily: MONO, letterSpacing: '0.05em', marginBottom: 6 }}>
            TICKER
          </div>
          <input
            type="text"
            value={ticker}
            disabled={openedInEditMode}
            onChange={e => onTickerChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIdx(i => Math.min(i + 1, suggestions.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIdx(i => Math.max(i - 1, -1)) }
              else if (e.key === 'Enter' && highlightedIdx >= 0) {
                e.preventDefault()
                chooseSuggestion(suggestions[highlightedIdx])
              }
            }}
            placeholder="AAPL"
            style={{
              width: '100%',
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLORS.text,
              fontFamily: MONO,
              fontSize: 13,
              letterSpacing: '0.05em',
              outline: 'none',
              opacity: openedInEditMode ? 0.6 : 1,
            }}
          />
          {isEdit && !openedInEditMode && (
            <div style={{
              marginTop: 6, fontSize: 10, color: COLORS.warn,
              fontFamily: MONO, letterSpacing: '0.05em',
            }}>
              You already own {ticker}. Saving will update your existing position.
            </div>
          )}
          {!openedInEditMode && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: COLORS.bg,
              border: `1px solid ${COLORS.borderStrong}`,
              borderTop: 'none',
              borderRadius: '0 0 3px 3px',
              zIndex: 5,
              maxHeight: 240,
              overflowY: 'auto',
            }}>
              {suggestions.map((s, i) => (
                <div
                  key={s.symbol}
                  onMouseDown={e => { e.preventDefault(); chooseSuggestion(s) }}
                  onMouseEnter={() => setHighlightedIdx(i)}
                  style={{
                    display: 'flex', gap: 10, padding: '8px 12px',
                    background: highlightedIdx === i ? 'rgba(255,255,255,0.05)' : 'transparent',
                    cursor: 'pointer',
                    borderTop: i > 0 ? `1px solid ${COLORS.divider}` : 'none',
                  }}
                >
                  <span style={{ color: COLORS.text, fontFamily: MONO, fontSize: 12, minWidth: 56 }}>{s.symbol}</span>
                  <span style={{ color: COLORS.textFaint, fontFamily: MONO, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Shares */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: COLORS.textDim, fontFamily: MONO, letterSpacing: '0.05em', marginBottom: 6 }}>
            SHARES
          </div>
          <input
            type="number"
            step="any"
            value={shares}
            onChange={e => { setShares(e.target.value); setError(null) }}
            placeholder="50"
            style={{
              width: '100%',
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLORS.text,
              fontFamily: MONO,
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {/* Avg Cost */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: COLORS.textDim, fontFamily: MONO, letterSpacing: '0.05em', marginBottom: 6 }}>
            AVG COST (USD)
          </div>
          <input
            type="number"
            step="any"
            value={avgCost}
            onChange={e => { setAvgCost(e.target.value); setError(null) }}
            placeholder="185.50"
            style={{
              width: '100%',
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLORS.text,
              fontFamily: MONO,
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {error && (
          <div style={{ color: COLORS.neg, fontSize: 11, fontFamily: MONO, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {/* Action row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div>
            {isEdit && (
              <button
                onClick={del}
                disabled={deleting}
                style={{
                  background: confirmingDelete ? 'rgba(248,113,113,0.15)' : 'transparent',
                  border: `1px solid ${confirmingDelete ? 'rgba(248,113,113,0.5)' : COLORS.borderStrong}`,
                  color: confirmingDelete ? COLORS.neg : COLORS.textMuted,
                  borderRadius: 3, fontSize: 11,
                  padding: '7px 14px', fontFamily: MONO,
                  letterSpacing: '0.1em', cursor: 'pointer',
                }}
              >
                {deleting ? 'DELETING...' : confirmingDelete ? 'CONFIRM DELETE' : 'DELETE'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.borderStrong}`,
                color: COLORS.textDim,
                borderRadius: 3, fontSize: 11,
                padding: '7px 14px', fontFamily: MONO,
                letterSpacing: '0.1em', cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: `1px solid rgba(255,255,255,0.3)`,
                color: COLORS.text,
                borderRadius: 3, fontSize: 11,
                padding: '7px 18px', fontFamily: MONO,
                letterSpacing: '0.1em', cursor: 'pointer',
              }}
            >
              {saving ? 'SAVING...' : isEdit ? 'UPDATE' : 'SAVE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
