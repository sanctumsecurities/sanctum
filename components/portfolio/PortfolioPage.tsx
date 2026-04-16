'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { EnrichedHolding, Holding, SnapshotMap } from '@/lib/portfolio/types'
import {
  enrichHoldings,
  computeTotals,
  computeTopMovers,
  computeRiskStats,
  isCashHolding,
} from '@/lib/portfolio/metrics'
import EmptyState from './EmptyState'
import SummaryCards from './SummaryCards'
import HoldingsTable from './HoldingsTable'
import AllocationChart from './AllocationChart'
import TopMovers from './TopMovers'
import RiskMetrics from './RiskMetrics'
import AddPositionModal from './AddPositionModal'
import AddCashModal from './AddCashModal'
import { COLORS, MONO } from './styles'

const PORTFOLIO_POLL_MS = 60_000

// Format the snapshot time in the user's local timezone. Falls back to
// America/Los_Angeles (PST/PDT) if the browser can't resolve a zone.
function formatSnapshotTime(ts: number): { time: string; tz: string } {
  const date = new Date(ts)
  let zone: string | undefined
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    zone = undefined
  }
  if (!zone) zone = 'America/Los_Angeles'
  const time = date.toLocaleTimeString('en-US', { hour12: false, timeZone: zone })
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(date)
  const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? ''
  return { time, tz }
}

interface Props {
  session: Session
}

