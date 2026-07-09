"use client";

import { useUser } from "@clerk/nextjs";
import { AlertTriangle, CheckCircle2, Medal, Search, Target, Users } from "lucide-react";
import { useState } from "react";
import { CheckedSheetSplitView } from "@/components/dashboard/CheckedSheetSplitView";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useJobReport } from "@/hooks/useJobReport";
import { useOmrProgress } from "@/hooks/useOmrProgress";
import { maxMarksOf } from "@/lib/analytics";
import { omrApi } from "@/lib/api-client";
import { useOmrJobStore } from "@/store/useOmrJobStore";

/**
 * Read-only student view. The backend has no student identity or per-student
 * job index (jobs are an in-memory dict keyed by uuid), so students look up
 * their result with the exam's job id (shared by the teacher) + their roll
 * number. Roll no is prefilled from Clerk publicMetadata.rollNo when set.
 */
export default function StudentDashboardPage() {
  const { user } = useUser();
  const [jobIdInput, setJobIdInput] = useState("");
  const [rollNoInput, setRollNoInput] = useState((user?.publicMetadata?.rollNo as string) ?? "");
  const [lookup, setLookup] = useState<{ jobId: string; rollNo: string } | null>(null);
  const answerKey = useOmrJobStore((s) => (lookup ? (s.answerKeyByJob[lookup.jobId] ?? null) : null));

  const { data: progress } = useOmrProgress(lookup?.jobId ?? null);
  const { data: report } = useJobReport(lookup?.jobId ?? null, progress?.state);

  const myIndex = report && lookup ? report.findIndex((r) => r.Rollno === lookup.rollNo) : -1;
  const myRow = myIndex >= 0 ? report![myIndex] : undefined;

  const maxMarks = report ? maxMarksOf(answerKey, report) : 1;
  const scores = report?.map((r) => Number(r.score) || 0) ?? [];
  const batchAvg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const myScore = myRow ? Number(myRow.score) || 0 : 0;
  const rank = myRow ? 1 + scores.filter((s) => s > myScore).length : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My results</h1>
        <p className="text-sm text-muted-foreground">Look up your graded sheet and compare with the batch</p>
      </div>

      <Card className="p-5 shadow-sm">
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (jobIdInput.trim() && rollNoInput.trim()) {
              setLookup({ jobId: jobIdInput.trim(), rollNo: rollNoInput.trim() });
            }
          }}
        >
          <Input
            placeholder="Exam job id (from your teacher)"
            className="w-full sm:w-72"
            value={jobIdInput}
            onChange={(e) => setJobIdInput(e.target.value)}
            required
          />
          <Input
            placeholder="Roll no"
            className="w-full sm:w-36"
            value={rollNoInput}
            onChange={(e) => setRollNoInput(e.target.value)}
            required
          />
          <Button type="submit">
            <Search className="mr-2 h-4 w-4" />
            Look up
          </Button>
        </form>
      </Card>

      {progress?.state === "unknown" && lookup && (
        <Alert className="border-[#ec835a]/40 bg-[#ec835a]/5">
          <AlertTriangle className="h-4 w-4 text-[#9a4a1f]" />
          <AlertTitle>Exam not found — check the job id with your teacher.</AlertTitle>
        </Alert>
      )}
      {report && lookup && !myRow && (
        <Alert className="border-[#ec835a]/40 bg-[#ec835a]/5">
          <AlertTriangle className="h-4 w-4 text-[#9a4a1f]" />
          <AlertTitle>Roll number {lookup.rollNo} not found in this exam.</AlertTitle>
        </Alert>
      )}

      {myRow && lookup && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Your score" value={myScore.toFixed(1)} suffix={`/ ${maxMarks}`} icon={Target} />
            <MetricCard
              title="Batch average"
              value={batchAvg.toFixed(1)}
              icon={Users}
              trend={{ value: batchAvg ? ((myScore - batchAvg) / Math.abs(batchAvg)) * 100 : 0, label: "you vs batch" }}
            />
            <MetricCard title="Rank" value={`${rank} / ${scores.length}`} icon={Medal} />
            <MetricCard
              title="Correct · Wrong · Skipped"
              value={`${myRow.correct} · ${myRow.wrong} · ${myRow.skipped}`}
              icon={CheckCircle2}
            />
          </div>

          <Card className="p-4 shadow-sm">
            <CheckedSheetSplitView
              imageUrl={omrApi.previewImageUrl(lookup.jobId, myIndex)}
              row={myRow}
              answerKey={answerKey}
            />
          </Card>
        </>
      )}
    </div>
  );
}
