import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertTriangle, Crown, UserMinus } from "lucide-react";

import { api } from "@/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardValue,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { cn } from "@/lib/utils";
import type { OwnershipAlert } from "@/types";

const ALERT_STYLES: Record<
  OwnershipAlert["kind"],
  {
    icon: React.ComponentType<{ size?: number }>;
    border: string;
    iconBg: string;
    iconColor: string;
  }
> = {
  busFactorOne: {
    icon: Crown,
    border: "border-rose-500/30 bg-rose-500/5",
    iconBg: "bg-rose-500/15",
    iconColor: "text-rose-500",
  },
  highConcentration: {
    icon: AlertTriangle,
    border: "border-amber-500/30 bg-amber-500/5",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-500",
  },
  alumni: {
    icon: UserMinus,
    border: "border-sky-500/30 bg-sky-500/5",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-500",
  },
};

function AlertsCard({ alerts }: { alerts: OwnershipAlert[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ownership.alerts.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {alerts.map((alert, i) => {
          const style = ALERT_STYLES[alert.kind];
          const Icon = style.icon;
          let body: React.ReactNode = null;
          switch (alert.kind) {
            case "busFactorOne":
              body = t("ownership.alerts.busFactorOne", {
                name: alert.authorName,
              });
              break;
            case "highConcentration":
              body = t("ownership.alerts.highConcentration", {
                count: alert.count,
                pct: alert.thresholdPct,
              });
              break;
            case "alumni":
              body = t("ownership.alerts.alumni", {
                count: alert.count,
                days: alert.days,
              });
              break;
          }
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-md border p-3",
                style.border,
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  style.iconBg,
                  style.iconColor,
                )}
              >
                <Icon size={14} />
              </div>
              <p className="flex-1 text-sm">{body}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function OwnershipPage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();

  const summary = useQuery({
    queryKey: ["summary", selectedRepoId],
    queryFn: () => api.getRepoSummary(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const ownership = useQuery({
    queryKey: ["ownership", selectedRepoId],
    queryFn: () => api.getOwnershipReport(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("ownership.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("ownership.title")}
        subtitle={summary.data?.repo.name ?? t("ownership.subtitle")}
      />
      <div className="flex flex-col gap-4 p-6">
        {ownership.data?.alerts && ownership.data.alerts.length > 0 && (
          <AlertsCard alerts={ownership.data.alerts} />
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("ownership.busFactor")}</CardTitle>
              <div className="text-[11px] text-muted-foreground">
                {t("ownership.busFactorHint")}
              </div>
            </CardHeader>
            <CardContent>
              {ownership.isPending ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <CardValue className="text-3xl">
                  {ownership.data?.busFactor ?? "—"}
                </CardValue>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("ownership.totalAuthors")}</CardTitle>
            </CardHeader>
            <CardContent>
              {ownership.isPending ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <CardValue>{ownership.data?.totalAuthors ?? "—"}</CardValue>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("ownership.topAuthors")}</CardTitle>
          </CardHeader>
          <CardContent>
            {ownership.isPending ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : !ownership.data?.topAuthors.length ? (
              <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {ownership.data.topAuthors.map((a) => (
                  <li key={a.email} className="flex flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <Link
                        to={`/contributors/${encodeURIComponent(a.email)}`}
                        className="truncate font-medium hover:underline"
                      >
                        {a.name}
                      </Link>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {a.sharePct.toFixed(1)}% · {a.commits} {t("ownership.commits")}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[var(--color-chart-1)]"
                        style={{
                          width: `${Math.max(2, a.sharePct)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("ownership.fileOwnership")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {ownership.isPending ? (
              <div className="flex flex-col gap-1 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : !ownership.data?.files.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                {t("common.noData")}
              </p>
            ) : (
              <ul className="divide-y">
                {ownership.data.files.map((f) => (
                  <li
                    key={f.path}
                    className="flex items-start justify-between gap-3 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate font-mono text-xs"
                        title={f.path}
                      >
                        {f.path}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t("ownership.primaryAuthor")}:{" "}
                        <Link
                          to={`/contributors/${encodeURIComponent(f.primaryEmail)}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {f.primaryName || f.primaryEmail}
                        </Link>{" "}
                        · {f.distinctAuthors} {t("ownership.distinctAuthors")} ·{" "}
                        {f.totalCommits} {t("ownership.commits")}
                      </div>
                    </div>
                    <div className="flex w-32 shrink-0 flex-col items-end gap-1">
                      <span className="text-xs tabular-nums">
                        {f.primarySharePct.toFixed(0)}% {t("ownership.share")}
                      </span>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-[var(--color-chart-2)]"
                          style={{
                            width: `${Math.max(2, f.primarySharePct)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
