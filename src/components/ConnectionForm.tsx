'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, Loader2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { TableInfo } from '@/lib/types'

const STORAGE_KEY = 'pgvec-studio:connection-string'
const REMEMBER_KEY = 'pgvec-studio:connection-string:saved'

export function ConnectionForm() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [remember, setRemember] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tables, setTables] = useState<TableInfo[] | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY)
    if (saved) {
      setValue(saved)
      setRemember(true)
      setHasSaved(true)
    }
  }, [])

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    setBusy(true)
    setError(null)
    setTables(null)
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: value.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not connect.')
        return
      }
      sessionStorage.setItem(STORAGE_KEY, value.trim())
      if (remember) localStorage.setItem(REMEMBER_KEY, value.trim())
      else localStorage.removeItem(REMEMBER_KEY)
      setTables(data.tables ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect.')
    } finally {
      setBusy(false)
    }
  }

  function forgetSaved() {
    localStorage.removeItem(REMEMBER_KEY)
    setRemember(false)
    setHasSaved(false)
    setValue('')
  }

  function enterStudio() {
    router.push('/studio')
  }

  return (
    <div className="w-full max-w-xl flex flex-col gap-6">
      <Card className="p-6">
        <form onSubmit={handleConnect} className="flex flex-col gap-4">
          <label className="text-xs font-mono text-[var(--text-muted)] tracking-wide">
            POSTGRES_CONNECTION_STRING
          </label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="postgres://user:password@host:5432/dbname"
            className="font-mono"
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--accent)] cursor-pointer"
              />
              Remember on this machine
              {hasSaved && (
                <button
                  type="button"
                  onClick={forgetSaved}
                  className="ml-1 underline decoration-dotted hover:text-[var(--text)]"
                >
                  forget
                </button>
              )}
            </label>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  Connect
                </>
              )}
            </Button>
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            {remember
              ? 'Saved locally in your browser. Never sent anywhere else.'
              : 'Your connection string never leaves your machine.'}
          </span>
          {error && (
            <div className="rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-3 py-2 text-xs font-mono text-[var(--destructive)]">
              {error}
            </div>
          )}
        </form>
      </Card>

      {tables && (
        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-sm">Tables with vector columns</h2>
              <Badge variant="muted">{tables.length}</Badge>
            </div>
            <Button onClick={enterStudio} size="sm">
              Enter studio
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {tables.length === 0 ? (
            <p className="text-xs font-mono text-[var(--text-muted)]">
              No tables with vector columns were found in this database. Make
              sure pgvector is installed and at least one table has a column of
              type <code>vector</code>.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 max-h-64 overflow-auto">
              {tables.map((t) => (
                <li
                  key={`${t.schema}.${t.tableName}`}
                  className="flex items-center justify-between text-xs font-mono py-1.5 px-2 rounded hover:bg-[var(--bg-hover)]"
                >
                  <span className="text-[var(--text)]">
                    <span className="text-[var(--text-muted)]">
                      {t.schema}.
                    </span>
                    {t.tableName}
                  </span>
                  <span className="flex items-center gap-2 text-[var(--text-muted)]">
                    <Badge variant="default">
                      {Array.isArray(t.vectorColumns)
                        ? t.vectorColumns.join(', ')
                        : String(t.vectorColumns ?? '')}
                    </Badge>
                    <span>{t.rowCount.toLocaleString()} rows</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
