import { AlertTriangle, Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Status palette (reserved — never reused as series colors), always icon + label. */
const VARIANTS = {
  pass: { cls: "bg-[#0ca30c]/10 text-[#006300] ring-[#0ca30c]/25", Icon: Check },
  correct: { cls: "bg-[#0ca30c]/10 text-[#006300] ring-[#0ca30c]/25", Icon: Check },
  fail: { cls: "bg-[#d03b3b]/10 text-[#a32626] ring-[#d03b3b]/25", Icon: X },
  incorrect: { cls: "bg-[#d03b3b]/10 text-[#a32626] ring-[#d03b3b]/25", Icon: X },
  skipped: { cls: "bg-secondary text-muted-foreground ring-border", Icon: Minus },
  invalid: { cls: "bg-[#ec835a]/10 text-[#9a4a1f] ring-[#ec835a]/30", Icon: AlertTriangle },
} as const;

export function StatusBadge({ variant, children }: { variant: keyof typeof VARIANTS; children: React.ReactNode }) {
  const { cls, Icon } = VARIANTS[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        cls
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </span>
  );
}
