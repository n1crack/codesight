use std::collections::{BTreeMap, HashMap};
use std::path::Path;

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Timelike, Utc};
use git2::{Repository as GitRepository, Sort};
use rayon::prelude::*;
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::repo::{get_repository_impl, Repository};

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

fn open(path: &str) -> AppResult<GitRepository> {
    GitRepository::open(path).map_err(|_| AppError::NotARepo(path.into()))
}

fn current_head(repo_path: &str) -> String {
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
fn cached<T, F>(
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

fn commit_time(commit: &git2::Commit<'_>) -> DateTime<Utc> {
    let secs = commit.time().seconds();
    Utc.timestamp_opt(secs, 0).single().unwrap_or_else(Utc::now)
}

fn walk(repo: &GitRepository) -> AppResult<git2::Revwalk<'_>> {
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME)?;
    walk.push_glob("refs/heads/*")?;
    Ok(walk)
}

pub fn get_repo_summary_impl(db: &crate::db::Db, id: i64) -> AppResult<RepoSummary> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "summary", move || {
    let repo = open(&repo_meta.path)?;

    let mut total_commits = 0usize;
    let mut authors: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut first: Option<DateTime<Utc>> = None;
    let mut last: Option<DateTime<Utc>> = None;

    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        total_commits += 1;
        if let Some(email) = commit.author().email() {
            authors.insert(email.to_string());
        }
        let t = commit_time(&commit);
        first = Some(first.map_or(t, |f| f.min(t)));
        last = Some(last.map_or(t, |l| l.max(t)));
    }

    let mut branch_count = 0usize;
    for branch in repo.branches(Some(git2::BranchType::Local))? {
        if branch.is_ok() {
            branch_count += 1;
        }
    }

    let head_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from));

    Ok(RepoSummary {
        repo: repo_meta,
        total_commits,
        contributor_count: authors.len(),
        branch_count,
        first_commit_at: first.map(|d| d.to_rfc3339()),
        last_commit_at: last.map(|d| d.to_rfc3339()),
        head_branch,
    })
    })
}

pub fn get_commit_heatmap_impl(
    db: &crate::db::Db,
    id: i64,
    year: i32,
) -> AppResult<HeatmapData> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let key = format!("heatmap:{}", year);
    cached(db, id, &head, &key, move || {
    let repo = open(&repo_meta.path)?;

    let mut counts: HashMap<NaiveDate, u32> = HashMap::new();
    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        let ts = commit_time(&commit);
        if ts.year() != year {
            continue;
        }
        let date = ts.date_naive();
        *counts.entry(date).or_insert(0) += 1;
    }

    let start = NaiveDate::from_ymd_opt(year, 1, 1).ok_or_else(|| AppError::Other("bad year".into()))?;
    let end = NaiveDate::from_ymd_opt(year, 12, 31).ok_or_else(|| AppError::Other("bad year".into()))?;
    let mut days: Vec<HeatmapDay> = Vec::with_capacity(366);
    let mut total: u32 = 0;
    let mut max_count: u32 = 0;
    let mut d = start;
    loop {
        let c = counts.get(&d).copied().unwrap_or(0);
        total += c;
        if c > max_count {
            max_count = c;
        }
        days.push(HeatmapDay {
            date: d.format("%Y-%m-%d").to_string(),
            count: c,
        });
        if d == end {
            break;
        }
        d = match d.succ_opt() {
            Some(next) => next,
            None => break,
        };
    }

    Ok(HeatmapData {
        year,
        days,
        max_count,
        total,
    })
    })
}

pub fn get_commit_timeline_impl(
    db: &crate::db::Db,
    id: i64,
    granularity: &str,
) -> AppResult<Vec<TimelinePoint>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("timeline:{}", granularity);
    let granularity = granularity.to_string();
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    let mut buckets: std::collections::BTreeMap<String, u32> = std::collections::BTreeMap::new();
    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        let ts = commit_time(&commit);
        let key = match granularity.as_str() {
            "day" => ts.format("%Y-%m-%d").to_string(),
            "month" => ts.format("%Y-%m").to_string(),
            _ => {
                let d = ts.date_naive();
                let iso = d.iso_week();
                format!("{}-W{:02}", iso.year(), iso.week())
            }
        };
        *buckets.entry(key).or_insert(0) += 1;
    }

    Ok(buckets
        .into_iter()
        .map(|(bucket, count)| TimelinePoint { bucket, count })
        .collect())
    })
}

pub fn get_top_contributors_impl(
    db: &crate::db::Db,
    id: i64,
    limit: usize,
) -> AppResult<Vec<Contributor>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("topContributors:{}", limit);
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    struct Acc {
        name: String,
        commits: u32,
        first: DateTime<Utc>,
        last: DateTime<Utc>,
    }
    let mut by_email: HashMap<String, Acc> = HashMap::new();
    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();

    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        let author = commit.author();
        let email = author.email().unwrap_or("unknown@local").to_string();
        let name = author.name().unwrap_or("unknown").to_string();
        let t = commit_time(&commit);

        by_email
            .entry(email)
            .and_modify(|a| {
                a.commits += 1;
                if t < a.first {
                    a.first = t;
                }
                if t > a.last {
                    a.last = t;
                }
            })
            .or_insert(Acc {
                name,
                commits: 1,
                first: t,
                last: t,
            });
    }

    let mut list: Vec<Contributor> = by_email
        .into_iter()
        .map(|(email, a)| Contributor {
            name: a.name,
            email,
            commits: a.commits,
            first_commit_at: a.first.to_rfc3339(),
            last_commit_at: a.last.to_rfc3339(),
        })
        .collect();

    list.sort_by(|a, b| b.commits.cmp(&a.commits));
    list.truncate(limit);
    Ok(list)
    })
}

pub fn get_recent_commits_impl(
    db: &crate::db::Db,
    id: i64,
    limit: usize,
) -> AppResult<Vec<CommitInfo>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("recentCommits:{}", limit);
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    let mut out = Vec::with_capacity(limit);
    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        let ts = commit_time(&commit);
        let id_str = oid.to_string();
        let short_id = id_str.chars().take(7).collect();
        out.push(CommitInfo {
            id: id_str,
            short_id,
            author_name: commit.author().name().unwrap_or("unknown").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            timestamp: ts.to_rfc3339(),
            summary: commit.summary().unwrap_or("").to_string(),
        });
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
    })
}

pub fn get_language_breakdown_impl(
    db: &crate::db::Db,
    id: i64,
) -> AppResult<Vec<LanguageStat>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "languages", move || {
    let repo = open(&repo_meta.path)?;

    let repo_head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok(Vec::new()),
    };
    let tree = repo_head.peel_to_tree()?;

    let mut stats: HashMap<&'static str, (u32, u64)> = HashMap::new();
    tree.walk(git2::TreeWalkMode::PreOrder, |_root, entry| {
        if entry.kind() == Some(git2::ObjectType::Blob) {
            if let Some(name) = entry.name() {
                let lang = classify_language(name);
                let size = entry
                    .to_object(&repo)
                    .ok()
                    .and_then(|o| o.peel_to_blob().ok())
                    .map(|b| b.size() as u64)
                    .unwrap_or(0);
                let e = stats.entry(lang).or_insert((0, 0));
                e.0 += 1;
                e.1 += size;
            }
        }
        git2::TreeWalkResult::Ok
    })?;

    let mut out: Vec<LanguageStat> = stats
        .into_iter()
        .map(|(lang, (files, bytes))| LanguageStat {
            language: lang.to_string(),
            files,
            bytes,
        })
        .collect();
    out.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    Ok(out)
    })
}

fn bucket_key(ts: DateTime<Utc>, granularity: &str) -> String {
    match granularity {
        "day" => ts.format("%Y-%m-%d").to_string(),
        "month" => ts.format("%Y-%m").to_string(),
        _ => {
            let iso = ts.date_naive().iso_week();
            format!("{}-W{:02}", iso.year(), iso.week())
        }
    }
}

fn walk_diffs<F>(repo: &GitRepository, mut on_diff: F) -> AppResult<()>
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

