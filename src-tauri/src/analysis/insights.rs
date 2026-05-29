use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, Duration, TimeZone, Utc};

use crate::error::AppResult;
use crate::repo::get_repository_impl;

use super::{
    cached, classify_language, classify_subject, commit_time, current_head, open, parse_date, walk,
    walk_diffs, walk_diffs_since, AuthorShare, AuthorSpecialization, ChurnRiskFile, CoauthorPair,
    ContributorCohortPoint, DirectoryHotspot, DirectoryShare, FileCoupling, FileOwnership,
    HealthDetail, HealthSubScore, LanguageShare, OwnershipAlert, OwnershipReport, RepoHealth,
};

pub fn get_ownership_report_impl(
    db: &crate::db::Db,
    id: i64,
    since: Option<String>,
) -> AppResult<OwnershipReport> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let since_dt = since.as_deref().and_then(parse_date);
    let cache_key = format!("ownership:since={}", since.as_deref().unwrap_or(""));
    cached(db, id, &head, &cache_key, move || {
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

        walk_diffs_since(&repo, since_dt, |commit, diff| {
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
        shares.sort_by(|a, b| {
            b.share_pct
                .partial_cmp(&a.share_pct)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

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
    since: Option<String>,
) -> AppResult<Vec<ChurnRiskFile>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let since_dt = since.as_deref().and_then(parse_date);
    let cache_key = format!(
        "churnRisk:{}:since={}",
        limit,
        since.as_deref().unwrap_or("")
    );
    cached(db, id, &head, &cache_key, move || {
        let repo = open(&repo_meta.path)?;
        let now = Utc::now();

        struct Acc {
            commits: u32,
            last_touched: DateTime<Utc>,
            per_author: HashMap<String, (String, u32)>,
        }
        let mut by_file: HashMap<String, Acc> = HashMap::new();

        walk_diffs_since(&repo, since_dt, |commit, diff| {
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
                let recency_factor = (1.0 - (days_since_last as f32 / 90.0)).clamp(0.0, 1.0);
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

pub fn get_author_specialization_impl(
    db: &crate::db::Db,
    id: i64,
    email: &str,
) -> AppResult<AuthorSpecialization> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("specialization:{}", email);
    let email_owned = email.to_string();
    cached(db, id, &head, &cache_key, move || {
        let repo = open(&repo_meta.path)?;

        struct LangAcc {
            files: std::collections::HashSet<String>,
            bytes_changed: u64,
        }
        struct DirAcc {
            commits: std::collections::HashSet<git2::Oid>,
            bytes_changed: u64,
        }
        let mut by_lang: HashMap<&'static str, LangAcc> = HashMap::new();
        let mut by_dir: HashMap<String, DirAcc> = HashMap::new();
        let mut total_files: std::collections::HashSet<String> = std::collections::HashSet::new();

        walk_diffs(&repo, |commit, diff| {
            if commit.author().email().unwrap_or("").to_lowercase() != email_owned.to_lowercase() {
                return Ok(());
            }
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

                let bytes = match git2::Patch::from_diff(diff, idx) {
                    Ok(Some(patch)) => match patch.line_stats() {
                        Ok((_, ins, del)) => (ins + del) as u64,
                        Err(_) => 0,
                    },
                    _ => 0,
                };

                total_files.insert(path.clone());

                let lang = classify_language(&path);
                let lacc = by_lang.entry(lang).or_insert(LangAcc {
                    files: std::collections::HashSet::new(),
                    bytes_changed: 0,
                });
                lacc.files.insert(path.clone());
                lacc.bytes_changed = lacc.bytes_changed.saturating_add(bytes);

                let parts: Vec<&str> = path.split('/').collect();
                let dir = if parts.len() <= 1 {
                    ".".to_string()
                } else {
                    let take = (parts.len() - 1).min(2);
                    parts[..take].join("/")
                };
                let dacc = by_dir.entry(dir).or_insert(DirAcc {
                    commits: std::collections::HashSet::new(),
                    bytes_changed: 0,
                });
                dacc.commits.insert(oid);
                dacc.bytes_changed = dacc.bytes_changed.saturating_add(bytes);
            }
            Ok(())
        })?;

        let mut top_languages: Vec<LanguageShare> = by_lang
            .into_iter()
            .map(|(lang, acc)| LanguageShare {
                language: lang.to_string(),
                files: acc.files.len() as u32,
                bytes_changed: acc.bytes_changed,
            })
            .collect();
        top_languages.sort_by(|a, b| b.bytes_changed.cmp(&a.bytes_changed));
        top_languages.truncate(8);

        let mut top_directories: Vec<DirectoryShare> = by_dir
            .into_iter()
            .map(|(path, acc)| DirectoryShare {
                path,
                commits: acc.commits.len() as u32,
                bytes_changed: acc.bytes_changed,
            })
            .collect();
        top_directories.sort_by(|a, b| b.bytes_changed.cmp(&a.bytes_changed));
        top_directories.truncate(8);

        Ok(AuthorSpecialization {
            email: email_owned,
            top_languages,
            top_directories,
            total_files_touched: total_files.len() as u32,
        })
    })
}

pub fn get_coauthor_pairs_impl(
    db: &crate::db::Db,
    id: i64,
    limit: usize,
) -> AppResult<Vec<CoauthorPair>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let cache_key = format!("coauthors:{}", limit);
    cached(db, id, &head, &cache_key, move || {
        let repo = open(&repo_meta.path)?;

        struct Acc {
            a_name: String,
            b_name: String,
            count: u32,
            last: DateTime<Utc>,
        }
        let mut by_pair: HashMap<(String, String), Acc> = HashMap::new();

        let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
        for oid in walk(&repo)? {
            let oid = oid?;
            if !seen.insert(oid) {
                continue;
            }
            let commit = repo.find_commit(oid)?;
            let author_email = commit.author().email().unwrap_or("").to_lowercase();
            let author_name = commit.author().name().unwrap_or("unknown").to_string();
            if author_email.is_empty() {
                continue;
            }
            let body = commit.message().unwrap_or("");
            let coauthors = parse_coauthored_by(body);
            if coauthors.is_empty() {
                continue;
            }
            let ts = commit_time(&commit);
            for (cname, cemail) in coauthors {
                let cemail_lower = cemail.to_lowercase();
                if cemail_lower == author_email {
                    continue;
                }
                let (a_name, a_email, b_name, b_email) = if author_email < cemail_lower {
                    (
                        author_name.clone(),
                        author_email.clone(),
                        cname,
                        cemail_lower,
                    )
                } else {
                    (
                        cname,
                        cemail_lower,
                        author_name.clone(),
                        author_email.clone(),
                    )
                };
                let key = (a_email.clone(), b_email.clone());
                let acc = by_pair.entry(key).or_insert(Acc {
                    a_name: a_name.clone(),
                    b_name: b_name.clone(),
                    count: 0,
                    last: ts,
                });
                acc.count = acc.count.saturating_add(1);
                if ts > acc.last {
                    acc.last = ts;
                }
            }
        }

        let mut out: Vec<CoauthorPair> = by_pair
            .into_iter()
            .map(|((a_email, b_email), acc)| CoauthorPair {
                a_name: acc.a_name,
                a_email,
                b_name: acc.b_name,
                b_email,
                joint_commits: acc.count,
                last_collab_at: acc.last.to_rfc3339(),
            })
            .collect();
        out.sort_by(|x, y| {
            y.joint_commits
                .cmp(&x.joint_commits)
                .then_with(|| y.last_collab_at.cmp(&x.last_collab_at))
        });
        out.truncate(limit);
        Ok(out)
    })
}

fn parse_coauthored_by(body: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim();
        if !trimmed.to_ascii_lowercase().starts_with("co-authored-by:") {
            continue;
        }
        let rest = trimmed[15..].trim();
        // Format: "Name <email>"
        let lt = rest.find('<');
        let gt = rest.rfind('>');
        if let (Some(l), Some(g)) = (lt, gt) {
            if g > l + 1 {
                let name = rest[..l].trim().trim_end_matches(',').trim().to_string();
                let email = rest[l + 1..g].trim().to_string();
                if !email.is_empty() {
                    out.push((name, email));
                }
            }
        }
    }
    out
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
                .filter(|e| {
                    author_first_month
                        .get(*e)
                        .map(|fm| fm == m)
                        .unwrap_or(false)
                })
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
                prev.iter().filter(|e| !active_set.contains(*e)).count() as u32
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

pub fn get_file_couplings_impl(
    db: &crate::db::Db,
    id: i64,
    limit: usize,
    since: Option<String>,
) -> AppResult<Vec<FileCoupling>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let since_dt = since.as_deref().and_then(parse_date);
    let cache_key = format!(
        "couplings:{}:since={}",
        limit,
        since.as_deref().unwrap_or("")
    );
    cached(db, id, &head, &cache_key, move || {
        let repo = open(&repo_meta.path)?;

        let mut counts: HashMap<(String, String), u32> = HashMap::new();

        walk_diffs_since(&repo, since_dt, |_commit, diff| {
            let count = diff.deltas().len();
            if !(2..=50).contains(&count) {
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
    since: Option<String>,
) -> AppResult<Vec<DirectoryHotspot>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let since_dt = since.as_deref().and_then(parse_date);
    let cache_key = format!(
        "dirHotspots:{}:{}:since={}",
        max_depth,
        limit,
        since.as_deref().unwrap_or("")
    );
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

        walk_diffs_since(&repo, since_dt, |commit, diff| {
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

pub fn get_repo_health_impl(db: &crate::db::Db, id: i64) -> AppResult<RepoHealth> {
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
                    if has_readme && has_docs_dir && has_tests {
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
