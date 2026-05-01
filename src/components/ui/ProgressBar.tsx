import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  indeterminate?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  className,
  indeterminate = false,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      {indeterminate ? (
        <div className="absolute inset-y-0 left-0 w-1/3 animate-[progressSlide_1.4s_ease-in-out_infinite] rounded-full bg-primary" />
      ) : (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
