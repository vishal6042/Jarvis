import { useEffect, useMemo, useState } from "react";
import { financeScore } from "@/api";
import type { FinanceScoreResult } from "@/types";

const SCORE_CACHE_KEY = "jarvis_finance_score";
const SCORE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — a fresh score isn't needed every visit

export type ScoreMetrics = {
  monthlyIncome: number;
  monthlySpend: number;
  savingsRate: number;
  cashSavings: number;
  investments: number;
  outstandingLoans: number;
  monthlyEmi: number;
  earnsIncome: boolean;
  previousMonthSpend: number;
};

/** Stable fingerprint of the inputs — a cached score is reused only while the numbers hold. */
function metricsFingerprint(m: ScoreMetrics): string {
  return [
    Math.round(m.monthlyIncome),
    Math.round(m.monthlySpend),
    m.savingsRate,
    Math.round(m.cashSavings),
    Math.round(m.investments),
    Math.round(m.outstandingLoans),
    Math.round(m.monthlyEmi),
    // Part of the key: the two rubrics score the same numbers differently, so a cached score
    // from one must not be shown for the other.
    m.earnsIncome ? "earns" : "household",
    Math.round(m.previousMonthSpend),
  ].join("|");
}

export function scoreColor(score: number): string {
  if (score >= 80) return "#10b981"; // Excellent
  if (score >= 65) return "#84cc16"; // Good
  if (score >= 45) return "#f59e0b"; // Fair
  return "#f43f5e"; // Needs work
}

/**
 * The AI finance score for these numbers. The local model is slow, so a score for the same inputs
 * is reused from localStorage for a few hours, and the call waits for the dashboard to settle.
 * Pass a memoised {@code metrics}: a fresh object every render would re-run the effect.
 */
export function useFinanceScore(metrics: ScoreMetrics) {
  const [result, setResult] = useState<FinanceScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fp = useMemo(() => metricsFingerprint(metrics), [metrics]);
  const hasData = metrics.monthlyIncome > 0 || metrics.monthlySpend > 0 || metrics.cashSavings > 0;

  useEffect(() => {
    if (!hasData) return;
    try {
      const raw = localStorage.getItem(SCORE_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { fp: string; at: number; result: FinanceScoreResult };
        if (cached.fp === fp && Date.now() - cached.at < SCORE_TTL_MS) {
          setResult(cached.result);
          return;
        }
      }
    } catch {
      /* ignore malformed cache */
    }

    let alive = true;
    setError(false);
    // Debounce so we don't score against half-loaded numbers as the dashboard settles.
    const timer = setTimeout(() => {
      setLoading(true);
      financeScore(metrics)
        .then((r) => {
          if (!alive) return;
          setResult(r);
          try {
            localStorage.setItem(SCORE_CACHE_KEY, JSON.stringify({ fp, at: Date.now(), result: r }));
          } catch {
            /* ignore */
          }
        })
        .catch(() => alive && setError(true))
        .finally(() => alive && setLoading(false));
    }, 700);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [fp, hasData, metrics]);

  return { result, loading, error, hasData };
}
