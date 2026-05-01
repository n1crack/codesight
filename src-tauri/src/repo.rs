use std::collections::HashMap;
use std::path::{Path, PathBuf};

use chrono::Utc;
use git2::Repository as GitRepository;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::db::Db;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagWithStats {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub sort_order: i32,
    pub repo_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub added_at: String,
    pub last_indexed_at: Option<String>,
    #[serde(default)]
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredRepo {
    pub path: String,
    pub name: String,
}

const ALLOWED_COLORS: &[&str] = &[
    "slate", "red", "orange", "amber", "emerald", "sky", "indigo", "fuchsia",
];

fn validate_color(color: &str) -> AppResult<String> {
    if ALLOWED_COLORS.contains(&color) {
        Ok(color.to_string())
    } else {
        Err(AppError::Other(format!("invalid color: {}", color)))
    }
}

fn validate_tag_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Other("tag name required".into()));
    }
    if trimmed.len() > 32 {
        return Err(AppError::Other("tag name max 32 chars".into()));
    }
    Ok(trimmed.to_string())
}

fn row_to_repo(row: &rusqlite::Row<'_>) -> rusqlite::Result<Repository> {
    Ok(Repository {
        id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        added_at: row.get(3)?,
        last_indexed_at: row.get(4)?,
        tags: Vec::new(),
    })
}

fn validate_repo(path: &Path) -> AppResult<()> {
    GitRepository::open(path)
        .map(|_| ())
        .map_err(|_| AppError::NotARepo(path.display().to_string()))
}

fn derive_name(path: &Path) -> String {
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| path.display().to_string())
}

fn load_all_tags(conn: &rusqlite::Connection) -> AppResult<HashMap<i64, Vec<Tag>>> {
    let mut stmt = conn.prepare(
        "SELECT rtl.repo_id, t.id, t.name, t.color, t.sort_order
         FROM repo_tag_links rtl
         JOIN tags t ON t.id = rtl.tag_id
         ORDER BY t.sort_order, t.name",
    )?;
    let mut rows = stmt.query([])?;
    let mut map: HashMap<i64, Vec<Tag>> = HashMap::new();
    while let Some(row) = rows.next()? {
        let repo_id: i64 = row.get(0)?;
        let tag = Tag {
            id: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3)?,
            sort_order: row.get(4)?,
        };
        map.entry(repo_id).or_default().push(tag);
    }
    Ok(map)
}

pub fn add_repository_impl(db: &Db, path_str: &str) -> AppResult<Repository> {
    let path = PathBuf::from(path_str);
    if !path.exists() {
        return Err(AppError::NotARepo(path_str.into()));
    }
    validate_repo(&path)?;

    let canonical = path.canonicalize()?;
    let canonical_str = canonical.display().to_string();
    let name = derive_name(&canonical);
    let added_at = Utc::now().to_rfc3339();

    db.with(|conn| {
        conn.execute(
            "INSERT INTO repositories (name, path, added_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(path) DO UPDATE SET name = excluded.name",
            params![name, canonical_str, added_at],
        )?;
        let mut stmt = conn.prepare(
            "SELECT id, name, path, added_at, last_indexed_at FROM repositories WHERE path = ?1",
        )?;
        let repo = stmt.query_row(params![canonical_str], row_to_repo)?;
        Ok(repo)
    })
}

pub fn list_repositories_impl(db: &Db) -> AppResult<Vec<Repository>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, path, added_at, last_indexed_at FROM repositories ORDER BY added_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_repo)?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        let tags_map = load_all_tags(conn)?;
        for r in out.iter_mut() {
            if let Some(t) = tags_map.get(&r.id) {
                r.tags = t.clone();
            }
        }
        Ok(out)
    })
}

pub fn remove_repository_impl(db: &Db, id: i64) -> AppResult<()> {
    db.with(|conn| {
        conn.execute("DELETE FROM repositories WHERE id = ?1", params![id])?;
        Ok(())
    })
}

pub fn scan_folder_impl(db: &Db, folder: &str) -> AppResult<Vec<Repository>> {
    let discovered = discover_repos_impl(folder)?;
    let mut added: Vec<Repository> = Vec::new();
    for d in discovered {
        if let Ok(r) = add_repository_impl(db, &d.path) {
            added.push(r);
        }
    }
    Ok(added)
}

pub fn discover_repos_impl(folder: &str) -> AppResult<Vec<DiscoveredRepo>> {
    let root = PathBuf::from(folder);
    if !root.is_dir() {
        return Err(AppError::Other(format!(
            "{} is not a directory",
            root.display()
        )));
    }

    let mut found: Vec<DiscoveredRepo> = Vec::new();
    let walker = WalkDir::new(&root)
        .max_depth(6)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !matches!(
                name.as_ref(),
                "node_modules" | "target" | "dist" | "build" | ".next" | "vendor"
            )
        });

    for entry in walker.flatten() {
        if entry.file_type().is_dir() && entry.file_name() == ".git" {
            if let Some(parent) = entry.path().parent() {
                if GitRepository::open(parent).is_ok() {
                    let canonical = parent.canonicalize().unwrap_or_else(|_| parent.to_path_buf());
                    let name = derive_name(&canonical);
                    found.push(DiscoveredRepo {
                        path: canonical.display().to_string(),
                        name,
                    });
                }
            }
        }
    }
    found.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(found)
}

