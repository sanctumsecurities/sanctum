import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'
import { withTimeout } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface MatrixStock {
  symbol: string
  name: string
  ret: number
  vol: number
  downsideVol: number
  maxDrawdown: number
  mcap: number
  sharpe: number
  price: number
  sector: string
}

interface MatrixBenchmark {
  symbol: string
  name: string
  ret: number
  vol: number
  downsideVol: number
  maxDrawdown: number
  sharpe: number
}

interface CacheEntry {
  data: { stocks: MatrixStock[]; benchmarks: MatrixBenchmark[]; riskFreeRate: number; period: string }
  ts: number
}

const CACHE = new Map<string, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const CACHE_MAX_SIZE = 50

function evictStaleCache() {
  if (CACHE.size <= CACHE_MAX_SIZE) return
  const now = Date.now()
  for (const [key, entry] of CACHE) {
    if (now - entry.ts > CACHE_TTL * 2) CACHE.delete(key)
  }
  // If still over limit, drop oldest entries
  if (CACHE.size > CACHE_MAX_SIZE) {
    const sorted = [...CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts)
    const toRemove = sorted.slice(0, CACHE.size - CACHE_MAX_SIZE)
    for (const [key] of toRemove) CACHE.delete(key)
  }
}
const PERIOD_DAYS: Record<string, number> = { '3m': 91, '6m': 183, '12m': 366 }
const PER_TICKER_TIMEOUT = 15_000

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(variance)
}

function downsideDeviation(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0
  const sumSqNeg = dailyReturns.reduce((sum, r) => sum + (r < 0 ? r * r : 0), 0)
  return Math.sqrt(sumSqNeg / dailyReturns.length) * Math.sqrt(252)
}

function maxDrawdownFromCloses(closes: number[]): number {
  if (closes.length < 2) return 0
  let peak = closes[0]
  let maxDD = 0
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > peak) peak = closes[i]
    const dd = (peak - closes[i]) / peak
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

function getPeriodStart(periodDays: number): Date {
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  return new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)
}

