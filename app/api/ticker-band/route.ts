import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'
import { withTimeout } from '@/lib/utils'

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
const cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 15_000

export async function GET(request: NextRequest) {
  try {
    const tickersParam = request.nextUrl.searchParams.get('tickers')
    const tickerPattern = /^[A-Z0-9.\-^=]+$/
    const instruments = tickersParam
      ? tickersParam.split(',').filter(Boolean).slice(0, 20).map(s => {
          const symbol = s.trim().toUpperCase()
          return { symbol, label: DEFAULT_LABEL_MAP[symbol] ?? symbol }
        }).filter(i => i.symbol.length <= 20 && tickerPattern.test(i.symbol))
      : DEFAULT_INSTRUMENTS

    const symbols = instruments.map(i => i.symbol)
    const cacheKey = symbols.slice().sort().join(',')

    // Return cached data if still fresh
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data, { headers: { 'Cache-Control': 'no-store' } })
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
    cache.set(cacheKey, { data: items, ts: Date.now() })
    for (const [key, entry] of cache) {
      if (Date.now() - entry.ts > CACHE_TTL * 2) cache.delete(key)
    }

    return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    console.error('[ticker-band] fetch failed:', err)
    return NextResponse.json(
      { error: 'Failed to fetch ticker data' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
