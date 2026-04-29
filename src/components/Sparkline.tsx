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
  const innerH = Math.max(2, height - 2);
  const slot = width / values.length;
  const barWidth = Math.max(1, slot - 0.5);

  return (
    <svg
      width={width}
      height={height}
      className={cn("shrink-0 text-foreground/80", className)}
      role="img"
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {/* baseline track (very subtle), helps anchor the eye */}
      <line
        x1={0}
        y1={height - 0.5}
        x2={width}
        y2={height - 0.5}
        stroke="currentColor"
        strokeOpacity={0.12}
        strokeWidth={1}
      />
      {values.map((v, i) => {
        const x = i * slot;
        if (v <= 0) {
          return (
            <rect
              key={i}
              x={x}
              y={height - 1.25}
              width={barWidth}
              height={1.25}
              rx={0.5}
              fill="currentColor"
              fillOpacity={0.18}
            />
          );
        }
        const ratio = v / max;
        const h = Math.max(2, ratio * innerH);
        return (
          <rect
            key={i}
            x={x}
            y={height - h - 0.5}
            width={barWidth}
            height={h}
            rx={1}
            fill="currentColor"
            fillOpacity={0.95}
          />
        );
      })}
    </svg>
  );
}
