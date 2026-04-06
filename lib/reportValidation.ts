// ── Post-Gemini Source-of-Truth Validation ──
// Scans all string fields in the Gemini output for numerical claims,
// cross-references them against Yahoo Finance data, and flags discrepancies.
// Does NOT auto-correct prose or block report generation.

// ── Discrepancy thresholds by data type ──
const THRESHOLDS: Record<string, number> = {
  margin: 2.0,    // 200bps — margins, yields
  growth: 5.0,    // 5 percentage points — growth rates
  pe: 0.15,       // 15% relative error — P/E ratios
  dollar: 0.10,   // 10% relative error — dollar amounts
}

interface SourceEntry {
  value: number
  type: 'margin' | 'growth' | 'pe' | 'dollar'
}

interface FlaggedClaim {
  field: string
  claim: string
  sourceValue: string
  geminiValue: string
  severity: 'low' | 'medium' | 'high'
}

export interface DataValidation {
  flaggedClaims: FlaggedClaim[]
  validationScore: number
  totalChecked: number
  totalFlagged: number
}

// Build a lookup of ground-truth values from Yahoo data
function buildSourceMap(yahoo: any): Map<string, SourceEntry> {
  const map = new Map<string, SourceEntry>()

  // Margins from latest year of marginTrends
  const latestMargin = yahoo.marginTrends?.[yahoo.marginTrends.length - 1]
  if (latestMargin) {
    map.set('gross margin', { value: latestMargin.gross, type: 'margin' })
    map.set('operating margin', { value: latestMargin.operating, type: 'margin' })
    map.set('net margin', { value: latestMargin.net, type: 'margin' })
  }

  // P/E ratios
  if (yahoo.currentPE > 0) map.set('trailing p/e', { value: yahoo.currentPE, type: 'pe' })
  if (yahoo.forwardPE > 0) map.set('forward p/e', { value: yahoo.forwardPE, type: 'pe' })

  // Beta (use relative threshold)
  if (yahoo.beta > 0) map.set('beta', { value: yahoo.beta, type: 'pe' })

  // Analyst targets
  if (yahoo.analystTargetRange?.mean > 0) {
    map.set('analyst mean target', { value: yahoo.analystTargetRange.mean, type: 'dollar' })
    map.set('mean target', { value: yahoo.analystTargetRange.mean, type: 'dollar' })
    map.set('target price', { value: yahoo.analystTargetRange.mean, type: 'dollar' })
  }

  // Dividend yield (stored as formatted string like "0.5%" — parse it)
  if (yahoo.dividendData?.currentYield) {
    const yieldVal = parseFloat(yahoo.dividendData.currentYield)
    if (!isNaN(yieldVal)) map.set('dividend yield', { value: yieldVal, type: 'margin' })
  }

  // Revenue growth — compute YoY from latest two years
  if (yahoo.revenueVsCogs?.length >= 2) {
    const arr = yahoo.revenueVsCogs
    const latest = arr[arr.length - 1].revenue
    const prev = arr[arr.length - 2].revenue
    if (prev > 0) {
      map.set('revenue growth', { value: ((latest - prev) / prev) * 100, type: 'growth' })
    }
  }

  return map
}

