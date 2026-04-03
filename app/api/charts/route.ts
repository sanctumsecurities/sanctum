import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'

export const dynamic = 'force-dynamic'

/** Returns the number of milliseconds to add to a "fake UTC" ET time to get real UTC. */
function getEtOffset(): number {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find(p => p.type === type)!.value
  const fakeUtcMs = Date.parse(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`
  )
  return now.getTime() - fakeUtcMs
}

/**
 * Maps a period string to yahoo-finance2 chart params.
 * 1D: 4 AM ET today → 8 PM ET today (capped at now).
 * All others: rolling window from now.
 */
function getChartParams(period: string): { period1: Date; period2: Date; interval: string } {
  const now = Date.now()
  const offsetMs = getEtOffset()

  switch (period) {
    case '1W':
      return { period1: new Date(now - 7 * 24 * 60 * 60 * 1000), period2: new Date(now), interval: '1h' }
    case '1M':
      return { period1: new Date(now - 30 * 24 * 60 * 60 * 1000), period2: new Date(now), interval: '1d' }
    case '3M':
      return { period1: new Date(now - 90 * 24 * 60 * 60 * 1000), period2: new Date(now), interval: '1d' }
    case '1Y':
      return { period1: new Date(now - 365 * 24 * 60 * 60 * 1000), period2: new Date(now), interval: '1d' }
    case 'YTD': {
      const etYear = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric',
      }).format(new Date(now))
      const jan1Ms = Date.parse(`${etYear}-01-01T00:00:00Z`) + offsetMs
      return { period1: new Date(jan1Ms), period2: new Date(now), interval: '1d' }
    }
    default: { // '1D'
      const etNowMs = now - offsetMs
      const etDate = new Date(etNowMs)
      const etMidnightFakeUtc = Date.UTC(
        etDate.getUTCFullYear(), etDate.getUTCMonth(), etDate.getUTCDate()
      )
      const etMidnightMs = etMidnightFakeUtc + offsetMs
      return {
        period1: new Date(etMidnightMs + 4 * 60 * 60 * 1000),
        period2: new Date(Math.min(etMidnightMs + 20 * 60 * 60 * 1000, now)),
        interval: '5m',
      }
    }
  }
}

async function fetchChart(symbol: string, period: string) {
  try {
    const { period1, period2, interval } = getChartParams(period)
    const [chartResult, quoteResult] = await Promise.all([
      yahooFinance.chart(symbol, { period1, period2, interval: interval as any }),
      yahooFinance.quote(symbol),
    ])

    const points = (chartResult.quotes || [])
      .filter((q: any) => q.close != null && q.date != null)
      .map((q: any) => ({
        time: new Date(q.date).toISOString(),
        price: q.close as number,
      }))

    let afterHours: { price: number; change: number; changePct: number; label: string } | null = null
    if (period === '1D') {
      const marketState = (quoteResult as any).marketState as string | undefined
      if (marketState && (marketState.includes('POST') || marketState === 'CLOSED')) {
        const postPrice = (quoteResult as any).postMarketPrice as number | undefined
        const postChange = (quoteResult as any).postMarketChange as number | undefined
        const postChangePct = (quoteResult as any).postMarketChangePercent as number | undefined
        if (postPrice != null && postChange != null && postChangePct != null) {
          afterHours = { price: postPrice, change: postChange, changePct: postChangePct, label: 'After Hours' }
        }
      } else if (marketState && marketState.includes('PRE')) {
        const prePrice = (quoteResult as any).preMarketPrice as number | undefined
        const preChange = (quoteResult as any).preMarketChange as number | undefined
        const preChangePct = (quoteResult as any).preMarketChangePercent as number | undefined
        if (prePrice != null && preChange != null && preChangePct != null) {
          afterHours = { price: prePrice, change: preChange, changePct: preChangePct, label: 'Pre-Market' }
        }
      }
    }

    return { ticker: symbol, points, afterHours }
  } catch {
    return { ticker: symbol, points: [], afterHours: null }
  }
}

export async function GET(req: NextRequest) {
  try {
    const tickersParam = req.nextUrl.searchParams.get('tickers')
    if (!tickersParam) {
      return NextResponse.json({ error: 'tickers param required' }, { status: 400 })
    }

    const period = req.nextUrl.searchParams.get('period') || '1D'
    const tickers = tickersParam.split(',').filter(Boolean).slice(0, 30).map(t => t.trim().toUpperCase())
    const results = await Promise.all(tickers.map(t => fetchChart(t, period)))

    const chartMap: Record<string, { points: { time: string; price: number }[]; afterHours: any }> = {}
    for (const r of results) {
      if (r.points.length > 0) {
        chartMap[r.ticker] = { points: r.points, afterHours: r.afterHours }
      }
    }

    return NextResponse.json(chartMap)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch charts' }, { status: 500 })
  }
}
