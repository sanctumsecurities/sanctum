import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'

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
const PERIOD_DAYS: Record<string, number> = { '3m': 90, '6m': 180, '12m': 365 }
const PER_TICKER_TIMEOUT = 15_000

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(variance)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

function downsideDeviation(dailyReturns: number[]): number {
  const negatives = dailyReturns.filter(r => r < 0)
  if (negatives.length < 2) return 0
  return stddev(negatives) * Math.sqrt(252)
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

async function fetchTickerData(symbol: string, periodDays: number, riskFreeRate: number): Promise<MatrixStock | null> {
  try {
    const now = new Date()
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)

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

    const tradingDays = closes.length
    const firstClose = closes[0]
    const lastClose = closes[closes.length - 1]

    const annualizedReturn = Math.pow(lastClose / firstClose, 252 / tradingDays) - 1
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
      ret: annualizedReturn,
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
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)

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

    const tradingDays = closes.length
    const annualizedReturn = Math.pow(closes[closes.length - 1] / closes[0], 252 / tradingDays) - 1
    const annualizedVol = stddev(dailyReturns) * Math.sqrt(252)
    const sharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0

    return {
      symbol,
      name,
      ret: annualizedReturn,
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

    const tickers = tickersParam
      .split(',')
      .filter(Boolean)
      .map(t => t.trim().toUpperCase())
      .slice(0, 30)

    const cacheKey = `${period}:${[...tickers].sort().join(',')}`
    const cached = CACHE.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    // Start IRX concurrently — benchmarks kick off immediately after using the fallback
    // rate (0.05); stock batches await IRX so they get the live rate.
    const irxPromise = withTimeout(yahooFinance.quote('^IRX'), PER_TICKER_TIMEOUT).catch(() => null)

    // Benchmarks start in parallel with IRX (they use fallback 0.05 if IRX hasn't resolved)
    const benchmarkPromises = BENCHMARKS.map(b => fetchBenchmark(b.symbol, b.name, periodDays, 0.05))

    // Await IRX before stock batches so they get the live risk-free rate
    let riskFreeRate = 0.05
    try {
      const irx = await irxPromise
      const irxPrice = (irx as any)?.regularMarketPrice
      if (typeof irxPrice === 'number' && irxPrice > 0) {
        riskFreeRate = irxPrice / 100
      }
    } catch {
      // fall back to 0.05
    }
    const stocks: (MatrixStock | null)[] = []
    for (let i = 0; i < tickers.length; i += 5) {
      const batch = tickers.slice(i, i + 5)
      const results = await Promise.all(batch.map(t => fetchTickerData(t, periodDays, riskFreeRate)))
      stocks.push(...results)
    }
    const benchmarks = await Promise.all(benchmarkPromises)

    const validStocks = stocks.filter((s): s is MatrixStock => s !== null)

    const result = { stocks: validStocks, benchmarks, riskFreeRate, period }
    CACHE.set(cacheKey, { data: result, ts: Date.now() })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[matrix] route error:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch matrix data' }, { status: 500 })
  }
}
