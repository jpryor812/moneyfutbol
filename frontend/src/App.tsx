import { Link, Outlet, useNavigate, useParams } from 'react-router-dom'
import { ForwardsProvider } from './lib/useForwardsCsv'
import { ALL_FORWARDS_CSV, ALL_STUDIES_SLUG, isAllStudies, STUDIES, studyBySlug } from './lib/studies'

const navActive =
  'rounded-md bg-pitch-700 px-3 py-1.5 text-chalk'
const navIdle =
  'rounded-md px-3 py-1.5 text-fair hover:text-chalk'

function AppShell() {
  const { studySlug = 'bundesliga' } = useParams()
  const study = studyBySlug(studySlug)
  const navigate = useNavigate()
  const onAll = isAllStudies(studySlug)

  return (
    <ForwardsProvider studySlug={studySlug}>
      <div className="min-h-full">
        <header className="sticky top-0 z-20 border-b border-pitch-700/60 bg-pitch-900/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-5 py-3">
            <Link
              to={onAll ? `/${ALL_STUDIES_SLUG}` : `/${study.slug}`}
              className="flex items-center gap-2.5 hover:opacity-90"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pitch-500 text-pitch-900 font-extrabold">
                ⚽
              </span>
              <div className="leading-tight">
                <div className="font-extrabold tracking-tight">
                  {study.shortLabel}{' '}
                  <span className="text-pitch-500">LW Study</span>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-fair">
                  phase 1 · data panel
                </div>
              </div>
            </Link>

            <nav className="flex min-w-0 flex-1 flex-wrap gap-1 rounded-lg border border-pitch-600/50 bg-pitch-900/60 p-1 text-sm">
              <Link
                to={`/${ALL_STUDIES_SLUG}`}
                className={onAll ? navActive : navIdle}
                title="All leagues combined"
              >
                All
              </Link>
              {STUDIES.map((s) =>
                s.slug === study.slug && !onAll ? (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => navigate(`/${ALL_STUDIES_SLUG}`)}
                    className={navActive}
                    title="Click again to show all leagues"
                  >
                    {s.shortLabel}
                  </button>
                ) : (
                  <Link key={s.slug} to={`/${s.slug}`} className={navIdle}>
                    {s.shortLabel}
                  </Link>
                ),
              )}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {!onAll && (
                <a
                  href={`/data/${study.csvFile}`}
                  download={study.csvFile}
                  className="rounded-lg border border-pitch-600/60 bg-pitch-800/80 px-3 py-1.5 text-sm text-chalk hover:border-pitch-500 hover:bg-pitch-700/40"
                >
                  This league
                </a>
              )}
              <a
                href={`/data/${ALL_FORWARDS_CSV}`}
                download={ALL_FORWARDS_CSV}
                className="rounded-lg border border-pitch-600/60 bg-pitch-800/80 px-3 py-1.5 text-sm text-chalk hover:border-pitch-500 hover:bg-pitch-700/40"
              >
                {onAll ? 'Download CSV' : 'All leagues'}
              </a>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-5 py-7">
          <Outlet />
        </main>

        <footer className="mx-auto max-w-[1600px] px-5 py-8 text-center text-xs text-fair/70">
          {onAll ? (
            <>
              Reads <code className="text-pitch-400">{ALL_FORWARDS_CSV}</code> · rebuild with{' '}
              <code className="text-pitch-400">npm run sync-data</code> in frontend/
            </>
          ) : (
            <>
              Reads <code className="text-pitch-400">{study.csvFile}</code> · regenerate with{' '}
              <code className="text-pitch-400">{study.pullCommand}</code>
            </>
          )}
        </footer>
      </div>
    </ForwardsProvider>
  )
}

export default AppShell
