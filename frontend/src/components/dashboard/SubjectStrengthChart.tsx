"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { CHART, CURSOR_FILL, TOOLTIP_STYLE } from "@/lib/chart-theme";
import type { SubjectPerformance } from "@/types/omr";

/**
 * Horizontal bars (replaces the old radar — magnitude reads instantly as
 * length). Aqua is sub-3:1 on this surface, so every bar carries a visible
 * value label (the relief rule).
 */
export function SubjectStrengthChart({ data }: { data: SubjectPerformance[] }) {
  return (
    <ChartCard title="Subject strength" subtitle="Average marks per subject">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data.map((d) => ({ ...d, avg: Number(d.averageMarks.toFixed(1)) }))}
          layout="vertical"
          margin={{ top: 4, right: 36, left: 8, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="subject"
            width={80}
            tick={{ fontSize: 12, fill: CHART.inkSecondary }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={CURSOR_FILL} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, "Avg marks"]} />
          <Bar dataKey="avg" fill={CHART.aqua} barSize={18} radius={[0, 4, 4, 0]} name="Avg marks">
            <LabelList dataKey="avg" position="right" style={{ fontSize: 11, fill: CHART.inkSecondary }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
