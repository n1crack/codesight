import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

interface Props {
  repoId: number;
  limit?: number;
}

export function FileHotspotsCard({ repoId, limit = 10 }: Props) {
  const { t } = useTranslation();
  const hotspots = useQuery({
    queryKey: ["hotspots", repoId, limit],
    queryFn: () => api.getFileHotspots(repoId, limit),
  });

  const max = Math.max(1, ...(hotspots.data ?? []).map((h) => h.commits));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("overview.fileHotspots")}</CardTitle>
        <div className="text-xs text-muted-foreground">
          {t("overview.fileHotspotsHint")}
        </div>
      </CardHeader>
      <CardContent>
        {hotspots.isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : !hotspots.data?.length ? (
          <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {hotspots.data.map((h) => {
              const ratio = h.commits / max;
              return (
                <li key={h.path} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-mono text-xs" title={h.path}>
                      {h.path}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {h.commits} {t("overview.changes")}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full bg-[var(--color-chart-1)]",
                      )}
                      style={{ width: `${Math.max(2, ratio * 100)}%` }}
                    />
                  </div>
                  <div className="flex gap-3 text-[11px] text-muted-foreground">
                    <span className="text-emerald-500">+{h.additions}</span>
                    <span className="text-rose-500">-{h.deletions}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
