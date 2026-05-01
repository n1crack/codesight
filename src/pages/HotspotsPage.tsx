import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { Select } from "@/components/ui/Select";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";

import { Link } from "react-router-dom";

import { DateRangeBadge } from "@/components/DateRangeBadge";
import { OpenInIdeButton } from "@/components/OpenInIdeButton";
import { cn } from "@/lib/utils";
import { resolveDateRangeSince } from "@/state/AppState";
import type { ChurnRiskLevel } from "@/types";

type TabKey = "files" | "directories" | "couplings" | "risk";

export function HotspotsPage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();
  const [tab, setTab] = useState<TabKey>("files");

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("hotspotsPage.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("hotspotsPage.title")}
        subtitle={t("hotspotsPage.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <DateRangeBadge />
            <Tabs<TabKey>
              value={tab}
              onChange={setTab}
              items={[
                { value: "files", label: t("hotspotsPage.tabFiles") },
                { value: "directories", label: t("hotspotsPage.tabDirectories") },
                { value: "couplings", label: t("hotspotsPage.tabCouplings") },
                { value: "risk", label: t("hotspotsPage.tabRisk") },
              ]}
            />
          </div>
        }
      />
      <div className="p-6">
        {tab === "files" && <FilesTab repoId={selectedRepoId} />}
        {tab === "directories" && <DirectoriesTab repoId={selectedRepoId} />}
        {tab === "couplings" && <CouplingsTab repoId={selectedRepoId} />}
        {tab === "risk" && <RiskTab repoId={selectedRepoId} />}
      </div>
    </>
  );
}

