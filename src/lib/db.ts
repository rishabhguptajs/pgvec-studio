import * as dns from 'dns'
import { Pool } from 'pg'

let preferredIpv4Dns = false

function preferIpv4Dns(): void {
  if (preferredIpv4Dns) return
  preferredIpv4Dns = true
  try {
    dns.setDefaultResultOrder('ipv4first')
  } catch {
    // Older Node versions may not support this option. The connection can
    // still proceed with Node's default DNS ordering.
  }
}

export function createPool(connectionString: string): Pool {
  preferIpv4Dns()
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
  const resolved = await resolveServerlessFriendlyConnectionString(
    connectionString,
  )
  const pool = createPool(resolved)
  try {
    return await fn(pool)
  } finally {
    await pool.end().catch(() => {})
  }
}

// --- Serverless-friendly connection string normalization -------------------
// Keep provider URLs intact whenever possible. Node is asked to prefer IPv4
// for dual-stack hosts, which fixes providers that publish both A and AAAA
// records. Supabase direct database hosts are the exception: their direct
// URL can be IPv6-only, so IPv4-only platforms such as Render need the
// built-in Supavisor transaction pooler on port 6543. That form is derived
// from the direct URL and does not require hard-coded cloud regions.

function parseConnectionUrl(connStr: string): URL | null {
  let url: URL
  try {
    url = new URL(connStr)
  } catch {
    return null
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return null
  }
  return url
}

function isSupabaseDirectUrl(url: URL): boolean {
  return (
    /^db\.[a-z0-9]+\.supabase\.co$/i.test(url.hostname) &&
    (url.port === '' || url.port === '5432')
  )
}

function buildSupabaseTransactionPoolerUrl(url: URL): string {
  const poolerUrl = new URL(url.toString())
  poolerUrl.protocol = 'postgresql:'
  poolerUrl.port = '6543'
  return poolerUrl.toString()
}

async function resolveServerlessFriendlyConnectionString(
  connStr: string,
): Promise<string> {
  const parsed = parseConnectionUrl(connStr)
  if (!parsed) return connStr

  if (isSupabaseDirectUrl(parsed)) {
    return buildSupabaseTransactionPoolerUrl(parsed)
  }

  return connStr
}

export function humanizePgError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: string })?.code

  if (code === 'ENETUNREACH' || /ENETUNREACH/.test(message)) {
    return 'Network unreachable — the database host resolved to an IPv6 address but your network has no IPv6 route. If this is a Supabase direct URL, the app will try the IPv4-compatible pooler automatically; otherwise use an IPv4-compatible database endpoint from your provider.'
  }
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
