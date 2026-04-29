use std::collections::HashMap;
use std::path::Path;

use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc};
use git2::{Repository as GitRepository, Sort};
use serde::{Deserialize, Serialize};

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

fn open(path: &str) -> AppResult<GitRepository> {
    GitRepository::open(path).map_err(|_| AppError::NotARepo(path.into()))
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
}

pub fn get_commit_heatmap_impl(
    db: &crate::db::Db,
    id: i64,
    year: i32,
) -> AppResult<HeatmapData> {
    let repo_meta = get_repository_impl(db, id)?;
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
}

pub fn get_commit_timeline_impl(
    db: &crate::db::Db,
    id: i64,
    granularity: &str,
) -> AppResult<Vec<TimelinePoint>> {
    let repo_meta = get_repository_impl(db, id)?;
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
        let key = match granularity {
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
}

pub fn get_top_contributors_impl(
    db: &crate::db::Db,
    id: i64,
    limit: usize,
) -> AppResult<Vec<Contributor>> {
    let repo_meta = get_repository_impl(db, id)?;
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
}

pub fn get_recent_commits_impl(
    db: &crate::db::Db,
    id: i64,
    limit: usize,
) -> AppResult<Vec<CommitInfo>> {
    let repo_meta = get_repository_impl(db, id)?;
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
}

pub fn get_language_breakdown_impl(
    db: &crate::db::Db,
    id: i64,
) -> AppResult<Vec<LanguageStat>> {
    let repo_meta = get_repository_impl(db, id)?;
    let repo = open(&repo_meta.path)?;

    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok(Vec::new()),
    };
    let tree = head.peel_to_tree()?;

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
