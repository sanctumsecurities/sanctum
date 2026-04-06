// ── Quant Pre-Score Engine ──
// Computes a 0-100 score from Yahoo Finance data BEFORE the Gemini call.
// Each factor produces a sub-score from -1 (bearish) to +1 (bullish),
// gets weighted, and the total is normalized to 0-100.

// ── Tunable weight config ──
// Adjust these to change how aggressively each signal contributes.
// Weights MUST sum to 1.0.
export const QUANT_WEIGHTS: Record<string, number> = {
  analystConsensus:        0.15,  // buy% vs sell% from recommendationTrend
  priceVsTarget:           0.15,  // upside/downside to analyst mean target
  insiderActivity:         0.12,  // net buys in 90 days, recency-weighted
  marginTrajectory:        0.10,  // gross + operating margin slope (3yr)
  revenueGrowthMomentum:   0.10,  // revenue growth accelerating or decelerating
  earningsGrowthMomentum:  0.10,  // EPS growth accelerating or decelerating
  fcfYield:                0.08,  // FCF yield vs ~4% equity benchmark
  relativeValuation:       0.12,  // forward P/E vs trailing and market avg
  shortInterest:           0.08,  // short % of float
}

// ── Verdict thresholds ──
// Score 0-100 mapped to verdict
const VERDICT_THRESHOLDS = { BUY: 70, HOLD: 45, SELL: 20 }
// >= 70 BUY, 45-69 HOLD, 20-44 SELL, <20 AVOID

// ── Input type (matches fields from fetchYahooData return) ──
export interface QuantScoreInput {
  recommendationTrend: { month: string; buy: number; hold: number; sell: number }[]
  analystTargetRange: { mean: number; currentPrice: number }
  insiderTimeline: { date: string; type: 'BUY' | 'SELL'; shares: number; value: string }[] | null
  marginTrends: { year: string; gross: number; operating: number; net: number }[]
  revenueVsCogs: { year: string; revenue: number; cogs: number; grossProfit: number }[]
  epsHistory: { year: string; eps: number }[]
  marketCapRaw: number
  latestFCF: number
  forwardPE: number
  currentPE: number
  shortPercentOfFloat: number | null
}

export interface QuantSignal {
  score: number
  verdict: 'BUY' | 'SELL' | 'HOLD' | 'AVOID'
  factors: {
    name: string
    rawValue: string
    score: number
    weight: number
    contribution: number
  }[]
  skippedFactors: string[]
}

// ── Factor scoring functions ──
// Each returns NaN when data is missing (factor gets skipped).
// Each returns a value in [-1, +1].

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// Analyst consensus: buy% vs sell% with temporal weighting on months
// Most recent month 3x, second 2x, older 1x
function scoreAnalystConsensus(
  trend: QuantScoreInput['recommendationTrend']
): { score: number; rawValue: string } {
  if (!trend || trend.length === 0) return { score: NaN, rawValue: 'no data' }

  const recencyWeights = [3, 2, 1, 1]
  let wBuys = 0, wSells = 0, wTotal = 0

  for (let i = 0; i < trend.length; i++) {
    const w = recencyWeights[i] ?? 1
    wBuys += trend[i].buy * w
    wSells += trend[i].sell * w
    wTotal += (trend[i].buy + trend[i].hold + trend[i].sell) * w
  }

  if (wTotal === 0) return { score: NaN, rawValue: 'no ratings' }

  const buyPct = wBuys / wTotal
  const sellPct = wSells / wTotal

  let score: number
  if (buyPct > 0.7) score = 1.0
  else if (buyPct > 0.5) score = 0.5
  else if (sellPct > 0.6) score = -1.0
  else if (sellPct > 0.4) score = -0.5
  else score = 0

  return {
    score,
    rawValue: `buy ${(buyPct * 100).toFixed(0)}%, sell ${(sellPct * 100).toFixed(0)}% (weighted)`,
  }
}

