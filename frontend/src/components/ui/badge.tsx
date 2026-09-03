import * as React from 'react'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'good'
const tones: Record<Tone, string> = {
  neutral: 'bg-panel-2 text-text-2 border-border',
  accent: 'bg-accent-soft text-accent border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  warn: 'bg-status-ofd/15 text-text border-transparent',
  good: 'bg-status-delivered/15 text-status-delivered border-transparent',
}

export function Badge({ className, tone = 'neutral', style, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', tones[tone], className)} style={style} {...props} />
}
