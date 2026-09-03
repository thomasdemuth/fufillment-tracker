import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, LayoutList, Map, Package, Search, Settings, ShieldCheck, Upload } from 'lucide-react'
import { api, unwrap } from '@/api/client'
import { StatusBadge } from '@/components/ui/status-badge'
import { placeLabel } from '@/lib/format'
import { useUiStore } from '@/stores/uiStore'

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 150)
    return () => clearTimeout(t)
  }, [q])
  const results = useQuery({
    queryKey: ['palette', debounced],
    queryFn: async () => unwrap(await api.GET('/api/shipments', { params: { query: { q: debounced, page_size: 8 } } })),
    enabled: open && debounced.trim().length >= 2,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      } else if (e.key === '/' && !typing && !open) {
        const el = document.getElementById('global-search') as HTMLInputElement | null
        if (el) {
          e.preventDefault()
          el.focus()
          el.select()
        } else {
          e.preventDefault()
          setOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-text/25 pt-[12vh]" onClick={() => setOpen(false)}>
      <Command className="w-full max-w-xl overflow-hidden rounded-card border border-border bg-panel shadow-pop" onClick={(e) => e.stopPropagation()} shouldFilter={false} label="Search">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted" />
          <Command.Input value={q} onValueChange={setQ} placeholder="Search shipments by name, tracking, order, city… or jump to a page" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted" autoFocus />
          <kbd className="rounded border border-border px-1 text-[10px] text-muted">esc</kbd>
        </div>
        <Command.List className="max-h-[60vh] overflow-auto p-1">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{debounced.length < 2 ? 'Type at least 2 characters to search shipments.' : results.isFetching ? 'Searching…' : 'No matches.'}</Command.Empty>
          {results.data && results.data.items.length > 0 && (
            <Command.Group heading="Shipments" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted">
              {results.data.items.map((s) => (
                <Command.Item key={s.id} value={`s-${s.id}`} onSelect={() => go(`/shipments/${s.id}`)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-panel-2">
                  <Package className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.recipient_name ?? '—'}</div>
                    <div className="truncate text-[11px] text-muted">
                      {placeLabel(s)} · <span className="font-mono">{s.tracking_number}</span>
                      {s.order_ref ? ` · ${s.order_ref}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </Command.Item>
              ))}
              {results.data.total > results.data.items.length && (
                <Command.Item value="more" onSelect={() => go(`/board?q=${encodeURIComponent(debounced)}`)} className="cursor-pointer rounded-md px-2 py-2 text-xs text-muted data-[selected=true]:bg-panel-2">
                  Show all {results.data.total} matches on the board →
                </Command.Item>
              )}
            </Command.Group>
          )}
          <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted">
            {[
              { to: '/map', label: 'Map', icon: Map },
              { to: '/board', label: 'Board', icon: LayoutList },
              { to: '/attention', label: 'Needs attention', icon: AlertTriangle },
              { to: '/uploads/new', label: 'Upload spreadsheet', icon: Upload },
              { to: '/settings', label: 'Settings', icon: Settings },
              { to: '/privacy', label: 'Privacy', icon: ShieldCheck },
            ]
              .filter((p) => !debounced || p.label.toLowerCase().includes(debounced.toLowerCase()))
              .map((p) => (
                <Command.Item key={p.to} value={`p-${p.to}`} onSelect={() => go(p.to)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-panel-2">
                  <p.icon className="h-4 w-4 text-muted" /> {p.label}
                </Command.Item>
              ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}
