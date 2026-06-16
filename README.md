# Coding Agent Sessions

A self-hosted dashboard that automatically records every
[Claude Code](https://claude.com/claude-code) and
[Codex CLI](https://developers.openai.com/codex/cli) session you run — its UUID,
title, repo, git branch, linked PR, message count and timestamps — into a
[Turso](https://turso.tech) database, and shows them in a Vue + shadcn-vue table
so you can find and resume any past session with one click.

> Both agents store each session as a JSONL transcript on disk but give you no
> overview of them. This project turns that pile of files into a searchable,
> always-current dashboard, tagging each row with the agent that produced it.

## Stack

| Layer | Tech |
|-------|------|
| Ingestion | Node.js (ESM), `chokidar`, macOS `launchd` |
| Database | Turso / libSQL (`@libsql/client`) |
| API | Vercel Serverless Function (Node) |
| Frontend | Vite + Vue 3 + TypeScript + Tailwind v4 + shadcn-vue |
| Hosting | Vercel (static SPA + `/api`) |

## How it works

```
   YOUR MACHINE                                   CLOUD
   ~/.claude/projects/*.jsonl
   ~/.codex/sessions/**/*.jsonl
         │  read (fs)
         ▼
   parse → upsert ───── libSQL INSERT ─────▶  Turso  ◀── SELECT ── Vercel /api/sessions
         ▲                                                              │ JSON
   Stop hook · watcher · hourly cron                                    ▼
   (all local — only your machine can read the files)            Vue + shadcn dashboard
```

Collection runs **locally** in three layers, because only your machine can read
your session files:

1. **Stop hook** — the moment you end a Claude Code session, it pipes its
   `transcript_path` to a hook that ingests it.
2. **Watcher** — a `launchd` background service watches both `~/.claude/projects`
   and `~/.codex/sessions` and upserts any transcript that changes, in real time.
3. **Hourly sync** — a `launchd` job runs a full re-scan once an hour as a backstop.

All three call the same idempotent parser (auto-detecting Claude vs. Codex
transcripts) and `INSERT … ON CONFLICT DO UPDATE`, so a session always resolves
to exactly one row reflecting its latest state.

The dashboard reads Turso live through a Vercel serverless function (which keeps
the database token server-side), so the table is always current. A **Sync now**
button force-pulls the latest and the header shows when the data was last written.

## What gets captured

For every transcript under `~/.claude/projects/`:

| Field | Source |
|-------|--------|
| `id` | session UUID |
| `title` | Claude's generated session title |
| `first_prompt` / `last_prompt` | your prompts (with secrets redacted) |
| `repo` | GitHub repo from the linked PR, else the working-dir name |
| `git_branch`, `cwd` | the working session |
| `pr_url`, `pr_number` | linked pull request |
| `message_count`, `version`, `started_at`, `ended_at` | metadata |

## Repository layout

```
ingester/   Node parser + Turso writer, the Stop hook, watcher, hourly sync
web/        Vue dashboard + Vercel /api/sessions function
```

## Run it yourself

### 1. Collector (local machine)

```bash
turso auth login              # one-time
cd ingester
npm install
./setup-db.sh                 # creates the Turso DB + writes .env
node ingest.js --all          # backfill existing sessions
./install-watcher.sh          # real-time watcher (launchd)
./install-hourly-sync.sh      # hourly full re-sync (launchd)
```

The Stop hook registers itself in `~/.claude/settings.json`, so every session you
end from now on is ingested automatically.

### 2. Dashboard (Vercel)

```bash
cd web
npm install
vercel link
vercel env add TURSO_DATABASE_URL    # value from setup-db.sh
vercel env add TURSO_AUTH_TOKEN
vercel --prod
```

Set the Vercel project's **Root Directory** to `web`. Connect the GitHub repo for
push-to-deploy. See [`DEPLOY.md`](./DEPLOY.md) for custom-domain setup.

## Local preview (no Turso, no Vercel)

`@libsql/client` speaks local SQLite too, so you can run the whole thing offline:

```bash
cd ingester && TURSO_DATABASE_URL="file:/tmp/s.db" node ingest.js --all
cd ../web && npm run build
TURSO_DATABASE_URL="file:/tmp/s.db" node scripts/serve-local.js   # http://localhost:4321
```

## Privacy

The deployed dashboard is **public-safe by design**:

- The `/api/sessions` function only exposes repos listed in the `PUBLIC_REPOS`
  env var (comma-separated, case-insensitive). It **fails closed** — if
  `PUBLIC_REPOS` is unset, the public site shows nothing.
- Run locally (no `VERCEL` env, e.g. `serve-local.js`) and you see your full
  history; the allowlist only applies on the deployed site.

So you can keep work/employer sessions private while still showing the tool
working with your personal projects.

## Notes

- **Secret redaction**: prompts are scanned for common token shapes (API keys,
  JWTs, etc.) and redacted before they ever reach the database.
- **Idempotent ingest**: re-reading a session updates its row instead of
  duplicating it.

## License

MIT
