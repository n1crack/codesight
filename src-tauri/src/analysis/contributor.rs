use std::collections::HashMap;

use chrono::{DateTime, Datelike, NaiveDate, Utc};

use crate::error::{AppError, AppResult};
use crate::repo::get_repository_impl;

use super::{
    cached, commit_time, current_head, open, parse_date, walk, walk_diffs, CommitInfo,
    ContributorDetail, FileHotspot, HeatmapData, HeatmapDay, SearchParams,
};

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
