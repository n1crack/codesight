import { useMemo, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
  weight: number;
}

interface SimEdge {
  source: number;
  target: number;
  weight: number;
}

interface Layout {
  nodes: SimNode[];
  edges: SimEdge[];
  width: number;
  height: number;
  maxWeight: number;
}

const VIEW_W = 880;
const VIEW_H = 520;
const ITERATIONS = 260;

/** Deterministic small PRNG so the layout is stable across renders for the same input. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function layoutForce(
  edgesIn: ReadonlyArray<{ fileA: string; fileB: string; jointChanges: number }>,
): Layout {
  if (edgesIn.length === 0) {
    return { nodes: [], edges: [], width: VIEW_W, height: VIEW_H, maxWeight: 1 };
  }

  // Build node table from edge endpoints, recording degree + total joint-change weight.
  const indexById = new Map<string, number>();
  const nodes: SimNode[] = [];
  const r = rng(edgesIn.length * 2654435761);
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;

  const ensure = (id: string): number => {
    let i = indexById.get(id);
    if (i != null) return i;
    i = nodes.length;
    indexById.set(id, i);
    // Initial position: random within a circle so the simulation can spread out.
    const angle = r() * Math.PI * 2;
    const radius = 60 + r() * 160;
    nodes.push({
      id,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      degree: 0,
      weight: 0,
    });
    return i;
  };

  const edges: SimEdge[] = edgesIn.map((e) => {
    const a = ensure(e.fileA);
    const b = ensure(e.fileB);
    nodes[a].degree += 1;
    nodes[b].degree += 1;
    nodes[a].weight += e.jointChanges;
    nodes[b].weight += e.jointChanges;
    return { source: a, target: b, weight: e.jointChanges };
  });

  const maxWeight = edges.reduce((m, e) => Math.max(m, e.weight), 1);

  // Force constants tuned for ~30–150 nodes inside the 880×520 viewport.
  const repulsion = 4200;
  const springStrength = 0.04;
  const centerStrength = 0.012;
  const damping = 0.82;
  const minDist = 12;
  const restLength = 90;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const cooldown = 1 - iter / ITERATIONS;

    // Pairwise repulsion (O(n²) — fine for the cap of ~150 nodes used by this page).
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) dist = minDist;
        const force = repulsion / (dist * dist);
        dx /= dist;
        dy /= dist;
        a.vx += dx * force;
        a.vy += dy * force;
        b.vx -= dx * force;
        b.vy -= dy * force;
      }
    }

    // Spring pull along each edge — heavier joint-change weight pulls files closer.
    for (const e of edges) {
      const a = nodes[e.source];
      const b = nodes[e.target];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      const w = 0.5 + (e.weight / maxWeight) * 1.5;
      const force = (dist - restLength) * springStrength * w;
      const ux = dx / dist;
      const uy = dy / dist;
      a.vx += ux * force;
      a.vy += uy * force;
      b.vx -= ux * force;
      b.vy -= uy * force;
    }

    // Pull every node gently toward the center so nothing drifts off-canvas.
    for (const n of nodes) {
      n.vx += (cx - n.x) * centerStrength;
      n.vy += (cy - n.y) * centerStrength;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx * cooldown;
      n.y += n.vy * cooldown;
    }
  }

  // Normalize positions back into the visible viewport.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const padding = 32;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const sx = (VIEW_W - padding * 2) / w;
  const sy = (VIEW_H - padding * 2) / h;
  const scale = Math.min(sx, sy);
  for (const n of nodes) {
    n.x = padding + (n.x - minX) * scale;
    n.y = padding + (n.y - minY) * scale;
  }

  return { nodes, edges, width: VIEW_W, height: VIEW_H, maxWeight };
}

function shortName(path: string): string {
  const segs = path.split("/");
  return segs[segs.length - 1] || path;
}

export function CouplingsGraphPage() {
  const { t } = useTranslation();
  const { selectedRepoId, dateRange } = useAppState();
  const since = resolveDateRangeSince(dateRange);
  const [limit, setLimit] = useState<number>(120);
  const cardRef = useRef<HTMLDivElement>(null);

  const couplings = useQuery({
    queryKey: ["fileCouplings", selectedRepoId, limit, since],
    queryFn: () => api.getFileCouplings(selectedRepoId!, limit, since),
    enabled: selectedRepoId != null,
  });

  const layout = useMemo<Layout>(
    () => layoutForce(couplings.data ?? []),
    [couplings.data],
  );

  const tip = useChartTooltip<{ id: string; degree: number; weight: number }>();

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("couplingsGraph.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const tooltipText = tip.active
    ? `${tip.active.id} — ${t("couplingsGraph.degree", { count: tip.active.degree })}, ${t("couplingsGraph.totalWeight", { count: tip.active.weight })}`
    : "";

  const maxDegree = layout.nodes.reduce((m, n) => Math.max(m, n.degree), 1);

  return (
    <>
      <PageHeader
        title={t("couplingsGraph.title")}
        subtitle={t("couplingsGraph.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <DateRangeBadge />
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value={60}>60</option>
              <option value={120}>120</option>
              <option value={240}>240</option>
            </select>
            <ExportPngButton
              containerRef={cardRef}
              filename={`couplings-${limit}.png`}
              disabled={!layout.nodes.length}
            />
          </div>
        }
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("couplingsGraph.cardTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("couplingsGraph.hint")}
            </p>
          </CardHeader>
          <CardContent>
            <div ref={cardRef}>
              {couplings.isPending ? (
                <Skeleton className="h-[520px] w-full" />
              ) : layout.nodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("couplingsGraph.empty")}
                </p>
              ) : (
                <div
                  ref={tip.containerRef}
                  className="relative w-full select-none"
                  onMouseMove={tip.onMouseMove}
                  onMouseLeave={tip.onMouseLeave}
                >
                  <svg
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                    className="h-auto w-full"
                  >
                    <g>
                      {layout.edges.map((e, i) => {
                        const a = layout.nodes[e.source];
                        const b = layout.nodes[e.target];
                        const op = 0.15 + (e.weight / layout.maxWeight) * 0.55;
                        const sw = 0.6 + (e.weight / layout.maxWeight) * 2.2;
                        const isActive =
                          tip.active?.id === a.id || tip.active?.id === b.id;
                        return (
                          <line
                            key={i}
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke="var(--color-chart-1)"
                            strokeOpacity={isActive ? Math.min(0.9, op + 0.3) : op}
                            strokeWidth={isActive ? sw + 0.8 : sw}
                          />
                        );
                      })}
                    </g>
                    <g>
                      {layout.nodes.map((n) => {
                        const r = 3 + Math.min(10, (n.degree / maxDegree) * 12);
                        const isActive = tip.active?.id === n.id;
                        return (
                          <g key={n.id}>
                            <circle
                              cx={n.x}
                              cy={n.y}
                              r={r}
                              className={cn(
                                "fill-[var(--color-chart-1)] transition-opacity",
                                isActive ? "opacity-100" : "opacity-90",
                              )}
                              stroke={
                                isActive
                                  ? "var(--color-foreground)"
                                  : "var(--color-background)"
                              }
                              strokeWidth={isActive ? 1.5 : 1}
                              onMouseEnter={(ev) =>
                                tip.enter(
                                  {
                                    id: n.id,
                                    degree: n.degree,
                                    weight: n.weight,
                                  },
                                  ev,
                                )
                              }
                              onMouseLeave={() => tip.setActive(null)}
                            />
                            {n.degree >= Math.max(3, maxDegree * 0.4) && (
                              <text
                                x={n.x + r + 3}
                                y={n.y + 3}
                                fontSize={10}
                                className="pointer-events-none fill-foreground/80"
                              >
                                {shortName(n.id)}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                  <ChartTooltip ref={tip.tooltipRef} active={!!tip.active}>
                    {tooltipText}
                  </ChartTooltip>
                </div>
              )}
            </div>
            {couplings.data && couplings.data.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("couplingsGraph.summary", {
                  pairs: couplings.data.length,
                  files: layout.nodes.length,
                })}
                {" — "}
                <Link
                  to="/insights/hotspots"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {t("couplingsGraph.openListView")}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
