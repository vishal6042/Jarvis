import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getPreferences, putPreference } from "@/api";

/**
 * User preferences live in the database (auth-service /api/preferences), not the browser, so
 * they follow the user across devices. The provider loads them once after login and writes
 * changes back with a short per-key debounce; reads are synchronous from the in-memory copy.
 */
type Prefs = Record<string, unknown>;

interface PrefsCtx {
  prefs: Prefs;
  loaded: boolean;
  set: (key: string, value: unknown) => void;
}

const PrefsContext = createContext<PrefsCtx>({ prefs: {}, loaded: false, set: () => {} });

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>({});
  const [loaded, setLoaded] = useState(false);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    let alive = true;
    getPreferences()
      .then((p) => {
        if (alive) setPrefs(p ?? {});
      })
      .catch(() => {
        /* offline / not yet migrated: fall back to defaults */
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const set = useCallback((key: string, value: unknown) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(() => {
      putPreference(key, value).catch(() => {
        /* keep the optimistic value; next change retries */
      });
    }, 400);
  }, []);

  const ctx = useMemo<PrefsCtx>(() => ({ prefs, loaded, set }), [prefs, loaded, set]);
  return createElement(PrefsContext.Provider, { value: ctx }, children);
}

/** Read/write one preference. `loaded` is false until the server copy has arrived. */
export function usePref<T>(key: string, fallback: T): [T, (value: T) => void, boolean] {
  const { prefs, set, loaded } = useContext(PrefsContext);
  const value = (key in prefs && prefs[key] != null ? prefs[key] : fallback) as T;
  const setter = useCallback((v: T) => set(key, v), [key, set]);
  return [value, setter, loaded];
}

const DEFAULT_RESERVE = 500_000;

/**
 * The cash you never want to dip below (emergency reserve). Drives "Safe to spend" and the
 * cash-flow warning.
 */
export function useReserve(): [number, (n: number) => void] {
  const [raw, set] = usePref<number>("reserve", DEFAULT_RESERVE);
  const reserve = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_RESERVE;
  const setReserve = useCallback((n: number) => set(Math.max(0, Math.round(n))), [set]);
  return [reserve, setReserve];
}
