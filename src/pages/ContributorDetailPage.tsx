import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

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
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { formatDate } from "@/lib/format";

function SpecializationList({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number; sub: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((it) => {
          const ratio = it.value / max;
          return (
            <li key={it.label} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono">{it.label}</span>
                <span className="shrink-0 text-muted-foreground">{it.sub}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-[var(--color-chart-1)]"
                  style={{ width: `${Math.max(2, ratio * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ContributorDetailPage() {
  const { t, i18n } = useTranslation();
  const { selectedRepoId } = useAppState();
  const { email: emailParam } = useParams<{ email: string }>();
  const email = useMemo(
    () => (emailParam ? decodeURIComponent(emailParam) : ""),
    [emailParam],
  );

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const detail = useQuery({
    queryKey: ["contributorDetail", selectedRepoId, email],
    queryFn: () => api.getContributorDetail(selectedRepoId!, email),
    enabled: selectedRepoId != null && !!email,
  });

  const heatmap = useQuery({
    queryKey: ["contributorHeatmap", selectedRepoId, email, year],
    queryFn: () => api.getContributorHeatmap(selectedRepoId!, email, year),
    enabled: selectedRepoId != null && !!email,
  });

  const topFiles = useQuery({
    queryKey: ["contributorTopFiles", selectedRepoId, email],
    queryFn: () => api.getContributorTopFiles(selectedRepoId!, email, 10),
    enabled: selectedRepoId != null && !!email,
  });

  const recent = useQuery({
    queryKey: ["contributorRecent", selectedRepoId, email],
    queryFn: () => api.getContributorRecentCommits(selectedRepoId!, email, 12),
    enabled: selectedRepoId != null && !!email,
  });

  const specialization = useQuery({
    queryKey: ["specialization", selectedRepoId, email],
    queryFn: () => api.getAuthorSpecialization(selectedRepoId!, email),
    enabled: selectedRepoId != null && !!email,
  });

  const years = useMemo(() => {
    const start = detail.data?.firstCommitAt
      ? new Date(detail.data.firstCommitAt).getFullYear()
      : currentYear - 4;
    const end = detail.data?.lastCommitAt
      ? new Date(detail.data.lastCommitAt).getFullYear()
      : currentYear;
    const out: number[] = [];
    for (let y = end; y >= start; y--) out.push(y);
    if (!out.includes(currentYear)) out.unshift(currentYear);
    return out;
  }, [detail.data, currentYear]);

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("contributors.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={detail.data?.name || email}
        subtitle={email}
        actions={
          <Link
            to="/contributors"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <ArrowLeft size={14} /> {t("contributors.back")}
          </Link>
        }
      />
      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Card>
            <CardHeader>
              <CardTitle>{t("overview.totalCommits")}</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.isPending ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <CardValue>{detail.data?.totalCommits ?? "—"}</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("contributors.totalAdditions")}</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.isPending ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <CardValue className="text-emerald-500">
                  +{detail.data?.additions ?? 0}
                </CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("contributors.totalDeletions")}</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.isPending ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <CardValue className="text-rose-500">
                  -{detail.data?.deletions ?? 0}
                </CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("contributors.activeDays")}</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.isPending ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <CardValue>{detail.data?.activeDays ?? 0}</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("overview.lastCommit")}</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.isPending ? (
                <Skeleton className="h-5 w-28" />
              ) : (
                <div className="text-sm">
                  {detail.data?.lastCommitAt
                    ? formatDate(detail.data.lastCommitAt, i18n.language)
                    : "—"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{t("contributors.personalHeatmap")}</CardTitle>
              <Select<number>
                value={year}
                onChange={setYear}
                options={years.map((y) => ({ value: y, label: String(y) }))}
              />
            </div>
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
            <CardTitle>{t("specialization.title")}</CardTitle>
            <div className="text-xs text-muted-foreground">
              {specialization.data
                ? t("specialization.filesTouched", {
                    count: specialization.data.totalFilesTouched,
                  })
                : t("specialization.subtitle")}
            </div>
          </CardHeader>
          <CardContent>
            {specialization.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : !specialization.data ||
              (specialization.data.topLanguages.length === 0 &&
                specialization.data.topDirectories.length === 0) ? (
              <p className="text-sm text-muted-foreground">
                {t("common.noData")}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SpecializationList
                  title={t("specialization.topLanguages")}
                  items={specialization.data.topLanguages.map((l) => ({
                    label: l.language,
                    value: l.bytesChanged,
                    sub: `${l.files} files`,
                  }))}
                />
                <SpecializationList
                  title={t("specialization.topDirectories")}
                  items={specialization.data.topDirectories.map((d) => ({
                    label: d.path,
                    value: d.bytesChanged,
                    sub: `${d.commits} commits`,
                  }))}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("contributors.topFiles")}</CardTitle>
            </CardHeader>
            <CardContent>
              {topFiles.isPending ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              ) : !topFiles.data?.length ? (
                <p className="text-sm text-muted-foreground">
                  {t("common.noData")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {topFiles.data.map((f) => {
                    const max = topFiles.data![0]!.commits;
                    const ratio = f.commits / max;
                    return (
                      <li key={f.path} className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span
                            className="truncate font-mono text-xs"
                            title={f.path}
                          >
                            {f.path}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {f.commits}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-[var(--color-chart-2)]"
                            style={{ width: `${Math.max(2, ratio * 100)}%` }}
                          />
                        </div>
                        <div className="flex gap-3 text-[11px] text-muted-foreground">
                          <span className="text-emerald-500">+{f.additions}</span>
                          <span className="text-rose-500">-{f.deletions}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("contributors.recentCommits")}</CardTitle>
            </CardHeader>
            <CardContent>
              {recent.isPending ? (
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              ) : !recent.data?.length ? (
                <p className="text-sm text-muted-foreground">
                  {t("common.noData")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {recent.data.map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`/commits/${c.id}`}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1 -mx-2 text-sm hover:bg-accent/40"
                      >
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {c.shortId}
                        </code>
                        <span className="flex-1 truncate">{c.summary}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(c.timestamp, i18n.language)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
