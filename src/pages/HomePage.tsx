import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { api } from "@/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardValue,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Select";
import { Heatmap } from "@/components/Heatmap";
import { PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { formatDate } from "@/lib/format";

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { myEmail, setMyEmail } = useAppState();
  const currentYear = new Date().getFullYear();
  const filterEmail = myEmail || null;

  const authors = useQuery({
    queryKey: ["knownAuthors"],
    queryFn: api.listKnownAuthors,
  });

  const summary = useQuery({
    queryKey: ["globalSummary", filterEmail],
    queryFn: () => api.getGlobalSummary(filterEmail),
  });

  const heatmap = useQuery({
    queryKey: ["globalHeatmap", currentYear, filterEmail],
    queryFn: () => api.getGlobalHeatmap(currentYear, filterEmail),
  });

  const recent = useQuery({
    queryKey: ["globalRecent", filterEmail],
    queryFn: () => api.getGlobalRecentCommits(20, filterEmail),
  });

  const authorOptions = [
    { value: "", label: t("home.filterAll") },
    ...(authors.data ?? []).slice(0, 50).map((a) => ({
      value: a.email,
      label: `${a.name} (${a.commits})`,
    })),
  ];

  return (
    <>
      <PageHeader
        title={t("home.title")}
        subtitle={t("home.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("home.filterAuthor")}
            </span>
            <Select<string>
              value={filterEmail ?? ""}
              onChange={(v) => setMyEmail(v || null)}
              options={authorOptions}
            />
          </div>
        }
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
            <CardTitle>{t("home.recentActivity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.isPending ? (
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 10 }).map((_, i) => (
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
