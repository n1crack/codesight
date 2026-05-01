import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";

import { api } from "@/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TAG_COLORS, classesFor } from "@/lib/tagColors";
import { cn } from "@/lib/utils";
import type { TagColor, TagWithStats } from "@/types";

interface TagManagerProps {
  open: boolean;
  onClose: () => void;
}

export function TagManager({ open, onClose }: TagManagerProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const tags = useQuery({
    queryKey: ["repoTags"],
    queryFn: api.listRepoTags,
    enabled: open,
  });

  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: api.listRepositories,
    enabled: open,
  });

  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor>("slate");
  const [renaming, setRenaming] = useState<{ id: number; value: string } | null>(
    null,
  );
  const [pendingRepoIds, setPendingRepoIds] = useState<Set<number> | null>(
    null,
  );

  const selectedTag = useMemo(
    () => tags.data?.find((t) => t.id === selectedTagId) ?? null,
    [tags.data, selectedTagId],
  );

  // Compute initial assignment when a tag is selected
  useEffect(() => {
    if (!selectedTag || !repos.data) {
      setPendingRepoIds(null);
      return;
    }
    const assigned = new Set(
      repos.data
        .filter((r) => r.tags.some((t) => t.id === selectedTag.id))
        .map((r) => r.id),
    );
    setPendingRepoIds(assigned);
  }, [selectedTag, repos.data]);

  const create = useMutation({
    mutationFn: () => api.createTag(newName.trim(), newColor),
    onSuccess: (tag) => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["repoTags"] });
      qc.invalidateQueries({ queryKey: ["repositories"] });
      setSelectedTagId(tag.id);
    },
  });
  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: { name?: string; color?: TagColor };
    }) => api.updateTag(id, patch),
    onSuccess: () => {
      setRenaming(null);
      qc.invalidateQueries({ queryKey: ["repoTags"] });
      qc.invalidateQueries({ queryKey: ["repositories"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteTag(id),
    onSuccess: () => {
      setSelectedTagId(null);
      qc.invalidateQueries({ queryKey: ["repoTags"] });
      qc.invalidateQueries({ queryKey: ["repositories"] });
    },
  });
  const setRepos = useMutation({
    mutationFn: ({ tagId, repoIds }: { tagId: number; repoIds: number[] }) =>
      api.setTagRepos(tagId, repoIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repoTags"] });
      qc.invalidateQueries({ queryKey: ["repositories"] });
    },
  });

  if (!open) return null;

  const onCreate = () => {
    if (!newName.trim()) return;
    create.mutate();
  };

  const onSaveAssignments = () => {
    if (!selectedTag || !pendingRepoIds) return;
    setRepos.mutate({
      tagId: selectedTag.id,
      repoIds: Array.from(pendingRepoIds),
    });
  };

  const toggleRepo = (id: number) => {
    setPendingRepoIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-[80vh] w-full max-w-4xl overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: tag list + create */}
        <div className="flex w-72 shrink-0 flex-col border-r bg-muted/20">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">{t("tagManager.title")}</h2>
              <p className="text-[11px] text-muted-foreground">
                {t("tagManager.subtitle")}
              </p>
            </div>
          </div>

          <div className="border-b p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("tagManager.newTag")}
            </div>
            <div className="mt-2 flex gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCreate()}
                placeholder={t("tagManager.namePlaceholder")}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                onClick={onCreate}
                disabled={create.isPending || !newName.trim()}
              >
                <Plus size={12} />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {TAG_COLORS.map((c) => {
                const cls = classesFor(c);
                const active = newColor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    aria-label={c}
                    className={cn(
                      "h-5 w-5 rounded-full ring-2 ring-transparent transition-all",
                      cls.dot,
                      active && cls.ring,
                    )}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {tags.isPending ? null : !tags.data?.length ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {t("tagManager.noTags")}
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5 p-1">
                {tags.data.map((tag) => (
                  <TagListItem
                    key={tag.id}
                    tag={tag}
                    selected={selectedTagId === tag.id}
                    onSelect={() => setSelectedTagId(tag.id)}
                    renaming={renaming?.id === tag.id ? renaming.value : null}
                    onStartRename={() =>
                      setRenaming({ id: tag.id, value: tag.name })
                    }
                    onChangeRename={(v) =>
                      setRenaming({ id: tag.id, value: v })
                    }
                    onCommitRename={() => {
                      if (renaming && renaming.value.trim()) {
                        update.mutate({
                          id: tag.id,
                          patch: { name: renaming.value.trim() },
                        });
                      } else {
                        setRenaming(null);
                      }
                    }}
                    onCancelRename={() => setRenaming(null)}
                    onChangeColor={(c) =>
                      update.mutate({ id: tag.id, patch: { color: c } })
                    }
                    onDelete={() => {
                      if (
                        window.confirm(
                          t("tagManager.confirmDelete", { name: tag.name }),
                        )
                      ) {
                        remove.mutate(tag.id);
                      }
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: assignment panel */}
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              {selectedTag && (
                <>
                  <span
                    className={cn(
                      "h-3 w-3 rounded-full",
                      classesFor(selectedTag.color).dot,
                    )}
                  />
                  <h3 className="text-sm font-semibold">{selectedTag.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {t("tagManager.repoCount", { count: selectedTag.repoCount })}
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            >
              <X size={14} />
            </button>
          </div>

          {!selectedTag ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t("tagManager.subtitle")}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs">
                <div className="font-medium">
                  {t("tagManager.assignedRepos")}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPendingRepoIds(
                        new Set((repos.data ?? []).map((r) => r.id)),
                      )
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t("tagManager.selectAll")}
                  </button>
                  <span className="text-muted-foreground/50">·</span>
                  <button
                    type="button"
                    onClick={() => setPendingRepoIds(new Set())}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t("tagManager.selectNone")}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <ul className="flex flex-col gap-0.5">
                  {(repos.data ?? []).map((r) => {
                    const checked = pendingRepoIds?.has(r.id) ?? false;
                    return (
                      <li key={r.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRepo(r.id)}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {r.name}
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {r.path}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-4 py-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  {t("tagManager.close")}
                </Button>
                <Button
                  size="sm"
                  onClick={onSaveAssignments}
                  disabled={setRepos.isPending}
                >
                  {t("tagManager.save")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TagListItem({
  tag,
  selected,
  onSelect,
  renaming,
  onStartRename,
  onChangeRename,
  onCommitRename,
  onCancelRename,
  onChangeColor,
  onDelete,
}: {
  tag: TagWithStats;
  selected: boolean;
  onSelect: () => void;
  renaming: string | null;
  onStartRename: () => void;
  onChangeRename: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onChangeColor: (c: TagColor) => void;
  onDelete: () => void;
}) {
  const cls = classesFor(tag.color);
  const [colorOpen, setColorOpen] = useState(false);
  return (
    <li
      className={cn(
        "group rounded-md transition-colors",
        selected ? "bg-accent" : "hover:bg-accent/40",
      )}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setColorOpen((o) => !o)}
          className={cn(
            "h-3 w-3 shrink-0 rounded-full ring-2 ring-transparent",
            cls.dot,
            colorOpen && cls.ring,
          )}
          aria-label="color"
        />
        {renaming != null ? (
          <input
            value={renaming}
            onChange={(e) => onChangeRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitRename();
              else if (e.key === "Escape") onCancelRename();
            }}
            onBlur={onCommitRename}
            autoFocus
            className="h-6 min-w-0 flex-1 rounded border border-input bg-transparent px-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={onSelect}
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm"
          >
            <span className="truncate">{tag.name}</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {tag.repoCount}
            </span>
          </button>
        )}
        <div className="hidden items-center gap-0.5 group-hover:flex">
          <button
            type="button"
            aria-label="rename"
            onClick={onStartRename}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil size={10} />
          </button>
          <button
            type="button"
            aria-label="delete"
            onClick={onDelete}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
      {colorOpen && (
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {TAG_COLORS.map((c) => {
            const cc = classesFor(c);
            const active = tag.color === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChangeColor(c);
                  setColorOpen(false);
                }}
                aria-label={c}
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-transparent",
                  cc.dot,
                  active && cc.ring,
                )}
              >
                {active && <Check size={10} className="text-white" />}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

export function ManageTagsButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t("sidebar.manageTags")}
      title={t("sidebar.manageTags")}
      onClick={onOpen}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
    >
      <TagIcon size={13} />
    </button>
  );
}