// Price vs analyst mean target: linear map of upside/downside %
// +30% upside → +1, 0% → 0, -20% → -1
function scorePriceVsTarget(
  mean: number, currentPrice: number
): { score: number; rawValue: string } {
  if (!mean || !currentPrice || mean <= 0 || currentPrice <= 0) {
    return { score: NaN, rawValue: 'no target data' }
  }

  const upside = (mean - currentPrice) / currentPrice
  const score = upside >= 0
    ? clamp(upside / 0.30, 0, 1)
    : clamp(upside / 0.20, -1, 0)

  return {
    score,
    rawValue: `${(upside * 100).toFixed(1)}% ${upside >= 0 ? 'upside' : 'downside'} to $${mean.toFixed(0)} mean`,
  }
}

// Insider activity: recency-weighted net buys
// 0-30 days: 3x, 30-60 days: 2x, 60-90 days: 1x
// Normalize: > +5 → +1, < -5 → -1, linear between
function scoreInsiderActivity(
  timeline: QuantScoreInput['insiderTimeline']
): { score: number; rawValue: string } {
  if (!timeline || timeline.length === 0) return { score: NaN, rawValue: 'no data' }

  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000
  let weightedNet = 0
  let counted = 0

  for (const txn of timeline) {
    const ageInDays = (now - new Date(txn.date).getTime()) / DAY_MS
    if (ageInDays > 90) continue
    counted++
    const recencyWeight = ageInDays <= 30 ? 3 : ageInDays <= 60 ? 2 : 1
    weightedNet += (txn.type === 'BUY' ? 1 : -1) * recencyWeight
  }

  if (counted === 0) return { score: NaN, rawValue: 'no recent transactions' }

  return {
    score: clamp(weightedNet / 5, -1, 1),
    rawValue: `${counted} txns in 90d (weighted net: ${weightedNet >= 0 ? '+' : ''}${weightedNet.toFixed(1)})`,
  }
}

// Margin trajectory: linear regression slope on gross + operating margins (last 3 years)
// Both expanding → +1, both contracting → -1, mixed → average
function scoreMarginTrajectory(
  trends: QuantScoreInput['marginTrends']
): { score: number; rawValue: string } {
  if (!trends || trends.length < 2) return { score: NaN, rawValue: 'insufficient data' }

  const recent = trends.slice(-3)
  if (recent.length < 2) return { score: NaN, rawValue: 'insufficient data' }

  function slope(values: number[]): number {
    const n = values.length
    const xMean = (n - 1) / 2
    const yMean = values.reduce((a, b) => a + b, 0) / n
    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - yMean)
      den += (i - xMean) ** 2
    }
    return den === 0 ? 0 : num / den
  }

  // Slopes are in percentage points per year
  const grossSlope = slope(recent.map(m => m.gross))
  const opSlope = slope(recent.map(m => m.operating))

  // ~2pp/year slope is a strong signal → ±1
  const grossScore = clamp(grossSlope / 2, -1, 1)
  const opScore = clamp(opSlope / 2, -1, 1)
  const score = (grossScore + opScore) / 2

  return {
    score,
    rawValue: `gross ${grossSlope >= 0 ? '+' : ''}${grossSlope.toFixed(1)}pp/yr, op ${opSlope >= 0 ? '+' : ''}${opSlope.toFixed(1)}pp/yr`,
  }
}

// Revenue growth momentum: is YoY growth accelerating or decelerating?
// Compares most recent YoY to prior YoY.
// > +5pp acceleration → +1, < -5pp → -1, linear between
function scoreRevenueGrowthMomentum(
  revenueVsCogs: QuantScoreInput['revenueVsCogs']
): { score: number; rawValue: string } {
  if (!revenueVsCogs || revenueVsCogs.length < 3) {
    return { score: NaN, rawValue: 'insufficient data' }
  }

  const recent = revenueVsCogs.slice(-3)
  const growthRates: number[] = []

  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].revenue > 0) {
      growthRates.push(
        ((recent[i].revenue - recent[i - 1].revenue) / recent[i - 1].revenue) * 100
      )
    }
  }

  if (growthRates.length < 2) return { score: NaN, rawValue: 'insufficient growth data' }

  const acceleration = growthRates[growthRates.length - 1] - growthRates[growthRates.length - 2]

  return {
    score: clamp(acceleration / 5, -1, 1),
    rawValue: `${acceleration >= 0 ? '+' : ''}${acceleration.toFixed(1)}pp acceleration`,
  }
}

