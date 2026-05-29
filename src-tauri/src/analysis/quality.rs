use git2::Sort;

use crate::error::AppResult;
use crate::repo::get_repository_impl;

use super::{
    cached, commit_time, current_head, open, AuthorshipReport, CodeHygieneReport, ConflictHit,
    DepManifest, DependenciesReport, GeneratedFile, GitignoreCheck, GitignoreCoverage,
    HistorySecretHit, HistorySecretReport, LargeFile, PresenceCheck, QualityReport,
    RepoHygieneReport, RiskyFile, SecretHit, SecretsHeadReport, TodoHit,
};

const MAX_BLOB_SCAN_BYTES: usize = 512 * 1024; // 512 KB cap per file

struct SecretPattern {
    name: &'static str,
    severity: &'static str,
    pattern: &'static str,
}

const SECRET_PATTERNS: &[SecretPattern] = &[
    SecretPattern {
        name: "AWS Access Key",
        severity: "high",
        pattern: r"\bAKIA[0-9A-Z]{16}\b",
    },
    SecretPattern {
        name: "GitHub PAT",
        severity: "high",
        pattern: r"\bghp_[A-Za-z0-9]{36}\b",
    },
    SecretPattern {
        name: "GitHub OAuth",
        severity: "high",
        pattern: r"\bgh[ousr]_[A-Za-z0-9_]{36}\b",
    },
    SecretPattern {
        name: "GitLab PAT",
        severity: "high",
        pattern: r"\bglpat-[A-Za-z0-9_-]{20}\b",
    },
    SecretPattern {
        name: "Slack Token",
        severity: "high",
        pattern: r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b",
    },
    SecretPattern {
        name: "Google API Key",
        severity: "high",
        pattern: r"\bAIza[0-9A-Za-z_\-]{35}\b",
    },
    SecretPattern {
        name: "Stripe Live Key",
        severity: "high",
        pattern: r"\bsk_live_[A-Za-z0-9]{24,}\b",
    },
    SecretPattern {
        name: "RSA Private Key",
        severity: "high",
        pattern: r"-----BEGIN RSA PRIVATE KEY-----",
    },
    SecretPattern {
        name: "OpenSSH Private Key",
        severity: "high",
        pattern: r"-----BEGIN OPENSSH PRIVATE KEY-----",
    },
    SecretPattern {
        name: "PGP Private Key",
        severity: "high",
        pattern: r"-----BEGIN PGP PRIVATE KEY BLOCK-----",
    },
    SecretPattern {
        name: "Generic Secret Assignment",
        severity: "medium",
        pattern: r#"(?i)(?:secret|password|api[_-]?key|token)\s*[:=]\s*['"][A-Za-z0-9!@#$%^&*\-_+=/]{12,}['"]"#,
    },
];

struct RiskyPathPattern {
    name: &'static str,
    severity: &'static str,
    pattern: &'static str,
}

const RISKY_PATH_PATTERNS: &[RiskyPathPattern] = &[
    RiskyPathPattern {
        name: ".env file",
        severity: "high",
        pattern: r"(?i)(?:^|/)\.env(?:\.[a-z0-9-]+)?$",
    },
    RiskyPathPattern {
        name: "PEM certificate / key",
        severity: "high",
        pattern: r"(?i)\.pem$",
    },
    RiskyPathPattern {
        name: "SSH private key",
        severity: "high",
        pattern: r"(?:^|/)id_(?:rsa|ed25519|dsa|ecdsa)$",
    },
    RiskyPathPattern {
        name: "Credentials file",
        severity: "high",
        pattern: r"(?i)(?:^|/)credentials(?:\.json|\.yml|\.yaml|\.toml)?$",
    },
    RiskyPathPattern {
        name: "Secrets file",
        severity: "medium",
        pattern: r"(?i)(?:^|/)secrets?\.(?:yml|yaml|json|toml|env)$",
    },
    RiskyPathPattern {
        name: "AWS credentials",
        severity: "high",
        pattern: r"(?:^|/)\.aws/credentials$",
    },
    RiskyPathPattern {
        name: "PKCS#12 / PFX",
        severity: "high",
        pattern: r"(?i)\.(?:pfx|p12)$",
    },
    RiskyPathPattern {
        name: "Java KeyStore",
        severity: "medium",
        pattern: r"(?i)\.(?:jks|keystore)$",
    },
    RiskyPathPattern {
        name: "KeePass DB",
        severity: "medium",
        pattern: r"(?i)\.kdbx$",
    },
];

