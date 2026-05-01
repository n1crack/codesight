export type TagColor =
  | "slate"
  | "red"
  | "orange"
  | "amber"
  | "emerald"
  | "sky"
  | "indigo"
  | "fuchsia";

export interface Tag {
  id: number;
  name: string;
  color: TagColor;
  sort_order: number;
}

export interface TagWithStats {
  id: number;
  name: string;
  color: TagColor;
  sortOrder: number;
  repoCount: number;
}

export interface Repository {
  id: number;
  name: string;
  path: string;
  added_at: string;
  last_indexed_at: string | null;
  tags: Tag[];
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

export type BranchRisk = "none" | "low" | "medium" | "high";

export interface BranchInfo {
  name: string;
  isHead: boolean;
  isRemote: boolean;
  lastCommit: CommitInfo | null;
  ahead: number;
  behind: number;
  uniqueCommits: number;
  risk: BranchRisk;
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
  lastCommitAt: string | null;
  daysSinceLast: number | null;
}

export type OwnershipAlert =
  | { kind: "busFactorOne"; authorName: string; authorEmail: string }
  | { kind: "highConcentration"; count: number; thresholdPct: number }
  | { kind: "alumni"; count: number; days: number };

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
  alerts: OwnershipAlert[];
}

export type ChurnRiskLevel = "low" | "medium" | "high";

export interface ChurnRiskFile {
  path: string;
  commits: number;
  primaryName: string;
  primaryEmail: string;
  primarySharePct: number;
  lastTouched: string;
  daysSinceLast: number;
  riskScore: number;
  riskLevel: ChurnRiskLevel;
}

export interface ContributorCohortPoint {
  bucket: string;
  active: number;
  newAuthors: number;
  returning: number;
  leaving: number;
}

export interface CoauthorPair {
  aName: string;
  aEmail: string;
  bName: string;
  bEmail: string;
  jointCommits: number;
  lastCollabAt: string;
}

export interface GraphRef {
  kind: "HEAD" | "head" | "remote" | "tag";
  name: string;
}

export interface GraphCommit {
  id: string;
  shortId: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  timestamp: string;
  summary: string;
  refs: GraphRef[];
}

export interface DiffLine {
  origin: string;
  oldLineno: number | null;
  newLineno: number | null;
  content: string;
}

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface FilePatch {
  oldPath: string | null;
  newPath: string | null;
  status: string;
  insertions: number;
  deletions: number;
  isBinary: boolean;
  hunks: Hunk[];
}

export interface CommitDetail {
  id: string;
  shortId: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  timestamp: string;
  summary: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: FilePatch[];
}

export interface GlobalSummary {
  repoCount: number;
  totalCommits: number;
  commitsLast30Days: number;
  activeReposLast30Days: number;
  authorCount: number;
}

export interface GlobalRecentCommit {
  commit: CommitInfo;
  repoId: number;
  repoName: string;
}

export interface FileCoupling {
  fileA: string;
  fileB: string;
  jointChanges: number;
}

export interface DirectoryHotspot {
  path: string;
  commits: number;
  additions: number;
  deletions: number;
  files: number;
}

export type HealthDetail =
  | { kind: "recency"; daysSinceLast: number | null }
  | { kind: "volume"; commitsInLast90: number }
  | { kind: "busFactor"; value: number }
  | { kind: "branches"; stale: number; local: number }
  | {
      kind: "docs";
      hasReadme: boolean;
      hasDocsDir: boolean;
      hasTests: boolean;
    }
  | { kind: "conventional"; pct: number; subjects: number };

export interface HealthSubScore {
  key: string;
  score: number;
  max: number;
  detail: HealthDetail;
}

export interface RepoHealth {
  score: number;
  max: number;
  subScores: HealthSubScore[];
}
