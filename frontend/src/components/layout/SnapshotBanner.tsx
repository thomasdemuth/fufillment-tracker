import { useRef } from 'react'
import { toast } from 'sonner'
import { FileJson, FolderOpen, Link2 } from 'lucide-react'
import { useSnapshotActions } from '@/components/layout/AppGate'
import { getSnapshot, readSnapshotFile } from '@/lib/snapshot'
import { fmtDate, fmtRelative } from '@/lib/format'

/** Shown at the top of every screen while a snapshot file is open. */
export function SnapshotBanner() {
  const snap = getSnapshot()
  const actions = useSnapshotActions()
  const input = useRef<HTMLInputElement>(null)
  if (!snap || !actions) return null
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent-soft px-3 py-1.5 text-[11.5px] text-text-2">
      <FileJson className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">
        Snapshot of {snap.shipments.length} shipments from {fmtDate(snap.exported_at, true)} ({fmtRelative(snap.exported_at)}). Read-only.
      </span>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            await actions.openSnapshot(await readSnapshotFile(f))
            toast.success('Snapshot replaced')
          } catch (err) {
            toast.error((err as Error).message)
          }
        }}
      />
      <button onClick={() => input.current?.click()} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent hover:underline">
        <FolderOpen className="h-3.5 w-3.5" /> Open another
      </button>
      <button onClick={() => actions.leaveSnapshot()} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent hover:underline">
        <Link2 className="h-3.5 w-3.5" /> Connect to server
      </button>
    </div>
  )
}
