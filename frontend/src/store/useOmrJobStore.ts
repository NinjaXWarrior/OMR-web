import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AnswerKeyRow } from "@/types/omr";

interface RecentJob {
  id: string;
  label: string;
  startedAt: string; // ISO
}

interface OmrJobState {
  /** Job currently shown on the dashboard; drives useOmrProgress polling. */
  activeJobId: string | null;
  /** Jobs started from this browser. The backend keeps jobs only in process
   *  memory (CLAUDE.md), so entries can outlive their server-side job — the
   *  dashboard shows a "job unknown" notice when that happens. */
  recentJobs: RecentJob[];
  /** Answer key per job, parsed from the admin's upload; lets analytics
   *  (hardest questions, per-question status) work without a backend endpoint. */
  answerKeyByJob: Record<string, AnswerKeyRow[]>;
  passThreshold: number; // 0..1, fraction of max marks required to pass
  setActiveJob: (jobId: string | null) => void;
  addJob: (job: RecentJob, answerKey: AnswerKeyRow[] | null) => void;
}

const MAX_RECENT_JOBS = 20;

export const useOmrJobStore = create<OmrJobState>()(
  persist(
    (set) => ({
      activeJobId: null,
      recentJobs: [],
      answerKeyByJob: {},
      passThreshold: 0.4,
      setActiveJob: (jobId) => set({ activeJobId: jobId }),
      addJob: (job, answerKey) =>
        set((s) => {
          const recentJobs = [job, ...s.recentJobs].slice(0, MAX_RECENT_JOBS);
          const answerKeyByJob = Object.fromEntries(
            Object.entries({ ...s.answerKeyByJob, ...(answerKey ? { [job.id]: answerKey } : {}) }).filter(
              ([id]) => recentJobs.some((j) => j.id === id)
            )
          );
          return { activeJobId: job.id, recentJobs, answerKeyByJob };
        }),
    }),
    { name: "omr-jobs" }
  )
);
