use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

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
            "INSERT INTO repositories (name, path, added_at, sort_order)
             VALUES (?1, ?2, ?3,
                COALESCE((SELECT MAX(sort_order) + 1 FROM repositories), 0))
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
            "SELECT id, name, path, added_at, last_indexed_at FROM repositories
             ORDER BY sort_order ASC, added_at DESC",
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

pub fn reorder_repositories_impl(db: &Db, ordered_ids: Vec<i64>) -> AppResult<()> {
    db.with(|conn| {
        let tx = conn.unchecked_transaction()?;
        for (idx, id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE repositories SET sort_order = ?1 WHERE id = ?2",
                params![idx as i64, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    })
}

// ---------- IDE open ----------

// Whitelist of IDE binaries we will spawn. Covered:
// vscode/cursor/sublime/jetbrains family/zed/helix/neovim/emacs/system-default
const ALLOWED_IDE_BINS: &[&str] = &[
    "code",
    "code-insiders",
    "cursor",
    "subl",
    "idea",
    "webstorm",
    "phpstorm",
    "pycharm",
    "rubymine",
    "rustrover",
    "goland",
    "clion",
    "datagrip",
    "rider",
    "fleet",
    "zed",
    "hx",
];

pub fn open_in_ide_impl(ide: &str, path: &str) -> AppResult<()> {
    if ide == "system" {
        #[cfg(target_os = "macos")]
        let result = Command::new("open").arg(path).spawn();
        #[cfg(target_os = "windows")]
        let result = Command::new("cmd").args(["/C", "start", "", path]).spawn();
        #[cfg(all(unix, not(target_os = "macos")))]
        let result = Command::new("xdg-open").arg(path).spawn();
        result.map_err(|e| AppError::Other(format!("system open failed: {}", e)))?;
        return Ok(());
    }
    if !ALLOWED_IDE_BINS.contains(&ide) {
        return Err(AppError::Other(format!("unsupported ide: {}", ide)));
    }
    Command::new(ide)
        .arg(path)
        .spawn()
        .map_err(|e| AppError::Other(format!("could not launch {}: {}", ide, e)))?;
    Ok(())
}

// ---------- Terminal open ----------

// Whitelist of terminal identifiers we accept.
// On macOS these map to .app bundle names launched via `open -a`.
// On Linux/Windows they map to executable invocations with cwd flags.
const ALLOWED_TERMINALS: &[&str] = &[
    "system",
    "terminal",
    "iterm",
    "warp",
    "ghostty",
    "alacritty",
    "kitty",
    "wezterm",
    "hyper",
    "tabby",
    "gnome-terminal",
    "konsole",
    "xterm",
    "windows-terminal",
];

pub fn open_in_terminal_impl(terminal: &str, path: &str) -> AppResult<()> {
    if !ALLOWED_TERMINALS.contains(&terminal) {
        return Err(AppError::Other(format!("unsupported terminal: {}", terminal)));
    }

    let result = spawn_terminal(terminal, path);
    result.map_err(|e| AppError::Other(format!("could not launch terminal '{}': {}", terminal, e)))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn spawn_terminal(terminal: &str, path: &str) -> std::io::Result<std::process::Child> {
    // macOS apps are launched by bundle name via `open -a`; the trailing path
    // becomes the working directory of the new window.
    let app = match terminal {
        "system" | "terminal" => "Terminal",
        "iterm" => "iTerm",
        "warp" => "Warp",
        "ghostty" => "Ghostty",
        "alacritty" => "Alacritty",
        "kitty" => "kitty",
        "wezterm" => "WezTerm",
        "hyper" => "Hyper",
        "tabby" => "Tabby",
        // Linux/Windows-only choices fall back to system Terminal on macOS.
        _ => "Terminal",
    };
    Command::new("open").args(["-a", app, path]).spawn()
}

#[cfg(target_os = "windows")]
fn spawn_terminal(terminal: &str, path: &str) -> std::io::Result<std::process::Child> {
    match terminal {
        "system" | "windows-terminal" => Command::new("cmd")
            .args(["/C", "start", "wt", "-d", path])
            .spawn(),
        "alacritty" => Command::new("alacritty")
            .args(["--working-directory", path])
            .spawn(),
        "kitty" => Command::new("kitty").args(["-d", path]).spawn(),
        "wezterm" => Command::new("wezterm")
            .args(["start", "--cwd", path])
            .spawn(),
        "ghostty" => Command::new("ghostty")
            .args([&format!("--working-directory={}", path)])
            .spawn(),
        "tabby" => Command::new("tabby").args(["open", path]).spawn(),
        // No-op for macOS-only choices on Windows: fall back to default cmd.
        _ => Command::new("cmd")
            .args(["/C", "start", "cmd", "/K", "cd", "/d", path])
            .spawn(),
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn spawn_terminal(terminal: &str, path: &str) -> std::io::Result<std::process::Child> {
    match terminal {
        "system" => Command::new("x-terminal-emulator")
            .current_dir(path)
            .spawn()
            .or_else(|_| Command::new("xterm").current_dir(path).spawn()),
        "alacritty" => Command::new("alacritty")
            .args(["--working-directory", path])
            .spawn(),
        "kitty" => Command::new("kitty").args(["-d", path]).spawn(),
        "wezterm" => Command::new("wezterm")
            .args(["start", "--cwd", path])
            .spawn(),
        "ghostty" => Command::new("ghostty")
            .args([&format!("--working-directory={}", path)])
            .spawn(),
        "gnome-terminal" => Command::new("gnome-terminal")
            .args([&format!("--working-directory={}", path)])
            .spawn(),
        "konsole" => Command::new("konsole").args(["--workdir", path]).spawn(),
        "xterm" => Command::new("xterm").current_dir(path).spawn(),
        "hyper" => Command::new("hyper").arg(path).spawn(),
        "tabby" => Command::new("tabby").args(["open", path]).spawn(),
        // macOS / Windows-only choices fall back to xterm on Linux.
        _ => Command::new("xterm").current_dir(path).spawn(),
    }
}

// ---------- Git client open ----------

const ALLOWED_GIT_CLIENTS: &[&str] = &[
    "system",
    "tower",
    "sourcetree",
    "gitkraken",
    "fork",
    "gitup",
    "smartgit",
    "sublime-merge",
    "github-desktop",
];

pub fn open_in_git_client_impl(client: &str, path: &str) -> AppResult<()> {
    if !ALLOWED_GIT_CLIENTS.contains(&client) {
        return Err(AppError::Other(format!("unsupported git client: {}", client)));
    }
    spawn_git_client(client, path)
        .map_err(|e| AppError::Other(format!("could not launch git client '{}': {}", client, e)))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn spawn_git_client(client: &str, path: &str) -> std::io::Result<std::process::Child> {
    let app = match client {
        "system" | "tower" => "Tower",
        "sourcetree" => "Sourcetree",
        "gitkraken" => "GitKraken",
        "fork" => "Fork",
        "gitup" => "GitUp",
        "smartgit" => "SmartGit",
        "sublime-merge" => "Sublime Merge",
        "github-desktop" => "GitHub Desktop",
        _ => return Err(std::io::Error::other("unsupported")),
    };
    Command::new("open").args(["-a", app, path]).spawn()
}

#[cfg(target_os = "windows")]
fn spawn_git_client(client: &str, path: &str) -> std::io::Result<std::process::Child> {
    match client {
        "sourcetree" => Command::new("SourceTree.exe").arg(path).spawn(),
        "gitkraken" => Command::new("gitkraken").args(["--path", path]).spawn(),
        "fork" => Command::new("Fork.exe").arg(path).spawn(),
        "smartgit" => Command::new("smartgit.exe").arg(path).spawn(),
        "sublime-merge" => Command::new("smerge").arg(path).spawn(),
        "github-desktop" => Command::new("github").arg(path).spawn(),
        // No "system" winner on Windows — fall back to the folder so the user can pick.
        _ => Command::new("explorer").arg(path).spawn(),
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn spawn_git_client(client: &str, path: &str) -> std::io::Result<std::process::Child> {
    match client {
        "gitkraken" => Command::new("gitkraken").args(["--path", path]).spawn(),
        "smartgit" => Command::new("smartgit").arg(path).spawn(),
        "sublime-merge" => Command::new("smerge").arg(path).spawn(),
        "github-desktop" => Command::new("github-desktop").arg(path).spawn(),
        _ => Command::new("xdg-open").arg(path).spawn(),
    }
}

// ---------- Git config (view-only) ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemote {
    pub name: String,
    pub url: Option<String>,
    pub push_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHook {
    pub name: String,
    pub path: String,
    pub executable: bool,
    pub managed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConfigView {
    pub repo_path: String,
    pub head_branch: Option<String>,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub global_user_name: Option<String>,
    pub global_user_email: Option<String>,
    pub default_branch: Option<String>,
    pub commit_gpg_sign: Option<String>,
    pub core_autocrlf: Option<String>,
    pub core_filemode: Option<String>,
    pub core_ignorecase: Option<String>,
    pub remotes: Vec<GitRemote>,
    pub hooks: Vec<GitHook>,
}

pub fn get_git_config_impl(db: &Db, id: i64) -> AppResult<GitConfigView> {
    let repo_meta = get_repository_impl(db, id)?;
    let repo = GitRepository::open(&repo_meta.path)
        .map_err(|e| AppError::Other(format!("open repo failed: {}", e)))?;

    let local = repo.config().ok();
    let global = git2::Config::open_default().ok();

    let read_local = |key: &str| -> Option<String> {
        local.as_ref().and_then(|c| c.get_string(key).ok())
    };
    let read_global = |key: &str| -> Option<String> {
        global.as_ref().and_then(|c| c.get_string(key).ok())
    };

    let head_branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let mut remotes: Vec<GitRemote> = Vec::new();
    if let Ok(names) = repo.remotes() {
        for name in names.iter().flatten() {
            if let Ok(remote) = repo.find_remote(name) {
                remotes.push(GitRemote {
                    name: name.to_string(),
                    url: remote.url().map(|s| s.to_string()),
                    push_url: remote.pushurl().map(|s| s.to_string()),
                });
            }
        }
    }

    let mut hooks: Vec<GitHook> = Vec::new();
    let hooks_dir = PathBuf::from(&repo_meta.path).join(".git").join("hooks");
    if hooks_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&hooks_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let name = match path.file_name().and_then(|s| s.to_str()) {
                    Some(s) => s.to_string(),
                    None => continue,
                };
                if name.ends_with(".sample") {
                    continue;
                }
                let executable = is_executable(&path);
                let managed = std::fs::read_to_string(&path)
                    .map(|c| c.contains(CODESIGHT_HOOK_MARKER))
                    .unwrap_or(false);
                hooks.push(GitHook {
                    name,
                    path: path.display().to_string(),
                    executable,
                    managed,
                });
            }
        }
    }
    hooks.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(GitConfigView {
        repo_path: repo_meta.path.clone(),
        head_branch,
        user_name: read_local("user.name"),
        user_email: read_local("user.email"),
        global_user_name: read_global("user.name"),
        global_user_email: read_global("user.email"),
        default_branch: read_local("init.defaultbranch")
            .or_else(|| read_global("init.defaultbranch")),
        commit_gpg_sign: read_local("commit.gpgsign"),
        core_autocrlf: read_local("core.autocrlf"),
        core_filemode: read_local("core.filemode"),
        core_ignorecase: read_local("core.ignorecase"),
        remotes,
        hooks,
    })
}

// ---------- Git config (mutating) ----------

/// Set or clear `user.name` / `user.email` on the local repo config.
/// An empty `value` removes the entry so the global value takes over.
pub fn set_git_user_impl(
    db: &Db,
    id: i64,
    name: Option<String>,
    email: Option<String>,
) -> AppResult<()> {
    let repo_meta = get_repository_impl(db, id)?;
    let repo = GitRepository::open(&repo_meta.path)
        .map_err(|e| AppError::Other(format!("open repo failed: {}", e)))?;
    let mut config = repo
        .config()
        .map_err(|e| AppError::Other(format!("open config failed: {}", e)))?;

    apply_string_entry(&mut config, "user.name", name.as_deref())?;
    apply_string_entry(&mut config, "user.email", email.as_deref())?;
    Ok(())
}

fn apply_string_entry(
    config: &mut git2::Config,
    key: &str,
    value: Option<&str>,
) -> AppResult<()> {
    match value {
        Some(v) if !v.trim().is_empty() => config
            .set_str(key, v.trim())
            .map_err(|e| AppError::Other(format!("set {} failed: {}", key, e))),
        _ => match config.remove(key) {
            Ok(_) => Ok(()),
            Err(e) if e.code() == git2::ErrorCode::NotFound => Ok(()),
            Err(e) => Err(AppError::Other(format!("remove {} failed: {}", key, e))),
        },
    }
}

/// Add a new remote. Fails if a remote with the same name already exists.
pub fn add_remote_impl(db: &Db, id: i64, name: &str, url: &str) -> AppResult<()> {
    validate_remote_name(name)?;
    if url.trim().is_empty() {
        return Err(AppError::Other("remote url cannot be empty".into()));
    }
    let repo_meta = get_repository_impl(db, id)?;
    let repo = GitRepository::open(&repo_meta.path)
        .map_err(|e| AppError::Other(format!("open repo failed: {}", e)))?;
    repo.remote(name, url.trim())
        .map_err(|e| AppError::Other(format!("add remote failed: {}", e)))?;
    Ok(())
}

/// Update an existing remote's fetch URL (and optionally push URL).
pub fn set_remote_url_impl(
    db: &Db,
    id: i64,
    name: &str,
    url: &str,
    push_url: Option<String>,
) -> AppResult<()> {
    validate_remote_name(name)?;
    if url.trim().is_empty() {
        return Err(AppError::Other("remote url cannot be empty".into()));
    }
    let repo_meta = get_repository_impl(db, id)?;
    let repo = GitRepository::open(&repo_meta.path)
        .map_err(|e| AppError::Other(format!("open repo failed: {}", e)))?;
    repo.remote_set_url(name, url.trim())
        .map_err(|e| AppError::Other(format!("set remote url failed: {}", e)))?;
    match push_url.as_deref().map(str::trim) {
        Some(p) if !p.is_empty() => repo
            .remote_set_pushurl(name, Some(p))
            .map_err(|e| AppError::Other(format!("set remote pushurl failed: {}", e)))?,
        _ => repo
            .remote_set_pushurl(name, None)
            .map_err(|e| AppError::Other(format!("clear remote pushurl failed: {}", e)))?,
    }
    Ok(())
}

pub fn remove_remote_impl(db: &Db, id: i64, name: &str) -> AppResult<()> {
    validate_remote_name(name)?;
    let repo_meta = get_repository_impl(db, id)?;
    let repo = GitRepository::open(&repo_meta.path)
        .map_err(|e| AppError::Other(format!("open repo failed: {}", e)))?;
    repo.remote_delete(name)
        .map_err(|e| AppError::Other(format!("remove remote failed: {}", e)))?;
    Ok(())
}

fn validate_remote_name(name: &str) -> AppResult<()> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Other("remote name cannot be empty".into()));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(AppError::Other(format!(
            "invalid remote name: {} (allowed: alnum, '-', '_', '.')",
            trimmed
        )));
    }
    Ok(())
}

// ---------- Git hook templates ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookTemplate {
    pub id: &'static str,
    pub hook_name: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub body: &'static str,
}

const HOOK_TEMPLATES: &[HookTemplate] = &[
    HookTemplate {
        id: "conventional-commit-msg",
        hook_name: "commit-msg",
        title: "Conventional Commits",
        description: "Reject commit messages that don't follow the conventional commits format (feat / fix / chore / etc.).",
        body: r#"#!/usr/bin/env bash
# Installed by codesight: enforce Conventional Commits subject format.
set -eu

msg_file="${1:?missing commit message file}"
first_line=$(head -n 1 "$msg_file" || true)

# Allow merges, reverts, and fixups so rebases stay smooth.
if [[ "$first_line" =~ ^(Merge|Revert|fixup!|squash!)\  ]]; then
  exit 0
fi

pattern='^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\([^)]+\))?!?: .{1,72}$'
if [[ ! "$first_line" =~ $pattern ]]; then
  echo "✖ commit message does not follow Conventional Commits."
  echo "  Expected:  <type>(<scope>): <subject>"
  echo "  Example:   feat(auth): add OAuth callback handler"
  exit 1
fi
"#,
    },
    HookTemplate {
        id: "trailing-whitespace-pre-commit",
        hook_name: "pre-commit",
        title: "Strip trailing whitespace",
        description: "Block commits that introduce trailing whitespace on staged lines.",
        body: r#"#!/usr/bin/env bash
# Installed by codesight: warn on trailing whitespace in staged hunks.
set -eu

if git diff --cached --check; then
  exit 0
fi
echo
echo "✖ Found trailing whitespace or whitespace errors in staged changes."
echo "  Run \`git diff --cached --check\` to see them, then re-stage."
exit 1
"#,
    },
    HookTemplate {
        id: "protected-branch-pre-push",
        hook_name: "pre-push",
        title: "Block direct push to main",
        description: "Refuse pushes that update `main` or `master` directly. Override with --no-verify when intentional.",
        body: r#"#!/usr/bin/env bash
# Installed by codesight: refuse direct pushes to default branches.
set -eu

protected_re='^refs/heads/(main|master)$'

while read -r local_ref local_sha remote_ref remote_sha; do
  if [[ "$remote_ref" =~ $protected_re ]]; then
    echo "✖ Refusing direct push to $remote_ref."
    echo "  Open a pull request, or override with: git push --no-verify"
    exit 1
  fi
done

exit 0
"#,
    },
];

const CODESIGHT_HOOK_MARKER: &str = "Installed by codesight";

pub fn list_hook_templates_impl() -> AppResult<Vec<HookTemplate>> {
    Ok(HOOK_TEMPLATES.to_vec())
}

fn find_template(id: &str) -> AppResult<&'static HookTemplate> {
    HOOK_TEMPLATES
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| AppError::Other(format!("unknown hook template: {}", id)))
}

