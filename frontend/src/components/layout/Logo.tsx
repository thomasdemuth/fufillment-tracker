export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="var(--accent)" />
      <path d="M8 12.5 16 8.5l8 4v9l-8 4-8-4z" fill="none" stroke="var(--accent-fg)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 12.5l8 4 8-4M16 16.5v9" fill="none" stroke="var(--accent-fg)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="24" cy="9" r="3.2" fill="var(--st-delivered)" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  )
}
