# codesight

> **Local Git Intelligence Layer.** A free, offline desktop app that turns your `.git` directories into deterministic metrics, heuristic insights, and graph-aware structural views — no GitHub account, no API tokens, no network calls.

Built with **React + Rust + Tauri**. Ships as a single self-contained binary; no system git or sqlite required.

- Repository: <https://github.com/n1crack/codesight>
- Homepage: <https://codesight.ozdemir.be>
- License: **AGPL-3.0**

![codesight — cross-repo home dashboard](docs/screenshot-home.png)

---

## Why codesight?

- **A GitHub Insights alternative for offline / private workflows** — same questions answered, your code never leaves the laptop.
- **Audit repos without cloud exposure** — point it at a `.git` directory, get bus factor, ownership maps, and churn risk in seconds.
- **Unlimited repos, zero SaaS dependency** — no per-seat fee, no per-repo limit, no quotas.

## Privacy

- **No telemetry, no cloud sync, no code upload, no external API calls.**
- All analysis runs on-device via `git2` (vendored libgit2) reading `.git` directly.
- Results live only in a local SQLite under your OS app-data directory.

---

## The three pillars

Every page and metric belongs to exactly one of three axes.

### Activity — *deterministic*

Exact, reproducible counts and rates.

- **Heatmap** — year-by-year contribution heatmap
- **Timeline** — commits or churn (additions/deletions) by day / week / month
- **Patterns** — hour × day-of-week distribution

### Insights — *heuristics*

Opinionated reads of the same git data, with the formula always visible.

- **Health** — composite Repo Health Score (0–100) from six weighted sub-scores
- **Hotspots** — files, directories, couplings (pairs that change together), and churn risk
- **Ownership** — bus factor, top-author shares, primary author per file, concentration alerts
- **Authors** — contributor drill-downs + volatility chart (active / new / returning per month)
- **Collaborators** — co-authored commit pairs from `Co-Authored-By` trailers
- **Messages** — conventional commit type distribution + avg subject length
- **Quality & Security** — five-group scan + prioritized suggestions + optional deep-history secret scan
- **Config** — read-only view of git config, remotes, and installed hooks

### Graph — *git graph intelligence*

DAG-aware analysis.

- **DAG** — gitk-style commit graph across all branches
- **Branches** — ahead/behind, stale-branch risk badges (low/medium/high)
- **Releases** — chronological tags with commits-since-previous
- **Co-change network** — force-directed graph of files that change together
- **Ownership treemap** — tile size = commits, color = primary author
- **Imports** — directed module dependency graph (TS/JS/Rust/Python)

### Cross-repo

Combined home dashboard, universal commit search, side-by-side compare, and per-tag overviews.

---

## UX highlights

- English / Turkish, light / dark / system theme
- `⌘K` / `Ctrl K` command palette for jumping to any page or repo
- Drag-and-drop tag organization, OS-level folder drop to discover nested repos
- Side-by-side diff with syntax highlighting (Shiki)
- Open-in-editor for VS Code / Cursor / Sublime / Zed / JetBrains / Helix
- Bottom status bar with branch picker, ahead/behind, dirty indicator, fetch/pull/push

---

## Installing a release build

Installers are **not yet code-signed**, so the OS will warn you the app is untrusted.

**macOS** — you may see *"codesight is damaged"*. It isn't — that's Gatekeeper blocking an unsigned app. After dragging to `/Applications`, clear the quarantine flag:

```bash
xattr -cr /Applications/codesight.app
```

**Windows** — on the SmartScreen warning: **More info** → **Run anyway**.

---

## Build from source

Requires Node.js 22+, pnpm 11+, Rust 1.80+, and Tauri platform tooling:
- **macOS:** Xcode Command Line Tools
- **Windows:** MSVC build tools + WebView2 runtime
- **Linux:** webkit2gtk + librsvg + build-essential

```bash
pnpm install
pnpm tauri dev      # dev mode
pnpm tauri build    # production bundle in src-tauri/target/release/bundle/
```

---

## License

[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html). A commercial license is available if AGPL doesn't fit your use case — contact **yusuf@ozdemir.be**. Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md), which includes a CLA to keep the dual-licensing model possible.
