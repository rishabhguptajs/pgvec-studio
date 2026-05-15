'use client'

import { useState } from 'react'
import { Calculator, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export function SimilarityCalculator({
  onCompute,
}: {
  onCompute: (
    a: string,
    b: string,
  ) => Promise<{ similarity: number } | { error: string }>
}) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<number | null>(null)

  async function run() {
    if (!a.trim() || !b.trim()) return
    setBusy(true)
    setResult(null)
    try {
      const res = await onCompute(a.trim(), b.trim())
      if ('error' in res) {
        toast.error(res.error)
      } else {
        setResult(res.similarity)
      }
    } finally {
      setBusy(false)
    }
  }

  const badge =
    result === null
      ? null
      : result > 0.9 ? (
          <Badge variant="success">Very similar</Badge>
        ) : result > 0.7 ? (
          <Badge variant="warning">Somewhat similar</Badge>
        ) : (
          <Badge variant="destructive">Dissimilar</Badge>
        )

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-xs text-[var(--text-muted)] tracking-wider uppercase">
        Cosine similarity
      </h3>
      <div className="flex gap-1">
        <Input
          value={a}
          onChange={(e) => setA(e.target.value)}
          placeholder="row id A"
          className="text-xs font-mono"
        />
        <Input
          value={b}
          onChange={(e) => setB(e.target.value)}
          placeholder="row id B"
          className="text-xs font-mono"
        />
      </div>
      <Button
        size="sm"
        onClick={run}
        disabled={busy || !a.trim() || !b.trim()}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Calculator className="h-3 w-3" />
        )}
        Calculate
      </Button>
      {result !== null && (
        <div className="flex items-center justify-between rounded-md bg-[var(--bg)] border border-[var(--border)] px-3 py-2">
          <span className="text-2xl font-mono text-[var(--accent)]">
            {result.toFixed(4)}
          </span>
          {badge}
        </div>
      )}
    </div>
  )
}