// Earnings growth momentum: same as revenue but using diluted EPS
function scoreEarningsGrowthMomentum(
  epsHistory: QuantScoreInput['epsHistory']
): { score: number; rawValue: string } {
  if (!epsHistory || epsHistory.length < 3) {
    return { score: NaN, rawValue: 'insufficient data' }
  }

  const recent = epsHistory.slice(-3)
  const growthRates: number[] = []

  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1].eps > 0) {
      growthRates.push(
        ((recent[i].eps - recent[i - 1].eps) / recent[i - 1].eps) * 100
      )
    }
  }

  if (growthRates.length < 2) return { score: NaN, rawValue: 'insufficient EPS data' }

  const acceleration = growthRates[growthRates.length - 1] - growthRates[growthRates.length - 2]

  return {
    score: clamp(acceleration / 5, -1, 1),
    rawValue: `${acceleration >= 0 ? '+' : ''}${acceleration.toFixed(1)}pp EPS acceleration`,
  }
}

// FCF yield: (FCF / marketCap) vs 4% benchmark
// > 8% → +1, 4% → 0, < 0% → -1
function scoreFCFYield(
  latestFCF: number, marketCapRaw: number
): { score: number; rawValue: string } {
  if (!marketCapRaw || marketCapRaw <= 0) return { score: NaN, rawValue: 'no market cap' }
  if (latestFCF === 0 && marketCapRaw > 0) {
    // Zero FCF is meaningful data (negative signal), not missing data
    return { score: -0.5, rawValue: '0% FCF yield' }
  }

  const fcfYieldPct = (latestFCF / marketCapRaw) * 100

  let score: number
  if (fcfYieldPct >= 4) {
    score = clamp((fcfYieldPct - 4) / 4, 0, 1)
  } else {
    score = clamp(fcfYieldPct / 4, -1, 0)
  }

  return {
    score,
    rawValue: `${fcfYieldPct.toFixed(1)}% (vs 4% benchmark)`,
  }
}

// Relative valuation: two sub-signals averaged
// 1. Forward PE vs trailing PE (forward < trailing = growth expected = bullish)
// 2. Forward PE vs ~20x market average (below = cheap, above = expensive)
function scoreRelativeValuation(
  forwardPE: number, currentPE: number
): { score: number; rawValue: string } {
  if (!forwardPE || forwardPE <= 0) return { score: NaN, rawValue: 'no forward P/E' }

  const MARKET_AVG_PE = 20

  // Sub-signal 1: forward vs trailing
  let forwardVsTrailing = 0
  if (currentPE > 0) {
    const ratio = forwardPE / currentPE
    // ratio < 0.8 → +1 (strong growth), ratio > 1.2 → -1 (contraction)
    forwardVsTrailing = clamp((1 - ratio) / 0.2, -1, 1)
  }

  // Sub-signal 2: forward PE vs market average
  // below 20 → cheap (positive), above 20 → expensive (negative)
  const deviation = (forwardPE - MARKET_AVG_PE) / MARKET_AVG_PE
  const vsMarket = clamp(-deviation / 0.3, -1, 1)

  const score = currentPE > 0
    ? (forwardVsTrailing + vsMarket) / 2
    : vsMarket

  return {
    score,
    rawValue: `fwd ${forwardPE.toFixed(1)}x vs ${currentPE > 0 ? currentPE.toFixed(1) + 'x trailing, ' : ''}${MARKET_AVG_PE}x market avg`,
  }
}

// Short interest: > 20% → -1, > 10% → -0.5, < 3% → +0.3, else 0
function scoreShortInterest(
  shortPctFloat: number | null
): { score: number; rawValue: string } {
  if (shortPctFloat == null) return { score: NaN, rawValue: 'no data' }

  // Yahoo returns this as a decimal (e.g., 0.05 = 5%)
  const pct = shortPctFloat * 100

  let score: number
  if (shortPctFloat > 0.20) score = -1.0
  else if (shortPctFloat > 0.10) score = -0.5
  else if (shortPctFloat < 0.03) score = 0.3
  else score = 0

  return {
    score,
    rawValue: `${pct.toFixed(1)}% of float`,
  }
}

