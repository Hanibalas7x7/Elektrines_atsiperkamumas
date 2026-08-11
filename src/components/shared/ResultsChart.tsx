import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CashFlowResult } from '../../lib/calculations/types'
import { formatEuro } from '../../lib/format'

interface ResultsChartProps {
  result: CashFlowResult
  title: string
  cumulativeLabel: string
  netLabel: string
}

export function ResultsChart({ result, title, cumulativeLabel, netLabel }: ResultsChartProps) {
  const data = result.rows.map((row) => ({
    year: row.year,
    cumulative: Math.round(row.cumulativeSavings),
    net: Math.round(row.netCashFlow),
  }))

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-slate-700">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis width={70} />
          <Tooltip
            formatter={(value) => formatEuro(Number(value))}
            wrapperStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px' }}
            contentStyle={{ background: '#fff', border: 'none', borderRadius: '6px' }}
          />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Line type="monotone" dataKey="cumulative" name={cumulativeLabel} stroke="#0ea5e9" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="net" name={netLabel} stroke="#16a34a" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