// Extract numerical claims from a text string
function extractNumbers(text: string): { value: number; context: string; unit: 'pct' | 'dollar' | 'ratio' }[] {
  const results: { value: number; context: string; unit: 'pct' | 'dollar' | 'ratio' }[] = []

  // Percentages: 28.5%
  const pctRegex = /(\d+\.?\d*)%/g
  let match: RegExpExecArray | null
  while ((match = pctRegex.exec(text)) !== null) {
    results.push({
      value: parseFloat(match[1]),
      context: text.substring(Math.max(0, match.index - 40), match.index + match[0].length + 10).trim(),
      unit: 'pct',
    })
  }

  // Dollar amounts: $245, $1.2B, $95.2B
  const dollarRegex = /\$(\d[\d,.]*)\s*([BMTbmt])?/g
  while ((match = dollarRegex.exec(text)) !== null) {
    let value = parseFloat(match[1].replace(/,/g, ''))
    const suffix = match[2]?.toUpperCase()
    if (suffix === 'B') value *= 1e9
    else if (suffix === 'M') value *= 1e6
    else if (suffix === 'T') value *= 1e12
    results.push({
      value,
      context: text.substring(Math.max(0, match.index - 40), match.index + match[0].length + 10).trim(),
      unit: 'dollar',
    })
  }

  // Ratios: 28.4x
  const ratioRegex = /(\d+\.?\d*)x\b/g
  while ((match = ratioRegex.exec(text)) !== null) {
    results.push({
      value: parseFloat(match[1]),
      context: text.substring(Math.max(0, match.index - 40), match.index + match[0].length + 10).trim(),
      unit: 'ratio',
    })
  }

  return results
}

// Recursively walk an object and collect all string fields with their JSON paths
function walkStrings(obj: any, path: string = ''): { path: string; value: string }[] {
  const results: { path: string; value: string }[] = []
  if (typeof obj === 'string') {
    results.push({ path, value: obj })
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      results.push(...walkStrings(obj[i], `${path}[${i}]`))
    }
  } else if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      results.push(...walkStrings(obj[key], path ? `${path}.${key}` : key))
    }
  }
  return results
}

function computeSeverity(discrepancy: number, threshold: number): 'low' | 'medium' | 'high' {
  if (discrepancy > threshold * 2) return 'high'
  if (discrepancy > threshold * 1.5) return 'medium'
  return 'low'
}

export function validateReport(report: any, yahoo: any): DataValidation {
  const sourceMap = buildSourceMap(yahoo)
  const flaggedClaims: FlaggedClaim[] = []
  let totalChecked = 0

  const strings = walkStrings(report)

  for (const { path, value } of strings) {
    // Skip fields we know are Yahoo-sourced (already overwritten, guaranteed correct)
    if (path.startsWith('overview.analystConsensus')) continue
    if (path.startsWith('overview.institutionalOwnership')) continue
    if (path.startsWith('overview.revenueCagr')) continue
    if (path.startsWith('overview.netIncomeCagr')) continue
    if (path.startsWith('valuation.analystTargetRange')) continue
    if (path.startsWith('catalysts.recommendationTrend')) continue
    if (path.startsWith('catalysts.insiderTimeline')) continue

    const numbers = extractNumbers(value)

    for (const num of numbers) {
      const contextLower = num.context.toLowerCase()

      for (const [key, source] of sourceMap) {
        // Check if the context mentions this data point
        // Use the first word of the key for fuzzy matching
        const keyWords = key.split(' ')
        const hasKey = contextLower.includes(key) ||
          (keyWords.length > 1 && keyWords.every(w => contextLower.includes(w)))
        if (!hasKey) continue

        totalChecked++

        let discrepancy: number
        if (source.type === 'margin' || source.type === 'growth') {
          // Absolute difference in percentage points
          discrepancy = Math.abs(num.value - source.value)
        } else {
          // Relative error for P/E and dollar amounts
          discrepancy = source.value !== 0
            ? Math.abs(num.value - source.value) / Math.abs(source.value)
            : 0
        }

        const threshold = THRESHOLDS[source.type]
        if (discrepancy > threshold) {
          flaggedClaims.push({
            field: path,
            claim: num.context,
            sourceValue: `${source.value}`,
            geminiValue: `${num.value}`,
            severity: computeSeverity(discrepancy, threshold),
          })
        }
      }
    }
  }

  const totalFlagged = flaggedClaims.length

  return {
    flaggedClaims,
    validationScore: totalChecked > 0 ? Math.round((1 - totalFlagged / totalChecked) * 100) : 100,
    totalChecked,
    totalFlagged,
  }
}
