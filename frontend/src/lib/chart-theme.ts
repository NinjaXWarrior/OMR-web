/**
 * Chart color slots — validated with the dataviz palette validator
 * (CVD ΔE 21.2, all checks pass on the #fcfcfb surface). Each chart is
 * single-series and takes exactly one hue; aqua sits below 3:1 contrast,
 * so any chart using it must direct-label its values (the relief rule).
 */
export const CHART = {
  blue: "#2a78d6",
  blueTrack: "#cde2fb", // lighter step of the same ramp — meter/ring tracks
  aqua: "#1baf7a",
  red: "#e34948",
  grid: "#e5e4dd", // hairline, solid, recessive
  inkMuted: "#898781", // axis ticks / labels
  inkSecondary: "#52514e",
} as const;

/** Recharts tooltip chrome shared by every chart. */
export const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "#fcfcfb",
  border: "1px solid #e5e4dd",
  borderRadius: 10,
  boxShadow: "0 4px 12px rgba(11,11,11,0.08)",
  fontSize: 12,
  color: "#0b0b0b",
  padding: "8px 12px",
};

export const CURSOR_FILL = { fill: "rgba(11,11,11,0.04)" };
