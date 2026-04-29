import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/PageHeader";
import type { TimelinePoint } from "@/types";

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function ComparisonPage() {
  const { t } = useTranslation();
  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: api.listRepositories,
  });
  const [selected, setSelected] = useState<number[]>([]);

  const summaries = useQueries({
    queries: selected.map((id) => ({
      queryKey: ["summary", id],
      queryFn: () => api.getRepoSummary(id),
    })),
  });

  const timelines = useQueries({
    queries: selected.map((id) => ({
      queryKey: ["timeline", id, "month"] as const,
      queryFn: () => api.getCommitTimeline(id, "month"),
    })),
  });

  const merged = useMemo(() => {
    if (!selected.length) return [];
    const buckets = new Map<string, Record<string, number | string>>();
    timelines.forEach((tq, i) => {
      const id = selected[i];
      const repoName =
        repos.data?.find((r) => r.id === id)?.name ?? `repo-${id}`;
      (tq.data as TimelinePoint[] | undefined)?.forEach((p) => {
        const row = buckets.get(p.bucket) ?? { bucket: p.bucket };
        row[repoName] = p.count;
        buckets.set(p.bucket, row);
      });
    });
    return Array.from(buckets.values()).sort((a, b) =>
      String(a.bucket).localeCompare(String(b.bucket)),
    );
  }, [timelines, selected, repos.data]);

  const repoNames = useMemo(
    () =>
      selected.map(
        (id) => repos.data?.find((r) => r.id === id)?.name ?? `repo-${id}`,
      ),
    [selected, repos.data],
  );

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <>
      <PageHeader title={t("comparison.title")} />
      <div className="flex flex-col gap-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("comparison.selectRepos")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!repos.data?.length ? (
              <p className="text-sm text-muted-foreground">{t("sidebar.noRepos")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {repos.data.map((r) => {
                  const active = selected.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggle(r.id)}
                      className={`rounded-md border px-2.5 py-1 text-xs ${
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selected.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {summaries.map((sq, i) => {
                const repoName = repoNames[i];
                if (!sq.data) return null;
                return (
                  <Card key={selected[i]}>
                    <CardHeader>
                      <CardTitle>{repoName}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-lg font-semibold tabular-nums">
                            {sq.data.total_commits}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {t("overview.totalCommits")}
                          </div>
                        </div>
                        <div>
                          <div className="text-lg font-semibold tabular-nums">
                            {sq.data.contributor_count}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {t("overview.contributors")}
                          </div>
                        </div>
                        <div>
                          <div className="text-lg font-semibold tabular-nums">
                            {sq.data.branch_count}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {t("overview.branches")}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t("comparison.metrics.commits")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72 w-full">
                  <ResponsiveContainer>
                    <BarChart
                      data={merged}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        stroke="var(--color-border)"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="bucket"
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        minTickGap={24}
                      />
                      <YAxis
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
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
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {repoNames.map((name, i) => (
                        <Bar
                          key={name}
                          dataKey={name}
                          fill={COLORS[i % COLORS.length]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
