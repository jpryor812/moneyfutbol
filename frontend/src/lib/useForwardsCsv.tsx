import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { csvToRecords } from './csv'
import { ALL_STUDIES, isAllStudies, type Study, studyBySlug } from './studies'

type ForwardsContext = {
  study: Study
  rows: Record<string, string>[]
  columns: string[]
  loading: boolean
  error: string | null
}

const Ctx = createContext<ForwardsContext | null>(null)

async function loadStudyCsv(study: Study): Promise<Record<string, string>[]> {
  const res = await fetch(`/data/${study.csvFile}`)
  if (!res.ok) {
    throw new Error(
      `${study.csvFile} not found — run ${study.pullCommand} in backend/`,
    )
  }
  return csvToRecords(await res.text())
}

export function ForwardsProvider({
  studySlug,
  children,
}: {
  studySlug: string
  children: ReactNode
}) {
  const study = studyBySlug(studySlug)
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const load = isAllStudies(studySlug)
      ? loadStudyCsv(ALL_STUDIES)
      : loadStudyCsv(study)

    load
      .then((records) => {
        if (cancelled) return
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
  }, [studySlug, study.csvFile, study.pullCommand])

  const columns = useMemo(
    () => (rows.length ? Object.keys(rows[0]) : []),
    [rows],
  )

  return (
    <Ctx.Provider value={{ study, rows, columns, loading, error }}>
      {children}
    </Ctx.Provider>
  )
}

export function useForwardsCsv() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useForwardsCsv must be used within ForwardsProvider')
  return ctx
}
