import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useRefreshShipment, useShipment } from '@/api/queries'
import { PageHeader } from '@/components/layout/AppShell'
import { MobileHeader } from '@/components/layout/MobileShell'
import { ShareButton } from '@/components/layout/ShareButton'
import { Button } from '@/components/ui/button'
import { ShipmentDetailBody } from '@/components/shipment/ShipmentDetailBody'
import { useIsMobile } from '@/lib/useIsMobile'

export function ShipmentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const q = useShipment(id ? Number(id) : null)
  const refresh = useRefreshShipment()
  const s = q.data
  const place = s ? [s.city, s.state].filter(Boolean).join(', ') : ''

  if (mobile) {
    return (
      <>
        <MobileHeader
          title={s?.recipient_name ?? 'Shipment'}
          subtitle={s ? `${place} · ${s.tracking_number}` : undefined}
          back={
            <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/board'))} className="-ml-1 rounded-control p-1.5 text-text-2 hover:bg-panel-2" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </button>
          }
        />
        <div className="min-h-0 flex-1 overflow-auto p-3 pb-24">
          {q.isError && <div className="text-sm text-danger">Shipment not found.</div>}
          {s && <ShipmentDetailBody s={s} onDeleted={() => navigate('/board')} mobile />}
        </div>
        {s && (
          <div className="fixed inset-x-0 bottom-[54px] z-20 flex gap-2 border-t border-border bg-panel/95 px-3 py-2 backdrop-blur" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
            <Button
              variant="outline"
              className="h-11 flex-1"
              onClick={async () => {
                try {
                  await refresh.mutateAsync(s.id)
                  toast.success('Tracking updated')
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
              disabled={refresh.isPending}
            >
              <RefreshCw className={`h-4 w-4 ${refresh.isPending ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            {s.carrier_url && (
              <Button className="h-11 flex-1" onClick={() => window.open(s.carrier_url!, '_blank', 'noopener')}>
                <ExternalLink className="h-4 w-4" /> Open on {s.carrier === 'usps' ? 'USPS' : 'FedEx'}
              </Button>
            )}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <PageHeader title={s?.recipient_name ?? 'Shipment'} subtitle={s ? `${s.tracking_number} · ${place}` : undefined}>
        <ShareButton label="Send to phone" />
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
      </PageHeader>
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-3xl">
          {q.isError && <div className="text-sm text-danger">Shipment not found.</div>}
          {s && <ShipmentDetailBody s={s} onDeleted={() => navigate('/board')} />}
        </div>
      </div>
    </>
  )
}
