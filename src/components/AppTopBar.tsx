import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RotateCw, Search } from "lucide-react";

import { cn } from "@/lib/utils";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

export function AppTopBar() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    if (!spinning) return;
    const id = window.setTimeout(() => setSpinning(false), 600);
    return () => window.clearTimeout(id);
  }, [spinning]);

  const refresh = () => {
    qc.invalidateQueries();
    setSpinning(true);
  };

  const openPalette = () => {
    window.dispatchEvent(new CustomEvent("codesight:open-palette"));
  };

  return (
    <div className="flex h-9 shrink-0 items-center justify-end gap-2 border-b bg-background/60 px-3 backdrop-blur">
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
