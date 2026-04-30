import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Calendar,
  Crown,
  Flame,
  FolderGit2,
  GitBranch,
  GitCompare,
  GitGraph,
  GitMerge,
  Home,
  Search,
  Settings,
  Tag as TagIcon,
  Users,
} from "lucide-react";

import { api } from "@/api";
import { useAppState } from "@/state/AppState";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number }>;
  action: () => void;
};

const PAGES: Array<{
  to: string;
  key: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { to: "/", key: "nav.home", icon: Home },
  { to: "/overview", key: "nav.overview", icon: BarChart3 },
  { to: "/heatmap", key: "nav.heatmap", icon: GitBranch },
  { to: "/timeline", key: "nav.timeline", icon: Calendar },
  { to: "/activity", key: "nav.activity", icon: Activity },
  { to: "/branches", key: "nav.branches", icon: GitMerge },
  { to: "/contributors", key: "nav.contributors", icon: Users },
  { to: "/ownership", key: "nav.ownership", icon: Crown },
  { to: "/tags", key: "nav.tags", icon: TagIcon },
  { to: "/hotspots", key: "nav.hotspots", icon: Flame },
  { to: "/search", key: "nav.search", icon: Search },
  { to: "/graph", key: "nav.graph", icon: GitGraph },
  { to: "/comparison", key: "nav.comparison", icon: GitCompare },
  { to: "/settings", key: "nav.settings", icon: Settings },
];

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSelectedRepoId } = useAppState();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: api.listRepositories,
  });

  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("codesight:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("codesight:open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const pages: Item[] = PAGES.map((p) => ({
      id: `page:${p.to}`,
      label: t(p.key),
      hint: t("command.page"),
      icon: p.icon,
      action: () => {
        navigate(p.to);
        setOpen(false);
      },
    }));
    const repoItems: Item[] = (repos.data ?? []).map((r) => ({
      id: `repo:${r.id}`,
      label: r.name,
      hint: t("command.repository"),
      icon: FolderGit2,
      action: () => {
        setSelectedRepoId(r.id);
        navigate("/overview");
        setOpen(false);
      },
    }));
    return [...pages, ...repoItems];
  }, [t, navigate, setSelectedRepoId, repos.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((it) => it.label.toLowerCase().includes(q))
      : items;
    return list.slice(0, 40);
  }, [items, query]);

  useEffect(() => {
    if (active >= filtered.length) setActive(0);
  }, [filtered.length, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (filtered.length ? (a + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) =>
        filtered.length ? (a - 1 + filtered.length) % filtered.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.action();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search size={14} className="text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("command.placeholder")}
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            esc
          </kbd>
        </div>
        <ul ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {t("command.noResults")}
            </li>
          ) : (
            filtered.map((it, i) => {
              const Icon = it.icon;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => it.action()}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                      i === active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50",
                    )}
                  >
                    <Icon size={14} />
                    <span className="flex-1 truncate">{it.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {it.hint}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="flex items-center justify-end gap-3 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
        </div>
      </div>
    </div>
  );
}
