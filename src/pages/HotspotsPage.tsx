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

type TabKey = "files" | "directories" | "couplings";

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
          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            items={[
              { value: "files", label: t("hotspotsPage.tabFiles") },
              { value: "directories", label: t("hotspotsPage.tabDirectories") },
              { value: "couplings", label: t("hotspotsPage.tabCouplings") },
            ]}
          />
        }
      />
      <div className="p-6">
        {tab === "files" && <FilesTab repoId={selectedRepoId} />}
        {tab === "directories" && <DirectoriesTab repoId={selectedRepoId} />}
        {tab === "couplings" && <CouplingsTab repoId={selectedRepoId} />}
      </div>
    </>
  );
}

function FilesTab({ repoId }: { repoId: number }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["hotspots", repoId, 40],
    queryFn: () => api.getFileHotspots(repoId, 40),
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
                <li key={h.path} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate font-mono text-xs"
                      title={h.path}
                    >
                      {h.path}
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
  const [depth, setDepth] = useState(2);
  const q = useQuery({
    queryKey: ["dirHotspots", repoId, depth, 40],
    queryFn: () => api.getDirectoryHotspots(repoId, depth, 40),
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
  const q = useQuery({
    queryKey: ["couplings", repoId, 50],
    queryFn: () => api.getFileCouplings(repoId, 50),
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
