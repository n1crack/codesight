import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { ExportMarkdownButton } from "@/components/ExportMarkdownButton";
import { ExportPngButton } from "@/components/ExportPngButton";
import { useAppState } from "@/state/AppState";
import { formatDate } from "@/lib/format";
import { mdTable } from "@/lib/exportMarkdown";

export function ContributorsPage() {
  const { t, i18n } = useTranslation();
  const { selectedRepoId } = useAppState();
  const cohortRef = useRef<HTMLDivElement>(null);

  const contributors = useQuery({
    queryKey: ["contributorsAll", selectedRepoId],
    queryFn: () => api.getTopContributors(selectedRepoId!, 10000),
    enabled: selectedRepoId != null,
  });

  const summary = useQuery({
    queryKey: ["summary", selectedRepoId],
    queryFn: () => api.getRepoSummary(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const cohort = useQuery({
    queryKey: ["contribCohort", selectedRepoId],
    queryFn: () => api.getContributorCohort(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("contributors.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const total = summary.data?.total_commits ?? 0;
  const max = Math.max(1, ...(contributors.data ?? []).map((c) => c.commits));

  const buildMarkdown = () => {
    const rows = (contributors.data ?? []).map((c) => {
      const sharePct =
        total > 0 ? Math.round((c.commits / total) * 100) : 0;
      return [
        c.name,
        c.email,
        c.commits,
        `${sharePct}%`,
        formatDate(c.firstCommitAt, i18n.language),
        formatDate(c.lastCommitAt, i18n.language),
      ];
    });
    return [
      `# ${t("contributors.title")}`,
      "",
      mdTable(
        [
          t("contributors.colName"),
          t("contributors.colEmail"),
          t("contributors.colCommits"),
          t("contributors.colShare"),
          t("contributors.colFirst"),
          t("contributors.colLast"),
        ],
        rows,
      ),
      "",
    ].join("\n");
  };

  return (
    <>
      <PageHeader
        title={t("contributors.title")}
        subtitle={t("contributors.subtitle")}
        actions={
          <ExportMarkdownButton
            build={buildMarkdown}
            disabled={!contributors.data?.length}
          />
        }
      />
      <div className="flex flex-col gap-4 p-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle>{t("contributors.cohortTitle")}</CardTitle>
              <div className="text-xs text-muted-foreground">
                {t("contributors.cohortHint")}
              </div>
            </div>
            <ExportPngButton
              containerRef={cohortRef}
              filename="contributor-cohort.png"
              disabled={!cohort.data?.length}
            />
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full" ref={cohortRef}>
              {cohort.isPending ? (
                <Skeleton className="h-full w-full" />
              ) : !cohort.data?.length ? (
                <p className="text-sm text-muted-foreground">
                  {t("common.noData")}
                </p>
              ) : (
                <ResponsiveContainer>
                  <AreaChart
                    data={cohort.data}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="cohortActive" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--color-chart-1)"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--color-chart-1)"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="var(--color-border)"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="bucket"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={32}
                    />
                    <YAxis
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        color: "var(--color-popover-foreground)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="active"
                      name={t("contributors.cohortActive")}
                      stroke="var(--color-chart-1)"
                      fill="url(#cohortActive)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="newAuthors"
                      name={t("contributors.cohortNew")}
                      stroke="var(--color-chart-2)"
                      fill="var(--color-chart-2)"
                      fillOpacity={0.25}
                      strokeWidth={1.5}
                    />
                    <Area
                      type="monotone"
                      dataKey="returning"
                      name={t("contributors.cohortReturning")}
                      stroke="var(--color-chart-3)"
                      fill="var(--color-chart-3)"
                      fillOpacity={0.18}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {contributors.isPending ? (
              <div className="flex flex-col gap-1 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !contributors.data?.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("common.noData")}
              </p>
            ) : (
              <ul className="divide-y">
                {contributors.data.map((c) => {
                  const ratio = c.commits / max;
                  const sharePct =
                    total > 0 ? Math.round((c.commits / total) * 100) : 0;
                  return (
                    <li key={c.email}>
                      <Link
                        to={`/contributors/${encodeURIComponent(c.email)}`}
                        className="flex items-center gap-3 p-4 transition-colors hover:bg-accent/40"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Users size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium">
                              {c.name}
                            </span>
                            <span className="shrink-0 text-sm tabular-nums">
                              {c.commits}{" "}
                              <span className="text-xs text-muted-foreground">
                                ({sharePct}%)
                              </span>
                            </span>
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {c.email}
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-[var(--color-chart-1)]"
                              style={{
                                width: `${Math.max(2, ratio * 100)}%`,
                              }}
                            />
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {formatDate(c.firstCommitAt, i18n.language)} —{" "}
                            {formatDate(c.lastCommitAt, i18n.language)}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
