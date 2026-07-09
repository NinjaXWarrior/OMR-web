"use client";

import { ImageOff } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AnswerKeyRow, ReportRow } from "@/types/omr";

interface QuestionRow {
  question: number;
  studentResponse: string;
  correctAnswer: string | null;
  status: "correct" | "incorrect" | "skipped" | "invalid" | "unknown";
}

function buildQuestionRows(row: ReportRow, answerKey: AnswerKeyRow[] | null): QuestionRow[] {
  const byQuestion = new Map(answerKey?.map((a) => [a.Question, a]) ?? []);
  const questionNumbers = answerKey?.length
    ? answerKey.map((a) => a.Question)
    : Object.keys(row)
        .filter((k) => /^\d+$/.test(k))
        .map(Number)
        .sort((a, b) => a - b);

  return questionNumbers.map((q) => {
    const given = (row[String(q)] ?? "").trim().toUpperCase();
    const correct = byQuestion.get(q)?.Answer?.trim().toUpperCase() ?? null;

    let status: QuestionRow["status"] = "unknown";
    if (given === "INV") status = "invalid";
    else if (given === "") status = "skipped";
    else if (correct !== null) status = given === correct ? "correct" : "incorrect";

    return { question: q, studentResponse: given || "—", correctAnswer: correct, status };
  });
}

const QUESTIONS_PER_PAGE = 10;

interface CheckedSheetSplitViewProps {
  imageUrl: string;
  row: ReportRow | undefined;
  answerKey: AnswerKeyRow[] | null;
}

export function CheckedSheetSplitView({ imageUrl, row, answerKey }: CheckedSheetSplitViewProps) {
  const questionRows = useMemo(() => (row ? buildQuestionRows(row, answerKey) : []), [row, answerKey]);
  const [qPage, setQPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(questionRows.length / QUESTIONS_PER_PAGE));
  const safePage = Math.min(qPage, pageCount - 1);
  const pageRows = questionRows.slice(safePage * QUESTIONS_PER_PAGE, (safePage + 1) * QUESTIONS_PER_PAGE);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-xl bg-[#141413] p-2">
        {row ? (
          <a href={imageUrl} target="_blank" rel="noreferrer" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element -- backend serves dynamic JPEGs */}
            <img src={imageUrl} alt={row.File_name} className="max-h-[420px] rounded-md object-contain" />
          </a>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-white/50">
            <ImageOff className="h-7 w-7" />
            Select a sheet
          </div>
        )}
      </div>

      {row && (
        <>
          <p className="text-xs text-muted-foreground">
            Roll No <span className="font-medium text-foreground">{row.Rollno}</span> · Score{" "}
            <span className="font-medium text-foreground">{row.score}</span> · {row.correct} correct ·{" "}
            {row.wrong} wrong · {row.skipped} skipped
          </p>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Question</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Correct</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((q) => (
                  <TableRow key={q.question}>
                    <TableCell className="font-medium tabular-nums">Q{q.question}</TableCell>
                    <TableCell>{q.studentResponse}</TableCell>
                    <TableCell>{q.correctAnswer ?? "—"}</TableCell>
                    <TableCell>
                      {q.status === "unknown" ? "—" : <StatusBadge variant={q.status}>{q.status}</StatusBadge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <button
                className="rounded-md border px-2 py-1 hover:bg-secondary disabled:opacity-40"
                disabled={safePage === 0}
                onClick={() => setQPage(safePage - 1)}
              >
                Prev
              </button>
              <span className="tabular-nums">
                {safePage + 1} / {pageCount}
              </span>
              <button
                className="rounded-md border px-2 py-1 hover:bg-secondary disabled:opacity-40"
                disabled={safePage >= pageCount - 1}
                onClick={() => setQPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
