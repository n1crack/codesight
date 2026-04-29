use std::path::{Path, PathBuf};

use chrono::Utc;
use git2::Repository as GitRepository;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::db::Db;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub added_at: String,
    pub last_indexed_at: Option<String>,
}

fn row_to_repo(row: &rusqlite::Row<'_>) -> rusqlite::Result<Repository> {
    Ok(Repository {
        id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        added_at: row.get(3)?,
        last_indexed_at: row.get(4)?,
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
    let root = PathBuf::from(folder);
    if !root.is_dir() {
        return Err(AppError::Other(format!(
            "{} is not a directory",
            root.display()
        )));
    }

    let mut found_paths: Vec<PathBuf> = Vec::new();
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
                    found_paths.push(parent.to_path_buf());
                }
            }
        }
    }

    let mut added: Vec<Repository> = Vec::new();
    for p in found_paths {
        if let Ok(r) = add_repository_impl(db, &p.display().to_string()) {
            added.push(r);
        }
    }
    Ok(added)
}

pub fn get_repository_impl(db: &Db, id: i64) -> AppResult<Repository> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, path, added_at, last_indexed_at FROM repositories WHERE id = ?1",
        )?;
        stmt.query_row(params![id], row_to_repo)
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::RepoNotFound,
                other => other.into(),
            })
    })
}
