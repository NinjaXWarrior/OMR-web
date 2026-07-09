import { useQuery } from "@tanstack/react-query";
import { omrApi } from "@/lib/api-client";
import type { JobState, ReportRow } from "@/types/omr";

/** GET /report/{job_id}, parsed into rows. Only fetchable once the job has settled. */
export function useJobReport(jobId: string | null, jobState: JobState | undefined) {
  return useQuery<ReportRow[]>({
    queryKey: ["omr-report", jobId],
    queryFn: () => omrApi.getReport(jobId as string),
    enabled: !!jobId && (jobState === "done" || jobState === "error"),
    staleTime: Infinity, // a finished job's report never changes
  });
}
