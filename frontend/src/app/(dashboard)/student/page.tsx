"use client";

import { useUser } from "@clerk/nextjs";
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Medal,
  Search,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { CheckedSheetSplitView } from "@/components/dashboard/CheckedSheetSplitView";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useJobReport } from "@/hooks/useJobReport";
import { useOmrProgress } from "@/hooks/useOmrProgress";
import { maxMarksOf } from "@/lib/analytics";
import { omrApi } from "@/lib/api-client";
import { type StudentResults } from "@/lib/zod-schemas";
import { useOmrJobStore } from "@/store/useOmrJobStore";

/**
 * Read-only student view. The backend has no student identity or per-student
 * job index (jobs are an in-memory dict keyed by uuid), so students look up
 * their result with the exam's job id (shared by the teacher) + their roll
 * number. Roll no is prefilled from Clerk publicMetadata.rollNo when set.
 */
function PublishedResults() {
  const { user } = useUser();
  const [orgIdInput, setOrgIdInput] = useState("");
  const [rollInput, setRollInput] = useState((user?.publicMetadata?.rollNo as string) ?? "");
  const [data, setData] = useState<StudentResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setData(await omrApi.getStudentResults(orgIdInput.trim(), rollInput.trim()));
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  const scores = data?.results.map((r) => r.score) ?? [];
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const subjects = [...new Set(data?.results.flatMap((r) => Object.keys(r.subjects)) ?? [])];

  return (
    <>
      <Card className="p-5 shadow-sm">
        <form className="flex flex-wrap items-center gap-3" onSubmit={lookup}>
          <Input
            placeholder="Organization ID (e.g. 3F9A2C)"
            className="w-full font-mono sm:w-56"
            value={orgIdInput}
            onChange={(e) => setOrgIdInput(e.target.value)}
            required
          />
          <Input
            placeholder="Roll no"
            className="w-full sm:w-36"
            value={rollInput}
            onChange={(e) => setRollInput(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            <History className="mr-2 h-4 w-4" />
            My history
          </Button>
        </form>
      </Card>

      {error && (
        <Alert className="border-[#ec835a]/40 bg-[#ec835a]/5">
          <AlertTriangle className="h-4 w-4 text-[#9a4a1f]" />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
      {data && data.exam_count === 0 && (
        <Alert className="border-[#ec835a]/40 bg-[#ec835a]/5">
          <AlertTriangle className="h-4 w-4 text-[#9a4a1f]" />
          <AlertTitle>
            No published results for roll no {data.rollno} at {data.org_name}.
          </AlertTitle>
        </Alert>
      )}

      {data && data.exam_count > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title={`Exams at ${data.org_name}`}
              value={data.exam_count}
              icon={History}
            />
            <MetricCard title="Average score" value={avg.toFixed(1)} icon={Users} />
            <MetricCard title="Best score" value={Math.max(...scores).toFixed(1)} icon={Medal} />
            <MetricCard
              title="Latest score"
              value={scores[scores.length - 1]!.toFixed(1)}
              icon={TrendingUp}
              trend={
                scores.length > 1
                  ? {
                      value: avg ? ((scores[scores.length - 1]! - avg) / Math.abs(avg)) * 100 : 0,
                      label: "latest vs your average",
                    }
                  : undefined
              }
            />
          </div>

          <Card className="p-4 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Correct</TableHead>
                  <TableHead className="text-right">Wrong</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Invalid</TableHead>
                  {subjects.map((s) => (
                    <TableHead key={s} className="text-right">
                      {s.replaceAll("_", " ")}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((r) => (
                  <TableRow key={`${r.exam_name}-${r.published_at}`}>
                    <TableCell className="font-medium">{r.exam_name}</TableCell>
                    <TableCell>{new Date(r.published_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right font-semibold">{r.score}</TableCell>
                    <TableCell className="text-right">{r.correct}</TableCell>
                    <TableCell className="text-right">{r.wrong}</TableCell>
                    <TableCell className="text-right">{r.skipped}</TableCell>
                    <TableCell className="text-right">{r.invalid}</TableCell>
                    {subjects.map((s) => (
                      <TableCell key={s} className="text-right">
                        {r.subjects[s] ?? "-"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}

export default function StudentDashboardPage() {
  const { user } = useUser();
  const [jobIdInput, setJobIdInput] = useState("");
  const [rollNoInput, setRollNoInput] = useState((user?.publicMetadata?.rollNo as string) ?? "");
  const [lookup, setLookup] = useState<{ jobId: string; rollNo: string } | null>(null);
  const answerKey = useOmrJobStore((s) =>
    lookup ? (s.answerKeyByJob[lookup.jobId] ?? null) : null,
  );

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
        <p className="text-sm text-muted-foreground">
          Your published exam history — enter the Organization ID from your institution and your
          roll number
        </p>
      </div>

      <PublishedResults />

      <div className="mt-2">
        <h2 className="font-semibold tracking-tight">Live batch lookup</h2>
        <p className="text-sm text-muted-foreground">
          For a just-graded exam, use the job id shared by your teacher to see your sheet and rank
        </p>
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
            <MetricCard
              title="Your score"
              value={myScore.toFixed(1)}
              suffix={`/ ${maxMarks}`}
              icon={Target}
            />
            <MetricCard
              title="Batch average"
              value={batchAvg.toFixed(1)}
              icon={Users}
              trend={{
                value: batchAvg ? ((myScore - batchAvg) / Math.abs(batchAvg)) * 100 : 0,
                label: "you vs batch",
              }}
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
