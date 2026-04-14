import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 20)
  if (!query) return NextResponse.json([])

  try {
    const results = await yahooFinance.search(
      query,
      { quotesCount: 8, newsCount: 0, enableFuzzyQuery: true },
      { validateResult: false }
    ) as any

    const suggestions = ((results as any).quotes ?? [])
      .filter((q: any) => {
        if (!q.isYahooFinance || !q.symbol) return false
        if (!['EQUITY', 'ETF'].includes(q.quoteType)) return false
        const exchange = (q.exchange || '').toUpperCase()
        return ['NYQ', 'NMS', 'NGM', 'NCM', 'NYS', 'NAS', 'PCX', 'BTS'].includes(exchange)
      })
      .slice(0, 7)
      .map((q: any) => ({
        symbol: q.symbol as string,
        name: (q.shortname || q.longname || q.symbol) as string,
      }))

    return NextResponse.json(suggestions, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[ticker-search] search failed:', err)
    return NextResponse.json([])
  }
}
