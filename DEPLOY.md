# Deploying the dashboard to session-claude.aldas.dev

Prerequisites: the Turso DB exists (`ingester/setup-db.sh` has run) and you have
its `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`.

## 1. Log in to Vercel

The CLI login is interactive (opens a browser). In this Claude session, run it
with the `!` prefix so the output lands here:

```
! vercel login
```

> Note: the bundled Vercel CLI is old (50.x). Upgrade for best results:
> `npm i -g vercel@latest`

## 2. Link the project

```bash
cd web
vercel link          # create a new project, e.g. "claude-sessions"
```

## 3. Add the Turso env vars (all environments)

```bash
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
# repeat for `preview` and `development` if you want `vercel dev` to work
```

Paste the exact values `setup-db.sh` printed. The `/api/sessions` function reads
these at request time.

## 4. Deploy

```bash
vercel --prod
```

Vercel auto-detects Vite: builds with `npm run build`, serves `dist/`, and turns
`api/sessions.ts` into a Node serverless function at `/api/sessions`.

## 5. Custom domain

```bash
vercel domains add session-claude.aldas.dev
```

Then add the DNS record Vercel shows you on the `aldas.dev` zone:

- If `aldas.dev` DNS is **on Vercel**: it's automatic.
- Otherwise add a **CNAME** `session-claude` → `cname.vercel-dns.com`
  (Vercel prints the exact target). Wait for propagation, then it's live.

## Local dev with live functions

```bash
cd web
vercel env pull .env.local    # pulls the Turso vars locally
vercel dev                    # runs Vite + /api together on localhost:3000
```

## Updating

Every `git push` to the linked repo (or `vercel --prod`) redeploys. The schema
is created on first write, so no migration step is needed.