const ENV_EXAMPLE_RE: &str = r"(?i)(?:^|/)\.env\.(?:example|sample|template|dist)$";
const TODO_RE: &str = r"\b(TODO|FIXME|HACK|XXX)\b[\s:!]";

// Generated/build paths
const GENERATED_PATH_PATTERNS: &[(&str, &str)] = &[
    (r"(?:^|/)node_modules(?:/|$)", "node_modules tracked"),
    (r"(?:^|/)dist(?:/|$)", "dist/ folder tracked"),
    (r"(?:^|/)build(?:/|$)", "build/ folder tracked"),
    (r"(?:^|/)\.next(?:/|$)", ".next/ tracked"),
    (r"(?:^|/)\.nuxt(?:/|$)", ".nuxt/ tracked"),
    (r"(?:^|/)vendor(?:/|$)", "vendor/ folder tracked"),
    (r"\.min\.(?:js|css)$", "minified bundle"),
    (r"\.bundle\.js$", "bundled artifact"),
    (r"\.map$", "source map"),
];

const LARGE_FILE_BYTES: u64 = 500_000;
const CONFLICT_MARKER_RE: &str = r"^(?:<{7}|>{7}|={7}) ";

fn detect_manifest_kind(path: &str) -> Option<(&'static str, &'static str)> {
    // Returns (kind, expected_lockfile_filename or "")
    let lower = path.to_ascii_lowercase();
    let basename = lower.rsplit('/').next().unwrap_or("");
    match basename {
        "package.json" => Some(("node", "package-lock.json")),
        "cargo.toml" => Some(("rust", "Cargo.lock")),
        "requirements.txt" => Some(("python", "")),
        "pyproject.toml" => Some(("python", "poetry.lock")),
        "pipfile" => Some(("python", "Pipfile.lock")),
        "go.mod" => Some(("go", "go.sum")),
        "gemfile" => Some(("ruby", "Gemfile.lock")),
        "pom.xml" => Some(("java", "")),
        "build.gradle" | "build.gradle.kts" => Some(("gradle", "")),
        "composer.json" => Some(("php", "composer.lock")),
        _ => None,
    }
}

fn is_generic_email(email: &str) -> bool {
    let l = email.to_ascii_lowercase();
    l.is_empty()
        || l.ends_with("@example.com")
        || l.ends_with("@example.org")
        || l.ends_with("@localhost")
        || l.ends_with("@invalid")
        || l.ends_with(".local")
        || l == "root@localhost"
        || l == "root@"
        || l.starts_with("root@")
        || l.contains("@noreply.")
}

fn is_bot_author(name: &str, email: &str) -> bool {
    let n = name.to_ascii_lowercase();
    let e = email.to_ascii_lowercase();
    n.contains("[bot]")
        || n.ends_with(" bot")
        || n == "bot"
        || e.contains("[bot]")
        || e.ends_with("@bots.noreply.github.com")
        || e == "noreply@github.com"
        || n.starts_with("dependabot")
        || n.starts_with("renovate")
        || n.starts_with("github-actions")
        || n.starts_with("greenkeeper")
}

fn mask_secret(s: &str) -> String {
    let total = s.chars().count();
    if total <= 8 {
        return "*".repeat(total);
    }
    let prefix: String = s.chars().take(4).collect();
    let stars = "*".repeat(total.saturating_sub(8).min(20));
    let suffix: String = s
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    format!("{}{}{}", prefix, stars, suffix)
}

