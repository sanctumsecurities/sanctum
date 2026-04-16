import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'
import { withTimeout } from '@/lib/utils'
import { computeAnnualizedVolatility } from '@/lib/portfolio/metrics'
import type { HoldingSnapshot, SnapshotMap } from '@/lib/portfolio/types'

export const dynamic = 'force-dynamic'

interface MetadataCache {
  beta: number | null
  volatility30d: number | null
  sector: string | null
  name: string | null
  ts: number
}
const metadataCache = new Map<string, MetadataCache>()
const METADATA_TTL = 6 * 60 * 60 * 1000  // 6 hours

const TICKER_PATTERN = /^[A-Z0-9.\-^=]{1,20}$/

async function fetchOne(ticker: string): Promise<HoldingSnapshot> {
  const empty: HoldingSnapshot = {
    ticker,
    price: null,
    prevClose: null,
    isExtendedHours: false,
    beta: null,
    volatility30d: null,
    sector: null,
    name: null,
  }
  try {
    // Always fetch fresh price data
    const quote = await yahooFinance.quoteCombine(ticker).catch(() => null)
    const regularPrice = (quote as any)?.regularMarketPrice ?? null
    const marketState: string = (quote as any)?.marketState ?? 'CLOSED'
    const postPrice = (quote as any)?.postMarketPrice ?? null
    const prePrice = (quote as any)?.preMarketPrice ?? null
    const isPost = marketState === 'POST' || marketState === 'POSTPOST'
    const isPre = marketState === 'PRE' || marketState === 'PREPRE'
    const extPrice = isPost ? postPrice : isPre ? prePrice : null
    const price = (typeof extPrice === 'number' ? extPrice : null) ?? regularPrice
    const isExtendedHours = typeof extPrice === 'number'
    const prevClose = (quote as any)?.regularMarketPreviousClose ?? (quote as any)?.previousClose ?? null
    const quoteName = (quote as any)?.shortName ?? (quote as any)?.longName ?? null

    // Check metadata cache
    const cachedMeta = metadataCache.get(ticker)
    if (cachedMeta && Date.now() - cachedMeta.ts < METADATA_TTL) {
      return {
        ticker,
        price: typeof price === 'number' ? price : null,
        prevClose: typeof prevClose === 'number' ? prevClose : null,
        isExtendedHours,
        beta: cachedMeta.beta,
        volatility30d: cachedMeta.volatility30d,
        sector: cachedMeta.sector,
        name: typeof quoteName === 'string' ? quoteName : cachedMeta.name,
      }
    }

    // Cache miss — fetch expensive metadata
    const now = new Date()
    const period1 = new Date(now)
    period1.setDate(period1.getDate() - 45)

    const [summary, historical] = await Promise.all([
      yahooFinance
        .quoteSummary(ticker, { modules: ['summaryDetail', 'summaryProfile', 'defaultKeyStatistics'] })
        .catch(() => null),
      yahooFinance
        .historical(ticker, { period1, period2: now, interval: '1d' })
        .catch(() => null),
    ])

    const beta =
      (summary as any)?.summaryDetail?.beta ??
      (summary as any)?.defaultKeyStatistics?.beta ??
      null
    const quoteType = (quote as any)?.quoteType ?? null
    const rawSector = (summary as any)?.summaryProfile?.sector ?? null
    const sector = typeof rawSector === 'string' && rawSector.trim()
      ? rawSector
      : (quoteType === 'ETF' ? 'ETF' : null)

    // 45-day window yields ~31 trading days; 31 closes → 30 daily returns → "30d volatility".
    const closes = Array.isArray(historical)
      ? (historical as any[])
          .map(row => Number(row.close))
          .filter(n => Number.isFinite(n) && n > 0)
          .slice(-31)
      : []
    const volatility30d = closes.length >= 5 ? computeAnnualizedVolatility(closes) : null

    const meta: MetadataCache = {
      beta: typeof beta === 'number' ? beta : null,
      volatility30d,
      sector: typeof sector === 'string' ? sector : null,
      name: typeof quoteName === 'string' ? quoteName : null,
      ts: Date.now(),
    }
    metadataCache.set(ticker, meta)

    return {
      ticker,
      price: typeof price === 'number' ? price : null,
      prevClose: typeof prevClose === 'number' ? prevClose : null,
      isExtendedHours,
      beta: meta.beta,
      volatility30d: meta.volatility30d,
      sector: meta.sector,
      name: meta.name,
    }
  } catch (err) {
    console.error(`[portfolio-snapshot] ${ticker} failed:`, err)
    return empty
  }
}

export async function GET(request: NextRequest) {
  try {
    const tickersParam = request.nextUrl.searchParams.get('tickers') ?? ''
    const tickers = tickersParam
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0 && TICKER_PATTERN.test(t))
      .slice(0, 50)

    if (tickers.length === 0) {
      return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } })
    }

    const results = await withTimeout(
      Promise.all(tickers.map(t => fetchOne(t))),
      5000
    ).catch((): HoldingSnapshot[] =>
      tickers.map(t => ({
        ticker: t,
        price: null,
        prevClose: null,
        isExtendedHours: false,
        beta: null,
        volatility30d: null,
        sector: null,
        name: null,
      }))
    )

    const map: SnapshotMap = {}
    for (const snap of results) map[snap.ticker] = snap

    return NextResponse.json(map, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[portfolio-snapshot] failed:', err)
    return NextResponse.json(
      { error: 'Failed to fetch portfolio snapshot' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
