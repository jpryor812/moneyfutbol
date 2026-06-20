// Read-only data layer: fetches the static JSON snapshot once and caches it.
// (Later this can be swapped for a FastAPI client without touching views.)
import type {
  TeamRow,
  PlayerRow,
  BacktestData,
  ProjectionRow,
  Meta,
} from '../types'

const BASE = `${import.meta.env.BASE_URL}data`

async function getJSON<T>(name: string): Promise<T> {
  const res = await fetch(`${BASE}/${name}`)
  if (!res.ok) throw new Error(`Failed to load ${name}: ${res.status}`)
  return res.json() as Promise<T>
}

export interface Snapshot {
  teams: TeamRow[]
  players: PlayerRow[]
  backtest: BacktestData
  projection: ProjectionRow[]
  meta: Meta
}

let cache: Promise<Snapshot> | null = null

export function loadSnapshot(): Promise<Snapshot> {
  if (!cache) {
    cache = Promise.all([
      getJSON<TeamRow[]>('teams.json'),
      getJSON<PlayerRow[]>('players.json'),
      getJSON<BacktestData>('backtest.json'),
      getJSON<ProjectionRow[]>('projection.json'),
      getJSON<Meta>('meta.json'),
    ]).then(([teams, players, backtest, projection, meta]) => ({
      teams,
      players,
      backtest,
      projection,
      meta,
    }))
  }
  return cache
}
