import { useMemo, useState } from 'react'
import { useSnapshot } from '../lib/useSnapshot'
import { Loading, ErrorBox } from '../components/States'
import {
  ROLE_LABELS,
  squadScore,
  leagueAverageScore,
  fmt,
  fmtSigned,
} from '../lib/squad'
import type { PlayerRow, Role } from '../types'

// Pitch lines, top (attack) to bottom (keeper) — a 4-3-3 across our buckets.
const FORMATION_LINES: Role[][] = [
  ['W', 'ST', 'W'],
  ['CM', 'DM', 'CM'],
  ['FB', 'CB', 'CB', 'FB'],
  ['GK'],
]

interface Slot {
  id: string
  role: Role
}

const SLOTS: Slot[] = FORMATION_LINES.flatMap((line, li) =>
  line.map((role, pi) => ({ id: `${li}-${pi}`, role })),
)

export function SquadBuilder() {
  const { data, loading, error } = useSnapshot()
  const [picks, setPicks] = useState<Record<string, PlayerRow | null>>({})
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null)

  const leagueAvg = useMemo(
    () =>
      data ? leagueAverageScore(data.teams.map((t) => t.squad_score)) : 0,
    [data],
  )

  if (loading) return <Loading />
  if (error || !data) return <ErrorBox message={error || 'No data'} />

  const chosen = SLOTS.map((s) => picks[s.id]).filter(
    (p): p is PlayerRow => !!p,
  )
  const score = squadScore(chosen)
  const filled = chosen.length
  const delta = score === null ? null : score - leagueAvg
  const usedPlayers = new Set(chosen.map((p) => p.player))

  function pick(player: PlayerRow) {
    if (activeSlot) setPicks((prev) => ({ ...prev, [activeSlot.id]: player }))
    setActiveSlot(null)
  }

  function clearSlot(id: string) {
    setPicks((prev) => ({ ...prev, [id]: null }))
  }

  function fillBestXI() {
    const next: Record<string, PlayerRow | null> = {}
    const used = new Set<string>()
    for (const s of SLOTS) {
      const best = data!.players
        .filter((p) => p.role === s.role && !used.has(p.player))
        .sort((a, b) => b.adj_player_score - a.adj_player_score)[0]
      if (best) {
        next[s.id] = best
        used.add(best.player)
      }
    }
    setPicks(next)
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Squad Builder
          </h1>
          <p className="mt-1 text-sm text-fair">
            Assemble an XI. Squad score is the minutes-weighted mean of adjusted
            player scores — exactly how the model aggregates a real squad.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fillBestXI}
            className="rounded-lg bg-pitch-500 px-3 py-1.5 text-sm font-semibold text-pitch-900 hover:bg-pitch-400"
          >
            Auto: Best XI
          </button>
          <button
            onClick={() => setPicks({})}
            className="rounded-lg border border-pitch-600/50 px-3 py-1.5 text-sm font-medium text-fair hover:text-chalk"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Pitch */}
        <div className="card relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute inset-4 rounded-lg border-2 border-pitch-line/60" />
            <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-pitch-line/60" />
            <div className="absolute left-4 right-4 top-1/2 h-0 -translate-y-1/2 border-t-2 border-pitch-line/60" />
          </div>

          <div className="relative flex flex-col gap-6 py-2">
            {FORMATION_LINES.map((line, li) => (
              <div key={li} className="flex justify-center gap-4">
                {line.map((role, pi) => {
                  const id = `${li}-${pi}`
                  const player = picks[id]
                  return (
                    <PitchSlot
                      key={id}
                      role={role}
                      player={player}
                      onClick={() => setActiveSlot({ id, role })}
                      onClear={() => clearSlot(id)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <div className="card p-5 text-center">
            <div className="text-[10px] uppercase tracking-widest text-fair">
              Live squad score
            </div>
            <div className="mt-1 stat-num text-5xl font-extrabold text-pitch-400">
              {score === null ? '—' : fmt(score)}
            </div>
            <div className="mt-1 text-xs text-fair">
              {filled}/11 selected
            </div>
            {delta !== null && (
              <div
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                  delta >= 0
                    ? 'bg-buy/15 text-buy'
                    : 'bg-fade/15 text-fade'
                }`}
              >
                {fmtSigned(delta)} vs league avg
              </div>
            )}
          </div>

          <div className="card p-4">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-fair">
              Selected XI
            </div>
            <ul className="space-y-1 text-sm">
              {SLOTS.map((s) => {
                const p = picks[s.id]
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-fair w-8 shrink-0 text-xs font-mono">
                      {s.role}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {p ? p.player : <span className="text-fair/50">—</span>}
                    </span>
                    <span className="stat-num text-xs text-pitch-400">
                      {p ? fmtSigned(p.adj_player_score) : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      {activeSlot && (
        <PlayerPicker
          role={activeSlot.role}
          players={data.players}
          used={usedPlayers}
          onPick={pick}
          onClose={() => setActiveSlot(null)}
        />
      )}
    </div>
  )
}

function PitchSlot({
  role,
  player,
  onClick,
  onClear,
}: {
  role: Role
  player: PlayerRow | null | undefined
  onClick: () => void
  onClear: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex h-20 w-24 flex-col items-center justify-center rounded-xl border text-center transition-all ${
        player
          ? 'border-pitch-500/60 bg-pitch-600/40 hover:bg-pitch-600/60'
          : 'border-dashed border-pitch-600/50 bg-pitch-800/40 hover:border-pitch-500'
      }`}
    >
      <span className="absolute left-1.5 top-1 text-[9px] font-bold text-pitch-400">
        {role}
      </span>
      {player ? (
        <>
          <span className="px-1 text-[11px] font-semibold leading-tight line-clamp-2">
            {player.player}
          </span>
          <span className="stat-num mt-0.5 text-xs font-bold text-pitch-400">
            {fmtSigned(player.adj_player_score)}
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            className="absolute right-1 top-0.5 hidden text-fair hover:text-fade group-hover:block"
          >
            ×
          </span>
        </>
      ) : (
        <span className="text-xs text-fair">+ add</span>
      )}
    </button>
  )
}

function PlayerPicker({
  role,
  players,
  used,
  onPick,
  onClose,
}: {
  role: Role
  players: PlayerRow[]
  used: Set<string>
  onPick: (p: PlayerRow) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const ql = q.toLowerCase()
    return players
      .filter((p) => p.role === role)
      .filter((p) => !ql || p.player.toLowerCase().includes(ql) || p.team.toLowerCase().includes(ql))
      .sort((a, b) => b.adj_player_score - a.adj_player_score)
      .slice(0, 80)
  }, [players, role, q])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-16 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-pitch-700/60 px-4 py-3">
          <div className="font-bold">
            Pick a <span className="text-pitch-400">{ROLE_LABELS[role]}</span>
          </div>
          <button
            onClick={onClose}
            className="text-fair hover:text-chalk"
          >
            ✕
          </button>
        </div>
        <div className="border-b border-pitch-700/60 p-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search player or team…"
            className="w-full rounded-lg border border-pitch-600/50 bg-pitch-900 px-3 py-2 text-sm outline-none focus:border-pitch-500"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto">
          {list.map((p) => {
            const taken = used.has(p.player)
            return (
              <li key={`${p.player}-${p.season}`}>
                <button
                  disabled={taken}
                  onClick={() => onPick(p)}
                  className={`flex w-full items-center justify-between gap-3 border-b border-pitch-800/70 px-4 py-2.5 text-left text-sm transition-colors ${
                    taken
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:bg-pitch-700/40'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.player}</div>
                    <div className="text-xs text-fair">
                      {p.team} · {p.season} · {Math.round(p.minutes)}′
                    </div>
                  </div>
                  <div className="stat-num shrink-0 font-bold text-pitch-400">
                    {fmtSigned(p.adj_player_score)}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
