import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import type { TimelineGranularity } from "@/types";

export function TimelinePage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();
  const [granularity, setGranularity] = useState<TimelineGranularity>("week");

  const summary = useQuery({
    queryKey: ["summary", selectedRepoId],
    queryFn: () => api.getRepoSummary(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const timeline = useQuery({
    queryKey: ["timeline", selectedRepoId, granularity],
    queryFn: () => api.getCommitTimeline(selectedRepoId!, granularity),
    enabled: selectedRepoId != null,
  });

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
          <Tabs<TimelineGranularity>
            value={granularity}
            onChange={setGranularity}
            items={[
              { value: "day", label: t("timeline.byDay") },
              { value: "week", label: t("timeline.byWeek") },
              { value: "month", label: t("timeline.byMonth") },
            ]}
          />
        }
      />
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("timeline.commits")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <AreaChart
                  data={timeline.data ?? []}
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
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      color: "var(--color-popover-foreground)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--color-chart-1)"
                    fill="url(#commitFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