pub fn run_quality_scan_impl(db: &crate::db::Db, id: i64) -> AppResult<QualityReport> {
    use regex::Regex;

    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "quality", move || {
        let repo = open(&repo_meta.path)?;
        let head_ref_opt = repo.head().ok();
        let tree_opt = head_ref_opt.as_ref().and_then(|h| h.peel_to_tree().ok());

        let secret_res: Vec<(Regex, &SecretPattern)> = SECRET_PATTERNS
            .iter()
            .filter_map(|p| Regex::new(p.pattern).ok().map(|re| (re, p)))
            .collect();
        let risky_res: Vec<(Regex, &RiskyPathPattern)> = RISKY_PATH_PATTERNS
            .iter()
            .filter_map(|p| Regex::new(p.pattern).ok().map(|re| (re, p)))
            .collect();
        let generated_res: Vec<(Regex, &str)> = GENERATED_PATH_PATTERNS
            .iter()
            .filter_map(|(pat, reason)| Regex::new(pat).ok().map(|re| (re, *reason)))
            .collect();
        let env_example_re = Regex::new(ENV_EXAMPLE_RE).ok();
        let todo_re = Regex::new(TODO_RE).ok();
        let conflict_re = Regex::new(CONFLICT_MARKER_RE).ok();

        let mut secrets: Vec<SecretHit> = Vec::new();
        let mut risky_files: Vec<RiskyFile> = Vec::new();
        let mut todos: Vec<TodoHit> = Vec::new();
        let mut todo_count: u32 = 0;
        let mut conflict_markers: Vec<ConflictHit> = Vec::new();
        let mut generated_files: Vec<GeneratedFile> = Vec::new();
        let mut large_files: Vec<LargeFile> = Vec::new();
        let mut files_scanned: u32 = 0;

        let mut all_paths: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut gitignore_content: Option<String> = None;
        let mut gitignore_path: Option<String> = None;

        let mut presence: std::collections::HashMap<&'static str, String> =
            std::collections::HashMap::new();

        let mut manifest_paths: Vec<(String, &'static str, &'static str)> = Vec::new(); // (path, kind, lockfile_name)

        if let Some(tree) = tree_opt.as_ref() {
            tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
                let Some(name) = entry.name() else {
                    return git2::TreeWalkResult::Ok;
                };
                if entry.kind() == Some(git2::ObjectType::Tree) {
                    return git2::TreeWalkResult::Ok;
                }
                let path = format!("{}{}", root, name);
                all_paths.insert(path.clone());

                // Presence checks (root only)
                if root.is_empty() {
                    let lower = name.to_ascii_lowercase();
                    if lower.starts_with("readme") {
                        presence.entry("readme").or_insert(path.clone());
                    } else if lower.starts_with("license") || lower.starts_with("licence") {
                        presence.entry("license").or_insert(path.clone());
                    } else if lower == "contributing" || lower.starts_with("contributing.") {
                        presence.entry("contributing").or_insert(path.clone());
                    } else if lower == "security.md" {
                        presence.entry("security").or_insert(path.clone());
                    } else if lower == "code_of_conduct.md" || lower == "code-of-conduct.md" {
                        presence.entry("coc").or_insert(path.clone());
                    } else if lower == ".editorconfig" {
                        presence.entry("editorconfig").or_insert(path.clone());
                    } else if lower == ".gitlab-ci.yml" || lower == "azure-pipelines.yml" {
                        presence.entry("ci").or_insert(path.clone());
                    } else if lower == ".gitignore" {
                        gitignore_path = Some(path.clone());
                    }
                }

                // .github/workflows/* or .circleci/config.yml
                if root.starts_with(".github/workflows/") || root == ".circleci/" {
                    presence.entry("ci").or_insert(path.clone());
                }

                // Manifest detection
                if let Some((kind, lockfile)) = detect_manifest_kind(&path) {
                    // Skip known noisy dirs
                    if !path.contains("/node_modules/")
                        && !path.contains("/vendor/")
                        && !path.contains("/target/")
                    {
                        manifest_paths.push((path.clone(), kind, lockfile));
                    }
                }

                // Risky path check
                let is_env_example = env_example_re
                    .as_ref()
                    .map(|r| r.is_match(&path))
                    .unwrap_or(false);
                if !is_env_example {
                    for (re, p) in &risky_res {
                        if re.is_match(&path) {
                            risky_files.push(RiskyFile {
                                path: path.clone(),
                                reason: p.name.to_string(),
                                severity: p.severity.to_string(),
                            });
                            break;
                        }
                    }
                }

                // Generated path check
                for (re, reason) in &generated_res {
                    if re.is_match(&path) {
                        generated_files.push(GeneratedFile {
                            path: path.clone(),
                            reason: (*reason).to_string(),
                        });
                        break;
                    }
                }

                if entry.kind() != Some(git2::ObjectType::Blob) {
                    return git2::TreeWalkResult::Ok;
                }

                let blob_obj = match entry.to_object(&repo) {
                    Ok(o) => o,
                    Err(_) => return git2::TreeWalkResult::Ok,
                };
                let blob = match blob_obj.peel_to_blob() {
                    Ok(b) => b,
                    Err(_) => return git2::TreeWalkResult::Ok,
                };
                let size = blob.size() as u64;

                // Large file check
                if size >= LARGE_FILE_BYTES {
                    large_files.push(LargeFile {
                        path: path.clone(),
                        size_bytes: size,
                    });
                }

                let content = blob.content();
                if content.len() > MAX_BLOB_SCAN_BYTES {
                    return git2::TreeWalkResult::Ok;
                }
                let text = match std::str::from_utf8(content) {
                    Ok(s) => s,
                    Err(_) => return git2::TreeWalkResult::Ok,
                };

                files_scanned = files_scanned.saturating_add(1);

                // Capture .gitignore content
                if root.is_empty() && name.eq_ignore_ascii_case(".gitignore") {
                    gitignore_content = Some(text.to_string());
                }

                // Secret scan
                for (re, p) in &secret_res {
                    for m in re.find_iter(text) {
                        let line =
                            text[..m.start()].chars().filter(|c| *c == '\n').count() as u32 + 1;
                        let masked = mask_secret(m.as_str());
                        secrets.push(SecretHit {
                            path: path.clone(),
                            line,
                            pattern_name: p.name.to_string(),
                            severity: p.severity.to_string(),
                            masked,
                        });
                        if secrets.len() >= 500 {
                            break;
                        }
                    }
                }

                // Conflict marker scan
                if let Some(re) = conflict_re.as_ref() {
                    for (i, line) in text.lines().enumerate() {
                        if re.is_match(line) {
                            conflict_markers.push(ConflictHit {
                                path: path.clone(),
                                line: (i + 1) as u32,
                            });
                            if conflict_markers.len() >= 200 {
                                break;
                            }
                        }
                    }
                }

                // TODO scan
                if let Some(re) = todo_re.as_ref() {
                    for (i, line) in text.lines().enumerate() {
                        if let Some(cap) = re.captures(line) {
                            let kind = cap.get(1).map(|m| m.as_str()).unwrap_or("TODO").to_string();
                            let trimmed = line.trim();
                            let text_short = if trimmed.chars().count() > 200 {
                                trimmed.chars().take(200).collect::<String>() + "…"
                            } else {
                                trimmed.to_string()
                            };
                            todo_count = todo_count.saturating_add(1);
                            if todos.len() < 200 {
                                todos.push(TodoHit {
                                    path: path.clone(),
                                    line: (i + 1) as u32,
                                    kind,
                                    text: text_short,
                                });
                            }
                        }
                    }
                }

                git2::TreeWalkResult::Ok
            })
            .ok();
        }

        // Build .gitignore check
        let (covers, line_count) = match gitignore_content.as_deref() {
            Some(content) => {
                let lines: Vec<&str> = content
                    .lines()
                    .map(|l| l.trim())
                    .filter(|l| !l.is_empty() && !l.starts_with('#'))
                    .collect();
                let lc = lines.len() as u32;
                let blob = lines.join("\n").to_ascii_lowercase();
                let covers = GitignoreCoverage {
                    env_files: blob.contains(".env"),
                    node_modules: blob.contains("node_modules"),
                    target: blob.contains("/target")
                        || blob.starts_with("target")
                        || blob.contains("\ntarget"),
                    dist_build: blob.contains("dist") || blob.contains("build"),
                    ide: blob.contains(".idea") || blob.contains(".vscode"),
                    os_files: blob.contains(".ds_store") || blob.contains("thumbs.db"),
                };
                (covers, lc)
            }
            None => (
                GitignoreCoverage {
                    env_files: false,
                    node_modules: false,
                    target: false,
                    dist_build: false,
                    ide: false,
                    os_files: false,
                },
                0,
            ),
        };
        let gitignore = GitignoreCheck {
            present: gitignore_path.is_some(),
            path: gitignore_path,
            line_count,
            covers,
        };

        let presence_check = |key: &str| PresenceCheck {
            present: presence.contains_key(key),
            path: presence.get(key).cloned(),
        };

        let repo_hygiene = RepoHygieneReport {
            gitignore,
            license: presence_check("license"),
            readme: presence_check("readme"),
            contributing: presence_check("contributing"),
            security_md: presence_check("security"),
            code_of_conduct: presence_check("coc"),
            editorconfig: presence_check("editorconfig"),
            ci_config: presence_check("ci"),
        };

        // Dependencies
        let mut manifests: Vec<DepManifest> = Vec::new();
        for (mpath, kind, lockfile_name) in &manifest_paths {
            let dir = mpath
                .rsplit_once('/')
                .map(|(d, _)| format!("{}/", d))
                .unwrap_or_default();
            let expected_lock = if lockfile_name.is_empty() {
                None
            } else {
                let candidate = format!("{}{}", dir, lockfile_name);
                if all_paths.contains(&candidate) {
                    Some(candidate)
                } else {
                    None
                }
            };
            // Generic lockfile fallbacks for node (multiple options)
            let lockfile_path = if *kind == "node" && expected_lock.is_none() {
                ["pnpm-lock.yaml", "yarn.lock", "bun.lockb"]
                    .iter()
                    .map(|n| format!("{}{}", dir, n))
                    .find(|p| all_paths.contains(p))
            } else {
                expected_lock
            };
            manifests.push(DepManifest {
                kind: (*kind).to_string(),
                manifest_path: mpath.clone(),
                lockfile_path,
            });
        }
        let dependencies = DependenciesReport { manifests };

        // Sort hygiene-collected lists
        secrets.sort_by(|a, b| {
            let sa = if a.severity == "high" { 0 } else { 1 };
            let sb = if b.severity == "high" { 0 } else { 1 };
            sa.cmp(&sb).then(a.path.cmp(&b.path))
        });
        risky_files.sort_by(|a, b| {
            let sa = if a.severity == "high" { 0 } else { 1 };
            let sb = if b.severity == "high" { 0 } else { 1 };
            sa.cmp(&sb).then(a.path.cmp(&b.path))
        });
        todos.sort_by(|a, b| a.path.cmp(&b.path).then(a.line.cmp(&b.line)));
        large_files.sort_by_key(|e| std::cmp::Reverse(e.size_bytes));
        large_files.truncate(40);
        generated_files.sort_by(|a, b| a.path.cmp(&b.path));

        let secrets_head = SecretsHeadReport {
            hits: secrets,
            risky_files,
        };
        let code_hygiene = CodeHygieneReport {
            todos,
            todo_count,
            conflict_markers,
            generated_files,
            large_files,
        };

        // Authorship walk
        let mut total_commits = 0u32;
        let mut bot_commits = 0u32;
        let mut signed_commits = 0u32;
        let mut generic_emails: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        if let Ok(mut walk) = repo.revwalk() {
            let _ = walk.set_sorting(Sort::TIME);
            let _ = walk.push_glob("refs/heads/*");
            let mut seen: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
            for oid in walk.flatten() {
                if !seen.insert(oid) {
                    continue;
                }
                let commit = match repo.find_commit(oid) {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                total_commits = total_commits.saturating_add(1);
                let name = commit.author().name().unwrap_or("").to_string();
                let email = commit.author().email().unwrap_or("").to_string();
                if is_bot_author(&name, &email) {
                    bot_commits = bot_commits.saturating_add(1);
                }
                if is_generic_email(&email) {
                    generic_emails.insert(email);
                }
                if repo.extract_signature(&oid, Some("gpgsig")).is_ok() {
                    signed_commits = signed_commits.saturating_add(1);
                }
            }
        }
        let bot_share_pct = if total_commits > 0 {
            (bot_commits as f32 / total_commits as f32) * 100.0
        } else {
            0.0
        };
        let signed_share_pct = if total_commits > 0 {
            (signed_commits as f32 / total_commits as f32) * 100.0
        } else {
            0.0
        };
        let mut generic_email_authors: Vec<String> = generic_emails.into_iter().collect();
        generic_email_authors.sort();
        let authorship = AuthorshipReport {
            total_commits,
            bot_commits,
            bot_share_pct,
            signed_commits,
            signed_share_pct,
            generic_email_authors,
        };

        Ok(QualityReport {
            repo_hygiene,
            secrets_head,
            dependencies,
            code_hygiene,
            authorship,
            files_scanned,
        })
    })
}

