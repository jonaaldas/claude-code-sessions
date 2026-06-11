#!/usr/bin/env bash
# Install the hourly full-sync launchd service (runs ingest.mjs --all every hour).
# Complements the real-time watcher. Run after ./setup-db.sh.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="dev.aldas.claude-sessions-sync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"

if [ ! -f "$DIR/.env" ]; then
  echo "Missing $DIR/.env — run ./setup-db.sh first." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s#__NODE__#$NODE#g" -e "s#__DIR__#$DIR#g" \
  "$DIR/dev.aldas.claude-sessions-sync.plist" > "$PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Loaded $LABEL (runs every hour + once on load)"
echo "Logs: $DIR/sync.log"
echo "Stop with: launchctl unload $PLIST"