pub fn get_code_churn_impl(
    db: &crate::db::Db,
    id: i64,
    granularity: &str,
) -> AppResult<Vec<ChurnPoint>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("churn:{}", granularity);
    let granularity = granularity.to_string();
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    let mut buckets: BTreeMap<String, (u32, u32, u32)> = BTreeMap::new();
    walk_diffs(&repo, |commit, diff| {
        let stats = diff.stats()?;
        let key = bucket_key(commit_time(commit), &granularity);
        let entry = buckets.entry(key).or_insert((0, 0, 0));
        entry.0 = entry.0.saturating_add(stats.insertions() as u32);
        entry.1 = entry.1.saturating_add(stats.deletions() as u32);
        entry.2 = entry.2.saturating_add(1);
        Ok(())
    })?;

    Ok(buckets
        .into_iter()
        .map(|(bucket, (additions, deletions, commits))| ChurnPoint {
            bucket,
            additions,
            deletions,
            commits,
        })
        .collect())
    })
}

pub fn get_file_hotspots_impl(
    db: &crate::db::Db,
    id: i64,
    limit: usize,
) -> AppResult<Vec<FileHotspot>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("fileHotspots:{}", limit);
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    struct Acc {
        commits: u32,
        additions: u32,
        deletions: u32,
        last: DateTime<Utc>,
    }
    let mut by_path: HashMap<String, Acc> = HashMap::new();

    walk_diffs(&repo, |commit, diff| {
        let ts = commit_time(commit);
        let delta_count = diff.deltas().len();
        for idx in 0..delta_count {
            let Some(delta) = diff.get_delta(idx) else {
                continue;
            };
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            if path.is_empty() {
                continue;
            }
            let (additions, deletions) = match git2::Patch::from_diff(diff, idx) {
                Ok(Some(patch)) => match patch.line_stats() {
                    Ok((_, a, d)) => (a as u32, d as u32),
                    Err(_) => (0, 0),
                },
                _ => (0, 0),
            };
            let acc = by_path.entry(path).or_insert(Acc {
                commits: 0,
                additions: 0,
                deletions: 0,
                last: ts,
            });
            acc.commits = acc.commits.saturating_add(1);
            acc.additions = acc.additions.saturating_add(additions);
            acc.deletions = acc.deletions.saturating_add(deletions);
            if ts > acc.last {
                acc.last = ts;
            }
        }
        Ok(())
    })?;

    let mut list: Vec<FileHotspot> = by_path
        .into_iter()
        .map(|(path, acc)| FileHotspot {
            path,
            commits: acc.commits,
            additions: acc.additions,
            deletions: acc.deletions,
            last_modified: acc.last.to_rfc3339(),
        })
        .collect();
    list.sort_by(|a, b| {
        b.commits
            .cmp(&a.commits)
            .then_with(|| (b.additions + b.deletions).cmp(&(a.additions + a.deletions)))
    });
    list.truncate(limit);
    Ok(list)
    })
}

pub fn get_activity_patterns_impl(
    db: &crate::db::Db,
    id: i64,
) -> AppResult<ActivityPatterns> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "activityPatterns", move || {
    let repo = open(&repo_meta.path)?;

    let mut by_hour = [0u32; 24];
    let mut by_dow = [0u32; 7];
    let mut matrix = vec![vec![0u32; 24]; 7];
    let mut total = 0u32;

    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        let ts = commit_time(&commit);
        let hour = ts.hour() as usize;
        let dow = (ts.weekday().num_days_from_monday()) as usize;
        if hour < 24 && dow < 7 {
            by_hour[hour] = by_hour[hour].saturating_add(1);
            by_dow[dow] = by_dow[dow].saturating_add(1);
            matrix[dow][hour] = matrix[dow][hour].saturating_add(1);
            total = total.saturating_add(1);
        }
    }

    Ok(ActivityPatterns {
        by_hour,
        by_dow,
        matrix,
        total,
    })
    })
}

const CONVENTIONAL_TYPES: &[&str] = &[
    "feat", "fix", "refactor", "docs", "test", "chore", "style", "perf", "build", "ci", "revert",
];

fn classify_subject(subject: &str) -> Option<&'static str> {
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

pub fn get_commit_message_stats_impl(
    db: &crate::db::Db,
    id: i64,
) -> AppResult<CommitMessageStats> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "messageStats", move || {
    let repo = open(&repo_meta.path)?;

    let mut total = 0u32;
    let mut subject_total_len: u64 = 0;
    let mut by_type: HashMap<&'static str, u32> = HashMap::new();
    let mut conventional_total = 0u32;
    let mut no_type = 0u32;

    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        let subject = commit.summary().unwrap_or("");
        total = total.saturating_add(1);
        subject_total_len = subject_total_len.saturating_add(subject.chars().count() as u64);
        match classify_subject(subject) {
            Some(t) => {
                conventional_total = conventional_total.saturating_add(1);
                *by_type.entry(t).or_insert(0) += 1;
            }
            None => no_type = no_type.saturating_add(1),
        }
    }

    let avg_subject_length = if total == 0 {
        0.0
    } else {
        subject_total_len as f32 / total as f32
    };

    let mut types: Vec<(String, u32)> = by_type
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect();
    types.sort_by(|a, b| b.1.cmp(&a.1));

    Ok(CommitMessageStats {
        total,
        avg_subject_length,
        conventional_total,
        no_type_count: no_type,
        types,
    })
    })
}

pub fn list_tags_impl(db: &crate::db::Db, id: i64) -> AppResult<Vec<TagInfo>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "tags", move || {
    let repo = open(&repo_meta.path)?;

    let mut tags: Vec<TagInfo> = Vec::new();
    let names = repo.tag_names(None)?;
    for name in names.iter().flatten() {
        let full_ref = format!("refs/tags/{}", name);
        let Ok(reference) = repo.find_reference(&full_ref) else {
            continue;
        };
        let target_obj = reference.peel(git2::ObjectType::Any)?;
        let target_commit = target_obj.peel_to_commit().ok();

        let (tagger_name, timestamp, message) = match repo.find_tag(reference.target().unwrap_or_else(|| target_obj.id())) {
            Ok(tag) => {
                let tagger = tag.tagger();
                let when_secs = tagger.as_ref().map(|s| s.when().seconds());
                let ts = when_secs
                    .and_then(|s| Utc.timestamp_opt(s, 0).single())
                    .map(|d| d.to_rfc3339());
                let name = tagger.as_ref().and_then(|s| s.name().map(String::from));
                let msg = tag.message().map(|s| s.to_string());
                (name, ts, msg)
            }
            Err(_) => {
                if let Some(c) = &target_commit {
                    let ts = commit_time(c).to_rfc3339();
                    let name = c.author().name().map(String::from);
                    let msg = c.summary().map(String::from);
                    (name, Some(ts), msg)
                } else {
                    (None, None, None)
                }
            }
        };

        tags.push(TagInfo {
            name: name.to_string(),
            target_oid: target_commit
                .as_ref()
                .map(|c| c.id().to_string())
                .unwrap_or_else(|| target_obj.id().to_string()),
            tagger_name,
            timestamp,
            message,
            commits_since_previous: None,
        });
    }

    tags.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    for i in 0..tags.len() {
        let target = tags[i].target_oid.clone();
        let prev = tags.get(i + 1).map(|t| t.target_oid.clone());
        let count = match git2::Oid::from_str(&target) {
            Ok(target_oid) => {
                let prev_oid = prev.and_then(|s| git2::Oid::from_str(&s).ok());
                count_commits_between(&repo, target_oid, prev_oid)?
            }
            Err(_) => 0,
        };
        tags[i].commits_since_previous = Some(count);
    }

    Ok(tags)
    })
}

fn count_commits_between(
    repo: &GitRepository,
    target: git2::Oid,
    base: Option<git2::Oid>,
) -> AppResult<u32> {
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME)?;
    walk.push(target)?;
    if let Some(b) = base {
        let _ = walk.hide(b);
    }
    let mut count = 0u32;
    for oid in walk {
        let _ = oid?;
        count = count.saturating_add(1);
    }
    Ok(count)
}

pub fn get_repos_sparklines_impl(
    db: &crate::db::Db,
    days: i64,
) -> AppResult<Vec<RepoSparkline>> {
    let repos = crate::repo::list_repositories_impl(db)?;
    let cutoff = Utc::now() - Duration::days(days);

    let result: Vec<RepoSparkline> = repos
        .into_par_iter()
        .map(|r| compute_sparkline(&r, cutoff, days as usize))
        .collect();

    Ok(result)
}

