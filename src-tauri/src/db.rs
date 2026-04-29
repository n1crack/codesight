use std::path::PathBuf;

use parking_lot::Mutex;
use rusqlite::Connection;

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
}

pub fn default_db_path() -> AppResult<PathBuf> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| AppError::Config("could not resolve data dir".into()))?
        .join("codesight");
    Ok(dir.join("codesight.sqlite"))
}
