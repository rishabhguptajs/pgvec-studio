import { ConnectionForm } from '@/components/ConnectionForm'

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-10">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-mono text-3xl tracking-tight">
          <span className="text-[var(--accent)]">pgvec</span>
          <span className="text-[var(--text)]">-studio</span>
        </h1>
        <p className="text-sm text-[var(--text-muted)] font-mono">
          Visual explorer for pgvector embeddings
        </p>
      </header>
      <ConnectionForm />
      <footer className="text-[10px] font-mono text-[var(--text-muted)] tracking-widest uppercase">
        local · no telemetry · no auth
      </footer>
    </main>
  )
}
