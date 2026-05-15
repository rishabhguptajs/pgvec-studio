import { Pool } from 'pg'

export function createPool(connectionString: string): Pool {
  const needsSsl =
    connectionString.includes('sslmode=require') ||
    connectionString.includes('neon.tech') ||
    connectionString.includes('supabase')
  return new Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  })
}

export async function withPool<T>(
  connectionString: string,
  fn: (pool: Pool) => Promise<T>,
): Promise<T> {
  const pool = createPool(connectionString)
  try {
    return await fn(pool)
  } finally {
    await pool.end().catch(() => {})
  }
}

export function humanizePgError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: string })?.code

  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(message)) {
    return 'Could not reach the database. Is it running and reachable from this machine?'
  }
  if (/password authentication failed/i.test(message)) {
    return 'Wrong password in connection string.'
  }
  if (/no pg_hba\.conf entry/i.test(message) || /SSL.*required/i.test(message)) {
    return 'SSL is required. Add `?sslmode=require` to your connection string.'
  }
  if (/relation .* does not exist/i.test(message)) {
    return 'Table not found. Check the table name and schema.'
  }
  if (/permission denied/i.test(message)) {
    return "Your Postgres user doesn't have SELECT permission on this table."
  }
  if (/ENOTFOUND|getaddrinfo/i.test(message)) {
    return 'Could not resolve the database host. Check the hostname in your connection string.'
  }
  return message
}

// Quote a Postgres identifier (table, column, schema) safely.
export function quoteIdent(ident: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ident)) {
    // Fallback: wrap in quotes and escape any embedded quotes.
    return '"' + ident.replace(/"/g, '""') + '"'
  }
  return '"' + ident + '"'
}
