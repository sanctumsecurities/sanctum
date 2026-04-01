'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'

const orbs = [
  { size: 300, top: '10%', left: '15%', duration: 18 },
  { size: 250, top: '60%', left: '75%', duration: 22 },
  { size: 200, top: '30%', left: '60%', duration: 25 },
  { size: 350, top: '70%', left: '20%', duration: 20 },
  { size: 180, top: '15%', left: '80%', duration: 28 },
  { size: 280, top: '80%', left: '50%', duration: 16 },
]

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [displayedText, setDisplayedText] = useState('')
  const [caretVisible, setCaretVisible] = useState(false)
  useEffect(() => {
    const timers: (ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>)[] = []

    // Helper to track timers for cleanup
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
      // End Phase 1
      clearInterval(blinkInterval)
      setCaretVisible(true)

      // Phase 2: Type "SANCTUM" one character at a time
      const text = 'SANCTUM'
      let charIndex = 0

      const typeNextChar = () => {
        charIndex++
        setDisplayedText(text.slice(0, charIndex))

        if (charIndex < text.length) {
          const delay = 120 + Math.random() * 170 // 120-290ms
          addTimeout(typeNextChar, delay)
        } else {
          // Phase 3: Rest blink after 300ms pause
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

    // Cleanup all timers on unmount
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
      {/* ── Animated Background ── */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Floating orbs */}
        {orbs.map((orb, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full blur-3xl"
            style={{
              width: orb.size,
              height: orb.size,
              top: orb.top,
              left: orb.left,
              background: 'rgba(255, 255, 255, 0.03)',
            }}
            animate={{
              y: [0, i % 2 === 0 ? -30 : 30, 0],
            }}
            transition={{
              duration: orb.duration,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* ── Login Content ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-[384px] px-6"
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

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-[13px] text-[#ef4444] font-mono"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-3 text-sm font-bold uppercase tracking-[0.1em] bg-zinc-100 text-zinc-900 rounded-lg transition-colors duration-200 hover:bg-white disabled:opacity-50 disabled:cursor-default cursor-pointer"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

      </motion.div>
    </div>
  )
}
