import { toast } from 'sonner'
import { ExternalLink, FileJson, FolderOpen, Link2, Sparkles } from 'lucide-react'
import { useSnapshotActions } from '@/components/layout/AppGate'
import { getSnapshot } from '@/lib/snapshot'
import { fmtDate, fmtRelative } from '@/lib/format'

const REPO = 'https://github.com/thomasdemuth/fufillment-tracker'

/** Shown at the top of every screen while a snapshot file (or the bundled demo) is open. */
export function SnapshotBanner() {
  const snap = getSnapshot()
  const actions = useSnapshotActions()
  if (!snap || !actions) return null
  const open = async () => {
    try {
      actions.openFilePicker()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }
  const linkCls = 'inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent hover:underline'
  if (snap.demo) {
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-accent-soft px-3 py-1.5 text-[11.5px] text-text-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate">
          Demo with {snap.shipments.length} made-up shipments. Run the app on your own computer to track real ones; your data never leaves it.
        </span>
        <button onClick={open} className={linkCls}>
          <FolderOpen className="h-3.5 w-3.5" /> Open a snapshot
        </button>
        <button onClick={() => actions.leaveSnapshot()} className={linkCls}>
          <Link2 className="h-3.5 w-3.5" /> Connect to server
        </button>
        <a href={REPO} target="_blank" rel="noreferrer noopener" className={linkCls}>
          <ExternalLink className="h-3.5 w-3.5" /> Get the app
        </a>
      </div>
    )
  }
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent-soft px-3 py-1.5 text-[11.5px] text-text-2">
      <FileJson className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">
        Snapshot of {snap.shipments.length} shipments from {fmtDate(snap.exported_at, true)} ({fmtRelative(snap.exported_at)}). Read-only.
      </span>
      <button onClick={open} className={linkCls}>
        <FolderOpen className="h-3.5 w-3.5" /> Open another
      </button>
      <button onClick={() => actions.leaveSnapshot()} className={linkCls}>
        <Link2 className="h-3.5 w-3.5" /> Connect to server
      </button>
    </div>
  )
}