export default function PortfolioPage({ session }: Props) {
  const userId = session.user.id

  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loadingHoldings, setLoadingHoldings] = useState(true)
  const [holdingsError, setHoldingsError] = useState<string | null>(null)

  const [snapshots, setSnapshots] = useState<SnapshotMap>({})
  const [lastSnapshotAt, setLastSnapshotAt] = useState<number | null>(null)
  const [snapshotStale, setSnapshotStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Holding | undefined>(undefined)
  const [cashModalOpen, setCashModalOpen] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load holdings from Supabase
  const loadHoldings = useCallback(async () => {
    setHoldingsError(null)
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    setLoadingHoldings(false)
    if (error) {
      setHoldingsError(error.message)
      return
    }
    setHoldings((data ?? []) as Holding[])
  }, [userId])

  useEffect(() => { loadHoldings() }, [loadHoldings])

  // Fetch snapshot for current tickers
  const fetchSnapshot = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) {
      setSnapshots({})
      setSnapshotStale(false)
      return
    }
    try {
      const res = await fetch(`/api/portfolio-snapshot?tickers=${encodeURIComponent(tickers.join(','))}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as SnapshotMap
      setSnapshots(json)
      setSnapshotStale(false)
      setLastSnapshotAt(Date.now())
    } catch (err) {
      console.error('[portfolio] snapshot fetch failed:', err)
      setSnapshotStale(true)
    }
  }, [])

  // Initial snapshot on holdings change (cash is synthesized client-side)
  useEffect(() => {
    const tickers = holdings.filter(h => !isCashHolding(h)).map(h => h.ticker)
    fetchSnapshot(tickers)
  }, [holdings, fetchSnapshot])

  // Polling (with visibility pause)
  useEffect(() => {
    const tickers = holdings.filter(h => !isCashHolding(h)).map(h => h.ticker)
    if (tickers.length === 0) return

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      fetchSnapshot(tickers)
    }

    pollRef.current = setInterval(tick, PORTFOLIO_POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [holdings, fetchSnapshot])

  // Derived data
  const enriched: EnrichedHolding[] = useMemo(
    () => enrichHoldings(holdings, snapshots),
    [holdings, snapshots]
  )
  const totals = useMemo(() => computeTotals(enriched), [enriched])
  const movers = useMemo(() => computeTopMovers(enriched, 3), [enriched])
  const risk = useMemo(() => computeRiskStats(enriched), [enriched])
  const holdingsByTicker = useMemo(() => {
    const m: Record<string, Holding> = {}
    for (const h of holdings) m[h.ticker] = h
    return m
  }, [holdings])

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    const tickers = holdings.filter(h => !isCashHolding(h)).map(h => h.ticker)
    await fetchSnapshot(tickers)
    setRefreshing(false)
  }, [refreshing, holdings, fetchSnapshot])

  // Modal handlers
  const openAdd = () => { setEditing(undefined); setModalOpen(true) }
  const openCash = () => { setCashModalOpen(true) }
  const openEdit = (h: EnrichedHolding) => {
    const original = holdings.find(x => x.id === h.id)
    if (!original) return
    if (isCashHolding(original)) { setCashModalOpen(true); return }
    setEditing(original); setModalOpen(true)
  }
  const closeModal = () => { setModalOpen(false); setEditing(undefined) }
  const closeCashModal = () => { setCashModalOpen(false) }
  const onSaved = () => { loadHoldings() }
  const existingCash = holdings.find(isCashHolding)

  const deleteHolding = async (h: EnrichedHolding) => {
    const { error } = await supabase.from('holdings').delete().eq('id', h.id)
    if (error) { console.error('[portfolio] delete failed:', error); return }
    loadHoldings()
  }

  // Subtitle text. lastSnapshotAt reflects the last *successful* snapshot,
  // so the displayed timestamp always matches the data the user is seeing.
  const subtitle = (() => {
    if (loadingHoldings) return 'Loading…'
    const n = holdings.length
    if (n === 0) return 'No positions yet.'
    const countStr = `${n} position${n === 1 ? '' : 's'}`
    if (!lastSnapshotAt) return snapshotStale ? `${countStr} · fetch failed` : `${countStr} · loading…`
    const { time, tz } = formatSnapshotTime(lastSnapshotAt)
    return `${countStr} · updated ${time} ${tz}${snapshotStale ? ' · stale' : ''}`
  })()

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .portfolio-main-grid { grid-template-columns: 1fr !important; }
          .portfolio-summary-row { grid-template-columns: 1fr 1fr !important; }
          .portfolio-hero-row { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
          .portfolio-add-btns { align-self: flex-start !important; flex-wrap: wrap !important; }
          .holdings-col-hideable { display: none !important; }
        }
        @keyframes spinRefresh { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="main-content" style={{
        padding: '40px clamp(24px, 3vw, 64px) 60px',
        maxWidth: 1800, margin: '0 auto',
        animation: 'fadeIn 0.3s ease',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}>
        {/* Hero row: title + add button */}
        <div className="portfolio-hero-row" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        }}>
          <div>
            <h1 className="hero-title" style={{
              fontSize: 65, fontWeight: 700, color: COLORS.text,
              letterSpacing: '0.08em', fontFamily: MONO,
              margin: 0, marginLeft: '-0.05em', lineHeight: 1,
            }}>
              PORTFOLIO
            </h1>
            <div style={{
              fontSize: 12, color: COLORS.textMuted,
              fontFamily: MONO, letterSpacing: '0.1em',
              marginTop: 14,
            }}>
              {subtitle}
            </div>
          </div>
          <div className="portfolio-add-btns" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing || holdings.length === 0}
              title="Refresh prices"
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.borderStrong}`,
                borderRadius: 4,
                color: COLORS.textDim,
                fontSize: 16,
                width: 38, height: 38,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: refreshing || holdings.length === 0 ? 'default' : 'pointer',
                opacity: holdings.length === 0 ? 0.3 : 1,
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
              onMouseEnter={e => { if (!refreshing && holdings.length > 0) { (e.currentTarget).style.color = '#fff'; (e.currentTarget).style.borderColor = '#444' } }}
              onMouseLeave={e => { (e.currentTarget).style.color = COLORS.textDim; (e.currentTarget).style.borderColor = COLORS.borderStrong }}
            >
              <span style={{ display: 'inline-block', animation: refreshing ? 'spinRefresh 0.8s linear infinite' : 'none' }}>↻</span>
            </button>
            <button
              className="portfolio-add-btn"
              onClick={openCash}
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.borderStrong}`,
                borderRadius: 4,
                color: COLORS.textDim,
                fontSize: 13,
                padding: '9px 18px',
                fontFamily: MONO,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { (e.currentTarget).style.color = '#fff'; (e.currentTarget).style.borderColor = '#444' }}
              onMouseLeave={e => { (e.currentTarget).style.color = COLORS.textDim; (e.currentTarget).style.borderColor = COLORS.borderStrong }}
            >
              {existingCash ? 'EDIT CASH' : '+ ADD CASH'}
            </button>
            <button
              className="portfolio-add-btn"
              onClick={openAdd}
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.borderStrong}`,
                borderRadius: 4,
                color: COLORS.textDim,
                fontSize: 13,
                padding: '9px 18px',
                fontFamily: MONO,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { (e.currentTarget).style.color = '#fff'; (e.currentTarget).style.borderColor = '#444' }}
              onMouseLeave={e => { (e.currentTarget).style.color = COLORS.textDim; (e.currentTarget).style.borderColor = COLORS.borderStrong }}
            >
              + ADD POSITION
            </button>
          </div>
        </div>

        {holdingsError && (
          <div style={{
            marginTop: 28,
            background: 'rgba(248,113,113,0.05)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 4, padding: '12px 16px',
            color: COLORS.neg, fontSize: 13, fontFamily: MONO,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Failed to load holdings: {holdingsError}</span>
            <button
              onClick={loadHoldings}
              style={{
                background: 'none', border: 'none', color: COLORS.neg, cursor: 'pointer',
                fontFamily: MONO, fontSize: 12, letterSpacing: '0.1em', textDecoration: 'underline',
              }}
            >
              RETRY
            </button>
          </div>
        )}

        {!loadingHoldings && !holdingsError && holdings.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <SummaryCards totals={totals} />
            <div className="portfolio-main-grid" style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: 16,
              marginTop: 4,
            }}>
              <HoldingsTable
                holdings={enriched}
                onRowClick={openEdit}
                onDelete={deleteHolding}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <AllocationChart holdings={enriched} />
                <TopMovers winners={movers.winners} losers={movers.losers} />
                <RiskMetrics stats={risk} />
              </div>
            </div>
          </>
        )}

        {modalOpen && (
          <AddPositionModal
            userId={userId}
            existing={editing}
            existingByTicker={holdingsByTicker}
            onClose={closeModal}
            onSaved={onSaved}
          />
        )}

        {cashModalOpen && (
          <AddCashModal
            userId={userId}
            existing={existingCash}
            onClose={closeCashModal}
            onSaved={onSaved}
          />
        )}
      </div>
    </>
  )
}
