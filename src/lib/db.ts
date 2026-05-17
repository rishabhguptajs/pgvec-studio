import * as dns from 'dns'
import * as net from 'net'
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
// shared Supavisor pooler. Supabase's direct URL does not contain the pooler
// region, so we infer it from AWS's public IP range feed and cache the result.

interface AwsIpv6Prefix {
  ipv6_prefix: string
  region: string
}

interface AwsIpRanges {
  ipv6_prefixes?: AwsIpv6Prefix[]
}

const AWS_IP_RANGES_URL = 'https://ip-ranges.amazonaws.com/ip-ranges.json'
const awsRegionCache = new Map<string, string>()
let awsIpv6PrefixesPromise: Promise<AwsIpv6Prefix[]> | null = null

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

function getSupabaseProjectRef(url: URL): string | null {
  return url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1] ?? null
}

function buildSupabasePoolerUrl(url: URL, poolerHost: string): string {
  const poolerUrl = new URL(url.toString())
  poolerUrl.protocol = 'postgresql:'
  poolerUrl.hostname = poolerHost
  poolerUrl.port = '6543'

  const projectRef = getSupabaseProjectRef(url)
  if (projectRef && !poolerUrl.username.includes('.')) {
    poolerUrl.username = `${poolerUrl.username || 'postgres'}.${projectRef}`
  }

  return poolerUrl.toString()
}

function buildSupabaseTransactionPoolerUrl(url: URL): string {
  const poolerUrl = new URL(url.toString())
  poolerUrl.protocol = 'postgresql:'
  poolerUrl.port = '6543'
  return poolerUrl.toString()
}

function ipv6ToBigInt(address: string): bigint | null {
  if (!net.isIPv6(address)) return null

  const [headPart, tailPart] = address.toLowerCase().split('::')
  const head = headPart ? headPart.split(':') : []
  const tail = tailPart ? tailPart.split(':') : []
  const missing = 8 - head.length - tail.length
  if (missing < 0) return null

  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail]
  if (groups.length !== 8) return null

  let out = BigInt(0)
  for (const group of groups) {
    const value = Number.parseInt(group || '0', 16)
    if (!Number.isFinite(value) || value < 0 || value > 0xffff) return null
    out = (out << BigInt(16)) + BigInt(value)
  }
  return out
}

function ipv6MatchesCidr(address: string, cidr: string): boolean {
  const [base, prefixText] = cidr.split('/')
  const bits = Number(prefixText)
  if (!base || !Number.isInteger(bits) || bits < 0 || bits > 128) return false

  const addressInt = ipv6ToBigInt(address)
  const baseInt = ipv6ToBigInt(base)
  if (addressInt === null || baseInt === null) return false

  const hostBits = 128 - bits
  const mask =
    hostBits === 128
      ? BigInt(0)
      : ((BigInt(1) << BigInt(bits)) - BigInt(1)) << BigInt(hostBits)
  return (addressInt & mask) === (baseInt & mask)
}

async function getAwsIpv6Prefixes(): Promise<AwsIpv6Prefix[]> {
  awsIpv6PrefixesPromise ??= fetch(AWS_IP_RANGES_URL)
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`AWS IP ranges request failed with ${res.status}`)
      }
      return (await res.json()) as AwsIpRanges
    })
    .then((data) => data.ipv6_prefixes ?? [])

  return awsIpv6PrefixesPromise
}

async function inferAwsRegionFromHostname(
  hostname: string,
): Promise<string | null> {
  const cached = awsRegionCache.get(hostname)
  if (cached) return cached

  let addresses: string[]
  try {
    addresses = await dns.promises.resolve6(hostname)
  } catch {
    return null
  }

  const prefixes = await getAwsIpv6Prefixes().catch(() => [])
  for (const address of addresses) {
    const match = prefixes.find((prefix) =>
      ipv6MatchesCidr(address, prefix.ipv6_prefix),
    )
    if (match?.region) {
      awsRegionCache.set(hostname, match.region)
      return match.region
    }
  }

  return null
}

async function resolveServerlessFriendlyConnectionString(
  connStr: string,
): Promise<string> {
  const parsed = parseConnectionUrl(connStr)
  if (!parsed) return connStr

  if (isSupabaseDirectUrl(parsed)) {
    const region = await inferAwsRegionFromHostname(parsed.hostname)
    if (region) {
      return buildSupabasePoolerUrl(
        parsed,
        `aws-0-${region}.pooler.supabase.com`,
      )
    }

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
