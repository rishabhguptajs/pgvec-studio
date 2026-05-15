# Contributing to pgvec-studio

Thanks for your interest. Contributions of all kinds are welcome — bug fixes, new features, docs, and issue reports.

## Getting started

```bash
git clone https://github.com/rishabhguptajs/pgvec-studio
cd pgvec-studio
npm install
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000). You need a Postgres database with pgvector installed to test against.

## Project structure

```
src/
  app/
    api/          # Next.js API routes (server-side, talk directly to Postgres)
    studio/       # Main explorer page
    page.tsx      # Connection form (landing page)
  components/     # React UI components
  lib/
    db.ts         # Postgres pool + query helpers
    umap.ts       # UMAP dimensionality reduction wrapper
    cosine.ts     # Cosine similarity math
    types.ts      # Shared TypeScript types
```

## Before submitting a PR

1. Run `npm run lint` and `npx tsc --noEmit` — both must pass
2. If you added a new API route, make sure it validates inputs and uses `quoteIdent()` for all Postgres identifiers
3. Keep the zero-telemetry / zero-auth guarantee: no outbound calls, no tracking, no secrets stored server-side
4. One focused change per PR — don't bundle unrelated fixes

## Reporting bugs

Open an issue and include:
- The error message or unexpected behavior
- Your Postgres version and pgvector version
- Steps to reproduce (a minimal connection string format or schema is helpful)

## Feature requests

Open an issue describing the use case. Explaining *why* you need it is more useful than just *what* you want.
