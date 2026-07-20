import { parseCsv } from "@/lib/csv";
import {
  answerKeyRowSchema,
  jobProgressSchema,
  previewListSchema,
  publishResponseSchema,
  registerOrgSchema,
  reportRowSchema,
  runResponseSchema,
  studentResultsSchema,
  type StudentResults,
} from "@/lib/zod-schemas";
import type { AnswerKeyRow, JobProgress, PreviewItem, ReportRow } from "@/types/omr";

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(
  /\/+$/,
  "",
);

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${path}: ${detail}`);
  }
  return res.json();
}

interface StartRunInput {
  answers: File;
  template: File;
  images: File[];
}

export const omrApi = {
  /** POST /run */
  async startRun({ answers, template, images }: StartRunInput): Promise<{ job_id: string }> {
    const form = new FormData();
    form.append("answers", answers);
    form.append("template", template);
    for (const image of images) form.append("images", image);
    return runResponseSchema.parse(await request("/run", { method: "POST", body: form }));
  },

  /** GET /progress/{job_id} — poll every 300ms while state === "running" */
  async getProgress(jobId: string): Promise<JobProgress> {
    return jobProgressSchema.parse(await request(`/progress/${jobId}`));
  },

  /** GET /previews/{job_id} */
  async listPreviews(jobId: string): Promise<PreviewItem[]> {
    return previewListSchema.parse(await request(`/previews/${jobId}`)).items;
  },

  /** GET /preview/{job_id}/{index} (or latest if index omitted) — image URL, not JSON */
  previewImageUrl(jobId: string, index?: number): string {
    return `${BASE_URL}/preview/${jobId}${index !== undefined ? `/${index}` : ""}`;
  },

  /** GET /report/{job_id} — CSV, parsed + validated client-side (no JSON endpoint exists) */
  async getReport(jobId: string): Promise<ReportRow[]> {
    const res = await fetch(`${BASE_URL}/report/${jobId}`);
    if (!res.ok) throw new Error(`${res.status} /report/${jobId}: ${await res.text()}`);
    return parseCsv(await res.text())
      .filter((row) => row.File_name !== "ERROR") // app.py appends an ERROR line to failed jobs' CSVs
      .map((row) => reportRowSchema.parse(row));
  },

  /** direct download link for the "Export CSV" button */
  reportDownloadUrl(jobId: string): string {
    return `${BASE_URL}/report/${jobId}`;
  },

  /** POST /org/register — create an organization, returns its unique 6-char ID */
  async registerOrg(name: string): Promise<{ org_id: string; name: string }> {
    return registerOrgSchema.parse(
      await request("/org/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    );
  },

  /** POST /publish/{job_id} — persist a finished job's results to MongoDB */
  async publishResults(jobId: string, orgId: string, examName: string) {
    return publishResponseSchema.parse(
      await request(`/publish/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, exam_name: examName }),
      }),
    );
  },

  /** GET /student/{org_id}/{rollno} — a student's published result history */
  async getStudentResults(orgId: string, rollNo: string): Promise<StudentResults> {
    return studentResultsSchema.parse(
      await request(`/student/${encodeURIComponent(orgId)}/${encodeURIComponent(rollNo)}`),
    );
  },

  /** Parses + validates the admin's answer-key upload in the browser so the UI can compute hardest-questions without a new backend endpoint. */
  async parseAnswerKey(file: File): Promise<AnswerKeyRow[]> {
    const text = await file.text();
    return parseCsv(text).map((row, i) => {
      const parsed = answerKeyRowSchema.safeParse(row);
      if (!parsed.success) {
        throw new Error(`Answer key row ${i + 2}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      }
      return parsed.data;
    });
  },
};
