import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

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
    const { score, rating } = data.fear_and_greed
    return NextResponse.json({ score: Math.round(score), rating })
  } catch (err) {
    console.error('[fear-greed] fetch failed:', err)
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }
}
