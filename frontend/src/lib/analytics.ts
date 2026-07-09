import type {
  AnalyticsSummary,
  AnswerKeyRow,
  HardestQuestion,
  ReportRow,
  ScoreBucket,
  SubjectPerformance,
} from "@/types/omr";

/** Total available marks: sum of the answer key, or total_questions (1 mark each) as fallback. */
export function maxMarksOf(answerKey: AnswerKeyRow[] | null, rows: ReportRow[]): number {
  return answerKey?.length
    ? answerKey.reduce((sum, r) => sum + r.Marks_Correct, 0)
    : Number(rows[0]?.total_questions ?? 0) || 1;
}

const SCORE_BUCKETS = [
  { label: "<40%", max: 0.4 },
  { label: "40-60%", max: 0.6 },
  { label: "60-80%", max: 0.8 },
  { label: ">80%", max: Infinity },
];

/**
 * There is no /analytics/{job_id} endpoint — the backend only exposes a flat
 * CSV export (GET /report/{job_id}). Everything here is derived client-side
 * from that export (+ the answer-key CSV already in hand from upload, for
 * hardest-questions). ponytail: fine at classroom/batch scale (hundreds of
 * rows); move to a backend endpoint if jobs start running into the thousands.
 */
export function computeAnalytics(
  rows: ReportRow[],
  answerKey: AnswerKeyRow[] | null,
  passThreshold = 0.4
): AnalyticsSummary {
  const maxMarks = maxMarksOf(answerKey, rows);

  const scores = rows.map((r) => Number(r.score) || 0);
  const percents = scores.map((s) => s / maxMarks);
  const passedCount = percents.filter((p) => p >= passThreshold).length;
  const unprocessedCount = rows.filter((r) => r.Rollno === "INV").length;

  const scoreDistribution: ScoreBucket[] = SCORE_BUCKETS.map((bucket, i) => {
    const min = i === 0 ? -Infinity : SCORE_BUCKETS[i - 1]!.max;
    return {
      label: bucket.label,
      count: percents.filter((p) => p >= min && p < bucket.max).length,
    };
  });

  const subjectTotals = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!key.startsWith("marks_")) continue;
      const subject = key.slice("marks_".length);
      const entry = subjectTotals.get(subject) ?? { sum: 0, count: 0 };
      entry.sum += Number(row[key]) || 0;
      entry.count += 1;
      subjectTotals.set(subject, entry);
    }
  }
  const subjectPerformance: SubjectPerformance[] = Array.from(subjectTotals.entries()).map(
    ([subject, { sum, count }]) => ({ subject, averageMarks: count ? sum / count : 0 })
  );

  const hardestQuestions: HardestQuestion[] = answerKey?.length
    ? answerKey
        .map(({ Question, Answer }): HardestQuestion => {
          let incorrect = 0;
          let answered = 0;
          for (const row of rows) {
            const given = (row[String(Question)] ?? "").trim().toUpperCase();
            if (given === "" ) continue; // skipped, not counted against difficulty
            answered += 1;
            if (given !== Answer.trim().toUpperCase()) incorrect += 1;
          }
          return {
            question: Question,
            incorrectCount: incorrect,
            totalAnswered: answered,
            incorrectRate: answered ? incorrect / answered : 0,
          };
        })
        .sort((a, b) => b.incorrectRate - a.incorrectRate)
        .slice(0, 10)
    : [];

  return {
    totalStudents: rows.length,
    passRate: rows.length ? passedCount / rows.length : 0,
    averageScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    averagePercent: percents.length ? percents.reduce((a, b) => a + b, 0) / percents.length : 0,
    unprocessedCount,
    scoreDistribution,
    subjectPerformance,
    hardestQuestions,
  };
}
