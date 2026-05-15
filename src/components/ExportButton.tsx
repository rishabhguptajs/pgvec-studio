'use client'

import { useState, useRef, useEffect } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { VectorRow } from '@/lib/types'

function toCsv(rows: VectorRow[], keys: string[]): string {
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const header = ['id', ...keys].join(',')
  const lines = rows.map((r) =>
    [escape(r.id), ...keys.map((k) => escape(r.metadata[k]))].join(','),
  )
  return [header, ...lines].join('\n')
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ExportButton({
  rows,
  metadataKeys,
}: {
  rows: VectorRow[]
  metadataKeys: string[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function exportCsv() {
    download('pgvec-export.csv', toCsv(rows, metadataKeys), 'text/csv')
    setOpen(false)
  }

  function exportJson() {
    const payload = rows.map((r) => ({
      id: r.id,
      ...r.metadata,
      vector: r.vector,
    }))
    download(
      'pgvec-export.json',
      JSON.stringify(payload, null, 2),
      'application/json',
    )
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        disabled={rows.length === 0}
        className="w-full"
      >
        <Download className="h-3 w-3" />
        Export ({rows.length})
      </Button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)] shadow-lg">
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs font-mono hover:bg-[var(--bg-hover)]"
            onClick={exportCsv}
          >
            CSV (metadata only)
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs font-mono hover:bg-[var(--bg-hover)]"
            onClick={exportJson}
          >
            JSON (with vectors)
          </button>
        </div>
      )}
    </div>
  )
}
