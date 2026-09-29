import { useCallback, useEffect, useRef, useState } from "react";
import { aiEnrichMerchants, listMerchants, type EnrichedMerchant } from "@/api";
import type { Transaction } from "@/types";
import { merchantKey, readSession, writeSession } from "@/components/transactions/shared";

/*
 * The model's read of each raw merchant string — a clean name, the category it belongs in, and a
 * few words on why. It is slow (seconds per merchant, minutes when the model is cold), so it only
 * runs when asked, in small batches, and every answer is kept for the session so a merchant is
 * never asked about twice.
 */

const STORE = "jarvis.transactions.suggestions";
const DISMISSED = "jarvis.transactions.dismissed";
/** Fifteen strings a batch: long enough to be efficient, short enough that progress moves. */
const BATCH = 15;

export type Suggestions = Record<string, EnrichedMerchant>;

export interface SuggestProgress {
  done: number;
  total: number;
}

/**
 * Examples of the person's own conventions for the model, the same way the merchant cleanup
 * builds them: settled merchants with their category. Falls back to the ledger's own named rows
 * if the merchant list cannot be read.
 */
async function examplesFor(txns: Transaction[]): Promise<string[]> {
  try {
    const all = await listMerchants();
    const ex = all
      .filter((m) => m.canonical && m.category)
      .slice(0, 12)
      .map((m) => `${m.raw} => ${m.category}`);
    if (ex.length > 0) return ex;
  } catch {
    /* fall through to the ledger */
  }
  const seen = new Set<string>();
  const ex: string[] = [];
  for (const t of txns) {
    if (!t.merchant || !t.merchantNorm || !t.category || t.category === "Uncategorized") continue;
    if (seen.has(t.merchant)) continue;
    seen.add(t.merchant);
    ex.push(`${t.merchant} => ${t.category}`);
    if (ex.length >= 12) break;
  }
  return ex;
}

/** Suggestions for raw merchants, fetched on demand and cached in sessionStorage by raw text. */
export function useSuggestions() {
  const [map, setMap] = useState<Suggestions>(() => readSession<Suggestions>(STORE, {}));
  const [progress, setProgress] = useState<SuggestProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = useRef(0); // bumping it cancels the batches in flight

  useEffect(
    () => () => {
      run.current++;
    },
    [],
  );

  const start = useCallback(
    async (raws: string[], categories: string[], ledger: Transaction[]) => {
      const cached = readSession<Suggestions>(STORE, {});
      const todo = Array.from(new Map(raws.filter((r) => r.trim()).map((r) => [merchantKey(r), r])).values()).filter(
        (r) => !cached[merchantKey(r)],
      );
      setError(null);
      if (todo.length === 0) {
        setNote("Every merchant here has already been read.");
        return;
      }
      setNote(null);
      const id = ++run.current;
      setProgress({ done: 0, total: todo.length });
      const examples = await examplesFor(ledger);
      let failed = 0;
      for (let i = 0; i < todo.length; i += BATCH) {
        if (run.current !== id) return;
        const slice = todo.slice(i, i + BATCH);
        try {
          const answers = await aiEnrichMerchants(slice, categories, examples);
          if (run.current !== id) return;
          const next = { ...readSession<Suggestions>(STORE, {}) };
          for (const raw of slice) {
            const a = answers.find((x) => merchantKey(x.raw ?? "") === merchantKey(raw));
            if (a) next[merchantKey(raw)] = { ...a, raw };
          }
          writeSession(STORE, next);
          setMap(next);
        } catch {
          failed += slice.length; // one bad batch should not stop the run
        }
        setProgress({ done: Math.min(todo.length, i + slice.length), total: todo.length });
      }
      if (run.current !== id) return;
      setProgress(null);
      if (failed > 0) setError(`Jarvis could not read ${failed} of ${todo.length}. Try again for the rest.`);
    },
    [],
  );

  const cancel = useCallback(() => {
    run.current++;
    setProgress(null);
  }, []);

  const get = useCallback((raw: string | null | undefined) => (raw ? map[merchantKey(raw)] : undefined), [map]);

  return { map, get, progress, running: progress != null, error, note, start, cancel };
}

/** Suggestions the person has waved away ("Keep"), for this session. */
export function useDismissed() {
  const [set, setSet] = useState<Set<string>>(() => new Set(readSession<string[]>(DISMISSED, [])));
  const dismiss = useCallback((keys: string[]) => {
    setSet((s) => {
      const n = new Set(s);
      keys.forEach((k) => n.add(k));
      writeSession(DISMISSED, [...n]);
      return n;
    });
  }, []);
  return { dismissed: set, dismiss };
}
