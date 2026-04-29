import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { api } from "@/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Select";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { formatDate } from "@/lib/format";
import { laneColor, layoutGraph } from "@/lib/graphLayout";
import { cn } from "@/lib/utils";
import type { GraphRef } from "@/types";

const ROW_HEIGHT = 36;
const LANE_WIDTH = 16;
const DOT_RADIUS = 4;
const GRAPH_PAD_LEFT = 12;
const GRAPH_PAD_RIGHT = 12;

const REF_STYLE: Record<GraphRef["kind"], string> = {
  HEAD: "bg-primary/15 text-primary border-primary/30",
  head: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  remote: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  tag: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

export function GraphPage() {
  const { t, i18n } = useTranslation();
  const { selectedRepoId } = useAppState();
  const [limit, setLimit] = useState(100);

  const summary = useQuery({
    queryKey: ["summary", selectedRepoId],
    queryFn: () => api.getRepoSummary(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const graph = useQuery({
    queryKey: ["commitGraph", selectedRepoId, limit],
    queryFn: () => api.getCommitGraph(selectedRepoId!, limit),
    enabled: selectedRepoId != null,
  });

  const layout = useMemo(
    () => (graph.data ? layoutGraph(graph.data) : null),
    [graph.data],
  );

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("graph.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const graphWidth = layout
    ? GRAPH_PAD_LEFT + Math.max(1, layout.totalLanes) * LANE_WIDTH + GRAPH_PAD_RIGHT
    : 64;
  const graphHeight = (graph.data?.length ?? 0) * ROW_HEIGHT;

  return (
    <>
      <PageHeader
        title={t("graph.title")}
        subtitle={summary.data?.repo.name ?? t("graph.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("graph.limit")}</span>
            <Select<number>
              value={limit}
              onChange={setLimit}
              options={[50, 100, 200, 500].map((n) => ({
                value: n,
                label: String(n),
              }))}
            />
          </div>
        }
      />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            {graph.isPending ? (
              <div className="flex flex-col gap-1 p-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : !graph.data?.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("graph.noCommits")}
              </p>
            ) : layout ? (
              <div className="flex">
                <div
                  className="relative shrink-0 border-r"
                  style={{ width: graphWidth, height: graphHeight }}
                >
                  <svg
                    width={graphWidth}
                    height={graphHeight}
                    style={{ overflow: "visible" }}
                    aria-hidden
                  >
                    {layout.edges.map((e, i) => {
                      const x1 = GRAPH_PAD_LEFT + e.fromLane * LANE_WIDTH + LANE_WIDTH / 2;
                      const y1 = e.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                      const x2 = GRAPH_PAD_LEFT + e.toLane * LANE_WIDTH + LANE_WIDTH / 2;
                      const y2 = e.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                      const color = laneColor(
                        e.fromLane === e.toLane ? e.fromLane : e.toLane,
                      );
                      const d =
                        x1 === x2
                          ? `M ${x1},${y1} L ${x2},${y2}`
                          : `M ${x1},${y1} C ${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
                      return (
                        <path
                          key={i}
                          d={d}
                          stroke={color}
                          strokeWidth={1.5}
                          fill="none"
                          opacity={0.85}
                        />
                      );
                    })}
                    {graph.data.map((c, row) => {
                      const pos = layout.positions.get(c.id);
                      if (!pos) return null;
                      const x = GRAPH_PAD_LEFT + pos.lane * LANE_WIDTH + LANE_WIDTH / 2;
                      const y = row * ROW_HEIGHT + ROW_HEIGHT / 2;
                      const color = laneColor(pos.lane);
                      const isMerge = c.parents.length > 1;
                      return (
                        <g key={c.id}>
                          <circle
                            cx={x}
                            cy={y}
                            r={DOT_RADIUS}
                            fill={isMerge ? "var(--color-background)" : color}
                            stroke={color}
                            strokeWidth={2}
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <ul className="flex-1">
                  {graph.data.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 border-b px-3 hover:bg-accent/40"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <Link
                        to={`/commits/${c.id}`}
                        className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent"
                      >
                        {c.shortId}
                      </Link>
                      {c.refs.map((r) => (
                        <span
                          key={`${r.kind}-${r.name}`}
                          className={cn(
                            "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                            REF_STYLE[r.kind],
                          )}
                        >
                          {r.kind === "HEAD" ? "HEAD" : r.name}
                        </span>
                      ))}
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {c.summary || <span className="text-muted-foreground">—</span>}
                      </span>
                      <Link
                        to={`/contributors/${encodeURIComponent(c.authorEmail)}`}
                        className="hidden shrink-0 truncate text-xs text-muted-foreground hover:underline sm:block"
                        title={c.authorEmail}
                      >
                        {c.authorName}
                      </Link>
                      <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
                        {formatDate(c.timestamp, i18n.language)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
