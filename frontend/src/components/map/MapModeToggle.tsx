import { Flame, Landmark, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MapMode } from '@/stores/uiStore'

const modes: { key: MapMode; label: string; icon: typeof MapPin }[] = [
  { key: 'points', label: 'Points', icon: MapPin },
  { key: 'heatmap', label: 'Heatmap', icon: Flame },
  { key: 'states', label: 'By state', icon: Landmark },
]

export function MapModeToggle({ mode, onChange }: { mode: MapMode; onChange: (m: MapMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-panel p-0.5 shadow-sm">
      {modes.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors', mode === key ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text')}
        >
          <Icon className="h-3.5 w-3.5" /> {label}
        </button>
      ))}
    </div>
  )
}
