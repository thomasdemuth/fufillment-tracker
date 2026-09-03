import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useSetTags, useTags, type ShipmentDetail } from '@/api/queries'
import { SectionLabel } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function TagPicker({ shipment }: { shipment: ShipmentDetail }) {
  const all = useTags()
  const set = useSetTags()
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  const names = shipment.tags.map((t) => t.name)
  const commit = (name: string) => {
    const n = name.trim()
    if (n && !names.includes(n)) set.mutate({ id: shipment.id, tags: [...names, n] })
    setValue('')
    setAdding(false)
  }
  const suggestions = (all.data ?? []).filter((t) => !names.includes(t.name) && (!value || t.name.toLowerCase().includes(value.toLowerCase())))
  return (
    <section>
      <SectionLabel className="mb-1.5">Tags</SectionLabel>
      <div className="flex flex-wrap items-center gap-1.5">
        {shipment.tags.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${t.color}22`, color: t.color }}>
            {t.name}
            <button onClick={() => set.mutate({ id: shipment.id, tags: names.filter((n) => n !== t.name) })} aria-label={`Remove ${t.name}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {adding ? (
          <div className="relative">
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit(value)
                if (e.key === 'Escape') setAdding(false)
              }}
              onBlur={() => setTimeout(() => setAdding(false), 150)}
              placeholder="tag name"
              className="h-7 w-36 text-xs"
            />
            {suggestions.length > 0 && (
              <div className="absolute left-0 top-8 z-20 w-40 rounded-md border border-border bg-panel p-1 shadow-pop">
                {suggestions.slice(0, 8).map((t) => (
                  <button key={t.id} onMouseDown={() => commit(t.name)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-panel-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} /> {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted hover:text-text">
            <Plus className="h-3 w-3" /> add tag
          </button>
        )}
      </div>
    </section>
  )
}
