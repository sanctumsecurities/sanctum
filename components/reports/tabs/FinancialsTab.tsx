'use client'

import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid,
  LineChart, ResponsiveContainer, Tooltip,
} from 'recharts'
import { SectionTitle, DataTable, MetricCard, CTooltip, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

export default function FinancialsTab({ financials }: { financials: StockReport['financials'] }) {
  const data = financials.annualData || []

  return (
    <div>
      {financials.narrativeSummary && (
        <div style={{ marginBottom: 32 }}>
          {financials.narrativeSummary.split('\n\n').map((p, i) => (
            <p key={i} style={{
              fontSize: 14, color: '#b8c4d4', lineHeight: 1.8,
              fontFamily: "'DM Sans', sans-serif", margin: '0 0 16px',
            }}>{p}</p>
          ))}
        </div>
      )}

      {financials.revenueVsCogs?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Revenue vs Cost of Revenue</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={financials.revenueVsCogs}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}B`} />
                <Tooltip content={<CTooltip />} />
                <Bar dataKey="revenue" name="Revenue ($B)" fill="rgba(96,165,250,0.6)" radius={[5, 5, 0, 0]} />
                <Line type="monotone" dataKey="cogs" name="COGS ($B)" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: '#f59e0b', r: 4, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="grossProfit" name="Gross Profit ($B)" fill="rgba(74,222,128,0.08)" stroke="#4ade80" strokeWidth={1.5} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9632; Revenue</span>
              <span style={{ fontSize: 11, color: '#f59e0b' }}>&#9679; COGS</span>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9650; Gross Profit</span>
            </div>
            <p style={{ fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '4px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
              Gap between revenue and COGS shows gross profit margin health over time.
            </p>
          </div>
        </div>
      )}

      {financials.marginTrends?.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Margin Trends</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={financials.marginTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                <Tooltip content={<CTooltip />} />
                <Line type="monotone" dataKey="gross" name="Gross Margin %" stroke="#4ade80" strokeWidth={2} dot={{ fill: '#4ade80', r: 3, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="operating" name="Operating Margin %" stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 3, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="net" name="Net Margin %" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9679; Gross</span>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9679; Operating</span>
              <span style={{ fontSize: 11, color: '#a78bfa' }}>&#9679; Net</span>
            </div>
            <p style={{ fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '4px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
              Expanding margins signal improving efficiency; compressing margins flag rising costs or pricing pressure.
            </p>
          </div>
        </div>
      )}

      {data.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Revenue &amp; EPS</SectionTitle>
          <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: '#5a6475', fontSize: 12 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  yAxisId="revenue"
                  tick={{ fill: '#5a6475', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `$${v}B`}
                />
                <YAxis
                  yAxisId="eps"
                  orientation="right"
                  tick={{ fill: '#5a6475', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <Tooltip content={<CTooltip />} />
                <Bar yAxisId="revenue" dataKey="revenue" name="Revenue ($B)" fill="rgba(96,165,250,0.6)" radius={[5, 5, 0, 0]} />
                <Line yAxisId="eps" type="monotone" dataKey="adjEPS" name="Adj EPS" stroke="#4ade80" strokeWidth={2.5} dot={{ fill: '#4ade80', r: 4, strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#60a5fa' }}>&#9632; Revenue</span>
              <span style={{ fontSize: 11, color: '#4ade80' }}>&#9679; Adj EPS</span>
            </div>
          </div>
        </div>
      )}

      {data.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionTitle>Annual Financial Data</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Year', 'Revenue', 'Growth', 'Gross Margin', 'Op Margin', 'Adj EPS', 'EPS Growth', 'FCF']}
              rows={data.map(d => [
                d.year,
                `$${d.revenue}B`,
                d.revenueGrowth,
                d.grossMargin || 'N/A',
                d.operatingMargin || 'N/A',
                `$${typeof d.adjEPS === 'number' ? d.adjEPS.toFixed(2) : d.adjEPS}`,
                d.epsGrowth,
                d.fcf || 'N/A',
              ])}
              numericCols={[1, 2, 3, 4, 5, 6, 7]}
            />
          </div>

          {financials.cagrs && (
            <div style={{
              display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12,
              padding: '12px 16px', borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
            }}>
              {[
                { label: 'Revenue CAGR', five: financials.cagrs.revenue.fiveYear, ten: financials.cagrs.revenue.tenYear },
                { label: 'Net Income CAGR', five: financials.cagrs.netIncome.fiveYear, ten: financials.cagrs.netIncome.tenYear },
                { label: 'EPS CAGR', five: financials.cagrs.eps.fiveYear, ten: financials.cagrs.eps.tenYear },
              ].map((c, i) => (
                <div key={i} style={{ minWidth: 140 }}>
                  <div style={{
                    fontSize: 10, letterSpacing: 1.2, color: '#5a6475',
                    textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif", marginBottom: 4,
                  }}>{c.label}</div>
                  <span style={{
                    fontSize: 14, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: c.five?.startsWith('+') ? '#4ade80' : c.five?.startsWith('-') ? '#f87171' : '#e8ecf1',
                  }}>5yr: {c.five || 'N/A'}</span>
                  {c.ten && (
                    <span style={{
                      fontSize: 12, color: '#5a6475', marginLeft: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>10yr: {c.ten}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {financials.callout && (
        <div style={{
          ...glassCard,
          borderLeft: '3px solid #f87171',
          padding: '16px 20px',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#f87171',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em', marginBottom: 8,
            textTransform: 'uppercase',
          }}>Key Financial Insight</div>
          <p style={{
            fontSize: 13, color: '#b8c4d4', lineHeight: 1.7,
            fontFamily: "'DM Sans', sans-serif", margin: 0,
          }}>{financials.callout}</p>
        </div>
      )}

      {financials.dividendData && (
        <div style={{ marginTop: 32 }}>
          <SectionTitle>Dividend Analysis</SectionTitle>
          <div style={{
            display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20,
          }}>
            {[
              { label: 'Yield', value: financials.dividendData.currentYield },
              { label: 'Payout Ratio', value: financials.dividendData.payoutRatio },
              { label: '5yr CAGR', value: financials.dividendData.fiveYearCagr },
              ...(financials.dividendData.tenYearCagr ? [{ label: '10yr CAGR', value: financials.dividendData.tenYearCagr }] : []),
              ...(financials.dividendData.consecutiveYearsGrowth != null ? [{ label: 'Consec. Years Growth', value: String(financials.dividendData.consecutiveYearsGrowth) }] : []),
            ].map((m, i) => (
              <MetricCard key={i} label={m.label} value={m.value} />
            ))}
          </div>

          {financials.dividendData.fcfVsDividends?.length > 0 && (
            <div style={{ ...glassCard, padding: '16px 8px 10px' }}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={financials.dividendData.fcfVsDividends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="year" tick={{ fill: '#5a6475', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#5a6475', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(0)}B`} />
                  <Tooltip content={<CTooltip />} />
                  <Bar dataKey="fcf" name="Free Cash Flow ($B)" fill="rgba(74,222,128,0.6)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="dividendsPaid" name="Dividends Paid ($B)" fill="rgba(248,113,113,0.6)" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', paddingBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#4ade80' }}>&#9632; Free Cash Flow</span>
                <span style={{ fontSize: 11, color: '#f87171' }}>&#9632; Dividends Paid</span>
              </div>
              <p style={{ fontSize: 11, color: '#5a6475', textAlign: 'center', margin: '4px 0 0', fontFamily: "'DM Sans', sans-serif" }}>
                FCF exceeding dividends indicates sustainable payout. Red bars approaching green signal dividend risk.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
