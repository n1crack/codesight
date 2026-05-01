import { api } from "@/api";

export async function openInIde(
  ide: string,
  repoPath: string,
  filePath?: string,
): Promise<void> {
  const target = filePath ? joinPath(repoPath, filePath) : repoPath;
  try {
    await api.openInIde(ide, target);
  } catch (err) {
    console.error("open_in_ide failed", err);
    alert(String(err));
  }
}

function joinPath(base: string, sub: string): string {
  if (!sub) return base;
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  const trimmedBase = base.replace(/[\\/]+$/, "");
  const trimmedSub = sub.replace(/^[\\/]+/, "");
  return `${trimmedBase}${sep}${trimmedSub}`;
}
