import { useMemo } from "react";
import { computeAnalytics } from "@/lib/analytics";
import { useOmrJobStore } from "@/store/useOmrJobStore";
import type { AnalyticsSummary, ReportRow } from "@/types/omr";

/** Derives dashboard analytics from a job's report rows — see lib/analytics.ts for why this is client-side. */
export function useAnalytics(jobId: string | null, rows: ReportRow[] | undefined): AnalyticsSummary | null {
  const answerKey = useOmrJobStore((s) => (jobId ? (s.answerKeyByJob[jobId] ?? null) : null));
  const passThreshold = useOmrJobStore((s) => s.passThreshold);

  return useMemo(() => {
    if (!rows || rows.length === 0) return null;
    return computeAnalytics(rows, answerKey, passThreshold);
  }, [rows, answerKey, passThreshold]);
}
