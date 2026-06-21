export function Loading({ label = 'Loading snapshot…' }: { label?: string }) {
  return (
    <div className="flex h-64 items-center justify-center gap-3 text-pitch-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-pitch-500 border-t-transparent" />
      <span className="font-mono text-sm">{label}</span>
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="card mx-auto mt-10 max-w-xl p-6 text-center">
      <p className="text-fade font-semibold">Couldn’t load data</p>
      <p className="mt-2 text-sm text-fair">{message}</p>
      <p className="mt-4 text-xs text-fair">
        From <code className="text-pitch-400">backend/</code>:{' '}
        <code className="rounded bg-pitch-900 px-1.5 py-0.5 text-pitch-400">
          python pull_bundesliga_forwards.py
        </code>
        , then{' '}
        <code className="rounded bg-pitch-900 px-1.5 py-0.5 text-pitch-400">
          npm run dev
        </code>{' '}
        (syncs CSV automatically).
      </p>
    </div>
  )
}

export function RoleTag({ role }: { role: string }) {
  return (
    <span className="pill bg-pitch-700/60 text-pitch-400 border border-pitch-600/50">
      {role}
    </span>
  )
}
