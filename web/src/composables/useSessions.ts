import { ref } from "vue";
import type { Session } from "@/types";

export function useSessions() {
  const sessions = ref<Session[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const configured = ref(true);
  const restricted = ref(false);
  const authed = ref(false);
  const lastSynced = ref<string | null>(null);

  async function load(fresh = false) {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`/api/sessions${fresh ? "?fresh=1" : ""}`, {
        cache: fresh ? "no-store" : "default",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      sessions.value = data.sessions ?? [];
      configured.value = data.configured !== false;
      restricted.value = data.restricted === true;
      authed.value = data.authed === true;
      lastSynced.value = data.lastSynced ?? null;
    } catch (e: any) {
      error.value = e.message ?? String(e);
    } finally {
      loading.value = false;
    }
  }

  return { sessions, loading, error, configured, restricted, authed, lastSynced, load };
}
