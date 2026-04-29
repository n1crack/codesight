import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

const TYPE_COLORS: Record<string, string> = {
  feat: "var(--color-chart-1)",
  fix: "var(--color-chart-2)",
  refactor: "var(--color-chart-3)",
  docs: "var(--color-chart-4)",
  test: "var(--color-chart-5)",
};

interface Props {
  repoId: number;
}

export function CommitMessageStatsCard({ repoId }: Props) {
  const { t } = useTranslation();
  const stats = useQuery({
    queryKey: ["msgStats", repoId],
    queryFn: () => api.getCommitMessageStats(repoId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("messages.title")}</CardTitle>
        <div className="text-xs text-muted-foreground">{t("messages.subtitle")}</div>
      </CardHeader>
      <CardContent>
        {stats.isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : !stats.data || stats.data.total === 0 ? (
          <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("messages.conventionalRatio")}
                </div>
                <div className="font-semibold tabular-nums">
                  {Math.round(
                    (stats.data.conventionalTotal / stats.data.total) * 100,
                  )}
                  %
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {t("messages.avgLength")}
                </div>
                <div className="font-semibold tabular-nums">
                  {stats.data.avgSubjectLength.toFixed(0)} {t("messages.chars")}
                </div>
              </div>
            </div>
            <ul className="flex flex-col gap-1">
              {stats.data.types.map(([type, count]) => {
                const ratio = count / stats.data.total;
                const color = TYPE_COLORS[type] ?? "var(--color-chart-1)";
                return (
                  <li key={type} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs">{type}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
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
              {stats.data.noTypeCount > 0 && (
                <li className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("messages.noType")}</span>
                  <span className="tabular-nums">
                    {stats.data.noTypeCount}
                  </span>
                </li>
              )}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
