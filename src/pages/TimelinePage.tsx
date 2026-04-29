import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import type { TimelineGranularity, TimelineMetric } from "@/types";

export function TimelinePage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();
  const [granularity, setGranularity] = useState<TimelineGranularity>("week");
  const [metric, setMetric] = useState<TimelineMetric>("commits");

  const summary = useQuery({
    queryKey: ["summary", selectedRepoId],
    queryFn: () => api.getRepoSummary(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const timeline = useQuery({
    queryKey: ["timeline", selectedRepoId, granularity],
    queryFn: () => api.getCommitTimeline(selectedRepoId!, granularity),
    enabled: selectedRepoId != null && metric === "commits",
  });

  const churn = useQuery({
    queryKey: ["churn", selectedRepoId, granularity],
    queryFn: () => api.getCodeChurn(selectedRepoId!, granularity),
    enabled: selectedRepoId != null && metric === "churn",
  });

  const chartData = useMemo<Array<Record<string, string | number>>>(() => {
    if (metric === "commits") {
      return (timeline.data ?? []).map((p) => ({ bucket: p.bucket, count: p.count }));
    }
    return (churn.data ?? []).map((p) => ({
      bucket: p.bucket,
      additions: p.additions,
      deletions: -p.deletions,
    }));
  }, [metric, timeline.data, churn.data]);

  const isLoading =
    metric === "commits" ? timeline.isPending : churn.isPending;

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("timeline.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("timeline.title")}
        subtitle={summary.data?.repo.name}
        actions={
          <div className="flex items-center gap-3">
            <Tabs<TimelineMetric>
              value={metric}
              onChange={setMetric}
              items={[
                { value: "commits", label: t("timeline.commits") },
                { value: "churn", label: t("timeline.churn") },
              ]}
            />
            <Tabs<TimelineGranularity>
              value={granularity}
              onChange={setGranularity}
              items={[
                { value: "day", label: t("timeline.byDay") },
                { value: "week", label: t("timeline.byWeek") },
                { value: "month", label: t("timeline.byMonth") },
              ]}
            />
          </div>
        }
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {metric === "commits" ? t("timeline.commits") : t("timeline.churn")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer>
                  <AreaChart
                    data={chartData}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="commitFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--color-chart-1)"
                          stopOpacity={0.6}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--color-chart-1)"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                      <linearGradient id="addFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.7 0.18 150)" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="oklch(0.7 0.18 150)" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="delFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.65 0.22 25)" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="oklch(0.65 0.22 25)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="bucket"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        color: "var(--color-popover-foreground)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(value, name) => {
                        const v = Math.abs(Number(value));
                        const label =
                          name === "additions"
                            ? t("timeline.additions")
                            : name === "deletions"
                              ? t("timeline.deletions")
                              : t("timeline.commits");
                        return [v, label];
                      }}
                    />
                    {metric === "commits" ? (
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="var(--color-chart-1)"
                        fill="url(#commitFill)"
                        strokeWidth={2}
                      />
                    ) : (
                      <>
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area
                          type="monotone"
                          dataKey="additions"
                          name={t("timeline.additions")}
                          stroke="oklch(0.7 0.18 150)"
                          fill="url(#addFill)"
                          strokeWidth={1.5}
                        />
                        <Area
                          type="monotone"
                          dataKey="deletions"
                          name={t("timeline.deletions")}
                          stroke="oklch(0.65 0.22 25)"
                          fill="url(#delFill)"
                          strokeWidth={1.5}
                        />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
