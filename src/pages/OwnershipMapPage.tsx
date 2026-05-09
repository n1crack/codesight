import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { DateRangeBadge } from "@/components/DateRangeBadge";
import { ExportPngButton } from "@/components/ExportPngButton";
import { ChartTooltip } from "@/components/ChartTooltip";
import { useChartTooltip } from "@/lib/useChartTooltip";
import { resolveDateRangeSince, useAppState } from "@/state/AppState";
import type { FileOwnership } from "@/types";

const VIEW_W = 920;
const VIEW_H = 540;

interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  file: FileOwnership;
}

/** Stable HSL color from an email so the same author keeps the same hue across renders. */
function authorColor(email: string): string {
  let h = 2166136261;
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = ((h >>> 0) % 360);
  return `hsl(${hue}deg 55% 55%)`;
}

function shortName(path: string): string {
  const segs = path.split("/");
  return segs[segs.length - 1] || path;
}

/**
 * Squarified treemap — Bruls/Huijing/van Wijk algorithm.
 * Returns tiles laid out inside the given rect, sized proportional to `value`.
 */
function squarify(
  files: ReadonlyArray<FileOwnership>,
  width: number,
  height: number,
): Tile[] {
  if (files.length === 0) return [];

  const totalValue = files.reduce(
    (s, f) => s + Math.max(1, f.totalCommits),
    0,
  );
  const totalArea = width * height;
  // Pre-compute scaled area for each file so the row math stays in pixel space.
  const items = files
    .slice()
    .sort((a, b) => b.totalCommits - a.totalCommits)
    .map((f) => ({
      file: f,
      area: (Math.max(1, f.totalCommits) / totalValue) * totalArea,
    }));

  const tiles: Tile[] = [];
  let rect = { x: 0, y: 0, w: width, h: height };
  let queue = items.slice();

  const worstRatio = (
    row: Array<{ file: FileOwnership; area: number }>,
    side: number,
  ): number => {
    if (row.length === 0) return Infinity;
    let rowSum = 0;
    let rMin = Infinity;
    let rMax = -Infinity;
    for (const it of row) {
      rowSum += it.area;
      if (it.area < rMin) rMin = it.area;
      if (it.area > rMax) rMax = it.area;
    }
    const s2 = side * side;
    const sum2 = rowSum * rowSum;
    return Math.max((s2 * rMax) / sum2, sum2 / (s2 * rMin));
  };

  const layoutRow = (
    row: Array<{ file: FileOwnership; area: number }>,
    side: number,
  ) => {
    const rowSum = row.reduce((s, it) => s + it.area, 0);
    const thickness = rowSum / side;
    let offset = 0;
    if (rect.w >= rect.h) {
      // Row stacks vertically along the short side (height), grows along width.
      for (const it of row) {
        const len = it.area / thickness;
        tiles.push({
          x: rect.x,
          y: rect.y + offset,
          w: thickness,
          h: len,
          file: it.file,
        });
        offset += len;
      }
      rect = { x: rect.x + thickness, y: rect.y, w: rect.w - thickness, h: rect.h };
    } else {
      for (const it of row) {
        const len = it.area / thickness;
        tiles.push({
          x: rect.x + offset,
          y: rect.y,
          w: len,
          h: thickness,
          file: it.file,
        });
        offset += len;
      }
      rect = { x: rect.x, y: rect.y + thickness, w: rect.w, h: rect.h - thickness };
    }
  };

  while (queue.length > 0) {
    const side = Math.min(rect.w, rect.h);
    const row: Array<{ file: FileOwnership; area: number }> = [];
    while (queue.length > 0) {
      const candidate = [...row, queue[0]];
      if (
        row.length === 0 ||
        worstRatio(candidate, side) <= worstRatio(row, side)
      ) {
        row.push(queue.shift()!);
      } else {
        break;
      }
    }
    layoutRow(row, side);
  }

  return tiles;
}

export function OwnershipMapPage() {
  const { t } = useTranslation();
  const { selectedRepoId, dateRange } = useAppState();
  const since = resolveDateRangeSince(dateRange);
  const cardRef = useRef<HTMLDivElement>(null);

  const ownership = useQuery({
    queryKey: ["ownership", selectedRepoId, since],
    queryFn: () => api.getOwnershipReport(selectedRepoId!, since),
    enabled: selectedRepoId != null,
  });

  const tiles = useMemo<Tile[]>(
    () => squarify(ownership.data?.files ?? [], VIEW_W, VIEW_H),
    [ownership.data],
  );

  const tip = useChartTooltip<Tile>();

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("ownershipMap.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const tooltipText = tip.active
    ? `${tip.active.file.path}\n${tip.active.file.primaryName} — ${tip.active.file.primarySharePct.toFixed(0)}% of ${tip.active.file.totalCommits} commits, ${tip.active.file.distinctAuthors} authors`
    : "";

  return (
    <>
      <PageHeader
        title={t("ownershipMap.title")}
        subtitle={t("ownershipMap.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <DateRangeBadge />
            <ExportPngButton
              containerRef={cardRef}
              filename="ownership-map.png"
              disabled={tiles.length === 0}
            />
          </div>
        }
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("ownershipMap.cardTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("ownershipMap.hint")}
            </p>
          </CardHeader>
          <CardContent>
            <div ref={cardRef}>
              {ownership.isPending ? (
                <Skeleton className="h-[540px] w-full" />
              ) : tiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("ownershipMap.empty")}
                </p>
              ) : (
                <div
                  ref={tip.containerRef}
                  className="relative w-full select-none"
                  onMouseMove={tip.onMouseMove}
                  onMouseLeave={tip.onMouseLeave}
                >
                  <svg
                    viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                    className="h-auto w-full"
                  >
                    {tiles.map((tile, i) => {
                      const fill = authorColor(tile.file.primaryEmail);
                      const isActive =
                        tip.active?.file.path === tile.file.path;
                      // Show a label only when the tile is roomy enough.
                      const showLabel = tile.w > 70 && tile.h > 26;
                      return (
                        <g key={i}>
                          <rect
                            x={tile.x}
                            y={tile.y}
                            width={tile.w}
                            height={tile.h}
                            fill={fill}
                            fillOpacity={isActive ? 0.95 : 0.78}
                            stroke="var(--color-background)"
                            strokeWidth={1}
                            onMouseEnter={(ev) => tip.enter(tile, ev)}
                            onMouseLeave={() => tip.setActive(null)}
                          />
                          {showLabel && (
                            <>
                              <text
                                x={tile.x + 6}
                                y={tile.y + 14}
                                fontSize={11}
                                fontWeight={600}
                                className="pointer-events-none fill-white"
                              >
                                {shortName(tile.file.path)}
                              </text>
                              {tile.h > 42 && (
                                <text
                                  x={tile.x + 6}
                                  y={tile.y + 28}
                                  fontSize={10}
                                  className="pointer-events-none fill-white/85"
                                >
                                  {tile.file.primaryName} ·{" "}
                                  {tile.file.totalCommits}
                                </text>
                              )}
                            </>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                  <ChartTooltip ref={tip.tooltipRef} active={!!tip.active}>
                    {tooltipText.split("\n").map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </ChartTooltip>
                </div>
              )}
            </div>
            {ownership.data && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("ownershipMap.summary", {
                  files: ownership.data.files.length,
                  authors: ownership.data.totalAuthors,
                })}
                {" — "}
                <Link
                  to="/insights/ownership"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {t("ownershipMap.openListView")}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
