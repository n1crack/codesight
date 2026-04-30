import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle, CardValue } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";

const TYPE_COLORS: Record<string, string> = {
  feat: "var(--color-chart-1)",
  fix: "var(--color-chart-2)",
  refactor: "var(--color-chart-3)",
  docs: "var(--color-chart-4)",
  test: "var(--color-chart-5)",
};

export function MessagesPage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();

  const stats = useQuery({
    queryKey: ["msgStats", selectedRepoId],
    queryFn: () => api.getCommitMessageStats(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("messages.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const total = stats.data?.total ?? 0;
  const conventionalPct =
    total > 0 ? Math.round(((stats.data?.conventionalTotal ?? 0) / total) * 100) : 0;

  return (
    <>
      <PageHeader title={t("messages.title")} subtitle={t("messages.subtitle")} />
      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("overview.totalCommits")}</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.isPending ? (
                <Skeleton className="h-7 w-20" />
              ) : (
                <CardValue>{total}</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("messages.conventionalRatio")}</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.isPending ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <CardValue>{conventionalPct}%</CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("messages.avgLength")}</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.isPending ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <CardValue>
                  {Math.round(stats.data?.avgSubjectLength ?? 0)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {t("messages.chars")}
                  </span>
                </CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("messages.noType")}</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.isPending ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <CardValue>{stats.data?.noTypeCount ?? 0}</CardValue>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("messages.subtitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.isPending ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : !stats.data?.types.length ? (
              <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {stats.data.types.map(([type, count]) => {
                  const ratio = count / total;
                  const color = TYPE_COLORS[type] ?? "var(--color-chart-1)";
                  return (
                    <li key={type} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono">{type}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {count} ({Math.round(ratio * 100)}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, ratio * 100)}%`,
                            background: color,
                          }}
                        />
                      </div>
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