fn compute_sparkline(
    repo_meta: &crate::repo::Repository,
    cutoff: DateTime<Utc>,
    days: usize,
) -> RepoSparkline {
    let mut buckets = vec![0u32; days];
    let mut total = 0u32;
    let cutoff_date = cutoff.date_naive();

    if let Ok(repo) = GitRepository::open(&repo_meta.path) {
        if let Ok(mut walk) = repo.revwalk() {
            let _ = walk.set_sorting(Sort::TIME);
            let _ = walk.push_glob("refs/heads/*");
            let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
            for oid in walk.flatten() {
                if !seen.insert(oid) {
                    continue;
                }
                let Ok(commit) = repo.find_commit(oid) else {
                    continue;
                };
                let ts = Utc
                    .timestamp_opt(commit.time().seconds(), 0)
                    .single()
                    .unwrap_or_else(Utc::now);
                if ts < cutoff {
                    break;
                }
                let date = ts.date_naive();
                let day_diff = (date - cutoff_date).num_days() as i64;
                if day_diff >= 0 && (day_diff as usize) < days {
                    buckets[day_diff as usize] = buckets[day_diff as usize].saturating_add(1);
                    total = total.saturating_add(1);
                }
            }
        }
    }

    RepoSparkline {
        repo_id: repo_meta.id,
        days: buckets,
        total,
    }
}

pub fn list_branches_impl(db: &crate::db::Db, id: i64) -> AppResult<Vec<BranchInfo>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "branches", move || {
    let repo = open(&repo_meta.path)?;

    let head_oid = repo.head().ok().and_then(|h| h.target());

    // Collect all branch tip oids (local + remote) with names for unique-commit calculation
    let mut all_tips: Vec<(String, git2::Oid, bool, bool)> = Vec::new();
    for branch_result in repo.branches(None)? {
        let (branch, btype) = match branch_result {
            Ok(v) => v,
            Err(_) => continue,
        };
        let name = match branch.name() {
            Ok(Some(n)) => n.to_string(),
            _ => continue,
        };
        let is_remote = matches!(btype, git2::BranchType::Remote);
        let is_head = branch.is_head();
        if let Ok(commit) = branch.get().peel_to_commit() {
            all_tips.push((name, commit.id(), is_remote, is_head));
        }
    }

    let now = Utc::now();
    let mut out: Vec<BranchInfo> = Vec::with_capacity(all_tips.len());

    for (name, tip_oid, is_remote, is_head) in &all_tips {
        let commit_obj = repo.find_commit(*tip_oid).ok();
        let last_commit = commit_obj.as_ref().map(|c| {
            let oid_str = c.id().to_string();
            CommitInfo {
                id: oid_str.clone(),
                short_id: oid_str.chars().take(7).collect(),
                author_name: c.author().name().unwrap_or("unknown").to_string(),
                author_email: c.author().email().unwrap_or("").to_string(),
                timestamp: commit_time(c).to_rfc3339(),
                summary: c.summary().unwrap_or("").to_string(),
            }
        });

        let (ahead, behind) = match head_oid {
            Some(h) if *tip_oid != h => repo
                .graph_ahead_behind(*tip_oid, h)
                .map(|(a, b)| (a as u32, b as u32))
                .unwrap_or((0, 0)),
            _ => (0, 0),
        };

        // unique commits: reachable from this tip but no other tip
        let unique_commits = if let Ok(mut walk) = repo.revwalk() {
            let _ = walk.push(*tip_oid);
            for (_, other_oid, _, _) in &all_tips {
                if other_oid != tip_oid {
                    let _ = walk.hide(*other_oid);
                }
            }
            walk.flatten().count() as u32
        } else {
            0
        };

        // risk computation
        let stale = commit_obj
            .as_ref()
            .map(|c| {
                let bts = Utc
                    .timestamp_opt(c.time().seconds(), 0)
                    .single()
                    .unwrap_or_else(Utc::now);
                bts < (now - Duration::days(90))
            })
            .unwrap_or(false);

        let risk = if *is_head {
            "none"
        } else if stale && unique_commits >= 50 {
            "high"
        } else if stale && unique_commits >= 6 {
            "medium"
        } else if stale && unique_commits >= 1 {
            "low"
        } else {
            "none"
        };

        out.push(BranchInfo {
            name: name.clone(),
            is_head: *is_head,
            is_remote: *is_remote,
            last_commit,
            ahead,
            behind,
            unique_commits,
            risk: risk.into(),
        });
    }

    out.sort_by(|a, b| {
        b.is_head
            .cmp(&a.is_head)
            .then_with(|| {
                let ta = a.last_commit.as_ref().map(|c| c.timestamp.clone());
                let tb = b.last_commit.as_ref().map(|c| c.timestamp.clone());
                tb.cmp(&ta)
            })
    });

    Ok(out)
    })
}

pub fn get_contributor_detail_impl(
    db: &crate::db::Db,
    id: i64,
    email: &str,
) -> AppResult<ContributorDetail> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("contribDetail:{}", email);
    let email = email.to_string();
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    let mut name = String::new();
    let mut total_commits = 0u32;
    let mut additions = 0u32;
    let mut deletions = 0u32;
    let mut first: Option<DateTime<Utc>> = None;
    let mut last: Option<DateTime<Utc>> = None;
    let mut active_days: std::collections::HashSet<NaiveDate> = std::collections::HashSet::new();

    walk_diffs(&repo, |commit, diff| {
        let author_email = commit.author().email().unwrap_or("").to_string();
        if author_email != email {
            return Ok(());
        }
        if name.is_empty() {
            name = commit.author().name().unwrap_or("unknown").to_string();
        }
        let stats = diff.stats()?;
        let ts = commit_time(commit);
        total_commits = total_commits.saturating_add(1);
        additions = additions.saturating_add(stats.insertions() as u32);
        deletions = deletions.saturating_add(stats.deletions() as u32);
        first = Some(first.map_or(ts, |f| f.min(ts)));
        last = Some(last.map_or(ts, |l| l.max(ts)));
        active_days.insert(ts.date_naive());
        Ok(())
    })?;

    Ok(ContributorDetail {
        name,
        email,
        total_commits,
        additions,
        deletions,
        first_commit_at: first.map(|d| d.to_rfc3339()),
        last_commit_at: last.map(|d| d.to_rfc3339()),
        active_days: active_days.len() as u32,
    })
    })
}

pub fn get_contributor_heatmap_impl(
    db: &crate::db::Db,
    id: i64,
    email: &str,
    year: i32,
) -> AppResult<HeatmapData> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("contribHeatmap:{}:{}", email, year);
    let email = email.to_string();
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    let mut counts: HashMap<NaiveDate, u32> = HashMap::new();
    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        if commit.author().email().unwrap_or("") != email {
            continue;
        }
        let ts = commit_time(&commit);
        if ts.year() != year {
            continue;
        }
        *counts.entry(ts.date_naive()).or_insert(0) += 1;
    }

    let start = NaiveDate::from_ymd_opt(year, 1, 1)
        .ok_or_else(|| AppError::Other("bad year".into()))?;
    let end = NaiveDate::from_ymd_opt(year, 12, 31)
        .ok_or_else(|| AppError::Other("bad year".into()))?;

    let mut days: Vec<HeatmapDay> = Vec::with_capacity(366);
    let mut total = 0u32;
    let mut max_count = 0u32;
    let mut d = start;
    loop {
        let c = counts.get(&d).copied().unwrap_or(0);
        total += c;
        if c > max_count {
            max_count = c;
        }
        days.push(HeatmapDay {
            date: d.format("%Y-%m-%d").to_string(),
            count: c,
        });
        if d == end {
            break;
        }
        d = match d.succ_opt() {
            Some(next) => next,
            None => break,
        };
    }

    Ok(HeatmapData {
        year,
        days,
        max_count,
        total,
    })
    })
}

