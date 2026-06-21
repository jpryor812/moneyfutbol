/** Minimal RFC4180-style CSV parser (handles quoted fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
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
    } else if (c === '\r') {
      // ignore; \r\n handled at \n
    } else {
      field += c
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

export function csvToRecords(text: string): Record<string, string>[] {
  const grid = parseCsv(text)
  if (grid.length < 2) return []
  const headers = grid[0].map((h) => h.trim())
  return grid.slice(1).map((cells) => {
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => {
      rec[h] = (cells[i] ?? '').trim()
    })
    return rec
  })
}

export function parseNum(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function fmtCell(v: string | undefined): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (Number.isFinite(n)) {
    if (Number.isInteger(n)) return String(n)
    return Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(3).replace(/\.?0+$/, '')
  }
  return v
}

/** e.g. 2020 → "2019-20", 2025 → "2024-25" */
export function seasonLabel(endYear: string | undefined): string {
  const y = parseNum(endYear)
  if (y == null || y < 1990) return fmtCell(endYear)
  const end = String(y).slice(-2)
  return `${y - 1}-${end}`
}
