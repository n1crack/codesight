import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileWarning, KeyRound, ListTodo } from "lucide-react";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { cn } from "@/lib/utils";

const SEVERITY_BADGE: Record<string, string> = {
  high: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  low: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

export function QualityPage() {
  const { t } = useTranslation();
  const { selectedRepoId } = useAppState();

  const scan = useQuery({
    queryKey: ["quality", selectedRepoId],
    queryFn: () => api.runQualityScan(selectedRepoId!),
    enabled: selectedRepoId != null,
    staleTime: 5 * 60_000,
  });

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("quality.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const isClean =
    scan.data &&
    scan.data.secrets.length === 0 &&
    scan.data.riskyFiles.length === 0 &&
    scan.data.todoCount === 0;

  return (
    <>
      <PageHeader
        title={t("quality.title")}
        subtitle={
          scan.data
            ? t("quality.filesScanned", { count: scan.data.filesScanned })
            : t("quality.subtitle")
        }
      />
      <div className="flex flex-col gap-4 p-6">
        {scan.isPending && (
          <Skeleton className="h-32 w-full" />
        )}
        {scan.isSuccess && isClean && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-emerald-500">
              {t("quality.noFindings")}
            </CardContent>
          </Card>
        )}

        {scan.data && scan.data.secrets.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound size={14} className="text-rose-500" />
                {t("quality.secrets")}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {scan.data.secrets.length}
                </span>
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                {t("quality.secretsHint")}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {scan.data.secrets.map((s, i) => (
                  <li key={i} className="flex items-start gap-3 p-3">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        SEVERITY_BADGE[s.severity] ??
                          SEVERITY_BADGE.medium,
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
            </CardContent>
          </Card>
        )}

        {scan.data && scan.data.riskyFiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileWarning size={14} className="text-amber-500" />
                {t("quality.riskyFiles")}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {scan.data.riskyFiles.length}
                </span>
              </CardTitle>
              <div className="text-xs text-muted-foreground">
                {t("quality.riskyHint")}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {scan.data.riskyFiles.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 p-3">
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        SEVERITY_BADGE[r.severity] ??
                          SEVERITY_BADGE.medium,
                      )}
                    >
                      {t(
                        `quality.severity${
                          r.severity === "high" ? "High" : "Medium"
                        }`,
                      )}
                    </span>
                    <code className="truncate font-mono text-xs">{r.path}</code>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {r.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {scan.data && scan.data.todoCount > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListTodo size={14} className="text-sky-500" />
                {t("quality.todos")}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("quality.todoCount", { count: scan.data.todoCount })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="max-h-96 divide-y overflow-y-auto">
                {scan.data.todos.map((todo, i) => (
                  <li key={i} className="flex items-start gap-3 p-3">
                    <span className="mt-0.5 shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-600 dark:text-sky-400">
                      {todo.kind}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
                        <code className="truncate font-mono">{todo.path}</code>
                        <span>{t("quality.line", { line: todo.line })}</span>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-xs">
                        {todo.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
