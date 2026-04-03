import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'

export const dynamic = 'force-dynamic'

interface MatrixStock {
  symbol: string
  name: string
  ret: number
  vol: number
  mcap: number
  sharpe: number
  price: number
}

interface MatrixBenchmark {
  symbol: string
  name: string
  ret: number
  vol: number
  sharpe: number
}

interface CacheEntry {
  data: { stocks: MatrixStock[]; benchmark: MatrixBenchmark }
  ts: number
}

const CACHE = new Map<string, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const RISK_FREE_RATE = 0.05
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

async function fetchTickerData(symbol: string): Promise<MatrixStock | null> {
  try {
    const now = new Date()
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

    const [chartResult, quoteResult] = await withTimeout(
      Promise.all([
        yahooFinance.chart(symbol, {
          period1: oneYearAgo,
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

    // Daily returns
    const dailyReturns: number[] = []
    for (let i = 1; i < closes.length; i++) {
      dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1])
    }

    const tradingDays = closes.length
    const firstClose = closes[0]
    const lastClose = closes[closes.length - 1]

    // Geometric annualized return
    const annualizedReturn = Math.pow(lastClose / firstClose, 252 / tradingDays) - 1

    // Annualized volatility
    const annualizedVol = stddev(dailyReturns) * Math.sqrt(252)

    // Sharpe ratio
    const sharpe = annualizedVol > 0 ? (annualizedReturn - RISK_FREE_RATE) / annualizedVol : 0

    const q = quoteResult as any
    return {
      symbol: symbol.toUpperCase(),
      name: q.shortName || q.longName || symbol,
      ret: annualizedReturn,
      vol: annualizedVol,
      mcap: q.marketCap || 0,
      sharpe,
      price: q.regularMarketPrice || lastClose,
    }
  } catch (err) {
    console.error(`[matrix] ${symbol} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

async function fetchBenchmark(): Promise<MatrixBenchmark> {
  try {
    const now = new Date()
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

    const chartResult = await withTimeout(
      yahooFinance.chart('SPY', {
        period1: oneYearAgo,
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
      return { symbol: 'SPY', name: 'S&P 500', ret: 0, vol: 0, sharpe: 0 }
    }

    const dailyReturns: number[] = []
    for (let i = 1; i < closes.length; i++) {
      dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1])
    }

    const tradingDays = closes.length
    const annualizedReturn = Math.pow(closes[closes.length - 1] / closes[0], 252 / tradingDays) - 1
    const annualizedVol = stddev(dailyReturns) * Math.sqrt(252)
    const sharpe = annualizedVol > 0 ? (annualizedReturn - RISK_FREE_RATE) / annualizedVol : 0

    return { symbol: 'SPY', name: 'S&P 500', ret: annualizedReturn, vol: annualizedVol, sharpe }
  } catch (err) {
    console.error('[matrix] SPY benchmark failed:', err instanceof Error ? err.message : err)
    return { symbol: 'SPY', name: 'S&P 500', ret: 0, vol: 0, sharpe: 0 }
  }
}

export async function GET(req: NextRequest) {
  try {
    const tickersParam = req.nextUrl.searchParams.get('tickers')
    if (!tickersParam) {
      return NextResponse.json({ error: 'tickers param required' }, { status: 400 })
    }

    const tickers = tickersParam
      .split(',')
      .filter(Boolean)
      .map(t => t.trim().toUpperCase())
      .slice(0, 30)

    const cacheKey = [...tickers].sort().join(',')
    const cached = CACHE.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    // Fetch benchmark in parallel with stock data
    // Process stocks in batches of 5 to avoid overwhelming Yahoo
    const benchmarkPromise = fetchBenchmark()
    const stocks: (MatrixStock | null)[] = []
    for (let i = 0; i < tickers.length; i += 5) {
      const batch = tickers.slice(i, i + 5)
      const results = await Promise.all(batch.map(fetchTickerData))
      stocks.push(...results)
    }
    const benchmark = await benchmarkPromise

    const validStocks = stocks.filter((s): s is MatrixStock => s !== null)

    const result = { stocks: validStocks, benchmark }
    CACHE.set(cacheKey, { data: result, ts: Date.now() })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[matrix] route error:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch matrix data' }, { status: 500 })
  }
}
