// Copies the backend snapshot (/data/*.json) into public/data so Vite can
// serve it in dev and bundle it on build. Keeps /data as the single source of
// truth (produced by backend/export_snapshot.py). Runs via predev/prebuild.
import { mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const jsonSrc = resolve(here, '../../data')
const csvSrc = resolve(here, '../../backend/bundesliga_forwards.csv')
const dest = resolve(here, '../public/data')

mkdirSync(dest, { recursive: true })
let copied = 0

if (existsSync(jsonSrc)) {
  for (const f of readdirSync(jsonSrc).filter((f) => f.endsWith('.json'))) {
    copyFileSync(join(jsonSrc, f), join(dest, f))
    copied++
  }
}

if (existsSync(csvSrc)) {
  copyFileSync(csvSrc, join(dest, 'bundesliga_forwards.csv'))
  copied++
  console.log('[sync-data] Copied bundesliga_forwards.csv -> public/data')
} else {
  console.warn(
    `[sync-data] No CSV at ${csvSrc}. Run: cd backend && python pull_bundesliga_forwards.py`,
  )
}

if (copied === 0) {
  console.warn('[sync-data] Nothing copied. Run backend pull or export_snapshot first.')
} else {
  console.log(`[sync-data] Synced ${copied} file(s) -> public/data`)
}
