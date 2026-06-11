<script setup lang="ts">
import { ref } from "vue";
import type { Session } from "@/types";
import { relativeTime, fullTime } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, GitPullRequest, Copy, Check, MessagesSquare } from "lucide-vue-next";

defineProps<{ sessions: Session[]; loading: boolean }>();

const copiedId = ref<string | null>(null);

async function copyResume(s: Session) {
  const cmd = `claude --resume ${s.id}`;
  try {
    await navigator.clipboard.writeText(cmd);
    copiedId.value = s.id;
    setTimeout(() => (copiedId.value = null), 1500);
  } catch {
    /* clipboard blocked */
  }
}

function label(s: Session): string {
  return s.title || s.summary || s.last_prompt || s.first_prompt || "Untitled session";
}
</script>

<template>
  <div class="rounded-xl border bg-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-[40%]">Session</TableHead>
          <TableHead>Repo</TableHead>
          <TableHead>Branch</TableHead>
          <TableHead class="text-right">Msgs</TableHead>
          <TableHead>PR</TableHead>
          <TableHead>Ended</TableHead>
          <TableHead class="text-right">Resume</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty v-if="!loading && sessions.length === 0" :colspan="7">
          No sessions yet. End a Claude Code session to populate this table.
        </TableEmpty>
        <TableRow v-for="s in sessions" :key="s.id">
          <TableCell>
            <div class="font-medium leading-tight">{{ label(s) }}</div>
            <div
              v-if="s.last_prompt && s.last_prompt !== label(s)"
              class="mt-0.5 line-clamp-1 text-xs text-muted-foreground"
            >
              {{ s.last_prompt }}
            </div>
            <code class="text-[10px] text-muted-foreground/70">{{ s.id }}</code>
          </TableCell>
          <TableCell>
            <Badge variant="secondary">{{ s.repo || "—" }}</Badge>
          </TableCell>
          <TableCell>
            <span class="inline-flex items-center gap-1 text-sm">
              <GitBranch class="size-3.5 text-muted-foreground" />
              {{ s.git_branch || "—" }}
            </span>
          </TableCell>
          <TableCell class="text-right">
            <span class="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MessagesSquare class="size-3.5" />
              {{ s.message_count }}
            </span>
          </TableCell>
          <TableCell>
            <a
              v-if="s.pr_url"
              :href="s.pr_url"
              target="_blank"
              rel="noreferrer"
              class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <GitPullRequest class="size-3.5" />#{{ s.pr_number }}
            </a>
            <span v-else class="text-muted-foreground">—</span>
          </TableCell>
          <TableCell>
            <span :title="fullTime(s.ended_at)" class="text-sm text-muted-foreground">
              {{ relativeTime(s.ended_at) }}
            </span>
          </TableCell>
          <TableCell class="text-right">
            <Button
              size="sm"
              variant="outline"
              @click="copyResume(s)"
              :title="`claude --resume ${s.id}`"
            >
              <Check v-if="copiedId === s.id" class="size-3.5" />
              <Copy v-else class="size-3.5" />
              {{ copiedId === s.id ? "Copied" : "Resume" }}
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
