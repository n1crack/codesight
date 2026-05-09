import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Heatmap } from "@/components/Heatmap";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Select } from "@/components/ui/Select";
import { ExportPngButton } from "@/components/ExportPngButton";
import { useAppState } from "@/state/AppState";

export function HeatmapPage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const cardRef = useRef<HTMLDivElement>(null);

  const summary = useQuery({
    queryKey: ["summary", selectedRepoId],
    queryFn: () => api.getRepoSummary(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const heatmap = useQuery({
    queryKey: ["heatmap", selectedRepoId, year],
    queryFn: () => api.getCommitHeatmap(selectedRepoId!, year),
    enabled: selectedRepoId != null,
  });

  const years = useMemo(() => {
    const start = summary.data?.first_commit_at
      ? new Date(summary.data.first_commit_at).getFullYear()
      : currentYear - 4;
    const end = summary.data?.last_commit_at
      ? new Date(summary.data.last_commit_at).getFullYear()
      : currentYear;
    const out: number[] = [];
    for (let y = end; y >= start; y--) out.push(y);
    if (!out.includes(currentYear)) out.unshift(currentYear);
    return out;
  }, [summary.data, currentYear]);

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("heatmap.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("heatmap.title")}
        subtitle={summary.data?.repo.name}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("heatmap.year")}</span>
            <Select<number>
              value={year}
              onChange={setYear}
              options={years.map((y) => ({ value: y, label: String(y) }))}
            />
            <ExportPngButton
              containerRef={cardRef}
              filename={`heatmap-${year}.png`}
              disabled={!heatmap.data}
            />
          </div>
        }
      />
      <div className="p-6" ref={cardRef}>
        <Card>
          <CardHeader>
            <CardTitle>
              {heatmap.data
                ? `${heatmap.data.total} commits — ${year}`
                : t("common.loading")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {heatmap.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : heatmap.data ? (
              <Heatmap data={heatmap.data} />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
