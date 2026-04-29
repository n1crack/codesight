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

export interface ChurnPoint {
  bucket: string;
  additions: number;
  deletions: number;
  commits: number;
}

export interface FileHotspot {
  path: string;
  commits: number;
  additions: number;
  deletions: number;
  lastModified: string;
}

export type TimelineMetric = "commits" | "churn";

export interface ActivityPatterns {
  byHour: number[];
  byDow: number[];
  matrix: number[][];
  total: number;
}

export interface CommitMessageStats {
  total: number;
  avgSubjectLength: number;
  conventionalTotal: number;
  noTypeCount: number;
  types: Array<[string, number]>;
}

export interface TagInfo {
  name: string;
  targetOid: string;
  taggerName: string | null;
  timestamp: string | null;
  message: string | null;
  commitsSincePrevious: number | null;
}

export interface RepoSparkline {
  repoId: number;
  days: number[];
  total: number;
}

export interface BranchInfo {
  name: string;
  isHead: boolean;
  isRemote: boolean;
  lastCommit: CommitInfo | null;
  ahead: number;
  behind: number;
}

export interface ContributorDetail {
  name: string;
  email: string;
  totalCommits: number;
  additions: number;
  deletions: number;
  firstCommitAt: string | null;
  lastCommitAt: string | null;
  activeDays: number;
}

export interface SearchParams {
  query?: string;
  authorEmail?: string;
  since?: string;
  until?: string;
  path?: string;
  limit?: number;
}

export interface AuthorShare {
  name: string;
  email: string;
  commits: number;
  additions: number;
  deletions: number;
  sharePct: number;
}

export interface FileOwnership {
  path: string;
  primaryName: string;
  primaryEmail: string;
  primarySharePct: number;
  distinctAuthors: number;
  totalCommits: number;
}

export interface OwnershipReport {
  busFactor: number;
  totalAuthors: number;
  topAuthors: AuthorShare[];
  files: FileOwnership[];
}
