import { useNavigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { useShipment } from '@/api/queries'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { ShipmentDetailBody } from '@/components/shipment/ShipmentDetailBody'

export function ShipmentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const q = useShipment(id ? Number(id) : null)
  return (
    <>
      <PageHeader title={q.data?.recipient_name ?? 'Shipment'} subtitle={q.data ? `${q.data.tracking_number} · ${[q.data.city, q.data.state].filter(Boolean).join(', ')}` : undefined}>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Button>
      </PageHeader>
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-3xl">
          {q.isError && <div className="text-sm text-danger">Shipment not found.</div>}
          {q.data && <ShipmentDetailBody s={q.data} onDeleted={() => navigate('/board')} />}
        </div>
      </div>
    </>
  )
}
