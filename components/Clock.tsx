'use client'

import { useState, useEffect } from 'react'

export default function Clock({ format }: { format: '12h' | '24h' }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ fontSize: 14, color: '#666', fontFamily: "'JetBrains Mono', monospace" }}>
      {time.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      }) + ', ' + time.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: format === '12h',
      })}
    </span>
  )
}
