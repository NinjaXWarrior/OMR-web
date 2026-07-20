import { z } from "zod";

/**
 * Strict runtime validation of everything that crosses a trust boundary:
 * FastAPI JSON responses (shapes copied 1:1 from app.py's pydantic models)
 * and the admin's answer-key CSV upload. types/omr.ts infers its types from
 * these schemas so there is a single source of truth.
 */

/** GET /progress/{job_id} — mirrors app.py ProgressResponse */
export const jobProgressSchema = z.object({
  state: z.enum(["running", "done", "error", "unknown"]),
  done: z.number(),
  total: z.number(),
  last: z.string(),
  elapsed: z.number(),
  ips: z.number(),
  eta: z.number(),
  error: z.string().nullable(),
  has_preview: z.boolean(),
  preview_count: z.number(),
  record_count: z.number(),
});

/** POST /run — mirrors app.py RunResponse */
export const runResponseSchema = z.object({ job_id: z.string() });

/** GET /previews/{job_id} — mirrors app.py PreviewListResponse */
export const previewListSchema = z.object({
  items: z.array(
    z.object({
      index: z.number(),
      name: z.string(),
      status: z.string(),
      score: z.union([z.number(), z.string()]),
    }),
  ),
});

/** POST /org/register — mirrors app.py register_org */
export const registerOrgSchema = z.object({ org_id: z.string(), name: z.string() });

/** POST /publish/{job_id} — mirrors app.py publish_results */
export const publishResponseSchema = z.object({
  org_id: z.string(),
  exam_name: z.string(),
  published: z.number(),
});

/** GET /student/{org_id}/{rollno} — mirrors app.py student_results */
export const studentResultsSchema = z.object({
  org_id: z.string(),
  org_name: z.string(),
  rollno: z.string(),
  exam_count: z.number(),
  results: z.array(
    z.object({
      exam_name: z.string(),
      published_at: z.string(),
      score: z.number(),
      correct: z.number(),
      wrong: z.number(),
      skipped: z.number(),
      invalid: z.number(),
      total_questions: z.number(),
      subjects: z.record(z.string(), z.number()),
    }),
  ),
});
export type StudentResults = z.infer<typeof studentResultsSchema>;

/** One row of the answer-key CSV (Question, Subject, Marks_Correct, Negative_Percent, Answer). */
export const answerKeyRowSchema = z.object({
  Question: z.coerce.number().int().positive(),
  Subject: z.string().default(""),
  Marks_Correct: z.coerce.number(),
  Negative_Percent: z.coerce.number(),
  Answer: z.string().default(""),
});

/** One parsed row of the /report/{job_id} CSV export. */
export const reportRowSchema = z
  .object({
    File_name: z.string(),
    Rollno: z.string(),
    score: z.string(),
    correct: z.string(),
    wrong: z.string(),
    skipped: z.string(),
    Invalid: z.string(),
    total_questions: z.string(),
  })
  .catchall(z.string());
