import { NextResponse } from 'next/server'
import { humanizePgError, withPool } from '@/lib/db'
import type { ColumnInfo } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { connectionString, tableName, schema } = (await req.json()) as {
    connectionString?: string
    tableName?: string
    schema?: string
  }

  if (!connectionString || !tableName) {
    return NextResponse.json(
      { error: 'connectionString and tableName are required' },
      { status: 400 },
    )
  }

  try {
    const columns = await withPool(connectionString, async (pool) => {
      const res = await pool.query<{
        column_name: string
        data_type: string
        udt_name: string
      }>(
        `SELECT column_name, data_type, udt_name
         FROM information_schema.columns
         WHERE table_name = $1
           AND ($2::text IS NULL OR table_schema = $2)
         ORDER BY ordinal_position`,
        [tableName, schema ?? null],
      )
      const cols: ColumnInfo[] = res.rows.map((r) => ({
        name: r.column_name,
        type: r.udt_name === 'vector' ? 'vector' : r.data_type,
        isVector: r.udt_name === 'vector',
      }))
      return cols
    })

    return NextResponse.json({ columns })
  } catch (err) {
    return NextResponse.json(
      { error: humanizePgError(err) },
      { status: 500 },
    )
  }
}
