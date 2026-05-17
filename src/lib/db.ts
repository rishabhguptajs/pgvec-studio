import { Client, Pool } from 'pg'

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

// --- Supabase direct → Supavisor pooler rewrite ----------------------------
// Supabase's direct host `db.<ref>.supabase.co` is IPv6-only on the free tier.
// Vercel functions (and many other serverless platforms) have no IPv6 egress,
// so connection fails with ENOTFOUND. The Supavisor pooler at
// `aws-0-<region>.pooler.supabase.com` is dual-stack, so we transparently
// rewrite to it. The region isn't in the original URL, so we probe known
// regions in parallel on first use and cache the winner per project ref.

const SUPABASE_AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'ca-central-1',
  'sa-east-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-central-2',
  'eu-north-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
]

const supabaseRegionCache = new Map<string, string>()

interface SupabaseDirectParts {
  user: string
  password: string
  projectRef: string
  database: string
  search: string
}

function parseSupabaseDirect(connStr: string): SupabaseDirectParts | null {
  let url: URL
  try {
    url = new URL(connStr)
  } catch {
    return null
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return null
  const m = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
  if (!m) return null
  return {
    user: decodeURIComponent(url.username) || 'postgres',
    password: decodeURIComponent(url.password),
    projectRef: m[1],
    database: url.pathname.replace(/^\//, '') || 'postgres',
    search: url.search,
  }
}

function buildPoolerUrl(p: SupabaseDirectParts, region: string): string {
  const user = encodeURIComponent(`${p.user}.${p.projectRef}`)
  const password = encodeURIComponent(p.password)
  return `postgresql://${user}:${password}@aws-0-${region}.pooler.supabase.com:5432/${p.database}${p.search}`
}

async function resolveServerlessFriendlyConnectionString(
  connStr: string,
): Promise<string> {
  const parsed = parseSupabaseDirect(connStr)
  if (!parsed) return connStr

  const cached = supabaseRegionCache.get(parsed.projectRef)
  if (cached) return buildPoolerUrl(parsed, cached)

  const attempts = SUPABASE_AWS_REGIONS.map(async (region) => {
    const candidate = buildPoolerUrl(parsed, region)
    const client = new Client({
      connectionString: candidate,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 4000,
    })
    try {
      await client.connect()
      return { region, candidate }
    } finally {
      await client.end().catch(() => {})
    }
  })

  try {
    const winner = await Promise.any(attempts)
    supabaseRegionCache.set(parsed.projectRef, winner.region)
    return winner.candidate
  } catch {
    return connStr
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
