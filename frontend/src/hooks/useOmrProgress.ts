import { useQuery } from "@tanstack/react-query";
import { omrApi } from "@/lib/api-client";
import type { JobProgress } from "@/types/omr";

/** Polls GET /progress/{job_id} every 300ms, as specced, until the job settles. */
export function useOmrProgress(jobId: string | null) {
  return useQuery<JobProgress>({
    queryKey: ["omr-progress", jobId],
    queryFn: () => omrApi.getProgress(jobId as string),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "running" || state === undefined ? 300 : false;
    },
  });
}
