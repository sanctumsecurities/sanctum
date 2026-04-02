import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'

export const dynamic = 'force-dynamic'

const DEFAULT_INSTRUMENTS = [
  { symbol: '^GSPC', label: 'S&P 500 (^GSPC)' },
  { symbol: '^IXIC', label: 'NASDAQ (^IXIC)' },
  { symbol: '^DJI', label: 'DOW (^DJI)' },
  { symbol: '^RUT', label: 'RUSSELL (^RUT)' },
  { symbol: '^VIX', label: 'VIX (^VIX)' },
  { symbol: 'GC=F', label: 'GOLD (GC=F)' },
  { symbol: 'CL=F', label: 'OIL (CL=F)' },
]

const DEFAULT_LABEL_MAP: Record<string, string> = Object.fromEntries(
  DEFAULT_INSTRUMENTS.map(({ symbol, label }) => [symbol, label])
)

// ── In-memory cache (15s TTL) ──
let cache: { data: any; ts: number; key: string } | null = null
const CACHE_TTL = 15_000

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timeoutId)),
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('timeout')), ms)
    }),
  ])
}

export async function GET(request: NextRequest) {
  try {
    const tickersParam = request.nextUrl.searchParams.get('tickers')
    const instruments = tickersParam
      ? tickersParam.split(',').filter(Boolean).slice(0, 20).map(s => {
          const symbol = s.trim().toUpperCase()
          return { symbol, label: DEFAULT_LABEL_MAP[symbol] ?? symbol }
        })
      : DEFAULT_INSTRUMENTS

    const symbols = instruments.map(i => i.symbol)
    const cacheKey = symbols.join(',')

    // Return cached data if still fresh
    if (cache && cache.key === cacheKey && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Use quoteCombine for automatic request batching
    const quotes = await withTimeout(
      Promise.all(symbols.map(s => yahooFinance.quoteCombine(s))),
      8000
    )

    const items = quotes
      .map((quote: any, idx: number) => {
        if (quote?.regularMarketPrice == null) return null
        const { symbol, label } = instruments[idx]
        const resolvedLabel = label === symbol
          ? (quote.shortName ? `${quote.shortName} (${symbol})` : symbol)
          : label
        return {
          symbol,
          label: resolvedLabel,
          price: quote.regularMarketPrice as number,
          change: (quote.regularMarketChange ?? 0) as number,
          changePct: (quote.regularMarketChangePercent ?? 0) as number,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    // Update cache
    cache = { data: items, ts: Date.now(), key: cacheKey }

    return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch ticker data' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
