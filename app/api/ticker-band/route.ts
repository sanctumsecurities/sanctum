import { NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

export const dynamic = 'force-dynamic'

const INSTRUMENTS = [
  { symbol: '^GSPC', label: 'S&P 500 (^GSPC)' },
  { symbol: '^IXIC', label: 'NASDAQ (^IXIC)' },
  { symbol: '^DJI', label: 'DOW (^DJI)' },
  { symbol: '^RUT', label: 'RUSSELL (^RUT)' },
  { symbol: '^VIX', label: 'VIX (^VIX)' },
  { symbol: 'GC=F', label: 'GOLD (GC=F)' },
  { symbol: 'CL=F', label: 'OIL (CL=F)' },
]

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

async function fetchInstrument(
  symbol: string,
  label: string
): Promise<{ symbol: string; label: string; price: number; change: number; changePct: number } | null> {
  try {
    const quote = await withTimeout(
      yahooFinance.quote(symbol, {
        fields: ['regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent'] as any,
      }),
      5000
    ) as any
    if (quote?.regularMarketPrice == null) return null
    return {
      symbol,
      label,
      price: quote.regularMarketPrice as number,
      change: (quote.regularMarketChange ?? 0) as number,
      changePct: (quote.regularMarketChangePercent ?? 0) as number,
    }
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const results = await Promise.all(
      INSTRUMENTS.map(({ symbol, label }) => fetchInstrument(symbol, label))
    )
    const items = results.filter((r): r is NonNullable<typeof r> => r !== null)
    return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch ticker data' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
