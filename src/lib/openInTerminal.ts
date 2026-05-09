import { api } from "@/api";

export async function openInTerminal(
  terminal: string,
  repoPath: string,
): Promise<void> {
  try {
    await api.openInTerminal(terminal, repoPath);
  } catch (err) {
    console.error("open_in_terminal failed", err);
    alert(String(err));
  }
}
