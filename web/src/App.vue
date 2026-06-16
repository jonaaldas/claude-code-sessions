<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useSessions } from "@/composables/useSessions";
import { useAuth } from "@/composables/useAuth";
import SessionsTable from "@/components/SessionsTable.vue";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { RefreshCw, Terminal, Lock, LogOut } from "lucide-vue-next";

const { sessions, loading, error, configured, restricted, authed, lastSynced, load } =
  useSessions();
const { submitting, error: authError, login, logout } = useAuth();

const query = ref("");
const activeRepo = ref<string | null>(null);
const activeAgent = ref<"claude" | "codex" | null>(null);

const showLogin = ref(false);
const email = ref("");
const password = ref("");

// If the owner is logged in (hint cookie present), fetch fresh so the CDN's
// cached public/gated response isn't shown to them on first paint.
const maybeAuthed = document.cookie.split("; ").includes("dash_authed=1");
onMounted(() => load(maybeAuthed));

function syncNow() {
  load(true); // force a fresh, cache-busted read from Turso
}

async function submitLogin() {
  if (await login(email.value, password.value)) {
    showLogin.value = false;
    email.value = "";
    password.value = "";
    load(true); // re-fetch — the gate is now lifted for this session
  }
}

async function doLogout() {
  await logout();
  load(true);
}

const repos = computed(() => {
  const counts = new Map<string, number>();
  for (const s of sessions.value) {
    if (s.repo) counts.set(s.repo, (counts.get(s.repo) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
});

// Agent counts drive the Claude/Codex filter chips (only shown when both exist).
const agents = computed(() => {
  const counts = new Map<string, number>();
  for (const s of sessions.value) {
    const a = s.source ?? "claude";
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return counts;
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return sessions.value.filter((s) => {
    if (activeRepo.value && s.repo !== activeRepo.value) return false;
    if (activeAgent.value && (s.source ?? "claude") !== activeAgent.value) return false;
    if (!q) return true;
    return [s.title, s.summary, s.last_prompt, s.first_prompt, s.repo, s.git_branch, s.source, s.id]
      .filter(Boolean)
      .some((f) => (f as string).toLowerCase().includes(q));
  });
});
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-10">
    <header class="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Terminal class="size-6" />
          Coding Agent Sessions
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Every Claude Code & Codex session you've ended, with repo, branch & a
          one-click resume command.
        </p>
        <p v-if="restricted" class="mt-1 text-xs text-muted-foreground/80">
          Public view — showing selected projects only. Full history is private.
        </p>
      </div>
      <div class="flex flex-col items-end gap-1">
        <div class="flex items-center gap-2">
          <Button
            v-if="authed"
            variant="ghost"
            size="sm"
            @click="doLogout"
            title="Log out"
          >
            <LogOut class="size-3.5" />
            Log out
          </Button>
          <Button
            v-else-if="restricted"
            variant="ghost"
            size="sm"
            @click="showLogin = !showLogin"
          >
            <Lock class="size-3.5" />
            Log in
          </Button>
          <Button variant="outline" size="sm" :disabled="loading" @click="syncNow">
            <RefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
            {{ loading ? "Syncing…" : "Sync now" }}
          </Button>
        </div>
        <span v-if="lastSynced" class="text-xs text-muted-foreground">
          Synced {{ relativeTime(lastSynced) }}
        </span>
      </div>
    </header>

    <form
      v-if="showLogin && !authed"
      class="mb-6 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
      @submit.prevent="submitLogin"
    >
      <div class="flex flex-col gap-1">
        <label class="text-xs text-muted-foreground">Email</label>
        <Input v-model="email" type="email" autocomplete="username" class="w-64" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-muted-foreground">Password</label>
        <Input
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="w-64"
        />
      </div>
      <Button type="submit" size="sm" :disabled="submitting">
        {{ submitting ? "Signing in…" : "Sign in" }}
      </Button>
      <span v-if="authError" class="text-sm text-destructive">{{ authError }}</span>
    </form>

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <Input
        v-model="query"
        placeholder="Search title, prompt, branch, repo…"
        class="max-w-sm"
      />
      <div v-if="agents.size > 1" class="flex items-center gap-1.5">
        <Badge
          v-for="agent in (['claude', 'codex'] as const)"
          :key="agent"
          v-show="agents.has(agent)"
          :variant="activeAgent === agent ? 'default' : 'outline'"
          class="cursor-pointer capitalize"
          @click="activeAgent = activeAgent === agent ? null : agent"
        >
          {{ agent }} <span class="opacity-60">{{ agents.get(agent) }}</span>
        </Badge>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <Badge
          :variant="activeRepo === null ? 'default' : 'outline'"
          class="cursor-pointer"
          @click="activeRepo = null"
        >
          All
        </Badge>
        <Badge
          v-for="[repo, n] in repos"
          :key="repo"
          :variant="activeRepo === repo ? 'default' : 'outline'"
          class="cursor-pointer"
          @click="activeRepo = activeRepo === repo ? null : repo"
        >
          {{ repo }} <span class="opacity-60">{{ n }}</span>
        </Badge>
      </div>
      <span class="ml-auto text-sm text-muted-foreground">
        {{ filtered.length }} session{{ filtered.length === 1 ? "" : "s" }}
      </span>
    </div>

    <div
      v-if="error"
      class="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      {{ error }}
    </div>

    <div
      v-if="!loading && !configured"
      class="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm"
    >
      <strong>Database not connected yet.</strong>
      Set <code>TURSO_DATABASE_URL</code> and <code>TURSO_AUTH_TOKEN</code> in this
      project's Vercel environment variables, then redeploy. Run
      <code>ingester/setup-db.sh</code> locally to create the Turso DB and get
      these values.
    </div>

    <SessionsTable v-if="configured || loading" :sessions="filtered" :loading="loading" />

    <footer class="mt-8 text-center text-xs text-muted-foreground">
      Collected automatically on session end · stored in Turso
    </footer>
  </div>
</template>