async function fetchTickerData(symbol: string, periodDays: number, riskFreeRate: number): Promise<MatrixStock | null> {
  try {
    const now = new Date()
    const periodStart = getPeriodStart(periodDays)

    const [chartResult, quoteResult] = await withTimeout(
      Promise.all([
        yahooFinance.chart(symbol, {
          period1: periodStart,
          period2: now,
          interval: '1d' as any,
        }),
        yahooFinance.quote(symbol),
      ]),
      PER_TICKER_TIMEOUT
    )

    const quotes = (chartResult as any).quotes || []
    const closes: number[] = quotes
      .map((q: any) => q.close as number | null)
      .filter((c: number | null): c is number => c != null)

    if (closes.length < 10) return null

    const dailyReturns: number[] = []
    for (let i = 1; i < closes.length; i++) {
      dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1])
    }

    // Use Yahoo's chartPreviousClose as reference price (the close before the period starts)
    // This matches how Yahoo computes period % change on their site
    const meta = (chartResult as any).meta || {}
    const chartPrevClose: number | null = meta.chartPreviousClose ?? null
    const referencePrice = chartPrevClose ?? closes[0]
    const lastClose = closes[closes.length - 1]

    // Simple period return (matches Yahoo's display)
    const periodReturn = lastClose / referencePrice - 1

    // Annualized return for Sharpe — use actual elapsed calendar time
    const firstQuote = quotes.find((q: any) => q.close != null)
    const lastQuote = [...quotes].reverse().find((q: any) => q.close != null)
    const elapsedMs = firstQuote && lastQuote
      ? new Date(lastQuote.date).getTime() - new Date(firstQuote.date).getTime()
      : periodDays * 24 * 60 * 60 * 1000
    const elapsedYears = Math.max(elapsedMs / (365.25 * 24 * 60 * 60 * 1000), 1 / 365.25)
    const annualizedReturn = Math.pow(lastClose / referencePrice, 1 / elapsedYears) - 1
    const annualizedVol = stddev(dailyReturns) * Math.sqrt(252)
    const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0

    // Fetch sector — separate call so a failure doesn't kill the whole ticker
    let sector = 'Other'
    try {
      const summary = await withTimeout(
        yahooFinance.quoteSummary(symbol, { modules: ['summaryProfile'] }),
        5000
      )
      const sp = (summary as any)?.summaryProfile
      if (sp?.sector) sector = sp.sector
    } catch {
      // sector stays 'Other'
    }

    const q = quoteResult as any
    return {
      symbol: symbol.toUpperCase(),
      name: q.shortName || q.longName || symbol,
      ret: periodReturn,
      vol: annualizedVol,
      downsideVol: downsideDeviation(dailyReturns),
      maxDrawdown: maxDrawdownFromCloses(closes),
      mcap: q.marketCap || 0,
      sharpe,
      price: q.regularMarketPrice || lastClose,
      sector,
    }
  } catch (err) {
    console.error(`[matrix] ${symbol} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

const BENCHMARKS = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'QQQ', name: 'Nasdaq 100' },
]

async function fetchBenchmark(symbol: string, name: string, periodDays: number, riskFreeRate: number): Promise<MatrixBenchmark> {
  try {
    const now = new Date()
    const periodStart = getPeriodStart(periodDays)

    const chartResult = await withTimeout(
      yahooFinance.chart(symbol, {
        period1: periodStart,
        period2: now,
        interval: '1d' as any,
      }),
      PER_TICKER_TIMEOUT
    )

    const quotes = (chartResult as any).quotes || []
    const closes: number[] = quotes
      .map((q: any) => q.close as number | null)
      .filter((c: number | null): c is number => c != null)

    if (closes.length < 10) {
      return { symbol, name, ret: 0, vol: 0, downsideVol: 0, maxDrawdown: 0, sharpe: 0 }
    }

    const dailyReturns: number[] = []
    for (let i = 1; i < closes.length; i++) {
      dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1])
    }

    const meta = (chartResult as any).meta || {}
    const chartPrevClose: number | null = meta.chartPreviousClose ?? null
    const referencePrice = chartPrevClose ?? closes[0]
    const lastClose = closes[closes.length - 1]

    const periodReturn = lastClose / referencePrice - 1

    const firstQuote = quotes.find((q: any) => q.close != null)
    const lastQuote = [...quotes].reverse().find((q: any) => q.close != null)
    const elapsedMs = firstQuote && lastQuote
      ? new Date(lastQuote.date).getTime() - new Date(firstQuote.date).getTime()
      : periodDays * 24 * 60 * 60 * 1000
    const elapsedYears = Math.max(elapsedMs / (365.25 * 24 * 60 * 60 * 1000), 1 / 365.25)
    const annualizedReturn = Math.pow(lastClose / referencePrice, 1 / elapsedYears) - 1
    const annualizedVol = stddev(dailyReturns) * Math.sqrt(252)
    const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0

    return {
      symbol,
      name,
      ret: periodReturn,
      vol: annualizedVol,
      downsideVol: downsideDeviation(dailyReturns),
      maxDrawdown: maxDrawdownFromCloses(closes),
      sharpe,
    }
  } catch (err) {
    console.error(`[matrix] ${symbol} benchmark failed:`, err instanceof Error ? err.message : err)
    return { symbol, name, ret: 0, vol: 0, downsideVol: 0, maxDrawdown: 0, sharpe: 0 }
  }
}

export async function GET(req: NextRequest) {
  try {
    const tickersParam = req.nextUrl.searchParams.get('tickers')
    if (!tickersParam) {
      return NextResponse.json({ error: 'tickers param required' }, { status: 400 })
    }

    const period = req.nextUrl.searchParams.get('period') || '12m'
    const periodDays = PERIOD_DAYS[period] || 365

    const tickerPattern = /^[A-Z0-9.\-^=]+$/
    const tickers = tickersParam
      .split(',')
      .filter(Boolean)
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length <= 20 && tickerPattern.test(t))
      .slice(0, 30)

    const cacheKey = `${period}:${[...tickers].sort().join(',')}`
    const cached = CACHE.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    // Fetch live risk-free rate first so all Sharpe ratios are consistent
    let riskFreeRate = 0.05
    try {
      const irx = await withTimeout(yahooFinance.quote('^IRX'), PER_TICKER_TIMEOUT).catch(() => null)
      const irxPrice = (irx as any)?.regularMarketPrice
      if (typeof irxPrice === 'number' && irxPrice > 0) {
        riskFreeRate = irxPrice / 100
      }
    } catch {
      // fall back to 0.05
    }

    // Start benchmarks and first stock batch concurrently
    const benchmarkPromises = BENCHMARKS.map(b => fetchBenchmark(b.symbol, b.name, periodDays, riskFreeRate))
    const stocks: (MatrixStock | null)[] = []
    for (let i = 0; i < tickers.length; i += 5) {
      const batch = tickers.slice(i, i + 5)
      const results = await Promise.all(batch.map(t => fetchTickerData(t, periodDays, riskFreeRate)))
      stocks.push(...results)
    }
    const benchmarks = await Promise.all(benchmarkPromises)

    const validStocks = stocks.filter((s): s is MatrixStock => s !== null)

    const result = { stocks: validStocks, benchmarks, riskFreeRate, period }
    evictStaleCache()
    CACHE.set(cacheKey, { data: result, ts: Date.now() })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[matrix] route error:', err)
    return NextResponse.json({ error: 'Failed to fetch matrix data' }, { status: 500 })
  }
}
