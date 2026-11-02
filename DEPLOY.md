# Deploying session-claude.aldas.dev

Production runs as the `session-claude` application in the `session-AI` project
on Dokploy. GitHub Actions builds the Docker image; the VPS only pulls and runs
it. The previous Vercel project is retained.

## Build and deploy

Every push to `main` runs `.github/workflows/deploy.yml` on a GitHub runner:

1. Build `web/Dockerfile` for `linux/amd64`.
2. Push `ghcr.io/jonaaldas/claude-code-sessions:latest` and a commit SHA tag.
3. Call the Dokploy application webhook stored in the repository secret
   `DOKPLOY_WEBHOOK_URL`.

The workflow can also be started manually. Dokploy's source must stay set to
**Docker image**, with the existing GHCR pull credentials and automatic
deployments enabled. Do not configure a GitHub, Dockerfile, or Nixpacks build
on the VPS.

## Runtime configuration

Set these variables in the Dokploy application's environment, never in the
image or client build:

- `DATABASE_URL`: the SessionAI database credentials with internal Docker DNS
  host `sessionai-session-sainmp` and port `3306`.
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

## Domain and verification

Cloudflare DNS directs `session-claude.aldas.dev` to the Dokploy server. The
application's Dokploy domain routes to internal port `3000`, with HTTPS and
the existing Traefik Let's Encrypt resolver.

Verify the homepage and `/api/sessions` over HTTPS after deployment. Public
database port `5657` is blocked on `eth0` by `/etc/block-public-ports.nft`, while
the Mac's Tailscale connection remains available. `/healthz` is a container
liveness endpoint; verify `/api/sessions` to check the database connection.

## Rollback

Select a previously verified commit SHA image tag in Dokploy and redeploy the
prebuilt image. Keep credentials and environment values out of logs. Do not
change the database schema or data as part of deployment.
