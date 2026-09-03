import { useRef, useState } from 'react'
import { FileSpreadsheet, UploadCloud } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Dropzone({ onFile, busy }: { onFile: (f: File) => void; busy?: boolean }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) onFile(f)
      }}
      onClick={() => input.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-panel px-6 py-16 text-center transition-colors hover:border-accent hover:bg-panel-2/50',
        over && 'border-accent bg-accent/5',
        busy && 'pointer-events-none opacity-60',
      )}
    >
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.xls,.xlsb,.ods,.csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      {busy ? <FileSpreadsheet className="h-10 w-10 animate-pulse text-accent" /> : <UploadCloud className="h-10 w-10 text-muted" />}
      <div className="mt-3 text-base font-medium">{busy ? 'Reading spreadsheet…' : 'Drop a spreadsheet here, or click to choose'}</div>
      <div className="mt-1 text-sm text-muted">.xlsx, .xls, .ods, .csv, .tsv · up to 50 MB · stays on this machine</div>
    </div>
  )
}
