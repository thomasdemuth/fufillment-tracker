import { AlertTriangle, Flame, Landmark, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MapMode } from '@/stores/uiStore'

const modes: { key: MapMode; label: string; icon: typeof MapPin }[] = [
  { key: 'points', label: 'Points', icon: MapPin },
  { key: 'heatmap', label: 'Heatmap', icon: Flame },
  { key: 'states', label: 'By state', icon: Landmark },
]

export function MapModeToggle({ mode, onChange, problemsOnly, onProblemsOnly }: { mode: MapMode; onChange: (m: MapMode) => void; problemsOnly: boolean; onProblemsOnly: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <div className="inline-flex rounded-control border border-border bg-panel p-0.5 shadow-card">
        {modes.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn('flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-colors', mode === key ? 'bg-accent text-accent-fg' : 'text-text-2 hover:text-text')}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      <button
        onClick={() => onProblemsOnly(!problemsOnly)}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border px-2.5 py-1.5 text-[12px] font-medium shadow-card transition-colors',
          problemsOnly ? 'border-danger/40 bg-danger-soft text-danger' : 'border-border bg-panel text-text-2 hover:text-text',
        )}
        title="Show only exceptions and returns"
      >
        <AlertTriangle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Problems only</span><span className="sm:hidden">Problems</span>
      </button>
    </div>
  )
}
