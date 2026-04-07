import { NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type ServiceStatus = 'ok' | 'error' | 'unconfigured'

interface ServiceResult {
  name: string
  status: ServiceStatus
  latency: number
  detail?: string
}

async function checkYahooFinance(): Promise<ServiceResult & { spyPrice?: number; spyChange?: number; spyChangePct?: number }> {
  const t0 = Date.now()
  try {
    const quote = await withTimeout(
      yahooFinance.quote('SPY', { fields: ['regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent'] as any }),
      5000
    ) as any
    const latency = Date.now() - t0
    return {
      name: 'Yahoo Finance',
      status: 'ok',
      latency,
      spyPrice: quote?.regularMarketPrice,
      spyChange: quote?.regularMarketChange,
      spyChangePct: quote?.regularMarketChangePercent,
    }
  } catch (err: any) {
    return { name: 'Yahoo Finance', status: 'error', latency: Date.now() - t0, detail: 'Yahoo Finance unavailable' }
  }
}

async function checkGemini(): Promise<ServiceResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === 'placeholder') {
    return { name: 'Gemini AI', status: 'unconfigured', latency: 0, detail: 'API key not set' }
  }
  const t0 = Date.now()
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })
    await withTimeout(model.countTokens('ping'), 5000)
    return { name: 'Gemini AI', status: 'ok', latency: Date.now() - t0 }
  } catch (err: any) {
    return { name: 'Gemini AI', status: 'error', latency: Date.now() - t0, detail: 'Gemini health check failed' }
  }
}

async function checkFearGreed(): Promise<ServiceResult> {
  const t0 = Date.now()
  try {
    const res = await withTimeout(
      fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://edition.cnn.com/markets/fear-and-greed',
        },
      }),
      5000
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (typeof data?.fear_and_greed?.score !== 'number') throw new Error('unexpected shape')
    return { name: 'CNN', status: 'ok', latency: Date.now() - t0 }
  } catch (err: any) {
    return { name: 'CNN', status: 'error', latency: Date.now() - t0, detail: 'CNN unavailable' }
  }
}

async function checkSupabase(): Promise<ServiceResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || url === 'https://placeholder.supabase.co' || !key || key === 'placeholder') {
    return { name: 'Supabase', status: 'unconfigured', latency: 0, detail: 'Not configured' }
  }
  const t0 = Date.now()
  try {
    const result = await withTimeout(
      supabase.from('reports').select('id').limit(1),
      5000
    )
    const latency = Date.now() - t0
    if ((result as any).error && (result as any).error.code !== 'PGRST116') {
      return { name: 'Supabase', status: 'error', latency, detail: 'Supabase query failed' }
    }
    return { name: 'Supabase', status: 'ok', latency }
  } catch (err: any) {
    return { name: 'Supabase', status: 'error', latency: Date.now() - t0, detail: 'Supabase unavailable' }
  }
}

function deriveOverall(services: ServiceResult[]): 'ok' | 'degraded' | 'down' {
  const configured = services.filter(s => s.status !== 'unconfigured')
  if (configured.length === 0) return 'degraded'
  if (configured.every(s => s.status === 'ok')) return 'ok'
  if (configured.every(s => s.status === 'error')) return 'down'
  return 'degraded'
}

export async function GET() {
  try {
    const [yahooResult, geminiResult, supabaseResult, fearGreedResult] = await Promise.all([
      checkYahooFinance(),
      checkGemini(),
      checkSupabase(),
      checkFearGreed(),
    ])

    const { spyPrice, spyChange, spyChangePct, ...yahooService } = yahooResult
    const services: ServiceResult[] = [yahooService, geminiResult, supabaseResult, fearGreedResult]
    const overallStatus = deriveOverall(services)

    const spy = spyPrice != null
      ? { price: spyPrice, change: spyChange ?? 0, changePct: spyChangePct ?? 0 }
      : undefined

    return NextResponse.json(
      { services, overallStatus, checkedAt: Date.now(), spy },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err: any) {
    return NextResponse.json(
      { services: [], overallStatus: 'down', checkedAt: Date.now() },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
