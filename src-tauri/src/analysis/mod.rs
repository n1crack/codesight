use std::path::Path;

use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use git2::{Repository as GitRepository, Sort};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::repo::Repository;

pub mod activity;
pub mod contributor;
pub mod global;
pub mod graph;
pub mod imports;
pub mod insights;
pub mod quality;

pub use activity::*;
pub use contributor::*;
pub use global::*;
pub use graph::*;
pub use imports::*;
pub use insights::*;
pub use quality::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoSummary {
    pub repo: Repository,
    pub total_commits: usize,
    pub contributor_count: usize,
    pub branch_count: usize,
    pub first_commit_at: Option<String>,
    pub last_commit_at: Option<String>,
    pub head_branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapDay {
    pub date: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapData {
    pub year: i32,
    pub days: Vec<HeatmapDay>,
    pub max_count: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelinePoint {
    pub bucket: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contributor {
    pub name: String,
    pub email: String,
    pub commits: u32,
    pub first_commit_at: String,
    pub last_commit_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageStat {
    pub language: String,
    pub files: u32,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub id: String,
    pub short_id: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChurnPoint {
    pub bucket: String,
    pub additions: u32,
    pub deletions: u32,
    pub commits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHotspot {
    pub path: String,
    pub commits: u32,
    pub additions: u32,
    pub deletions: u32,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityPatterns {
    pub by_hour: [u32; 24],
    pub by_dow: [u32; 7],
    pub matrix: Vec<Vec<u32>>,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitMessageStats {
    pub total: u32,
    pub avg_subject_length: f32,
    pub conventional_total: u32,
    pub no_type_count: u32,
    pub types: Vec<(String, u32)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagInfo {
    pub name: String,
    pub target_oid: String,
    pub tagger_name: Option<String>,
    pub timestamp: Option<String>,
    pub message: Option<String>,
    pub commits_since_previous: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoSparkline {
    pub repo_id: i64,
    pub days: Vec<u32>,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub is_remote: bool,
    pub last_commit: Option<CommitInfo>,
    pub ahead: u32,
    pub behind: u32,
    pub unique_commits: u32,
    pub risk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContributorDetail {
    pub name: String,
    pub email: String,
    pub total_commits: u32,
    pub additions: u32,
    pub deletions: u32,
    pub first_commit_at: Option<String>,
    pub last_commit_at: Option<String>,
    pub active_days: u32,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub query: Option<String>,
    pub author_email: Option<String>,
    pub since: Option<String>,
    pub until: Option<String>,
    pub path: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorShare {
    pub name: String,
    pub email: String,
    pub commits: u32,
    pub additions: u32,
    pub deletions: u32,
    pub share_pct: f32,
    pub last_commit_at: Option<String>,
    pub days_since_last: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OwnershipAlert {
    #[serde(rename_all = "camelCase")]
    BusFactorOne { author_name: String, author_email: String },
    #[serde(rename_all = "camelCase")]
    HighConcentration { count: u32, threshold_pct: u32 },
    #[serde(rename_all = "camelCase")]
    Alumni { count: u32, days: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOwnership {
    pub path: String,
    pub primary_name: String,
    pub primary_email: String,
    pub primary_share_pct: f32,
    pub distinct_authors: u32,
    pub total_commits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnershipReport {
    pub bus_factor: u32,
    pub total_authors: u32,
    pub top_authors: Vec<AuthorShare>,
    pub files: Vec<FileOwnership>,
    pub alerts: Vec<OwnershipAlert>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChurnRiskFile {
    pub path: String,
    pub commits: u32,
    pub primary_name: String,
    pub primary_email: String,
    pub primary_share_pct: f32,
    pub last_touched: String,
    pub days_since_last: i64,
    pub risk_score: f32,
    pub risk_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContributorCohortPoint {
    pub bucket: String,
    pub active: u32,
    pub new_authors: u32,
    pub returning: u32,
    pub leaving: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoauthorPair {
    pub a_name: String,
    pub a_email: String,
    pub b_name: String,
    pub b_email: String,
    pub joint_commits: u32,
    pub last_collab_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageShare {
    pub language: String,
    pub files: u32,
    pub bytes_changed: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryShare {
    pub path: String,
    pub commits: u32,
    pub bytes_changed: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorSpecialization {
    pub email: String,
    pub top_languages: Vec<LanguageShare>,
    pub top_directories: Vec<DirectoryShare>,
    pub total_files_touched: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretHit {
    pub path: String,
    pub line: u32,
    pub pattern_name: String,
    pub severity: String, // "high" | "medium"
    pub masked: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskyFile {
    pub path: String,
    pub reason: String,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoHit {
    pub path: String,
    pub line: u32,
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceCheck {
    pub present: bool,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitignoreCoverage {
    pub env_files: bool,
    pub node_modules: bool,
    pub target: bool,
    pub dist_build: bool,
    pub ide: bool,
    pub os_files: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitignoreCheck {
    pub present: bool,
    pub path: Option<String>,
    pub line_count: u32,
    pub covers: GitignoreCoverage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoHygieneReport {
    pub gitignore: GitignoreCheck,
    pub license: PresenceCheck,
    pub readme: PresenceCheck,
    pub contributing: PresenceCheck,
    pub security_md: PresenceCheck,
    pub code_of_conduct: PresenceCheck,
    pub editorconfig: PresenceCheck,
    pub ci_config: PresenceCheck,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepManifest {
    pub kind: String,
    pub manifest_path: String,
    pub lockfile_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependenciesReport {
    pub manifests: Vec<DepManifest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictHit {
    pub path: String,
    pub line: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedFile {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFile {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeHygieneReport {
    pub todos: Vec<TodoHit>,
    pub todo_count: u32,
    pub conflict_markers: Vec<ConflictHit>,
    pub generated_files: Vec<GeneratedFile>,
    pub large_files: Vec<LargeFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorshipReport {
    pub total_commits: u32,
    pub bot_commits: u32,
    pub bot_share_pct: f32,
    pub signed_commits: u32,
    pub signed_share_pct: f32,
    pub generic_email_authors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretsHeadReport {
    pub hits: Vec<SecretHit>,
    pub risky_files: Vec<RiskyFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityReport {
    pub repo_hygiene: RepoHygieneReport,
    pub secrets_head: SecretsHeadReport,
    pub dependencies: DependenciesReport,
    pub code_hygiene: CodeHygieneReport,
    pub authorship: AuthorshipReport,
    pub files_scanned: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySecretHit {
    pub blob_oid: String,
    pub commit_oid: String,
    pub commit_short_id: String,
    pub commit_date: String,
    pub author_name: String,
    pub author_email: String,
    pub path: String,
    pub line: u32,
    pub pattern_name: String,
    pub severity: String,
    pub masked: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySecretReport {
    pub hits: Vec<HistorySecretHit>,
    pub commits_scanned: u32,
    pub blobs_scanned: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphCommit {
    pub id: String,
    pub short_id: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: String,
    pub summary: String,
    pub refs: Vec<GraphRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRef {
    pub kind: String, // "head" | "remote" | "tag" | "HEAD"
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub origin: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePatch {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub status: String,
    pub insertions: u32,
    pub deletions: u32,
    pub is_binary: bool,
    pub hunks: Vec<Hunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub id: String,
    pub short_id: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub committer_name: String,
    pub committer_email: String,
    pub timestamp: String,
    pub summary: String,
    pub message: String,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
    pub files: Vec<FilePatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalRecentCommit {
    pub commit: CommitInfo,
    pub repo_id: i64,
    pub repo_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSummary {
    pub repo_count: u32,
    pub total_commits: u32,
    pub commits_last_30_days: u32,
    pub active_repos_last_30_days: u32,
    pub author_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCoupling {
    pub file_a: String,
    pub file_b: String,
    pub joint_changes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryHotspot {
    pub path: String,
    pub commits: u32,
    pub additions: u32,
    pub deletions: u32,
    pub files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HealthDetail {
    #[serde(rename_all = "camelCase")]
    Recency { days_since_last: Option<i64> },
    #[serde(rename_all = "camelCase")]
    Volume { commits_in_last90: u32 },
    #[serde(rename_all = "camelCase")]
    BusFactor { value: u32 },
    #[serde(rename_all = "camelCase")]
    Branches { stale: u32, local: u32 },
    #[serde(rename_all = "camelCase")]
    Docs {
        has_readme: bool,
        has_docs_dir: bool,
        has_tests: bool,
    },
    #[serde(rename_all = "camelCase")]
    Conventional { pct: f32, subjects: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSubScore {
    pub key: String,
    pub score: u32,
    pub max: u32,
    pub detail: HealthDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoHealth {
    pub score: u32,
    pub max: u32,
    pub sub_scores: Vec<HealthSubScore>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNode {
    pub path: String,
    pub language: String,
    pub in_degree: u32,
    pub out_degree: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEdge {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportGraph {
    pub nodes: Vec<ImportNode>,
    pub edges: Vec<ImportEdge>,
    pub files_scanned: u32,
    pub external_imports: u32,
}

// ---------- shared helpers ----------

pub(crate) fn open(path: &str) -> AppResult<GitRepository> {
    GitRepository::open(path).map_err(|_| AppError::NotARepo(path.into()))
}

pub(crate) fn current_head(repo_path: &str) -> String {
    let Ok(repo) = GitRepository::open(repo_path) else {
        return "empty".into();
    };
    match repo.head().ok().and_then(|h| h.target()) {
        Some(oid) => oid.to_string(),
        None => "empty".into(),
    }
}

/// HEAD-keyed cache wrapper.
/// Returns cached result if HEAD hasn't changed since last computation; otherwise computes,
/// stores, and returns. Cache lives in `analysis_cache` SQLite table, JSON-encoded.
pub(crate) fn cached<T, F>(
    db: &crate::db::Db,
    repo_id: i64,
    head: &str,
    key: &str,
    compute: F,
) -> AppResult<T>
where
    T: Serialize + DeserializeOwned,
    F: FnOnce() -> AppResult<T>,
{
    if let Some(bytes) = db.get_cached(repo_id, key, head)? {
        if let Ok(value) = serde_json::from_slice::<T>(&bytes) {
            return Ok(value);
        }
        // corrupted cache → fall through and recompute
    }

    let value = compute()?;
    let bytes = serde_json::to_vec(&value)?;
    let _ = db.put_cached(repo_id, key, head, &bytes);
    Ok(value)
}

pub(crate) fn commit_time(commit: &git2::Commit<'_>) -> DateTime<Utc> {
    let secs = commit.time().seconds();
    Utc.timestamp_opt(secs, 0).single().unwrap_or_else(Utc::now)
}

pub(crate) fn walk(repo: &GitRepository) -> AppResult<git2::Revwalk<'_>> {
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME)?;
    walk.push_glob("refs/heads/*")?;
    Ok(walk)
}

pub(crate) fn walk_diffs<F>(repo: &GitRepository, on_diff: F) -> AppResult<()>
where
    F: FnMut(&git2::Commit<'_>, &git2::Diff<'_>) -> AppResult<()>,
{
    walk_diffs_since(repo, None, on_diff)
}

pub(crate) fn walk_diffs_since<F>(
    repo: &GitRepository,
    since: Option<DateTime<Utc>>,
    mut on_diff: F,
) -> AppResult<()>
where
    F: FnMut(&git2::Commit<'_>, &git2::Diff<'_>) -> AppResult<()>,
{
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME)?;
    walk.push_glob("refs/heads/*")?;
    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.ignore_filemode(true).ignore_whitespace(false);

    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        if let Some(s) = since {
            if commit_time(&commit) < s {
                // Sort::TIME → newer first; once below cutoff, all subsequent are older
                break;
            }
        }
        let new_tree = commit.tree()?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
        let diff = repo.diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&new_tree),
            Some(&mut diff_opts),
        )?;
        on_diff(&commit, &diff)?;
    }
    Ok(())
}

pub(crate) fn bucket_key(ts: DateTime<Utc>, granularity: &str) -> String {
    use chrono::Datelike;
    match granularity {
        "day" => ts.format("%Y-%m-%d").to_string(),
        "month" => ts.format("%Y-%m").to_string(),
        _ => {
            let iso = ts.date_naive().iso_week();
            format!("{}-W{:02}", iso.year(), iso.week())
        }
    }
}

pub(crate) fn parse_date(s: &str) -> Option<DateTime<Utc>> {
    if let Ok(d) = DateTime::parse_from_rfc3339(s) {
        return Some(d.with_timezone(&Utc));
    }
    if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        if let Some(dt) = d.and_hms_opt(0, 0, 0) {
            return Utc.from_local_datetime(&dt).single();
        }
    }
    None
}

const CONVENTIONAL_TYPES: &[&str] = &[
    "feat", "fix", "refactor", "docs", "test", "chore", "style", "perf", "build", "ci", "revert",
];

pub(crate) fn classify_subject(subject: &str) -> Option<&'static str> {
    let trimmed = subject.trim_start();
    let prefix_end = trimmed
        .find(|c: char| c == '(' || c == ':' || c == ' ' || c == '!')
        .unwrap_or(0);
    if prefix_end == 0 {
        return None;
    }
    let prefix = &trimmed[..prefix_end].to_ascii_lowercase();
    CONVENTIONAL_TYPES
        .iter()
        .find(|t| **t == prefix)
        .copied()
}

pub(crate) fn classify_language(filename: &str) -> &'static str {
    let p = Path::new(filename);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase());
    match ext.as_deref() {
        Some("rs") => "Rust",
        Some("ts") | Some("tsx") => "TypeScript",
        Some("js") | Some("jsx") | Some("mjs") | Some("cjs") => "JavaScript",
        Some("py") => "Python",
        Some("go") => "Go",
        Some("java") => "Java",
        Some("kt") | Some("kts") => "Kotlin",
        Some("swift") => "Swift",
        Some("c") | Some("h") => "C",
        Some("cpp") | Some("cc") | Some("cxx") | Some("hpp") | Some("hh") => "C++",
        Some("cs") => "C#",
        Some("rb") => "Ruby",
        Some("php") => "PHP",
        Some("scala") => "Scala",
        Some("sh") | Some("bash") | Some("zsh") => "Shell",
        Some("html") | Some("htm") => "HTML",
        Some("css") | Some("scss") | Some("sass") => "CSS",
        Some("json") => "JSON",
        Some("yml") | Some("yaml") => "YAML",
        Some("toml") => "TOML",
        Some("md") | Some("markdown") => "Markdown",
        Some("sql") => "SQL",
        Some("vue") => "Vue",
        Some("svelte") => "Svelte",
        Some("dart") => "Dart",
        Some("lua") => "Lua",
        Some("r") => "R",
        Some("ex") | Some("exs") => "Elixir",
        Some("erl") => "Erlang",
        Some("hs") => "Haskell",
        Some("ml") | Some("mli") => "OCaml",
        Some("clj") => "Clojure",
        Some("zig") => "Zig",
        _ => "Other",
    }
}
