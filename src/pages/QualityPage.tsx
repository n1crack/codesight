import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileWarning,
  GitMerge,
  KeyRound,
  Lightbulb,
  ListTodo,
  Package,
  Play,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { api } from "@/api";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { cn } from "@/lib/utils";
import type {
  HistorySecretReport,
  PresenceCheck,
  QualityReport,
  ScanProgress,
} from "@/types";

const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  low: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type SuggestionSeverity = "critical" | "high" | "medium" | "low";
interface Suggestion {
  id: string;
  severity: SuggestionSeverity;
  textKey: string;
  vars?: Record<string, string | number>;
}

const SEVERITY_RANK: Record<SuggestionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const SEVERITY_TONE: Record<SuggestionSeverity, string> = {
  critical: "text-rose-600 dark:text-rose-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-sky-600 dark:text-sky-400",
};
const SEVERITY_DOT: Record<SuggestionSeverity, string> = {
  critical: "bg-rose-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
};

function buildSuggestions(
  d: QualityReport,
  historyScanRun: boolean,
): Suggestion[] {
  const out: Suggestion[] = [];
  const highHits = d.secretsHead.hits.filter((s) => s.severity === "high")
    .length;
  const medHits = d.secretsHead.hits.filter((s) => s.severity === "medium")
    .length;
  const risky = d.secretsHead.riskyFiles.length;
  const conflicts = d.codeHygiene.conflictMarkers.length;
  const noLock = d.dependencies.manifests.filter((m) => !m.lockfilePath).length;
  const cov = d.repoHygiene.gitignore.covers;

  if (highHits > 0)
    out.push({
      id: "secretsHigh",
      severity: "critical",
      textKey: "quality.tip.secretsHigh",
      vars: { count: highHits },
    });
  if (conflicts > 0)
    out.push({
      id: "conflicts",
      severity: "critical",
      textKey: "quality.tip.conflicts",
      vars: { count: conflicts },
    });
  if (risky > 0)
    out.push({
      id: "riskyFiles",
      severity: "high",
      textKey: "quality.tip.riskyFiles",
      vars: { count: risky },
    });
  if (medHits > 0)
    out.push({
      id: "secretsMedium",
      severity: "high",
      textKey: "quality.tip.secretsMedium",
      vars: { count: medHits },
    });
  if (!d.repoHygiene.gitignore.present)
    out.push({
      id: "gitignore",
      severity: "high",
      textKey: "quality.tip.gitignore",
    });
  if (noLock > 0)
    out.push({
      id: "lockfile",
      severity: "medium",
      textKey: "quality.tip.lockfile",
      vars: { count: noLock },
    });
  if (!d.repoHygiene.license.present)
    out.push({
      id: "license",
      severity: "medium",
      textKey: "quality.tip.license",
    });
  if (!d.repoHygiene.readme.present)
    out.push({
      id: "readme",
      severity: "medium",
      textKey: "quality.tip.readme",
    });
  if (!d.repoHygiene.ciConfig.present)
    out.push({
      id: "ciConfig",
      severity: "medium",
      textKey: "quality.tip.ciConfig",
    });
  if (
    d.repoHygiene.gitignore.present &&
    (!cov.envFiles || !cov.nodeModules || !cov.target || !cov.distBuild)
  ) {
    const missing: string[] = [];
    if (!cov.envFiles) missing.push(".env");
    if (!cov.nodeModules) missing.push("node_modules");
    if (!cov.target) missing.push("target/");
    if (!cov.distBuild) missing.push("dist/build");
    if (!cov.ide) missing.push("IDE");
    if (!cov.osFiles) missing.push("OS");
    out.push({
      id: "gitignoreCovers",
      severity: "medium",
      textKey: "quality.tip.gitignoreCovers",
      vars: { items: missing.join(", ") },
    });
  }
  if (!historyScanRun)
    out.push({
      id: "deepScan",
      severity: "medium",
      textKey: "quality.tip.deepScan",
    });
  if (d.codeHygiene.largeFiles.length > 0)
    out.push({
      id: "largeFiles",
      severity: "low",
      textKey: "quality.tip.largeFiles",
      vars: { count: d.codeHygiene.largeFiles.length },
    });
  if (d.codeHygiene.generatedFiles.length > 0)
    out.push({
      id: "generatedFiles",
      severity: "low",
      textKey: "quality.tip.generatedFiles",
      vars: { count: d.codeHygiene.generatedFiles.length },
    });
  if (!d.repoHygiene.contributing.present)
    out.push({
      id: "contributing",
      severity: "low",
      textKey: "quality.tip.contributing",
    });
  if (!d.repoHygiene.securityMd.present)
    out.push({
      id: "securityMd",
      severity: "low",
      textKey: "quality.tip.securityMd",
    });
  if (!d.repoHygiene.editorconfig.present)
    out.push({
      id: "editorconfig",
      severity: "low",
      textKey: "quality.tip.editorconfig",
    });
  if (d.authorship.botSharePct > 30)
    out.push({
      id: "botHigh",
      severity: "low",
      textKey: "quality.tip.botHigh",
      vars: { pct: d.authorship.botSharePct.toFixed(0) },
    });
  if (d.authorship.genericEmailAuthors.length > 0)
    out.push({
      id: "genericEmail",
      severity: "low",
      textKey: "quality.tip.genericEmail",
      vars: { count: d.authorship.genericEmailAuthors.length },
    });

  return out
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 8);
}

