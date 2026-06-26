import { fmtCell, seasonLabel } from './csv'

export const PINNED = [
  'player',
  'team',
  'league',
  'season_end_year',
  'pos',
  'likely_winger',
  'side_review',
  'fc_overall',
  'fc_potential',
]

export const COLUMN_LABELS: Record<string, string> = {
  nineties: '90s',
  season_end_year: 'season',
  fc_overall: 'FC OVR',
  fc_potential: 'FC POT',
}

export const COLUMN_HINTS: Record<string, string> = {
  player: 'Player name from FBref.',
  team: 'Club the player appeared for that season (FBref).',
  league: 'League for this row — Big-5 codes like GER-Bundesliga, ENG-Premier League.',
  in_bundesliga: 'True when this row is a Bundesliga season (vs other Big-5 leagues).',
  season_end_year: 'Season as end calendar year — e.g. 2025 means 2024-25.',
  season: 'Raw season code from the data source (FBref or Understat format).',
  pos: 'Position(s) on FBref — e.g. FW, MF, FW,MF.',
  likely_winger:
    'Our heuristic flag: winger_score > 0. Not an official position tag — use side_review for L/R.',
  side_review: 'Manual tag you fill in the CSV: L, R, or central for left-winger study.',

  fc_overall: 'EA FC / FIFA overall rating from SoFIFA (launch roster for that season).',
  fc_potential: 'SoFIFA potential rating for the same roster update.',
  fc_age: 'Age on the SoFIFA roster (game age, may differ slightly from FBref).',
  fc_value_eur: 'SoFIFA in-game value in euros (not Transfermarkt market value).',
  fc_pos: 'Primary SoFIFA position code — e.g. LW, RW, ST.',
  fifa_edition: 'Which FIFA / FC game edition the rating comes from.',
  sofifa_update: 'SoFIFA roster patch date (e.g. Aug launch = start-of-season snapshot).',
  sofifa_version_id: 'SoFIFA internal roster ID — use to re-fetch the same snapshot.',
  sofifa_player_id: 'Stable SoFIFA / EA player ID across seasons.',

  age: 'Player age during that season (FBref).',
  minutes: 'Total Bundesliga minutes played (FBref).',
  nineties:
    'Full 90-minute equivalents — minutes ÷ 90. FBref calls this "90s". Used as the playing-time floor (≥8).',

  goals_per90: 'Non-penalty goals per 90 minutes (FBref standard stats).',
  assists_per90: 'Assists per 90 minutes (FBref).',
  ga_per90: 'Goals + assists minus penalty goals, per 90 (FBref G+A-PK/90).',

  shots_per90: 'Shots attempted per 90 (FBref shooting).',
  sot_per90: 'Shots on target per 90 (FBref shooting).',
  g_per_sh: 'Goals per shot — finishing efficiency (FBref).',

  crosses_per90: 'Crosses attempted per 90 (FBref misc). Key wide-player signal.',
  fouls_drawn_per90:
    'Fouls drawn per 90 (FBref misc). Free proxy for dribbling — real take-on data is not available.',
  fouls_committed_per90: 'Fouls committed per 90 (FBref misc).',
  offsides_per90: 'Offsides per 90 (FBref misc).',

  us_position: 'Understat position code — e.g. F M S for forward / midfielder / substitute.',
  us_minutes: 'Minutes played per Understat (can differ slightly from FBref minutes).',
  npxg: 'Non-penalty expected goals — season total (Understat). Blank if merge failed.',
  xg: 'Total expected goals including penalties — season total (Understat).',
  xa: 'Expected assists — season total (Understat).',
  np_goals: 'Non-penalty goals scored — season total (Understat).',
  goals_us: 'Goals scored including penalties — season total (Understat).',
  key_passes: 'Passes that directly lead to a shot — season total (Understat).',
  shots_us: 'Shots — season total (Understat).',
  xg_chain:
    'xG from open-play possessions the player was involved in — season total (Understat).',
  xg_buildup:
    'xG buildup contribution without the shot or key pass — season total (Understat).',

  npxg_per90: 'Non-penalty xG per 90, using Understat minutes.',
  xa_per90: 'Expected assists per 90, using Understat minutes.',
  npxg_xa_per90: 'npxG + xA combined per 90 — primary chance-creation rate (Understat).',
  key_passes_per90: 'Key passes per 90 (Understat).',
  key_passes_per100: 'Key passes per 100 minutes (Understat).',
  goals_minus_npxg: 'np_goals minus npxG — positive means out-scoring chance quality.',
  goals_minus_npxg_per90: 'Goals minus npxG, scaled per 90.',
  npxg_per_shot: 'npxG divided by shots — average shot quality (Understat).',

  crosses_per90_z: 'Z-score for crosses_per90 vs all rows in this dataset.',
  fouls_drawn_per90_z: 'Z-score for fouls_drawn_per90 vs all rows in this dataset.',
  sot_per90_z: 'Z-score for shots on target per 90 vs all rows in this dataset.',
  npxg_xa_per90_z: 'Z-score for npxG+xA per 90 vs all rows (only when Understat merged).',
  winger_score:
    'Average of available winger-proxy z-scores (crosses, fouls drawn, SoT, npxG+xA). Higher = more winger-like statistically.',
}

export const FILTER_HINTS = {
  search: 'Filter rows where the player or team name contains your text (case-insensitive).',
  league:
    'Click a league to filter rows; click the active league again (or All) to show every league.',
  season: 'Show only one season — uses the end calendar year (e.g. 2025 = 2024-25).',
  wingerOnly:
    'Keep only rows flagged likely_winger (winger_score > 0). Heuristic, not confirmed L/R wingers.',
  sideReview:
    'Filter by your manual side_review tag from the CSV: L, R, central, or not yet reviewed.',
} as const

export const NON_SORTABLE_COLUMNS = ['league'] as const

export function isSortableColumn(col: string): boolean {
  return !(NON_SORTABLE_COLUMNS as readonly string[]).includes(col)
}

export function formatLeagueLabel(league: string): string {
  return league
    .replace(/^GER-/, '')
    .replace(/^ENG-/, '')
    .replace(/^ESP-/, '')
    .replace(/^ITA-/, '')
    .replace(/^FRA-/, '')
    .replace(/^NED-/, '')
    .replace(/^POR-/, '')
}

export function orderColumns(columns: string[]): string[] {
  const rest = columns.filter((c) => !PINNED.includes(c))
  return [...PINNED.filter((c) => columns.includes(c)), ...rest]
}

export function columnLabel(col: string): string {
  return COLUMN_LABELS[col] ?? col
}

export function columnHint(col: string): string {
  return (
    COLUMN_HINTS[col] ??
    'No description yet — check pull_bundesliga_forwards.py for how this column is built.'
  )
}

export function renderCell(col: string, row: Record<string, string>): string {
  if (col === 'likely_winger' || col === 'in_bundesliga') {
    return row[col] === 'True' || row[col] === 'true' ? '✓' : '—'
  }
  if (col === 'season_end_year' || col === 'season') {
    return seasonLabel(row.season_end_year || row.season)
  }
  return fmtCell(row[col])
}
