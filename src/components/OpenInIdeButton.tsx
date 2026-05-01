import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";

import { api } from "@/api";
import { useAppState } from "@/state/AppState";
import { openInIde } from "@/lib/openInIde";
import { cn } from "@/lib/utils";

interface Props {
  filePath?: string;
  className?: string;
  size?: number;
}

// Tiny icon button shown next to file paths. Resolves the active repo's path
// from the repositories cache, joins the file path, and shells out to the
// user's preferred editor (set in Settings).
export function OpenInIdeButton({ filePath, className, size = 12 }: Props) {
  const { t } = useTranslation();
  const { selectedRepoId, ide } = useAppState();
  const repos = useQuery({
    queryKey: ["repositories"],
    queryFn: api.listRepositories,
  });

  const repo = repos.data?.find((r) => r.id === selectedRepoId);
  if (!repo) return null;

  return (
    <button
      type="button"
      title={t("openInIde")}
      aria-label={t("openInIde")}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void openInIde(ide, repo.path, filePath);
      }}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <ExternalLink size={size} />
    </button>
  );
}
