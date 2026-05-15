'use client'

import { useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import type { SearchResult, VectorRow } from '@/lib/types'

interface Props {
  rows: VectorRow[]
  pendingVector: string
  setPendingVector: (v: string) => void
  onRunSearch: (queryVector: number[], topK: number) => Promise<SearchResult[] | null>
  onSelectRow: (id: string | number) => void
  onClearHighlights: () => void
  metadataKeys: string[]
}

export function SearchPanel({
  rows,
  pendingVector,
  setPendingVector,
  onRunSearch,
  onSelectRow,
  onClearHighlights,
  metadataKeys,
}: Props) {
  const [topK, setTopK] = useState(10)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [idQuery, setIdQuery] = useState('')

  async function runVectorSearch() {
    try {
      const parsed = JSON.parse(pendingVector)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        toast.error('Query must be a non-empty JSON array of numbers')
        return
      }
      setBusy(true)
      const res = await onRunSearch(parsed.map(Number), topK)
      setResults(res)
    } catch {
      toast.error('Invalid vector JSON')
    } finally {
      setBusy(false)
    }
  }

  function clearAll() {
    setPendingVector('')
    setResults(null)
    setIdQuery('')
    onClearHighlights()
  }

  function runIdSearch() {
    const trimmed = idQuery.trim()
    if (!trimmed) return
    const match = rows.find((r) => String(r.id) === trimmed)
    if (!match) {
      toast.error(`Row "${trimmed}" not found in current view`)
      return
    }
    onSelectRow(match.id)
  }

  return (
    <Tabs defaultValue="vector" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs text-[var(--text-muted)] tracking-wider uppercase">
          Search
        </h3>
        <TabsList>
          <TabsTrigger value="vector">Vector</TabsTrigger>
          <TabsTrigger value="id">Row ID</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="vector">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-mono text-[var(--text-muted)] leading-relaxed">
            Paste a raw embedding (JSON array of numbers). Tip: click a dot →
            <span className="text-[var(--accent)]"> Find similar</span> to fill
            this in from an existing row.
          </p>
          <Textarea
            value={pendingVector}
            onChange={(e) => setPendingVector(e.target.value)}
            placeholder="[0.12, -0.45, 0.83, ...]"
            className="text-[11px]"
            rows={4}
          />
          <div className="flex items-center gap-2">
            <Select
              value={String(topK)}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="w-24 text-xs font-mono"
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  top {n}
                </option>
              ))}
            </Select>
            <Button
              onClick={runVectorSearch}
              disabled={busy || !pendingVector.trim()}
              size="sm"
              className="flex-1"
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Search className="h-3 w-3" />
              )}
              Search
            </Button>
            <Button
              onClick={clearAll}
              variant="secondary"
              size="sm"
              disabled={
                !pendingVector && !results && !idQuery
              }
              title="Clear search and highlights"
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          </div>
          {results && (
            <ul className="max-h-64 overflow-auto flex flex-col gap-1 mt-1">
              {results.map((r) => (
                <li
                  key={String(r.id)}
                  className="text-[11px] font-mono px-2 py-1.5 rounded hover:bg-[var(--bg-hover)] cursor-pointer border border-transparent hover:border-[var(--border)]"
                  onClick={() => onSelectRow(r.id)}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="default">{String(r.id)}</Badge>
                    <span className="text-[var(--warning)]">
                      d={r.distance.toFixed(4)}
                    </span>
                  </div>
                  <div className="text-[var(--text-muted)] truncate mt-0.5">
                    {metadataKeys
                      .slice(0, 2)
                      .map((k) => `${k}: ${String(r.metadata[k] ?? '')}`)
                      .join(' · ')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </TabsContent>

      <TabsContent value="id">
        <div className="flex flex-col gap-2">
          <Input
            value={idQuery}
            onChange={(e) => setIdQuery(e.target.value)}
            placeholder="row id"
            className="text-xs font-mono"
            onKeyDown={(e) => {
              if (e.key === 'Enter') runIdSearch()
            }}
          />
          <Button onClick={runIdSearch} size="sm" disabled={!idQuery.trim()}>
            <Search className="h-3 w-3" />
            Find
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  )
}
