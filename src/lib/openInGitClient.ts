import { api } from "@/api";

export async function openInGitClient(
  client: string,
  repoPath: string,
): Promise<void> {
  try {
    await api.openInGitClient(client, repoPath);
  } catch (err) {
    console.error("open_in_git_client failed", err);
    alert(String(err));
  }
}
