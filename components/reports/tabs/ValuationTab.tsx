import { SectionTitle, DataTable, glassCard } from '../ReportUI'
import type { StockReport } from '@/types/report'

export default function ValuationTab({ valuation }: { valuation: StockReport['valuation'] }) {
  return (
    <div>
      {valuation.bullCase && (
        <div style={{
          ...glassCard,
          borderLeft: '3px solid #4ade80',
          padding: '16px 20px', marginBottom: 16,
        }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#4ade80',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em', marginBottom: 8,
            textTransform: 'uppercase',
          }}>Bull Case</div>
          <p style={{
            fontSize: 13, color: '#b8c4d4', lineHeight: 1.7,
            fontFamily: "'DM Sans', sans-serif", margin: 0,
          }}>{valuation.bullCase}</p>
        </div>
      )}

      {valuation.bearCase && (
        <div style={{
          ...glassCard,
          borderLeft: '3px solid #f87171',
          padding: '16px 20px', marginBottom: 32,
        }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#f87171',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.05em', marginBottom: 8,
            textTransform: 'uppercase',
          }}>Bear Case</div>
          <p style={{
            fontSize: 13, color: '#b8c4d4', lineHeight: 1.7,
            fontFamily: "'DM Sans', sans-serif", margin: 0,
          }}>{valuation.bearCase}</p>
        </div>
      )}

      {valuation.metrics?.length > 0 && (
        <div>
          <SectionTitle>Valuation Metrics</SectionTitle>
          <div style={{ ...glassCard, padding: '4px 0', overflow: 'hidden' }}>
            <DataTable
              headers={['Metric', 'Current', '5-Year Avg', 'Commentary']}
              rows={valuation.metrics.map(m => [m.metric, m.current, m.fiveYearAvg, m.commentary])}
              numericCols={[1, 2]}
            />
          </div>
        </div>
      )}
    </div>
  )
}
