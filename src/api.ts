import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  CommitInfo,
  Contributor,
  HeatmapData,
  LanguageStat,
  RepoSummary,
  Repository,
  TimelineGranularity,
  TimelinePoint,
} from "./types";

export const api = {
  listRepositories: () => invoke<Repository[]>("list_repositories"),
  addRepository: (path: string) => invoke<Repository>("add_repository", { path }),
  removeRepository: (id: number) => invoke<void>("remove_repository", { id }),
  scanFolder: (folder: string) => invoke<Repository[]>("scan_folder", { folder }),
  getRepoSummary: (id: number) => invoke<RepoSummary>("get_repo_summary", { id }),
  getCommitHeatmap: (id: number, year: number) =>
    invoke<HeatmapData>("get_commit_heatmap", { id, year }),
  getCommitTimeline: (id: number, granularity: TimelineGranularity) =>
    invoke<TimelinePoint[]>("get_commit_timeline", { id, granularity }),
  getTopContributors: (id: number, limit: number) =>
    invoke<Contributor[]>("get_top_contributors", { id, limit }),
  getRecentCommits: (id: number, limit: number) =>
    invoke<CommitInfo[]>("get_recent_commits", { id, limit }),
  getLanguageBreakdown: (id: number) =>
    invoke<LanguageStat[]>("get_language_breakdown", { id }),
};

export async function pickRepositoryDir(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

export async function pickScanRoot(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}
