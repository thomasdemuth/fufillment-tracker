import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Bottom sheet for phones: backdrop, grab handle, scrollable body, Esc/backdrop to close. */
export function Sheet({ open, onClose, title, children, className, height = 'auto' }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; className?: string; height?: 'auto' | 'half' | 'full' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-text/25" onClick={onClose} />
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          'relative flex w-full flex-col rounded-t-[16px] border-t border-border bg-panel shadow-pop',
          height === 'full' ? 'h-[92dvh]' : height === 'half' ? 'h-[55dvh]' : 'max-h-[85dvh]',
          className,
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-2">
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border-strong" />
          <div className="mt-2 text-[14px] font-semibold">{title}</div>
          <button onClick={onClose} className="mt-2 rounded-control p-1.5 text-muted hover:bg-panel-2" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}
