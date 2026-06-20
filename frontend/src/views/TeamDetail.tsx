import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSnapshot } from '../lib/useSnapshot'
import { Loading, ErrorBox } from '../components/States'
import { SignalBadge } from '../components/SignalBadge'
import { PlayerRadar } from '../components/PlayerRadar'
import { ROLE_ORDER, ROLE_LABELS, fmt, fmtSigned } from '../lib/squad'
import type { Meta, PlayerRow, Role } from '../types'

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-fair">
        {label}
      </div>
      <div className={`mt-0.5 stat-num text-xl font-bold ${tone || ''}`}>
        {value}
      </div>
    </div>
  )
}

function PlayerCard({ p, meta }: { p: PlayerRow; meta: Meta }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{p.player}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-fair">
            <span className="pill bg-pitch-700/60 text-pitch-400 border border-pitch-600/50">
              {p.role}
            </span>
            <span className="stat-num">{Math.round(p.minutes)}′</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-fair">
            score
          </div>
          <div
            className={`stat-num text-lg font-bold ${
              p.player_score >= 0 ? 'text-pitch-400' : 'text-fade'
            }`}
          >
            {fmtSigned(p.player_score)}
          </div>
        </div>
      </div>
      <div className="mt-2 border-t border-pitch-700/50 pt-1">
        <PlayerRadar player={p} meta={meta} height={190} />
      </div>
    </div>
  )
}

export function TeamDetail() {
  const { league = '', season = '', team = '' } = useParams()
  const { data, loading, error } = useSnapshot()

  const decoded = {
    league: decodeURIComponent(league),
    season: decodeURIComponent(season),
    team: decodeURIComponent(team),
  }

  const roster = useMemo(() => {
    if (!data) return []
    return data.players
      .filter(
        (p) =>
          p.team === decoded.team &&
          p.season === decoded.season &&
          p.league === decoded.league,
      )
      .sort((a, b) => b.player_score - a.player_score)
  }, [data, decoded.team, decoded.season, decoded.league])

  const teamRow = useMemo(
    () =>
      data?.teams.find(
        (t) =>
          t.team === decoded.team &&
          t.season === decoded.season &&
          t.league === decoded.league,
      ),
    [data, decoded.team, decoded.season, decoded.league],
  )

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No data'} />

  const byRole = ROLE_ORDER.map((role) => ({
    role: role as Role,
    players: roster.filter((p) => p.role === role),
  })).filter((g) => g.players.length > 0)

  return (
    <div>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-fair hover:text-pitch-400"
      >
        ← League table
      </Link>

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {decoded.team}
        </h1>
        {teamRow && <SignalBadge signal={teamRow.signal} />}
        <span className="text-sm text-fair">
          {decoded.league} · {decoded.season}
        </span>
      </div>

      {teamRow && (
        <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Squad score" value={fmt(teamRow.squad_score)} />
          <StatTile label="Points" value={fmt(teamRow.points, 0)} />
          <StatTile label="Expected" value={fmt(teamRow.expected_points, 0)} />
          <StatTile
            label="Δ residual"
            value={fmtSigned(teamRow.residual, 1)}
            tone={teamRow.residual < 0 ? 'text-buy' : 'text-fade'}
          />
        </div>
      )}

      {byRole.map((g) => (
        <section key={g.role} className="mb-7">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-pitch-400">
            {ROLE_LABELS[g.role]}
            <span className="text-fair font-normal normal-case">
              · {g.players.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.players.map((p) => (
              <PlayerCard key={p.player} p={p} meta={data.meta} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
