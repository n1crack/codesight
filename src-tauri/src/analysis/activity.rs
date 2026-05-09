use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Timelike, Utc};
use git2::{Repository as GitRepository, Sort};
use rayon::prelude::*;

use crate::error::{AppError, AppResult};
use crate::repo::get_repository_impl;

use super::{
    bucket_key, cached, classify_language, classify_subject, commit_time, current_head, open,
    parse_date, walk, walk_diffs, walk_diffs_since, ActivityPatterns, BranchInfo, ChurnPoint,
    CommitInfo, CommitMessageStats, Contributor, FileHotspot, HeatmapData, HeatmapDay,
    LanguageStat, RepoSparkline, RepoSummary, TagInfo, TimelinePoint,
};

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
    since: Option<String>,
) -> AppResult<Vec<FileHotspot>> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let since_dt = since.as_deref().and_then(parse_date);
    let cache_key = format!(
        "fileHotspots:{}:since={}",
        limit,
        since.as_deref().unwrap_or("")
    );
    cached(db, id, &head, &cache_key, move || {
    let repo = open(&repo_meta.path)?;

    struct Acc {
        commits: u32,
        additions: u32,
        deletions: u32,
        last: DateTime<Utc>,
    }
    let mut by_path: HashMap<String, Acc> = HashMap::new();

    walk_diffs_since(&repo, since_dt, |commit, diff| {
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

pub fn get_commit_message_stats_impl(
    db: &crate::db::Db,
    id: i64,
    since: Option<String>,
) -> AppResult<CommitMessageStats> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    let since_dt = since.as_deref().and_then(parse_date);
    let cache_key = format!(
        "messageStats:since={}",
        since.as_deref().unwrap_or("")
    );
    cached(db, id, &head, &cache_key, move || {
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
        if let Some(s) = since_dt {
            if commit_time(&commit) < s {
                // Sort::TIME → newer first; once below cutoff, all subsequent are older
                break;
            }
        }
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
