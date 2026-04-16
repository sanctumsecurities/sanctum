'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Holding } from '@/lib/portfolio/types'
import { CASH_TICKER } from '@/lib/portfolio/metrics'
import { COLORS, MONO } from './styles'

interface Props {
  userId: string
  existing?: Holding
  onClose: () => void
  onSaved: () => void
}

export default function AddCashModal({ userId, existing, onClose, onSaved }: Props) {
  const isEdit = !!existing
  const [amount, setAmount] = useState(existing ? String(existing.shares) : '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  const save = async () => {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      setError('Amount must be greater than 0.')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      user_id: userId,
      ticker: CASH_TICKER,
      shares: n,
      avg_cost: 1,
      updated_at: new Date().toISOString(),
    }
    const { error: dbError } = await supabase
      .from('holdings')
      .upsert(payload, { onConflict: 'user_id,ticker' })
    setSaving(false)
    if (dbError) { setError(dbError.message); return }
    onSaved()
    onClose()
  }

  const del = async () => {
    if (!existing) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      setTimeout(() => setConfirmingDelete(false), 3000)
      return
    }
    setDeleting(true)
    const { error: dbError } = await supabase
      .from('holdings')
      .delete()
      .eq('id', existing.id)
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
      <div style={{
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
          <span style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: MONO, letterSpacing: '0.15em' }}>
            {isEdit ? 'EDIT CASH' : 'ADD CASH'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.textMuted, fontSize: 17, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: COLORS.textDim, fontFamily: MONO, letterSpacing: '0.05em', marginBottom: 6 }}>
            AMOUNT (USD)
          </div>
          <input
            type="number"
            step="any"
            autoFocus
            value={amount}
            onChange={e => { setAmount(e.target.value); setError(null) }}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            style={{
              width: '100%',
              background: COLORS.panel,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: COLORS.text,
              fontFamily: MONO,
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        {error && (
          <div style={{ color: COLORS.neg, fontSize: 12, fontFamily: MONO, marginBottom: 14 }}>
            {error}
          </div>
        )}

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
                  borderRadius: 3, fontSize: 12,
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
                borderRadius: 3, fontSize: 12,
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
                borderRadius: 3, fontSize: 12,
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
