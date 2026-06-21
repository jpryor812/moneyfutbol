import { Link, Outlet } from 'react-router-dom'
import { ForwardsProvider } from './lib/useForwardsCsv'

function App() {
  return (
    <ForwardsProvider>
      <div className="min-h-full">
        <header className="sticky top-0 z-20 border-b border-pitch-700/60 bg-pitch-900/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-5 py-3">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-90">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pitch-500 text-pitch-900 font-extrabold">
                ⚽
              </span>
              <div className="leading-tight">
                <div className="font-extrabold tracking-tight">
                  Bundesliga <span className="text-pitch-500">LW Study</span>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-fair">
                  phase 1 · data panel
                </div>
              </div>
            </Link>
            <a
              href="/data/bundesliga_forwards.csv"
              download="bundesliga_forwards.csv"
              className="ml-auto rounded-lg border border-pitch-600/60 bg-pitch-800/80 px-3 py-1.5 text-sm text-chalk hover:border-pitch-500 hover:bg-pitch-700/40"
            >
              Download CSV
            </a>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-5 py-7">
          <Outlet />
        </main>

        <footer className="mx-auto max-w-[1600px] px-5 py-8 text-center text-xs text-fair/70">
          Reads{' '}
          <code className="text-pitch-400">bundesliga_forwards.csv</code> · regenerate
          with{' '}
          <code className="text-pitch-400">python pull_bundesliga_forwards.py</code>
        </footer>
      </div>
    </ForwardsProvider>
  )
}

export default App
