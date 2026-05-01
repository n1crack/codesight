import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Calendar, FolderGit2, RotateCw, Search } from "lucide-react";

import { api } from "@/api";
import { Select } from "@/components/ui/Select";
import { useAppState } from "@/state/AppState";
import { classesFor } from "@/lib/tagColors";
import { cn } from "@/lib/utils";
import type { DateRangePreset } from "@/state/AppState";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

export function AppTopBar() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { selectedRepoId, dateRange, setDateRange } = useAppState();
  const [spinning, setSpinning] = useState(false);

  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: api.listRepositories,
  });
  const selectedRepo = repos.data?.find((r) => r.id === selectedRepoId) ?? null;

  useEffect(() => {
    if (!spinning) return;
    const id = window.setTimeout(() => setSpinning(false), 600);
    return () => window.clearTimeout(id);
  }, [spinning]);

  const refresh = async () => {
    setSpinning(true);
    try {
      if (selectedRepoId != null) {
        await api.refreshRepo(selectedRepoId);
      }
    } catch (err) {
      console.error(err);
    }
    qc.invalidateQueries();
  };

  const openPalette = () => {
    window.dispatchEvent(new CustomEvent("codesight:open-palette"));
  };

  const dateRangeOptions: { value: DateRangePreset; label: string }[] = [
    { value: "all", label: t("topbar.dateAll") },
    { value: "7d", label: t("topbar.date7d") },
    { value: "30d", label: t("topbar.date30d") },
    { value: "90d", label: t("topbar.date90d") },
    { value: "6m", label: t("topbar.date6m") },
    { value: "1y", label: t("topbar.date1y") },
  ];

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-background/60 px-3 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center">
        {selectedRepo ? (
          <button
            type="button"
            onClick={() => navigate("/activity")}
            title={selectedRepo.path}
            className="group flex min-w-0 max-w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-accent"
          >
            <FolderGit2
              size={13}
              className="shrink-0 text-primary"
              aria-hidden
            />
            <span className="min-w-0 truncate text-sm font-semibold">
              {selectedRepo.name}
            </span>
            {selectedRepo.tags.length > 0 && (
              <span className="hidden shrink-0 items-center gap-1 sm:flex">
                {selectedRepo.tags.slice(0, 3).map((tag) => {
                  const cls = classesFor(tag.color);
                  return (
                    <span
                      key={tag.id}
                      className={cn(
                        "rounded px-1 py-0.5 text-[10px] font-medium",
                        cls.bg,
                        cls.text,
                      )}
                    >
                      {tag.name}
                    </span>
                  );
                })}
              </span>
            )}
            <span className="hidden truncate text-[11px] text-muted-foreground/80 md:inline">
              {selectedRepo.path}
            </span>
          </button>
        ) : (
          <span className="px-2 py-1 text-xs text-muted-foreground">
            {t("common.selectRepo")}
          </span>
        )}
      </div>
      <div
        className="flex items-center gap-1.5"
        title={t("topbar.dateRange")}
      >
        <Calendar size={12} className="text-muted-foreground" />
        <Select<DateRangePreset>
          value={dateRange}
          onChange={setDateRange}
          options={dateRangeOptions}
          className="h-7 text-xs"
        />
      </div>
      <button
        type="button"
        onClick={openPalette}
        className="flex items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        title={t("command.placeholder")}
      >
        <Search size={12} />
        <span>{t("command.placeholder")}</span>
        <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <button
        type="button"
        onClick={refresh}
        aria-label={t("topbar.refresh")}
        title={t("topbar.refreshTitle")}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <RotateCw
          size={14}
          className={cn("transition-transform", spinning && "animate-spin")}
        />
      </button>
    </div>
  );
}
