'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import StockReport from '@/components/reports/StockReport'

export default function ReportPage() {
  const params = useParams()
  const router = useRouter()
  const rawTicker = (params.ticker as string).toUpperCase()
  const isValidTicker = /^[A-Z0-9.\-^=]{1,20}$/.test(rawTicker)

  // All hooks must be called unconditionally — conditional return comes AFTER
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    if (!isValidTicker) return
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s) loadWatchlist(s.user.id)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValidTicker])

  const loadWatchlist = async (userId: string) => {
    const { data } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle()
    const wl = (data?.settings as any)?.watchlist
    if (Array.isArray(wl)) setWatchlist(wl)
  }

  const toggleWatchlist = useCallback(async () => {
    if (!session || !isValidTicker) return
    const isOn = watchlist.includes(rawTicker)
    const updated = isOn
      ? watchlist.filter(t => t !== rawTicker)
      : [...watchlist, rawTicker]
    setWatchlist(updated)

    // Read current settings first, then merge watchlist into them
    const { data: existing } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', session.user.id)
      .maybeSingle()
    const currentSettings = (existing?.settings as any) ?? {}
    await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: session.user.id,
          settings: { ...currentSettings, watchlist: updated },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
  }, [session, watchlist, rawTicker, isValidTicker])

  // Conditional return AFTER all hooks
  if (!isValidTicker) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#ef4444', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>
          Invalid ticker symbol.
        </p>
      </div>
    )
  }

  const isOnWatchlist = watchlist.includes(rawTicker)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1a1a1a',
        padding: '0 40px',
      }}>
        <div style={{
          maxWidth: 1880, margin: '0 auto', width: '100%',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          height: 56,
        }}>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'none', border: '1px solid #2a2a2a', borderRadius: 4,
              color: '#888', fontSize: 12, padding: '8px 16px', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '0.05em', transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}
          >
            &larr; BACK
          </button>
          {session && (
            <button
              onClick={toggleWatchlist}
              style={{
                background: isOnWatchlist ? 'rgba(34,197,94,0.08)' : 'transparent',
                border: `1px solid ${isOnWatchlist ? 'rgba(34,197,94,0.4)' : '#2a2a2a'}`,
                borderRadius: 4,
                color: isOnWatchlist ? '#22c55e' : '#888',
                fontSize: 12, padding: '8px 16px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em', transition: 'all 0.2s ease',
              }}
            >
              {isOnWatchlist ? 'ON WATCHLIST' : '+ WATCHLIST'}
            </button>
          )}
        </div>
      </div>

      <StockReport ticker={rawTicker} />
    </div>
  )
}
