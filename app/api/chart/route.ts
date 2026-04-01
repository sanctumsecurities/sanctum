import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

export async function GET(req: NextRequest) {
  try {
    const ticker = req.nextUrl.searchParams.get('ticker')
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
    }

    const symbol = ticker.toUpperCase().trim()

    const [chartResult, quoteResult] = await Promise.all([
      yahooFinance.chart(symbol, {
        period1: new Date(Date.now() - 24 * 60 * 60 * 1000),
        period2: new Date(),
        interval: '5m' as any,
      }),
      yahooFinance.quote(symbol),
    ])

    const points = (chartResult.quotes || [])
      .filter((q: any) => q.close != null && q.date != null)
      .map((q: any) => ({
        time: new Date(q.date).toISOString(),
        price: q.close as number,
      }))

    // Build after-hours data
    let afterHours: { price: number; change: number; changePct: number; label: string } | null = null
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

    return NextResponse.json({ ticker: symbol, points, afterHours })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch chart' }, { status: 500 })
  }
}
