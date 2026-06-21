import { useMemo, useState } from 'react'
import { HoverTip } from '../components/HoverTip'
import { Loading, ErrorBox } from '../components/States'
import { PlayerStatsTable } from '../components/PlayerStatsTable'
import { FILTER_HINTS } from '../lib/tableColumns'
import { useForwardsCsv } from '../lib/useForwardsCsv'

export function ForwardsTable() {
  const { rows, columns, loading, error } = useForwardsCsv()
  const [search, setSearch] = useState('')
  const [league, setLeague] = useState('')
  const [season, setSeason] = useState('')
  const [wingerOnly, setWingerOnly] = useState(false)
  const [side, setSide] = useState('')

  const leagues = useMemo(() => {
    const s = new Set(rows.map((r) => r.league).filter(Boolean))
    return [...s].sort()
  }, [rows])

  const seasons = useMemo(() => {
    const s = new Set(rows.map((r) => r.season_end_year).filter(Boolean))
    return [...s].sort()
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (league && r.league !== league) return false
      if (season && r.season_end_year !== season) return false
      if (wingerOnly && r.likely_winger !== 'True' && r.likely_winger !== 'true') {
        return false
      }
      if (side === '__blank__' && r.side_review?.trim()) return false
      if (side && side !== '__blank__' && r.side_review?.toUpperCase() !== side) return false
      if (!q) return true
      return (
        r.player?.toLowerCase().includes(q) ||
        r.team?.toLowerCase().includes(q)
      )
    })
  }, [rows, search, league, season, wingerOnly, side])

  if (loading) return <Loading label="Loading bundesliga_forwards.csv…" />
  if (error) return <ErrorBox message={error} />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Bundesliga forwards — study panel
        </h1>
        <p className="mt-1 text-sm text-fair">
          {filtered.length} of {rows.length} rows · hover column headers or filters for
          definitions · click a player name for their full history
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-fair">
          <HoverTip text={FILTER_HINTS.search}>
            Search player / team
          </HoverTip>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Marmoush, Frankfurt"
            className="rounded-lg border border-pitch-600/60 bg-pitch-900/80 px-3 py-2 text-sm text-chalk outline-none focus:border-pitch-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fair">
          <HoverTip text={FILTER_HINTS.league}>League</HoverTip>
          <select
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            className="rounded-lg border border-pitch-600/60 bg-pitch-900/80 px-3 py-2 text-sm text-chalk"
          >
            <option value="">All</option>
            {leagues.map((s) => (
              <option key={s} value={s}>
                {s.replace('GER-', '').replace('ENG-', '').replace('ESP-', '').replace('ITA-', '').replace('FRA-', '')}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-fair">
          <HoverTip text={FILTER_HINTS.season}>Season</HoverTip>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded-lg border border-pitch-600/60 bg-pitch-900/80 px-3 py-2 text-sm text-chalk"
          >
            <option value="">All</option>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-chalk">
          <input
            type="checkbox"
            checked={wingerOnly}
            onChange={(e) => setWingerOnly(e.target.checked)}
            className="accent-pitch-500"
          />
          <HoverTip text={FILTER_HINTS.wingerOnly}>Likely winger only</HoverTip>
        </label>
        <label className="flex flex-col gap-1 text-xs text-fair">
          <HoverTip text={FILTER_HINTS.sideReview}>Side review</HoverTip>
          <select
            value={side}
            onChange={(e) => setSide(e.target.value)}
            className="rounded-lg border border-pitch-600/60 bg-pitch-900/80 px-3 py-2 text-sm text-chalk"
          >
            <option value="">All</option>
            <option value="L">L</option>
            <option value="R">R</option>
            <option value="central">central</option>
            <option value="__blank__">Not reviewed</option>
          </select>
        </label>
      </div>

      <PlayerStatsTable
        rows={filtered}
        columns={columns}
        defaultSortCol="winger_score"
        defaultSortDir="desc"
        linkPlayers
      />
    </div>
  )
}
