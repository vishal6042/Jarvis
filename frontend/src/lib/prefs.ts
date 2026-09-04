import { useCallback, useEffect, useState } from "react";

const RESERVE_KEY = "jarvis_reserve";
const DEFAULT_RESERVE = 500_000;

function readReserve(): number {
  try {
    const raw = localStorage.getItem(RESERVE_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RESERVE;
  } catch {
    return DEFAULT_RESERVE;
  }
}

/**
 * The cash you never want to dip below (emergency reserve). Drives "Safe to spend" and the
 * cash-flow warning. Stored per browser for now; shared across tabs via the storage event.
 */
export function useReserve(): [number, (n: number) => void] {
  const [reserve, setReserveState] = useState<number>(readReserve);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === RESERVE_KEY) setReserveState(readReserve());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const setReserve = useCallback((n: number) => {
    const v = Math.max(0, Math.round(n));
    setReserveState(v);
    try {
      localStorage.setItem(RESERVE_KEY, String(v));
    } catch {
      /* ignore */
    }
  }, []);
  return [reserve, setReserve];
}
