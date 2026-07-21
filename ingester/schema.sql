-- Claude Code session registry (MySQL 8)
CREATE TABLE IF NOT EXISTS sessions (
  id              VARCHAR(255) NOT NULL,        -- session UUID (Claude sessionId / Codex rollout id)
  source          VARCHAR(32) DEFAULT 'claude', -- which agent produced it: 'claude' | 'codex'
  title           TEXT,               -- Claude's own generated session title
  summary         TEXT,               -- compaction summary, when present
  first_prompt    TEXT,               -- first real user prompt (context)
  last_prompt     TEXT,               -- most recent user prompt
  cwd             TEXT,               -- working directory
  repo            VARCHAR(255),       -- repo label (GitHub repo or cwd basename)
  git_branch      VARCHAR(255),
  pr_url          TEXT,
  pr_number       INT,
  pr_repository   VARCHAR(255),
  message_count   INT DEFAULT 0,
  version         VARCHAR(64),        -- Claude Code version
  started_at      VARCHAR(40),        -- ISO timestamp of first message
  ended_at        VARCHAR(40),        -- ISO timestamp of last message
  updated_at      VARCHAR(40),        -- ISO timestamp of last ingest
  transcript_path TEXT,
  PRIMARY KEY (id),
  INDEX idx_sessions_ended  (ended_at),
  INDEX idx_sessions_repo   (repo),
  INDEX idx_sessions_branch (git_branch),
  INDEX idx_sessions_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-owner login for the dashboard. A valid session cookie (minted by
-- /api/login after a scrypt password check) lifts the public privacy gate so
-- the owner can see non-allowlisted (e.g. work) repos. Seed with
-- web/scripts/set-password.js.
CREATE TABLE IF NOT EXISTS auth_users (
  email         VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,   -- scrypt, stored as "salt:hash" (hex)
  created_at    VARCHAR(40),
  PRIMARY KEY (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
