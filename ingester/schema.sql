-- Claude Code session registry
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,   -- Claude sessionId (UUID)
  title           TEXT,               -- Claude's own generated session title
  summary         TEXT,               -- compaction summary, when present
  first_prompt    TEXT,               -- first real user prompt (context)
  last_prompt     TEXT,               -- most recent user prompt
  cwd             TEXT,               -- working directory
  repo            TEXT,               -- repo label (GitHub repo or cwd basename)
  git_branch      TEXT,
  pr_url          TEXT,
  pr_number       INTEGER,
  pr_repository   TEXT,
  message_count   INTEGER DEFAULT 0,
  version         TEXT,               -- Claude Code version
  started_at      TEXT,               -- ISO timestamp of first message
  ended_at        TEXT,               -- ISO timestamp of last message
  updated_at      TEXT,               -- ISO timestamp of last ingest
  transcript_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_ended  ON sessions(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_repo   ON sessions(repo);
CREATE INDEX IF NOT EXISTS idx_sessions_branch ON sessions(git_branch);
