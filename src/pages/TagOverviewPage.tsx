import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { api } from "@/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardValue,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Heatmap } from "@/components/Heatmap";
import { Sparkline } from "@/components/Sparkline";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { classesFor } from "@/lib/tagColors";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppState } from "@/state/AppState";

export function TagOverviewPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const tagId = Number(id);
  const { setSelectedRepoId } = useAppState();
  const currentYear = new Date().getFullYear();

  const tags = useQuery({
    queryKey: ["repoTags"],
    queryFn: api.listRepoTags,
  });

  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: api.listRepositories,
  });

  const summary = useQuery({
    queryKey: ["globalSummary", null, tagId],
    queryFn: () => api.getGlobalSummary(null, tagId),
  });

  const heatmap = useQuery({
    queryKey: ["globalHeatmap", currentYear, null, tagId],
    queryFn: () => api.getGlobalHeatmap(currentYear, null, tagId),
  });

  const recent = useQuery({
    queryKey: ["globalRecent", null, tagId],
    queryFn: () => api.getGlobalRecentCommits(20, null, tagId),
  });

  const sparklines = useQuery({
    queryKey: ["sparklines", repos.data?.length ?? 0],
    queryFn: () => api.getReposSparklines(30),
    enabled: !!repos.data?.length,
  });
  const sparkByRepo = useMemo(() => {
    const map = new Map<number, number[]>();
    sparklines.data?.forEach((s) => map.set(s.repoId, s.days));
    return map;
  }, [sparklines.data]);

  const tag = tags.data?.find((tg) => tg.id === tagId);
  const cls = tag ? classesFor(tag.color) : null;
  const taggedRepos = useMemo(
    () =>
      (repos.data ?? []).filter((r) =>
        r.tags.some((tg) => tg.id === tagId),
      ),
    [repos.data, tagId],
  );

  if (!Number.isFinite(tagId)) {
    return (
      <>
        <PageHeader title={t("tagOverview.title")} />
        <EmptyState>{t("common.noData")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={
          tag ? (
            <span className="inline-flex items-center gap-2">
              {cls && (
                <span className={cn("h-3 w-3 rounded-full", cls.dot)} />
              )}
              {tag.name}
            </span>
          ) as unknown as string
            : t("tagOverview.title")
        }
        subtitle={t("tagOverview.subtitle", {
          count: tag?.repoCount ?? taggedRepos.length,
        })}
      />
      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Card>
            <CardHeader>
              <CardTitle>{t("home.totalRepos")}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isPending ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <CardValue>{summary.data?.repoCount ?? 0}</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("home.totalCommits")}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isPending ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <CardValue>{summary.data?.totalCommits ?? 0}</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("home.last30")}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isPending ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <CardValue>{summary.data?.commitsLast30Days ?? 0}</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("home.activeRepos")}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isPending ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <CardValue>{summary.data?.activeReposLast30Days ?? 0}</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("home.authors")}</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.isPending ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <CardValue>{summary.data?.authorCount ?? 0}</CardValue>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {t("home.globalHeatmap")} — {currentYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {heatmap.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : heatmap.data ? (
              <Heatmap data={heatmap.data} />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("tagOverview.repos")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!taggedRepos.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("tagOverview.noRepos")}
              </p>
            ) : (
              <ul className="divide-y">
                {taggedRepos.map((r) => {
                  const days = sparkByRepo.get(r.id);
                  const total = days?.reduce((a, b) => a + b, 0) ?? 0;
                  return (
                    <li key={r.id}>
                      <Link
                        to="/activity"
                        onClick={() => setSelectedRepoId(r.id)}
                        className="flex items-center gap-3 p-3 hover:bg-accent/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {r.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {r.path}
                          </div>
                        </div>
                        {days && (
                          <Sparkline
                            values={days}
                            width={104}
                            height={16}
                            className={
                              total > 0
                                ? "text-foreground/80"
                                : "text-muted-foreground/60"
                            }
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("home.recentActivity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.isPending ? (
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : !recent.data?.length ? (
              <p className="text-sm text-muted-foreground">
                {t("common.noData")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {recent.data.map((entry) => {
                  const c = entry.commit;
                  return (
                    <li
                      key={`${entry.repoId}-${c.id}`}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {entry.repoName}
                      </span>
                      <Link
                        to={`/commits/${c.id}?repo=${entry.repoId}`}
                        className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
                      >
                        <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {c.shortId}
                        </code>
                        <span className="truncate">{c.summary}</span>
                      </Link>
                      <Link
                        to={`/contributors/${encodeURIComponent(c.authorEmail)}`}
                        className="shrink-0 text-xs text-muted-foreground hover:underline"
                      >
                        {c.authorName}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(c.timestamp, i18n.language)}
                      </span>
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
