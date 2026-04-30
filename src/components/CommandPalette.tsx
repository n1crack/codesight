import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Brain,
  FolderGit2,
  GitCompare,
  GitGraph,
  Home,
  Search,
  Settings,
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
  { to: "/activity", key: "nav.activity", icon: Activity },
  { to: "/insights", key: "nav.insights", icon: Brain },
  { to: "/graph", key: "nav.graph", icon: GitGraph },
  { to: "/search", key: "nav.search", icon: Search },
  { to: "/compare", key: "nav.compare", icon: GitCompare },
  { to: "/settings", key: "nav.settings", icon: Settings },
];

const SUB_PAGES: Array<{
  to: string;
  parentKey: string;
  childKey: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { to: "/activity/heatmap", parentKey: "nav.activity", childKey: "section.activity.heatmap", icon: Activity },
  { to: "/activity/timeline", parentKey: "nav.activity", childKey: "section.activity.timeline", icon: Activity },
  { to: "/activity/patterns", parentKey: "nav.activity", childKey: "section.activity.patterns", icon: Activity },
  { to: "/insights/health", parentKey: "nav.insights", childKey: "section.insights.health", icon: Brain },
  { to: "/insights/hotspots", parentKey: "nav.insights", childKey: "section.insights.hotspots", icon: Brain },
  { to: "/insights/ownership", parentKey: "nav.insights", childKey: "section.insights.ownership", icon: Brain },
  { to: "/insights/authors", parentKey: "nav.insights", childKey: "section.insights.authors", icon: Brain },
  { to: "/insights/messages", parentKey: "nav.insights", childKey: "section.insights.messages", icon: Brain },
  { to: "/graph/dag", parentKey: "nav.graph", childKey: "section.graph.dag", icon: GitGraph },
  { to: "/graph/branches", parentKey: "nav.graph", childKey: "section.graph.branches", icon: GitGraph },
  { to: "/graph/releases", parentKey: "nav.graph", childKey: "section.graph.releases", icon: GitGraph },
];

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSelectedRepoId } = useAppState();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: api.listRepositories,
  });

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
    const subs: Item[] = SUB_PAGES.map((p) => ({
      id: `sub:${p.to}`,
      label: `${t(p.parentKey)} → ${t(p.childKey)}`,
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
        navigate("/activity");
        setOpen(false);
      },
    }));
    return [...pages, ...subs, ...repoItems];
  }, [t, navigate, setSelectedRepoId, repos.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((it) => it.label.toLowerCase().includes(q))
      : items;
    return list.slice(0, 50);
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
            {t("command.esc")}
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
          <span>{t("command.hintNavigate")}</span>
          <span>{t("command.hintSelect")}</span>
        </div>
      </div>
    </div>
  );
}
