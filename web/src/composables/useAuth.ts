import { ref } from "vue";

// Thin client for the owner login. The actual session lives in an HttpOnly
// cookie, so there's no token to hold here — we just drive the endpoints and
// let the caller re-fetch /api/sessions afterwards.
export function useAuth() {
  const submitting = ref(false);
  const error = ref<string | null>(null);

  async function login(email: string, password: string): Promise<boolean> {
    submitting.value = true;
    error.value = null;
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error.value = data.error || `Login failed (HTTP ${res.status})`;
        return false;
      }
      return true;
    } catch (e: any) {
      error.value = e.message ?? String(e);
      return false;
    } finally {
      submitting.value = false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
  }

  return { submitting, error, login, logout };
}
