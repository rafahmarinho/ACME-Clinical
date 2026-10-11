import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtTime, PARAM_META } from '../../lib/format'
import type { Parameter, ReadingPoint, Threshold } from '../../types'

interface Props {
  points: ReadingPoint[]
  parameters: Parameter[]
  thresholds?: Threshold[]
  height?: number
  domain?: [number | 'auto', number | 'auto']
}

export function TrendChart({ points, parameters, thresholds, height = 220, domain = ['auto', 'auto'] }: Props) {
  const single = parameters.length === 1 ? thresholds?.find((t) => t.parameter === parameters[0]) : undefined
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke="#e8edf3" vertical={false} />
        <XAxis dataKey="t" tickFormatter={(v) => fmtTime(v)} tick={{ fontSize: 11, fill: '#5b6b82' }} minTickGap={40} axisLine={{ stroke: '#dce3ec' }} tickLine={false} />
        <YAxis domain={domain} tick={{ fontSize: 11, fill: '#5b6b82' }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
        {single?.warn_low != null && <ReferenceArea y1={single.crit_low ?? single.warn_low - 10} y2={single.warn_low} fill="#fef3f2" fillOpacity={0.9} ifOverflow="hidden" />}
        {single?.warn_high != null && <ReferenceArea y1={single.warn_high} y2={single.crit_high ?? single.warn_high + 20} fill="#fef3f2" fillOpacity={0.9} ifOverflow="hidden" />}
        <Tooltip
          labelFormatter={(v) => fmtTime(String(v))}
          formatter={(value, name) => [`${value} ${PARAM_META[name as Parameter]?.unit ?? ''}`, PARAM_META[name as Parameter]?.short ?? name]}
          contentStyle={{ borderRadius: 10, border: '1px solid #dce3ec', fontSize: 12 }}
        />
        {parameters.length > 1 && <Legend formatter={(v) => PARAM_META[v as Parameter]?.short ?? v} wrapperStyle={{ fontSize: 12 }} />}
        {parameters.map((p) => (
          <Line key={p} dataKey={p} stroke={PARAM_META[p].color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
