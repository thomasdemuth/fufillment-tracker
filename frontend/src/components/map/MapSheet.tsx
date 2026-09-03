import { useNavigate } from 'react-router'
import { ChevronRight, ExternalLink } from 'lucide-react'
import { useShipment } from '@/api/queries'
import { ProgressStepper } from '@/components/shipment/ProgressStepper'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { CarrierBadge } from '@/components/ui/status-badge'
import { placeLabel } from '@/lib/format'

/** Phone map: tapping a point opens a compact summary; "Details" goes to the full page. */
export function MapSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const q = useShipment(id)
  const navigate = useNavigate()
  const s = q.data
  return (
    <Sheet open={id != null} onClose={onClose} title={s?.recipient_name ?? 'Shipment'}>
      {s && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <CarrierBadge carrier={s.carrier} confidence={s.carrier_confidence} />
            <span className="truncate">{placeLabel(s)}</span>
            <span className="ml-auto font-mono text-[11px]">{s.tracking_number.slice(-8)}</span>
          </div>
          <ProgressStepper shipment={s} />
          <div className="flex gap-2">
            {s.carrier_url && (
              <Button variant="outline" className="h-11 flex-1" onClick={() => window.open(s.carrier_url!, '_blank', 'noopener')}>
                <ExternalLink className="h-4 w-4" /> {s.carrier === 'usps' ? 'USPS' : 'FedEx'}
              </Button>
            )}
            <Button className="h-11 flex-1" onClick={() => navigate(`/shipments/${s.id}`)}>
              Details <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
