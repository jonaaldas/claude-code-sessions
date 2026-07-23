export interface Session {
  id: string;
  source: "claude" | "codex" | null;
  title: string | null;
  summary: string | null;
  description: string | null;
  first_prompt: string | null;
  last_prompt: string | null;
  cwd: string | null;
  repo: string | null;
  git_branch: string | null;
  pr_url: string | null;
  pr_number: number | null;
  message_count: number;
  version: string | null;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
}
