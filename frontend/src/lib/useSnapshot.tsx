import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { loadSnapshot } from './data'
import type { Snapshot } from './data'

interface SnapshotState {
  data: Snapshot | null
  error: string | null
  loading: boolean
}

const Ctx = createContext<SnapshotState>({
  data: null,
  error: null,
  loading: true,
})

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SnapshotState>({
    data: null,
    error: null,
    loading: true,
  })

  useEffect(() => {
    let alive = true
    loadSnapshot()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch(
        (e) =>
          alive &&
          setState({ data: null, error: String(e), loading: false }),
      )
    return () => {
      alive = false
    }
  }, [])

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

export function useSnapshot() {
  return useContext(Ctx)
}
