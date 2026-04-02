'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const orbs = [
  { size: 300, top: '10%', left: '15%', duration: 18, direction: 'up' },
  { size: 250, top: '60%', left: '75%', duration: 22, direction: 'down' },
  { size: 200, top: '30%', left: '60%', duration: 25, direction: 'up' },
  { size: 350, top: '70%', left: '20%', duration: 20, direction: 'down' },
  { size: 180, top: '15%', left: '80%', duration: 28, direction: 'up' },
  { size: 280, top: '80%', left: '50%', duration: 16, direction: 'down' },
]

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [displayedText, setDisplayedText] = useState('')
  const [caretVisible, setCaretVisible] = useState(false)
  const [formVisible, setFormVisible] = useState(false)

  useEffect(() => {
    // Trigger form fade-in after mount
    requestAnimationFrame(() => setFormVisible(true))
  }, [])

  useEffect(() => {
    const timers: (ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>)[] = []

    const addTimeout = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms)
      timers.push(id)
      return id
    }
    const addInterval = (fn: () => void, ms: number) => {
      const id = setInterval(fn, ms)
      timers.push(id)
      return id
    }

    // Phase 1: Idle blink for 4 seconds
    const blinkInterval = addInterval(() => {
      setCaretVisible(v => !v)
    }, 530)

    setCaretVisible(true)

    addTimeout(() => {
      clearInterval(blinkInterval)
      setCaretVisible(true)

      // Phase 2: Type "SANCTUM" one character at a time
      const text = 'SANCTUM'
      let charIndex = 0

      const typeNextChar = () => {
        charIndex++
        setDisplayedText(text.slice(0, charIndex))

        if (charIndex < text.length) {
          const delay = 120 + Math.random() * 170
          addTimeout(typeNextChar, delay)
        } else {
          addTimeout(() => {
            addInterval(() => {
              setCaretVisible(v => !v)
            }, 530)
          }, 300)
        }
      }

      const firstDelay = 120 + Math.random() * 170
      addTimeout(typeNextChar, firstDelay)
    }, 4000)

    return () => {
      timers.forEach(id => {
        clearTimeout(id as ReturnType<typeof setTimeout>)
        clearInterval(id as ReturnType<typeof setInterval>)
      })
    }
  }, [])

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
    <div className="relative min-h-screen bg-[#09090b] overflow-hidden flex items-center justify-center">
      <style>{`
        @keyframes orbFloatUp {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-30px); }
        }
        @keyframes orbFloatDown {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(30px); }
        }
        @keyframes authFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes authErrorIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Animated Background — pure CSS */}
      <div className="fixed inset-0 pointer-events-none">
        {orbs.map((orb, i) => (
          <div
            key={i}
            className="absolute rounded-full blur-3xl"
            style={{
              width: orb.size,
              height: orb.size,
              top: orb.top,
              left: orb.left,
              background: 'rgba(255, 255, 255, 0.03)',
              animation: `${orb.direction === 'up' ? 'orbFloatUp' : 'orbFloatDown'} ${orb.duration}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      {/* Login Content — CSS animation instead of framer-motion */}
      <div
        className="relative z-10 w-full max-w-[384px] px-6"
        style={{
          opacity: formVisible ? 1 : 0,
          transform: formVisible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
        }}
      >
        {/* Header */}
        <div className="text-center mb-12">
          <h1 style={{
            fontSize: 48, fontWeight: 700, color: '#fff',
            letterSpacing: '0.08em',
            fontFamily: "'JetBrains Mono', monospace",
            margin: 0, lineHeight: 1,
          }}>
            {displayedText}
            <span style={{ fontWeight: 300, opacity: caretVisible ? 1 : 0, ...(displayedText && { display: 'inline-block', width: 0 }) }}>|</span>
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[11px] text-zinc-500 uppercase tracking-[0.15em] mb-2 font-mono">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 text-sm bg-zinc-900/60 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-600 font-mono tracking-wide outline-none transition-colors duration-200 focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 uppercase tracking-[0.15em] mb-2 font-mono">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 text-sm bg-zinc-900/60 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-600 font-mono tracking-wide outline-none transition-colors duration-200 focus:border-zinc-600"
            />
          </div>

          {/* Error message — CSS animation */}
          {error && (
            <div
              style={{ animation: 'authErrorIn 0.2s ease' }}
              className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-[13px] text-[#ef4444] font-mono"
            >
              {error}
            </div>
          )}

          <div className="flex justify-center mt-12">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-1.5 text-xs font-bold uppercase tracking-[0.1em] bg-transparent text-white border border-white rounded-lg transition-colors duration-200 hover:bg-white hover:text-zinc-900 disabled:opacity-50 disabled:cursor-default cursor-pointer"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}