pub fn run_history_secret_scan_impl<F>(
    db: &crate::db::Db,
    id: i64,
    on_progress: F,
) -> AppResult<HistorySecretReport>
where
    F: Fn(u32, u32),
{
    use regex::Regex;

    let repo_meta = get_repository_impl(db, id)?;
    let repo = open(&repo_meta.path)?;

    // Count total commits first for accurate progress
    let mut total: u32 = 0;
    {
        let mut walk = repo.revwalk()?;
        walk.set_sorting(Sort::TIME)?;
        walk.push_glob("refs/heads/*")?;
        for _ in walk {
            total = total.saturating_add(1);
        }
    }
    on_progress(0, total);

    let secret_res: Vec<(Regex, &SecretPattern)> = SECRET_PATTERNS
        .iter()
        .filter(|p| p.severity == "high")
        .filter_map(|p| Regex::new(p.pattern).ok().map(|re| (re, p)))
        .collect();

    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TIME | Sort::REVERSE)?;
    walk.push_glob("refs/heads/*")?;

    let mut hits: Vec<HistorySecretHit> = Vec::new();
    let mut seen_blobs: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.ignore_filemode(true);

    let mut scanned: u32 = 0;
    let mut seen_commits: std::collections::HashSet<git2::Oid> = std::collections::HashSet::new();
    for oid_res in walk {
        if hits.len() >= 1000 {
            break;
        }
        let oid = match oid_res {
            Ok(o) => o,
            Err(_) => continue,
        };
        if !seen_commits.insert(oid) {
            continue;
        }
        scanned = scanned.saturating_add(1);
        if scanned.is_multiple_of(50) {
            on_progress(scanned, total);
        }
        let commit = match repo.find_commit(oid) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let new_tree = match commit.tree() {
            Ok(t) => t,
            Err(_) => continue,
        };
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
        let diff = match repo.diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&new_tree),
            Some(&mut diff_opts),
        ) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let count = diff.deltas().len();
        for idx in 0..count {
            let Some(delta) = diff.get_delta(idx) else {
                continue;
            };
            if matches!(delta.status(), git2::Delta::Deleted) {
                continue;
            }
            let blob_id = delta.new_file().id();
            if blob_id.is_zero() || !seen_blobs.insert(blob_id) {
                continue;
            }
            let path = delta
                .new_file()
                .path()
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            if path.is_empty() {
                continue;
            }

            let blob = match repo.find_blob(blob_id) {
                Ok(b) => b,
                Err(_) => continue,
            };
            let content = blob.content();
            if content.len() > MAX_BLOB_SCAN_BYTES {
                continue;
            }
            let text = match std::str::from_utf8(content) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let ts = commit_time(&commit);
            let oid_str = oid.to_string();
            let short_id: String = oid_str.chars().take(7).collect();
            let author_name = commit.author().name().unwrap_or("unknown").to_string();
            let author_email = commit.author().email().unwrap_or("").to_string();

            for (re, pattern) in &secret_res {
                for m in re.find_iter(text) {
                    let line = text[..m.start()].chars().filter(|c| *c == '\n').count() as u32 + 1;
                    let masked = mask_secret(m.as_str());
                    hits.push(HistorySecretHit {
                        blob_oid: blob_id.to_string(),
                        commit_oid: oid_str.clone(),
                        commit_short_id: short_id.clone(),
                        commit_date: ts.to_rfc3339(),
                        author_name: author_name.clone(),
                        author_email: author_email.clone(),
                        path: path.clone(),
                        line,
                        pattern_name: pattern.name.to_string(),
                        severity: pattern.severity.to_string(),
                        masked,
                    });
                    if hits.len() >= 1000 {
                        break;
                    }
                }
                if hits.len() >= 1000 {
                    break;
                }
            }
        }
    }

    on_progress(scanned, total);

    Ok(HistorySecretReport {
        hits,
        commits_scanned: scanned,
        blobs_scanned: seen_blobs.len() as u32,
    })
}
