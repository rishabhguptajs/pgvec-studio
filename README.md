# pgvec-studio

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)

A visual explorer for pgvector embeddings. Because staring at 1536 floating point numbers in a terminal and pretending you understand your data is not a great strategy.

You paste a connection string, pick a table, click Visualize, and your embeddings show up as an interactive 2D scatter plot — projected down from whatever cursed dimensionality your model decided to use. Click a point, inspect its metadata, find its neighbors, export what you need. That's it.

No cloud. No account. No "we've updated our privacy policy." Everything runs on your machine through a local Next.js server. Your connection string lives in `sessionStorage` and dies when you close the tab, exactly like it should.

![Connection page](.github/assets/connection.png)

![Studio with embeddings visualized](.github/assets/studio.png)

## What you get

**2D visualization** — UMAP takes your high-dimensional vectors and squishes them into 2D in a way that actually preserves neighborhood structure. Semantically similar embeddings cluster together. You can finally see what your model is doing.

**Vector similarity search** — paste a raw vector and find its nearest neighbors in your table. Useful for debugging retrieval, spot-checking embedding quality, or confirming that your chunks aren't all identical.

**Metadata filtering** — filter rows by any non-vector column before running the visualization. If you have 2 million rows and only care about `source = 'docs'`, narrow it down first. The UI caps at 2,000 points and will tell you if you're hitting the limit.

**Row inspector** — click any point on the scatter plot to see all its metadata. There's a button to load that row's vector directly into the search panel, which makes it really easy to explore the neighborhood around any point.

**Cosine similarity calculator** — compare any two rows by their IDs and get the cosine similarity back. Good for sanity checking ("why are these two docs showing up in the same results?").

**Export** — download the current filtered view as CSV or JSON. Useful when you want to take the data somewhere else without running another SQL query.

## Quick start

```bash
git clone https://github.com/rishabhguptajs/pgvec-studio
cd pgvec-studio
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste your connection string.

## Connection strings that work

```
postgresql://user:password@localhost:5432/mydb
postgresql://user:password@host.neon.tech/mydb?sslmode=require
postgresql://user:password@project.supabase.co:5432/postgres
```

SSL is auto-detected for Neon and Supabase. For anything else that needs SSL, add `?sslmode=require` to your connection string and it'll figure it out.

## Requirements

PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) installed and at least one table with a `vector` column. Node.js 18 or later on your machine.

The app reads from your database. It doesn't write anything, create anything, or modify anything. A read-only Postgres user is fine and probably a good idea.

## Why does this exist

Most tools for working with embeddings either require you to use their specific vector database, live behind a SaaS login, or ask you to upload your data to their servers. This one doesn't do any of that. If you already have pgvector and want to see what's actually in your tables without leaving your terminal workflow, this is for you.

## Tech stack

Built with Next.js 16, TypeScript, and Tailwind CSS. The server-side routes talk to Postgres directly via `node-postgres`. Dimensionality reduction is handled by `umap-js` (no Python, no separate process). Plotting is Plotly.js.

## Contributing

Bug reports, feature requests, and pull requests are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up locally and what to keep in mind before opening a PR.

## License

[MIT](LICENSE)