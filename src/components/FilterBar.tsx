'use client'

import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { ColumnInfo, FilterConfig, FilterOperator } from '@/lib/types'

const OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'contains', label: 'contains' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
]

export function FilterBar({
  columns,
  filters,
  onChange,
  onApply,
  disabled,
}: {
  columns: ColumnInfo[]
  filters: FilterConfig[]
  onChange: (filters: FilterConfig[]) => void
  onApply: () => void
  disabled?: boolean
}) {
  const nonVectorCols = columns.filter((c) => !c.isVector)

  function add() {
    const first = nonVectorCols[0]?.name ?? ''
    onChange([...filters, { column: first, operator: 'eq', value: '' }])
  }

  function update(i: number, patch: Partial<FilterConfig>) {
    const next = filters.slice()
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }

  function remove(i: number) {
    onChange(filters.filter((_, idx) => idx !== i))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs text-[var(--text-muted)] tracking-wider uppercase">
          Filters
        </h3>
        <Button variant="ghost" size="sm" onClick={add} disabled={disabled}>
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      {filters.length === 0 && (
        <p className="text-xs text-[var(--text-muted)] font-mono">
          No filters.
        </p>
      )}
      {filters.map((f, i) => (
        <div key={i} className="flex items-center gap-1">
          <Select
            value={f.column}
            onChange={(e) => update(i, { column: e.target.value })}
            className="flex-1 text-xs font-mono"
          >
            {nonVectorCols.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            value={f.operator}
            onChange={(e) =>
              update(i, { operator: e.target.value as FilterOperator })
            }
            className="w-20 text-xs font-mono"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </Select>
          <Input
            value={f.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className="flex-1 text-xs font-mono"
            placeholder="value"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => remove(i)}
            className="h-9 w-9"
            aria-label="Remove filter"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button
        onClick={onApply}
        disabled={disabled}
        size="sm"
        className="mt-1"
      >
        Apply filters
      </Button>
    </div>
  )
}
