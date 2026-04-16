import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'

export const dynamic = 'force-dynamic'

const cache = new Map<string, { data: any[]; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 20)
  if (!query) return NextResponse.json([])

  const cached = cache.get(query)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

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

    cache.set(query, { data: suggestions, ts: Date.now() })
    // Evict entries older than 2x TTL
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (now - entry.ts > CACHE_TTL * 2) cache.delete(key)
    }

    return NextResponse.json(suggestions, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[ticker-search] search failed:', err)
    return NextResponse.json([])
  }
}
