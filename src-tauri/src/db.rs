use std::path::PathBuf;

use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection};

use crate::error::{AppError, AppResult};

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: PathBuf) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(&path)?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS repositories (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                name            TEXT NOT NULL,
                path            TEXT NOT NULL UNIQUE,
                added_at        TEXT NOT NULL,
                last_indexed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS analysis_cache (
                repo_id     INTEGER NOT NULL,
                key         TEXT NOT NULL,
                head_oid    TEXT NOT NULL,
                data        BLOB NOT NULL,
                computed_at TEXT NOT NULL,
                PRIMARY KEY (repo_id, key),
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS repo_tags (
                repo_id INTEGER NOT NULL,
                tag     TEXT NOT NULL,
                PRIMARY KEY (repo_id, tag),
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tags (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL UNIQUE,
                color       TEXT NOT NULL DEFAULT 'slate',
                sort_order  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS repo_tag_links (
                repo_id INTEGER NOT NULL,
                tag_id  INTEGER NOT NULL,
                PRIMARY KEY (repo_id, tag_id),
                FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id)  REFERENCES tags(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_repo_tag_links_tag ON repo_tag_links(tag_id);

            -- One-shot migration from legacy repo_tags(string) → tags + repo_tag_links
            INSERT OR IGNORE INTO tags (name, color, sort_order, created_at)
                SELECT DISTINCT tag, 'slate', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                FROM repo_tags;

            INSERT OR IGNORE INTO repo_tag_links (repo_id, tag_id)
                SELECT rt.repo_id, t.id
                FROM repo_tags rt
                JOIN tags t ON t.name = rt.tag;

            DROP TABLE IF EXISTS repo_tags;
            "#,
        )?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn with<F, R>(&self, f: F) -> AppResult<R>
    where
        F: FnOnce(&Connection) -> AppResult<R>,
    {
        let guard = self.conn.lock();
        f(&guard)
    }

    pub fn get_cached(
        &self,
        repo_id: i64,
        key: &str,
        current_head: &str,
    ) -> AppResult<Option<Vec<u8>>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT data FROM analysis_cache WHERE repo_id = ?1 AND key = ?2 AND head_oid = ?3",
            )?;
            let mut rows = stmt.query(params![repo_id, key, current_head])?;
            match rows.next()? {
                Some(row) => Ok(Some(row.get::<_, Vec<u8>>(0)?)),
                None => Ok(None),
            }
        })
    }

    pub fn put_cached(
        &self,
        repo_id: i64,
        key: &str,
        head_oid: &str,
        data: &[u8],
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        self.with(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO analysis_cache (repo_id, key, head_oid, data, computed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![repo_id, key, head_oid, data, now],
            )?;
            Ok(())
        })
    }

    pub fn invalidate_cache(&self, repo_id: i64) -> AppResult<()> {
        self.with(|conn| {
            conn.execute(
                "DELETE FROM analysis_cache WHERE repo_id = ?1",
                params![repo_id],
            )?;
            Ok(())
        })
    }
}

pub fn default_db_path() -> AppResult<PathBuf> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Config("could not resolve data dir".into()))?
        .join("codesight");
    Ok(dir.join("codesight.sqlite"))
}
