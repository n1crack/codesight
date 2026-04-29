import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";

import { api } from "@/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { formatDate } from "@/lib/format";

export function ContributorsPage() {
  const { t, i18n } = useTranslation();
  const { selectedRepoId } = useAppState();

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

  return (
    <>
      <PageHeader
        title={t("contributors.title")}
        subtitle={t("contributors.subtitle")}
      />
      <div className="p-6">
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
