'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#000000',
    }}>
      <div style={{
        width: '100%', maxWidth: 400, padding: 40,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{
            fontSize: 36, fontWeight: 700, color: '#e8ecf1',
            fontFamily: "'Instrument Serif', serif", margin: 0, letterSpacing: -0.5,
          }}>
            Sanctum
          </h1>
          <p style={{
            fontSize: 13, color: '#555', marginTop: 8,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            AI Research Terminal
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 11, color: '#8b95a5',
              textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%', padding: '12px 14px', fontSize: 14,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, color: '#e8ecf1', outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
                boxSizing: 'border-box',
                transition: 'border-color 0.2s ease',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              placeholder="you@email.com"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block', fontSize: 11, color: '#8b95a5',
              textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%', padding: '12px 14px', fontSize: 14,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, color: '#e8ecf1', outline: 'none',
                fontFamily: "'DM Sans', sans-serif",
                boxSizing: 'border-box',
                transition: 'border-color 0.2s ease',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(59,130,246,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              placeholder="Min 6 characters"
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', marginBottom: 16,
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 8, fontSize: 13, color: '#f87171',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '13px 0', fontSize: 14, fontWeight: 600,
              background: loading ? 'rgba(59,130,246,0.3)' : '#3b82f6',
              color: '#fff', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.2s ease',
              transform: 'scale(1)',
            }}
            onMouseDown={e => { if (!loading) (e.target as HTMLElement).style.transform = 'scale(0.98)' }}
            onMouseUp={e => (e.target as HTMLElement).style.transform = 'scale(1)'}
            onMouseLeave={e => (e.target as HTMLElement).style.transform = 'scale(1)'}
          >
            {loading ? 'Please wait...' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  )
}
