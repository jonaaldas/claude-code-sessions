#!/usr/bin/env bash
# Claude Code "Stop" hook — ingest the just-ended session into Turso.
#
# Claude pipes hook JSON (with transcript_path + session_id) on stdin. We hand
# that straight to the ingester, which pulls transcript_path out of it.
#
# Runs detached and always exits 0, so it never delays or blocks session
# shutdown even if Turso is unreachable. Output goes to ingest.log.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT="$(cat)"
echo "$INPUT" | nohup node "$DIR/ingest.js" >> "$DIR/ingest.log" 2>&1 &
exit 0
