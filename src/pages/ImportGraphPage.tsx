import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { ExportPngButton } from "@/components/ExportPngButton";
import { ChartTooltip } from "@/components/ChartTooltip";
import { useChartTooltip } from "@/lib/useChartTooltip";
import { useAppState } from "@/state/AppState";
import type { ImportGraph, ImportNode } from "@/types";

interface SimNode extends ImportNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  totalDeg: number;
}

interface SimEdge {
  source: number;
  target: number;
}

interface Layout {
  nodes: SimNode[];
  edges: SimEdge[];
  width: number;
  height: number;
  maxDeg: number;
}

const VIEW_W = 920;
const VIEW_H = 560;
const ITERATIONS = 240;

const LANG_COLORS: Record<string, string> = {
  TypeScript: "var(--color-chart-1)",
  JavaScript: "var(--color-chart-2)",
  Rust: "var(--color-chart-3)",
  Python: "var(--color-chart-4)",
  Other: "var(--color-muted-foreground)",
};

function langColor(lang: string): string {
  return LANG_COLORS[lang] ?? LANG_COLORS.Other;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function shortName(path: string): string {
  const segs = path.split("/");
  return segs[segs.length - 1] || path;
}

function layoutForce(graph: ImportGraph): Layout {
  if (graph.nodes.length === 0 || graph.edges.length === 0) {
    return { nodes: [], edges: [], width: VIEW_W, height: VIEW_H, maxDeg: 1 };
  }

  const indexById = new Map<string, number>();
  graph.nodes.forEach((n, i) => indexById.set(n.path, i));

  const r = rng(graph.nodes.length * 2654435761);
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  const nodes: SimNode[] = graph.nodes.map((n) => {
    const angle = r() * Math.PI * 2;
    const radius = 60 + r() * 180;
    return {
      ...n,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      totalDeg: n.inDegree + n.outDegree,
    };
  });

  const edges: SimEdge[] = graph.edges
    .map((e) => ({
      source: indexById.get(e.from) ?? -1,
      target: indexById.get(e.to) ?? -1,
    }))
    .filter((e) => e.source >= 0 && e.target >= 0 && e.source !== e.target);

  const repulsion = 4400;
  const springStrength = 0.05;
  const centerStrength = 0.012;
  const damping = 0.82;
  const minDist = 14;
  const restLength = 80;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const cooldown = 1 - iter / ITERATIONS;
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
    for (const e of edges) {
      const a = nodes[e.source];
      const b = nodes[e.target];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      const force = (dist - restLength) * springStrength;
      const ux = dx / dist;
      const uy = dy / dist;
      a.vx += ux * force;
      a.vy += uy * force;
      b.vx -= ux * force;
      b.vy -= uy * force;
    }
    for (const n of nodes) {
      n.vx += (cx - n.x) * centerStrength;
      n.vy += (cy - n.y) * centerStrength;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx * cooldown;
      n.y += n.vy * cooldown;
    }
  }

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
  const padding = 36;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const scale = Math.min(
    (VIEW_W - padding * 2) / w,
    (VIEW_H - padding * 2) / h,
  );
  for (const n of nodes) {
    n.x = padding + (n.x - minX) * scale;
    n.y = padding + (n.y - minY) * scale;
  }

  const maxDeg = nodes.reduce((m, n) => Math.max(m, n.totalDeg), 1);

  return { nodes, edges, width: VIEW_W, height: VIEW_H, maxDeg };
}

