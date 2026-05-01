import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Brain,
  ChevronRight,
  FolderGit2,
  FolderSearch,
  GitBranch,
  GitCompare,
  GitGraph,
  Home,
  Inbox,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { api, pickRepositoryDir, pickScanRoot } from "@/api";
import { ManageTagsButton, TagManager } from "@/components/TagManager";
import { Sparkline } from "@/components/Sparkline";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useAppState } from "@/state/AppState";
import { TAG_COLORS, classesFor } from "@/lib/tagColors";
import { cn } from "@/lib/utils";
import type {
  DiscoveredRepo,
  Repository,
  Tag,
  TagColor,
  TagWithStats,
} from "@/types";

const GLOBAL_NAV = [
  { to: "/", icon: Home, key: "nav.home" },
  { to: "/search", icon: Search, key: "nav.search" },
  { to: "/compare", icon: GitCompare, key: "nav.compare" },
  { to: "/settings", icon: Settings, key: "nav.settings" },
] as const;

const REPO_NAV = [
  { to: "/activity", icon: Activity, key: "nav.activity" },
  { to: "/insights", icon: Brain, key: "nav.insights" },
  { to: "/graph", icon: GitGraph, key: "nav.graph" },
] as const;

const FILTER_THRESHOLD = 6;
const TOP_PANE_KEY = "codesight.sidebarTopPane";
const TOP_PANE_MIN = 60;
const TOP_PANE_MAX = 700;
const COLLAPSED_GROUPS_KEY = "codesight.collapsedGroups";
const UNTAGGED_KEY = "untagged";

interface RepoGroup {
  key: string; // "tag-3" or "untagged"
  tag: Tag | null;
  label: string;
  repos: Repository[];
}

function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as string[];
      return new Set(arr);
    } catch {
      return new Set();
    }
  });
  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(
          COLLAPSED_GROUPS_KEY,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };
  return { collapsed, toggle };
}

function buildGroups(
  repos: Repository[],
  allTags: TagWithStats[],
  untaggedLabel: string,
): RepoGroup[] {
  const groupMap = new Map<string, RepoGroup>();
  for (const tg of allTags) {
    const tag: Tag = {
      id: tg.id,
      name: tg.name,
      color: tg.color,
      sort_order: tg.sortOrder,
    };
    groupMap.set(`tag-${tg.id}`, {
      key: `tag-${tg.id}`,
      tag,
      label: tg.name,
      repos: [],
    });
  }

  const untagged: Repository[] = [];
  for (const r of repos) {
    if (r.tags.length === 0) {
      untagged.push(r);
    } else {
      for (const tag of r.tags) {
        const key = `tag-${tag.id}`;
        const existing = groupMap.get(key);
        if (existing) {
          existing.repos.push(r);
        } else {
          groupMap.set(key, {
            key,
            tag,
            label: tag.name,
            repos: [r],
          });
        }
      }
    }
  }

  const groups = Array.from(groupMap.values()).sort(
    (a, b) =>
      (a.tag?.sort_order ?? 0) - (b.tag?.sort_order ?? 0) ||
      (a.tag?.name ?? "").localeCompare(b.tag?.name ?? ""),
  );

  if (untagged.length > 0 || allTags.length === 0) {
    groups.push({
      key: UNTAGGED_KEY,
      tag: null,
      label: untaggedLabel,
      repos: untagged,
    });
  }
  return groups;
}

