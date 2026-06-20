// Squad-builder math, faithful to backend/squad_model.aggregate_to_squad():
// squad score = minutes-weighted mean of adjusted player scores.
import type { PlayerRow, Role } from '../types'

export const ROLE_ORDER: Role[] = ['GK', 'CB', 'FB', 'DM', 'CM', 'W', 'ST']

export const ROLE_LABELS: Record<Role, string> = {
  GK: 'Goalkeeper',
  CB: 'Centre-back',
  FB: 'Full-back',
  DM: 'Defensive mid',
  CM: 'Central mid',
  W: 'Winger',
  ST: 'Striker',
}

// A sensible default XI shape (4-3-3-ish across our 7 buckets).
export const DEFAULT_FORMATION: Role[] = [
  'GK',
  'CB',
  'CB',
  'FB',
  'FB',
  'DM',
  'CM',
  'CM',
  'W',
  'W',
  'ST',
]

/** Minutes-weighted mean of adj_player_score — matches aggregate_to_squad(). */
export function squadScore(players: PlayerRow[]): number | null {
  const valid = players.filter((p) => p && p.minutes > 0)
  if (valid.length === 0) return null
  const totalMin = valid.reduce((s, p) => s + p.minutes, 0)
  if (totalMin <= 0) return null
  const weighted = valid.reduce(
    (s, p) => s + p.adj_player_score * p.minutes,
    0,
  )
  return weighted / totalMin
}

/** Average squad score across all team-seasons — a reference baseline. */
export function leagueAverageScore(squadScores: number[]): number {
  if (!squadScores.length) return 0
  return squadScores.reduce((s, v) => s + v, 0) / squadScores.length
}

export function fmt(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

export function fmtSigned(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(digits)
}
