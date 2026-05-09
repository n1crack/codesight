use std::collections::{HashMap, HashSet};

use regex::Regex;

use crate::error::AppResult;
use crate::repo::get_repository_impl;

use super::{cached, current_head, open, ImportEdge, ImportGraph, ImportNode};

const MAX_BLOB_SCAN_BYTES: usize = 256 * 1024; // 256 KB cap per file

pub fn get_import_graph_impl(db: &crate::db::Db, id: i64) -> AppResult<ImportGraph> {
    let repo_meta = get_repository_impl(db, id)?;
    let head = current_head(&repo_meta.path);
    cached(db, id, &head, "importGraph", move || {
        let repo = open(&repo_meta.path)?;
        let head_ref = match repo.head() {
            Ok(h) => h,
            Err(_) => return Ok(empty_graph()),
        };
        let tree = match head_ref.peel_to_tree() {
            Ok(t) => t,
            Err(_) => return Ok(empty_graph()),
        };

        // Collect every tracked file path so we can resolve relative imports
        // without touching the filesystem.
        let mut all_paths: HashSet<String> = HashSet::new();
        let mut source_files: Vec<(String, &'static str)> = Vec::new();
        tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
            if entry.kind() != Some(git2::ObjectType::Blob) {
                return git2::TreeWalkResult::Ok;
            }
            let Some(name) = entry.name() else {
                return git2::TreeWalkResult::Ok;
            };
            let path = format!("{}{}", root, name);
            all_paths.insert(path.clone());
            if let Some(lang) = source_language(&path) {
                source_files.push((path, lang));
            }
            git2::TreeWalkResult::Ok
        })
        .ok();

        let ts_re = ts_import_regex();
        let py_re = py_import_regex();
        let rust_use_re = rust_use_regex();
        let rust_mod_re = rust_mod_regex();

        let mut edges: HashSet<(String, String)> = HashSet::new();
        let mut external_imports: u32 = 0;
        let mut files_scanned: u32 = 0;
        let mut languages: HashMap<String, &'static str> = HashMap::new();

        for (path, lang) in &source_files {
            languages.insert(path.clone(), lang);

            let Some(blob) = read_blob(&repo, &tree, path) else {
                continue;
            };
            files_scanned = files_scanned.saturating_add(1);

            match *lang {
                "TypeScript" | "JavaScript" => {
                    extract_ts_imports(
                        &blob,
                        path,
                        &all_paths,
                        &ts_re,
                        &mut edges,
                        &mut external_imports,
                    );
                }
                "Python" => {
                    extract_py_imports(
                        &blob,
                        path,
                        &all_paths,
                        &py_re,
                        &mut edges,
                        &mut external_imports,
                    );
                }
                "Rust" => {
                    extract_rust_imports(
                        &blob,
                        path,
                        &all_paths,
                        &rust_use_re,
                        &rust_mod_re,
                        &mut edges,
                        &mut external_imports,
                    );
                }
                _ => {}
            }
        }

        // Aggregate into nodes (only files referenced by an edge).
        let mut in_deg: HashMap<String, u32> = HashMap::new();
        let mut out_deg: HashMap<String, u32> = HashMap::new();
        for (from, to) in &edges {
            *out_deg.entry(from.clone()).or_insert(0) += 1;
            *in_deg.entry(to.clone()).or_insert(0) += 1;
        }
        let mut node_paths: HashSet<String> = HashSet::new();
        for (a, b) in &edges {
            node_paths.insert(a.clone());
            node_paths.insert(b.clone());
        }

        let mut nodes: Vec<ImportNode> = node_paths
            .into_iter()
            .map(|path| {
                let language = languages
                    .get(&path)
                    .copied()
                    .unwrap_or("Other")
                    .to_string();
                ImportNode {
                    in_degree: in_deg.get(&path).copied().unwrap_or(0),
                    out_degree: out_deg.get(&path).copied().unwrap_or(0),
                    path,
                    language,
                }
            })
            .collect();
        nodes.sort_by(|a, b| {
            (b.in_degree + b.out_degree)
                .cmp(&(a.in_degree + a.out_degree))
                .then_with(|| a.path.cmp(&b.path))
        });

        let mut edge_list: Vec<ImportEdge> = edges
            .into_iter()
            .map(|(from, to)| ImportEdge { from, to })
            .collect();
        edge_list.sort_by(|a, b| a.from.cmp(&b.from).then_with(|| a.to.cmp(&b.to)));

        Ok(ImportGraph {
            nodes,
            edges: edge_list,
            files_scanned,
            external_imports,
        })
    })
}

