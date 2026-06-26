// Copies backend CSV study files (+ optional JSON snapshots) into public/data.
// Also builds all_forwards.csv — every league panel merged into one file.
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  copyFileSync,
  existsSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const backendDir = resolve(here, '../../backend')
const jsonSrc = resolve(here, '../../data')
const dest = resolve(here, '../public/data')
const ALL_FORWARDS = 'all_forwards.csv'

mkdirSync(dest, { recursive: true })
let copied = 0

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

function escapeCsvField(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function gridToCsv(headers, dataRows) {
  const lines = [headers.map(escapeCsvField).join(',')]
  for (const cells of dataRows) {
    lines.push(headers.map((_, i) => escapeCsvField(cells[i] ?? '')).join(','))
  }
  return lines.join('\n') + '\n'
}

// A player who is a winger in several studies appears in each cohort file with their
// full career, so the same (player, team, season) row repeats in the merged file.
// Keep one copy per row, preferring the "native" cohort whose study league matches the
// row's own league (its winger_score is computed in the right peer group).
const FILE_LEAGUE_ID = {
  'bundesliga_forwards.csv': 'GER-Bundesliga',
  'ligue1_forwards.csv': 'FRA-Ligue 1',
  'ligue2_forwards.csv': 'FRA-Ligue 2',
  'laliga_forwards.csv': 'ESP-La Liga',
  'seriea_forwards.csv': 'ITA-Serie A',
  'premierleague_forwards.csv': 'ENG-Premier League',
  'championship_forwards.csv': 'ENG-Championship',
  'eredivisie_forwards.csv': 'NED-Eredivisie',
  'primeiraliga_forwards.csv': 'POR-Primeira Liga',
  'serieb_forwards.csv': 'ITA-Serie B',
  'segunda_forwards.csv': 'ESP-La Liga 2',
  'zweite_forwards.csv': 'GER-2. Bundesliga',
  'proleague_forwards.csv': 'BEL-Pro League',
  'austria_forwards.csv': 'AUT-Bundesliga',
  'swiss_forwards.csv': 'SUI-Super League',
}

function mergeForwardsCsv(files) {
  const headers = []
  const headerSet = new Set()
  const parsed = []

  for (const file of files.sort()) {
    const grid = parseCsv(readFileSync(file, 'utf8'))
    if (grid.length < 2) continue
    const fileHeaders = grid[0].map((h) => h.trim())
    for (const h of fileHeaders) {
      if (!headerSet.has(h)) {
        headerSet.add(h)
        headers.push(h)
      }
    }
    parsed.push({ file: file.split('/').pop(), grid, fileHeaders })
  }

  // key (player|team|season_end_year) -> { cells, native } so we can dedupe while
  // preferring the native cohort copy.
  const byKey = new Map()
  const order = []

  for (const { file, grid, fileHeaders } of parsed) {
    const idx = Object.fromEntries(fileHeaders.map((h, i) => [h, i]))
    const leagueId = FILE_LEAGUE_ID[file]
    for (const row of grid.slice(1)) {
      const cells = headers.map((h) => (row[idx[h]] ?? '').trim())
      const player = (row[idx['player']] ?? '').trim()
      const team = (row[idx['team']] ?? '').trim()
      const season = (row[idx['season_end_year']] ?? '').trim()
      const league = (row[idx['league']] ?? '').trim()
      const key = `${player}|${team}|${season}`
      const native = leagueId != null && league === leagueId

      const prev = byKey.get(key)
      if (!prev) {
        byKey.set(key, { cells, native })
        order.push(key)
      } else if (native && !prev.native) {
        byKey.set(key, { cells, native })
      }
    }
  }

  const dataRows = order.map((k) => byKey.get(k).cells)
  return { headers, dataRows }
}

if (existsSync(jsonSrc)) {
  for (const f of readdirSync(jsonSrc).filter((f) => f.endsWith('.json'))) {
    copyFileSync(join(jsonSrc, f), join(dest, f))
    copied++
  }
}

const forwardFiles = readdirSync(backendDir)
  .filter((f) => f.endsWith('_forwards.csv'))
  .map((f) => join(backendDir, f))

for (const src of forwardFiles) {
  const f = src.split('/').pop()
  copyFileSync(src, join(dest, f))
  copied++
  console.log(`[sync-data] Copied ${f} -> public/data`)
}

if (forwardFiles.length) {
  const { headers, dataRows } = mergeForwardsCsv(forwardFiles)
  const merged = gridToCsv(headers, dataRows)
  writeFileSync(join(dest, ALL_FORWARDS), merged)
  copied++
  console.log(
    `[sync-data] Merged ${forwardFiles.length} league CSVs -> public/data/${ALL_FORWARDS} (${dataRows.length} rows)`,
  )
}

if (copied === 0) {
  console.warn('[sync-data] Nothing copied. Run backend pull_forwards.py first.')
} else {
  console.log(`[sync-data] Synced ${copied} file(s) -> public/data`)
}
