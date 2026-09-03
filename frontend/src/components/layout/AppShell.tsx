import { NavLink, Outlet } from 'react-router'
import { AlertTriangle, LayoutList, Map, Moon, Settings, ShieldCheck, Sun, Upload, Monitor, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/uiStore'
import { Button } from '@/components/ui/button'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { Logo } from '@/components/layout/Logo'

const nav = [
  { to: '/map', label: 'Map', icon: Map },
  { to: '/board', label: 'Board', icon: LayoutList },
  { to: '/attention', label: 'Attention', icon: AlertTriangle },
  { to: '/uploads', label: 'Uploads', icon: Upload },
]
const nav2 = [
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/privacy', label: 'Privacy', icon: ShieldCheck },
]

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  return (
    <Button variant="ghost" size="icon" title={`Theme: ${theme} (click to change)`} onClick={() => setTheme(next)} aria-label="Toggle theme">
      <Icon className="h-4 w-4" />
    </Button>
  )
}

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Map }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-2.5 rounded-control px-3 py-[7px] text-[13px] text-text-2 transition-colors hover:bg-panel-2 hover:text-text',
          isActive && 'bg-accent-soft font-medium text-accent hover:bg-accent-soft hover:text-accent',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -left-2 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent" />}
          <Icon className="h-4 w-4" strokeWidth={1.75} />
          {label}
        </>
      )}
    </NavLink>
  )
}

export function AppShell() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  return (
    <div className="flex h-full">
      <aside className="flex w-[216px] shrink-0 flex-col border-r border-border bg-panel">
        <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
          <Logo />
          <div className="leading-tight">
            <div className="text-[13.5px] font-semibold tracking-[-0.01em]">Fulfillment Tracker</div>
            <div className="text-[11px] text-muted">self-hosted · private</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 pt-1">
          {nav.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
          <div className="my-2 h-px bg-border" />
          {nav2.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between px-3 py-3">
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen(true)} className="text-text-2">
            <Search className="h-3.5 w-3.5" /> Search <kbd className="ml-1 rounded border border-border bg-panel-2 px-1 text-[10px] text-muted">⌘K</kbd>
          </Button>
          <ThemeToggle />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  )
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-panel px-5 py-3">
      <div className="min-w-0">
        <h1 className="truncate text-[16px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-[12px] text-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}
