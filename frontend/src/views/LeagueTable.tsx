import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSnapshot } from '../lib/useSnapshot'
import { Loading, ErrorBox } from '../components/States'
import { SignalBadge } from '../components/SignalBadge'
import { fmt, fmtSigned } from '../lib/squad'
import { classifySignal } from '../types'
import type { TeamRow } from '../types'

type SortKey =
  | 'team'
  | 'squad_score'
  | 'points'
  | 'expected_points'
  | 'residual'
type Dir = 'asc' | 'desc'

const COLS: { key: SortKey; label: string; num?: boolean; help: string }[] = [
  { key: 'team', label: 'Team', help: 'Team name' },
  { key: 'squad_score', label: 'Squad', num: true, help: 'Model squad-quality score (minutes-weighted)' },
  { key: 'points', label: 'Pts', num: true, help: 'Actual league points' },
  { key: 'expected_points', label: 'xPts', num: true, help: 'Points the model expects from squad quality' },
  { key: 'residual', label: 'Δ', num: true, help: 'Actual − expected. Negative = underperforming (buy)' },
]

export function LeagueTable() {
  const { data, loading, error } = useSnapshot()
  const navigate = useNavigate()
  const [season, setSeason] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('squad_score')
  const [dir, setDir] = useState<Dir>('desc')

  const seasons = useMemo(
    () => (data ? [...new Set(data.teams.map((t) => t.season))].sort() : []),
    [data],
  )
  const activeSeason = season || seasons[seasons.length - 1] || ''

  const rows = useMemo(() => {
    if (!data) return []
    const filtered = data.teams.filter((t) => t.season === activeSeason)
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
      return dir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [data, activeSeason, sortKey, dir])

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No data'} />

  const counts = rows.reduce(
    (acc, r) => {
      acc[classifySignal(r.signal)]++
      return acc
    },
    { buy: 0, fade: 0, fair: 0 } as Record<string, number>,
  )

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDir(dir === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setDir(key === 'team' ? 'asc' : 'desc')
    }
  }

  function openTeam(t: TeamRow) {
    navigate(
      `/team/${encodeURIComponent(t.league)}/${encodeURIComponent(
        t.season,
      )}/${encodeURIComponent(t.team)}`,
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">League Table</h1>
          <p className="mt-1 text-sm text-fair">
            Squad quality vs results. Underperformers (squad &gt; points) are{' '}
            <span className="text-buy font-semibold">buys</span>; overperformers
            are <span className="text-fade font-semibold">fades</span>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs">
            <span className="pill bg-buy/15 text-buy border border-buy/30">
              {counts.buy} buy
            </span>
            <span className="pill bg-fade/15 text-fade border border-fade/30">
              {counts.fade} fade
            </span>
          </div>
          <select
            value={activeSeason}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded-lg border border-pitch-600/50 bg-pitch-800 px-3 py-1.5 text-sm font-medium outline-none focus:border-pitch-500"
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                Season {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-pitch-700/60 text-left text-xs uppercase tracking-wider text-fair">
              <th className="px-4 py-3 font-semibold">#</th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  title={c.help}
                  onClick={() => toggleSort(c.key)}
                  className={`cursor-pointer select-none px-4 py-3 font-semibold hover:text-chalk ${
                    c.num ? 'text-right' : 'text-left'
                  }`}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="ml-1 text-pitch-500">
                      {dir === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold">Signal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const kind = classifySignal(t.signal)
              const accent =
                kind === 'buy'
                  ? 'border-l-buy'
                  : kind === 'fade'
                    ? 'border-l-fade'
                    : 'border-l-transparent'
              return (
                <tr
                  key={t.team}
                  onClick={() => openTeam(t)}
                  className={`group cursor-pointer border-l-2 ${accent} border-b border-pitch-800/80 transition-colors hover:bg-pitch-700/30`}
                >
                  <td className="px-4 py-3 text-fair stat-num">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold group-hover:text-pitch-400">
                    {t.team}
                  </td>
                  <td className="px-4 py-3 text-right stat-num">
                    {fmt(t.squad_score)}
                  </td>
                  <td className="px-4 py-3 text-right stat-num font-semibold">
                    {fmt(t.points, 0)}
                  </td>
                  <td className="px-4 py-3 text-right stat-num text-fair">
                    {fmt(t.expected_points, 0)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right stat-num font-semibold ${
                      t.residual < 0 ? 'text-buy' : t.residual > 0 ? 'text-fade' : 'text-fair'
                    }`}
                  >
                    {fmtSigned(t.residual, 1)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SignalBadge signal={t.signal} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-fair/70">
        Click any row to open the team’s roster and per-player metric profiles.
      </p>
    </div>
  )
}