export function Sidebar() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedRepoId, setSelectedRepoId } = useAppState();
  const [filter, setFilter] = useState("");
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Repository | null>(null);
  const [scanState, setScanState] = useState<{
    folder: string;
    items: DiscoveredRepo[];
  } | null>(null);
  const [noRepoDrop, setNoRepoDrop] = useState<string[] | null>(null);
  const topPaneRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [topPaneH, setTopPaneH] = useState<number | null>(() => {
    const raw = Number(localStorage.getItem(TOP_PANE_KEY) || "");
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  });
  const { collapsed, toggle } = useCollapsedGroups();

  useEffect(() => {
    if (topPaneH == null) {
      localStorage.removeItem(TOP_PANE_KEY);
    } else {
      localStorage.setItem(TOP_PANE_KEY, String(topPaneH));
    }
  }, [topPaneH]);

  // OS-level drag-drop: drop a folder onto the window to add/scan it.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const webview = getCurrentWebview();
        const fn = await webview.onDragDropEvent(async (event) => {
          if (event.payload.type !== "drop") return;
          const paths = event.payload.paths ?? [];
          if (paths.length === 0) return;
          const found: DiscoveredRepo[] = [];
          for (const p of paths) {
            try {
              const items = await api.discoverRepos(p);
              for (const it of items) found.push(it);
            } catch {
              // ignore per-path errors
            }
          }
          const seen = new Set<string>();
          const unique = found.filter((d) => {
            if (seen.has(d.path)) return false;
            seen.add(d.path);
            return true;
          });
          if (unique.length === 0) {
            setNoRepoDrop(paths);
          } else {
            setScanState({
              folder: paths.length === 1 ? paths[0] : `${paths.length} folders`,
              items: unique,
            });
          }
        });
        if (cancelled) fn();
        else unlisten = fn;
      } catch (err) {
        console.warn("drag-drop listener failed", err);
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startY = e.clientY;
    const startH =
      topPaneH ?? topPaneRef.current?.offsetHeight ?? TOP_PANE_MIN;
    setTopPaneH(startH);
    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      const next = Math.max(TOP_PANE_MIN, Math.min(TOP_PANE_MAX, startH + dy));
      setTopPaneH(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setIsResizing(false);
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const resetTopPane = () => setTopPaneH(null);

  const onRepoClick = (id: number) => {
    setSelectedRepoId(id);
    const inSection = REPO_NAV.some((n) => location.pathname.startsWith(n.to));
    const onCommit = location.pathname.startsWith("/commits/");
    if (!inSection && !onCommit) {
      navigate("/activity");
    }
  };

  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: api.listRepositories,
  });

  const tagsQuery = useQuery({
    queryKey: ["repoTags"],
    queryFn: api.listRepoTags,
  });

  const sparklines = useQuery({
    queryKey: ["sparklines", repos.data?.length ?? 0],
    queryFn: () => api.getReposSparklines(30),
    enabled: !!repos.data?.length,
  });
  const sparkByRepo = useMemo(() => {
    const map = new Map<number, number[]>();
    sparklines.data?.forEach((s) => map.set(s.repoId, s.days));
    return map;
  }, [sparklines.data]);

  const addOne = useMutation({
    mutationFn: async () => {
      const path = await pickRepositoryDir();
      if (!path) return null;
      return api.addRepository(path);
    },
    onSuccess: (repo) => {
      qc.invalidateQueries({ queryKey: ["repositories"] });
      qc.invalidateQueries({ queryKey: ["sparklines"] });
      if (repo) setSelectedRepoId(repo.id);
    },
    onError: (err) => {
      console.error(err);
      alert(t("errors.addFailed", { message: String(err) }));
    },
  });

  const discover = useMutation({
    mutationFn: async () => {
      const folder = await pickScanRoot();
      if (!folder) return null;
      const items = await api.discoverRepos(folder);
      return { folder, items };
    },
    onSuccess: (result) => {
      if (!result) return;
      if (result.items.length === 0) {
        alert(t("errors.noReposFound"));
        return;
      }
      setScanState(result);
    },
    onError: (err) => {
      console.error(err);
      alert(t("errors.scanFailed", { message: String(err) }));
    },
  });

  const commitScan = useMutation({
    mutationFn: ({
      paths,
      tagId,
    }: {
      paths: string[];
      tagId: number | null;
    }) => api.addDiscoveredRepos(paths, tagId),
    onSuccess: (added) => {
      qc.invalidateQueries({ queryKey: ["repositories"] });
      qc.invalidateQueries({ queryKey: ["sparklines"] });
      qc.invalidateQueries({ queryKey: ["repoTags"] });
      setScanState(null);
      if (added.length > 0 && !selectedRepoId) {
        setSelectedRepoId(added[0].id);
      }
    },
    onError: (err) => {
      console.error(err);
      alert(t("errors.scanFailed", { message: String(err) }));
    },
  });

  const createTagInline = useMutation({
    mutationFn: ({ name, color }: { name: string; color: TagColor }) =>
      api.createTag(name, color),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repoTags"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.removeRepository(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["repositories"] });
      qc.invalidateQueries({ queryKey: ["sparklines"] });
      if (selectedRepoId === id) setSelectedRepoId(null);
      setRemoveTarget(null);
    },
    onError: (err) => {
      console.error(err);
      setRemoveTarget(null);
    },
  });

  const persistMove = useMutation({
    mutationFn: async (vars: {
      repoId: number;
      addTagId: number | null;
      removeTagId: number | null;
      orderedIds: number[] | null;
    }) => {
      if (vars.addTagId != null && vars.addTagId !== vars.removeTagId) {
        await api.assignTag(vars.repoId, vars.addTagId);
      }
      if (vars.removeTagId != null && vars.removeTagId !== vars.addTagId) {
        await api.unassignTag(vars.repoId, vars.removeTagId);
      }
      if (vars.orderedIds && vars.orderedIds.length > 0) {
        await api.reorderRepositories(vars.orderedIds);
      }
    },
    // Apply the move to the query cache synchronously so the UI does not
    // snap back to the pre-drop state before the server round-trip lands.
    // IMPORTANT: stay fully synchronous — an `await` here introduces a
    // microtask boundary that breaks React 18's automatic batching with the
    // drag-end state updates, causing a visible "snap back then forward"
    // bounce after drop.
    onMutate: (vars) => {
      qc.cancelQueries({ queryKey: ["repositories"] });
      const previousRepos = qc.getQueryData<Repository[]>(["repositories"]);
      const tagsCache = qc.getQueryData<TagWithStats[]>(["repoTags"]);
      if (!previousRepos) return { previousRepos };

      let next = previousRepos.slice();
      const idx = next.findIndex((r) => r.id === vars.repoId);
      if (idx >= 0) {
        const repo = next[idx];
        let newTags = repo.tags;
        if (vars.removeTagId != null) {
          newTags = newTags.filter((t) => t.id !== vars.removeTagId);
        }
        if (
          vars.addTagId != null &&
          !newTags.some((t) => t.id === vars.addTagId)
        ) {
          const tagInfo = tagsCache?.find((t) => t.id === vars.addTagId);
          if (tagInfo) {
            newTags = [
              ...newTags,
              {
                id: tagInfo.id,
                name: tagInfo.name,
                color: tagInfo.color,
                sort_order: tagInfo.sortOrder,
              },
            ];
          }
        }
        if (newTags !== repo.tags) {
          next[idx] = { ...repo, tags: newTags };
        }
      }

      if (vars.orderedIds && vars.orderedIds.length > 0) {
        const byId = new Map(next.map((r) => [r.id, r]));
        const reordered: Repository[] = [];
        for (const id of vars.orderedIds) {
          const r = byId.get(id);
          if (r) reordered.push(r);
        }
        // Append any items not in orderedIds (shouldn't normally happen).
        for (const r of next) {
          if (!vars.orderedIds.includes(r.id)) reordered.push(r);
        }
        next = reordered;
      }

      qc.setQueryData<Repository[]>(["repositories"], next);
      return { previousRepos };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousRepos) {
        qc.setQueryData(["repositories"], ctx.previousRepos);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["repositories"] });
      qc.invalidateQueries({ queryKey: ["repoTags"] });
    },
  });

  const all = repos.data ?? [];
  const showFilter = all.length >= FILTER_THRESHOLD;
  const q = filter.trim().toLowerCase();
  const filtered = !q
    ? all
    : q.startsWith("#")
      ? all.filter((r) =>
          r.tags.some((tag) => tag.name.toLowerCase().includes(q.slice(1))),
        )
      : all.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.path.toLowerCase().includes(q) ||
            r.tags.some((tag) => tag.name.toLowerCase().includes(q)),
        );

  const groups = useMemo(
    () => buildGroups(filtered, tagsQuery.data ?? [], t("sidebar.untagged")),
    [filtered, tagsQuery.data, t],
  );

  // Optimistic local view of group → repo IDs. Overrides server while a drag
  // is in progress. Synced from `groups` at render time when not dragging.
  const [optimisticItems, setOptimisticItems] = useState<Record<
    string,
    number[]
  > | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);

  const itemsByGroup = useMemo(() => {
    if (optimisticItems) return optimisticItems;
    const out: Record<string, number[]> = {};
    for (const g of groups) out[g.key] = g.repos.map((r) => r.id);
    return out;
  }, [groups, optimisticItems]);

  const repoById = useMemo(() => {
    const map = new Map<number, Repository>();
    for (const r of all) map.set(r.id, r);
    return map;
  }, [all]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const findContainer = (id: UniqueIdentifier): string | null => {
    const sid = String(id);
    if (itemsByGroup[sid]) return sid; // dropped on a group container
    for (const [key, ids] of Object.entries(itemsByGroup)) {
      if (ids.includes(Number(id))) return key;
    }
    return null;
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(Number(e.active.id));
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const fromKey = findContainer(active.id);
    const toKey = findContainer(over.id);
    if (!fromKey || !toKey || fromKey === toKey) return;

    setOptimisticItems((prev) => {
      const base = prev ?? itemsByGroup;
      const fromList = (base[fromKey] ?? []).slice();
      const toList = (base[toKey] ?? []).slice();
      const movingId = Number(active.id);
      const fromIdx = fromList.indexOf(movingId);
      if (fromIdx < 0) return prev;
      fromList.splice(fromIdx, 1);

      let insertIdx = toList.length;
      if (String(over.id) !== toKey) {
        const overIdx = toList.indexOf(Number(over.id));
        if (overIdx >= 0) insertIdx = overIdx;
      }
      toList.splice(insertIdx, 0, movingId);

      return {
        ...base,
        [fromKey]: fromList,
        [toKey]: toList,
      };
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    const snapshot = optimisticItems;
    setOptimisticItems(null);

    if (!over) return;

    const movingId = Number(active.id);
    const repo = repoById.get(movingId);
    if (!repo) return;

    // The current state during drag includes any cross-group moves done in
    // dragOver. We figure out final container + position from the snapshot
    // (or live data if no drag-over fired).
    const stateAtDrop = snapshot ?? itemsByGroup;
    let toKey: string | null = null;
    for (const [key, ids] of Object.entries(stateAtDrop)) {
      if (ids.includes(movingId)) {
        toKey = key;
        break;
      }
    }
    if (!toKey) return;

    // Reorder within the same container if the drop target was a sibling.
    let finalItems = stateAtDrop;
    if (String(over.id) !== toKey) {
      const list = stateAtDrop[toKey] ?? [];
      const oldIdx = list.indexOf(movingId);
      const newIdx = list.indexOf(Number(over.id));
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
        const reordered = arrayMove(list, oldIdx, newIdx);
        finalItems = { ...stateAtDrop, [toKey]: reordered };
      }
    }

    // Determine source tag from current server data (groups, not optimistic).
    const sourceGroup = groups.find((g) =>
      g.repos.some((r) => r.id === movingId),
    );
    const sourceTagId = sourceGroup?.tag?.id ?? null;
    const targetTagId =
      toKey === UNTAGGED_KEY
        ? null
        : Number(toKey.replace(/^tag-/, "")) || null;

    // Build global ordered ID list across all groups, keeping group display
    // order. Repos may appear in multiple tag groups — dedupe by first
    // occurrence to avoid duplicate sort_order writes.
    const seen = new Set<number>();
    const orderedIds: number[] = [];
    for (const g of groups) {
      const list = finalItems[g.key] ?? g.repos.map((r) => r.id);
      for (const id of list) {
        if (!seen.has(id)) {
          seen.add(id);
          orderedIds.push(id);
        }
      }
    }

    const sameContainer = sourceGroup?.key === toKey;
    const sameOrder = (() => {
      const before = groups
        .flatMap((g) => g.repos.map((r) => r.id))
        .filter((id, i, arr) => arr.indexOf(id) === i);
      return (
        before.length === orderedIds.length &&
        before.every((id, i) => id === orderedIds[i])
      );
    })();

    if (sameContainer && sameOrder) return; // nothing changed

    persistMove.mutate({
      repoId: movingId,
      addTagId: sameContainer ? null : targetTagId,
      removeTagId: sameContainer ? null : sourceTagId,
      orderedIds: sameOrder ? null : orderedIds,
    });
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOptimisticItems(null);
  };

  const activeRepo = activeId != null ? repoById.get(activeId) ?? null : null;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <GitBranch size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{t("app.name")}</span>
          <span className="text-[11px] text-muted-foreground">
            {t("app.tagline")}
          </span>
        </div>
      </div>

      <div
        ref={topPaneRef}
        className={cn("shrink-0", topPaneH != null && "overflow-y-auto")}
        style={topPaneH != null ? { height: topPaneH } : undefined}
      >
        <nav className="flex flex-col gap-0.5 px-2 pb-1 pt-1">
          {GLOBAL_NAV.map(({ to, icon: Icon, key }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )
              }
            >
              <Icon size={14} />
              {t(key)}
            </NavLink>
          ))}
        </nav>
        {selectedRepoId != null && (
          <nav className="flex flex-col gap-0.5 border-t px-2 py-2">
            {REPO_NAV.map(({ to, icon: Icon, key }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                  )
                }
              >
                <Icon size={14} />
                {t(key)}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize repositories pane"
        onPointerDown={startResize}
        onDoubleClick={resetTopPane}
        className="group relative h-2 shrink-0 cursor-row-resize select-none bg-sidebar"
        title={t("sidebar.dragHint")}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-1/2 block h-px -translate-y-1/2",
            isResizing
              ? "bg-primary"
              : "bg-sidebar-border group-hover:bg-primary/60",
          )}
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("sidebar.repositories")}
          </span>
          {all.length > 0 && (
            <span className="text-[10px] tabular-nums text-muted-foreground/70">
              {all.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <ManageTagsButton onOpen={() => setTagManagerOpen(true)} />
          <button
            type="button"
            aria-label={t("sidebar.addRepo")}
            title={t("sidebar.addRepo")}
            onClick={() => addOne.mutate()}
            disabled={addOne.isPending}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            aria-label={t("sidebar.scanFolder")}
            title={t("sidebar.scanFolder")}
            onClick={() => discover.mutate()}
            disabled={discover.isPending}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground disabled:opacity-40"
          >
            <FolderSearch size={13} />
          </button>
        </div>
      </div>

      {showFilter && (
        <div className="px-2 pb-1 pt-1">
          <div className="relative">
            <Search
              size={12}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("sidebar.filterPlaceholder")}
              className="h-7 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {repos.isLoading && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {t("common.loading")}
          </p>
        )}
        {repos.data && repos.data.length === 0 && (
          <EmptyRepoState
            onAdd={() => addOne.mutate()}
            onScan={() => discover.mutate()}
            disabled={addOne.isPending || discover.isPending}
          />
        )}
        {showFilter && filtered.length === 0 && repos.data && repos.data.length > 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {t("sidebar.noMatch")}
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {groups.map((group) => {
            const ids = itemsByGroup[group.key] ?? group.repos.map((r) => r.id);
            return (
              <DndGroupView
                key={group.key}
                group={group}
                itemIds={ids}
                collapsed={collapsed.has(group.key)}
                onToggle={() => toggle(group.key)}
                selectedRepoId={selectedRepoId}
                onRepoClick={onRepoClick}
                onRepoRemove={(r) => setRemoveTarget(r)}
                repoById={repoById}
                sparkByRepo={sparkByRepo}
                isDragging={activeId != null}
              />
            );
          })}
          {/* dropAnimation={null} removes @dnd-kit's "fly back to source"
              animation. Otherwise the overlay animates from drop-point to
              the rendered source slot — and if the cache update is even one
              frame late, that slot is the OLD position, producing a bounce
              effect after drop. */}
          <DragOverlay dropAnimation={null}>
            {activeRepo ? (
              <RepoRowGhost
                repo={activeRepo}
                days={sparkByRepo.get(activeRepo.id)}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <TagManager
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
      />

      <ConfirmDialog
        open={removeTarget != null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && remove.mutate(removeTarget.id)}
        title={t("sidebar.deleteTitle")}
        description={
          removeTarget
            ? t("sidebar.deleteConfirm", { name: removeTarget.name })
            : ""
        }
        confirmLabel={t("sidebar.deleteAction")}
        tone="destructive"
        pending={remove.isPending}
      />

      <ScanResultDialog
        open={scanState != null}
        folder={scanState?.folder ?? ""}
        items={scanState?.items ?? []}
        tags={tagsQuery.data ?? []}
        pending={commitScan.isPending}
        creating={createTagInline.isPending}
        onCancel={() => setScanState(null)}
        onConfirm={(paths, tagId) => commitScan.mutate({ paths, tagId })}
        onCreateTag={async (name, color) => {
          const tag = await createTagInline.mutateAsync({ name, color });
          return tag.id;
        }}
      />

      <Dialog
        open={noRepoDrop != null}
        onClose={() => setNoRepoDrop(null)}
        title={t("sidebar.dropNoRepoTitle")}
        description={t("sidebar.dropNoRepoBody")}
        size="sm"
        footer={
          <Button size="sm" onClick={() => setNoRepoDrop(null)}>
            {t("common.ok")}
          </Button>
        }
      >
        {noRepoDrop && noRepoDrop.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-[11px]">
            {noRepoDrop.map((p) => (
              <li key={p} className="truncate font-mono">
                {p}
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </aside>
  );
}

function RepoRowGhost({
  repo,
  days,
}: {
  repo: Repository;
  days?: number[];
}) {
  const total = days?.reduce((a, b) => a + b, 0) ?? 0;
  return (
    <div className="w-60 cursor-grabbing rounded-md border bg-popover px-2 py-1.5 text-popover-foreground shadow-2xl ring-1 ring-primary/40">
      <div className="flex items-center gap-1.5">
        <FolderGit2 size={13} className="shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {repo.name}
        </span>
      </div>
      {days && (
        <div className="mt-1 flex items-center gap-1.5 pl-[18px]">
          <Sparkline
            values={days}
            width={104}
            height={16}
            className={cn(
              total > 0 ? "text-foreground/80" : "text-muted-foreground/60",
            )}
          />
        </div>
      )}
    </div>
  );
}

function DndGroupView({
  group,
  itemIds,
  collapsed,
  onToggle,
  selectedRepoId,
  onRepoClick,
  onRepoRemove,
  repoById,
  sparkByRepo,
  isDragging,
}: {
  group: RepoGroup;
  itemIds: number[];
  collapsed: boolean;
  onToggle: () => void;
  selectedRepoId: number | null;
  onRepoClick: (id: number) => void;
  onRepoRemove: (r: Repository) => void;
  repoById: Map<number, Repository>;
  sparkByRepo: Map<number, number[]>;
  isDragging: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cls = group.tag ? classesFor(group.tag.color) : null;
  const { setNodeRef, isOver } = useDroppable({ id: group.key });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mb-1 rounded-md transition-colors",
        isOver && isDragging && "bg-primary/10 ring-1 ring-primary/40",
      )}
    >
      <div className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-sidebar-accent/30">
        <button
          type="button"
          onClick={onToggle}
          aria-label="toggle"
          className="flex shrink-0 items-center"
        >
          <ChevronRight
            size={12}
            className={cn(
              "text-muted-foreground transition-transform",
              !collapsed && "rotate-90",
            )}
          />
        </button>
        <button
          type="button"
          onClick={(e) => {
            if (group.tag) {
              e.stopPropagation();
              navigate(`/tags/${group.tag.id}`);
            } else {
              onToggle();
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          title={group.tag ? `Open #${group.tag.name} overview` : undefined}
        >
          {cls ? (
            <span className={cn("h-2 w-2 shrink-0 rounded-full", cls.dot)} />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/40" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wide",
              cls ? cls.text : "text-muted-foreground",
            )}
          >
            {group.label}
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {itemIds.length}
          </span>
        </button>
      </div>
      {!collapsed && (
        <SortableContext
          items={itemIds}
          strategy={verticalListSortingStrategy}
        >
          <ul className="mt-0.5 flex flex-col gap-0.5 pl-2">
            {itemIds.length === 0 && (
              <li className="px-2 py-1 text-[11px] italic text-muted-foreground/70">
                {t("sidebar.emptyGroupHint")}
              </li>
            )}
            {itemIds.map((id) => {
              const r = repoById.get(id);
              if (!r) return null;
              return (
                <SortableRepoRow
                  key={`${group.key}-${id}`}
                  repo={r}
                  isActive={r.id === selectedRepoId}
                  onClick={() => onRepoClick(r.id)}
                  onRemove={() => onRepoRemove(r)}
                  days={sparkByRepo.get(r.id)}
                />
              );
            })}
          </ul>
        </SortableContext>
      )}
    </div>
  );
}

function SortableRepoRow({
  repo,
  isActive,
  onClick,
  onRemove,
  days,
}: {
  repo: Repository;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
  days?: number[];
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: repo.id });
  const total = days?.reduce((a, b) => a + b, 0) ?? 0;
  const sparkTitle = total
    ? t("sparkline.last30Days", { count: total })
    : t("sparkline.noActivity");

  // While dragging, hide the source row visually (DragOverlay shows the
  // ghost) and follow the cursor on the Y axis only — keeps the slot moving
  // with the pointer so other items can flow around it, without ever
  // producing a horizontal scrollbar.
  const style: React.CSSProperties = isDragging
    ? {
        transform: transform
          ? `translate3d(0, ${transform.y}px, 0)`
          : undefined,
        transition,
        opacity: 0,
      }
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group/row relative"
    >
      {isActive && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-0 z-10 w-0.5 rounded-full bg-primary"
        />
      )}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "block w-full cursor-grab rounded-md px-2 py-1.5 text-left transition-colors active:cursor-grabbing",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/50",
        )}
        title={repo.path}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="flex items-center gap-1.5">
          <FolderGit2
            size={13}
            className={cn(
              "shrink-0",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              isActive && "font-medium",
            )}
          >
            {repo.name}
          </span>
          <span className="w-5 shrink-0" aria-hidden />
        </div>
        {days && (
          <div className="mt-1 flex items-center gap-1.5 pl-[18px]">
            <Sparkline
              values={days}
              width={104}
              height={16}
              title={sparkTitle}
              className={cn(
                isActive
                  ? "text-primary"
                  : total > 0
                    ? "text-foreground/80 group-hover/row:text-foreground"
                    : "text-muted-foreground/60",
              )}
            />
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {total ? t("sidebar.last30Suffix", { count: total }) : "—"}
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={t("sidebar.remove")}
        title={t("sidebar.remove")}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-2 top-1.5 hidden h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive group-hover/row:flex"
      >
        <Trash2 size={11} />
      </button>
    </li>
  );
}

function ScanResultDialog({
  open,
  folder,
  items,
  tags,
  pending,
  creating,
  onCancel,
  onConfirm,
  onCreateTag,
}: {
  open: boolean;
  folder: string;
  items: DiscoveredRepo[];
  tags: TagWithStats[];
  pending: boolean;
  creating: boolean;
  onCancel: () => void;
  onConfirm: (paths: string[], tagId: number | null) => void;
  onCreateTag: (name: string, color: TagColor) => Promise<number>;
}) {
  const { t } = useTranslation();
  const [tagId, setTagId] = useState<string>("");
  const [createMode, setCreateMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor>("slate");

  useEffect(() => {
    if (!open) {
      setTagId("");
      setCreateMode(false);
      setNewName("");
      setNewColor("slate");
    }
  }, [open]);

  const tagOptions = useMemo(
    () => [
      { value: "", label: t("sidebar.scanModalNoTag") },
      ...tags.map((tg) => ({ value: String(tg.id), label: `#${tg.name}` })),
    ],
    [tags, t],
  );

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const id = await onCreateTag(trimmed, newColor);
      setTagId(String(id));
      setCreateMode(false);
      setNewName("");
    } catch (err) {
      console.error(err);
    }
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={pending ? () => undefined : onCancel}
      title={t("sidebar.scanModalTitle", { count: items.length })}
      description={folder}
      size="md"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onConfirm(
                items.map((d) => d.path),
                tagId ? Number(tagId) : null,
              )
            }
            disabled={pending || items.length === 0}
          >
            {pending
              ? t("sidebar.scanModalAdding")
              : t("sidebar.scanModalAdd", { count: items.length })}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("sidebar.scanModalTagOptional")}
            </span>
            {!createMode && (
              <button
                type="button"
                onClick={() => setCreateMode(true)}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <Plus size={11} />
                {t("sidebar.scanModalNewTag")}
              </button>
            )}
          </div>
          {createMode ? (
            <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  else if (e.key === "Escape") setCreateMode(false);
                }}
                placeholder={t("sidebar.tagPlaceholder")}
                className="h-8 text-xs"
                autoFocus
              />
              <div className="flex flex-wrap gap-1">
                {TAG_COLORS.map((c) => {
                  const cls = classesFor(c);
                  const active = newColor === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-label={c}
                      onClick={() => setNewColor(c)}
                      className={cn(
                        "h-5 w-5 rounded-full ring-2 ring-transparent",
                        cls.dot,
                        active && cls.ring,
                      )}
                    />
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreateMode(false);
                    setNewName("");
                  }}
                  disabled={creating}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                >
                  {creating
                    ? t("tagManager.create") + "…"
                    : t("tagManager.create")}
                </Button>
              </div>
            </div>
          ) : (
            <Select
              value={tagId}
              onChange={(v) => setTagId(v)}
              options={tagOptions}
              className="h-8 text-xs"
            />
          )}
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("sidebar.scanModalDiscovered", { count: items.length })}
          </div>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {items.map((d) => (
              <li
                key={d.path}
                className="flex items-center gap-2 px-3 py-2 text-xs"
              >
                <FolderGit2
                  size={12}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="font-medium">{d.name}</span>
                <code className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
                  {d.path}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}

function EmptyRepoState({
  onAdd,
  onScan,
  disabled,
}: {
  onAdd: () => void;
  onScan: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="m-2 flex flex-col items-start gap-2 rounded-lg border border-dashed border-sidebar-border p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Inbox size={16} />
      </div>
      <div>
        <div className="text-sm font-medium">{t("sidebar.noReposTitle")}</div>
        <p className="text-[11px] text-muted-foreground">
          {t("sidebar.noReposBody")}
        </p>
      </div>
      <div className="flex w-full gap-1">
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus size={12} /> {t("sidebar.addRepo")}
        </button>
        <button
          type="button"
          onClick={onScan}
          disabled={disabled}
          className="flex flex-1 items-center justify-center gap-1 rounded-md border border-input px-2 py-1.5 text-xs hover:bg-sidebar-accent disabled:opacity-50"
        >
          <FolderSearch size={12} /> {t("sidebar.scanFolder").split(" ")[0]}
        </button>
      </div>
    </div>
  );
}
