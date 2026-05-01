import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  ActivityPatterns,
  BranchInfo,
  ChurnPoint,
  Tag,
  TagColor,
  TagWithStats,
  CommitInfo,
  CommitMessageStats,
  Contributor,
  ChurnRiskFile,
  CoauthorPair,
  CommitDetail,
  ContributorCohortPoint,
  ContributorDetail,
  DirectoryHotspot,
  FileCoupling,
  FileHotspot,
  GlobalRecentCommit,
  GlobalSummary,
  GraphCommit,
  HeatmapData,
  LanguageStat,
  OwnershipReport,
  RepoHealth,
  RepoSparkline,
  RepoSummary,
  Repository,
  SearchParams,
  TagInfo,
  TimelineGranularity,
  TimelinePoint,
} from "./types";

export const api = {
  listRepositories: () => invoke<Repository[]>("list_repositories"),
  addRepository: (path: string) => invoke<Repository>("add_repository", { path }),
  removeRepository: (id: number) => invoke<void>("remove_repository", { id }),
  refreshRepo: (id: number) => invoke<void>("refresh_repo", { id }),
  // Repo tags (organization labels)
  listRepoTags: () => invoke<TagWithStats[]>("list_repo_tags"),
  createTag: (name: string, color: TagColor) =>
    invoke<Tag>("create_tag", { name, color }),
  updateTag: (id: number, patch: { name?: string; color?: TagColor }) =>
    invoke<void>("update_tag", {
      id,
      name: patch.name ?? null,
      color: patch.color ?? null,
    }),
  deleteTag: (id: number) => invoke<void>("delete_tag", { id }),
  assignTag: (repoId: number, tagId: number) =>
    invoke<void>("assign_tag", { repoId, tagId }),
  unassignTag: (repoId: number, tagId: number) =>
    invoke<void>("unassign_tag", { repoId, tagId }),
  setTagRepos: (tagId: number, repoIds: number[]) =>
    invoke<void>("set_tag_repos", { tagId, repoIds }),
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
  getCodeChurn: (id: number, granularity: TimelineGranularity) =>
    invoke<ChurnPoint[]>("get_code_churn", { id, granularity }),
  getFileHotspots: (id: number, limit: number, since?: string | null) =>
    invoke<FileHotspot[]>("get_file_hotspots", { id, limit, since: since ?? null }),
  getActivityPatterns: (id: number) =>
    invoke<ActivityPatterns>("get_activity_patterns", { id }),
  getCommitMessageStats: (id: number, since?: string | null) =>
    invoke<CommitMessageStats>("get_commit_message_stats", {
      id,
      since: since ?? null,
    }),
  listTags: (id: number) => invoke<TagInfo[]>("list_tags", { id }),
  getReposSparklines: (days: number) =>
    invoke<RepoSparkline[]>("get_repos_sparklines", { days }),
  listBranches: (id: number) => invoke<BranchInfo[]>("list_branches", { id }),
  getContributorDetail: (id: number, email: string) =>
    invoke<ContributorDetail>("get_contributor_detail", { id, email }),
  getContributorHeatmap: (id: number, email: string, year: number) =>
    invoke<HeatmapData>("get_contributor_heatmap", { id, email, year }),
  getContributorTopFiles: (id: number, email: string, limit: number) =>
    invoke<FileHotspot[]>("get_contributor_top_files", { id, email, limit }),
  getContributorRecentCommits: (id: number, email: string, limit: number) =>
    invoke<CommitInfo[]>("get_contributor_recent_commits", {
      id,
      email,
      limit,
    }),
  searchCommits: (id: number, params: SearchParams) =>
    invoke<CommitInfo[]>("search_commits", { id, params }),
  getOwnershipReport: (id: number, since?: string | null) =>
    invoke<OwnershipReport>("get_ownership_report", {
      id,
      since: since ?? null,
    }),
  getCommitGraph: (id: number, limit: number) =>
    invoke<GraphCommit[]>("get_commit_graph", { id, limit }),
  getCommitDetail: (id: number, oid: string) =>
    invoke<CommitDetail>("get_commit_detail", { id, oid }),
  getGlobalSummary: (email?: string | null, tagId?: number | null) =>
    invoke<GlobalSummary>("get_global_summary", {
      email: email ?? null,
      tagId: tagId ?? null,
    }),
  getGlobalHeatmap: (
    year: number,
    email?: string | null,
    tagId?: number | null,
  ) =>
    invoke<HeatmapData>("get_global_heatmap", {
      year,
      email: email ?? null,
      tagId: tagId ?? null,
    }),
  getGlobalRecentCommits: (
    limit: number,
    email?: string | null,
    tagId?: number | null,
  ) =>
    invoke<GlobalRecentCommit[]>("get_global_recent_commits", {
      limit,
      email: email ?? null,
      tagId: tagId ?? null,
    }),
  listKnownAuthors: (tagId?: number | null) =>
    invoke<Contributor[]>("list_known_authors", { tagId: tagId ?? null }),
  getCoauthorPairs: (id: number, limit: number) =>
    invoke<CoauthorPair[]>("get_coauthor_pairs", { id, limit }),
  getFileCouplings: (id: number, limit: number, since?: string | null) =>
    invoke<FileCoupling[]>("get_file_couplings", {
      id,
      limit,
      since: since ?? null,
    }),
  getDirectoryHotspots: (
    id: number,
    maxDepth: number,
    limit: number,
    since?: string | null,
  ) =>
    invoke<DirectoryHotspot[]>("get_directory_hotspots", {
      id,
      maxDepth,
      limit,
      since: since ?? null,
    }),
  getRepoHealth: (id: number) => invoke<RepoHealth>("get_repo_health", { id }),
  getChurnRisk: (id: number, limit: number, since?: string | null) =>
    invoke<ChurnRiskFile[]>("get_churn_risk", {
      id,
      limit,
      since: since ?? null,
    }),
  getContributorCohort: (id: number) =>
    invoke<ContributorCohortPoint[]>("get_contributor_cohort", { id }),
};

export async function pickRepositoryDir(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

export async function pickScanRoot(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}
