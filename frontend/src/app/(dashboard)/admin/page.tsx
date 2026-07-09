"use client";

import { AlertTriangle, Download, FileWarning, GraduationCap, Inbox, Target, UploadCloud, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { HardestQuestionsChart } from "@/components/dashboard/HardestQuestionsChart";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ProgressRing } from "@/components/dashboard/ProgressRing";
import { ScoreDistributionChart } from "@/components/dashboard/ScoreDistributionChart";
import { StudentTable } from "@/components/dashboard/StudentTable";
import { SubjectStrengthChart } from "@/components/dashboard/SubjectStrengthChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useJobReport } from "@/hooks/useJobReport";
import { useOmrProgress } from "@/hooks/useOmrProgress";
import { maxMarksOf } from "@/lib/analytics";
import { omrApi } from "@/lib/api-client";
import { useOmrJobStore } from "@/store/useOmrJobStore";

export default function AdminDashboardPage() {
  const router = useRouter();
  const activeJobId = useOmrJobStore((s) => s.activeJobId);
  const setActiveJob = useOmrJobStore((s) => s.setActiveJob);
  const recentJobs = useOmrJobStore((s) => s.recentJobs);
  const answerKey = useOmrJobStore((s) => (activeJobId ? (s.answerKeyByJob[activeJobId] ?? null) : null));
  const passThreshold = useOmrJobStore((s) => s.passThreshold);
  const [manualId, setManualId] = useState("");

  const { data: progress } = useOmrProgress(activeJobId);
  const { data: report } = useJobReport(activeJobId, progress?.state);
  const analytics = useAnalytics(activeJobId, report);

  const maxMarks = report ? maxMarksOf(answerKey, report) : 1;

  if (!activeJobId) {
    return (
      <Card className="flex flex-col items-center gap-4 p-12 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Inbox className="h-6 w-6" />
        </span>
        <div>
          <p className="font-semibold">No active job</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a grading batch, or load an existing job by id.
          </p>
        </div>
        <Button onClick={() => router.push("/admin/upload")}>
          <UploadCloud className="mr-2 h-4 w-4" />
          Start a grading job
        </Button>
        <form
          className="flex w-full max-w-xs gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manualId.trim()) setActiveJob(manualId.trim());
          }}
        >
          <Input placeholder="…or paste a job_id" value={manualId} onChange={(e) => setManualId(e.target.value)} />
          <Button type="submit" variant="outline">
            Load
          </Button>
        </form>
      </Card>
    );
  }

  const jobOptions = recentJobs.some((j) => j.id === activeJobId)
    ? recentJobs
    : [{ id: activeJobId, label: `${activeJobId.slice(0, 8)}… (manual)`, startedAt: "" }, ...recentJobs];

  const jobPicker = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Exam analytics</h1>
        <p className="text-sm text-muted-foreground">Batch performance at a glance</p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={activeJobId} onValueChange={setActiveJob}>
          <SelectTrigger className="w-[260px] bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {jobOptions.map((j) => (
              <SelectItem key={j.id} value={j.id}>
                {j.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {progress?.state === "done" || progress?.state === "error" ? (
          <Button variant="outline" asChild>
            <a href={omrApi.reportDownloadUrl(activeJobId)}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </a>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>
    </div>
  );

  let body: React.ReactNode;
  if (progress?.state === "unknown") {
    body = (
      <Alert className="border-[#ec835a]/40 bg-[#ec835a]/5">
        <AlertTriangle className="h-4 w-4 text-[#9a4a1f]" />
        <AlertTitle>Job not found on the server</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          The backend keeps jobs in memory only — a server restart clears them. Re-run the batch from
          the Upload Hub.
        </AlertDescription>
      </Alert>
    );
  } else if (progress?.state === "running") {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    body = (
      <Card className="p-6 shadow-sm">
        <p className="font-semibold">Grading in progress…</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#cde2fb]">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Processed {progress.done}/{progress.total} · {progress.ips.toFixed(1)} sheets/sec · ETA{" "}
          {Math.max(0, Math.round(progress.eta))}s · last: {progress.last}
        </p>
      </Card>
    );
  } else if (progress?.state === "error" && !analytics) {
    body = (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Job failed</AlertTitle>
        <AlertDescription>{progress.error ?? "Unknown error"}</AlertDescription>
      </Alert>
    );
  } else if (!analytics || !report) {
    body = (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  } else {
    body = (
      <>
        {progress?.state === "error" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Job stopped early</AlertTitle>
            <AlertDescription>
              {progress.error ?? "Unknown error"} — showing the {report.length} sheets graded before the
              failure. Failed sheets are saved server-side in Invalid_sheets/.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Students graded" value={analytics.totalStudents} icon={Users} />
          <MetricCard
            title="Passing rate"
            value={`${(analytics.passRate * 100).toFixed(1)}%`}
            icon={GraduationCap}
            aside={<ProgressRing ratio={analytics.passRate} />}
          />
          <MetricCard
            title="Class average"
            value={analytics.averageScore.toFixed(1)}
            suffix={`/ ${maxMarks}`}
            icon={Target}
            trend={{ value: analytics.averagePercent * 100 - 50, label: "vs 50% benchmark" }}
          />
          <MetricCard
            title="Invalid sheets"
            value={analytics.unprocessedCount}
            icon={FileWarning}
            iconClassName="bg-[#ec835a]/10 text-[#9a4a1f]"
            onClick={() => router.push(`/admin/checked-sheets/${activeJobId}`)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <ScoreDistributionChart data={analytics.scoreDistribution} />
          {analytics.subjectPerformance.length > 0 ? (
            <SubjectStrengthChart data={analytics.subjectPerformance} />
          ) : (
            <ChartCard title="Subject strength" subtitle="Average marks per subject">
              <p className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
                No subject columns in this report.
              </p>
            </ChartCard>
          )}
          <HardestQuestionsChart data={analytics.hardestQuestions} />
        </div>

        <StudentTable
          rows={report}
          maxMarks={maxMarks}
          passThreshold={passThreshold}
          onView={(index) => router.push(`/admin/checked-sheets/${activeJobId}?index=${index}`)}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {jobPicker}
      {body}
    </div>
  );
}
