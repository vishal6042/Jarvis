import { useEffect, useState } from "react";
import { getToken, me as fetchMe } from "@/api";
import type { Me } from "@/types";

/**
 * Who is signed in. The answer never changes within a session, so it is fetched once and shared:
 * every page that wants to know whether to offer an administrator-only control asks this rather
 * than making its own request.
 */
let pending: Promise<Me> | null = null;
let cached: Me | null = null;

export function loadSession(): Promise<Me> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = fetchMe().then((m) => {
      cached = m;
      return m;
    });
    // A failure must not be cached, or one dropped request leaves the app permanently unsure.
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}

/** Forget the cached answer — call on sign-out so the next person does not inherit it. */
export function clearSession(): void {
  cached = null;
  pending = null;
}

export function useSession(): { me: Me | null; loading: boolean } {
  const [me, setMe] = useState<Me | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    if (cached || !getToken()) {
      setLoading(false);
      return;
    }
    let live = true;
    loadSession()
      .then((m) => live && setMe(m))
      .catch(() => live && setMe(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  return { me, loading };
}

/** True only once we know the answer and it is yes. */
export function useIsAdmin(): boolean {
  return useSession().me?.admin ?? false;
}
