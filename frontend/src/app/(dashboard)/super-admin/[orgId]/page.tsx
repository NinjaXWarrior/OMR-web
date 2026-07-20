import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);

interface ExamRecord {
  rollno: string;
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
  invalid: number;
  total_questions: number;
  subjects: Record<string, number>;
}

interface Exam {
  exam_name: string;
  published_at: string;
  sheet_count: number;
  avg_score: number;
  records: ExamRecord[];
}

interface OrgFull {
  org_id: string;
  name: string;
  created_at: string;
  exams: Exam[];
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6 text-center">
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

/** Server component: super admin drills into one organization's full history. */
export default async function OrgDashboardPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { sessionClaims } = await auth();
  if (sessionClaims?.metadata?.role !== "SUPER_ADMIN") {
    return <p className="text-sm text-muted-foreground">Super admin access required.</p>;
  }

  const { orgId } = await params;
  let org: OrgFull | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(`${BASE_URL}/orgs/${encodeURIComponent(orgId)}`, {
      headers: { "X-Admin-Key": process.env.OMR_ADMIN_KEY ?? "admin" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    org = (await res.json()) as OrgFull;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load organization";
  }

  if (error || !org) {
    return (
      <p className="text-sm text-destructive">Could not load organization: {error ?? "unknown"}</p>
    );
  }

  const totalSheets = org.exams.reduce((n, e) => n + e.sheet_count, 0);
  const overallAvg = org.exams.length
    ? (org.exams.reduce((s, e) => s + e.avg_score, 0) / org.exams.length).toFixed(2)
    : "-";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/super-admin"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All organizations
        </Link>
        <h1 className="text-xl font-semibold">{org.name}</h1>
        <p className="text-sm text-muted-foreground">
          Org ID <span className="font-mono font-semibold">{org.org_id}</span> · registered{" "}
          {new Date(org.created_at).toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Exams published" value={org.exams.length} />
        <Stat label="Sheets graded" value={totalSheets} />
        <Stat label="Average batch score" value={overallAvg} />
      </div>

      {org.exams.length === 0 && (
        <p className="text-sm text-muted-foreground">No exams published yet.</p>
      )}

      {org.exams.map((exam) => {
        const subjects = [...new Set(exam.records.flatMap((r) => Object.keys(r.subjects ?? {})))];
        return (
          <Card key={`${exam.exam_name}-${exam.published_at}`}>
            <CardHeader>
              <CardTitle>{exam.exam_name}</CardTitle>
              <CardDescription>
                Published {new Date(exam.published_at).toLocaleString()} · {exam.sheet_count} sheets
                · batch average {exam.avg_score}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Roll No</TableHead>
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
                  {exam.records.map((r, i) => (
                    <TableRow key={`${r.rollno}-${i}`}>
                      <TableCell className="font-mono">{r.rollno}</TableCell>
                      <TableCell className="text-right font-semibold">{r.score}</TableCell>
                      <TableCell className="text-right">{r.correct}</TableCell>
                      <TableCell className="text-right">{r.wrong}</TableCell>
                      <TableCell className="text-right">{r.skipped}</TableCell>
                      <TableCell className="text-right">{r.invalid}</TableCell>
                      {subjects.map((s) => (
                        <TableCell key={s} className="text-right">
                          {r.subjects?.[s] ?? "-"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
