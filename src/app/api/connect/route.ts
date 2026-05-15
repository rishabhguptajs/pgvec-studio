import { NextResponse } from 'next/server'
import { humanizePgError, withPool } from '@/lib/db'
import type { TableInfo } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: { connectionString?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { connectionString } = body
  if (!connectionString || typeof connectionString !== 'string') {
    return NextResponse.json(
      { error: 'connectionString is required' },
      { status: 400 },
    )
  }

  try {
    const tables = await withPool(connectionString, async (pool) => {
      // Confirm pgvector exists. If not, we still return [] tables.
      const sql = `
        SELECT
          c.table_schema   AS schema,
          c.table_name     AS table_name,
          array_agg(c.column_name ORDER BY c.column_name) AS vector_columns
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema
         AND t.table_name = c.table_name
        WHERE c.udt_name = 'vector'
          AND t.table_type = 'BASE TABLE'
          AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
        GROUP BY c.table_schema, c.table_name
        ORDER BY c.table_schema, c.table_name
      `
      const res = await pool.query<{
        schema: string
        table_name: string
        vector_columns: unknown
      }>(sql)

      const toArray = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.map(String)
        if (typeof v === 'string') {
          // Postgres array literal like "{a,b,c}" — strip braces and split.
          const inner = v.replace(/^\{/, '').replace(/\}$/, '')
          return inner.length === 0
            ? []
            : inner.split(',').map((s) => s.replace(/^"|"$/g, ''))
        }
        return []
      }

      const out: TableInfo[] = []
      for (const r of res.rows) {
        // Cheap rowcount estimate via pg_class.reltuples. Falls back to exact count.
        let rowCount = 0
        try {
          const rc = await pool.query<{ n: string }>(
            `SELECT reltuples::bigint AS n
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = $1 AND n.nspname = $2`,
            [r.table_name, r.schema],
          )
          rowCount = Number(rc.rows[0]?.n ?? 0)
          if (rowCount <= 0) {
            const exact = await pool.query<{ n: string }>(
              `SELECT count(*)::bigint AS n FROM "${r.schema}"."${r.table_name}"`,
            )
            rowCount = Number(exact.rows[0]?.n ?? 0)
          }
        } catch {
          rowCount = 0
        }
        out.push({
          tableName: r.table_name,
          schema: r.schema,
          vectorColumns: toArray(r.vector_columns),
          rowCount,
        })
      }
      return out
    })

    return NextResponse.json({ success: true, tables })
  } catch (err) {
    return NextResponse.json(
      { error: humanizePgError(err) },
      { status: 500 },
    )
  }
}
