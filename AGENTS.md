<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Pending database setup (read this first)

Some features are in the code but need a manual SQL step in Supabase before they work. When you start work on this repo, **tell the user about any item below that isn't checked off yet**, and remind them before merging `dev` → `main`.

Run each file in the Supabase dashboard → SQL Editor. Every script here is safe to re-run.

| Feature | SQL file | Dev Supabase | Production Supabase |
| --- | --- | --- | --- |
| Cash Out / coach payouts (Admin → Cash Payments → "Record Cash Out", net cash on Reports) | `database/cash_payouts.sql` | [ ] not run yet | [ ] not run yet |

Until `cash_payouts.sql` is run in an environment, the Cash Payments tab shows an amber warning there and Reports shows $0 cash out. Nothing else breaks.

When a step is done, change its `[ ]` to `[x]`. Remove the row once both environments are done.
