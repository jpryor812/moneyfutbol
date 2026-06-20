// Types mirror the JSON produced by backend/export_snapshot.py

export type Role = 'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'W' | 'ST'

export interface TeamRow {
  league: string
  season: string
  team: string
  squad_score: number
  points: number
  expected_points: number
  residual: number
  signal: string // "OUTPERFORMER (buy)" | "regression risk (fade)" | "fair"
}

// One player-team-season row. Metric + z_metric keys are dynamic, so we index
// them via a string signature on top of the known fields.
export interface PlayerRow {
  player: string
  team: string
  league: string
  season: string
  position: string
  role: Role
  minutes: number
  player_score: number
  league_mult: number
  adj_player_score: number
  qualifies: boolean
  [metric: string]: string | number | boolean
}

export interface BacktestModel {
  key: string
  label: string
  mean_r2: number
  mean_mae: number
}

export interface BacktestData {
  min_minutes: number
  models: BacktestModel[]
  note: string
}

export interface ProjectionRow {
  league: string
  team: string
  points: number
  squad_score: number
  projected_points_next: number
  from_season: string
}

export interface Meta {
  min_minutes: number
  roles: Role[]
  framework: Record<Role, Record<string, number>>
  league_strength: Record<string, number>
  metric_cols: string[]
  seasons: string[]
  latest_season: string
  leagues: string[]
}

export type Signal = 'buy' | 'fade' | 'fair'

export function classifySignal(signal: string): Signal {
  if (signal.includes('buy')) return 'buy'
  if (signal.includes('fade')) return 'fade'
  return 'fair'
}
