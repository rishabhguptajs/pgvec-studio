'use client'

import { useState } from 'react'
import { Copy, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { VectorRow } from '@/lib/types'

export function RowInspector({
  row,
  onClose,
  onFindSimilar,
}: {
  row: VectorRow | null
  onClose: () => void
  onFindSimilar: (vec: number[]) => void
}) {
  const [copied, setCopied] = useState(false)
  if (!row) return null

  const preview = row.vector.slice(0, 8).map((n) => n.toFixed(4))

  async function copyVector() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(row?.vector))
      setCopied(true)
      toast.success('Vector copied to clipboard')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--bg-card)] flex flex-col min-h-[200px] max-h-[50vh] shadow-2xl">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">
            Row
          </span>
          <Badge variant="default">{String(row.id)}</Badge>
          {row.distance !== undefined && (
            <Badge variant="warning">
              distance {row.distance.toFixed(4)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copyVector}>
            <Copy className="h-3 w-3" />
            {copied ? 'Copied' : 'Copy vector'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFindSimilar(row.vector)}
          >
            <Search className="h-3 w-3" />
            Find similar
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs font-mono">
        {Object.entries(row.metadata).map(([k, v]) => (
          <div
            key={k}
            className="flex items-start gap-2 border-b border-[var(--border)]/50 py-1"
          >
            <span className="text-[var(--text-muted)] min-w-[140px] shrink-0">
              {k}
            </span>
            <span className="text-[var(--text)] break-all">
              {formatValue(v)}
            </span>
          </div>
        ))}
        <div className="flex items-start gap-2 border-b border-[var(--border)]/50 py-1 md:col-span-2">
          <span className="text-[var(--text-muted)] min-w-[140px] shrink-0">
            vector
          </span>
          <span className="text-[var(--accent)] break-all">
            [{preview.join(', ')}
            {row.vector.length > 8 ? ', …' : ''}]{' '}
            <span className="text-[var(--text-muted)]">
              ({row.vector.length} dims)
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  const s = String(v)
  return s.length > 400 ? s.slice(0, 400) + '…' : s
}
