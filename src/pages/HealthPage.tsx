import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { cn } from "@/lib/utils";
import { scoreQuality, type QualitySubScores } from "@/lib/qualityScore";
import type { HealthDetail, HealthSubScore } from "@/types";

const SUB_KEY_TO_I18N: Record<string, string> = {
  recency: "health.subRecency",
  volume: "health.subVolume",
  busFactor: "health.subBusFactor",
  branches: "health.subBranches",
  docs: "health.subDocs",
  conventional: "health.subConventional",
};

const QUALITY_KEY_TO_I18N: Record<keyof QualitySubScores, string> = {
  hygiene: "quality.groupHygiene",
  secrets: "quality.groupSecretsHead",
  dependencies: "quality.groupDependencies",
  code: "quality.groupCode",
  authorship: "quality.groupAuthorship",
  total: "",
};

function formatHint(detail: HealthDetail, t: TFunction): string {
  switch (detail.kind) {
    case "recency": {
      if (detail.daysSinceLast == null) return t("health.hint.recencyNone");
      if (detail.daysSinceLast <= 0) return t("health.hint.recencyToday");
      return t("health.hint.recencyDays", { days: detail.daysSinceLast });
    }
    case "volume":
      return t("health.hint.volume", { count: detail.commitsInLast90 });
    case "busFactor":
      return t("health.hint.busFactor", { value: detail.value });
    case "branches": {
      if (detail.local === 0) return t("health.hint.branchesEmpty");
      if (detail.stale === 0)
        return t("health.hint.branchesClean", { local: detail.local });
      return t("health.hint.branchesStale", {
        stale: detail.stale,
        local: detail.local,
      });
    }
    case "docs": {
      if (detail.hasReadme && detail.hasDocsDir && detail.hasTests) {
        return t("health.hint.docsAll");
      }
      const readme = detail.hasReadme
        ? t("health.hint.docsReadmePresent")
        : t("health.hint.docsReadmeMissing");
      const docs = detail.hasDocsDir
        ? t("health.hint.docsDirPresent")
        : t("health.hint.docsDirMissing");
      const tests = detail.hasTests
        ? t("health.hint.docsTestsPresent")
        : t("health.hint.docsTestsMissing");
      return t("health.hint.docsPartial", { readme, docs, tests });
    }
    case "conventional": {
      if (detail.subjects < 10) return t("health.hint.conventionalNotEnough");
      return t("health.hint.conventionalPct", {
        pct: Math.round(detail.pct),
      });
    }
  }
}

function ratioToColor(ratio: number): {
  fg: string;
  bg: string;
  ring: string;
} {
  if (ratio >= 0.7) {
    return {
      fg: "text-emerald-500",
      bg: "bg-emerald-500",
      ring: "stroke-emerald-500",
    };
  }
  if (ratio >= 0.4) {
    return {
      fg: "text-amber-500",
      bg: "bg-amber-500",
      ring: "stroke-amber-500",
    };
  }
  return {
    fg: "text-rose-500",
    bg: "bg-rose-500",
    ring: "stroke-rose-500",
  };
}

function ratioLabel(ratio: number, t: TFunction): string {
  if (ratio >= 0.85) return t("health.labelExcellent");
  if (ratio >= 0.7) return t("health.labelGood");
  if (ratio >= 0.4) return t("health.labelFair");
  return t("health.labelPoor");
}

interface CombinedScore {
  score: number;
  max: number;
}

function HealthGauge({ data }: { data: CombinedScore }) {
  const ratio = data.max > 0 ? data.score / data.max : 0;
  const size = 180;
  const stroke = 14;
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const offset = c - ratio * c;
  const colors = ratioToColor(ratio);

  return (
    <div className="flex items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={cn(
              "transition-[stroke-dashoffset] duration-500",
              colors.ring,
            )}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className={cn("text-4xl font-semibold tabular-nums", colors.fg)}
          >
            {data.score}
          </div>
          <div className="text-xs text-muted-foreground">/ {data.max}</div>
        </div>
      </div>
    </div>
  );
}

function SubScoreRow({
  label,
  score,
  max,
  hint,
  group,
}: {
  label: string;
  score: number;
  max: number;
  hint?: string;
  group?: string;
}) {
  const { t } = useTranslation();
  const ratio = max > 0 ? score / max : 0;
  const colors = ratioToColor(ratio);
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className={cn("text-xs", colors.fg)}>
            {ratioLabel(ratio, t)}
          </span>
          {group && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {group}
            </span>
          )}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {Math.round(score)} / {max}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", colors.bg)}
          style={{ width: `${Math.max(2, ratio * 100)}%` }}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </li>
  );
}

export function HealthPage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();

  const health = useQuery({
    queryKey: ["repoHealth", selectedRepoId],
    queryFn: () => api.getRepoHealth(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const quality = useQuery({
    queryKey: ["quality", selectedRepoId],
    queryFn: () => api.runQualityScan(selectedRepoId!),
    enabled: selectedRepoId != null,
    staleTime: 5 * 60_000,
  });

  const qScores = useMemo(
    () => (quality.data ? scoreQuality(quality.data) : null),
    [quality.data],
  );

  const combined = useMemo<CombinedScore | null>(() => {
    if (!health.data) return null;
    if (!qScores) {
      return { score: health.data.score, max: health.data.max };
    }
    const hRatio = health.data.score / Math.max(1, health.data.max);
    const qRatio = qScores.total / 100;
    return {
      score: Math.round(((hRatio + qRatio) / 2) * 100),
      max: 100,
    };
  }, [health.data, qScores]);

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("health.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("health.title")} subtitle={t("health.subtitle")} />
      <div className="flex flex-col gap-4 p-6">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-8 p-6">
            {health.isPending ? (
              <Skeleton className="h-44 w-44 rounded-full" />
            ) : combined ? (
              <HealthGauge data={combined} />
            ) : null}
            {combined && (
              <div className="min-w-[220px] flex-1">
                <div className="text-sm font-medium">
                  {ratioLabel(
                    combined.score / Math.max(1, combined.max),
                    t,
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {qScores
                    ? t("health.combinedHint")
                    : t("health.subtitle")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("health.breakdownTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {health.isPending ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !health.data ? (
              <p className="text-sm text-muted-foreground">{t("common.noData")}</p>
            ) : (
              <ul className="divide-y">
                {health.data.subScores.map((s: HealthSubScore) => {
                  const i18nKey = SUB_KEY_TO_I18N[s.key] ?? s.key;
                  return (
                    <SubScoreRow
                      key={`h-${s.key}`}
                      label={t(i18nKey)}
                      score={s.score}
                      max={s.max}
                      hint={formatHint(s.detail, t)}
                      group={t("health.groupActivity")}
                    />
                  );
                })}
                {qScores && quality.data && (
                  <>
                    {(
                      [
                        "hygiene",
                        "secrets",
                        "dependencies",
                        "code",
                        "authorship",
                      ] as const
                    ).map((k) => (
                      <SubScoreRow
                        key={`q-${k}`}
                        label={t(QUALITY_KEY_TO_I18N[k])}
                        score={qScores[k]}
                        max={20}
                        group={t("health.groupQuality")}
                      />
                    ))}
                  </>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
