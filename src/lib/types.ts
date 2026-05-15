export interface TableInfo {
  tableName: string
  schema: string
  vectorColumns: string[]
  rowCount: number
}

export interface ColumnInfo {
  name: string
  type: string
  isVector: boolean
}

export interface VectorRow {
  id: string | number
  vector: number[]
  metadata: Record<string, unknown>
  x?: number
  y?: number
  distance?: number
}

export type FilterOperator = 'eq' | 'neq' | 'contains' | 'gt' | 'lt'

export interface FilterConfig {
  column: string
  operator: FilterOperator
  value: string
}

export interface SearchResult extends VectorRow {
  distance: number
}
