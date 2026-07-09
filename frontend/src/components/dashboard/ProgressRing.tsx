import { CHART } from "@/lib/chart-theme";

interface ProgressRingProps {
  /** 0..1 */
  ratio: number;
  size?: number;
}

/** Circular meter: accent fill on a lighter step of the same ramp (track). */
export function ProgressRing({ ratio, size = 64 }: ProgressRingProps) {
  const stroke = size / 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(clamped * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CHART.blueTrack} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={CHART.blue}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 600ms ease" }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-foreground"
        fontSize={size / 4.2}
        fontWeight={600}
      >
        {Math.round(clamped * 100)}%
      </text>
    </svg>
  );
}
