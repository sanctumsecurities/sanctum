import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/lib/yahoo'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// ── In-memory cache (5-minute TTL) ──
const analysisCache = new Map<string, { data: any; ai: any; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

function safeNum(val: any, fallback = 0): number {
  if (val === undefined || val === null || isNaN(val)) return fallback
  return typeof val === 'object' && 'raw' in val ? val.raw : Number(val)
}

export async function POST(req: NextRequest) {
  try {
    const { ticker } = await req.json()
    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 })
    }

    const symbol = ticker.toUpperCase().trim()

    // Check cache first
    const cached = analysisCache.get(symbol)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ data: cached.data, ai: cached.ai })
    }

    // ── Step 1: Financial Data ──
    let result: any
    try {
      result = await yahooFinance.quoteSummary(symbol, {
        modules: [
          'price',
          'summaryDetail',
          'summaryProfile',
          'defaultKeyStatistics',
          'financialData',
          'incomeStatementHistory',
          'earnings',
        ] as any,
      }, { validateResult: false })
    } catch {
      return NextResponse.json({ error: `Ticker "${symbol}" not found or unavailable` }, { status: 404 })
    }

    const price = result.price || {}
    const summary = result.summaryDetail || {}
    const profile = result.summaryProfile || {}
    const keyStats = result.defaultKeyStatistics || {}
    const financial = result.financialData || {}
    const incomeHistory = result.incomeStatementHistory?.incomeStatementHistory || []
    const earningsData = result.earnings || {}

    const sharesOutstanding = safeNum(keyStats.sharesOutstanding) || safeNum(price.sharesOutstanding) || 1

    // Sort income history once (ascending by date)
    const sortedIncome = [...incomeHistory].sort(
      (a: any, b: any) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
    )

    // Build revenue + net income history (annual)
    const revenue = sortedIncome.map((stmt: any) => ({
      year: new Date(stmt.endDate).getFullYear().toString(),
      revenue: parseFloat((safeNum(stmt.totalRevenue) / 1e9).toFixed(1)),
      netIncome: parseFloat((safeNum(stmt.netIncome) / 1e9).toFixed(1)),
    }))

    // Build EPS history from income / shares
    const eps = sortedIncome.map((stmt: any) => ({
        year: new Date(stmt.endDate).getFullYear().toString(),
        eps: parseFloat((safeNum(stmt.netIncome) / sharesOutstanding).toFixed(2)),
      }))

    // If earnings module has yearly data, prefer that for EPS
    const yearlyEarnings = earningsData?.financialsChart?.yearly
    let epsFromEarnings = eps
    if (yearlyEarnings && yearlyEarnings.length > 0) {
      epsFromEarnings = yearlyEarnings.map((y: any) => ({
        year: y.date.toString(),
        eps: parseFloat((safeNum(y.earnings) / sharesOutstanding).toFixed(2)),
      }))
    }

    const data = {
      name: price.shortName || price.longName || symbol,
      exchange: price.exchangeName || price.exchange || '',
      sector: profile.sector || '',
      industry: profile.industry || '',
      website: profile.website || '',
      price: safeNum(price.regularMarketPrice),
      previousClose: safeNum(summary.previousClose),
      fiftyTwoWeekHigh: safeNum(summary.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: safeNum(summary.fiftyTwoWeekLow),
      marketCap: safeNum(price.marketCap),
      pe: safeNum(summary.trailingPE),
      forwardPe: safeNum(summary.forwardPE) || safeNum(keyStats.forwardPE),
      pegRatio: safeNum(keyStats.pegRatio),
      beta: safeNum(summary.beta) || safeNum(keyStats.beta),
      dividendYield: safeNum(summary.dividendYield),
      dividendPerShare: safeNum(summary.dividendRate),
      epsTrailing: safeNum(keyStats.trailingEps),
      evToEbitda: safeNum(keyStats.enterpriseToEbitda),
      operatingMargins: safeNum(financial.operatingMargins),
      profitMargins: safeNum(financial.profitMargins),
      grossMargins: safeNum(financial.grossMargins),
      returnOnEquity: safeNum(financial.returnOnEquity),
      debtToEquity: safeNum(financial.debtToEquity),
      totalCash: safeNum(financial.totalCash),
      totalDebt: safeNum(financial.totalDebt),
      freeCashflow: safeNum(financial.freeCashflow),
      sharesOutstanding,
      revenue,
      eps: epsFromEarnings.length > 0 ? epsFromEarnings : eps,
    }

    // ── Step 2: AI Generation ──
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const financialContext = JSON.stringify({
      ticker: symbol,
      name: data.name,
      sector: data.sector,
      industry: data.industry,
      price: data.price,
      marketCap: data.marketCap,
      pe: data.pe,
      forwardPe: data.forwardPe,
      beta: data.beta,
      dividendYield: data.dividendYield,
      operatingMargins: data.operatingMargins,
      profitMargins: data.profitMargins,
      returnOnEquity: data.returnOnEquity,
      debtToEquity: data.debtToEquity,
      freeCashflow: data.freeCashflow,
      revenue: data.revenue,
      eps: data.eps,
    }, null, 2)

    const prompt = `You are a senior equity research analyst at a top investment bank. Analyze the following financial data for ${symbol} (${data.name}) and produce a structured investment research report.

Financial Data:
${financialContext}

Return ONLY valid JSON (no markdown, no explanation, no extra text) with this exact structure:
{
  "overview": {
    "sentiment": "Bullish" or "Bearish" or "Neutral",
    "highlights": [
      { "icon": "<single emoji>", "text": "<specific insight about this company, 1-2 sentences>" }
    ]
  },
  "strategy": [
    { "title": "<strategic initiative or catalyst>", "description": "<2-3 sentence analysis>", "tag": "<one word like GROWTH, WIN, NEW, MILESTONE, INNOVATION>" }
  ],
  "risks": [
    { "title": "<risk factor>", "level": "<one of: HIGH, MEDIUM-HIGH, MEDIUM, LOW-MEDIUM, LOW>", "text": "<2-3 sentence explanation of the risk>" }
  ],
  "bull_case": ["<concise bull point>", "<concise bull point>"],
  "bear_case": ["<concise bear point>", "<concise bear point>"]
}

Requirements:
- overview.highlights: exactly 5 items with unique emoji icons
- strategy: 4-6 items with specific, factual analysis
- risks: 4-6 items ordered from highest to lowest severity
- bull_case: exactly 5 concise points
- bear_case: exactly 5 concise points
- Be specific to THIS company — no generic filler
- Use real analysis based on the provided financials
- Return ONLY the JSON object`

    let ai: any
    try {
      const aiResult = await model.generateContent(prompt)
      const aiText = aiResult.response.text()
      const cleaned = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      ai = JSON.parse(cleaned)
    } catch (e) {
      console.error('AI generation failed:', e)
      ai = {
        overview: {
          sentiment: 'Neutral',
          highlights: [
            { icon: '📊', text: `${data.name} trades at ${data.pe.toFixed(1)}x earnings with a market cap of $${(data.marketCap / 1e9).toFixed(0)}B.` },
            { icon: '💰', text: `Operating margins of ${(data.operatingMargins * 100).toFixed(1)}% and profit margins of ${(data.profitMargins * 100).toFixed(1)}%.` },
            { icon: '📈', text: `Beta of ${data.beta.toFixed(2)} relative to the broader market.` },
            { icon: '🏢', text: `Operates in the ${data.sector} sector, ${data.industry} industry.` },
            { icon: '💵', text: `Free cash flow of $${(data.freeCashflow / 1e9).toFixed(1)}B.` },
          ],
        },
        strategy: [
          { title: 'Core Business', description: `${data.name} operates in the ${data.industry} space. Further analysis requires additional data.`, tag: 'INFO' },
        ],
        risks: [
          { title: 'Market Risk', level: 'MEDIUM', text: 'General market conditions and macroeconomic factors may impact performance.' },
          { title: 'Sector Risk', level: 'MEDIUM', text: `Risks inherent to the ${data.sector} sector apply.` },
        ],
        bull_case: ['Established market position', 'Sector growth potential', 'Manageable valuation', 'Cash flow generation', 'Industry tailwinds'],
        bear_case: ['Macro uncertainty', 'Competitive pressures', 'Valuation risk', 'Regulatory risk', 'Execution risk'],
      }
    }

    // Store in cache
    analysisCache.set(symbol, { data, ai, ts: Date.now() })

    // Evict stale entries (keep cache bounded)
    if (analysisCache.size > 50) {
      const now = Date.now()
      for (const [key, val] of analysisCache) {
        if (now - val.ts > CACHE_TTL) analysisCache.delete(key)
      }
    }

    // ── Step 3 & 4: Return Response (client handles Supabase save) ──
    return NextResponse.json({ data, ai })
  } catch (error: any) {
    console.error('Analysis error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to analyze ticker. Please try again.' },
      { status: 500 }
    )
  }
}
