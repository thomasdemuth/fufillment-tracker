import { AlertTriangle, Check, Clock, Package, RotateCcw, Truck, type LucideIcon } from 'lucide-react'
import { statusMeta, type Status } from '@/lib/status'
import { cn } from '@/lib/utils'

const ICONS: Record<Status, LucideIcon> = {
  label_created: Package,
  in_transit: Truck,
  out_for_delivery: Truck,
  delivered: Check,
  exception: AlertTriangle,
  returned: RotateCcw,
  unknown: Clock,
}

/** Status is never color alone: a dot/icon plus the label, in ink. */
export function StatusBadge({ status, className, size = 'sm', icon = false }: { status: string; className?: string; size?: 'sm' | 'md'; icon?: boolean }) {
  const m = statusMeta(status)
  const Icon = ICONS[(status as Status) in ICONS ? (status as Status) : 'unknown']
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-panel font-medium text-text-2',
        size === 'sm' ? 'h-[22px] px-2 text-[11.5px]' : 'h-7 px-2.5 text-xs',
        className,
      )}
    >
      {icon ? <Icon className="h-3 w-3" style={{ color: `var(--st-${tokenSuffix(status)})` }} /> : <span className={cn('rounded-full', size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2')} style={{ backgroundColor: `var(--st-${tokenSuffix(status)})` }} />}
      {m.label}
    </span>
  )
}

export function tokenSuffix(status: string): string {
  return statusMeta(status).token.replace('status-', '')
}

/** Carrier is not a status, so it stays in ink on a quiet chip. */
export function CarrierBadge({ carrier, confidence }: { carrier: string; confidence?: number }) {
  const label = carrier === 'usps' ? 'USPS' : carrier === 'fedex' ? 'FedEx' : 'Unknown'
  const low = confidence !== undefined && confidence < 0.7 && carrier !== 'unknown'
  return (
    <span
      className={cn('inline-flex h-[20px] items-center rounded-[5px] border border-border bg-panel-2 px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-2', carrier === 'unknown' && 'text-muted')}
      title={low ? 'Carrier guessed from tracking number format with low confidence' : undefined}
    >
      {label}
      {low && <span className="ml-0.5 text-muted">?</span>}
    </span>
  )
}