pub fn get_contributor_top_files_impl(
    db: &crate::db::Db,
    id: i64,
    email: &str,
    limit: usize,
) -> AppResult<Vec<FileHotspot>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("contribFiles:{}:{}", email, limit);
    let email = email.to_string();
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    struct Acc {
        commits: u32,
        additions: u32,
        deletions: u32,
        last: DateTime<Utc>,
    }
    let mut by_path: HashMap<String, Acc> = HashMap::new();

    walk_diffs(&repo, |commit, diff| {
        if commit.author().email().unwrap_or("") != email {
            return Ok(());
        }
        let ts = commit_time(commit);
        let delta_count = diff.deltas().len();
        for idx in 0..delta_count {
            let Some(delta) = diff.get_delta(idx) else {
                continue;
            };
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            if path.is_empty() {
                continue;
            }
            let (additions, deletions) = match git2::Patch::from_diff(diff, idx) {
                Ok(Some(p)) => match p.line_stats() {
                    Ok((_, a, d)) => (a as u32, d as u32),
                    Err(_) => (0, 0),
                },
                _ => (0, 0),
            };
            let acc = by_path.entry(path).or_insert(Acc {
                commits: 0,
                additions: 0,
                deletions: 0,
                last: ts,
            });
            acc.commits = acc.commits.saturating_add(1);
            acc.additions = acc.additions.saturating_add(additions);
            acc.deletions = acc.deletions.saturating_add(deletions);
            if ts > acc.last {
                acc.last = ts;
            }
        }
        Ok(())
    })?;

    let mut list: Vec<FileHotspot> = by_path
        .into_iter()
        .map(|(path, acc)| FileHotspot {
            path,
            commits: acc.commits,
            additions: acc.additions,
            deletions: acc.deletions,
            last_modified: acc.last.to_rfc3339(),
        })
        .collect();
    list.sort_by(|a, b| b.commits.cmp(&a.commits));
    list.truncate(limit);
    Ok(list)
    })
}

pub fn get_contributor_recent_commits_impl(
    db: &crate::db::Db,
    id: i64,
    email: &str,
    limit: usize,
) -> AppResult<Vec<CommitInfo>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("contribRecent:{}:{}", email, limit);
    let email = email.to_string();
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    let mut out = Vec::with_capacity(limit);
    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        if commit.author().email().unwrap_or("") != email {
            continue;
        }
        let ts = commit_time(&commit);
        let id_str = oid.to_string();
        let short_id = id_str.chars().take(7).collect();
        out.push(CommitInfo {
            id: id_str,
            short_id,
            author_name: commit.author().name().unwrap_or("unknown").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            timestamp: ts.to_rfc3339(),
            summary: commit.summary().unwrap_or("").to_string(),
        });
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
    })
}

fn parse_date(s: &str) -> Option<DateTime<Utc>> {
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

pub fn search_commits_impl(
    db: &crate::db::Db,
    id: i64,
    params: SearchParams,
) -> AppResult<Vec<CommitInfo>> {
    let repo_meta = get_repository_impl(db, id)?;
    let repo = open(&repo_meta.path)?;

    let limit = params.limit.unwrap_or(200).min(2000);
    let q = params.query.as_ref().map(|s| s.to_lowercase());
    let author = params.author_email.as_ref().map(|s| s.to_lowercase());
    let since = params.since.as_deref().and_then(parse_date);
    let until = params.until.as_deref().and_then(parse_date);
    let path = params.path.as_ref().map(|s| s.to_lowercase());

    let mut out = Vec::with_capacity(limit);
    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.ignore_filemode(true);

    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        let ts = commit_time(&commit);

        if let Some(s) = since {
            if ts < s {
                break;
            }
        }
        if let Some(u) = until {
            if ts > u {
                continue;
            }
        }

        if let Some(a) = &author {
            let email = commit
                .author()
                .email()
                .unwrap_or("")
                .to_lowercase();
            if !email.contains(a.as_str()) {
                continue;
            }
        }

        if let Some(needle) = &q {
            let summary = commit.summary().unwrap_or("").to_lowercase();
            if !summary.contains(needle.as_str()) {
                continue;
            }
        }

        if let Some(needle) = &path {
            let new_tree = commit.tree()?;
            let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
            let diff = repo.diff_tree_to_tree(
                parent_tree.as_ref(),
                Some(&new_tree),
                Some(&mut diff_opts),
            )?;
            let mut hit = false;
            for delta in diff.deltas() {
                let p = delta
                    .new_file()
                    .path()
                    .or_else(|| delta.old_file().path())
                    .map(|p| p.display().to_string().to_lowercase())
                    .unwrap_or_default();
                if p.contains(needle.as_str()) {
                    hit = true;
                    break;
                }
            }
            if !hit {
                continue;
            }
        }

        let id_str = oid.to_string();
        let short_id = id_str.chars().take(7).collect();
        out.push(CommitInfo {
            id: id_str,
            short_id,
            author_name: commit.author().name().unwrap_or("unknown").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            timestamp: ts.to_rfc3339(),
            summary: commit.summary().unwrap_or("").to_string(),
        });
        if out.len() >= limit {
            break;
        }
    }

    Ok(out)
}

pub fn get_ownership_report_impl(
    db: &crate::db::Db,
    id: i64,
) -> AppResult<OwnershipReport> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "ownership", move || {
    let repo = open(&repo_meta.path)?;

    struct AuthorAcc {
        name: String,
        commits: u32,
        additions: u32,
        deletions: u32,
        last_commit: Option<DateTime<Utc>>,
    }
    let mut by_author: HashMap<String, AuthorAcc> = HashMap::new();

    struct FileAcc {
        commits: u32,
        per_author: HashMap<String, (String, u32)>, // email -> (name, commits)
    }
    let mut by_file: HashMap<String, FileAcc> = HashMap::new();

    walk_diffs(&repo, |commit, diff| {
        let author_email = commit.author().email().unwrap_or("").to_lowercase();
        let author_name = commit.author().name().unwrap_or("unknown").to_string();
        let stats = diff.stats()?;
        let ts = commit_time(commit);

        let aacc = by_author.entry(author_email.clone()).or_insert(AuthorAcc {
            name: author_name.clone(),
            commits: 0,
            additions: 0,
            deletions: 0,
            last_commit: None,
        });
        aacc.commits = aacc.commits.saturating_add(1);
        aacc.additions = aacc.additions.saturating_add(stats.insertions() as u32);
        aacc.deletions = aacc.deletions.saturating_add(stats.deletions() as u32);
        aacc.last_commit = Some(aacc.last_commit.map_or(ts, |l| l.max(ts)));

        let delta_count = diff.deltas().len();
        for idx in 0..delta_count {
            let Some(delta) = diff.get_delta(idx) else {
                continue;
            };
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            if path.is_empty() {
                continue;
            }
            let facc = by_file.entry(path).or_insert(FileAcc {
                commits: 0,
                per_author: HashMap::new(),
            });
            facc.commits = facc.commits.saturating_add(1);
            let (_, c) = facc
                .per_author
                .entry(author_email.clone())
                .or_insert_with(|| (author_name.clone(), 0));
            *c = c.saturating_add(1);
        }
        Ok(())
    })?;

    let total_changes: u64 = by_author
        .values()
        .map(|a| (a.additions as u64) + (a.deletions as u64))
        .sum();

    let now = Utc::now();
    let mut shares: Vec<AuthorShare> = by_author
        .iter()
        .map(|(email, a)| {
            let bytes = (a.additions as u64) + (a.deletions as u64);
            let pct = if total_changes > 0 {
                (bytes as f64 / total_changes as f64 * 100.0) as f32
            } else {
                0.0
            };
            let days = a.last_commit.map(|t| (now - t).num_days());
            AuthorShare {
                name: a.name.clone(),
                email: email.clone(),
                commits: a.commits,
                additions: a.additions,
                deletions: a.deletions,
                share_pct: pct,
                last_commit_at: a.last_commit.map(|t| t.to_rfc3339()),
                days_since_last: days,
            }
        })
        .collect();
    shares.sort_by(|a, b| b.share_pct.partial_cmp(&a.share_pct).unwrap_or(std::cmp::Ordering::Equal));

    let mut bus_factor = 0u32;
    let mut accum = 0.0f32;
    for s in &shares {
        if accum >= 50.0 {
            break;
        }
        accum += s.share_pct;
        bus_factor = bus_factor.saturating_add(1);
    }
    if bus_factor == 0 && !shares.is_empty() {
        bus_factor = 1;
    }

    let total_authors = shares.len() as u32;
    let top_authors: Vec<AuthorShare> = shares.iter().take(10).cloned().collect();

    let mut files: Vec<FileOwnership> = by_file
        .into_iter()
        .map(|(path, fa)| {
            let distinct = fa.per_author.len() as u32;
            let primary = fa
                .per_author
                .iter()
                .max_by_key(|(_, (_, c))| *c)
                .map(|(email, (name, c))| (email.clone(), name.clone(), *c))
                .unwrap_or_else(|| (String::new(), String::new(), 0));
            let pct = if fa.commits > 0 {
                (primary.2 as f32 / fa.commits as f32) * 100.0
            } else {
                0.0
            };
            FileOwnership {
                path,
                primary_name: primary.1,
                primary_email: primary.0,
                primary_share_pct: pct,
                distinct_authors: distinct,
                total_commits: fa.commits,
            }
        })
        .collect();
    files.sort_by(|a, b| b.total_commits.cmp(&a.total_commits));
    files.truncate(40);

    let mut alerts: Vec<OwnershipAlert> = Vec::new();
    if bus_factor == 1 {
        if let Some(top) = shares.first() {
            alerts.push(OwnershipAlert::BusFactorOne {
                author_name: top.name.clone(),
                author_email: top.email.clone(),
            });
        }
    }
    let high_conc_count = files
        .iter()
        .filter(|f| f.primary_share_pct >= 80.0 && f.total_commits >= 3)
        .count() as u32;
    if high_conc_count > 0 {
        alerts.push(OwnershipAlert::HighConcentration {
            count: high_conc_count,
            threshold_pct: 80,
        });
    }
    let alumni_count = shares
        .iter()
        .filter(|s| s.commits >= 3 && s.days_since_last.unwrap_or(0) > 90)
        .count() as u32;
    if alumni_count > 0 {
        alerts.push(OwnershipAlert::Alumni {
            count: alumni_count,
            days: 90,
        });
    }

    Ok(OwnershipReport {
        bus_factor,
        total_authors,
        top_authors,
        files,
        alerts,
    })
    })
}

