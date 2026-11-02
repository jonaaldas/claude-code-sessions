# Deploying session-claude.aldas.dev

Production runs as the `session-claude` Compose app in the `session-AI` project
on Dokploy. GitHub Actions builds the Docker image; the VPS only pulls and runs
it. The previous Vercel project is retained.

## Build and deploy

Every push to `main` runs `.github/workflows/deploy.yml` on a GitHub runner:

1. Build `web/Dockerfile` for `linux/amd64`.
2. Push `ghcr.io/jonaaldas/claude-code-sessions:latest` and a commit SHA tag.
3. Call the Dokploy Compose webhook stored in the repository secret
   `DOKPLOY_WEBHOOK_URL`.

The workflow can also be started manually. Dokploy uses the raw, image-only
configuration in `compose.dokploy.yml`, with automatic deployments enabled and
the existing GHCR registry credentials. Its deployment command explicitly uses
`up -d --no-build --pull always --remove-orphans`. Keep the Dokploy Compose
configuration in sync when changing `compose.dokploy.yml`. Do not configure a
GitHub, Dockerfile, or Nixpacks build on the VPS.

## Runtime configuration

Set these variables in the Dokploy Compose environment, never in the
image or client build:

- `DATABASE_URL`: the SessionAI database credentials with internal Docker DNS
  host `sessionai-session-sainmp` and port `3306`, selecting the active ingester's
  `mysql` database for session reads.
- `AUTH_DATABASE_URL`: a separate internal connection to `claude_sessions`,
  where the original production login account lives. If unset, the API falls
  back to `DATABASE_URL` for deployments that use one database.
- `PUBLIC_REPOS`: the existing public repository allowlist.
- `AUTH_SECRET`: the dashboard's strong random cookie signing secret.
- `NODE_ENV`: `production`.
- `PORT`: `3000`.

The production Node server serves the built Vue SPA and reuses the existing
`/api/sessions`, `/api/login`, and `/api/logout` handlers. Production keeps the
public allowlist gate and Secure authentication cookies, including outside
Vercel. A change to `AUTH_SECRET` requires signing in again.

The app and database share `dokploy-network`. Do not point the web app at the
public database port. The Mac ingester continues to use the Tailscale address
on port `5657`; its configuration stays separate.

### Database history

The custom domain originally belonged to Vercel project `session-claude`.
The similarly named `claude-code-sessions` project was a separate deployment.
The original production store, `claude_sessions`, was initialized July 21, 2026.
The development/ingester store in `mysql` was initialized separately July 31.
They contain separate login hashes and session histories; they are not replicas.
The Dokploy migration initially copied the ingester connection for both login
and session reads. Authentication now uses the original production account
without changing either database or moving its data. Session reads continue to
use the current ingester's dataset.

Login logs record only outcomes and database error codes, never credentials,
email addresses, password hashes, cookies, or connection strings. Authentication
regression tests run during the image build on GitHub Actions.

## Domain and verification

Cloudflare DNS directs `session-claude.aldas.dev` to the Dokploy server.
`/etc/caddy/sites/session-claude.caddy` routes it to `127.0.0.1:3005`, with
automatic HTTPS from Caddy. Compose publishes container port `3000` only on
loopback, following the existing lifeOS deployment pattern. The server's
Traefik configuration is inactive.

Verify the homepage and `/api/sessions` over HTTPS after deployment. Public
database port `5657` is blocked on `eth0` by `/etc/block-public-ports.nft`, while
the Mac's Tailscale connection remains available. `/healthz` is a container
liveness endpoint; verify `/api/sessions` to check the database connection.

## Rollback

Select a previously verified commit SHA image tag in the Compose configuration and redeploy the
prebuilt image. Keep credentials and environment values out of logs. Do not
change the database schema or data as part of deployment.
