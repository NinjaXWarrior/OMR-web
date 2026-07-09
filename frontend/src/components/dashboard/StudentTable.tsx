"use client";

import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ReportRow } from "@/types/omr";

interface StudentRow {
  index: number; // index into the report — also the /preview/{job_id}/{index} index
  rollNo: string;
  file: string;
  score: number;
  percent: number;
  passed: boolean;
}

type SortKey = "rollNo" | "score" | "percent";
const PAGE_SIZE = 10;
const PASS_FILTERS = ["All", "Pass", "Fail"] as const;

interface StudentTableProps {
  rows: ReportRow[];
  maxMarks: number;
  passThreshold: number;
  onView: (index: number) => void;
}

export function StudentTable({ rows, maxMarks, passThreshold, onView }: StudentTableProps) {
  const [search, setSearch] = useState("");
  const [passFilter, setPassFilter] = useState<(typeof PASS_FILTERS)[number]>("All");
  const [minPct, setMinPct] = useState("");
  const [maxPct, setMaxPct] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "percent", dir: -1 });
  const [page, setPage] = useState(0);

  const data: StudentRow[] = useMemo(
    () =>
      rows.map((r, index) => {
        const score = Number(r.score) || 0;
        const percent = maxMarks ? (score / maxMarks) * 100 : 0;
        return { index, rollNo: r.Rollno, file: r.File_name, score, percent, passed: percent / 100 >= passThreshold };
      }),
    [rows, maxMarks, passThreshold]
  );

  const filtered = useMemo(() => {
    const lo = minPct === "" ? -Infinity : Number(minPct);
    const hi = maxPct === "" ? Infinity : Number(maxPct);
    return data
      .filter((row) => {
        if (search && !`${row.rollNo} ${row.file}`.toLowerCase().includes(search.toLowerCase())) return false;
        if (passFilter === "Pass" && !row.passed) return false;
        if (passFilter === "Fail" && row.passed) return false;
        return row.percent >= lo && row.percent <= hi;
      })
      .sort((a, b) => {
        const va = a[sort.key];
        const vb = b[sort.key];
        return (typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
      });
  }, [data, search, passFilter, minPct, maxPct, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const sortButton = (key: SortKey, label: string) => (
    <button
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}
    >
      {label}
      <ArrowUpDown className={cn("h-3 w-3", sort.key === key ? "opacity-100" : "opacity-40")} />
    </button>
  );

  return (
    <Card className="p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search roll no or file…"
            className="w-64 pl-8"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <div className="inline-flex rounded-lg border bg-secondary p-0.5">
          {PASS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setPassFilter(f);
                setPage(0);
              }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                passFilter === f ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Input
            type="number"
            placeholder="Min %"
            className="h-9 w-20"
            value={minPct}
            onChange={(e) => {
              setMinPct(e.target.value);
              setPage(0);
            }}
          />
          –
          <Input
            type="number"
            placeholder="Max %"
            className="h-9 w-20"
            value={maxPct}
            onChange={(e) => {
              setMaxPct(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{sortButton("rollNo", "Roll No")}</TableHead>
              <TableHead className="hidden sm:table-cell">Sheet</TableHead>
              <TableHead>{sortButton("score", "Score")}</TableHead>
              <TableHead>{sortButton("percent", "Percentage")}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No students match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.index}>
                  <TableCell className="font-medium tabular-nums">{row.rollNo}</TableCell>
                  <TableCell className="hidden max-w-[200px] truncate text-muted-foreground sm:table-cell">
                    {row.file}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.score.toFixed(1)}</TableCell>
                  <TableCell className="tabular-nums">{row.percent.toFixed(1)}%</TableCell>
                  <TableCell>
                    <StatusBadge variant={row.passed ? "pass" : "fail"}>{row.passed ? "Pass" : "Fail"}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => onView(row.index)}>
                      View sheet
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {filtered.length} student{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            {safePage + 1} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