pub fn get_churn_risk_impl(
    db: &crate::db::Db,
    id: i64,
    limit: usize,
) -> AppResult<Vec<ChurnRiskFile>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("churnRisk:{}", limit);
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;
    let now = Utc::now();

    struct Acc {
        commits: u32,
        last_touched: DateTime<Utc>,
        per_author: HashMap<String, (String, u32)>,
    }
    let mut by_file: HashMap<String, Acc> = HashMap::new();

    walk_diffs(&repo, |commit, diff| {
        let author_email = commit.author().email().unwrap_or("").to_lowercase();
        let author_name = commit.author().name().unwrap_or("unknown").to_string();
        let ts = commit_time(commit);
        let count = diff.deltas().len();
        for idx in 0..count {
            let Some(delta) = diff.get_delta(idx) else {
                continue;
            };
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            if path.is_empty() {
                continue;
            }
            let acc = by_file.entry(path).or_insert(Acc {
                commits: 0,
                last_touched: ts,
                per_author: HashMap::new(),
            });
            acc.commits = acc.commits.saturating_add(1);
            if ts > acc.last_touched {
                acc.last_touched = ts;
            }
            let entry = acc
                .per_author
                .entry(author_email.clone())
                .or_insert_with(|| (author_name.clone(), 0));
            entry.1 = entry.1.saturating_add(1);
        }
        Ok(())
    })?;

    let mut out: Vec<ChurnRiskFile> = by_file
        .into_iter()
        .filter_map(|(path, acc)| {
            if acc.commits < 3 {
                return None;
            }
            let primary = acc
                .per_author
                .iter()
                .max_by_key(|(_, (_, c))| *c)
                .map(|(email, (name, c))| (email.clone(), name.clone(), *c))
                .unwrap_or_else(|| (String::new(), String::new(), 0));
            let primary_share = if acc.commits > 0 {
                (primary.2 as f32 / acc.commits as f32) * 100.0
            } else {
                0.0
            };
            let days_since_last = (now - acc.last_touched).num_days();
            let churn_factor = (acc.commits as f32 / 50.0).min(1.0);
            let ownership_factor = if primary_share >= 50.0 {
                primary_share / 100.0
            } else {
                0.0
            };
            let recency_factor = (1.0 - (days_since_last as f32 / 90.0))
                .max(0.0)
                .min(1.0);
            let risk_score = churn_factor * ownership_factor * recency_factor;
            if risk_score < 0.05 {
                return None;
            }
            let risk_level = if risk_score >= 0.5 {
                "high"
            } else if risk_score >= 0.2 {
                "medium"
            } else {
                "low"
            };
            Some(ChurnRiskFile {
                path,
                commits: acc.commits,
                primary_name: primary.1,
                primary_email: primary.0,
                primary_share_pct: primary_share,
                last_touched: acc.last_touched.to_rfc3339(),
                days_since_last,
                risk_score,
                risk_level: risk_level.into(),
            })
        })
        .collect();

    out.sort_by(|a, b| {
        b.risk_score
            .partial_cmp(&a.risk_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    out.truncate(limit);
    Ok(out)
    })
}

pub fn get_contributor_cohort_impl(
    db: &crate::db::Db,
    id: i64,
) -> AppResult<Vec<ContributorCohortPoint>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "contribCohort", move || {
    let repo = open(&repo_meta.path)?;

    let mut by_month: BTreeMap<String, std::collections::HashSet<String>> = BTreeMap::new();
    let mut author_first_month: HashMap<String, String> = HashMap::new();

    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        let email = commit.author().email().unwrap_or("").to_lowercase();
        if email.is_empty() {
            continue;
        }
        let ts = commit_time(&commit);
        let month = ts.format("%Y-%m").to_string();
        by_month
            .entry(month.clone())
            .or_default()
            .insert(email.clone());
        author_first_month
            .entry(email)
            .and_modify(|m| {
                if month < *m {
                    *m = month.clone();
                }
            })
            .or_insert(month);
    }

    let months: Vec<String> = by_month.keys().cloned().collect();
    let mut prev_active: Option<std::collections::HashSet<String>> = None;
    let mut out: Vec<ContributorCohortPoint> = Vec::with_capacity(months.len());

    for m in &months {
        let active_set = by_month.get(m).cloned().unwrap_or_default();
        let active = active_set.len() as u32;
        let new_authors = active_set
            .iter()
            .filter(|e| author_first_month.get(*e).map(|fm| fm == m).unwrap_or(false))
            .count() as u32;
        let returning = if let Some(prev) = &prev_active {
            active_set
                .iter()
                .filter(|e| {
                    !prev.contains(*e)
                        && author_first_month
                            .get(*e)
                            .map(|fm| fm != m)
                            .unwrap_or(false)
                })
                .count() as u32
        } else {
            0
        };
        let leaving = if let Some(prev) = &prev_active {
            prev.iter()
                .filter(|e| !active_set.contains(*e))
                .count() as u32
        } else {
            0
        };
        out.push(ContributorCohortPoint {
            bucket: m.clone(),
            active,
            new_authors,
            returning,
            leaving,
        });
        prev_active = Some(active_set);
    }

    Ok(out)
    })
}

pub fn get_commit_graph_impl(
    db: &crate::db::Db,
    id: i64,
    limit: usize,
) -> AppResult<Vec<GraphCommit>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("graph:{}", limit);
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    let limit = limit.clamp(1, 2000);

    let mut refs_by_oid: HashMap<git2::Oid, Vec<GraphRef>> = HashMap::new();

    let head_oid = repo.head().ok().and_then(|h| h.target());
    if let Some(oid) = head_oid {
        refs_by_oid.entry(oid).or_default().push(GraphRef {
            kind: "HEAD".into(),
            name: "HEAD".into(),
        });
    }

    if let Ok(branches) = repo.branches(None) {
        for b in branches {
            let Ok((branch, btype)) = b else { continue };
            let Ok(Some(name)) = branch.name() else {
                continue;
            };
            let Some(oid) = branch.get().target() else {
                continue;
            };
            let kind = match btype {
                git2::BranchType::Local => "head",
                git2::BranchType::Remote => "remote",
            };
            refs_by_oid.entry(oid).or_default().push(GraphRef {
                kind: kind.into(),
                name: name.to_string(),
            });
        }
    }

    let _ = repo.tag_foreach(|oid, name_bytes| {
        let raw = std::str::from_utf8(name_bytes).unwrap_or("");
        let short = raw.strip_prefix("refs/tags/").unwrap_or(raw).to_string();
        let resolved = repo
            .find_object(oid, None)
            .and_then(|o| o.peel(git2::ObjectType::Commit))
            .map(|c| c.id())
            .unwrap_or(oid);
        refs_by_oid.entry(resolved).or_default().push(GraphRef {
            kind: "tag".into(),
            name: short,
        });
        true
    });

    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME | Sort::TOPOLOGICAL)?;
    walk.push_glob("refs/heads/*")?;
    let _ = walk.push_glob("refs/remotes/*");
    let _ = walk.push_glob("refs/tags/*");

    let mut out: Vec<GraphCommit> = Vec::with_capacity(limit);
    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid_result in walk {
        if out.len() >= limit {
            break;
        }
        let oid = oid_result?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        let ts = commit_time(&commit);
        let id_str = oid.to_string();
        let short_id: String = id_str.chars().take(7).collect();
        let parents: Vec<String> = commit.parent_ids().map(|p| p.to_string()).collect();
        let mut refs = refs_by_oid.get(&oid).cloned().unwrap_or_default();
        refs.sort_by(|a, b| {
            let order = |k: &str| match k {
                "HEAD" => 0,
                "head" => 1,
                "remote" => 2,
                "tag" => 3,
                _ => 4,
            };
            order(&a.kind)
                .cmp(&order(&b.kind))
                .then_with(|| a.name.cmp(&b.name))
        });
        out.push(GraphCommit {
            id: id_str,
            short_id,
            parents,
            author_name: commit.author().name().unwrap_or("unknown").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            timestamp: ts.to_rfc3339(),
            summary: commit.summary().unwrap_or("").to_string(),
            refs,
        });
    }

    Ok(out)
    })
}