// ── Main scoring function ──

export function computeQuantSignal(input: QuantScoreInput): QuantSignal {
  // Run all factor scorers
  const rawFactors: { key: string; name: string; result: { score: number; rawValue: string } }[] = [
    { key: 'analystConsensus', name: 'Analyst Consensus', result: scoreAnalystConsensus(input.recommendationTrend) },
    { key: 'priceVsTarget', name: 'Price vs Target', result: scorePriceVsTarget(input.analystTargetRange.mean, input.analystTargetRange.currentPrice) },
    { key: 'insiderActivity', name: 'Insider Activity', result: scoreInsiderActivity(input.insiderTimeline) },
    { key: 'marginTrajectory', name: 'Margin Trajectory', result: scoreMarginTrajectory(input.marginTrends) },
    { key: 'revenueGrowthMomentum', name: 'Revenue Momentum', result: scoreRevenueGrowthMomentum(input.revenueVsCogs) },
    { key: 'earningsGrowthMomentum', name: 'Earnings Momentum', result: scoreEarningsGrowthMomentum(input.epsHistory) },
    { key: 'fcfYield', name: 'FCF Yield', result: scoreFCFYield(input.latestFCF, input.marketCapRaw) },
    { key: 'relativeValuation', name: 'Relative Valuation', result: scoreRelativeValuation(input.forwardPE, input.currentPE) },
    { key: 'shortInterest', name: 'Short Interest', result: scoreShortInterest(input.shortPercentOfFloat) },
  ]

  // Separate active from skipped
  const active = rawFactors.filter(f => !isNaN(f.result.score))
  const skippedFactors = rawFactors.filter(f => isNaN(f.result.score)).map(f => f.name)

  // If no factors have data, return neutral default
  if (active.length === 0) {
    return {
      score: 50,
      verdict: 'HOLD',
      factors: [],
      skippedFactors: rawFactors.map(f => f.name),
    }
  }

  // Redistribute weights proportionally across active factors
  const totalActiveWeight = active.reduce((sum, f) => sum + QUANT_WEIGHTS[f.key], 0)

  let weightedSum = 0
  const factors: QuantSignal['factors'] = []

  for (const f of active) {
    const effectiveWeight = QUANT_WEIGHTS[f.key] / totalActiveWeight
    const contribution = f.result.score * effectiveWeight
    weightedSum += contribution

    factors.push({
      name: f.name,
      rawValue: f.result.rawValue,
      score: parseFloat(f.result.score.toFixed(2)),
      weight: parseFloat(effectiveWeight.toFixed(3)),
      contribution: parseFloat(contribution.toFixed(4)),
    })
  }

  // Normalize [-1, +1] → [0, 100]
  const score = Math.round(clamp((weightedSum + 1) / 2 * 100, 0, 100))

  let verdict: QuantSignal['verdict']
  if (score >= VERDICT_THRESHOLDS.BUY) verdict = 'BUY'
  else if (score >= VERDICT_THRESHOLDS.HOLD) verdict = 'HOLD'
  else if (score >= VERDICT_THRESHOLDS.SELL) verdict = 'SELL'
  else verdict = 'AVOID'

  return { score, verdict, factors, skippedFactors }
}

// ── Format for prompt injection ──

export function formatQuantSignal(signal: QuantSignal): string {
  const lines = [
    `Score: ${signal.score}/100 (${signal.verdict})`,
    'Factor breakdown:',
    ...signal.factors.map(f =>
      `- ${f.name}: ${f.score >= 0 ? '+' : ''}${f.score.toFixed(2)} (weight ${f.weight.toFixed(2)}, contribution ${f.contribution >= 0 ? '+' : ''}${f.contribution.toFixed(3)}) — ${f.rawValue}`
    ),
  ]
  if (signal.skippedFactors.length > 0) {
    lines.push(`Skipped factors: ${signal.skippedFactors.join(', ')} (data unavailable)`)
  }
  return lines.join('\n')
}
