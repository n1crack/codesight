export interface Repository {
  id: number;
  name: string;
  path: string;
  added_at: string;
  last_indexed_at: string | null;
}

export interface RepoSummary {
  repo: Repository;
  total_commits: number;
  contributor_count: number;
  branch_count: number;
  first_commit_at: string | null;
  last_commit_at: string | null;
  head_branch: string | null;
}

export interface HeatmapDay {
  date: string;
  count: number;
}

export interface HeatmapData {
  year: number;
  days: HeatmapDay[];
  max_count: number;
  total: number;
}

export interface TimelinePoint {
  bucket: string;
  count: number;
}

export interface Contributor {
  name: string;
  email: string;
  commits: number;
  firstCommitAt: string;
  lastCommitAt: string;
}

export interface LanguageStat {
  language: string;
  files: number;
  bytes: number;
}

export interface CommitInfo {
  id: string;
  shortId: string;
  authorName: string;
  authorEmail: string;
  timestamp: string;
  summary: string;
}

export type TimelineGranularity = "day" | "week" | "month";
