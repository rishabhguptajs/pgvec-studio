'use client'

import { useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { VectorRow } from '@/lib/types'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

interface Props {
  rows: VectorRow[]
  highlightIds?: Set<string>
  selectedId?: string | number | null
  metadataKeys: string[]
  onSelect: (row: VectorRow) => void
}

export function ScatterPlot({
  rows,
  highlightIds,
  selectedId,
  metadataKeys,
  onSelect,
}: Props) {
  const traceRowsRef = useRef<VectorRow[][]>([])
  const hoveredRowRef = useRef<VectorRow | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const wrapperRef = useRef<HTMLDivElement>(null)

  const data = useMemo(() => {
    const baseRows: VectorRow[] = []
    const hitRows: VectorRow[] = []

    for (const r of rows) {
      if (r.x === undefined || r.y === undefined) continue
      if (highlightIds && highlightIds.has(String(r.id))) hitRows.push(r)
      else baseRows.push(r)
    }

    const previewKeys = metadataKeys.slice(0, 3)
    const fmt = (r: VectorRow) => {
      const preview = previewKeys
        .map((k) => {
          const v = r.metadata[k]
          const s = v === null || v === undefined ? '' : String(v)
          return `${k}: ${s.length > 40 ? s.slice(0, 40) + '…' : s}`
        })
        .join('<br>')
      return `<b>${r.id}</b><br>${preview}`
    }

    const traceType = rows.length > 5000 ? 'scattergl' : 'scatter'

    const traces: Array<Record<string, unknown>> = []
    const indexMap: VectorRow[][] = []

    traces.push({
      type: traceType,
      mode: 'markers',
      x: baseRows.map((r) => r.x),
      y: baseRows.map((r) => r.y),
      text: baseRows.map(fmt),
      hoverinfo: 'text',
      customdata: baseRows.map((r) => r.id),
      marker: {
        size: 10,
        color: '#00ff88',
        opacity: 0.7,
        line: { width: 0 },
      },
      name: 'rows',
    })
    indexMap.push(baseRows)

    if (hitRows.length > 0) {
      traces.push({
        type: traceType,
        mode: 'markers',
        x: hitRows.map((r) => r.x),
        y: hitRows.map((r) => r.y),
        text: hitRows.map(fmt),
        hoverinfo: 'text',
        customdata: hitRows.map((r) => r.id),
        marker: {
          size: 14,
          color: '#ffaa00',
          line: { width: 1, color: '#fff' },
        },
        name: 'matches',
      })
      indexMap.push(hitRows)
    }

    if (selectedId !== null && selectedId !== undefined) {
      const sel = rows.find((r) => String(r.id) === String(selectedId))
      if (sel && sel.x !== undefined && sel.y !== undefined) {
        traces.push({
          type: traceType,
          mode: 'markers',
          x: [sel.x],
          y: [sel.y],
          customdata: [sel.id],
          hoverinfo: 'skip',
          marker: {
            size: 16,
            color: 'rgba(0,0,0,0)',
            line: { width: 2, color: '#00ff88' },
          },
          name: 'selected',
          showlegend: false,
        })
        indexMap.push([sel])
      }
    }

    traceRowsRef.current = indexMap
    return traces
  }, [rows, highlightIds, selectedId, metadataKeys])

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#999', family: 'JetBrains Mono' },
    xaxis: { showgrid: false, zeroline: false, showticklabels: false },
    yaxis: { showgrid: false, zeroline: false, showticklabels: false },
    margin: { t: 20, r: 20, b: 20, l: 20 },
    hovermode: 'closest' as const,
    clickmode: 'event' as const,
    dragmode: 'pan' as const,
    showlegend: false,
  }

  function rowFromPoint(point: {
    curveNumber?: number
    pointIndex?: number
    pointNumber?: number
  }): VectorRow | null {
    if (point.curveNumber === undefined) return null
    const trace = traceRowsRef.current[point.curveNumber]
    if (!trace) return null
    const idx =
      point.pointIndex !== undefined
        ? point.pointIndex
        : point.pointNumber !== undefined
          ? point.pointNumber
          : -1
    return trace[idx] ?? null
  }

  // Plotly's drag layer calls stopPropagation on native events, killing
  // React's delegated synthetic listeners. Use capture-phase native listeners
  // so we run BEFORE plotly can swallow the event.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    let down: { x: number; y: number; t: number } | null = null

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      // Ignore clicks on the modebar (buttons live in .modebar)
      const target = e.target as Element | null
      if (target && target.closest('.modebar')) return
      down = { x: e.clientX, y: e.clientY, t: Date.now() }
    }
    const onUp = (e: MouseEvent) => {
      const start = down
      down = null
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (dx * dx + dy * dy > 25) return // it was a drag, not a click
      if (Date.now() - start.t > 600) return // long press, not a click
      const row = hoveredRowRef.current
      if (row) onSelectRef.current(row)
    }

    el.addEventListener('mousedown', onDown, true)
    el.addEventListener('mouseup', onUp, true)
    return () => {
      el.removeEventListener('mousedown', onDown, true)
      el.removeEventListener('mouseup', onUp, true)
    }
  }, [])

  return (
    <div ref={wrapperRef} className="w-full h-full relative">
      <Plot
        data={data as never}
        layout={layout as never}
        config={{
          displayModeBar: true,
          displaylogo: false,
          responsive: true,
          scrollZoom: true,
          modeBarButtonsToRemove: [
            'toImage',
            'zoom2d',
            'lasso2d',
            'select2d',
            'autoScale2d',
            'toggleSpikelines',
            'hoverClosestCartesian',
            'hoverCompareCartesian',
          ],
        }}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
        onClick={(e) => {
          const row = rowFromPoint((e.points?.[0] as never) ?? {})
          if (row) onSelectRef.current(row)
        }}
        onHover={(e) => {
          const row = rowFromPoint((e.points?.[0] as never) ?? {})
          if (row) hoveredRowRef.current = row
        }}
        onUnhover={() => {
          // Keep the last-hovered row so a delayed click still works.
        }}
      />
    </div>
  )
}
