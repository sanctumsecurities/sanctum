import { NextResponse } from 'next/server'
import { withTimeout } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata'

export async function GET() {
  try {
    const res = await withTimeout(
      fetch(CNN_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://edition.cnn.com/markets/fear-and-greed',
        },
      }),
      5000
    )
    if (!res.ok) throw new Error(`CNN API responded ${res.status}`)
    const data = await res.json()
    if (!data?.fear_and_greed || typeof data.fear_and_greed.score !== 'number') {
      throw new Error('unexpected response shape')
    }
    const fg = data.fear_and_greed
    const indicators = [
      { key: 'market_momentum_sp500', label: 'Market Momentum' },
      { key: 'stock_price_strength', label: 'Price Strength' },
      { key: 'stock_price_breadth', label: 'Price Breadth' },
      { key: 'put_call_options', label: 'Put/Call Options' },
      { key: 'market_volatility_vix', label: 'Volatility (VIX)' },
      { key: 'safe_haven_demand', label: 'Safe Haven Demand' },
      { key: 'junk_bond_demand', label: 'Junk Bond Demand' },
    ].map(({ key, label }) => {
      const d = data[key]
      return d ? { label, score: Math.round(d.score), rating: d.rating } : null
    }).filter(Boolean)

    return NextResponse.json({
      score: Math.round(fg.score),
      rating: fg.rating,
      previousClose: typeof fg.previous_close === 'number' ? Math.round(fg.previous_close) : null,
      previous1Week: typeof fg.previous_1_week === 'number' ? Math.round(fg.previous_1_week) : null,
      previous1Month: typeof fg.previous_1_month === 'number' ? Math.round(fg.previous_1_month) : null,
      previous1Year: typeof fg.previous_1_year === 'number' ? Math.round(fg.previous_1_year) : null,
      indicators,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[fear-greed] fetch failed:', err)
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }
}