pub fn get_commit_detail_impl(
    db: &crate::db::Db,
    id: i64,
    oid_hex: &str,
) -> AppResult<CommitDetail> {
    let repo_meta = get_repository_impl(db, id)?;
    let repo = open(&repo_meta.path)?;

    let oid = git2::Oid::from_str(oid_hex)
        .map_err(|e| AppError::Other(format!("invalid oid: {}", e)))?;
    let commit = repo.find_commit(oid)?;

    let new_tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.ignore_filemode(true);
    let diff = repo.diff_tree_to_tree(
        parent_tree.as_ref(),
        Some(&new_tree),
        Some(&mut diff_opts),
    )?;
    let stats = diff.stats()?;

    let mut files: Vec<FilePatch> = Vec::new();
    let delta_count = diff.deltas().len();
    for idx in 0..delta_count {
        let Some(delta) = diff.get_delta(idx) else {
            continue;
        };
        let old_path = delta
            .old_file()
            .path()
            .map(|p| p.display().to_string())
            .filter(|s| !s.is_empty());
        let new_path = delta
            .new_file()
            .path()
            .map(|p| p.display().to_string())
            .filter(|s| !s.is_empty());

        let is_binary = delta
            .flags()
            .contains(git2::DiffFlags::BINARY);

        let status = match delta.status() {
            git2::Delta::Added => "added",
            git2::Delta::Modified => "modified",
            git2::Delta::Deleted => "deleted",
            git2::Delta::Renamed => "renamed",
            git2::Delta::Copied => "copied",
            git2::Delta::Typechange => "typechange",
            _ => "modified",
        };

        let mut insertions = 0u32;
        let mut deletions = 0u32;
        let mut hunks: Vec<Hunk> = Vec::new();

        if !is_binary {
            if let Ok(Some(patch)) = git2::Patch::from_diff(&diff, idx) {
                if let Ok((_, ins, del)) = patch.line_stats() {
                    insertions = ins as u32;
                    deletions = del as u32;
                }
                let nh = patch.num_hunks();
                for hi in 0..nh {
                    let Ok((hunk, num_lines)) = patch.hunk(hi) else {
                        continue;
                    };
                    let header = String::from_utf8_lossy(hunk.header())
                        .trim_end()
                        .to_string();
                    let mut lines = Vec::with_capacity(num_lines);
                    for li in 0..num_lines {
                        let Ok(line) = patch.line_in_hunk(hi, li) else {
                            continue;
                        };
                        let mut content = String::from_utf8_lossy(line.content())
                            .to_string();
                        if content.ends_with('\n') {
                            content.pop();
                        }
                        if content.ends_with('\r') {
                            content.pop();
                        }
                        lines.push(DiffLine {
                            origin: line.origin().to_string(),
                            old_lineno: line.old_lineno(),
                            new_lineno: line.new_lineno(),
                            content,
                        });
                    }
                    hunks.push(Hunk {
                        old_start: hunk.old_start(),
                        old_lines: hunk.old_lines(),
                        new_start: hunk.new_start(),
                        new_lines: hunk.new_lines(),
                        header,
                        lines,
                    });
                }
            }
        }

        files.push(FilePatch {
            old_path,
            new_path,
            status: status.to_string(),
            insertions,
            deletions,
            is_binary,
            hunks,
        });
    }

    let id_str = oid.to_string();
    let short_id: String = id_str.chars().take(7).collect();
    let parents: Vec<String> = commit.parent_ids().map(|p| p.to_string()).collect();
    let author_name = commit.author().name().unwrap_or("unknown").to_string();
    let author_email = commit.author().email().unwrap_or("").to_string();
    let committer_name = commit.committer().name().unwrap_or("unknown").to_string();
    let committer_email = commit.committer().email().unwrap_or("").to_string();
    let timestamp = commit_time(&commit).to_rfc3339();
    let summary = commit.summary().unwrap_or("").to_string();
    let message = commit.message().unwrap_or("").to_string();

    Ok(CommitDetail {
        id: id_str,
        short_id,
        parents,
        author_name,
        author_email,
        committer_name,
        committer_email,
        timestamp,
        summary,
        message,
        files_changed: stats.files_changed() as u32,
        insertions: stats.insertions() as u32,
        deletions: stats.deletions() as u32,
        files,
    })
}

fn email_matches(commit: &git2::Commit<'_>, filter: &Option<String>) -> bool {
    match filter {
        None => true,
        Some(e) => commit.author().email().unwrap_or("") == e.as_str(),
    }
}

pub fn get_global_summary_impl(
    db: &crate::db::Db,
    email: Option<String>,
) -> AppResult<GlobalSummary> {
    let repos = crate::repo::list_repositories_impl(db)?;
    let cutoff = Utc::now() - Duration::days(30);

    struct Acc {
        total: u32,
        last_30: u32,
        active: bool,
        authors: std::collections::HashSet<String>,
    }
    let parts: Vec<Acc> = repos
        .par_iter()
        .map(|r| {
            let mut acc = Acc {
                total: 0,
                last_30: 0,
                active: false,
                authors: std::collections::HashSet::new(),
            };
            let Ok(repo) = GitRepository::open(&r.path) else {
                return acc;
            };
            let mut walk = match repo.revwalk() {
                Ok(w) => w,
                Err(_) => return acc,
            };
            let _ = walk.set_sorting(Sort::TIME);
            let _ = walk.push_glob("refs/heads/*");
            let mut seen = std::collections::HashSet::new();
            for oid_res in walk {
                let Ok(oid) = oid_res else { continue };
                if !seen.insert(oid) {
                    continue;
                }
                let Ok(commit) = repo.find_commit(oid) else {
                    continue;
                };
                if !email_matches(&commit, &email) {
                    continue;
                }
                let ts = commit_time(&commit);
                acc.total = acc.total.saturating_add(1);
                acc.authors
                    .insert(commit.author().email().unwrap_or("").to_string());
                if ts >= cutoff {
                    acc.last_30 = acc.last_30.saturating_add(1);
                    acc.active = true;
                }
            }
            acc
        })
        .collect();

    let mut total = 0u32;
    let mut last_30 = 0u32;
    let mut active = 0u32;
    let mut authors = std::collections::HashSet::new();
    for p in parts {
        total = total.saturating_add(p.total);
        last_30 = last_30.saturating_add(p.last_30);
        if p.active {
            active = active.saturating_add(1);
        }
        authors.extend(p.authors);
    }

    Ok(GlobalSummary {
        repo_count: repos.len() as u32,
        total_commits: total,
        commits_last_30_days: last_30,
        active_repos_last_30_days: active,
        author_count: authors.len() as u32,
    })
}