fn empty_graph() -> ImportGraph {
    ImportGraph {
        nodes: Vec::new(),
        edges: Vec::new(),
        files_scanned: 0,
        external_imports: 0,
    }
}

fn source_language(path: &str) -> Option<&'static str> {
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    match ext.as_str() {
        "ts" | "tsx" => Some("TypeScript"),
        "js" | "jsx" | "mjs" | "cjs" => Some("JavaScript"),
        "rs" => Some("Rust"),
        "py" => Some("Python"),
        _ => None,
    }
}

fn read_blob(
    repo: &git2::Repository,
    tree: &git2::Tree<'_>,
    path: &str,
) -> Option<String> {
    let entry = tree.get_path(std::path::Path::new(path)).ok()?;
    let object = entry.to_object(repo).ok()?;
    let blob = object.peel_to_blob().ok()?;
    let content = blob.content();
    if content.len() > MAX_BLOB_SCAN_BYTES {
        return None;
    }
    std::str::from_utf8(content).ok().map(String::from)
}

// ---------- Regex builders ----------

fn ts_import_regex() -> Regex {
    // Matches:
    //   import ... from "x"
    //   import "x"
    //   export ... from "x"
    //   require("x")
    //   import("x")
    Regex::new(
        r#"(?m)\b(?:import|export)\b[^;\n]*?from\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)"#,
    )
    .expect("ts import regex")
}

