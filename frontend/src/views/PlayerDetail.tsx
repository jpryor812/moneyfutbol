import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loading, ErrorBox } from '../components/States'
import { PlayerStatsTable } from '../components/PlayerStatsTable'
import { seasonLabel } from '../lib/csv'
import { playerNameFromSlug } from '../lib/playerRoute'
import { useForwardsCsv } from '../lib/useForwardsCsv'

export function PlayerDetail() {
  const { playerSlug } = useParams()
  const { rows, columns, loading, error } = useForwardsCsv()
  const playerName = playerNameFromSlug(playerSlug)

  const playerRows = useMemo(
    () => (playerName ? rows.filter((r) => r.player === playerName) : []),
    [rows, playerName],
  )

  if (loading) return <Loading label="Loading player history…" />
  if (error) return <ErrorBox message={error} />
  if (!playerName) return <ErrorBox message="Invalid player link." />
  if (playerRows.length === 0) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorBox message={`No rows found for "${playerName}".`} />
      </div>
    )
  }

  const teams = [...new Set(playerRows.map((r) => r.team).filter(Boolean))]
  const seasons = playerRows
    .map((r) => r.season_end_year)
    .filter(Boolean)
    .sort()

  return (
    <div className="space-y-4">
      <BackLink />

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{playerName}</h1>
        <p className="mt-1 text-sm text-fair">
          {playerRows.length} season{playerRows.length === 1 ? '' : 's'}
          {seasons.length
            ? ` · ${seasonLabel(seasons[0])} – ${seasonLabel(seasons[seasons.length - 1])}`
            : ''}
          {teams.length ? ` · ${teams.join(', ')}` : ''}
        </p>
      </div>

      <PlayerStatsTable
        rows={playerRows}
        columns={columns}
        defaultSortCol="season_end_year"
        defaultSortDir="asc"
        hideColumns={['player']}
      />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1 text-sm text-pitch-400 hover:text-pitch-300"
    >
      ← All players
    </Link>
  )
}
