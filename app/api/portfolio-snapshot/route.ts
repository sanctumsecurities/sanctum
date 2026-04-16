import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'
import { withTimeout } from '@/lib/utils'
import { computeAnnualizedVolatility } from '@/lib/portfolio/metrics'
import type { HoldingSnapshot, SnapshotMap } from '@/lib/portfolio/types'

export const dynamic = 'force-dynamic'

const TICKER_PATTERN = /^[A-Z0-9.\-^=]{1,20}$/

async function fetchOne(ticker: string): Promise<HoldingSnapshot> {
  const empty: HoldingSnapshot = {
    ticker,
    price: null,
    prevClose: null,
    beta: null,
    volatility30d: null,
    sector: null,
    name: null,
  }
  try {
    const now = new Date()
    const period1 = new Date(now)
    period1.setDate(period1.getDate() - 45)

    const [quote, summary, historical] = await Promise.all([
      yahooFinance.quoteCombine(ticker).catch(() => null),
      yahooFinance
        .quoteSummary(ticker, { modules: ['summaryDetail', 'summaryProfile', 'defaultKeyStatistics'] })
        .catch(() => null),
      yahooFinance
        .historical(ticker, { period1, period2: now, interval: '1d' })
        .catch(() => null),
    ])

    const price = (quote as any)?.regularMarketPrice ?? null
    const prevClose =
      (quote as any)?.regularMarketPreviousClose ?? (quote as any)?.previousClose ?? null
    const name = (quote as any)?.shortName ?? (quote as any)?.longName ?? null
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

    return {
      ticker,
      price: typeof price === 'number' ? price : null,
      prevClose: typeof prevClose === 'number' ? prevClose : null,
      beta: typeof beta === 'number' ? beta : null,
      volatility30d,
      sector: typeof sector === 'string' ? sector : null,
      name: typeof name === 'string' ? name : null,
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
