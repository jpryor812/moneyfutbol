import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { PlayerRow, Role, Meta } from '../types'

// Shorten canonical metric names for axis labels.
function shortLabel(metric: string): string {
  return metric
    .replace(/_per90$/, '')
    .replace(/_per100$/, '')
    .replace(/_pct$/, '%')
    .replace(/plus_minus/, '+/-')
    .replace(/plus/, '+')
    .replace(/_/g, ' ')
}

// Map a z-score to a 0..100 visual scale (z=0 -> 50). Clamped for display only;
// the true z-score is shown in the tooltip.
function toScale(z: number): number {
  return Math.max(0, Math.min(100, 50 + z * 18))
}

interface Props {
  player: PlayerRow
  meta: Meta
  height?: number
}

export function PlayerRadar({ player, meta, height = 220 }: Props) {
  const role = player.role as Role
  const weights = meta.framework[role] || {}
  const metrics = Object.keys(weights)

  const data = metrics.map((m) => {
    const z = Number(player[`z_${m}`] ?? 0)
    return {
      metric: shortLabel(m),
      value: toScale(z),
      z,
      weight: weights[m],
    }
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#1f5f3f" />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fill: '#9ca3af', fontSize: 10 }}
        />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="value"
          stroke="#22c55e"
          fill="#22c55e"
          fillOpacity={0.35}
        />
        <Tooltip
          contentStyle={{
            background: '#0e2a1b',
            border: '1px solid #1a5638',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: '#f4f7f5' }}
          formatter={(_v, _n, p) => {
            const z = (p?.payload as { z: number }).z
            const w = (p?.payload as { weight: number }).weight
            return [`z = ${z.toFixed(2)}  (w ${w})`, 'vs peers']
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
