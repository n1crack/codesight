import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  File,
  FileMinus,
  FilePlus,
  FilePen,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { FilePatch } from "@/types";

const STATUS_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  added: FilePlus,
  deleted: FileMinus,
  modified: FilePen,
  renamed: FilePen,
  copied: FilePen,
  typechange: File,
};

const STATUS_COLOR: Record<string, string> = {
  added: "text-emerald-500",
  deleted: "text-rose-500",
  modified: "text-foreground",
  renamed: "text-amber-500",
  copied: "text-amber-500",
  typechange: "text-muted-foreground",
};

const LINE_BG: Record<string, string> = {
  "+": "bg-emerald-500/10",
  "-": "bg-rose-500/10",
  " ": "",
};

const LINE_GUTTER: Record<string, string> = {
  "+": "text-emerald-600 dark:text-emerald-400",
  "-": "text-rose-600 dark:text-rose-400",
  " ": "text-muted-foreground",
};

interface Props {
  files: FilePatch[];
}

export function DiffView({ files }: Props) {
  const { t } = useTranslation();

  const fileKeys = useMemo(
    () => files.map((f, i) => `${f.newPath ?? f.oldPath ?? "—"}-${i}`),
    [files],
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allCollapsed = collapsed.size === fileKeys.length && fileKeys.length > 0;
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(fileKeys));

  if (!files.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-3 text-xs">
        <button
          type="button"
          onClick={expandAll}
          disabled={collapsed.size === 0}
          className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("commit.expandAll")}
        </button>
        <span className="text-muted-foreground/50">·</span>
        <button
          type="button"
          onClick={collapseAll}
          disabled={allCollapsed}
          className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("commit.collapseAll")}
        </button>
      </div>

      {files.map((file, fi) => {
        const path = file.newPath ?? file.oldPath ?? "—";
        const key = fileKeys[fi];
        const isClosed = collapsed.has(key);
        const Icon = STATUS_ICON[file.status] ?? File;
        return (
          <div
            key={key}
            className="overflow-hidden rounded-lg border bg-card"
          >
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-expanded={!isClosed}
              className={cn(
                "flex w-full items-center gap-2 border-b bg-muted/30 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                isClosed && "border-b-transparent",
              )}
            >
              <ChevronDown
                size={14}
                className={cn(
                  "shrink-0 text-muted-foreground transition-transform",
                  isClosed && "-rotate-90",
                )}
              />
              <Icon size={14} />
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  STATUS_COLOR[file.status] ?? "text-muted-foreground",
                )}
              >
                {file.status}
              </span>
              <span className="truncate font-mono text-xs">{path}</span>
              {file.oldPath && file.newPath && file.oldPath !== file.newPath && (
                <span className="truncate font-mono text-xs text-muted-foreground">
                  ← {file.oldPath}
                </span>
              )}
              <span className="ml-auto flex shrink-0 gap-2 text-xs">
                <span className="text-emerald-500">+{file.insertions}</span>
                <span className="text-rose-500">-{file.deletions}</span>
              </span>
            </button>
            {!isClosed && (
              file.isBinary ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {t("commit.binaryFile")}
                </div>
              ) : (
                file.hunks.map((hunk, hi) => (
                  <div
                    key={hi}
                    className="border-t font-mono text-[12px] leading-5"
                  >
                    <div className="bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
                      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@{" "}
                      {hunk.header}
                    </div>
                    <div>
                      {hunk.lines.map((line, li) => {
                        const o = line.origin;
                        const bg = LINE_BG[o] ?? "";
                        const gut = LINE_GUTTER[o] ?? "text-muted-foreground";
                        return (
                          <div
                            key={li}
                            className={cn(
                              "grid grid-cols-[3.5rem_3.5rem_1.5rem_1fr] whitespace-pre",
                              bg,
                            )}
                          >
                            <span
                              className={cn(
                                "select-none px-2 text-right text-[11px] tabular-nums",
                                gut,
                              )}
                            >
                              {line.oldLineno ?? ""}
                            </span>
                            <span
                              className={cn(
                                "select-none px-2 text-right text-[11px] tabular-nums",
                                gut,
                              )}
                            >
                              {line.newLineno ?? ""}
                            </span>
                            <span className={cn("select-none text-center", gut)}>
                              {o === " " ? " " : o}
                            </span>
                            <span className="px-2">{line.content || " "}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