fn hook_path(repo_path: &str, hook_name: &str) -> PathBuf {
    PathBuf::from(repo_path).join(".git").join("hooks").join(hook_name)
}

pub fn install_hook_impl(db: &Db, id: i64, template_id: &str) -> AppResult<()> {
    let template = find_template(template_id)?;
    let repo_meta = get_repository_impl(db, id)?;
    let target = hook_path(&repo_meta.path, template.hook_name);

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Other(format!("create hooks dir failed: {}", e)))?;
    }

    if target.exists() {
        let existing = std::fs::read_to_string(&target).unwrap_or_default();
        if !existing.contains(CODESIGHT_HOOK_MARKER) {
            return Err(AppError::Other(format!(
                "{} already exists and was not installed by codesight; refusing to overwrite",
                template.hook_name
            )));
        }
    }

    std::fs::write(&target, template.body)
        .map_err(|e| AppError::Other(format!("write hook failed: {}", e)))?;
    set_executable(&target)?;
    Ok(())
}

pub fn uninstall_hook_impl(db: &Db, id: i64, hook_name: &str) -> AppResult<()> {
    let repo_meta = get_repository_impl(db, id)?;
    let target = hook_path(&repo_meta.path, hook_name);
    if !target.exists() {
        return Ok(());
    }
    let existing = std::fs::read_to_string(&target).unwrap_or_default();
    if !existing.contains(CODESIGHT_HOOK_MARKER) {
        return Err(AppError::Other(format!(
            "{} was not installed by codesight; refusing to delete",
            hook_name
        )));
    }
    std::fs::remove_file(&target)
        .map_err(|e| AppError::Other(format!("remove hook failed: {}", e)))?;
    Ok(())
}

pub fn read_hook_impl(db: &Db, id: i64, hook_name: &str) -> AppResult<String> {
    let repo_meta = get_repository_impl(db, id)?;
    let target = hook_path(&repo_meta.path, hook_name);
    std::fs::read_to_string(&target)
        .map_err(|e| AppError::Other(format!("read hook failed: {}", e)))
}

#[cfg(unix)]
fn set_executable(path: &Path) -> AppResult<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)
        .map_err(|e| AppError::Other(format!("stat hook failed: {}", e)))?
        .permissions();
    perms.set_mode(perms.mode() | 0o755);
    std::fs::set_permissions(path, perms)
        .map_err(|e| AppError::Other(format!("chmod hook failed: {}", e)))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> AppResult<()> {
    Ok(())
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(_path: &Path) -> bool {
    true // assume executable on non-unix
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