function PresenceRow({
  label,
  check,
}: {
  label: string;
  check: PresenceCheck;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-xs">
      {check.present ? (
        <Check size={14} className="shrink-0 text-emerald-500" />
      ) : (
        <X size={14} className="shrink-0 text-rose-500" />
      )}
      <span className="font-medium">{label}</span>
      {check.present && check.path && (
        <code className="truncate font-mono text-muted-foreground">
          {check.path}
        </code>
      )}
      {!check.present && (
        <span className="text-muted-foreground">{t("quality.missing")}</span>
      )}
    </div>
  );
}

function CoverChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
        ok
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {ok ? <Check size={10} /> : <X size={10} />}
      {label}
    </span>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  badge?: { tone: "ok" | "warn" | "info"; text: string };
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({
  icon,
  title,
  hint,
  badge,
  defaultOpen = true,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-6 py-4 text-left hover:bg-accent/40"
      >
        {open ? (
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {badge && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                  badge.tone === "ok" &&
                    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                  badge.tone === "warn" &&
                    "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  badge.tone === "info" &&
                    "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                )}
              >
                {badge.text}
              </span>
            )}
          </div>
          {hint && (
            <div className="truncate text-xs text-muted-foreground">{hint}</div>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t">
          <CardContent className="p-0">{children}</CardContent>
        </div>
      )}
    </Card>
  );
}

export function QualityPage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();
  const queryClient = useQueryClient();

  const scan = useQuery({
    queryKey: ["quality", selectedRepoId],
    queryFn: () => api.runQualityScan(selectedRepoId!),
    enabled: selectedRepoId != null,
    staleTime: 5 * 60_000,
  });

  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [historyReport, setHistoryReport] =
    useState<HistorySecretReport | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const historyScan = useMutation({
    mutationFn: () => api.runHistorySecretScan(selectedRepoId!),
    onMutate: () => {
      setHistoryReport(null);
      setHistoryError(null);
      setProgress({ scanned: 0, total: 0 });
    },
    onSuccess: (data) => {
      setHistoryReport(data);
      setProgress(null);
    },
    onError: (err) => {
      setHistoryError(String(err));
      setProgress(null);
    },
  });

  useEffect(() => {
    const unlisten = listen<ScanProgress>("scan-progress", (e) => {
      setProgress(e.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Reset history scan state when repo changes
  useEffect(() => {
    setHistoryReport(null);
    setHistoryError(null);
    setProgress(null);
  }, [selectedRepoId]);

  const data = scan.data;

  const suggestions = useMemo(
    () => (data ? buildSuggestions(data, !!historyReport) : []),
    [data, historyReport],
  );

  const summary = useMemo(() => {
    if (!data) return null;
    const h = data.repoHygiene;
    const hygieneIssues =
      (h.gitignore.present ? 0 : 1) +
      (h.license.present ? 0 : 1) +
      (h.readme.present ? 0 : 1) +
      (h.ciConfig.present ? 0 : 1);
    return {
      hygieneIssues,
      secretCount: data.secretsHead.hits.length,
      riskyCount: data.secretsHead.riskyFiles.length,
      depCount: data.dependencies.manifests.length,
      conflictCount: data.codeHygiene.conflictMarkers.length,
      generatedCount: data.codeHygiene.generatedFiles.length,
      largeCount: data.codeHygiene.largeFiles.length,
      todoCount: data.codeHygiene.todoCount,
      botPct: data.authorship.botSharePct,
      genericCount: data.authorship.genericEmailAuthors.length,
    };
  }, [data]);

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("quality.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("quality.title")}
        subtitle={
          data
            ? t("quality.filesScanned", { count: data.filesScanned })
            : t("quality.subtitle")
        }
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ["quality", selectedRepoId],
              })
            }
            disabled={scan.isFetching}
          >
            {t("topbar.refresh")}
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-6">
        {scan.isPending && <Skeleton className="h-32 w-full" />}

        {data && summary && (
          <>
            <SuggestionsCard suggestions={suggestions} />
            {/* 1. Repo hygiene */}
            <Section
              icon={
                <ShieldCheck size={16} className="text-emerald-500" />
              }
              title={t("quality.groupHygiene")}
              hint={t("quality.groupHygieneHint")}
              badge={
                summary.hygieneIssues === 0
                  ? { tone: "ok", text: t("quality.summaryOk") }
                  : {
                      tone: "warn",
                      text: `${summary.hygieneIssues}`,
                    }
              }
            >
              <div className="grid gap-3 p-4 md:grid-cols-2">
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {data.repoHygiene.gitignore.present ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <X size={14} className="text-rose-500" />
                    )}
                    {t("quality.gitignore")}
                    {data.repoHygiene.gitignore.present && (
                      <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                        {t("quality.gitignoreLines", {
                          count: data.repoHygiene.gitignore.lineCount,
                        })}
                      </span>
                    )}
                  </div>
                  {data.repoHygiene.gitignore.present && (
                    <>
                      <div className="text-[11px] text-muted-foreground">
                        {t("quality.gitignoreCovers")}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <CoverChip
                          ok={data.repoHygiene.gitignore.covers.envFiles}
                          label={t("quality.gitignoreCoverEnv")}
                        />
                        <CoverChip
                          ok={data.repoHygiene.gitignore.covers.nodeModules}
                          label={t("quality.gitignoreCoverNode")}
                        />
                        <CoverChip
                          ok={data.repoHygiene.gitignore.covers.target}
                          label={t("quality.gitignoreCoverTarget")}
                        />
                        <CoverChip
                          ok={data.repoHygiene.gitignore.covers.distBuild}
                          label={t("quality.gitignoreCoverDist")}
                        />
                        <CoverChip
                          ok={data.repoHygiene.gitignore.covers.ide}
                          label={t("quality.gitignoreCoverIde")}
                        />
                        <CoverChip
                          ok={data.repoHygiene.gitignore.covers.osFiles}
                          label={t("quality.gitignoreCoverOs")}
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="space-y-2 rounded-md border p-3">
                  <PresenceRow
                    label={t("quality.license")}
                    check={data.repoHygiene.license}
                  />
                  <PresenceRow
                    label={t("quality.readme")}
                    check={data.repoHygiene.readme}
                  />
                  <PresenceRow
                    label={t("quality.contributing")}
                    check={data.repoHygiene.contributing}
                  />
                  <PresenceRow
                    label={t("quality.securityMd")}
                    check={data.repoHygiene.securityMd}
                  />
                  <PresenceRow
                    label={t("quality.codeOfConduct")}
                    check={data.repoHygiene.codeOfConduct}
                  />
                  <PresenceRow
                    label={t("quality.editorconfig")}
                    check={data.repoHygiene.editorconfig}
                  />
                  <PresenceRow
                    label={t("quality.ciConfig")}
                    check={data.repoHygiene.ciConfig}
                  />
                </div>
              </div>
            </Section>

            {/* 2. Secret exposure (HEAD) + deep scan launcher */}
            <Section
              icon={<KeyRound size={16} className="text-rose-500" />}
              title={t("quality.groupSecretsHead")}
              hint={t("quality.groupSecretsHeadHint")}
              badge={
                summary.secretCount + summary.riskyCount === 0
                  ? { tone: "ok", text: t("quality.summaryClean") }
                  : {
                      tone: "warn",
                      text: `${summary.secretCount + summary.riskyCount}`,
                    }
              }
            >
              {data.secretsHead.hits.length > 0 && (
                <ul className="divide-y border-b">
                  {data.secretsHead.hits.map((s, i) => (
                    <li key={i} className="flex items-start gap-3 p-3">
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                          SEVERITY_BADGE[s.severity] ?? SEVERITY_BADGE.medium,
                        )}
                      >
                        {t(
                          `quality.severity${
                            s.severity === "high" ? "High" : "Medium"
                          }`,
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm font-medium">
                            {s.patternName}
                          </span>
                          <code className="truncate font-mono text-xs text-muted-foreground">
                            {s.path}
                          </code>
                          <span className="text-[11px] text-muted-foreground">
                            {t("quality.line", { line: s.line })}
                          </span>
                        </div>
                        <code className="mt-1 block break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {s.masked}
                        </code>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {data.secretsHead.riskyFiles.length > 0 && (
                <ul className="divide-y border-b">
                  {data.secretsHead.riskyFiles.map((r, i) => (
                    <li key={i} className="flex items-center gap-3 p-3">
                      <FileWarning
                        size={14}
                        className="shrink-0 text-amber-500"
                      />
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                          SEVERITY_BADGE[r.severity] ?? SEVERITY_BADGE.medium,
                        )}
                      >
                        {t(
                          `quality.severity${
                            r.severity === "high" ? "High" : "Medium"
                          }`,
                        )}
                      </span>
                      <code className="truncate font-mono text-xs">
                        {r.path}
                      </code>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {r.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {t("quality.deepScan")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("quality.deepScanHint")}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => historyScan.mutate()}
                    disabled={historyScan.isPending}
                  >
                    <Play size={12} />
                    {historyScan.isPending
                      ? t("quality.deepScanRunning")
                      : t("quality.deepScanRun")}
                  </Button>
                </div>
                {historyScan.isPending && (
                  <div className="space-y-1">
                    <ProgressBar
                      value={progress?.scanned ?? 0}
                      max={progress?.total || 1}
                      indeterminate={!progress?.total}
                    />
                    <div className="text-[11px] tabular-nums text-muted-foreground">
                      {progress && progress.total > 0
                        ? t("quality.deepScanProgress", {
                            scanned: progress.scanned,
                            total: progress.total,
                          })
                        : t("quality.deepScanRunning")}
                    </div>
                  </div>
                )}
                {historyError && (
                  <div className="flex items-center gap-2 rounded-md bg-rose-500/10 p-2 text-xs text-rose-600 dark:text-rose-400">
                    <AlertTriangle size={12} />
                    {t("quality.deepScanError", { message: historyError })}
                  </div>
                )}
                {historyReport && (
                  <div className="space-y-2">
                    <div className="text-[11px] text-muted-foreground">
                      {t("quality.deepScanDone", {
                        commits: historyReport.commitsScanned,
                        blobs: historyReport.blobsScanned,
                      })}
                    </div>
                    {historyReport.hits.length === 0 ? (
                      <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-600 dark:text-emerald-400">
                        <Check size={12} />
                        {t("quality.deepScanNoHits")}
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-semibold">
                          {t("quality.deepScanHits", {
                            count: historyReport.hits.length,
                          })}
                        </div>
                        <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                          {historyReport.hits.map((h, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-3 p-3 text-xs"
                            >
                              <span
                                className={cn(
                                  "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                                  SEVERITY_BADGE[h.severity] ??
                                    SEVERITY_BADGE.medium,
                                )}
                              >
                                {t(
                                  `quality.severity${
                                    h.severity === "high" ? "High" : "Medium"
                                  }`,
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-2">
                                  <span className="font-medium">
                                    {h.patternName}
                                  </span>
                                  <code className="truncate font-mono text-muted-foreground">
                                    {h.path}
                                  </code>
                                  <span className="text-[11px] text-muted-foreground">
                                    {t("quality.line", { line: h.line })}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                  <code className="font-mono">
                                    {h.commitShortId}
                                  </code>
                                  <span>· {h.authorName}</span>
                                  <span>
                                    ·{" "}
                                    {new Date(
                                      h.commitDate,
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                                <code className="mt-1 block break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                  {h.masked}
                                </code>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Section>

            {/* 3. Dependencies */}
            <Section
              icon={<Package size={16} className="text-sky-500" />}
              title={t("quality.groupDependencies")}
              hint={t("quality.groupDependenciesHint")}
              badge={{
                tone: "info",
                text: `${summary.depCount}`,
              }}
              defaultOpen={summary.depCount > 0}
            >
              {summary.depCount === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">
                  {t("quality.depNone")}
                </div>
              ) : (
                <ul className="divide-y">
                  {data.dependencies.manifests.map((m, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 p-3 text-xs"
                    >
                      <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-600 dark:text-sky-400">
                        {m.kind}
                      </span>
                      <code className="truncate font-mono">
                        {m.manifestPath}
                      </code>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {m.lockfilePath ? (
                          <code className="font-mono">{m.lockfilePath}</code>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">
                            {t("quality.depNoLockfile")}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* 4. Code hygiene */}
            <Section
              icon={<FileCode2 size={16} className="text-violet-500" />}
              title={t("quality.groupCode")}
              hint={t("quality.groupCodeHint")}
              badge={
                summary.conflictCount +
                  summary.generatedCount +
                  summary.largeCount +
                  summary.todoCount ===
                0
                  ? { tone: "ok", text: t("quality.summaryClean") }
                  : {
                      tone: "warn",
                      text: `${
                        summary.conflictCount +
                        summary.generatedCount +
                        summary.largeCount
                      }`,
                    }
              }
            >
              {data.codeHygiene.conflictMarkers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs font-semibold">
                    <GitMerge size={12} className="text-rose-500" />
                    {t("quality.conflictMarkers")}
                    <span className="text-muted-foreground">
                      ({data.codeHygiene.conflictMarkers.length})
                    </span>
                  </div>
                  <ul className="divide-y">
                    {data.codeHygiene.conflictMarkers.map((c, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-3 p-3 text-xs"
                      >
                        <code className="truncate font-mono">{c.path}</code>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {t("quality.line", { line: c.line })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.codeHygiene.generatedFiles.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 border-b border-t bg-muted/30 px-4 py-2 text-xs font-semibold">
                    <FileCode2 size={12} className="text-amber-500" />
                    {t("quality.generatedFiles")}
                    <span className="text-muted-foreground">
                      ({data.codeHygiene.generatedFiles.length})
                    </span>
                  </div>
                  <ul className="divide-y">
                    {data.codeHygiene.generatedFiles.map((g, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-3 p-3 text-xs"
                      >
                        <code className="truncate font-mono">{g.path}</code>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {g.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.codeHygiene.largeFiles.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 border-b border-t bg-muted/30 px-4 py-2 text-xs font-semibold">
                    <FileWarning size={12} className="text-amber-500" />
                    {t("quality.largeFiles")}
                    <span className="text-muted-foreground">
                      ({data.codeHygiene.largeFiles.length})
                    </span>
                  </div>
                  <ul className="divide-y">
                    {data.codeHygiene.largeFiles.map((l, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-3 p-3 text-xs"
                      >
                        <code className="truncate font-mono">{l.path}</code>
                        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatBytes(l.sizeBytes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.codeHygiene.todoCount > 0 && (
                <div>
                  <div className="flex items-center gap-2 border-b border-t bg-muted/30 px-4 py-2 text-xs font-semibold">
                    <ListTodo size={12} className="text-sky-500" />
                    {t("quality.todos")}
                    <span className="text-muted-foreground">
                      ({t("quality.todoCount", {
                        count: data.codeHygiene.todoCount,
                      })})
                    </span>
                  </div>
                  <ul className="max-h-96 divide-y overflow-y-auto">
                    {data.codeHygiene.todos.map((todo, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 p-3 text-xs"
                      >
                        <span className="mt-0.5 shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-600 dark:text-sky-400">
                          {todo.kind}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2 text-[11px] text-muted-foreground">
                            <code className="truncate font-mono">
                              {todo.path}
                            </code>
                            <span>{t("quality.line", { line: todo.line })}</span>
                          </div>
                          <p className="mt-0.5 truncate font-mono">
                            {todo.text}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.conflictCount +
                summary.generatedCount +
                summary.largeCount +
                summary.todoCount ===
                0 && (
                <div className="p-4 text-xs text-muted-foreground">
                  {t("quality.noFindings")}
                </div>
              )}
            </Section>

            {/* 5. Authorship */}
            <Section
              icon={<Users size={16} className="text-indigo-500" />}
              title={t("quality.groupAuthorship")}
              hint={t("quality.groupAuthorshipHint")}
              badge={
                summary.botPct < 30 && summary.genericCount === 0
                  ? { tone: "ok", text: t("quality.summaryOk") }
                  : { tone: "info", text: `${summary.botPct.toFixed(0)}%` }
              }
            >
              <div className="grid gap-3 p-4 md:grid-cols-3">
                <div className="space-y-1 rounded-md border p-3">
                  <div className="text-[11px] uppercase text-muted-foreground">
                    {t("quality.authorshipTotal")}
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {data.authorship.totalCommits}
                  </div>
                </div>
                <div className="space-y-1 rounded-md border p-3">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase text-muted-foreground">
                    <Bot size={11} />
                    {t("quality.authorshipBots")}
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {data.authorship.botCommits}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({data.authorship.botSharePct.toFixed(1)}%)
                    </span>
                  </div>
                </div>
                <div className="space-y-1 rounded-md border p-3">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase text-muted-foreground">
                    <ShieldCheck size={11} />
                    {t("quality.authorshipSigned")}
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {data.authorship.signedCommits}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({data.authorship.signedSharePct.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
              <div className="border-t p-4">
                <div className="text-xs font-semibold">
                  {t("quality.authorshipGeneric")}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("quality.authorshipGenericHint")}
                </div>
                {data.authorship.genericEmailAuthors.length === 0 ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check size={12} />
                    {t("quality.authorshipNoGeneric")}
                  </div>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {data.authorship.genericEmailAuthors.map((e) => (
                      <li
                        key={e}
                        className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] text-amber-600 dark:text-amber-400"
                      >
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>
          </>
        )}
      </div>
    </>
  );
}

function SuggestionsCard({ suggestions }: { suggestions: Suggestion[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <Lightbulb size={14} className="text-amber-500" />
        <div className="flex-1">
          <div className="text-sm font-semibold">
            {t("quality.suggestions")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("quality.suggestionsHint")}
          </div>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {suggestions.length}
        </span>
      </div>
      {suggestions.length === 0 ? (
        <div className="flex items-center gap-2 p-4 text-sm text-emerald-600 dark:text-emerald-400">
          <Check size={14} />
          {t("quality.tipNoAction")}
        </div>
      ) : (
        <ul className="divide-y">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-3 px-5 py-2.5 text-sm"
            >
              <span
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  SEVERITY_DOT[s.severity],
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">{t(s.textKey, s.vars)}</span>
              <span
                className={cn(
                  "shrink-0 text-[10px] uppercase tracking-wide",
                  SEVERITY_TONE[s.severity],
                )}
              >
                {t(`quality.severity.${s.severity}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
