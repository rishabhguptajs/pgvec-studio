import { NextResponse } from 'next/server'
import { humanizePgError, quoteIdent, withPool } from '@/lib/db'
import type { SearchResult } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number)
  if (typeof value === 'string') {
    try {
      const arr = JSON.parse(value)
      if (Array.isArray(arr)) return arr.map(Number)
    } catch {}
  }
  return []
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    connectionString?: string
    tableName?: string
    schema?: string
    vectorColumn?: string
    queryVector?: number[]
    topK?: number
    idColumn?: string
  }
  const {
    connectionString,
    tableName,
    schema,
    vectorColumn,
    queryVector,
    topK = 10,
    idColumn,
  } = body

  if (
    !connectionString ||
    !tableName ||
    !vectorColumn ||
    !Array.isArray(queryVector) ||
    queryVector.length === 0
  ) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 },
    )
  }

  const safeTopK = Math.min(Math.max(1, Math.floor(topK)), 200)

  try {
    const results = await withPool(connectionString, async (pool) => {
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

      const allColumns = colsRes.rows.map((r) => r.column_name)
      const vectorColumns = new Set(
        colsRes.rows
          .filter((r) => r.udt_name === 'vector')
          .map((r) => r.column_name),
      )
      const nonVectorColumns = allColumns.filter((c) => !vectorColumns.has(c))
      const resolvedIdColumn =
        idColumn && allColumns.includes(idColumn)
          ? idColumn
          : allColumns.includes('id')
            ? 'id'
            : (nonVectorColumns[0] ?? allColumns[0])

      const qualified = schema
        ? `${quoteIdent(schema)}.${quoteIdent(tableName)}`
        : quoteIdent(tableName)

      const projection = [
        ...nonVectorColumns.map((c) => quoteIdent(c)),
        `${quoteIdent(vectorColumn)}::text AS __vec`,
        `(${quoteIdent(vectorColumn)} <=> $1::vector) AS __distance`,
      ].join(', ')

      const vectorLiteral = `[${queryVector.map((n) => Number(n)).join(',')}]`
      const sql = `SELECT ${projection}
                   FROM ${qualified}
                   ORDER BY ${quoteIdent(vectorColumn)} <=> $1::vector ASC
                   LIMIT $2`

      const res = await pool.query(sql, [vectorLiteral, safeTopK])

      const out: SearchResult[] = []
      for (const row of res.rows) {
        const vec = parseVector(row.__vec)
        const metadata: Record<string, unknown> = {}
        for (const c of nonVectorColumns) {
          metadata[c] = row[c]
        }
        out.push({
          id:
            (metadata[resolvedIdColumn] as string | number | undefined) ??
            out.length,
          vector: vec,
          metadata,
          distance: Number(row.__distance),
        })
      }
      return out
    })

    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json(
      { error: humanizePgError(err) },
      { status: 500 },
    )
  }
}
