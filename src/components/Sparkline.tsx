import { cn } from "@/lib/utils";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  title?: string;
}

export function Sparkline({
  values,
  width = 60,
  height = 16,
  className,
  title,
}: SparklineProps) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const barWidth = width / values.length;
  return (
    <svg
      width={width}
      height={height}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {values.map((v, i) => {
        const h = Math.max(0, (v / max) * (height - 2));
        const x = i * barWidth;
        const y = height - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={Math.max(1, barWidth - 0.5)}
            height={h}
            rx={1}
            className={
              v === 0
                ? "fill-muted"
                : "fill-[var(--color-chart-1)] opacity-80"
            }
          />
        );
      })}
    </svg>
  );
}
