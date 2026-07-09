import type { z } from "zod";
import type {
  answerKeyRowSchema,
  jobProgressSchema,
  previewListSchema,
  reportRowSchema,
} from "@/lib/zod-schemas";

/**
 * Types for the platform, inferred from the zod schemas in lib/zod-schemas.ts
 * (which mirror app.py's pydantic response models 1:1) so runtime validation
 * and static types can't drift apart.
 */

export type JobProgress = z.infer<typeof jobProgressSchema>;
export type JobState = JobProgress["state"];
export type PreviewItem = z.infer<typeof previewListSchema>["items"][number];
export type ReportRow = z.infer<typeof reportRowSchema>;
export type AnswerKeyRow = z.infer<typeof answerKeyRowSchema>;

// ---------------------------------------------------------------------------
// Derived analytics — computed client-side from ReportRow[] (+ AnswerKeyRow[]
// for hardest-questions) in lib/analytics.ts. The backend has no
// /analytics/{job_id} endpoint; add one and swap the client-side pass if this
// gets slow at scale.
// ---------------------------------------------------------------------------

export interface ScoreBucket {
  label: string; // e.g. "40-60%"
  count: number;
}

export interface SubjectPerformance {
  subject: string;
  averageMarks: number;
}

export interface HardestQuestion {
  question: number;
  incorrectRate: number; // 0..1
  incorrectCount: number;
  totalAnswered: number;
}

export interface AnalyticsSummary {
  totalStudents: number;
  passRate: number; // 0..1
  averageScore: number;
  averagePercent: number; // 0..1, of total available marks
  unprocessedCount: number; // Invalid rollno / calibration issues
  scoreDistribution: ScoreBucket[];
  subjectPerformance: SubjectPerformance[];
  hardestQuestions: HardestQuestion[];
}
