import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { csvToRecords } from './csv'

type ForwardsContext = {
  rows: Record<string, string>[]
  columns: string[]
  loading: boolean
  error: string | null
}

const Ctx = createContext<ForwardsContext | null>(null)

export function ForwardsProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/bundesliga_forwards.csv')
      .then((r) => {
        if (!r.ok) {
          throw new Error(
            'bundesliga_forwards.csv not found — run python pull_bundesliga_forwards.py in backend/',
          )
        }
        return r.text()
      })
      .then((text) => {
        if (cancelled) return
        const records = csvToRecords(text)
        setRows(records)
        setError(records.length ? null : 'CSV is empty')
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const columns = useMemo(
    () => (rows.length ? Object.keys(rows[0]) : []),
    [rows],
  )

  return (
    <Ctx.Provider value={{ rows, columns, loading, error }}>
      {children}
    </Ctx.Provider>
  )
}

export function useForwardsCsv() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useForwardsCsv must be used within ForwardsProvider')
  return ctx
}