fn py_import_regex() -> Regex {
    // Matches:
    //   from x.y import z
    //   import x
    //   import x as y
    Regex::new(r#"(?m)^\s*(?:from\s+(\.+[\w.]*|\w[\w.]*)\s+import|import\s+(\w[\w.]*))"#)
        .expect("py import regex")
}

fn rust_use_regex() -> Regex {
    // Matches `use crate::a::b::c;` / `use crate::a::b::{c, d};` etc.
    // We capture `crate::a::b` (the prefix) and resolve it to a file.
    Regex::new(r#"(?m)^\s*(?:pub\s+)?use\s+(crate|self|super)((?:::[\w]+)+)"#)
        .expect("rust use regex")
}

fn rust_mod_regex() -> Regex {
    // Matches `mod foo;` / `pub mod foo;` (declarations, not inline modules).
    Regex::new(r#"(?m)^\s*(?:pub\s+)?mod\s+([\w]+)\s*;"#).expect("rust mod regex")
}

// ---------- Per-language extractors ----------

fn extract_ts_imports(
    text: &str,
    from_path: &str,
    all_paths: &HashSet<String>,
    re: &Regex,
    out: &mut HashSet<(String, String)>,
    external: &mut u32,
) {
    for cap in re.captures_iter(text) {
        let spec = cap
            .get(1)
            .or_else(|| cap.get(2))
            .or_else(|| cap.get(3))
            .or_else(|| cap.get(4))
            .map(|m| m.as_str());
        let Some(spec) = spec else {
            continue;
        };
        if let Some(resolved) = resolve_ts_specifier(from_path, spec, all_paths) {
            if resolved != from_path {
                out.insert((from_path.to_string(), resolved));
            }
        } else {
            *external = external.saturating_add(1);
        }
    }
}

fn extract_py_imports(
    text: &str,
    from_path: &str,
    all_paths: &HashSet<String>,
    re: &Regex,
    out: &mut HashSet<(String, String)>,
    external: &mut u32,
) {
    for cap in re.captures_iter(text) {
        let spec = cap
            .get(1)
            .or_else(|| cap.get(2))
            .map(|m| m.as_str());
        let Some(spec) = spec else { continue };
        if let Some(resolved) = resolve_py_specifier(from_path, spec, all_paths) {
            if resolved != from_path {
                out.insert((from_path.to_string(), resolved));
            }
        } else {
            *external = external.saturating_add(1);
        }
    }
}

fn extract_rust_imports(
    text: &str,
    from_path: &str,
    all_paths: &HashSet<String>,
    use_re: &Regex,
    mod_re: &Regex,
    out: &mut HashSet<(String, String)>,
    external: &mut u32,
) {
    // `use crate::a::b::c` — strip leading prefix and resolve segment paths under `src/`.
    for cap in use_re.captures_iter(text) {
        let kind = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let tail = cap.get(2).map(|m| m.as_str()).unwrap_or("");
        let segments: Vec<&str> = tail.split("::").filter(|s| !s.is_empty()).collect();
        if segments.is_empty() {
            *external = external.saturating_add(1);
            continue;
        }
        if let Some(resolved) =
            resolve_rust_use(from_path, kind, &segments, all_paths)
        {
            if resolved != from_path {
                out.insert((from_path.to_string(), resolved));
            }
        }
    }

    // `mod foo;` declarations.
    for cap in mod_re.captures_iter(text) {
        let name = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        if name.is_empty() {
            continue;
        }
        if let Some(resolved) = resolve_rust_mod(from_path, name, all_paths) {
            if resolved != from_path {
                out.insert((from_path.to_string(), resolved));
            }
        }
    }
}

// ---------- Resolution helpers ----------

const TS_EXTS: &[&str] = &[
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".d.ts",
];

const TS_INDEX: &[&str] = &[
    "index.ts",
    "index.tsx",
    "index.js",
    "index.jsx",
    "index.mjs",
    "index.cjs",
];

fn dir_of(path: &str) -> String {
    match path.rsplit_once('/') {
        Some((dir, _)) => dir.to_string(),
        None => String::new(),
    }
}

fn join(dir: &str, sub: &str) -> String {
    if dir.is_empty() {
        sub.to_string()
    } else {
        format!("{}/{}", dir.trim_end_matches('/'), sub)
    }
}

/// Normalize a path with `.` and `..` segments. Returns `None` if it escapes the repo.
fn normalize(path: &str) -> Option<String> {
    let mut out: Vec<&str> = Vec::new();
    for seg in path.split('/') {
        match seg {
            "" | "." => continue,
            ".." => {
                if out.pop().is_none() {
                    return None;
                }
            }
            _ => out.push(seg),
        }
    }
    Some(out.join("/"))
}

fn resolve_ts_specifier(
    from_path: &str,
    spec: &str,
    all_paths: &HashSet<String>,
) -> Option<String> {
    // Skip externals quickly: bare specifiers (e.g. `react`, `lodash/fp`) and
    // protocol URLs are not in the repo tree.
    let is_relative = spec.starts_with("./") || spec.starts_with("../") || spec == "." || spec == "..";
    let is_alias = spec.starts_with("@/");
    if !is_relative && !is_alias {
        return None;
    }
    let base = if is_alias {
        // Vite/tsconfig convention: `@` -> `src`. Hard-coded since codesight uses this layout.
        let stripped = spec.strip_prefix("@/").unwrap_or(spec);
        format!("src/{}", stripped)
    } else {
        join(&dir_of(from_path), spec)
    };
    let normalized = normalize(&base)?;
    resolve_ts_target(&normalized, all_paths)
}

fn resolve_ts_target(base: &str, all_paths: &HashSet<String>) -> Option<String> {
    if all_paths.contains(base) {
        return Some(base.to_string());
    }
    for ext in TS_EXTS {
        let candidate = format!("{}{}", base, ext);
        if all_paths.contains(&candidate) {
            return Some(candidate);
        }
    }
    for idx in TS_INDEX {
        let candidate = if base.is_empty() {
            (*idx).to_string()
        } else {
            format!("{}/{}", base, idx)
        };
        if all_paths.contains(&candidate) {
            return Some(candidate);
        }
    }
    None
}

fn resolve_py_specifier(
    from_path: &str,
    spec: &str,
    all_paths: &HashSet<String>,
) -> Option<String> {
    if !spec.starts_with('.') {
        // Only follow intra-package relative imports; absolute imports
        // need a project root config we don't have here.
        return None;
    }
    let mut base = dir_of(from_path);
    let mut rest = spec;
    while let Some(stripped) = rest.strip_prefix('.') {
        if !stripped.starts_with('.') && !stripped.is_empty() {
            // Don't pop on the leading single dot — it's "current package".
        } else {
            // Each additional dot pops one directory.
            base = match base.rsplit_once('/') {
                Some((parent, _)) => parent.to_string(),
                None => {
                    if base.is_empty() {
                        return None;
                    } else {
                        String::new()
                    }
                }
            };
        }
        rest = stripped;
    }
    let dotted = rest.replace('.', "/");
    let candidate_dir = if dotted.is_empty() {
        base.clone()
    } else if base.is_empty() {
        dotted
    } else {
        format!("{}/{}", base, dotted)
    };
    let normalized = normalize(&candidate_dir)?;
    let module = format!("{}.py", normalized);
    if all_paths.contains(&module) {
        return Some(module);
    }
    let init = if normalized.is_empty() {
        "__init__.py".to_string()
    } else {
        format!("{}/__init__.py", normalized)
    };
    if all_paths.contains(&init) {
        return Some(init);
    }
    None
}

/// Find the cargo crate root for this file (first ancestor containing `src/lib.rs` or `src/main.rs`).
fn rust_crate_src_root(from_path: &str, all_paths: &HashSet<String>) -> Option<String> {
    let mut dir = dir_of(from_path);
    loop {
        let lib = if dir.is_empty() {
            "src/lib.rs".to_string()
        } else {
            format!("{}/src/lib.rs", dir)
        };
        let main = if dir.is_empty() {
            "src/main.rs".to_string()
        } else {
            format!("{}/src/main.rs", dir)
        };
        if all_paths.contains(&lib) || all_paths.contains(&main) {
            let src = if dir.is_empty() {
                "src".to_string()
            } else {
                format!("{}/src", dir)
            };
            return Some(src);
        }
        match dir.rsplit_once('/') {
            Some((parent, _)) => dir = parent.to_string(),
            None => {
                if dir.is_empty() {
                    return None;
                }
                dir = String::new();
            }
        }
    }
}

fn resolve_rust_use(
    from_path: &str,
    kind: &str,
    segments: &[&str],
    all_paths: &HashSet<String>,
) -> Option<String> {
    let base_dir = match kind {
        "crate" => rust_crate_src_root(from_path, all_paths)?,
        "self" => dir_of(from_path),
        "super" => {
            let parent = dir_of(from_path);
            match parent.rsplit_once('/') {
                Some((p, _)) => p.to_string(),
                None => return None,
            }
        }
        _ => return None,
    };

    // Walk segments, peeling the trailing leaf candidates. `use crate::a::b::c`
    // could refer to either `c` or `b` (if `c` is a re-exported item inside
    // `b.rs`), so we try the longest prefix first.
    for take in (1..=segments.len()).rev() {
        let head = &segments[..take];
        let path = head.join("/");
        let full = if base_dir.is_empty() {
            path.clone()
        } else {
            format!("{}/{}", base_dir, path)
        };
        let file = format!("{}.rs", full);
        if all_paths.contains(&file) {
            return Some(file);
        }
        let mod_file = format!("{}/mod.rs", full);
        if all_paths.contains(&mod_file) {
            return Some(mod_file);
        }
    }
    None
}

fn resolve_rust_mod(
    from_path: &str,
    name: &str,
    all_paths: &HashSet<String>,
) -> Option<String> {
    let dir = dir_of(from_path);
    // For `mod foo;` declared in `bar.rs`, Rust looks for `bar/foo.rs`.
    // For `mod.rs` / `lib.rs` / `main.rs`, lookups are relative to the same dir.
    let stem = from_path.rsplit('/').next().unwrap_or(from_path);
    let stem_no_ext = stem.strip_suffix(".rs").unwrap_or(stem);
    let parent_for_mod = if matches!(stem_no_ext, "mod" | "lib" | "main") {
        dir.clone()
    } else if dir.is_empty() {
        stem_no_ext.to_string()
    } else {
        format!("{}/{}", dir, stem_no_ext)
    };

    let file = if parent_for_mod.is_empty() {
        format!("{}.rs", name)
    } else {
        format!("{}/{}.rs", parent_for_mod, name)
    };
    if all_paths.contains(&file) {
        return Some(file);
    }
    let mod_rs = if parent_for_mod.is_empty() {
        format!("{}/mod.rs", name)
    } else {
        format!("{}/{}/mod.rs", parent_for_mod, name)
    };
    if all_paths.contains(&mod_rs) {
        return Some(mod_rs);
    }
    None
}
