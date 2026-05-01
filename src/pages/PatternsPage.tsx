import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";

import { api } from "@/api";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChartTooltip } from "@/components/ChartTooltip";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { exportSvgAsPng } from "@/lib/exportPng";
import { useAppState } from "@/state/AppState";
import { useChartTooltip } from "@/lib/useChartTooltip";
import { cn } from "@/lib/utils";

const HEAT_LEVELS = [
  "fill-[var(--color-heat-0)]",
  "fill-[var(--color-heat-1)]",
  "fill-[var(--color-heat-2)]",
  "fill-[var(--color-heat-3)]",
  "fill-[var(--color-heat-4)]",
];

function levelOf(v: number, max: number): number {
  if (v <= 0 || max <= 0) return 0;
  const r = v / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

const CELL = 14;
const GAP = 3;
const PITCH = CELL + GAP;
const LEFT_PAD = 36;
const TOP_PAD = 16;

interface MatrixCell {
  dow: number;
  hour: number;
  value: number;
}

export function PatternsPage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();
  const matrixCardRef = useRef<HTMLDivElement>(null);

  const patterns = useQuery({
    queryKey: ["activity", selectedRepoId],
    queryFn: () => api.getActivityPatterns(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const onExportMatrix = () => {
    const svg = matrixCardRef.current?.querySelector("svg");
    if (svg) exportSvgAsPng(svg as SVGSVGElement, "activity-patterns.png");
  };

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("activity.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const days = t("activity.days", { returnObjects: true }) as string[];
  const matrixMax = Math.max(1, ...(patterns.data?.matrix.flat() ?? [1]));
  const hourMax = Math.max(1, ...(patterns.data?.byHour ?? [1]));
  const dowMax = Math.max(1, ...(patterns.data?.byDow ?? [1]));

  const width = LEFT_PAD + 24 * PITCH;
  const height = TOP_PAD + 7 * PITCH;

  return (
    <>
      <PageHeader
        title={t("activity.title")}
        subtitle={
          patterns.data
            ? t("activity.totalCommits", { count: patterns.data.total })
            : t("activity.subtitle")
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={onExportMatrix}
            title={t("common.exportPng")}
            disabled={!patterns.data}
          >
            <Download size={14} />
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("activity.matrix")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={matrixCardRef}>
              {patterns.isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : patterns.data ? (
                <MatrixChart
                  matrix={patterns.data.matrix}
                  matrixMax={matrixMax}
                  days={days}
                  width={width}
                  height={height}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("activity.hourOfDay")}</CardTitle>
            </CardHeader>
            <CardContent>
              {patterns.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : patterns.data ? (
                <BarsRow
                  values={patterns.data.byHour}
                  max={hourMax}
                  labels="hour"
                />
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("activity.dayOfWeek")}</CardTitle>
            </CardHeader>
            <CardContent>
              {patterns.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : patterns.data ? (
                <BarsRow
                  values={patterns.data.byDow}
                  max={dowMax}
                  labels="dow"
                  dayLabels={days}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function MatrixChart({
  matrix,
  matrixMax,
  days,
  width,
  height,
}: {
  matrix: number[][];
  matrixMax: number;
  days: string[];
  width: number;
  height: number;
}) {
  const tip = useChartTooltip<MatrixCell>();
  const tooltipText = tip.active
    ? `${days[tip.active.dow]} ${String(tip.active.hour).padStart(2, "0")}:00 — ${tip.active.value}`
    : "";

  return (
    <div
      ref={tip.containerRef}
      className="relative select-none overflow-x-auto"
      onMouseMove={tip.onMouseMove}
      onMouseLeave={tip.onMouseLeave}
    >
      <svg width={width} height={height + 8}>
        {Array.from({ length: 24 }, (_, h) =>
          h % 3 === 0 ? (
            <text
              key={`h${h}`}
              x={LEFT_PAD + h * PITCH}
              y={11}
              className="fill-muted-foreground"
              fontSize={10}
            >
              {h}
            </text>
          ) : null,
        )}
        {Array.from({ length: 7 }, (_, d) => (
          <text
            key={`d${d}`}
            x={0}
            y={TOP_PAD + d * PITCH + 11}
            className="fill-muted-foreground"
            fontSize={10}
          >
            {days[d]}
          </text>
        ))}
        {matrix.flatMap((row, d) =>
          row.map((v, h) => {
            const lvl = levelOf(v, matrixMax);
            const isActive =
              tip.active?.dow === d && tip.active?.hour === h;
            return (
              <rect
                key={`${d}-${h}`}
                x={LEFT_PAD + h * PITCH}
                y={TOP_PAD + d * PITCH}
                width={CELL}
                height={CELL}
                rx={2}
                ry={2}
                className={cn(
                  HEAT_LEVELS[lvl],
                  "transition-[stroke,stroke-width] duration-100",
                  isActive ? "stroke-foreground" : "stroke-border",
                )}
                strokeWidth={isActive ? 1.5 : 0.5}
                onMouseEnter={(e) =>
                  tip.enter({ dow: d, hour: h, value: v }, e)
                }
                onMouseLeave={() => tip.setActive(null)}
              />
            );
          }),
        )}
      </svg>
      <ChartTooltip ref={tip.tooltipRef} active={!!tip.active}>
        {tooltipText}
      </ChartTooltip>
    </div>
  );
}

function BarsRow({
  values,
  max,
  labels,
  dayLabels,
}: {
  values: number[];
  max: number;
  labels: "hour" | "dow";
  dayLabels?: string[];
}) {
  const barW = labels === "hour" ? 14 : 32;
  const gap = labels === "hour" ? 4 : 12;
  const h = 80;
  const w = values.length * (barW + gap);

  const tip = useChartTooltip<{ index: number; value: number }>();
  const tooltipText = tip.active
    ? labels === "hour"
      ? `${String(tip.active.index).padStart(2, "0")}:00 — ${tip.active.value}`
      : `${dayLabels?.[tip.active.index] ?? tip.active.index} — ${tip.active.value}`
    : "";

  return (
    <div
      ref={tip.containerRef}
      className="relative inline-block select-none"
      onMouseMove={tip.onMouseMove}
      onMouseLeave={tip.onMouseLeave}
    >
      <svg width={w} height={h + 18}>
        {values.map((v, i) => {
          const ratio = v / max;
          const bh = Math.max(2, ratio * h);
          const x = i * (barW + gap);
          const y = h - bh;
          const showLabel = labels === "hour" ? i % 3 === 0 : true;
          const isActive = tip.active?.index === i;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={bh}
                rx={3}
                className={cn(
                  "fill-[var(--color-chart-1)] transition-opacity",
                  isActive ? "opacity-100" : "opacity-70",
                )}
                stroke={isActive ? "var(--color-foreground)" : "none"}
                strokeWidth={isActive ? 1.5 : 0}
                onMouseEnter={(e) => tip.enter({ index: i, value: v }, e)}
                onMouseLeave={() => tip.setActive(null)}
              />
              {showLabel && (
                <text
                  x={x + barW / 2}
                  y={h + 12}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize={10}
                >
                  {labels === "hour" ? i : dayLabels?.[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ChartTooltip ref={tip.tooltipRef} active={!!tip.active}>
        {tooltipText}
      </ChartTooltip>
    </div>
  );
}
