'use client'

import { useState, useEffect } from 'react'
import { useHoverPopup } from '@/lib/hooks/useHoverPopup'

// NYSE market holidays (YYYY-MM-DD in ET)
const NYSE_HOLIDAYS = new Set([
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])

export default function MarketStatus() {
  const [now, setNow] = useState(new Date())
  const [userTz] = useState<string>(() => {
    const parts = Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value ?? 'LOCAL'
  })

  const {
    showPopup,
    fadingOut,
    handleMouseEnter,
    handleMouseLeave,
    handlePopupMouseEnter,
    handlePopupMouseLeave,
  } = useHoverPopup()

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const pad = (n: number) => n.toString().padStart(2, '0')

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now)
  const etH = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
  const etM = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
  const etS = parseInt(parts.find(p => p.type === 'second')?.value ?? '0')
  const etDayName = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  const etDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(etDayName)
  const etYear = parts.find(p => p.type === 'year')?.value ?? '2025'
  const etMonth = parts.find(p => p.type === 'month')?.value ?? '01'
  const etDate = parts.find(p => p.type === 'day')?.value ?? '01'
  const etDateStr = `${etYear}-${etMonth}-${etDate}`
  const totalSec = etH * 3600 + etM * 60 + etS
  const isWeekend = etDay === 0 || etDay === 6
  const isHoliday = NYSE_HOLIDAYS.has(etDateStr)

  let label: string, color: string, nextPhase: string, nextPhaseColor: string, secsUntil: number

  const isTradingDay = !isWeekend && !isHoliday
  if (isTradingDay && totalSec >= 4 * 3600 && totalSec < 9 * 3600 + 1800) {
    label = 'PRE-MARKET'; color = '#eab308'
    nextPhase = 'MARKET OPEN'; nextPhaseColor = '#22c55e'
    secsUntil = (9 * 3600 + 1800) - totalSec
  } else if (isTradingDay && totalSec >= 9 * 3600 + 1800 && totalSec < 16 * 3600) {
    label = 'MARKET OPEN'; color = '#22c55e'
    nextPhase = 'AFTER-HOURS'; nextPhaseColor = '#f97316'
    secsUntil = 16 * 3600 - totalSec
  } else if (isTradingDay && totalSec >= 16 * 3600 && totalSec < 20 * 3600) {
    label = 'AFTER-HOURS'; color = '#f97316'
    nextPhase = 'MARKET CLOSED'; nextPhaseColor = '#444'
    secsUntil = 20 * 3600 - totalSec
  } else {
    label = 'MARKET CLOSED'; color = '#444'
    nextPhase = 'PRE-MARKET'; nextPhaseColor = '#eab308'
    // Start from next day if we're on a non-trading day or past 8pm
    let daysAhead = (isWeekend || isHoliday || totalSec >= 20 * 3600) ? 1 : 0
    // Skip forward past weekends and holidays to find the next actual trading day
    while (daysAhead > 0) {
      const checkDate = new Date(now.getTime() + daysAhead * 86400 * 1000)
      const checkParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      }).formatToParts(checkDate)
      const checkDayName = checkParts.find(p => p.type === 'weekday')?.value ?? 'Mon'
      const checkDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(checkDayName)
      const checkDateStr = `${checkParts.find(p => p.type === 'year')?.value}-${checkParts.find(p => p.type === 'month')?.value}-${checkParts.find(p => p.type === 'day')?.value}`
      if (checkDay !== 0 && checkDay !== 6 && !NYSE_HOLIDAYS.has(checkDateStr)) break
      daysAhead++
    }
    secsUntil = daysAhead * 86400 + 4 * 3600 - totalSec
  }

  const countdownDays = Math.floor(secsUntil / 86400)
  const countdownRem = secsUntil % 86400
  const countdown = countdownDays > 0
    ? `${pad(countdownDays)}:${pad(Math.floor(countdownRem / 3600))}:${pad(Math.floor((countdownRem % 3600) / 60))}:${pad(countdownRem % 60)}`
    : `${pad(Math.floor(secsUntil / 3600))}:${pad(Math.floor((secsUntil % 3600) / 60))}:${pad(secsUntil % 60)}`

  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span style={{
        fontSize: 11, color,
        letterSpacing: '0.15em',
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 500,
        transition: 'color 0.4s ease',
      }}>
        {label}
      </span>

      {showPopup && (
        <div
          onMouseEnter={handlePopupMouseEnter}
          onMouseLeave={handlePopupMouseLeave}
          style={{
            position: 'absolute',
            top: 'calc(100% + 22px)',
            left: '50%',
            marginLeft: -155,
            width: 310,
            background: '#0f0f0f',
            border: '1px solid #1a1a1a',
            borderRadius: 4,
            padding: '16px 20px',
            zIndex: 200,
            animation: fadingOut ? 'fadeOut 0.15s ease forwards' : 'fadeIn 0.15s ease',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
        >
          {/* Rows */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #111' }}>
            <span style={{ fontSize: 12, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
              NEXT PHASE
            </span>
            <span style={{ fontSize: 11, color: nextPhaseColor, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
              {nextPhase}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #111' }}>
            <span style={{ fontSize: 12, color: '#555', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.06em' }}>
              TIME REMAINING
            </span>
            <span style={{ fontSize: 13, color: '#bbb', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
              {countdown}
            </span>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#444', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
              YOUR TIMEZONE
            </span>
            <span style={{ fontSize: 11, color: '#333', fontFamily: "'JetBrains Mono', monospace" }}>
              {userTz}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
