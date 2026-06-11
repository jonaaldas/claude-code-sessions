<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useSessions } from "@/composables/useSessions";
import SessionsTable from "@/components/SessionsTable.vue";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { RefreshCw, Terminal } from "lucide-vue-next";

const { sessions, loading, error, configured, restricted, lastSynced, load } = useSessions();

const query = ref("");
const activeRepo = ref<string | null>(null);

onMounted(() => load());

function syncNow() {
  load(true); // force a fresh, cache-busted read from Turso
}

const repos = computed(() => {
  const counts = new Map<string, number>();
  for (const s of sessions.value) {
    if (s.repo) counts.set(s.repo, (counts.get(s.repo) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return sessions.value.filter((s) => {
    if (activeRepo.value && s.repo !== activeRepo.value) return false;
    if (!q) return true;
    return [s.title, s.summary, s.last_prompt, s.first_prompt, s.repo, s.git_branch, s.id]
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
          Claude Code Sessions
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Every session you've ended, with repo, branch & a one-click resume command.
        </p>
        <p v-if="restricted" class="mt-1 text-xs text-muted-foreground/80">
          Public view — showing selected projects only. Full history is private.
        </p>
      </div>
      <div class="flex flex-col items-end gap-1">
        <Button variant="outline" size="sm" :disabled="loading" @click="syncNow">
          <RefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
          {{ loading ? "Syncing…" : "Sync now" }}
        </Button>
        <span v-if="lastSynced" class="text-xs text-muted-foreground">
          Synced {{ relativeTime(lastSynced) }}
        </span>
      </div>
    </header>

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <Input
        v-model="query"
        placeholder="Search title, prompt, branch, repo…"
        class="max-w-sm"
      />
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
