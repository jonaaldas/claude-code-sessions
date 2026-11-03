# Agent session lookup

Base URL: `https://session-claude.aldas.dev`

Both endpoints require `Authorization: Bearer $SESSION_API_KEY`. Browser cookies
do not authorize this API. Responses are private and not cached. The API key
grants read access to all session metadata, including private projects.

The Mac copy is `~/.secrets/session-claude-api.env` (mode 600). Load it without
printing it; do not use shell tracing or verbose curl:

```sh
set -a
source ~/.secrets/session-claude-api.env
set +a
```

## Search

`GET /api/v1/sessions/search`

Supply at least one of `branch`, `pr`, or `q`. Multiple filters are combined
with AND. Results are ordered by most recent session activity (`ended_at`, then
ID), with 10 results by default; `limit` can be 1–20.

- `branch`: exact recorded git branch.
- `pr`: a positive PR number or full GitHub pull request URL. Matches recorded
  PR metadata and references in cached transcripts. Numbers also match `#123`
  references; use a URL to distinguish repositories with the same PR number.
- `q`: plain keyword prefixes searched in transcript text, title, and first
  prompt using MySQL FULLTEXT. All words of at least three characters are
  required; shorter words are ignored. Use 1–12 such words, up to 256 characters.
  Normal full-text tokenization and stopword rules apply. This is word search,
  not an arbitrary substring or regex search.

Historical sessions without cached transcript text can match their title or
first prompt. Transcript references cannot be searched when that text was not
ingested. The API does not return full transcripts or messages.

```sh
curl -fsS -G 'https://session-claude.aldas.dev/api/v1/sessions/search' \
  -H "Authorization: Bearer $SESSION_API_KEY" \
  --data-urlencode 'branch=main' --data-urlencode 'limit=5'

curl -fsS -G 'https://session-claude.aldas.dev/api/v1/sessions/search' \
  -H "Authorization: Bearer $SESSION_API_KEY" \
  --data-urlencode 'pr=https://github.com/owner/repo/pull/123'

curl -fsS -G 'https://session-claude.aldas.dev/api/v1/sessions/search' \
  -H "Authorization: Bearer $SESSION_API_KEY" \
  --data-urlencode 'q=sessionai consolidation'
```

Response: `{ "sessions": [...] }`. Each row has `id`, `source`, `project`, `cwd`,
`branch`, `pr_url`, `pr_number`, `title`, `first_prompt`, `ended_at`, and
`updated_at`. Titles and first prompts are clipped to 160 and 240 characters.

## One session

`GET /api/v1/sessions/:id`

```sh
curl -fsS "https://session-claude.aldas.dev/api/v1/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $SESSION_API_KEY"
```

Response: `{ "session": {...} }`, adding `started_at`, `message_count`, and
bounded `summary` and `description` fields to the search metadata.

Missing/incorrect keys return 401; invalid parameters return 400; unknown IDs
return 404; methods other than GET return 405. Database failures return 503
without connection details. Keys in URLs or browser cookies are not accepted.

Deploy the `ft_sessions_agent_search` index from
`ops/migrations/001-agent-search.sql` before the image. Back up `sessionai`
first. This migration does not reference either archived database.
