import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUp,
  ArrowUpFromLine,
  Check,
  GitBranch,
  Loader2,
  RefreshCcw,
  Search,
} from "lucide-react";

import { api } from "@/api";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { useAppState } from "@/state/AppState";
import { cn } from "@/lib/utils";
import type { BranchInfo, Repository } from "@/types";

type NetOp = "fetch" | "pull" | "push";

function ActionButton({
  label,
  icon: Icon,
  onClick,
  busy,
  done,
  disabled,
  spinSelf = false,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  busy?: boolean;
  done?: boolean;
  disabled?: boolean;
  /**
   * When the icon itself is rotational (e.g. RefreshCcw), spin it in place.
   * Otherwise — for arrows like pull/push — swap to a generic Loader2 so a
   * one-way arrow doesn't appear to be cycling.
   */
  spinSelf?: boolean;
}) {
  let body: React.ReactNode;
  if (done) {
    body = <Check size={13} className="text-emerald-500" />;
  } else if (busy) {
    body = spinSelf ? (
      <Icon size={13} className="animate-spin" />
    ) : (
      <Loader2 size={13} className="animate-spin" />
    );
  } else {
    body = <Icon size={13} />;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground",
        "hover:bg-accent hover:text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {body}
    </button>
  );
}

export function StatusBar() {
  const { t } = useTranslation();
  const { selectedRepoId, gitClient } = useAppState();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: api.listRepositories,
    enabled: selectedRepoId != null,
  });
  const repo: Repository | undefined = repos.data?.find(
    (r) => r.id === selectedRepoId,
  );

  const status = useQuery({
    queryKey: ["repoStatus", selectedRepoId],
    queryFn: () => api.getRepoStatus(selectedRepoId!),
    enabled: selectedRepoId != null,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  const branches = useQuery({
    queryKey: ["branches", selectedRepoId],
    queryFn: () => api.listBranches(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const invalidateRepoData = () => {
    queryClient.invalidateQueries({ queryKey: ["repoStatus", selectedRepoId] });
    queryClient.invalidateQueries({ queryKey: ["branches", selectedRepoId] });
    queryClient.invalidateQueries({ queryKey: ["summary", selectedRepoId] });
    queryClient.invalidateQueries({ queryKey: ["heatmap"] });
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    queryClient.invalidateQueries({ queryKey: ["graph"] });
  };

  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [doneAction, setDoneAction] = useState<NetOp | null>(null);
  const [netError, setNetError] = useState<{ op: NetOp; message: string } | null>(
    null,
  );

  const flashAction = (kind: NetOp) => {
    setDoneAction(kind);
    window.setTimeout(() => setDoneAction(null), 1200);
  };

  const checkout = useMutation({
    mutationFn: (branch: string) => api.checkoutBranch(selectedRepoId!, branch),
    onSuccess: () => {
      invalidateRepoData();
      setBranchPickerOpen(false);
    },
    onError: (err) => alert(String(err)),
  });

  const fetchMutation = useMutation({
    mutationFn: () => api.gitFetch(selectedRepoId!),
    onSuccess: () => {
      invalidateRepoData();
      flashAction("fetch");
    },
    onError: (err) => setNetError({ op: "fetch", message: String(err) }),
  });

  const pullMutation = useMutation({
    mutationFn: () => api.gitPull(selectedRepoId!),
    onSuccess: () => {
      invalidateRepoData();
      flashAction("pull");
    },
    onError: (err) => setNetError({ op: "pull", message: String(err) }),
  });

  const pushMutation = useMutation({
    mutationFn: () => api.gitPush(selectedRepoId!),
    onSuccess: () => {
      invalidateRepoData();
      flashAction("push");
    },
    onError: (err) => setNetError({ op: "push", message: String(err) }),
  });

  const handleNetErrorConfirm = () => {
    const path = repo?.path;
    setNetError(null);
    if (!path) return;
    if (!gitClient || gitClient === "system") {
      navigate("/settings");
      return;
    }
    void api.openInGitClient(gitClient, path).catch((err) => alert(String(err)));
  };

  useEffect(() => {
    if (!branchPickerOpen) setFilter("");
  }, [branchPickerOpen]);

  const filteredBranches: BranchInfo[] = useMemo(() => {
    const data = branches.data ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return data;
    return data.filter((b) => b.name.toLowerCase().includes(needle));
  }, [branches.data, filter]);

  if (selectedRepoId == null) return null;

  const data = status.data;
  const noUpstream = data ? data.upstream == null : false;
  const dirtyParts: string[] = [];
  if (data?.staged) dirtyParts.push(t("statusBar.dirtyStaged", { count: data.staged }));
  if (data?.modified) dirtyParts.push(t("statusBar.dirtyModified", { count: data.modified }));
  if (data?.untracked) dirtyParts.push(t("statusBar.dirtyUntracked", { count: data.untracked }));
  if (data?.conflicted) dirtyParts.push(t("statusBar.dirtyConflicted", { count: data.conflicted }));
  const dirtyTooltip = dirtyParts.join(" · ");

  return (
    <>
      <div className="flex h-8 shrink-0 items-center gap-2 border-t bg-card/60 px-3 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setBranchPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-foreground hover:bg-accent"
          title={t("statusBar.switchBranch")}
        >
          <GitBranch size={12} />
          <span>{data?.currentBranch ?? "—"}</span>
          {data?.headShort && (
            <span className="text-[10px] text-muted-foreground">
              {data.headShort}
            </span>
          )}
        </button>

        {data?.upstream && (
          <span
            className="text-[11px] text-muted-foreground"
            title={data.upstream}
          >
            ↳ {data.upstream}
          </span>
        )}

        {data && (data.ahead > 0 || data.behind > 0) && (
          <span className="flex items-center gap-2 text-[11px]">
            {data.ahead > 0 && (
              <span title={t("statusBar.aheadHint", { count: data.ahead })}>
                ↑{data.ahead}
              </span>
            )}
            {data.behind > 0 && (
              <span title={t("statusBar.behindHint", { count: data.behind })}>
                ↓{data.behind}
              </span>
            )}
          </span>
        )}

        {data?.dirty && (
          <span
            title={dirtyTooltip}
            className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"
          >
            {t("statusBar.dirty")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <ActionButton
            label={t("statusBar.fetch")}
            icon={RefreshCcw}
            onClick={() => fetchMutation.mutate()}
            busy={fetchMutation.isPending}
            done={doneAction === "fetch"}
            spinSelf
          />
          <ActionButton
            label={t("statusBar.pull")}
            icon={ArrowDownToLine}
            onClick={() => pullMutation.mutate()}
            busy={pullMutation.isPending}
            done={doneAction === "pull"}
            disabled={noUpstream}
          />
          <ActionButton
            label={t("statusBar.push")}
            icon={ArrowUpFromLine}
            onClick={() => pushMutation.mutate()}
            busy={pushMutation.isPending}
            done={doneAction === "push"}
            disabled={noUpstream}
          />
        </div>
      </div>

      <ConfirmDialog
        open={netError != null}
        onClose={() => setNetError(null)}
        onConfirm={handleNetErrorConfirm}
        title={netError ? t(`statusBar.netError.title.${netError.op}`) : ""}
        description={
          netError
            ? t(
                !gitClient || gitClient === "system"
                  ? "statusBar.netError.descNoClient"
                  : "statusBar.netError.descOpenClient",
                { message: netError.message },
              )
            : undefined
        }
        confirmLabel={
          !gitClient || gitClient === "system"
            ? t("launcherIssue.openSettings")
            : t("statusBar.netError.openClient")
        }
      />

      <Dialog
        open={branchPickerOpen}
        onClose={() => setBranchPickerOpen(false)}
        title={t("statusBar.switchBranch")}
        size="md"
      >
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("statusBar.filterBranches")}
              className="pl-7"
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {branches.isPending ? (
              <p className="p-3 text-sm text-muted-foreground">
                {t("common.loading")}
              </p>
            ) : filteredBranches.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {t("common.noData")}
              </p>
            ) : (
              <ul className="divide-y">
                {filteredBranches.map((b) => {
                  const isCurrent = b.isHead && b.name === data?.currentBranch;
                  return (
                    <li key={`${b.name}-${b.isRemote}`}>
                      <button
                        type="button"
                        disabled={isCurrent || checkout.isPending}
                        onClick={() => checkout.mutate(b.name)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                          "hover:bg-accent disabled:cursor-not-allowed",
                          isCurrent && "bg-accent/50",
                        )}
                      >
                        <GitBranch
                          size={12}
                          className={cn(
                            "shrink-0",
                            isCurrent ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span className="flex-1 truncate font-mono">{b.name}</span>
                        {b.isRemote && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            remote
                          </span>
                        )}
                        {b.ahead > 0 && (
                          <span
                            className="text-[10px] text-muted-foreground"
                            title={t("statusBar.aheadHint", { count: b.ahead })}
                          >
                            <ArrowUp size={10} className="inline" />
                            {b.ahead}
                          </span>
                        )}
                        {isCurrent && (
                          <Check size={13} className="text-emerald-500" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
