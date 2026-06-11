#!/usr/bin/env bash
# One-time Turso setup. Requires: `turso auth login` already done.
# Creates the `claude-sessions` database, applies the schema, mints a token,
# and writes ingester/.env (used by the hook, the watcher, and manual ingests).
set -euo pipefail

DB_NAME="${1:-claude-sessions}"
DB_GROUP="${2:-default}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v turso >/dev/null; then
  echo "turso CLI not found. Install: brew install tursodatabase/tap/turso" >&2
  exit 1
fi

if ! turso auth whoami >/dev/null 2>&1; then
  echo "Not logged in to Turso. Run:  turso auth login" >&2
  exit 1
fi

# Create the DB if it doesn't exist yet.
if turso db show "$DB_NAME" >/dev/null 2>&1; then
  echo "Database '$DB_NAME' already exists — reusing it."
else
  echo "Creating database '$DB_NAME' in group '$DB_GROUP'…"
  turso db create "$DB_NAME" --group "$DB_GROUP"
fi

echo "Applying schema…"
turso db shell "$DB_NAME" < "$DIR/schema.sql"

URL="$(turso db show "$DB_NAME" --url)"
echo "Minting auth token…"
TOKEN="$(turso db tokens create "$DB_NAME")"

cat > "$DIR/.env" <<EOF
TURSO_DATABASE_URL=$URL
TURSO_AUTH_TOKEN=$TOKEN
EOF
chmod 600 "$DIR/.env"

echo
echo "Wrote $DIR/.env"
echo "  URL: $URL"
echo
echo "Next:"
echo "  1. Backfill existing sessions:   node $DIR/ingest.mjs --all"
echo "  2. Install background watcher:    $DIR/install-watcher.sh"
echo "  3. Deploy the dashboard:          see web/ and DEPLOY.md"
echo
echo "For the Vercel dashboard, set the SAME two vars there:"
echo "  vercel env add TURSO_DATABASE_URL    # paste: $URL"
echo "  vercel env add TURSO_AUTH_TOKEN      # paste the token above"