pub fn get_global_heatmap_impl(
    db: &crate::db::Db,
    year: i32,
    email: Option<String>,
) -> AppResult<HeatmapData> {
    let repos = crate::repo::list_repositories_impl(db)?;

    let counts: HashMap<NaiveDate, u32> = repos
        .par_iter()
        .map(|r| {
            let mut local: HashMap<NaiveDate, u32> = HashMap::new();
            let Ok(repo) = GitRepository::open(&r.path) else {
                return local;
            };
            let Ok(mut walk) = repo.revwalk() else {
                return local;
            };
            let _ = walk.set_sorting(Sort::TIME);
            let _ = walk.push_glob("refs/heads/*");
            let mut seen = std::collections::HashSet::new();
            for oid_res in walk {
                let Ok(oid) = oid_res else { continue };
                if !seen.insert(oid) {
                    continue;
                }
                let Ok(commit) = repo.find_commit(oid) else {
                    continue;
                };
                if !email_matches(&commit, &email) {
                    continue;
                }
                let ts = commit_time(&commit);
                if ts.year() != year {
                    continue;
                }
                *local.entry(ts.date_naive()).or_insert(0) += 1;
            }
            local
        })
        .reduce(HashMap::new, |mut acc, m| {
            for (k, v) in m {
                *acc.entry(k).or_insert(0) += v;
            }
            acc
        });

    let start = NaiveDate::from_ymd_opt(year, 1, 1)
        .ok_or_else(|| AppError::Other("bad year".into()))?;
    let end = NaiveDate::from_ymd_opt(year, 12, 31)
        .ok_or_else(|| AppError::Other("bad year".into()))?;
    let mut days: Vec<HeatmapDay> = Vec::with_capacity(366);
    let mut total = 0u32;
    let mut max_count = 0u32;
    let mut d = start;
    loop {
        let c = counts.get(&d).copied().unwrap_or(0);
        total += c;
        if c > max_count {
            max_count = c;
        }
        days.push(HeatmapDay {
            date: d.format("%Y-%m-%d").to_string(),
            count: c,
        });
        if d == end {
            break;
        }
        d = match d.succ_opt() {
            Some(next) => next,
            None => break,
        };
    }

    Ok(HeatmapData {
        year,
        days,
        max_count,
        total,
    })
}

pub fn get_global_recent_commits_impl(
    db: &crate::db::Db,
    limit: usize,
    email: Option<String>,
) -> AppResult<Vec<GlobalRecentCommit>> {
    let repos = crate::repo::list_repositories_impl(db)?;
    let per_repo = limit.max(20);

    let lists: Vec<Vec<GlobalRecentCommit>> = repos
        .par_iter()
        .map(|r| {
            let mut out: Vec<GlobalRecentCommit> = Vec::new();
            let Ok(repo) = GitRepository::open(&r.path) else {
                return out;
            };
            let Ok(mut walk) = repo.revwalk() else {
                return out;
            };
            let _ = walk.set_sorting(Sort::TIME);
            let _ = walk.push_glob("refs/heads/*");
            let mut seen = std::collections::HashSet::new();
            for oid_res in walk {
                if out.len() >= per_repo {
                    break;
                }
                let Ok(oid) = oid_res else { continue };
                if !seen.insert(oid) {
                    continue;
                }
                let Ok(commit) = repo.find_commit(oid) else {
                    continue;
                };
                if !email_matches(&commit, &email) {
                    continue;
                }
                let ts = commit_time(&commit);
                let id_str = oid.to_string();
                let short_id: String = id_str.chars().take(7).collect();
                out.push(GlobalRecentCommit {
                    commit: CommitInfo {
                        id: id_str,
                        short_id,
                        author_name: commit.author().name().unwrap_or("unknown").to_string(),
                        author_email: commit.author().email().unwrap_or("").to_string(),
                        timestamp: ts.to_rfc3339(),
                        summary: commit.summary().unwrap_or("").to_string(),
                    },
                    repo_id: r.id,
                    repo_name: r.name.clone(),
                });
            }
            out
        })
        .collect();

    let mut all: Vec<GlobalRecentCommit> = lists.into_iter().flatten().collect();
    all.sort_by(|a, b| b.commit.timestamp.cmp(&a.commit.timestamp));
    all.truncate(limit);
    Ok(all)
}

pub fn list_known_authors_impl(db: &crate::db::Db) -> AppResult<Vec<Contributor>> {
    let repos = crate::repo::list_repositories_impl(db)?;

    struct Acc {
        name: String,
        commits: u32,
        first: DateTime<Utc>,
        last: DateTime<Utc>,
    }

    let parts: Vec<HashMap<String, Acc>> = repos
        .par_iter()
        .map(|r| {
            let mut local: HashMap<String, Acc> = HashMap::new();
            let Ok(repo) = GitRepository::open(&r.path) else {
                return local;
            };
            let Ok(mut walk) = repo.revwalk() else {
                return local;
            };
            let _ = walk.set_sorting(Sort::TIME);
            let _ = walk.push_glob("refs/heads/*");
            let mut seen = std::collections::HashSet::new();
            for oid_res in walk {
                let Ok(oid) = oid_res else { continue };
                if !seen.insert(oid) {
                    continue;
                }
                let Ok(commit) = repo.find_commit(oid) else {
                    continue;
                };
                let email = commit.author().email().unwrap_or("").to_string();
                let name = commit.author().name().unwrap_or("unknown").to_string();
                let ts = commit_time(&commit);
                local
                    .entry(email)
                    .and_modify(|a| {
                        a.commits = a.commits.saturating_add(1);
                        if ts < a.first {
                            a.first = ts;
                        }
                        if ts > a.last {
                            a.last = ts;
                        }
                    })
                    .or_insert(Acc {
                        name,
                        commits: 1,
                        first: ts,
                        last: ts,
                    });
            }
            local
        })
        .collect();

    let mut merged: HashMap<String, Acc> = HashMap::new();
    for part in parts {
        for (email, a) in part {
            merged
                .entry(email)
                .and_modify(|m| {
                    m.commits = m.commits.saturating_add(a.commits);
                    if a.first < m.first {
                        m.first = a.first;
                    }
                    if a.last > m.last {
                        m.last = a.last;
                    }
                })
                .or_insert(a);
        }
    }

    let mut out: Vec<Contributor> = merged
        .into_iter()
        .map(|(email, a)| Contributor {
            name: a.name,
            email,
            commits: a.commits,
            first_commit_at: a.first.to_rfc3339(),
            last_commit_at: a.last.to_rfc3339(),
        })
        .collect();
    out.sort_by(|a, b| b.commits.cmp(&a.commits));
    Ok(out)
}

pub fn get_file_couplings_impl(
    db: &crate::db::Db,
    id: i64,
    limit: usize,
) -> AppResult<Vec<FileCoupling>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("couplings:{}", limit);
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    let mut counts: HashMap<(String, String), u32> = HashMap::new();

    walk_diffs(&repo, |_commit, diff| {
        let count = diff.deltas().len();
        if count > 50 || count < 2 {
            return Ok(());
        }
        let mut paths: Vec<String> = (0..count)
            .filter_map(|idx| {
                diff.get_delta(idx).and_then(|d| {
                    d.new_file()
                        .path()
                        .or_else(|| d.old_file().path())
                        .map(|p| p.display().to_string())
                })
            })
            .filter(|p| !p.is_empty())
            .collect();
        paths.sort();
        paths.dedup();
        for i in 0..paths.len() {
            for j in (i + 1)..paths.len() {
                let key = (paths[i].clone(), paths[j].clone());
                *counts.entry(key).or_insert(0) += 1;
            }
        }
        Ok(())
    })?;

    let mut out: Vec<FileCoupling> = counts
        .into_iter()
        .filter(|(_, c)| *c >= 2)
        .map(|((a, b), c)| FileCoupling {
            file_a: a,
            file_b: b,
            joint_changes: c,
        })
        .collect();
    out.sort_by(|x, y| y.joint_changes.cmp(&x.joint_changes));
    out.truncate(limit);
    Ok(out)
    })
}

pub fn get_directory_hotspots_impl(
    db: &crate::db::Db,
    id: i64,
    max_depth: usize,
    limit: usize,
) -> AppResult<Vec<DirectoryHotspot>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("dirHotspots:{}:{}", max_depth, limit);
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    struct Acc {
        commits: std::collections::HashSet<git2::Oid>,
        additions: u32,
        deletions: u32,
        files: std::collections::HashSet<String>,
    }
    let mut by_dir: HashMap<String, Acc> = HashMap::new();
    let depth = max_depth.max(1);

    walk_diffs(&repo, |commit, diff| {
        let oid = commit.id();
        let count = diff.deltas().len();
        for idx in 0..count {
            let Some(delta) = diff.get_delta(idx) else {
                continue;
            };
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            if path.is_empty() {
                continue;
            }

            let parts: Vec<&str> = path.split('/').collect();
            let dir = if parts.len() <= 1 {
                ".".to_string()
            } else {
                let take = (parts.len() - 1).min(depth);
                parts[..take].join("/")
            };

            let (additions, deletions) = match git2::Patch::from_diff(diff, idx) {
                Ok(Some(patch)) => match patch.line_stats() {
                    Ok((_, a, d)) => (a as u32, d as u32),
                    Err(_) => (0, 0),
                },
                _ => (0, 0),
            };

            let acc = by_dir.entry(dir).or_insert(Acc {
                commits: std::collections::HashSet::new(),
                additions: 0,
                deletions: 0,
                files: std::collections::HashSet::new(),
            });
            acc.additions = acc.additions.saturating_add(additions);
            acc.deletions = acc.deletions.saturating_add(deletions);
            acc.files.insert(path);
            acc.commits.insert(oid);
        }
        Ok(())
    })?;

    let mut out: Vec<DirectoryHotspot> = by_dir
        .into_iter()
        .map(|(path, acc)| DirectoryHotspot {
            path,
            commits: acc.commits.len() as u32,
            additions: acc.additions,
            deletions: acc.deletions,
            files: acc.files.len() as u32,
        })
        .collect();
    out.sort_by(|a, b| b.commits.cmp(&a.commits));
    out.truncate(limit);
    Ok(out)
    })
}

