import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  File,
  FileMinus,
  FilePlus,
  FilePen,
} from "lucide-react";
import type { ThemedToken } from "shiki";

import { Tabs } from "@/components/ui/Tabs";
import { OpenInIdeButton } from "@/components/OpenInIdeButton";
import { highlightLines, langForPath } from "@/lib/highlight";
import { useAppState } from "@/state/AppState";
import { cn } from "@/lib/utils";
import type { DiffLine, FilePatch, Hunk } from "@/types";

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

type ViewMode = "unified" | "split";

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
  const [viewMode, setViewMode] = useState<ViewMode>("unified");

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
        <Tabs<ViewMode>
          value={viewMode}
          onChange={setViewMode}
          items={[
            { value: "unified", label: t("commit.viewUnified") },
            { value: "split", label: t("commit.viewSplit") },
          ]}
        />
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

      {files.map((file, fi) => (
        <FileBlock
          key={fileKeys[fi]}
          file={file}
          fileKey={fileKeys[fi]}
          isClosed={collapsed.has(fileKeys[fi])}
          onToggle={() => toggle(fileKeys[fi])}
          viewMode={viewMode}
        />
      ))}
    </div>
  );
}

function FileBlock({
  file,
  fileKey,
  isClosed,
  onToggle,
  viewMode,
}: {
  file: FilePatch;
  fileKey: string;
  isClosed: boolean;
  onToggle: () => void;
  viewMode: ViewMode;
}) {
  const path = file.newPath ?? file.oldPath ?? "—";
  const Icon = STATUS_ICON[file.status] ?? File;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div
        className={cn(
          "flex w-full items-center gap-2 border-b bg-muted/30 px-3 py-2 text-sm",
          isClosed && "border-b-transparent",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!isClosed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:opacity-80"
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
        </button>
        <span className="flex shrink-0 items-center gap-2 text-xs">
          <span className="text-emerald-500">+{file.insertions}</span>
          <span className="text-rose-500">-{file.deletions}</span>
          {(file.newPath || file.oldPath) && (
            <OpenInIdeButton
              filePath={file.newPath ?? file.oldPath ?? undefined}
            />
          )}
        </span>
      </div>
      {!isClosed && (
        <FileBody file={file} fileKey={fileKey} viewMode={viewMode} />
      )}
    </div>
  );
}

function FileBody({
  file,
  viewMode,
}: {
  file: FilePatch;
  fileKey: string;
  viewMode: ViewMode;
}) {
  const { t } = useTranslation();
  const { theme } = useAppState();
  const isDark = useDarkMode(theme);
  const lang = useMemo(
    () => langForPath(file.newPath ?? file.oldPath),
    [file.newPath, file.oldPath],
  );
  const tokens = useFileTokens(file, lang, isDark);

  if (file.isBinary) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {t("commit.binaryFile")}
      </div>
    );
  }

  if (viewMode === "split") {
    return (
      <SplitDiff hunks={file.hunks} tokens={tokens} />
    );
  }
  return <UnifiedDiff hunks={file.hunks} tokens={tokens} />;
}

