"use client";

import { FileQuestion } from "lucide-react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { CHART, CURSOR_FILL, TOOLTIP_STYLE } from "@/lib/chart-theme";
import type { HardestQuestion } from "@/types/omr";

/** Single-series horizontal bars, incorrect-rate magnitude, top 8, % at each tip. */
export function HardestQuestionsChart({ data }: { data: HardestQuestion[] }) {
  const top = data.slice(0, 8).map((q) => ({
    label: `Q${q.question}`,
    pct: Math.round(q.incorrectRate * 100),
  }));

  return (
    <ChartCard title="Hardest questions" subtitle="Highest incorrect-answer rate — what to re-teach">
      {top.length === 0 ? (
        <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <FileQuestion className="h-8 w-8" />
          <p className="max-w-[220px] text-xs">
            Upload an answer key with the job to grade per-question difficulty.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={top} layout="vertical" margin={{ top: 4, right: 40, left: -12, bottom: 0 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={44}
              tick={{ fontSize: 12, fill: CHART.inkSecondary }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={CURSOR_FILL}
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => [`${v}%`, "Answered incorrectly"]}
            />
            <Bar dataKey="pct" fill={CHART.red} barSize={16} radius={[0, 4, 4, 0]} name="Incorrect">
              <LabelList
                dataKey="pct"
                position="right"
                formatter={(v: number) => `${v}%`}
                style={{ fontSize: 11, fill: CHART.inkSecondary }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
