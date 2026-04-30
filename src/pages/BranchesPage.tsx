import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { GitBranch, ArrowUp, ArrowDown } from "lucide-react";

import { api } from "@/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Select";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type StaleOption = "all" | "30" | "60" | "90" | "180";

function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

export function BranchesPage() {
  const { t, i18n } = useTranslation();
  const { selectedRepoId } = useAppState();
  const [stale, setStale] = useState<StaleOption>("all");

  const summary = useQuery({
    queryKey: ["summary", selectedRepoId],
    queryFn: () => api.getRepoSummary(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const branches = useQuery({
    queryKey: ["branches", selectedRepoId],
    queryFn: () => api.listBranches(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const threshold = stale === "all" ? null : Number(stale);
  const visible = useMemo(() => {
    if (!branches.data) return [];
    if (threshold == null) return branches.data;
    return branches.data.filter((b) => {
      if (!b.lastCommit) return false;
      return daysSince(b.lastCommit.timestamp) > threshold;
    });
  }, [branches.data, threshold]);

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("branches.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("branches.title")}
        subtitle={summary.data?.repo.name ?? t("branches.subtitle")}
        actions={
          <Select<StaleOption>
            value={stale}
            onChange={setStale}
            options={[
              { value: "all", label: t("branchesFilter.all") },
              { value: "30", label: t("branchesFilter.stale30") },
              { value: "60", label: t("branchesFilter.stale60") },
              { value: "90", label: t("branchesFilter.stale90") },
              { value: "180", label: t("branchesFilter.stale180") },
            ]}
          />
        }
      />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            {branches.isPending ? (
              <div className="flex flex-col gap-1 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : !visible.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("branches.noBranches")}
              </p>
            ) : (
              <ul className="divide-y">
                {visible.map((b) => {
                  const c = b.lastCommit;
                  const ageDays = c ? daysSince(c.timestamp) : null;
                  const isStale =
                    ageDays != null && ageDays > 90 && !b.isHead;
                  return (
                    <li
                      key={`${b.isRemote ? "r" : "l"}/${b.name}`}
                      className="flex items-start gap-3 p-4"
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          b.isHead
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <GitBranch size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-mono text-sm font-semibold">
                            {b.name}
                          </span>
                          {b.isHead && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                              {t("branches.head")}
                            </span>
                          )}
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {b.isRemote ? t("branches.remote") : t("branches.local")}
                          </span>
                          {isStale && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                              {t("branchesFilter.staleBadge")}
                            </span>
                          )}
                          {!b.isHead && b.ahead === 0 && b.behind === 0 ? (
                            <span className="text-[11px] text-muted-foreground">
                              {t("branches.upToDate")}
                            </span>
                          ) : (
                            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              {b.ahead > 0 && (
                                <span className="flex items-center gap-0.5 text-emerald-500">
                                  <ArrowUp size={10} />
                                  {b.ahead} {t("branches.ahead")}
                                </span>
                              )}
                              {b.behind > 0 && (
                                <span className="flex items-center gap-0.5 text-rose-500">
                                  <ArrowDown size={10} />
                                  {b.behind} {t("branches.behind")}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {c && (
                          <div className="mt-1 flex items-center gap-2 text-sm">
                            <Link
                              to={`/commits/${c.id}`}
                              className="rounded bg-muted px-1 py-0.5 font-mono text-xs hover:bg-accent"
                            >
                              {c.shortId}
                            </Link>
                            <span className="flex-1 truncate text-foreground/90">
                              {c.summary}
                            </span>
                          </div>
                        )}
                        {c && (
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{c.authorName}</span>
                            <span>·</span>
                            <span>{formatDate(c.timestamp, i18n.language)}</span>
                            {ageDays != null && (
                              <>
                                <span>·</span>
                                <span>
                                  {t("branchesFilter.daysAgo", { count: ageDays })}
                                </span>
                              </>
                            )}
                          </div>
                        )}
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
