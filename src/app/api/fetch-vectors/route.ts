import { NextResponse } from 'next/server'
import { humanizePgError, quoteIdent, withPool } from '@/lib/db'
import type { FilterConfig, FilterOperator, VectorRow } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LIMIT = 5000

function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    // pgvector returns "[0.1,0.2,...]" — JSON.parse handles it.
    try {
      const arr = JSON.parse(trimmed)
      if (Array.isArray(arr)) return arr.map(Number)
    } catch {
      // fall through
    }
    return trimmed
      .replace(/^[\[{(]/, '')
      .replace(/[\]})]$/, '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
  }
  return []
}

function operatorSql(op: FilterOperator, paramIdx: number): string {
  switch (op) {
    case 'eq':
      return `= $${paramIdx}`
    case 'neq':
      return `<> $${paramIdx}`
    case 'contains':
      return `ILIKE '%' || $${paramIdx} || '%'`
    case 'gt':
      return `> $${paramIdx}`
    case 'lt':
      return `< $${paramIdx}`
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    connectionString?: string
    tableName?: string
    schema?: string
    vectorColumn?: string
    limit?: number
    filters?: FilterConfig[]
    idColumn?: string
  }

  const {
    connectionString,
    tableName,
    schema,
    vectorColumn,
    limit,
    filters = [],
    idColumn,
  } = body

  if (!connectionString || !tableName || !vectorColumn) {
    return NextResponse.json(
      {
        error:
          'connectionString, tableName, and vectorColumn are required',
      },
      { status: 400 },
    )
  }

  const safeLimit = Math.min(
    Math.max(1, Math.floor(Number(limit) || 2000)),
    MAX_LIMIT,
  )

  try {
    const result = await withPool(connectionString, async (pool) => {
      // Fetch columns to know which to project as metadata.
      const colsRes = await pool.query<{
        column_name: string
        udt_name: string
      }>(
        `SELECT column_name, udt_name
         FROM information_schema.columns
         WHERE table_name = $1
           AND ($2::text IS NULL OR table_schema = $2)
         ORDER BY ordinal_position`,
        [tableName, schema ?? null],
      )

      if (colsRes.rows.length === 0) {
        throw new Error(`Table ${tableName} not found`)
      }

      const allColumns = colsRes.rows.map((r) => r.column_name)
      const vectorColumns = new Set(
        colsRes.rows.filter((r) => r.udt_name === 'vector').map((r) => r.column_name),
      )
      const nonVectorColumns = allColumns.filter((c) => !vectorColumns.has(c))

      if (!allColumns.includes(vectorColumn)) {
        throw new Error(`Vector column "${vectorColumn}" not found`)
      }

      // Decide id column: prefer "id" if present, else first non-vector column.
      const resolvedIdColumn =
        idColumn && allColumns.includes(idColumn)
          ? idColumn
          : allColumns.includes('id')
            ? 'id'
            : (nonVectorColumns[0] ?? allColumns[0])

      const qualified = schema
        ? `${quoteIdent(schema)}.${quoteIdent(tableName)}`
        : quoteIdent(tableName)

      // Select all non-vector columns + the chosen vector column (cast to text for transport)
      const projectionCols = [
        ...nonVectorColumns.map((c) => quoteIdent(c)),
        `${quoteIdent(vectorColumn)}::text AS __vec`,
      ].join(', ')

      // Build WHERE clauses from filters
      const params: unknown[] = []
      const whereParts: string[] = []
      for (const f of filters) {
        if (!f.column || !allColumns.includes(f.column)) continue
        if (vectorColumns.has(f.column)) continue
        params.push(f.value)
        whereParts.push(
          `${quoteIdent(f.column)}::text ${operatorSql(f.operator, params.length)}`,
        )
      }
      const whereSql =
        whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''

      // Get total matching count to expose to UI
      const countSql = `SELECT count(*)::bigint AS n FROM ${qualified} ${whereSql}`
      const countRes = await pool.query<{ n: string }>(countSql, params)
      const totalRows = Number(countRes.rows[0]?.n ?? 0)

      // Add limit param
      params.push(safeLimit)
      const sql = `SELECT ${projectionCols} FROM ${qualified} ${whereSql} LIMIT $${params.length}`

      const data = await pool.query(sql, params)

      const rows: VectorRow[] = []
      for (const row of data.rows) {
        const vec = parseVector(row.__vec)
        if (vec.length === 0) continue
        const metadata: Record<string, unknown> = {}
        for (const c of nonVectorColumns) {
          metadata[c] = row[c]
        }
        const id =
          metadata[resolvedIdColumn] as string | number | undefined
        rows.push({
          id: id ?? rows.length,
          vector: vec,
          metadata,
        })
      }

      return {
        rows,
        totalRows,
        returnedRows: rows.length,
        idColumn: resolvedIdColumn,
        nonVectorColumns,
        vectorDimension: rows[0]?.vector.length ?? 0,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: humanizePgError(err) },
      { status: 500 },
    )
  }
}
