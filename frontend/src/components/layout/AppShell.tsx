import { NavLink, Outlet } from 'react-router'
import { AlertTriangle, LayoutList, Map, Moon, Settings, ShieldCheck, Sun, Upload, Monitor, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/uiStore'
import { Button } from '@/components/ui/button'

const nav = [
  { to: '/map', label: 'Map', icon: Map },
  { to: '/board', label: 'Board', icon: LayoutList },
  { to: '/attention', label: 'Attention', icon: AlertTriangle },
  { to: '/uploads', label: 'Uploads', icon: Upload },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/privacy', label: 'Privacy', icon: ShieldCheck },
]

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  return (
    <Button variant="ghost" size="icon" title={`Theme: ${theme}`} onClick={() => setTheme(next)} aria-label="Toggle theme">
      <Icon className="h-4 w-4" />
    </Button>
  )
}

export function AppShell() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  return (
    <div className="flex h-full">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-panel">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <div>
            <div className="text-sm font-semibold leading-tight">Fulfillment Tracker</div>
            <div className="text-[11px] text-muted">self-hosted · private</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted hover:bg-panel-2 hover:text-text',
                  isActive && 'bg-panel-2 text-text font-medium',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between px-3 py-3">
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)} className="text-muted">
            <Search className="h-3.5 w-3.5" /> Search <kbd className="ml-1 rounded border border-border px-1 text-[10px]">⌘K</kbd>
          </Button>
          <ThemeToggle />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-panel px-5 py-3">
      <div>
        <h1 className="text-base font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
