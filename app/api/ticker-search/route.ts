import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

export const dynamic = 'force-dynamic'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') ?? ''
  if (!query.trim()) return NextResponse.json([])

  try {
    const results = await yahooFinance.search(
      query,
      { quotesCount: 8, newsCount: 0, enableFuzzyQuery: true },
      { validateResult: false }
    ) as any

    const suggestions = ((results as any).quotes ?? [])
      .filter((q: any) => q.isYahooFinance && q.symbol && ['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND'].includes(q.quoteType))
      .slice(0, 7)
      .map((q: any) => ({
        symbol: q.symbol as string,
        name: (q.shortname || q.longname || q.symbol) as string,
      }))

    return NextResponse.json(suggestions)
  } catch {
    return NextResponse.json([])
  }
}
