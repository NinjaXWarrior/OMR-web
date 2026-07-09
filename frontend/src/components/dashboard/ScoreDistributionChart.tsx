"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { CHART, CURSOR_FILL, TOOLTIP_STYLE } from "@/lib/chart-theme";
import type { ScoreBucket } from "@/types/omr";

/** Single-series column chart: magnitude → one hue, value on each cap, no legend. */
export function ScoreDistributionChart({ data }: { data: ScoreBucket[] }) {
  return (
    <ChartCard title="Score distribution" subtitle="Students per score bracket">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 20, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: CHART.inkMuted }}
            axisLine={{ stroke: CHART.grid }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: CHART.inkMuted }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={CURSOR_FILL} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, "Students"]} />
          <Bar dataKey="count" fill={CHART.blue} barSize={24} radius={[4, 4, 0, 0]} name="Students">
            <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: CHART.inkSecondary }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
