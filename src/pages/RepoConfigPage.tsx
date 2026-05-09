import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Check,
  Eye,
  ExternalLink,
  GitBranch,
  GitFork,
  Pencil,
  Plus,
  Sparkles,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";

import { api } from "@/api";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { openInGitClient } from "@/lib/openInGitClient";
import { openInIde } from "@/lib/openInIde";
import { openInTerminal } from "@/lib/openInTerminal";
import { cn } from "@/lib/utils";
import type { GitConfigView, GitHook, GitRemote, HookTemplate } from "@/types";

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

function EditableUserRow({
  label,
  value,
  globalValue,
  fallback,
  mono = false,
  placeholder,
  onSave,
}: {
  label: string;
  value: string | null | undefined;
  globalValue: string | null | undefined;
  fallback: string;
  mono?: boolean;
  placeholder?: string;
  onSave: (next: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="w-32 shrink-0 text-xs text-muted-foreground">
          {label}
        </span>
        <Input
          autoFocus
          value={draft}
          placeholder={placeholder}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          className={cn("h-7 text-sm", mono && "font-mono")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditing(false);
              setDraft(value ?? "");
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(draft.trim() ? draft.trim() : null);
              setEditing(false);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Check size={12} />
          {t("common.save")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setDraft(value ?? "");
          }}
        >
          <X size={12} />
        </Button>
      </div>
    );
  }

  const display = value && value.trim() ? value : null;
  return (
    <div className="group flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex max-w-[70%] items-center gap-2">
        {display ? (
          <span
            className={cn("truncate text-right text-sm", mono && "font-mono")}
            title={display}
          >
            {display}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground/50">
            {globalValue ? `${globalValue} (global)` : fallback}
          </span>
        )}
        <button
          type="button"
          aria-label={t("common.edit")}
          title={t("common.edit")}
          onClick={() => {
            setDraft(value ?? "");
            setEditing(true);
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100 focus:opacity-100"
        >
          <Pencil size={12} />
        </button>
      </div>
    </div>
  );
}

function RemoteEditor({
  initialName,
  initialUrl,
  initialPushUrl,
  busy,
  onSubmit,
  onCancel,
  allowRename = true,
}: {
  initialName?: string;
  initialUrl?: string;
  initialPushUrl?: string;
  busy: boolean;
  allowRename?: boolean;
  onSubmit: (form: {
    name: string;
    url: string;
    pushUrl: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName ?? "");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [pushUrl, setPushUrl] = useState(initialPushUrl ?? "");

  const canSubmit =
    name.trim().length > 0 && url.trim().length > 0 && !busy;

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
        <span className="self-center text-xs text-muted-foreground">
          {t("repoConfig.remoteName")}
        </span>
        <Input
          value={name}
          disabled={!allowRename || busy}
          placeholder="origin"
          onChange={(e) => setName(e.target.value)}
          className="h-7 text-sm"
        />
        <span className="self-center text-xs text-muted-foreground">
          {t("repoConfig.fetchUrl")}
        </span>
        <Input
          value={url}
          disabled={busy}
          placeholder="git@github.com:user/repo.git"
          onChange={(e) => setUrl(e.target.value)}
          className="h-7 font-mono text-xs"
        />
        <span className="self-center text-xs text-muted-foreground">
          {t("repoConfig.pushUrl")}
        </span>
        <Input
          value={pushUrl}
          disabled={busy}
          placeholder={t("repoConfig.pushUrlOptional")}
          onChange={(e) => setPushUrl(e.target.value)}
          className="h-7 font-mono text-xs"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          <X size={12} />
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({
              name: name.trim(),
              url: url.trim(),
              pushUrl: pushUrl.trim(),
            })
          }
        >
          <Check size={12} />
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

export function RepoConfigPage() {
  const { t } = useTranslation();
  const { selectedRepoId, ide, terminal, gitClient } = useAppState();
  const queryClient = useQueryClient();

  const config = useQuery({
    queryKey: ["gitConfig", selectedRepoId],
    queryFn: () => api.getGitConfig(selectedRepoId!),
    enabled: selectedRepoId != null,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["gitConfig", selectedRepoId] });

  const setUserMutation = useMutation({
    mutationFn: (vars: { name?: string | null; email?: string | null }) =>
      api.setGitUser(
        selectedRepoId!,
        vars.name ?? config.data?.userName ?? null,
        vars.email ?? config.data?.userEmail ?? null,
      ),
    onSuccess: invalidate,
  });

  const addRemoteMutation = useMutation({
    mutationFn: (vars: { name: string; url: string }) =>
      api.addRemote(selectedRepoId!, vars.name, vars.url),
    onSuccess: invalidate,
  });

  const setRemoteMutation = useMutation({
    mutationFn: (vars: { name: string; url: string; pushUrl: string | null }) =>
      api.setRemoteUrl(selectedRepoId!, vars.name, vars.url, vars.pushUrl),
    onSuccess: invalidate,
  });

  const removeRemoteMutation = useMutation({
    mutationFn: (name: string) => api.removeRemote(selectedRepoId!, name),
    onSuccess: invalidate,
  });

  const [addingRemote, setAddingRemote] = useState(false);
  const [editingRemote, setEditingRemote] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [previewHook, setPreviewHook] = useState<{
    title: string;
    name: string;
    body: string;
  } | null>(null);

  const hookTemplates = useQuery({
    queryKey: ["hookTemplates"],
    queryFn: api.listHookTemplates,
  });

  const installHookMutation = useMutation({
    mutationFn: (templateId: string) =>
      api.installHook(selectedRepoId!, templateId),
    onSuccess: invalidate,
  });

  const uninstallHookMutation = useMutation({
    mutationFn: (hookName: string) =>
      api.uninstallHook(selectedRepoId!, hookName),
    onSuccess: invalidate,
  });

  const previewExisting = async (hook: GitHook) => {
    try {
      const body = await api.readHook(selectedRepoId!, hook.name);
      setPreviewHook({ title: hook.name, name: hook.name, body });
    } catch (err) {
      alert(String(err));
    }
  };

  const previewTemplate = (template: HookTemplate) => {
    setPreviewHook({
      title: `${template.title} (${template.hookName})`,
      name: template.hookName,
      body: template.body,
    });
  };

  const installSelected = async () => {
    if (!selectedTemplate) return;
    try {
      await installHookMutation.mutateAsync(selectedTemplate);
      setSelectedTemplate("");
    } catch (err) {
      alert(String(err));
    }
  };

  const handleUninstallHook = async (hook: GitHook) => {
    const confirmed = window.confirm(
      t("repoConfig.uninstallHookConfirm", { name: hook.name }),
    );
    if (!confirmed) return;
    try {
      await uninstallHookMutation.mutateAsync(hook.name);
    } catch (err) {
      alert(String(err));
    }
  };

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

  const handleRemove = async (remote: GitRemote) => {
    const confirmed = window.confirm(
      t("repoConfig.removeRemoteConfirm", { name: remote.name }),
    );
    if (!confirmed) return;
    try {
      await removeRemoteMutation.mutateAsync(remote.name);
    } catch (err) {
      alert(String(err));
    }
  };

  return (
    <>
      <PageHeader
        title={t("repoConfig.title")}
        subtitle={t("repoConfig.subtitle")}
        actions={
          data && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openInGitClient(gitClient, data.repoPath)}
              >
                <GitFork size={12} />
                {t("openInGitClient")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openInTerminal(terminal, data.repoPath)}
              >
                <TerminalSquare size={12} />
                {t("openInTerminal")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openInIde(ide, data.repoPath)}
              >
                <ExternalLink size={12} />
                {t("repoConfig.openRepo")}
              </Button>
            </div>
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
                  <EditableUserRow
                    label={t("repoConfig.userName")}
                    value={data.userName}
                    globalValue={data.globalUserName}
                    fallback={fallback}
                    placeholder={t("repoConfig.userNamePlaceholder")}
                    onSave={async (next) => {
                      try {
                        await setUserMutation.mutateAsync({ name: next });
                      } catch (err) {
                        alert(String(err));
                        throw err;
                      }
                    }}
                  />
                </li>
                <li>
                  <EditableUserRow
                    label={t("repoConfig.userEmail")}
                    value={data.userEmail}
                    globalValue={data.globalUserEmail}
                    fallback={fallback}
                    mono
                    placeholder="you@example.com"
                    onSave={async (next) => {
                      try {
                        await setUserMutation.mutateAsync({ email: next });
                      } catch (err) {
                        alert(String(err));
                        throw err;
                      }
                    }}
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
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>{t("repoConfig.remotes")}</CardTitle>
            {!addingRemote && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddingRemote(true);
                  setEditingRemote(null);
                }}
              >
                <Plus size={12} />
                {t("repoConfig.addRemote")}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {config.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : !data ? (
              <p className="text-sm text-muted-foreground">
                {t("common.noData")}
              </p>
            ) : (
              <div className="space-y-3">
                {addingRemote && (
                  <RemoteEditor
                    busy={addRemoteMutation.isPending}
                    onCancel={() => setAddingRemote(false)}
                    onSubmit={async (form) => {
                      try {
                        await addRemoteMutation.mutateAsync({
                          name: form.name,
                          url: form.url,
                        });
                        if (form.pushUrl) {
                          await setRemoteMutation.mutateAsync({
                            name: form.name,
                            url: form.url,
                            pushUrl: form.pushUrl,
                          });
                        }
                        setAddingRemote(false);
                      } catch (err) {
                        alert(String(err));
                      }
                    }}
                  />
                )}
                {data.remotes.length === 0 && !addingRemote ? (
                  <p className="text-sm text-muted-foreground">
                    {t("repoConfig.noRemotes")}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {data.remotes.map((r) =>
                      editingRemote === r.name ? (
                        <li key={r.name}>
                          <RemoteEditor
                            initialName={r.name}
                            initialUrl={r.url ?? ""}
                            initialPushUrl={r.pushUrl ?? ""}
                            allowRename={false}
                            busy={setRemoteMutation.isPending}
                            onCancel={() => setEditingRemote(null)}
                            onSubmit={async (form) => {
                              try {
                                await setRemoteMutation.mutateAsync({
                                  name: r.name,
                                  url: form.url,
                                  pushUrl: form.pushUrl || null,
                                });
                                setEditingRemote(null);
                              } catch (err) {
                                alert(String(err));
                              }
                            }}
                          />
                        </li>
                      ) : (
                        <li
                          key={r.name}
                          className="space-y-1 rounded-md border p-3 text-sm"
                        >
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <GitBranch size={12} className="text-primary" />
                            <span>{r.name}</span>
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={t("common.edit")}
                                title={t("common.edit")}
                                onClick={() => {
                                  setEditingRemote(r.name);
                                  setAddingRemote(false);
                                }}
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                type="button"
                                aria-label={t("common.delete")}
                                title={t("common.delete")}
                                onClick={() => void handleRemove(r)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          {r.url && (
                            <div className="flex gap-2 text-xs">
                              <span className="w-10 shrink-0 text-muted-foreground">
                                {t("repoConfig.fetchUrl")}
                              </span>
                              <code className="break-all font-mono">
                                {r.url}
                              </code>
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
                      ),
                    )}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("repoConfig.hooks")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-dashed p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Sparkles size={12} />
                {t("repoConfig.hookTemplates")}
              </div>
              {hookTemplates.isPending ? (
                <Skeleton className="h-10 w-full" />
              ) : !hookTemplates.data || hookTemplates.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("common.noData")}
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[220px] flex-1">
                      <Select<string>
                        value={selectedTemplate}
                        onChange={(v) => setSelectedTemplate(v)}
                        options={[
                          {
                            value: "",
                            label: t("repoConfig.pickTemplate"),
                          },
                          ...hookTemplates.data.map((tmpl) => ({
                            value: tmpl.id,
                            label: `${tmpl.title} → ${tmpl.hookName}`,
                          })),
                        ]}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!selectedTemplate}
                      onClick={() => {
                        const tmpl = hookTemplates.data?.find(
                          (x) => x.id === selectedTemplate,
                        );
                        if (tmpl) previewTemplate(tmpl);
                      }}
                    >
                      <Eye size={12} />
                      {t("repoConfig.previewHook")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        !selectedTemplate || installHookMutation.isPending
                      }
                      onClick={() => void installSelected()}
                    >
                      <Plus size={12} />
                      {t("repoConfig.installHook")}
                    </Button>
                  </div>
                  {selectedTemplate && (
                    <p className="text-xs text-muted-foreground">
                      {hookTemplates.data.find(
                        (x) => x.id === selectedTemplate,
                      )?.description}
                    </p>
                  )}
                </div>
              )}
            </div>

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
                    {h.managed && (
                      <span
                        title={t("repoConfig.managedHookHint")}
                        className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                      >
                        {t("repoConfig.managedHook")}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={t("repoConfig.previewHook")}
                        title={t("repoConfig.previewHook")}
                        onClick={() => void previewExisting(h)}
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                      >
                        <Eye size={11} />
                      </button>
                      {h.managed && (
                        <button
                          type="button"
                          aria-label={t("common.delete")}
                          title={t("common.delete")}
                          onClick={() => void handleUninstallHook(h)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={previewHook != null}
        onClose={() => setPreviewHook(null)}
        title={previewHook?.title ?? ""}
        size="lg"
      >
        {previewHook && (
          <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
            <code className="font-mono">{previewHook.body}</code>
          </pre>
        )}
      </Dialog>
    </>
  );
}
