import { NavLink, Outlet } from 'react-router-dom'
import { SnapshotProvider } from './lib/useSnapshot'

const NAV = [
  { to: '/', label: 'League Table', end: true },
  { to: '/builder', label: 'Squad Builder' },
  { to: '/backtest', label: 'Backtest' },
]

function App() {
  return (
    <SnapshotProvider>
      <div className="min-h-full">
        <header className="sticky top-0 z-20 border-b border-pitch-700/60 bg-pitch-900/85 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3">
            <NavLink to="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pitch-500 text-pitch-900 font-extrabold">
                ⚽
              </span>
              <div className="leading-tight">
                <div className="font-extrabold tracking-tight">
                  Money<span className="text-pitch-500">Fútbol</span>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-fair">
                  squad-quality analytics
                </div>
              </div>
            </NavLink>

            <nav className="ml-auto flex items-center gap-1 text-sm">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 font-medium transition-colors ${
                      isActive
                        ? 'bg-pitch-600/40 text-chalk'
                        : 'text-fair hover:text-chalk hover:bg-pitch-700/40'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-5 py-7">
          <Outlet />
        </main>

        <footer className="mx-auto max-w-7xl px-5 py-8 text-center text-xs text-fair/70">
          Scores from underlying metrics · reads the static{' '}
          <code className="text-pitch-400">/data</code> snapshot · FastAPI
          re-scoring coming next
        </footer>
      </div>
    </SnapshotProvider>
  )
}

export default App
