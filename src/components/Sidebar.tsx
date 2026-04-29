import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import {
  Folder,
  FolderSearch,
  Plus,
  Trash2,
  GitBranch,
  BarChart3,
  Calendar,
  GitCompare,
  Settings,
  Activity,
  Tag as TagIcon,
  GitMerge,
  Users,
  Crown,
  Search,
} from "lucide-react";

import { api, pickRepositoryDir, pickScanRoot } from "@/api";
import { Button } from "@/components/ui/Button";
import { Sparkline } from "@/components/Sparkline";
import { useAppState } from "@/state/AppState";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", icon: BarChart3, key: "nav.overview" },
  { to: "/heatmap", icon: GitBranch, key: "nav.heatmap" },
  { to: "/timeline", icon: Calendar, key: "nav.timeline" },
  { to: "/activity", icon: Activity, key: "nav.activity" },
  { to: "/branches", icon: GitMerge, key: "nav.branches" },
  { to: "/contributors", icon: Users, key: "nav.contributors" },
  { to: "/ownership", icon: Crown, key: "nav.ownership" },
  { to: "/tags", icon: TagIcon, key: "nav.tags" },
  { to: "/search", icon: Search, key: "nav.search" },
  { to: "/comparison", icon: GitCompare, key: "nav.comparison" },
  { to: "/settings", icon: Settings, key: "nav.settings" },
] as const;

export function Sidebar() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { selectedRepoId, setSelectedRepoId } = useAppState();

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

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <GitBranch size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{t("app.name")}</span>
          <span className="text-[11px] text-muted-foreground">{t("app.tagline")}</span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 pb-2">
        {NAV_ITEMS.map(({ to, icon: Icon, key }) => (
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

      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("sidebar.repositories")}
        </span>
      </div>

      <div className="flex flex-col gap-1 px-2 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => addOne.mutate()}
          disabled={addOne.isPending}
        >
          <Plus size={14} /> {t("sidebar.addRepo")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => scan.mutate()}
          disabled={scan.isPending}
        >
          <FolderSearch size={14} /> {t("sidebar.scanFolder")}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {repos.isLoading && (
          <p className="px-2 py-1 text-xs text-muted-foreground">{t("common.loading")}</p>
        )}
        {repos.data && repos.data.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">{t("sidebar.noRepos")}</p>
        )}
        {repos.data?.map((r) => {
          const isActive = r.id === selectedRepoId;
          const days = sparkByRepo.get(r.id);
          const total = days?.reduce((a, b) => a + b, 0) ?? 0;
          const sparkTitle = total
            ? t("sparkline.last30Days", { count: total })
            : t("sparkline.noActivity");
          return (
            <div
              key={r.id}
              className={cn(
                "group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 truncate text-left"
                onClick={() => setSelectedRepoId(r.id)}
                title={r.path}
              >
                <Folder size={14} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{r.name}</span>
              </button>
              {days && (
                <Sparkline
                  values={days}
                  width={48}
                  height={14}
                  title={sparkTitle}
                  className="opacity-70 group-hover:opacity-100"
                />
              )}
              <button
                type="button"
                aria-label={t("sidebar.remove")}
                className="hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:flex"
                onClick={() => remove.mutate(r.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
