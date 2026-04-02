import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CNN_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ])
}

export async function GET() {
  try {
    const res = await withTimeout(
      fetch(CNN_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }),
      5000
    )
    if (!res.ok) throw new Error(`CNN API responded ${res.status}`)
    const data = await res.json()
    const { score, rating } = data.fear_and_greed
    return NextResponse.json({ score: Math.round(score), rating })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }
}
