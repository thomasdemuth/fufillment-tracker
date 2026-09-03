import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { useAddNote, useDeleteNote, type ShipmentDetail } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { fmtDate } from '@/lib/format'

export function NotesPanel({ shipment }: { shipment: ShipmentDetail }) {
  const add = useAddNote()
  const del = useDeleteNote()
  const [body, setBody] = useState('')
  const submit = async () => {
    if (!body.trim()) return
    try {
      await add.mutateAsync({ id: shipment.id, body })
      setBody('')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Notes</h3>
      <div className="flex flex-col gap-2">
        {shipment.notes.map((n) => (
          <div key={n.id} className="group rounded-lg border border-border bg-panel-2/50 px-3 py-2 text-sm">
            <div className="whitespace-pre-wrap">{n.body}</div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
              <span>{fmtDate(n.created_at, true)}</span>
              <button className="opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100" onClick={() => del.mutate({ id: shipment.id, noteId: n.id })} title="Delete note">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note… (⌘/Ctrl+Enter to save)"
          rows={2}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          }}
        />
        {body.trim() && (
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={add.isPending}>
              Save note
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
