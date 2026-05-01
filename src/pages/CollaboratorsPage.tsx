import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { formatDate } from "@/lib/format";

export function CollaboratorsPage() {
  const { t, i18n } = useTranslation();
  const { selectedRepoId } = useAppState();

  const pairs = useQuery({
    queryKey: ["coauthorPairs", selectedRepoId, 100],
    queryFn: () => api.getCoauthorPairs(selectedRepoId!, 100),
    enabled: selectedRepoId != null,
  });

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("collaborators.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const max = Math.max(1, ...(pairs.data ?? []).map((p) => p.jointCommits));

  return (
    <>
      <PageHeader
        title={t("collaborators.title")}
        subtitle={t("collaborators.subtitle")}
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("collaborators.title")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pairs.isPending ? (
              <div className="flex flex-col gap-1 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !pairs.data?.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("collaborators.noData")}
              </p>
            ) : (
              <ul className="divide-y">
                {pairs.data.map((p, i) => {
                  const ratio = p.jointCommits / max;
                  return (
                    <li key={i} className="flex items-center gap-3 p-3">
                      <Users size={14} className="text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2 text-sm">
                          <Link
                            to={`/contributors/${encodeURIComponent(p.aEmail)}`}
                            className="font-medium hover:underline"
                          >
                            {p.aName}
                          </Link>
                          <span className="text-muted-foreground">↔</span>
                          <Link
                            to={`/contributors/${encodeURIComponent(p.bEmail)}`}
                            className="font-medium hover:underline"
                          >
                            {p.bName}
                          </Link>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {t("collaborators.lastCollab", {
                            date: formatDate(p.lastCollabAt, i18n.language),
                          })}
                        </div>
                      </div>
                      <div className="flex w-40 shrink-0 flex-col items-end gap-1">
                        <span className="text-xs tabular-nums">
                          {t("collaborators.jointCommits", {
                            count: p.jointCommits,
                          })}
                        </span>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-[var(--color-chart-1)]"
                            style={{ width: `${Math.max(2, ratio * 100)}%` }}
                          />
                        </div>
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
