-- Apply only to sessionai, after a verified backup of its application tables.
CREATE FULLTEXT INDEX ft_sessions_agent_search
  ON sessionai.sessions (title, first_prompt, transcript_text);
