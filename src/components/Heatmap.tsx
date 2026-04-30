import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { ChartTooltip } from "@/components/ChartTooltip";
import { useChartTooltip } from "@/lib/useChartTooltip";
import { cn } from "@/lib/utils";
import type { HeatmapData, HeatmapDay } from "@/types";

interface HeatmapProps {
  data: HeatmapData;
  className?: string;
}

const CELL = 12;
const GAP = 3;
const PITCH = CELL + GAP;
const LEFT_PAD = 28;
const TOP_PAD = 18;

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_TR = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];
const DAYS_EN = ["Mon", "Wed", "Fri"];
const DAYS_TR = ["Pzt", "Çar", "Cum"];

function levelOf(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

const LEVEL_BG = [
  "fill-[var(--color-heat-0)]",
  "fill-[var(--color-heat-1)]",
  "fill-[var(--color-heat-2)]",
  "fill-[var(--color-heat-3)]",
  "fill-[var(--color-heat-4)]",
];

export function Heatmap({ data, className }: HeatmapProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("tr") ? "tr" : "en";
  const months = lang === "tr" ? MONTHS_TR : MONTHS_EN;
  const dayLabels = lang === "tr" ? DAYS_TR : DAYS_EN;

  const tip = useChartTooltip<HeatmapDay>();

  const cells = useMemo(() => {
    if (data.days.length === 0) return [];
    const firstDate = new Date(`${data.days[0].date}T00:00:00`);
    const startDow = (firstDate.getDay() + 6) % 7;
    return data.days.map((d, i) => {
      const idx = i + startDow;
      const week = Math.floor(idx / 7);
      const dow = idx % 7;
      return { ...d, week, dow };
    });
  }, [data]);

  const monthLabels = useMemo(() => {
    const seen = new Set<number>();
    const out: { week: number; month: number }[] = [];
    cells.forEach((c) => {
      const dt = new Date(`${c.date}T00:00:00`);
      const m = dt.getMonth();
      if (!seen.has(m)) {
        seen.add(m);
        out.push({ week: c.week, month: m });
      }
    });
    return out;
  }, [cells]);

  const totalWeeks = cells.length ? cells[cells.length - 1].week + 1 : 0;
  const width = LEFT_PAD + totalWeeks * PITCH;
  const height = TOP_PAD + 7 * PITCH;

  const tooltipText = tip.active
    ? tip.active.count > 0
      ? t("heatmap.commitsOn", {
          count: tip.active.count,
          date: tip.active.date,
        })
      : t("heatmap.noCommits", { date: tip.active.date })
    : "";

  return (
    <div
      ref={tip.containerRef}
      className={cn("relative flex select-none flex-col gap-2", className)}
      onMouseMove={tip.onMouseMove}
      onMouseLeave={tip.onMouseLeave}
    >
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={t("heatmap.title")}
        >
          {monthLabels.map((m, i) => (
            <text
              key={`${m.month}-${i}`}
              x={LEFT_PAD + m.week * PITCH}
              y={12}
              className="fill-muted-foreground"
              fontSize={10}
            >
              {months[m.month]}
            </text>
          ))}
          {[1, 3, 5].map((dow, i) => (
            <text
              key={dow}
              x={0}
              y={TOP_PAD + dow * PITCH + 9}
              className="fill-muted-foreground"
              fontSize={10}
            >
              {dayLabels[i]}
            </text>
          ))}
          {cells.map((c) => {
            const lvl = levelOf(c.count, data.max_count);
            const x = LEFT_PAD + c.week * PITCH;
            const y = TOP_PAD + c.dow * PITCH;
            return (
              <rect
                key={c.date}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={2}
                ry={2}
                className={cn(LEVEL_BG[lvl], "stroke-border")}
                strokeWidth={0.5}
                onMouseEnter={(e) => tip.enter(c, e)}
              />
            );
          })}
        </svg>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{t("heatmap.less")}</span>
        {LEVEL_BG.map((cls, i) => (
          <svg key={i} width={CELL} height={CELL}>
            <rect
              width={CELL}
              height={CELL}
              rx={2}
              ry={2}
              className={cn(cls, "stroke-border")}
              strokeWidth={0.5}
            />
          </svg>
        ))}
        <span>{t("heatmap.more")}</span>
      </div>
      <ChartTooltip ref={tip.tooltipRef} active={!!tip.active}>
        {tooltipText}
      </ChartTooltip>
    </div>
  );
}
