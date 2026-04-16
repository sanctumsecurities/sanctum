// ── Macro Environment Overlay ──
// Fetches VIX, 10Y yield, S&P 500, and 5Y yield for yield curve analysis.
// All fetches are best-effort with 5s timeouts — any that fail are silently omitted.

import { yahooFinance } from '@/lib/yahoo'
import { withTimeout } from '@/lib/utils'

export interface MacroContext {
  vix: { level: number; classification: string } | null
  tenYearYield: number | null
  sp500: { price: number; fiftyDayAvg: number; twoHundredDayAvg: number } | null
  yieldCurve: { spread: number; status: 'inverted' | 'flat' | 'normal' } | null
  fetchedAt: string
}

let macroCache: { result: { formatted: string; data: MacroContext }; ts: number } | null = null
const MACRO_CACHE_TTL = 5 * 60 * 1000

function classifyVIX(level: number): string {
  if (level < 15) return 'low fear'
  if (level <= 25) return 'moderate'
  if (level <= 35) return 'elevated'
  return 'extreme fear'
}

export async function fetchMacroContext(): Promise<{ formatted: string; data: MacroContext }> {
  if (macroCache && Date.now() - macroCache.ts < MACRO_CACHE_TTL) {
    return macroCache.result
  }

  const data: MacroContext = {
    vix: null,
    tenYearYield: null,
    sp500: null,
    yieldCurve: null,
    fetchedAt: new Date().toISOString(),
  }

  // Fetch all four tickers in parallel, each with 5s timeout
  const [vixResult, tnxResult, gspcResult, fvxResult] = await Promise.allSettled([
    withTimeout(yahooFinance.quote('^VIX', {}, { validateResult: false } as any), 5000),
    withTimeout(yahooFinance.quote('^TNX', {}, { validateResult: false } as any), 5000),
    withTimeout(yahooFinance.quote('^GSPC', {}, { validateResult: false } as any), 5000),
    withTimeout(yahooFinance.quote('^FVX', {}, { validateResult: false } as any), 5000),
  ])

  // Process VIX
  if (vixResult.status === 'fulfilled' && vixResult.value) {
    const q = vixResult.value as any
    const level = q.regularMarketPrice ?? 0
    if (level > 0) {
      data.vix = { level, classification: classifyVIX(level) }
    }
  }

  // Process 10Y yield
  let tenY = 0
  if (tnxResult.status === 'fulfilled' && tnxResult.value) {
    const q = tnxResult.value as any
    tenY = q.regularMarketPrice ?? 0
    if (tenY > 0) data.tenYearYield = tenY
  }

  // Process S&P 500
  if (gspcResult.status === 'fulfilled' && gspcResult.value) {
    const q = gspcResult.value as any
    const price = q.regularMarketPrice ?? 0
    if (price > 0) {
      data.sp500 = {
        price,
        fiftyDayAvg: q.fiftyDayAverage ?? 0,
        twoHundredDayAvg: q.twoHundredDayAverage ?? 0,
      }
    }
  }

  // Process yield curve (10Y vs 5Y)
  let fiveY = 0
  if (fvxResult.status === 'fulfilled' && fvxResult.value) {
    const q = fvxResult.value as any
    fiveY = q.regularMarketPrice ?? 0
  }
  if (tenY > 0 && fiveY > 0) {
    const spread = tenY - fiveY
    let status: 'inverted' | 'flat' | 'normal'
    if (spread < 0) status = 'inverted'
    else if (spread < 0.2) status = 'flat'
    else status = 'normal'
    data.yieldCurve = { spread: parseFloat(spread.toFixed(2)), status }
  }

  // Build formatted string for prompt injection
  const lines: string[] = []
  if (data.vix) lines.push(`- VIX: ${data.vix.level.toFixed(1)} (${data.vix.classification})`)
  if (data.tenYearYield != null) lines.push(`- US 10-Year Yield: ${data.tenYearYield.toFixed(2)}%`)
  if (data.sp500) {
    lines.push(`- S&P 500: ${data.sp500.price.toFixed(0)} (50-day avg: ${data.sp500.fiftyDayAvg.toFixed(0)}, 200-day avg: ${data.sp500.twoHundredDayAvg.toFixed(0)})`)
  }
  if (data.yieldCurve) {
    lines.push(`- Yield Curve (10Y vs 5Y): ${data.yieldCurve.spread >= 0 ? '+' : ''}${data.yieldCurve.spread.toFixed(2)}% spread (${data.yieldCurve.status})`)
  }

  const formatted = lines.length > 0
    ? `MACRO ENVIRONMENT (as of ${new Date().toISOString().split('T')[0]}):\n${lines.join('\n')}`
    : ''

  const result = { formatted, data }
  macroCache = { result, ts: Date.now() }
  return result
}
