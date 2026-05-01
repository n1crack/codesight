import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, GitBranch, X } from "lucide-react";

import { api } from "@/api";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { openInIde } from "@/lib/openInIde";
import { cn } from "@/lib/utils";
import type { GitConfigView } from "@/types";

function ConfigRow({
  label,
  value,
  fallback,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  fallback: string;
  mono?: boolean;
}) {
  const display = value && value.trim() ? value : null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {display ? (
        <span
          className={cn(
            "max-w-[60%] truncate text-right text-sm",
            mono && "font-mono",
          )}
          title={display}
        >
          {display}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground/50">{fallback}</span>
      )}
    </div>
  );
}

export function RepoConfigPage() {
  const { t } = useTranslation();
  const { selectedRepoId, ide } = useAppState();

  const config = useQuery({
    queryKey: ["gitConfig", selectedRepoId],
    queryFn: () => api.getGitConfig(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("repoConfig.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const data: GitConfigView | undefined = config.data;
  const fallback = t("repoConfig.unset");

  return (
    <>
      <PageHeader
        title={t("repoConfig.title")}
        subtitle={t("repoConfig.subtitle")}
        actions={
          data && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => openInIde(ide, data.repoPath)}
            >
              <ExternalLink size={12} />
              {t("repoConfig.openRepo")}
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("repoConfig.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {config.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : !data ? (
              <p className="text-sm text-muted-foreground">
                {t("common.noData")}
              </p>
            ) : (
              <ul className="divide-y">
                <li>
                  <ConfigRow
                    label={t("repoConfig.headBranch")}
                    value={data.headBranch}
                    fallback={fallback}
                    mono
                  />
                </li>
                <li>
                  <ConfigRow
                    label={t("repoConfig.userName")}
                    value={data.userName}
                    fallback={
                      data.globalUserName
                        ? `${data.globalUserName} (global)`
                        : fallback
                    }
                  />
                </li>
                <li>
                  <ConfigRow
                    label={t("repoConfig.userEmail")}
                    value={data.userEmail}
                    fallback={
                      data.globalUserEmail
                        ? `${data.globalUserEmail} (global)`
                        : fallback
                    }
                    mono
                  />
                </li>
                <li>
                  <ConfigRow
                    label={t("repoConfig.defaultBranch")}
                    value={data.defaultBranch}
                    fallback={fallback}
                    mono
                  />
                </li>
                <li>
                  <ConfigRow
                    label={t("repoConfig.commitGpgSign")}
                    value={data.commitGpgSign}
                    fallback={fallback}
                    mono
                  />
                </li>
                <li>
                  <ConfigRow
                    label={t("repoConfig.coreAutocrlf")}
                    value={data.coreAutocrlf}
                    fallback={fallback}
                    mono
                  />
                </li>
                <li>
                  <ConfigRow
                    label={t("repoConfig.coreFilemode")}
                    value={data.coreFilemode}
                    fallback={fallback}
                    mono
                  />
                </li>
                <li>
                  <ConfigRow
                    label={t("repoConfig.coreIgnorecase")}
                    value={data.coreIgnorecase}
                    fallback={fallback}
                    mono
                  />
                </li>
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("repoConfig.remotes")}</CardTitle>
          </CardHeader>
          <CardContent>
            {config.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : !data || data.remotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("repoConfig.noRemotes")}
              </p>
            ) : (
              <ul className="space-y-3">
                {data.remotes.map((r) => (
                  <li
                    key={r.name}
                    className="space-y-1 rounded-md border p-3 text-sm"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <GitBranch size={12} className="text-primary" />
                      <span>{r.name}</span>
                    </div>
                    {r.url && (
                      <div className="flex gap-2 text-xs">
                        <span className="w-10 shrink-0 text-muted-foreground">
                          {t("repoConfig.fetchUrl")}
                        </span>
                        <code className="break-all font-mono">{r.url}</code>
                      </div>
                    )}
                    {r.pushUrl && r.pushUrl !== r.url && (
                      <div className="flex gap-2 text-xs">
                        <span className="w-10 shrink-0 text-muted-foreground">
                          {t("repoConfig.pushUrl")}
                        </span>
                        <code className="break-all font-mono">
                          {r.pushUrl}
                        </code>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("repoConfig.hooks")}</CardTitle>
          </CardHeader>
          <CardContent>
            {config.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : !data || data.hooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("repoConfig.noHooks")}
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.hooks.map((h) => (
                  <li
                    key={h.path}
                    className="flex items-center gap-2 rounded-md border p-2 text-xs"
                  >
                    {h.executable ? (
                      <Check
                        size={12}
                        className="shrink-0 text-emerald-500"
                      />
                    ) : (
                      <X size={12} className="shrink-0 text-rose-500" />
                    )}
                    <span className="font-mono">{h.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {h.executable
                        ? t("repoConfig.executable")
                        : t("repoConfig.notExecutable")}
                    </span>
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
