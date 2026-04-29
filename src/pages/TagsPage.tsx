import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Tag } from "lucide-react";

import { api } from "@/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { formatDate } from "@/lib/format";

export function TagsPage() {
  const { t, i18n } = useTranslation();
  const { selectedRepoId } = useAppState();

  const summary = useQuery({
    queryKey: ["summary", selectedRepoId],
    queryFn: () => api.getRepoSummary(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const tags = useQuery({
    queryKey: ["tags", selectedRepoId],
    queryFn: () => api.listTags(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("tags.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("tags.title")}
        subtitle={summary.data?.repo.name ?? t("tags.subtitle")}
      />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            {tags.isPending ? (
              <div className="flex flex-col gap-1 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !tags.data?.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("tags.noTags")}
              </p>
            ) : (
              <ul className="divide-y">
                {tags.data.map((tag, idx) => {
                  const isLast = idx === tags.data!.length - 1;
                  return (
                    <li key={tag.name} className="flex items-start gap-3 p-4">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Tag size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-mono text-sm font-semibold">
                            {tag.name}
                          </span>
                          {tag.timestamp && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(tag.timestamp, i18n.language)}
                            </span>
                          )}
                          {tag.taggerName && (
                            <span className="text-xs text-muted-foreground">
                              · {tag.taggerName}
                            </span>
                          )}
                        </div>
                        {tag.message && (
                          <p className="mt-1 truncate text-sm text-foreground/90">
                            {tag.message.split("\n")[0]}
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <code className="rounded bg-muted px-1 py-0.5 font-mono">
                            {tag.targetOid.slice(0, 7)}
                          </code>
                          <span>
                            {isLast
                              ? t("tags.noPrevious")
                              : t("tags.commitsSince", {
                                  count: tag.commitsSincePrevious ?? 0,
                                })}
                          </span>
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