export function ImportGraphPage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();
  const cardRef = useRef<HTMLDivElement>(null);

  const importGraph = useQuery({
    queryKey: ["importGraph", selectedRepoId],
    queryFn: () => api.getImportGraph(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const layout = useMemo<Layout>(
    () =>
      layoutForce(
        importGraph.data ?? {
          nodes: [],
          edges: [],
          filesScanned: 0,
          externalImports: 0,
        },
      ),
    [importGraph.data],
  );

  const tip = useChartTooltip<SimNode>();

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("importGraph.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const tooltipText = tip.active
    ? `${tip.active.path}\n${tip.active.language} — ${t("importGraph.imports", { count: tip.active.outDegree })}, ${t("importGraph.importedBy", { count: tip.active.inDegree })}`
    : "";

  // Languages actually present, for the legend.
  const presentLangs = useMemo(
    () =>
      Array.from(new Set(layout.nodes.map((n) => n.language))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [layout.nodes],
  );

  return (
    <>
      <PageHeader
        title={t("importGraph.title")}
        subtitle={t("importGraph.subtitle")}
        actions={
          <ExportPngButton
            containerRef={cardRef}
            filename="import-graph.png"
            disabled={layout.nodes.length === 0}
          />
        }
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("importGraph.cardTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("importGraph.hint")}
            </p>
          </CardHeader>
          <CardContent>
            <div ref={cardRef}>
              {importGraph.isPending ? (
                <Skeleton className="h-[560px] w-full" />
              ) : layout.nodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("importGraph.empty")}
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
                    <defs>
                      <marker
                        id="arrow"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path
                          d="M 0 0 L 10 5 L 0 10 z"
                          className="fill-muted-foreground"
                        />
                      </marker>
                    </defs>
                    <g>
                      {layout.edges.map((e, i) => {
                        const a = layout.nodes[e.source];
                        const b = layout.nodes[e.target];
                        const isActive =
                          tip.active?.path === a.path ||
                          tip.active?.path === b.path;
                        // Trim the line short of the target so the arrowhead
                        // doesn't disappear behind the node circle.
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        const len = Math.sqrt(dx * dx + dy * dy) || 1;
                        const targetR =
                          3 + Math.min(10, (b.totalDeg / layout.maxDeg) * 12);
                        const tx = b.x - (dx / len) * (targetR + 1);
                        const ty = b.y - (dy / len) * (targetR + 1);
                        return (
                          <line
                            key={i}
                            x1={a.x}
                            y1={a.y}
                            x2={tx}
                            y2={ty}
                            stroke="var(--color-muted-foreground)"
                            strokeOpacity={isActive ? 0.85 : 0.3}
                            strokeWidth={isActive ? 1.4 : 0.8}
                            markerEnd="url(#arrow)"
                          />
                        );
                      })}
                    </g>
                    <g>
                      {layout.nodes.map((n) => {
                        const r =
                          3 +
                          Math.min(10, (n.totalDeg / layout.maxDeg) * 12);
                        const isActive = tip.active?.path === n.path;
                        return (
                          <g key={n.path}>
                            <circle
                              cx={n.x}
                              cy={n.y}
                              r={r}
                              fill={langColor(n.language)}
                              fillOpacity={isActive ? 1 : 0.85}
                              stroke={
                                isActive
                                  ? "var(--color-foreground)"
                                  : "var(--color-background)"
                              }
                              strokeWidth={isActive ? 1.5 : 1}
                              onMouseEnter={(ev) => tip.enter(n, ev)}
                              onMouseLeave={() => tip.setActive(null)}
                            />
                            {n.totalDeg >= Math.max(3, layout.maxDeg * 0.5) && (
                              <text
                                x={n.x + r + 3}
                                y={n.y + 3}
                                fontSize={10}
                                className="pointer-events-none fill-foreground/80"
                              >
                                {shortName(n.path)}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                  <ChartTooltip ref={tip.tooltipRef} active={!!tip.active}>
                    {tooltipText.split("\n").map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </ChartTooltip>
                </div>
              )}
            </div>
            {importGraph.data && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span>
                  {t("importGraph.summary", {
                    files: importGraph.data.filesScanned,
                    edges: layout.edges.length,
                    external: importGraph.data.externalImports,
                  })}
                </span>
                {presentLangs.length > 0 && (
                  <div className="flex items-center gap-3">
                    {presentLangs.map((lang) => (
                      <span key={lang} className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: langColor(lang) }}
                        />
                        {lang}
                      </span>
                    ))}
                  </div>
                )}
                <Link
                  to="/graph/couplings"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {t("importGraph.compareToCouplings")}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