pub fn add_discovered_repos_impl(
    db: &Db,
    paths: Vec<String>,
    tag_id: Option<i64>,
) -> AppResult<Vec<Repository>> {
    let mut added: Vec<Repository> = Vec::new();
    for p in paths {
        if let Ok(r) = add_repository_impl(db, &p) {
            if let Some(tid) = tag_id {
                let _ = assign_tag_impl(db, r.id, tid);
            }
            let fresh = get_repository_impl(db, r.id).unwrap_or(r);
            added.push(fresh);
        }
    }
    Ok(added)
}

pub fn get_repository_impl(db: &Db, id: i64) -> AppResult<Repository> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, path, added_at, last_indexed_at FROM repositories WHERE id = ?1",
        )?;
        let mut repo = stmt
            .query_row(params![id], row_to_repo)
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::RepoNotFound,
                other => other.into(),
            })?;
        let mut tag_stmt = conn.prepare(
            "SELECT t.id, t.name, t.color, t.sort_order
             FROM repo_tag_links rtl
             JOIN tags t ON t.id = rtl.tag_id
             WHERE rtl.repo_id = ?1
             ORDER BY t.sort_order, t.name",
        )?;
        let rows = tag_stmt.query_map(params![id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                sort_order: row.get(3)?,
            })
        })?;
        for t in rows {
            repo.tags.push(t?);
        }
        Ok(repo)
    })
}

// ---------- Tag CRUD ----------

pub fn create_tag_impl(db: &Db, name: &str, color: &str) -> AppResult<Tag> {
    let name = validate_tag_name(name)?;
    let color = validate_color(color)?;
    let now = Utc::now().to_rfc3339();
    db.with(|conn| {
        conn.execute(
            "INSERT INTO tags (name, color, sort_order, created_at)
             VALUES (?1, ?2, COALESCE((SELECT MAX(sort_order)+1 FROM tags), 0), ?3)",
            params![name, color, now],
        )?;
        let id = conn.last_insert_rowid();
        Ok(Tag {
            id,
            name,
            color,
            sort_order: 0,
        })
    })
}

pub fn update_tag_impl(
    db: &Db,
    id: i64,
    name: Option<String>,
    color: Option<String>,
) -> AppResult<()> {
    let name = name.map(|n| validate_tag_name(&n)).transpose()?;
    let color = color.map(|c| validate_color(&c)).transpose()?;
    db.with(|conn| {
        if let Some(n) = name {
            conn.execute("UPDATE tags SET name = ?1 WHERE id = ?2", params![n, id])?;
        }
        if let Some(c) = color {
            conn.execute("UPDATE tags SET color = ?1 WHERE id = ?2", params![c, id])?;
        }
        Ok(())
    })
}

pub fn delete_tag_impl(db: &Db, id: i64) -> AppResult<()> {
    db.with(|conn| {
        conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
        Ok(())
    })
}

pub fn list_tags_with_stats_impl(db: &Db) -> AppResult<Vec<TagWithStats>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, t.color, t.sort_order,
                    (SELECT COUNT(*) FROM repo_tag_links rtl WHERE rtl.tag_id = t.id) as cnt
             FROM tags t
             ORDER BY t.sort_order, t.name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(TagWithStats {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                sort_order: row.get(3)?,
                repo_count: row.get::<_, i64>(4)? as u32,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    })
}

pub fn assign_tag_impl(db: &Db, repo_id: i64, tag_id: i64) -> AppResult<()> {
    db.with(|conn| {
        conn.execute(
            "INSERT OR IGNORE INTO repo_tag_links (repo_id, tag_id) VALUES (?1, ?2)",
            params![repo_id, tag_id],
        )?;
        Ok(())
    })
}

pub fn unassign_tag_impl(db: &Db, repo_id: i64, tag_id: i64) -> AppResult<()> {
    db.with(|conn| {
        conn.execute(
            "DELETE FROM repo_tag_links WHERE repo_id = ?1 AND tag_id = ?2",
            params![repo_id, tag_id],
        )?;
        Ok(())
    })
}

pub fn set_tag_repos_impl(db: &Db, tag_id: i64, repo_ids: Vec<i64>) -> AppResult<()> {
    db.with(|conn| {
        conn.execute(
            "DELETE FROM repo_tag_links WHERE tag_id = ?1",
            params![tag_id],
        )?;
        let mut stmt = conn.prepare(
            "INSERT OR IGNORE INTO repo_tag_links (repo_id, tag_id) VALUES (?1, ?2)",
        )?;
        for rid in repo_ids {
            stmt.execute(params![rid, tag_id])?;
        }
        Ok(())
    })
}
