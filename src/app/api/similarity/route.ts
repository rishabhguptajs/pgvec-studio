import { NextResponse } from 'next/server'
import { humanizePgError, quoteIdent, withPool } from '@/lib/db'
import { cosineSimilarity } from '@/lib/cosine'

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
    rowIdA?: string | number
    rowIdB?: string | number
    idColumn?: string
  }
  const {
    connectionString,
    tableName,
    schema,
    vectorColumn,
    rowIdA,
    rowIdB,
    idColumn,
  } = body

  if (
    !connectionString ||
    !tableName ||
    !vectorColumn ||
    !idColumn ||
    rowIdA === undefined ||
    rowIdB === undefined
  ) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 },
    )
  }

  try {
    const result = await withPool(connectionString, async (pool) => {
      const qualified = schema
        ? `${quoteIdent(schema)}.${quoteIdent(tableName)}`
        : quoteIdent(tableName)
      const sql = `SELECT ${quoteIdent(idColumn)} AS __id, ${quoteIdent(vectorColumn)}::text AS __vec
                   FROM ${qualified}
                   WHERE ${quoteIdent(idColumn)}::text = ANY($1::text[])`
      const res = await pool.query<{ __id: unknown; __vec: string }>(sql, [
        [String(rowIdA), String(rowIdB)],
      ])
      const byId = new Map<string, number[]>()
      for (const r of res.rows) {
        byId.set(String(r.__id), parseVector(r.__vec))
      }
      const a = byId.get(String(rowIdA))
      const b = byId.get(String(rowIdB))
      if (!a || !b) {
        throw new Error('One or both row IDs not found')
      }
      return {
        similarity: cosineSimilarity(a, b),
        vectorA: a,
        vectorB: b,
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
