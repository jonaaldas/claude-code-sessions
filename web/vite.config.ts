import { defineConfig, loadEnv, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Vite doesn't run the Vercel serverless function in `api/`. Without this,
// `npm run dev` falls through to Vite's module transform and serves the
// transpiled source of api/sessions.ts, so the client's res.json() fails with
// "Unexpected token 'i', "import { c"...". This dev-only middleware answers
// /api/sessions from libsql directly, mirroring scripts/serve-local.js.
function devApi(env: Record<string, string>): Plugin {
  return {
    name: "dev-api-sessions",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/sessions", async (_req, res) => {
        try {
          const { createClient } = await import("@libsql/client");
          const client = createClient({
            url: env.TURSO_DATABASE_URL || "file:/tmp/sessions.db",
            authToken: env.TURSO_AUTH_TOKEN,
          });
          const r = await client.execute(
            `SELECT id, source, title, summary, first_prompt, last_prompt, cwd, repo, git_branch,
                    pr_url, pr_number, message_count, version, started_at, ended_at, updated_at
             FROM sessions ORDER BY ended_at DESC LIMIT 1000`
          );
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ sessions: r.rows, configured: true }));
        } catch (e: any) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [vue(), tailwindcss(), devApi(env)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
