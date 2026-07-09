import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  suffix?: string;
  /** signed %; color = direction × whether up is good */
  trend?: { value: number; label: string; upIsGood?: boolean };
  icon?: LucideIcon;
  /** soft tint behind the icon chip */
  iconClassName?: string;
  /** right-side slot, e.g. a progress ring */
  aside?: React.ReactNode;
  onClick?: () => void;
}

/** Stat tile: label · value · optional delta — the KPI form for a single headline number. */
export function MetricCard({ title, value, suffix, trend, icon: Icon, iconClassName, aside, onClick }: MetricCardProps) {
  const up = (trend?.value ?? 0) >= 0;
  const good = trend ? up === (trend.upIsGood ?? true) : true;
  return (
    <Card
      className={cn(
        "flex items-center justify-between gap-4 p-5 shadow-sm transition-shadow",
        onClick && "cursor-pointer hover:shadow-md"
      )}
      onClick={onClick}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && (
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground",
                iconClassName
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
          <p className="truncate text-sm text-muted-foreground">{title}</p>
        </div>
        <p className="mt-2 text-3xl font-semibold tracking-tight">
          {value}
          {suffix && <span className="ml-1 text-base font-normal text-muted-foreground">{suffix}</span>}
        </p>
        {trend && (
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-xs font-medium",
              good ? "text-[#006300]" : "text-[#a32626]"
            )}
          >
            {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {Math.abs(trend.value).toFixed(1)}% {trend.label}
          </p>
        )}
      </div>
      {aside}
    </Card>
  );
}
