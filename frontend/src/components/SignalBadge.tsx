import { classifySignal } from '../types'

const STYLES: Record<string, string> = {
  buy: 'bg-buy/15 text-buy border border-buy/30',
  fade: 'bg-fade/15 text-fade border border-fade/30',
  fair: 'bg-fair/10 text-fair border border-fair/20',
}

const LABELS: Record<string, string> = {
  buy: 'BUY',
  fade: 'FADE',
  fair: 'FAIR',
}

export function SignalBadge({ signal }: { signal: string }) {
  const kind = classifySignal(signal)
  return (
    <span className={`pill ${STYLES[kind]}`} title={signal}>
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          background:
            kind === 'buy' ? '#22c55e' : kind === 'fade' ? '#ef4444' : '#9ca3af',
        }}
      />
      {LABELS[kind]}
    </span>
  )
}
