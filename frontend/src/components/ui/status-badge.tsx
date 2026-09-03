import { statusMeta } from '@/lib/status'
import { cn } from '@/lib/utils'

export function StatusBadge({ status, className, size = 'sm' }: { status: string; className?: string; size?: 'sm' | 'md' }) {
  const m = statusMeta(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
      style={{ backgroundColor: `${m.color}22`, color: m.color, border: `1px solid ${m.color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  )
}

export function CarrierBadge({ carrier, confidence }: { carrier: string; confidence?: number }) {
  const label = carrier === 'usps' ? 'USPS' : carrier === 'fedex' ? 'FedEx' : 'Unknown'
  const low = confidence !== undefined && confidence < 0.7 && carrier !== 'unknown'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide',
        carrier === 'usps' && 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
        carrier === 'fedex' && 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
        carrier === 'unknown' && 'bg-panel-2 text-muted',
      )}
      title={low ? 'Carrier guessed from tracking number format with low confidence' : undefined}
    >
      {label}
      {low && '?'}
    </span>
  )
}