pub fn get_repo_health_impl(
    db: &crate::db::Db,
    id: i64,
) -> AppResult<RepoHealth> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "health", move || {
    let repo = open(&repo_meta.path)?;

    let now = Utc::now();
    let cutoff_7 = now - Duration::days(7);
    let cutoff_30 = now - Duration::days(30);
    let cutoff_90 = now - Duration::days(90);

    let mut last_commit_at: Option<DateTime<Utc>> = None;
    let mut total_commits: u32 = 0;
    let mut commits_90d: u32 = 0;
    let mut conventional_commits: u32 = 0;
    let mut subjects_total: u32 = 0;
    let mut authors_changes: HashMap<String, u64> = HashMap::new();
    let mut total_changes: u64 = 0;

    let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid in walk(&repo)? {
        let oid = oid?;
        if !seen.insert(oid) {
            continue;
        }
        let commit = repo.find_commit(oid)?;
        let ts = commit_time(&commit);
        total_commits = total_commits.saturating_add(1);
        last_commit_at = Some(last_commit_at.map_or(ts, |l| l.max(ts)));
        if ts >= cutoff_90 {
            commits_90d = commits_90d.saturating_add(1);
        }
        if let Some(s) = commit.summary() {
            subjects_total = subjects_total.saturating_add(1);
            if classify_subject(s).is_some() {
                conventional_commits = conventional_commits.saturating_add(1);
            }
        }
    }

    walk_diffs(&repo, |commit, diff| {
        let stats = diff.stats()?;
        let bytes = (stats.insertions() as u64) + (stats.deletions() as u64);
        if bytes == 0 {
            return Ok(());
        }
        let email = commit.author().email().unwrap_or("").to_lowercase();
        *authors_changes.entry(email).or_insert(0) += bytes;
        total_changes += bytes;
        Ok(())
    })?;

    let mut author_shares: Vec<f64> = if total_changes > 0 {
        authors_changes
            .values()
            .map(|v| (*v as f64 / total_changes as f64) * 100.0)
            .collect()
    } else {
        Vec::new()
    };
    author_shares.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));

    let mut bus_factor = 0u32;
    let mut acc = 0.0f64;
    for s in &author_shares {
        if acc >= 50.0 {
            break;
        }
        acc += s;
        bus_factor = bus_factor.saturating_add(1);
    }
    if bus_factor == 0 && !author_shares.is_empty() {
        bus_factor = 1;
    }

    let mut local_count: u32 = 0;
    let mut stale_count: u32 = 0;
    let head_oid = repo.head().ok().and_then(|h| h.target());
    if let Ok(branches) = repo.branches(Some(git2::BranchType::Local)) {
        for b in branches.flatten() {
            let (branch, _) = b;
            let is_head = branch.is_head();
            if let Ok(commit) = branch.get().peel_to_commit() {
                local_count = local_count.saturating_add(1);
                let bts = Utc
                    .timestamp_opt(commit.time().seconds(), 0)
                    .single()
                    .unwrap_or_else(Utc::now);
                let stale = bts < (now - Duration::days(90));
                let is_default = head_oid.map(|h| h == commit.id()).unwrap_or(false);
                if stale && !is_head && !is_default {
                    stale_count = stale_count.saturating_add(1);
                }
            }
        }
    }

    let mut has_readme = false;
    let mut has_docs_dir = false;
    let mut has_tests = false;
    if let Ok(head_ref) = repo.head() {
        if let Ok(tree) = head_ref.peel_to_tree() {
            tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
                if let Some(name) = entry.name() {
                    let lower = name.to_ascii_lowercase();
                    let path = format!("{}{}", root, name);
                    let path_lower = path.to_ascii_lowercase();
                    if entry.kind() == Some(git2::ObjectType::Blob) {
                        if root.is_empty() && lower.starts_with("readme") {
                            has_readme = true;
                        }
                        if path_lower.contains("test") || path_lower.contains("spec") {
                            has_tests = true;
                        }
                    } else if entry.kind() == Some(git2::ObjectType::Tree) {
                        if root.is_empty()
                            && (lower == "docs" || lower == "doc" || lower == "documentation")
                        {
                            has_docs_dir = true;
                        }
                        if lower == "test" || lower == "tests" || lower == "__tests__" {
                            has_tests = true;
                        }
                    }
                }
                if has_readme && (has_docs_dir || has_tests) && has_tests {
                    git2::TreeWalkResult::Abort
                } else {
                    git2::TreeWalkResult::Ok
                }
            })
            .ok();
        }
    }

    // 1) Recency — 20p
    let recency_score = if let Some(last) = last_commit_at {
        if last >= cutoff_7 {
            20
        } else if last >= cutoff_30 {
            14
        } else if last >= cutoff_90 {
            8
        } else {
            0
        }
    } else {
        0
    };
    let days_since_last = last_commit_at.map(|d| (now - d).num_days());

    // 2) Activity volume — 15p
    let volume_score = if total_commits == 0 {
        0u32
    } else {
        match commits_90d {
            x if x >= 60 => 15,
            x if x >= 25 => 12,
            x if x >= 10 => 9,
            x if x >= 3 => 5,
            x if x >= 1 => 2,
            _ => 0,
        }
    };

    // 3) Bus factor — 20p
    let bus_score = match bus_factor {
        0 => 0,
        1 => 4,
        2 => 12,
        _ => 20,
    };

    // 4) Branch hygiene — 15p
    let branch_score = if local_count == 0 {
        15
    } else {
        let stale_ratio = stale_count as f64 / local_count as f64;
        let penalty = (stale_ratio * 15.0).round() as u32;
        15u32.saturating_sub(penalty)
    };

    // 5) Doc / test presence — 15p
    let mut docs_score = 0u32;
    if has_readme {
        docs_score += 5;
    }
    if has_docs_dir {
        docs_score += 4;
    }
    if has_tests {
        docs_score += 6;
    }

    // 6) Conventional commits — 15p
    let conv_pct = if subjects_total > 0 {
        (conventional_commits as f64 / subjects_total as f64) * 100.0
    } else {
        0.0
    };
    let conv_score = if subjects_total < 10 {
        7 // not enough data → neutral half-score
    } else {
        ((conv_pct / 100.0) * 15.0).round() as u32
    };

    let sub_scores = vec![
        HealthSubScore {
            key: "recency".into(),
            score: recency_score,
            max: 20,
            detail: HealthDetail::Recency { days_since_last },
        },
        HealthSubScore {
            key: "volume".into(),
            score: volume_score,
            max: 15,
            detail: HealthDetail::Volume {
                commits_in_last90: commits_90d,
            },
        },
        HealthSubScore {
            key: "busFactor".into(),
            score: bus_score,
            max: 20,
            detail: HealthDetail::BusFactor { value: bus_factor },
        },
        HealthSubScore {
            key: "branches".into(),
            score: branch_score,
            max: 15,
            detail: HealthDetail::Branches {
                stale: stale_count,
                local: local_count,
            },
        },
        HealthSubScore {
            key: "docs".into(),
            score: docs_score,
            max: 15,
            detail: HealthDetail::Docs {
                has_readme,
                has_docs_dir,
                has_tests,
            },
        },
        HealthSubScore {
            key: "conventional".into(),
            score: conv_score,
            max: 15,
            detail: HealthDetail::Conventional {
                pct: conv_pct as f32,
                subjects: subjects_total,
            },
        },
    ];
    let total_score: u32 = sub_scores.iter().map(|s| s.score).sum();
    let max_score: u32 = sub_scores.iter().map(|s| s.max).sum();

    Ok(RepoHealth {
        score: total_score,
        max: max_score,
        sub_scores,
    })
    })
}

fn classify_language(filename: &str) -> &'static str {
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
