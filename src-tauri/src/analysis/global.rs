use std::collections::HashMap;

use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use git2::{Repository as GitRepository, Sort};
use rayon::prelude::*;

use crate::error::{AppError, AppResult};

use super::{
    commit_time, CommitInfo, Contributor, GlobalRecentCommit, GlobalSummary, HeatmapData,
    HeatmapDay,
};

fn email_matches(commit: &git2::Commit<'_>, filter: &Option<String>) -> bool {
    match filter {
        None => true,
        Some(e) => commit.author().email().unwrap_or("") == e.as_str(),
    }
}

fn filter_repos_by_tag(
    repos: Vec<crate::repo::Repository>,
    tag_id: Option<i64>,
) -> Vec<crate::repo::Repository> {
    match tag_id {
        Some(t) => repos
            .into_iter()
            .filter(|r| r.tags.iter().any(|tag| tag.id == t))
            .collect(),
        None => repos,
    }
}

pub fn get_global_summary_impl(
    db: &crate::db::Db,
    email: Option<String>,
    tag_id: Option<i64>,
) -> AppResult<GlobalSummary> {
    let repos = filter_repos_by_tag(crate::repo::list_repositories_impl(db)?, tag_id);
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
    tag_id: Option<i64>,
) -> AppResult<HeatmapData> {
    let repos = filter_repos_by_tag(crate::repo::list_repositories_impl(db)?, tag_id);

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
    tag_id: Option<i64>,
) -> AppResult<Vec<GlobalRecentCommit>> {
    let repos = filter_repos_by_tag(crate::repo::list_repositories_impl(db)?, tag_id);
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

pub fn list_known_authors_impl(
    db: &crate::db::Db,
    tag_id: Option<i64>,
) -> AppResult<Vec<Contributor>> {
    let repos = filter_repos_by_tag(crate::repo::list_repositories_impl(db)?, tag_id);

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