function UnifiedDiff({
  hunks,
  tokens,
}: {
  hunks: Hunk[];
  tokens: TokenMap | null;
}) {
  return (
    <>
      {hunks.map((hunk, hi) => (
        <div key={hi} className="border-t font-mono text-[12px] leading-5">
          <div className="bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@{" "}
            {hunk.header}
          </div>
          <div>
            {hunk.lines.map((line, li) => (
              <UnifiedLineRow
                key={li}
                line={line}
                tokens={tokens?.get(lineKey(hi, li)) ?? null}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function UnifiedLineRow({
  line,
  tokens,
}: {
  line: DiffLine;
  tokens: ThemedToken[] | null;
}) {
  const o = line.origin;
  const bg = LINE_BG[o] ?? "";
  const gut = LINE_GUTTER[o] ?? "text-muted-foreground";
  return (
    <div
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
      <span className="px-2">
        <LineContent content={line.content} tokens={tokens} />
      </span>
    </div>
  );
}

function SplitDiff({
  hunks,
  tokens,
}: {
  hunks: Hunk[];
  tokens: TokenMap | null;
}) {
  return (
    <>
      {hunks.map((hunk, hi) => {
        const pairs = pairLines(hunk.lines, hi);
        return (
          <div
            key={hi}
            className="border-t font-mono text-[12px] leading-5"
          >
            <div className="bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@{" "}
              {hunk.header}
            </div>
            <div className="grid grid-cols-2 divide-x">
              <div className="overflow-x-auto">
                <div className="w-max min-w-full">
                  {pairs.map((p, i) => (
                    <SplitCell
                      key={`l${i}`}
                      line={p.left}
                      tokens={
                        p.left ? tokens?.get(p.left.tokensKey) ?? null : null
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="w-max min-w-full">
                  {pairs.map((p, i) => (
                    <SplitCell
                      key={`r${i}`}
                      line={p.right}
                      tokens={
                        p.right ? tokens?.get(p.right.tokensKey) ?? null : null
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function SplitCell({
  line,
  tokens,
}: {
  line: PairedLine | null;
  tokens: ThemedToken[] | null;
}) {
  if (!line) {
    return <div className="h-5 bg-muted/10" />;
  }
  const o = line.origin;
  const bg = LINE_BG[o] ?? "";
  const gut = LINE_GUTTER[o] ?? "text-muted-foreground";
  return (
    <div className={cn("flex whitespace-pre", bg)}>
      <span
        className={cn(
          "w-12 shrink-0 select-none px-2 text-right text-[11px] tabular-nums",
          gut,
        )}
      >
        {line.lineno ?? ""}
      </span>
      <span className="px-2 pr-4">
        <LineContent content={line.content} tokens={tokens} />
      </span>
    </div>
  );
}

function LineContent({
  content,
  tokens,
}: {
  content: string;
  tokens: ThemedToken[] | null;
}) {
  if (!tokens || tokens.length === 0) {
    return <>{content || " "}</>;
  }
  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} style={{ color: tok.color }}>
          {tok.content}
        </span>
      ))}
    </>
  );
}

// ---------- helpers ----------

interface PairedLine {
  origin: string;
  content: string;
  lineno: number | null;
  tokensKey: string;
}

function pairLines(
  lines: DiffLine[],
  hunkIdx: number,
): { left: PairedLine | null; right: PairedLine | null }[] {
  const out: { left: PairedLine | null; right: PairedLine | null }[] = [];
  let pendingRemoves: { line: DiffLine; idx: number }[] = [];
  let pendingAdds: { line: DiffLine; idx: number }[] = [];

  const flush = () => {
    while (pendingRemoves.length || pendingAdds.length) {
      const r = pendingRemoves.shift();
      const a = pendingAdds.shift();
      out.push({
        left: r
          ? {
              origin: "-",
              content: r.line.content,
              lineno: r.line.oldLineno,
              tokensKey: lineKey(hunkIdx, r.idx),
            }
          : null,
        right: a
          ? {
              origin: "+",
              content: a.line.content,
              lineno: a.line.newLineno,
              tokensKey: lineKey(hunkIdx, a.idx),
            }
          : null,
      });
    }
  };

  lines.forEach((line, idx) => {
    if (line.origin === "-") {
      pendingRemoves.push({ line, idx });
    } else if (line.origin === "+") {
      pendingAdds.push({ line, idx });
    } else {
      flush();
      out.push({
        left: {
          origin: " ",
          content: line.content,
          lineno: line.oldLineno,
          tokensKey: lineKey(hunkIdx, idx),
        },
        right: {
          origin: " ",
          content: line.content,
          lineno: line.newLineno,
          tokensKey: lineKey(hunkIdx, idx),
        },
      });
    }
  });
  flush();

  return out;
}

function lineKey(hunkIdx: number, lineIdx: number): string {
  return `${hunkIdx}:${lineIdx}`;
}

type TokenMap = Map<string, ThemedToken[]>;

function useFileTokens(
  file: FilePatch,
  lang: ReturnType<typeof langForPath>,
  isDark: boolean,
): TokenMap | null {
  const [tokens, setTokens] = useState<TokenMap | null>(null);

  useEffect(() => {
    if (!lang || file.isBinary) {
      setTokens(null);
      return;
    }
    let cancelled = false;

    // Build a flat list (one entry per logical source line, regardless of +/-/space)
    // But we want per-line highlighting, so we feed each diff line as one source line
    // ignoring the diff origin. This means for a hunk with deletes followed by adds,
    // we treat each as a separate line.
    const flatLines: { key: string; content: string }[] = [];
    file.hunks.forEach((hunk, hi) => {
      hunk.lines.forEach((line, li) => {
        flatLines.push({ key: lineKey(hi, li), content: line.content });
      });
    });
    if (flatLines.length === 0) {
      setTokens(new Map());
      return;
    }

    const theme = isDark ? "github-dark" : "github-light";
    highlightLines(
      flatLines.map((l) => l.content),
      lang,
      theme,
    )
      .then((perLine) => {
        if (cancelled) return;
        const map: TokenMap = new Map();
        flatLines.forEach((l, idx) => {
          map.set(l.key, perLine[idx] ?? []);
        });
        setTokens(map);
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });

    return () => {
      cancelled = true;
    };
  }, [file, lang, isDark]);

  return tokens;
}

function useDarkMode(theme: string): boolean {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const update = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [theme]);
  return isDark;
}
