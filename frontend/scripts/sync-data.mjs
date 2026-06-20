// Copies the backend snapshot (/data/*.json) into public/data so Vite can
// serve it in dev and bundle it on build. Keeps /data as the single source of
// truth (produced by backend/export_snapshot.py). Runs via predev/prebuild.
import { mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../../data')
const dest = resolve(here, '../public/data')

if (!existsSync(src)) {
  console.warn(`[sync-data] No /data folder at ${src}. Run backend/export_snapshot.py first.`)
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
const files = readdirSync(src).filter((f) => f.endsWith('.json'))
for (const f of files) {
  copyFileSync(join(src, f), join(dest, f))
}
console.log(`[sync-data] Copied ${files.length} JSON file(s) -> public/data`)
