import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'
import { withTimeout } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const SECTORS = [
  { name: 'Technology',              short: 'Tech',   etf: 'XLK',  weight: 30 },
  { name: 'Healthcare',              short: 'Health', etf: 'XLV',  weight: 13 },
  { name: 'Financials',              short: 'Fin',    etf: 'XLF',  weight: 13 },
  { name: 'Consumer Discretionary',  short: 'Disc',   etf: 'XLY',  weight: 10 },
  { name: 'Communication Services',  short: 'Comm',   etf: 'XLC',  weight: 9 },
  { name: 'Industrials',             short: 'Ind',    etf: 'XLI',  weight: 8 },
  { name: 'Consumer Staples',        short: 'Stpl',   etf: 'XLP',  weight: 6 },
  { name: 'Energy',                  short: 'Energy', etf: 'XLE',  weight: 4 },
  { name: 'Utilities',               short: 'Util',   etf: 'XLU',  weight: 3 },
  { name: 'Real Estate',             short: 'RE',     etf: 'XLRE', weight: 2 },
  { name: 'Materials',               short: 'Mat',    etf: 'XLB',  weight: 2 },
]

const VALID_PERIODS = new Set(['1D', '5D', '3M', '6M', 'YTD', '1Y'])

// Period → yahoo-finance2 chart params
function periodToChartParams(period: string): { period1: Date; interval: '1d' | '1wk' } {
  const now = new Date()
  let start: Date
  let interval: '1d' | '1wk' = '1d'

  switch (period) {
    case '5D': {
      start = new Date(now)
      start.setDate(start.getDate() - 7) // extra buffer for weekends
      break
    }
    case '3M': {
      start = new Date(now)
      start.setMonth(start.getMonth() - 3)
      break
    }
    case '6M': {
      start = new Date(now)
      start.setMonth(start.getMonth() - 6)
      interval = '1wk'
      break
    }
    case 'YTD': {
      start = new Date(now.getFullYear(), 0, 1)
      break
    }
    case '1Y': {
      start = new Date(now)
      start.setFullYear(start.getFullYear() - 1)
      interval = '1wk'
      break
    }
    default: {
      start = new Date(now)
      start.setDate(start.getDate() - 2)
      break
    }
  }

  return { period1: start, interval }
}

// ── Cache ──
const cache = new Map<string, { data: any; ts: number }>()

function getCacheTTL(period: string): number {
  if (period === '1D') return 5 * 60 * 1000
  return 60 * 60 * 1000  // 1 hour for historical periods (5D/3M/6M/YTD/1Y)
}

export async function GET(request: NextRequest) {
  try {
    const periodParam = request.nextUrl.searchParams.get('period')?.toUpperCase() || '1D'
    const period = VALID_PERIODS.has(periodParam) ? periodParam : '1D'

    // Check cache
    const cacheKey = `sector-heatmap-${period}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < getCacheTTL(period)) {
      return NextResponse.json(cached.data, { headers: { 'Cache-Control': 'no-store' } })
    }

    let sectors: { name: string; short: string; etf: string; weight: number; change: number }[]

    if (period === '1D') {
      // Use quoteCombine for 1D — fastest path
      const quotes = await withTimeout(
        Promise.all(SECTORS.map(s => yahooFinance.quoteCombine(s.etf))),
        8000
      )

      sectors = SECTORS.map((s, i) => ({
        ...s,
        change: parseFloat(((quotes[i] as any)?.regularMarketChangePercent ?? 0).toFixed(2)),
      }))
    } else {
      // Fetch historical chart data for other periods
      const { period1, interval } = periodToChartParams(period)

      const results = await withTimeout(
        Promise.all(
          SECTORS.map(s =>
            yahooFinance.chart(s.etf, {
              period1,
              interval,
            }).catch(() => null)
          )
        ),
        10000
      )

      sectors = SECTORS.map((s, i) => {
        const result = results[i]
        const quotes = result?.quotes
        if (!quotes || quotes.length < 2) {
          return { ...s, change: 0 }
        }

        const firstClose = quotes[0]?.close
        const lastClose = quotes[quotes.length - 1]?.close
        if (!firstClose || !lastClose) {
          return { ...s, change: 0 }
        }

        const change = ((lastClose - firstClose) / firstClose) * 100
        return { ...s, change: parseFloat(change.toFixed(2)) }
      })
    }

    const data = { sectors, period }

    // Store in cache
    cache.set(cacheKey, { data, ts: Date.now() })

    // Evict stale entries
    const now = Date.now()
    for (const [key, val] of cache) {
      if (now - val.ts > getCacheTTL(period) * 2) cache.delete(key)
    }

    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    console.error('Sector heatmap error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sector data' },
      { status: 500 }
    )
  }
}
