'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { StockReport } from '@/types/report'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function generateReport(ticker: string): Promise<StockReport | { error: string }> {
  const symbol = ticker.toUpperCase().trim()
  if (!symbol) return { error: 'Ticker is required' }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `You are a senior equity analyst at an elite hedge fund. Generate a deeply researched, institutional-quality stock analysis report for the ticker: ${symbol}.

Return ONLY a raw JSON object. No markdown. No backticks. No preamble. Just JSON.

Schema:
{
  "ticker": "string",
  "companyName": "string",
  "exchange": "string",
  "currentPrice": "string (e.g. '$174.50')",
  "priceVsATH": "string (e.g. '-55% from ATH $627')",
  "marketCap": "string (e.g. '~$256B')",
  "website": "string (company website URL, e.g. 'https://www.apple.com')",
  "verdict": "BUY" | "SELL" | "HOLD" | "AVOID",
  "verdictSubtitle": "string — one-line thesis",
  "badges": ["string — contextual badges like 'DOJ Investigation', 'Buffett Bought', 'Mkt Cap ~$256B'"],
  "overview": {
    "keyMetrics": [
      { "label": "string", "value": "string", "subtitle": "string or omit", "color": "string hex or omit" }
    ],
    "businessSummary": "string — 3 paragraphs separated by \\n\\n",
    "whatHasGoneWrong": "string or null — if company is under stress, explain what went wrong",
    "segmentBreakdown": [{ "name": "string", "percentage": number }],
    "moatScores": [{ "metric": "string", "score": number 0-100 }]
  },
  "financials": {
    "narrativeSummary": "string — 2-3 paragraphs separated by \\n\\n",
    "annualData": [
      { "year": "string", "revenue": number (in billions), "revenueGrowth": "string (e.g. '+8.2%')", "adjEPS": number, "epsGrowth": "string", "opCF": "string (e.g. '$24.3B')", "keyMetric": "string (relevant KPI)" }
    ],
    "callout": "string — single most important financial warning or insight"
  },
  "valuation": {
    "bullCase": "string — detailed bull case paragraph",
    "bearCase": "string — detailed bear case paragraph",
    "metrics": [{ "metric": "string", "current": "string", "fiveYearAvg": "string", "commentary": "string" }]
  },
  "catalysts": {
    "catalystTable": [{ "timeline": "string", "catalyst": "string", "impact": "string (use arrow like '↑ Positive' or '↓ Negative')", "probability": "string" }],
    "risks": [{ "risk": "string", "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "description": "string" }]
  },
  "verdictDetails": {
    "bullCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "baseCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "bearCase": { "priceTarget": "string", "return": "string", "description": "string" },
    "scenarioMatrix": [{ "scenario": "string", "probability": "string", "priceTarget": "string", "return": "string", "weighted": "string" }],
    "multiYearProjections": [{ "horizon": "string", "bearCase": "string", "baseCase": "string", "bullCase": "string", "commentary": "string" }],
    "priceProjectionChart": [{ "year": "string", "bear": number, "base": number, "bull": number }],
    "syndicateVerdict": {
      "rating": "BUY" | "SELL" | "HOLD" | "AVOID",
      "positionSizing": "string — position sizing recommendation",
      "keySignalTitle": "string — dynamic signal title (e.g. 'The Buffett Signal')",
      "keySignalDetail": "string — paragraph explaining the signal",
      "honestRisk": "string — paragraph on the honest risk",
      "howToPosition": "string — paragraph on entry strategy and sizing",
      "longTermThesis": "string — paragraph on 5-10 year outlook"
    }
  }
}

Requirements:
- overview.keyMetrics: exactly 6 items: Market Cap, FY Revenue, Next Year Revenue Est., Adj EPS, Op Cash Flow, Dividend/Yield
- overview.moatScores: exactly 6 items scoring competitive advantages on 0-100 scale
- overview.segmentBreakdown: 3-8 revenue segments that sum close to 100
- financials.annualData: 4-5 years of data
- catalysts.catalystTable: 4-6 catalysts
- catalysts.risks: 4-6 risks ordered by severity
- verdictDetails.scenarioMatrix: 3 rows (Bull/Base/Bear) + 1 Expected Value row
- verdictDetails.multiYearProjections: 3 rows (3-year, 5-year, 10-year)
- verdictDetails.priceProjectionChart: 5-6 data points for chart (current year through 5 years out)
- Be specific to THIS company — no generic filler
- Return ONLY the JSON object, no wrapping`

    const result = await model.generateContent(prompt)
    const text = result.response.text()
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as StockReport
    return parsed
  } catch (err: any) {
    return { error: err.message || 'Failed to generate report' }
  }
}
