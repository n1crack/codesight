import { forwardRef } from "react";

import { cn } from "@/lib/utils";

interface ChartTooltipProps {
  active: boolean;
  children?: React.ReactNode;
}

export const ChartTooltip = forwardRef<HTMLDivElement, ChartTooltipProps>(
  ({ active, children }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-50 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      {children}
    </div>
  ),
);
ChartTooltip.displayName = "ChartTooltip";
