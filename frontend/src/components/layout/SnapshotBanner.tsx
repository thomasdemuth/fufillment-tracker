import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Database, ExternalLink, FileJson, FolderOpen, Link2, Sparkles, Upload } from 'lucide-react'
import { useSnapshotActions } from '@/components/layout/AppGate'
import { useStats } from '@/api/queries'
import { HOSTED } from '@/lib/server'
import { getSnapshot } from '@/lib/snapshot'
import { fmtDate, fmtRelative } from '@/lib/format'

const REPO = 'https://github.com/thomasdemuth/fufillment-tracker'
const linkCls = 'inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent hover:underline'

/** Shown at the top of every screen on the hosted site: which data is open, and how to switch. */
export function SnapshotBanner() {
  const snap = getSnapshot()
  const actions = useSnapshotActions()
  const navigate = useNavigate()
  const stats = useStats({})
  if (!actions) return null

  const run = (fn: () => Promise<void>) => () =>
    fn().catch((err) => {
      toast.error((err as Error).message)
    })
  const useMyData = run(async () => {
    await actions.startLocal()
    if (!actions.hasLocalData) navigate('/uploads/new')
  })
  const myDataLabel = actions.hasLocalData ? 'Back to my data' : 'Use my own data'

  if (actions.source === 'local') {
    if (!HOSTED) return null
    const n = stats.data?.total
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-panel-2/60 px-3 py-1.5 text-[11.5px] text-text-2" data-testid="local-banner">
        <Database className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate">
          Your data{n != null ? ` (${n} shipments)` : ''} lives only in this browser. It is never uploaded anywhere; clearing this site's data removes it.
        </span>
        <button onClick={run(actions.openDemo)} className={linkCls}>
          <Sparkles className="h-3.5 w-3.5" /> Demo
        </button>
        <button onClick={actions.openFilePicker} className={linkCls}>
          <FolderOpen className="h-3.5 w-3.5" /> Open a snapshot
        </button>
        <button onClick={run(actions.leaveSnapshot)} className={linkCls}>
          <Link2 className="h-3.5 w-3.5" /> Connect to server
        </button>
      </div>
    )
  }
  if (!snap) return null
  if (snap.demo) {
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-accent-soft px-3 py-1.5 text-[11.5px] text-text-2" data-testid="demo-banner">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate">Demo with {snap.shipments.length} made-up shipments. Upload your own spreadsheets to track real ones; they stay in this browser.</span>
        <button onClick={useMyData} className={linkCls} data-testid="use-my-data">
          <Upload className="h-3.5 w-3.5" /> {myDataLabel}
        </button>
        <button onClick={actions.openFilePicker} className={linkCls}>
          <FolderOpen className="h-3.5 w-3.5" /> Open a snapshot
        </button>
        <button onClick={run(actions.leaveSnapshot)} className={linkCls}>
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
      <button onClick={actions.openFilePicker} className={linkCls}>
        <FolderOpen className="h-3.5 w-3.5" /> Open another
      </button>
      {HOSTED && (
        <button onClick={useMyData} className={linkCls}>
          <Upload className="h-3.5 w-3.5" /> {myDataLabel}
        </button>
      )}
      <button onClick={run(actions.leaveSnapshot)} className={linkCls}>
        <Link2 className="h-3.5 w-3.5" /> Connect to server
      </button>
    </div>
  )
}
