import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { useSnapshot } from '../lib/useSnapshot'
import { Loading, ErrorBox } from '../components/States'
import { classifySignal } from '../types'

const BARS = ['#6b7280', '#22c55e', '#4ade80']
const tooltipStyle = {
  background: '#0e2a1b',
  border: '1px solid #1a5638',
  borderRadius: 8,
  fontSize: 12,
}

export function Backtest() {
  const { data, loading, error } = useSnapshot()

  const scatter = useMemo(() => {
    if (!data) return []
    return data.teams.map((t) => ({
      x: t.squad_score,
      y: t.points,
      kind: classifySignal(t.signal),
      team: t.team,
      season: t.season,
    }))
  }, [data])

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No data'} />

  const models = data.backtest.models
  const best = models.reduce((a, b) => (b.mean_r2 > a.mean_r2 ? b : a))

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight">Backtest</h1>
        <p className="mt-1 max-w-3xl text-sm text-fair">{data.backtest.note}</p>
      </div>

      <div className="mb-4 card border-pitch-500/30 bg-pitch-600/15 p-4 text-sm">
        Best predictor of next-season points:{' '}
        <span className="font-bold text-pitch-400">{best.label}</span> (R² ={' '}
        <span className="stat-num">{best.mean_r2.toFixed(3)}</span>). The squad
        model {models.find((m) => m.key === 'B_squad')!.mean_r2 >=
        models.find((m) => m.key === 'A_points')!.mean_r2
          ? 'beats'
          : 'trails'}{' '}
        the raw-points baseline — leave-one-season-out.
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="R² — higher is better" subtitle="Out-of-sample fit">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={models} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#13402a" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                interval={0}
              />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: '#f4f7f5' }}
                cursor={{ fill: 'rgba(34,197,94,0.08)' }}
                formatter={(v) => [Number(v).toFixed(3), 'mean R²']}
              />
              <Bar dataKey="mean_r2" radius={[6, 6, 0, 0]}>
                {models.map((_, i) => (
                  <Cell key={i} fill={BARS[i % BARS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="MAE — lower is better" subtitle="Mean absolute error (pts)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={models} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#13402a" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                interval={0}
              />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: '#f4f7f5' }}
                cursor={{ fill: 'rgba(34,197,94,0.08)' }}
                formatter={(v) => [Number(v).toFixed(2), 'mean MAE']}
              />
              <Bar dataKey="mean_mae" radius={[6, 6, 0, 0]}>
                {models.map((_, i) => (
                  <Cell key={i} fill={BARS[i % BARS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Squad score vs points"
        subtitle="The inefficiency: teams below the cloud (green) outperform their results → buy; above (red) → fade"
        className="mt-6"
      >
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#13402a" />
            <XAxis
              type="number"
              dataKey="x"
              name="Squad score"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              label={{
                value: 'Squad score',
                position: 'insideBottom',
                offset: -4,
                fill: '#9ca3af',
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Points"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              label={{
                value: 'Points',
                angle: -90,
                position: 'insideLeft',
                fill: '#9ca3af',
                fontSize: 11,
              }}
            />
            <ZAxis range={[40, 40]} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: '#f4f7f5' }}
              cursor={{ strokeDasharray: '3 3', stroke: '#22c55e' }}
              content={({ payload }) => {
                if (!payload || !payload.length) return null
                const d = payload[0].payload as {
                  team: string
                  season: string
                  x: number
                  y: number
                }
                return (
                  <div style={tooltipStyle as any} className="px-2.5 py-1.5">
                    <div className="font-semibold text-chalk">
                      {d.team} · {d.season}
                    </div>
                    <div className="text-fair">
                      squad {d.x.toFixed(2)} · {d.y.toFixed(0)} pts
                    </div>
                  </div>
                )
              }}
            />
            <Scatter data={scatter}>
              {scatter.map((d, i) => (
                <Cell
                  key={i}
                  fill={
                    d.kind === 'buy'
                      ? '#22c55e'
                      : d.kind === 'fade'
                        ? '#ef4444'
                        : '#9ca3af'
                  }
                  fillOpacity={0.75}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

function ChartCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="mb-3">
        <h2 className="font-bold">{title}</h2>
        {subtitle && <p className="text-xs text-fair">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
