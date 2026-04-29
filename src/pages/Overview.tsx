import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle, CardValue } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { FileHotspotsCard } from "@/components/FileHotspotsCard";
import { CommitMessageStatsCard } from "@/components/CommitMessageStatsCard";
import { useAppState } from "@/state/AppState";
import { formatDate } from "@/lib/format";

const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function OverviewPage() {
  const { t, i18n } = useTranslation();
  const { selectedRepoId } = useAppState();

  const summary = useQuery({
    queryKey: ["summary", selectedRepoId],
    queryFn: () => api.getRepoSummary(selectedRepoId!),
    enabled: selectedRepoId != null,
  });
  const contributors = useQuery({
    queryKey: ["topContributors", selectedRepoId],
    queryFn: () => api.getTopContributors(selectedRepoId!, 5),
    enabled: selectedRepoId != null,
  });
  const languages = useQuery({
    queryKey: ["languages", selectedRepoId],
    queryFn: () => api.getLanguageBreakdown(selectedRepoId!),
    enabled: selectedRepoId != null,
  });
  const recent = useQuery({
    queryKey: ["recent", selectedRepoId],
    queryFn: () => api.getRecentCommits(selectedRepoId!, 8),
    enabled: selectedRepoId != null,
  });

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("overview.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const langData = (languages.data ?? []).slice(0, 8);

  return (
    <>
      <PageHeader
        title={summary.data?.repo.name ?? t("overview.title")}
        subtitle={summary.data?.repo.path}
      />
      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("overview.totalCommits")}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isPending ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <CardValue>{summary.data?.total_commits ?? "—"}</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("overview.contributors")}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isPending ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <CardValue>{summary.data?.contributor_count ?? "—"}</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("overview.branches")}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isPending ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <CardValue>{summary.data?.branch_count ?? "—"}</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("overview.lastCommit")}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isPending ? (
                <Skeleton className="h-5 w-28" />
              ) : (
                <div className="text-sm">
                  {summary.data?.last_commit_at
                    ? formatDate(summary.data.last_commit_at, i18n.language)
                    : "—"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("overview.topContributors")}</CardTitle>
            </CardHeader>
            <CardContent>
              {contributors.isPending ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-full" />
                  ))}
                </div>
              ) : !contributors.data?.length ? (
                <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {contributors.data.map((c) => (
                    <li key={c.email}>
                      <Link
                        to={`/contributors/${encodeURIComponent(c.email)}`}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1 -mx-2 hover:bg-accent/40"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {c.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {c.email}
                          </div>
                        </div>
                        <div className="text-sm tabular-nums">{c.commits}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("overview.languageBreakdown")}</CardTitle>
            </CardHeader>
            <CardContent>
              {languages.isPending ? (
                <div className="flex items-center gap-4">
                  <Skeleton className="h-40 w-40 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-4 w-full" />
                    ))}
                  </div>
                </div>
              ) : !langData.length ? (
                <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="h-40 w-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-popover)",
                            color: "var(--color-popover-foreground)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                          formatter={(value) =>
                            `${(Number(value) / 1024).toFixed(1)} KiB`
                          }
                        />
                        <Pie
                          data={langData}
                          dataKey="bytes"
                          nameKey="language"
                          innerRadius={36}
                          outerRadius={72}
                          stroke="none"
                        >
                          {langData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex-1 text-sm">
                    {langData.map((l, i) => (
                      <li
                        key={l.language}
                        className="flex items-center justify-between gap-2 py-0.5"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{
                              background: PIE_COLORS[i % PIE_COLORS.length],
                            }}
                          />
                          {l.language}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {l.files}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FileHotspotsCard repoId={selectedRepoId} />
          <CommitMessageStatsCard repoId={selectedRepoId} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("overview.recentActivity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.isPending ? (
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : !recent.data?.length ? (
              <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {recent.data.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {c.shortId}
                    </code>
                    <span className="flex-1 truncate">{c.summary}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {c.authorName}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(c.timestamp, i18n.language)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
