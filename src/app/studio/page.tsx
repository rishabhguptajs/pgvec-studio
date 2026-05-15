'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, LogOut, Sparkles, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { FilterBar } from '@/components/FilterBar'
import { ScatterPlot } from '@/components/ScatterPlot'
import { RowInspector } from '@/components/RowInspector'
import { SearchPanel } from '@/components/SearchPanel'
import { SimilarityCalculator } from '@/components/SimilarityCalculator'
import { ExportButton } from '@/components/ExportButton'
import { reduceToTwoD } from '@/lib/umap'
import type {
  ColumnInfo,
  FilterConfig,
  SearchResult,
  TableInfo,
  VectorRow,
} from '@/lib/types'

const STORAGE_KEY = 'pgvec-studio:connection-string'

export default function StudioPage() {
  const router = useRouter()

  const [connectionString, setConnectionString] = useState<string | null>(null)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null)
  const [selectedVectorColumn, setSelectedVectorColumn] = useState<string>('')
  const [columns, setColumns] = useState<ColumnInfo[]>([])
  const [rows, setRows] = useState<VectorRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [idColumn, setIdColumn] = useState<string>('id')
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [loadingTables, setLoadingTables] = useState(true)
  const [loadingRows, setLoadingRows] = useState(false)
  const [loadingUmap, setLoadingUmap] = useState(false)
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(
    null,
  )
  const [selectedRow, setSelectedRow] = useState<VectorRow | null>(null)
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set())

  function selectRow(row: VectorRow) {
    setSelectedRow(row)
    setSelectedRowId(row.id)
  }
  function selectRowById(id: string | number) {
    const match = rows.find((r) => String(r.id) === String(id))
    if (match) selectRow(match)
    else toast.error(`Row "${id}" not in current view`)
  }
  const [pendingVector, setPendingVector] = useState('')

  const fetchSeq = useRef(0)

  // Boot — read connection string and fetch tables
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (!stored) {
      router.replace('/')
      return
    }
    setConnectionString(stored)
    ;(async () => {
      try {
        const res = await fetch('/api/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionString: stored }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not list tables')
        const tbls: TableInfo[] = data.tables ?? []
        setTables(tbls)
        if (tbls.length > 0) {
          setSelectedTable(tbls[0])
          setSelectedVectorColumn(tbls[0].vectorColumns[0] ?? '')
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load tables')
      } finally {
        setLoadingTables(false)
      }
    })()
  }, [router])

  // Fetch columns when table changes
  useEffect(() => {
    if (!connectionString || !selectedTable) return
    ;(async () => {
      try {
        const res = await fetch('/api/schema', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionString,
            tableName: selectedTable.tableName,
            schema: selectedTable.schema,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'schema load failed')
        setColumns(data.columns ?? [])
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'schema load failed')
      }
    })()
  }, [connectionString, selectedTable])

  const metadataKeys = useMemo(
    () => columns.filter((c) => !c.isVector).map((c) => c.name),
    [columns],
  )

  const visualize = useCallback(async () => {
    if (!connectionString || !selectedTable || !selectedVectorColumn) return
    const seq = ++fetchSeq.current
    setLoadingRows(true)
    setRows([])
    setHighlightIds(new Set())
    setSelectedRowId(null)
    setSelectedRow(null)
    try {
      const res = await fetch('/api/fetch-vectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionString,
          tableName: selectedTable.tableName,
          schema: selectedTable.schema,
          vectorColumn: selectedVectorColumn,
          limit: 2000,
          filters,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'fetch failed')
      if (seq !== fetchSeq.current) return
      const fetched: VectorRow[] = data.rows ?? []
      setIdColumn(data.idColumn ?? 'id')
      setTotalRows(data.totalRows ?? fetched.length)

      if (fetched.length === 0) {
        toast.info('No rows matched.')
        setLoadingRows(false)
        return
      }

      setLoadingRows(false)
      setLoadingUmap(true)
      // Slight defer so spinner can render
      await new Promise((r) => setTimeout(r, 10))
      const coords = await reduceToTwoD(fetched.map((r) => r.vector))
      if (seq !== fetchSeq.current) return
      const enriched = fetched.map((r, i) => ({
        ...r,
        x: coords[i]?.[0] ?? 0,
        y: coords[i]?.[1] ?? 0,
      }))
      setRows(enriched)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Visualize failed')
    } finally {
      setLoadingRows(false)
      setLoadingUmap(false)
    }
  }, [connectionString, selectedTable, selectedVectorColumn, filters])

  const handleSearch = useCallback(
    async (queryVector: number[], topK: number) => {
      if (!connectionString || !selectedTable || !selectedVectorColumn)
        return null
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionString,
            tableName: selectedTable.tableName,
            schema: selectedTable.schema,
            vectorColumn: selectedVectorColumn,
            queryVector,
            topK,
            idColumn,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'search failed')
        const results: SearchResult[] = data.results ?? []
        setHighlightIds(new Set(results.map((r) => String(r.id))))
        return results
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'search failed')
        return null
      }
    },
    [connectionString, selectedTable, selectedVectorColumn, idColumn],
  )

  const handleSimilarity = useCallback(
    async (a: string, b: string) => {
      if (!connectionString || !selectedTable || !selectedVectorColumn)
        return { error: 'No table selected' }
      try {
        const res = await fetch('/api/similarity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionString,
            tableName: selectedTable.tableName,
            schema: selectedTable.schema,
            vectorColumn: selectedVectorColumn,
            idColumn,
            rowIdA: a,
            rowIdB: b,
          }),
        })
        const data = await res.json()
        if (!res.ok) return { error: data.error ?? 'similarity failed' }
        return { similarity: data.similarity as number }
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'similarity failed',
        }
      }
    },
    [connectionString, selectedTable, selectedVectorColumn, idColumn],
  )

  function disconnect() {
    sessionStorage.removeItem(STORAGE_KEY)
    router.push('/')
  }

  if (loadingTables) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
      </main>
    )
  }

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-sm">
            <span className="text-[var(--accent)]">pgvec</span>-studio
          </h1>
          <div className="flex items-center gap-2 text-xs font-mono">
            <Select
              value={
                selectedTable
                  ? `${selectedTable.schema}.${selectedTable.tableName}`
                  : ''
              }
              onChange={(e) => {
                const key = e.target.value
                const t = tables.find(
                  (t) => `${t.schema}.${t.tableName}` === key,
                )
                if (t) {
                  setSelectedTable(t)
                  setSelectedVectorColumn(t.vectorColumns[0] ?? '')
                  setRows([])
                }
              }}
              className="w-56"
            >
              {tables.map((t) => (
                <option
                  key={`${t.schema}.${t.tableName}`}
                  value={`${t.schema}.${t.tableName}`}
                >
                  {t.schema}.{t.tableName}
                </option>
              ))}
            </Select>
            <Select
              value={selectedVectorColumn}
              onChange={(e) => setSelectedVectorColumn(e.target.value)}
              className="w-40"
            >
              {selectedTable?.vectorColumns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            {selectedTable && (
              <Badge variant="muted">
                {selectedTable.rowCount.toLocaleString()} rows
              </Badge>
            )}
            <Button
              size="sm"
              onClick={visualize}
              disabled={!selectedVectorColumn || loadingRows || loadingUmap}
            >
              {loadingRows || loadingUmap ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Visualize
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={disconnect}>
          <LogOut className="h-3 w-3" />
          Disconnect
        </Button>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <aside className="w-80 shrink-0 border-r border-[var(--border)] overflow-auto p-3 flex flex-col gap-4">
          <Card className="p-3">
            <FilterBar
              columns={columns}
              filters={filters}
              onChange={setFilters}
              onApply={visualize}
              disabled={loadingRows || loadingUmap}
            />
          </Card>
          <Card className="p-3">
            <SearchPanel
              rows={rows}
              pendingVector={pendingVector}
              setPendingVector={setPendingVector}
              onRunSearch={handleSearch}
              onSelectRow={selectRowById}
              onClearHighlights={() => setHighlightIds(new Set())}
              metadataKeys={metadataKeys}
            />
          </Card>
          <Card className="p-3">
            <SimilarityCalculator onCompute={handleSimilarity} />
          </Card>
          <ExportButton rows={rows} metadataKeys={metadataKeys} />
        </aside>

        {/* Main */}
        <section className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 relative">
            {totalRows > rows.length && rows.length > 0 && (
              <div className="absolute top-3 left-3 z-10 pointer-events-none flex items-center gap-2 text-[11px] font-mono rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-2.5 py-1 text-[var(--warning)]">
                <AlertTriangle className="h-3 w-3" />
                Showing {rows.length.toLocaleString()} of{' '}
                {totalRows.toLocaleString()} rows. Add filters to narrow down.
              </div>
            )}
            {(loadingRows || loadingUmap) && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg)]/60 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                  {loadingRows
                    ? 'Fetching vectors…'
                    : 'Running UMAP projection…'}
                </div>
              </div>
            )}
            {rows.length > 0 ? (
              <ScatterPlot
                rows={rows}
                highlightIds={highlightIds}
                selectedId={selectedRowId}
                metadataKeys={metadataKeys}
                onSelect={selectRow}
              />
            ) : (
              !loadingRows &&
              !loadingUmap && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center text-[var(--text-muted)] font-mono text-xs max-w-xs">
                    Pick a table and a vector column, then click{' '}
                    <span className="text-[var(--accent)]">Visualize</span> to
                    project your embeddings into 2D.
                  </div>
                </div>
              )
            )}
          </div>

          {selectedRow && (
            <RowInspector
              row={selectedRow}
              onClose={() => {
                setSelectedRow(null)
                setSelectedRowId(null)
              }}
              onFindSimilar={(vec) => {
                setPendingVector(JSON.stringify(vec))
                toast.success('Vector loaded into search')
              }}
            />
          )}
        </section>
      </div>
    </main>
  )
}
