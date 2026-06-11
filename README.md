# Claude Code Sessions

Automatically records every Claude Code session you end — session UUID, Claude's
own title, the repo, the git branch, the linked PR, message count and timestamps
— into [Turso](https://turso.tech), and shows them in a Vue + shadcn-vue
dashboard so you can jump back into any past session with one click.

![flow](https://img.shields.io/badge/hook-→_Turso_→_dashboard-blue)

```
┌──────────────────┐   Stop hook + watcher   ┌─────────┐   /api/sessions   ┌────────────────┐
│ ~/.claude/       │ ──────────────────────▶ │  Turso  │ ────────────────▶ │ Vue + shadcn   │
│ projects/*.jsonl │   parse + upsert         │ (libSQL)│                   │ dashboard      │
└──────────────────┘                          └─────────┘                   └────────────────┘
```

## What gets captured

For every session transcript under `~/.claude/projects/`:

| Field | Source |
|-------|--------|
| `id` | session UUID |
| `title` | Claude's generated session title (`ai-title`) |
| `last_prompt` / `first_prompt` | your prompts |
| `repo` | GitHub repo from the PR link, else the cwd basename |
| `git_branch`, `cwd` | the working session |
| `pr_url`, `pr_number` | linked pull request |
| `message_count`, `version`, `started_at`, `ended_at` | metadata |

Resume any session from the dashboard — it copies `claude --resume <uuid>`.

## Layout

```
ingester/   Node parser + Turso writer, the Stop hook, the background watcher
web/        Vite + Vue 3 + shadcn-vue dashboard with a Vercel /api function
```

## Setup (≈5 minutes)

### 1. Collector (local machine)

```bash
# In this session you can run interactive logins with the ! prefix:
#   ! turso auth login
cd ingester
npm install
./setup-db.sh            # creates the `claude-sessions` Turso DB + writes .env
node ingest.js --all    # backfill every existing session
./install-watcher.sh     # real-time background watcher (launchd, starts at login)
./install-hourly-sync.sh # hourly full re-sync (launchd safety net)
```

The **Stop hook is already registered** in `~/.claude/settings.json`, so from now
on every session you end is ingested automatically. The watcher is a belt-and-
suspenders background collector that also catches mid-session updates.

### Why the hourly sync runs locally, not on Vercel

Your session transcripts live in `~/.claude/projects/` on **your machine**. Only
something local can read them, so the local→Turso ingestion (the part that
actually "syncs") runs here via three layers: the **Stop hook** (on session end),
the **watcher** (real-time), and the **hourly sync** (`ingest.js --all`, a
backstop). A Vercel cron can't see your laptop's files, so there's nothing for it
to ingest. The dashboard reads Turso live — it's always current — and the **Sync
now** button just force-pulls the latest from Turso (cache-busted), with the
header showing when the data was last written.

### 2. Dashboard (Vercel)

See [`DEPLOY.md`](./DEPLOY.md). Short version:

```bash
cd web
npm install
#   ! vercel login
vercel link
vercel env add TURSO_DATABASE_URL    # same value setup-db.sh printed
vercel env add TURSO_AUTH_TOKEN
vercel --prod
vercel domains add session-claude.aldas.dev   # then point DNS as instructed
```

## Local preview (no Turso, no Vercel)

```bash
cd ingester && TURSO_DATABASE_URL="file:/tmp/s.db" node ingest.js --all
cd ../web && npm run build
TURSO_DATABASE_URL="file:/tmp/s.db" node scripts/serve-local.js   # http://localhost:4321
```

## How collection works

- **Stop hook** (`ingester/hooks/on-stop.sh`): Claude pipes the ended session's
  `transcript_path` to it; it ingests that one file in the background and always
  exits 0, so it never blocks or delays session shutdown.
- **Watcher** (`ingester/watch.js`): watches `~/.claude/projects` and upserts
  any changed transcript (debounced). Runs as a launchd service.

Both call the same idempotent parser + `INSERT … ON CONFLICT DO UPDATE`, so
re-ingesting a session just refreshes its row.
