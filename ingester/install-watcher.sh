#!/usr/bin/env bash
# Install the Claude session watcher as a launchd service (starts at login,
# restarts if it dies). Run after ./setup-db.sh has created .env.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="dev.aldas.claude-sessions-watcher"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"

if [ ! -f "$DIR/.env" ]; then
  echo "Missing $DIR/.env — run ./setup-db.sh first." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s#__NODE__#$NODE#g" -e "s#__DIR__#$DIR#g" \
  "$DIR/dev.aldas.claude-sessions-watcher.plist" > "$PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Loaded $LABEL"
echo "Logs: $DIR/watch.log"
echo "Stop with: launchctl unload $PLIST"