function FilesTab({ repoId }: { repoId: number }) {
  const { t } = useTranslation();
  const { dateRange } = useAppState();
  const since = resolveDateRangeSince(dateRange);
  const q = useQuery({
    queryKey: ["hotspots", repoId, 40, since],
    queryFn: () => api.getFileHotspots(repoId, 40, since),
  });
  const max = Math.max(1, ...(q.data ?? []).map((h) => h.commits));

  return (
    <Card>
      <CardContent className="p-0">
        {q.isPending ? (
          <div className="flex flex-col gap-1 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : !q.data?.length ? (
          <p className="p-4 text-sm text-muted-foreground">{t("common.noData")}</p>
        ) : (
          <ul className="divide-y">
            {q.data.map((h) => {
              const ratio = h.commits / max;
              return (
                <li
                  key={h.path}
                  className="group flex items-center gap-3 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate font-mono text-xs"
                        title={h.path}
                      >
                        {h.path}
                      </span>
                      <OpenInIdeButton
                        filePath={h.path}
                        className="opacity-0 group-hover:opacity-100"
                      />
                    </div>
                    <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                      <span className="text-emerald-500">+{h.additions}</span>
                      <span className="text-rose-500">-{h.deletions}</span>
                    </div>
                  </div>
                  <div className="flex w-32 shrink-0 flex-col items-end gap-1">
                    <span className="text-xs tabular-nums">
                      {t("hotspotsPage.commitsCount", { count: h.commits })}
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
  );
}

function DirectoriesTab({ repoId }: { repoId: number }) {
  const { t } = useTranslation();
  const { dateRange } = useAppState();
  const since = resolveDateRangeSince(dateRange);
  const [depth, setDepth] = useState(2);
  const q = useQuery({
    queryKey: ["dirHotspots", repoId, depth, 40, since],
    queryFn: () => api.getDirectoryHotspots(repoId, depth, 40, since),
  });
  const max = Math.max(1, ...(q.data ?? []).map((h) => h.commits));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{t("hotspotsPage.directoryHint")}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("hotspotsPage.depth")}
            </span>
            <Select<number>
              value={depth}
              onChange={setDepth}
              options={[1, 2, 3].map((d) => ({ value: d, label: String(d) }))}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {q.isPending ? (
          <div className="flex flex-col gap-1 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : !q.data?.length ? (
          <p className="p-4 text-sm text-muted-foreground">{t("common.noData")}</p>
        ) : (
          <ul className="divide-y">
            {q.data.map((h) => {
              const ratio = h.commits / max;
              return (
                <li key={h.path} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate font-mono text-sm"
                      title={h.path}
                    >
                      {h.path}
                    </div>
                    <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                      <span>{t("hotspotsPage.filesCount", { count: h.files })}</span>
                      <span className="text-emerald-500">+{h.additions}</span>
                      <span className="text-rose-500">-{h.deletions}</span>
                    </div>
                  </div>
                  <div className="flex w-32 shrink-0 flex-col items-end gap-1">
                    <span className="text-xs tabular-nums">
                      {t("hotspotsPage.commitsCount", { count: h.commits })}
                    </span>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-[var(--color-chart-2)]"
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
  );
}

function CouplingsTab({ repoId }: { repoId: number }) {
  const { t } = useTranslation();
  const { dateRange } = useAppState();
  const since = resolveDateRangeSince(dateRange);
  const q = useQuery({
    queryKey: ["couplings", repoId, 50, since],
    queryFn: () => api.getFileCouplings(repoId, 50, since),
  });
  const max = Math.max(1, ...(q.data ?? []).map((c) => c.jointChanges));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("hotspotsPage.couplingHint")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {q.isPending ? (
          <div className="flex flex-col gap-1 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : !q.data?.length ? (
          <p className="p-4 text-sm text-muted-foreground">{t("common.noData")}</p>
        ) : (
          <ul className="divide-y">
            {q.data.map((c, i) => {
              const ratio = c.jointChanges / max;
              return (
                <li key={i} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate font-mono text-xs"
                      title={c.fileA}
                    >
                      {c.fileA}
                    </div>
                    <div
                      className="truncate font-mono text-xs text-muted-foreground"
                      title={c.fileB}
                    >
                      ↔ {c.fileB}
                    </div>
                  </div>
                  <div className="flex w-36 shrink-0 flex-col items-end gap-1">
                    <span className="text-xs tabular-nums">
                      {c.jointChanges} {t("hotspotsPage.jointChanges")}
                    </span>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-[var(--color-chart-3)]"
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
  );
}

const RISK_BADGE: Record<ChurnRiskLevel, string> = {
  low: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  medium: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  high: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

const RISK_BAR: Record<ChurnRiskLevel, string> = {
  low: "bg-yellow-500",
  medium: "bg-orange-500",
  high: "bg-rose-500",
};

function RiskTab({ repoId }: { repoId: number }) {
  const { t } = useTranslation();
  const { dateRange } = useAppState();
  const since = resolveDateRangeSince(dateRange);
  const q = useQuery({
    queryKey: ["churnRisk", repoId, 40, since],
    queryFn: () => api.getChurnRisk(repoId, 40, since),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("hotspotsPage.tabRisk")}</CardTitle>
        <div className="text-xs text-muted-foreground">
          {t("hotspotsPage.riskHint")}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {q.isPending ? (
          <div className="flex flex-col gap-1 p-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !q.data?.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            {t("common.noData")}
          </p>
        ) : (
          <ul className="divide-y">
            {q.data.map((f) => {
              const levelKey =
                f.riskLevel === "high"
                  ? "hotspotsPage.riskHigh"
                  : f.riskLevel === "medium"
                    ? "hotspotsPage.riskMedium"
                    : "hotspotsPage.riskLow";
              return (
                <li
                  key={f.path}
                  className="group flex items-start gap-3 p-3"
                >
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      RISK_BADGE[f.riskLevel],
                    )}
                  >
                    {t(levelKey)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate font-mono text-xs"
                        title={f.path}
                      >
                        {f.path}
                      </span>
                      <OpenInIdeButton
                        filePath={f.path}
                        className="opacity-0 group-hover:opacity-100"
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>
                        {t("hotspotsPage.commitsCount", { count: f.commits })}
                      </span>
                      {f.primaryName && (
                        <Link
                          to={`/contributors/${encodeURIComponent(f.primaryEmail)}`}
                          className="hover:underline"
                        >
                          {t("hotspotsPage.primarySharePct", {
                            pct: Math.round(f.primarySharePct),
                            name: f.primaryName,
                          })}
                        </Link>
                      )}
                      <span>
                        {t("hotspotsPage.lastTouched", {
                          days: f.daysSinceLast,
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex w-32 shrink-0 flex-col items-end gap-1">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {(f.riskScore * 100).toFixed(0)}
                    </span>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full", RISK_BAR[f.riskLevel])}
                        style={{
                          width: `${Math.max(4, f.riskScore * 100)}%`,
                        }}
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
  );
}
