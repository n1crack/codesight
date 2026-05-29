use std::collections::HashMap;

use git2::Sort;

use crate::error::{AppError, AppResult};
use crate::repo::get_repository_impl;

use super::{
    cached, commit_time, current_head, open, CommitDetail, DiffLine, FilePatch, GraphCommit,
    GraphRef, Hunk,
};

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

    let oid =
        git2::Oid::from_str(oid_hex).map_err(|e| AppError::Other(format!("invalid oid: {}", e)))?;
    let commit = repo.find_commit(oid)?;

    let new_tree = commit.tree()?;
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.ignore_filemode(true);
    let diff =
        repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&new_tree), Some(&mut diff_opts))?;
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

        let is_binary = delta.flags().contains(git2::DiffFlags::BINARY);

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
                        let mut content = String::from_utf8_lossy(line.content()).to_string();
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
