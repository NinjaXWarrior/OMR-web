"use client";

import { useQuery } from "@tanstack/react-query";
import { FileSearch } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckedSheetSplitView } from "@/components/dashboard/CheckedSheetSplitView";
import { Card } from "@/components/ui/card";
import { useJobReport } from "@/hooks/useJobReport";
import { useOmrProgress } from "@/hooks/useOmrProgress";
import { omrApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useOmrJobStore } from "@/store/useOmrJobStore";
import type { PreviewItem } from "@/types/omr";

/** Split-pane review: left = sheet list, right = annotated image + per-question table. */
export default function CheckedSheetsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const searchParams = useSearchParams();
  const answerKey = useOmrJobStore((s) => s.answerKeyByJob[jobId] ?? null);

  const { data: progress } = useOmrProgress(jobId);
  const { data: report } = useJobReport(jobId, progress?.state);
  const { data: previews } = useQuery<PreviewItem[]>({
    queryKey: ["omr-previews", jobId],
    queryFn: () => omrApi.listPreviews(jobId),
    enabled: !!jobId,
  });

  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    const fromUrl = searchParams.get("index");
    if (fromUrl !== null) setSelected(Number(fromUrl));
    else if (previews && previews.length > 0 && selected === null) setSelected(previews[0]!.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previews]);

  const row = selected !== null ? report?.[selected] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Checked sheets</h1>
        <p className="text-sm text-muted-foreground">
          {previews?.length ?? 0} graded sheet{(previews?.length ?? 0) === 1 ? "" : "s"} in this job
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100vh-11rem)] lg:grid-cols-[280px_1fr]">
        <Card className="overflow-y-auto p-2 shadow-sm">
          {!previews || previews.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileSearch className="h-6 w-6" />
              <p className="text-xs">No sheets yet</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {previews.map((item) => (
                <li key={item.index}>
                  <button
                    onClick={() => setSelected(item.index)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      selected === item.index
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-secondary"
                    )}
                  >
                    <span className="min-w-0 truncate">{item.name}</span>
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums">
                      {typeof item.score === "number" ? item.score.toFixed(1) : item.score}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-y-auto p-4 shadow-sm">
          <CheckedSheetSplitView
            imageUrl={omrApi.previewImageUrl(jobId, selected ?? undefined)}
            row={row}
            answerKey={answerKey}
          />
        </Card>
      </div>
    </div>
  );
}
