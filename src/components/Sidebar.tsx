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

import { api, pickRepositoryDir, pickScanRoot } from "@/api";
import { ManageTagsButton, TagManager } from "@/components/TagManager";
import { Sparkline } from "@/components/Sparkline";
import { useAppState } from "@/state/AppState";
import { classesFor } from "@/lib/tagColors";
import { cn } from "@/lib/utils";
import type { Repository, Tag } from "@/types";

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

interface RepoGroup {
  key: string;        // "tag-3" or "untagged"
  tag: Tag | null;    // null = untagged
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
  untaggedLabel: string,
): RepoGroup[] {
  const groupMap = new Map<number, { tag: Tag; repos: Repository[] }>();
  const untagged: Repository[] = [];

  for (const r of repos) {
    if (r.tags.length === 0) {
      untagged.push(r);
    } else {
      for (const tag of r.tags) {
        if (!groupMap.has(tag.id)) {
          groupMap.set(tag.id, { tag, repos: [] });
        }
        groupMap.get(tag.id)!.repos.push(r);
      }
    }
  }

  const groups: RepoGroup[] = Array.from(groupMap.values())
    .sort(
      (a, b) =>
        a.tag.sort_order - b.tag.sort_order ||
        a.tag.name.localeCompare(b.tag.name),
    )
    .map(({ tag, repos: rs }) => ({
      key: `tag-${tag.id}`,
      tag,
      label: tag.name,
      repos: rs,
    }));

  if (untagged.length > 0) {
    groups.push({
      key: "untagged",
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

  const scan = useMutation({
    mutationFn: async () => {
      const folder = await pickScanRoot();
      if (!folder) return [];
      return api.scanFolder(folder);
    },
    onSuccess: (added) => {
      qc.invalidateQueries({ queryKey: ["repositories"] });
      qc.invalidateQueries({ queryKey: ["sparklines"] });
      if (added.length === 0) {
        alert(t("errors.noReposFound"));
      } else if (!selectedRepoId) {
        setSelectedRepoId(added[0].id);
      }
    },
    onError: (err) => {
      console.error(err);
      alert(t("errors.scanFailed", { message: String(err) }));
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.removeRepository(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["repositories"] });
      qc.invalidateQueries({ queryKey: ["sparklines"] });
      if (selectedRepoId === id) setSelectedRepoId(null);
    },
  });

  const handleRemove = (r: Repository) => {
    if (window.confirm(t("sidebar.confirmRemove", { name: r.name }))) {
      remove.mutate(r.id);
    }
  };

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
    () => buildGroups(filtered, t("sidebar.untagged")),
    [filtered, t],
  );

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
            onClick={() => scan.mutate()}
            disabled={scan.isPending}
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
            onScan={() => scan.mutate()}
            disabled={addOne.isPending || scan.isPending}
          />
        )}
        {showFilter && filtered.length === 0 && repos.data && repos.data.length > 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {t("sidebar.noMatch")}
          </p>
        )}
        {groups.map((group) => (
          <RepoGroupView
            key={group.key}
            group={group}
            collapsed={collapsed.has(group.key)}
            onToggle={() => toggle(group.key)}
            selectedRepoId={selectedRepoId}
            onRepoClick={onRepoClick}
            onRepoRemove={handleRemove}
            sparkByRepo={sparkByRepo}
          />
        ))}
      </div>

      <TagManager
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
      />
    </aside>
  );
}

function RepoGroupView({
  group,
  collapsed,
  onToggle,
  selectedRepoId,
  onRepoClick,
  onRepoRemove,
  sparkByRepo,
}: {
  group: RepoGroup;
  collapsed: boolean;
  onToggle: () => void;
  selectedRepoId: number | null;
  onRepoClick: (id: number) => void;
  onRepoRemove: (r: Repository) => void;
  sparkByRepo: Map<number, number[]>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cls = group.tag ? classesFor(group.tag.color) : null;
  return (
    <div className="mb-1">
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
            {group.repos.length}
          </span>
        </button>
      </div>
      {!collapsed && (
        <ul className="mt-0.5 flex flex-col gap-0.5 pl-2">
          {group.repos.map((r) => (
            <RepoRow
              key={`${group.key}-${r.id}`}
              repo={r}
              isActive={r.id === selectedRepoId}
              onClick={() => onRepoClick(r.id)}
              onRemove={() => onRepoRemove(r)}
              days={sparkByRepo.get(r.id)}
              t={t}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RepoRow({
  repo,
  isActive,
  onClick,
  onRemove,
  days,
  t,
}: {
  repo: Repository;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
  days?: number[];
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const total = days?.reduce((a, b) => a + b, 0) ?? 0;
  const sparkTitle = total
    ? t("sparkline.last30Days", { count: total })
    : t("sparkline.noActivity");
  return (
    <li className="relative">
      {isActive && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
        />
      )}
      <div
        className={cn(
          "group rounded-md transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "hover:bg-sidebar-accent/50",
        )}
      >
        <div className="block w-full px-2 py-1.5 text-left">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClick}
              title={repo.path}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
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
                  isActive ? "font-medium" : "",
                )}
              >
                {repo.name}
              </span>
            </button>
            <button
              type="button"
              aria-label={t("sidebar.remove")}
              title={t("sidebar.remove")}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive group-hover:flex"
            >
              <Trash2 size={11} />
            </button>
          </div>
          {days && (
            <button
              type="button"
              onClick={onClick}
              className="mt-1 flex items-center gap-1.5 pl-[18px]"
            >
              <Sparkline
                values={days}
                width={104}
                height={16}
                title={sparkTitle}
                className={cn(
                  isActive
                    ? "text-primary"
                    : total > 0
                      ? "text-foreground/80 group-hover:text-foreground"
                      : "text-muted-foreground/60",
                )}
              />
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {total ? t("sidebar.last30Suffix", { count: total }) : "—"}
              </span>
            </button>
          )}
        </div>
      </div>
    </li>
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
