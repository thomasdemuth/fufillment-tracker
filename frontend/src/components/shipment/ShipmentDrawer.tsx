import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { Maximize2, X } from 'lucide-react'
import { useShipment } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { ShipmentDetailBody } from '@/components/shipment/ShipmentDetailBody'

export function ShipmentDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const q = useShipment(id)
  const navigate = useNavigate()
  useEffect(() => {
    if (id == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, onClose])
  if (id == null) return null
  return (
    <>
      <div className="fixed inset-0 z-30 bg-text/20" onClick={onClose} />
      <aside className="fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-[560px] flex-col border-l border-border bg-panel shadow-pop" role="dialog" aria-label="Shipment details">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{q.data?.recipient_name ?? (q.isLoading ? 'Loading…' : 'Shipment')}</div>
            <div className="truncate text-[11px] text-muted">{q.data ? [q.data.city, q.data.state].filter(Boolean).join(', ') : ''}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" title="Open full page" onClick={() => navigate(`/shipments/${id}`)}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {q.isError && <div className="text-sm text-danger">Could not load shipment.</div>}
          {q.data && <ShipmentDetailBody s={q.data} onDeleted={onClose} />}
        </div>
      </aside>
    </>
  )
}
