# codesight

> **Local Git Intelligence Layer.** A free, offline desktop app that turns your `.git` directories into deterministic metrics, heuristic insights, and graph-aware structural views — no GitHub account, no API tokens, no network calls.

Built with **React + Rust + Tauri**. Single binary; no system git or sqlite required.

---

## The three pillars

codesight is organized around three coherent axes. Every metric, every page, every backend command belongs to exactly one of them.

### 1. Activity — *deterministic*

Counts and rates that are exact, reproducible, and judgment-free.

- **Heatmap** — year-by-year contribution heatmap, custom SVG with hover tooltips
- **Timeline** — commits or churn (additions/deletions) by day / week / month
- **Patterns** — hour × day-of-week distribution, "when does this team work"

### 2. Insights — *heuristics*

Opinionated reads of the same git data — judgment baked in, with the formula always visible.

- **Health** — composite **Repo Health Score** (0–100) from six weighted sub-scores: recency, activity volume, bus factor, branch hygiene, docs/tests presence, conventional commits. Color-coded gauge + breakdown with localized "why this score" hints.
- **Hotspots** — four views: Files / Directories / Couplings (pairs that change together) / **Churn Risk** (file-level risk = churn × ownership concentration × recency)
- **Ownership** — bus factor, top author shares, per-file primary author, and **Concentration Alerts**: bus-factor-of-one warnings, ≥80% single-owner files, alumni contributors (≥90 days idle)
- **Authors** — full contributor list with personal drill-down; **Contributor Volatility** stacked area chart shows active / new / returning authors per month
- **Messages** — conventional commit type distribution + avg subject length

### 3. Graph — *git graph intelligence*

DAG-aware analysis: structure, refs, ancestry.

- **DAG** — gitk-style commit graph across all branches, lane layout, ref labels (HEAD / branches / tags)
- **Branches** — local & remote, HEAD pin, ahead/behind vs. default, stale-branch filter, **Stale-Branch Risk badges** (low/medium/high) based on per-branch unique commits — flags potential lost work
- **Releases** — chronological tags with tagger, message, commits-since-previous

---

## Cross-repo

- **Home** — combined contribution heatmap across all repos, aggregated stats (total commits, last-30-day activity, active repo count, distinct authors), cross-repo activity feed with repo badges, per-author filter
- **Search** — multi-filter commit search (message text, author email, date range, file path)
- **Compare** — multi-select repos, side-by-side stats and merged monthly chart

---

## Drill-downs

- **`/commits/:oid`** — full commit detail: subject + body, parents (linkable), author/committer, file count + insertions/deletions, per-file collapsible diff with red/green line highlighting and binary-file detection
- **`/contributors/:email`** — per-author dashboard: 5 stat cards, personal year-by-year heatmap, top files, recent commits

---

## UX

- **English / Turkish** (react-i18next; default English, easy to extend)
- **Light / dark / system theme** with custom OKLCH palette, themed scrollbars
- **`⌘K` / `Ctrl K`** command palette — jump to any page (top-level + sub-tabs) or repo
- **Resizable, scrollable sidebar** — drag the divider, double-click to reset, no scroll until manually constrained
- **Repo filter** appears when 6+ repos
- **Refresh button** in the top bar invalidates all cached queries
- **Custom chart tooltips** — instant, themed, performant (mouse-position update is DOM-only, never re-renders React)
- **Click any commit hash anywhere** to drill into the commit detail page
- Skeleton loaders, page fade transitions, code-split routes

---

## Tech stack

**Frontend**
- Vite + React 19 + TypeScript
- Tailwind CSS v4 (manual UI primitives, no shadcn CLI)
- react-router-dom v7 (nested routes for sections)
- @tanstack/react-query
- recharts + custom SVG (heatmaps, DAG, sparklines)
- lucide-react
- react-i18next + i18next-browser-languagedetector
- Lazy-loaded routes (manualChunks: recharts / i18n / react / tanstack)

**Backend**
- Tauri 2
- git2 with `vendored-libgit2`
- rusqlite with bundled SQLite
- rayon (cross-repo parallelism)
- chrono, walkdir, parking_lot, anyhow, thiserror

**Plugins**
- `tauri-plugin-dialog` (file picker)
- `tauri-plugin-opener`

---

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Rust 1.80+ (`cargo` on PATH)
- Platform tooling for Tauri:
  - **macOS:** Xcode Command Line Tools
  - **Windows:** MSVC build tools + WebView2 runtime
  - **Linux:** webkit2gtk + librsvg + build-essential

### Install

```bash
pnpm install
```

### Run in dev mode

```bash
pnpm tauri dev
```

### Production build

```bash
pnpm tauri build
```

Bundle in `src-tauri/target/release/bundle/`.

### Type-check / build (frontend only)

```bash
pnpm build
```

---

## Project structure

```
codesight/
├── src/                       # React app
│   ├── api.ts                 # Tauri command wrappers
│   ├── types.ts               # TS types mirroring Rust structs
│   ├── i18n/                  # English + Turkish locales
│   ├── components/
│   │   ├── ui/                # Button, Card, Select, Tabs, Input, Skeleton
│   │   ├── AppShell.tsx       # Sidebar + AppTopBar + outlet
│   │   ├── AppTopBar.tsx      # Cmd+K hint + refresh
│   │   ├── CommandPalette.tsx # Global ⌘K
│   │   ├── Sidebar.tsx        # 7-item nav + resizable repo list
│   │   ├── SectionShell.tsx   # Title + sub-tabs + outlet (used by sections)
│   │   ├── ChartTooltip.tsx   # Themed hover tooltip primitive (forwardRef)
│   │   ├── Heatmap.tsx        # Year contribution heatmap (custom SVG)
│   │   ├── DiffView.tsx       # Per-file collapsible diff
│   │   ├── Sparkline.tsx      # currentColor-aware bar chart
│   │   └── …
│   ├── pages/
│   │   ├── HomePage.tsx              # Cross-repo dashboard
│   │   ├── SearchPage.tsx            # Universal commit search
│   │   ├── ComparisonPage.tsx        # Cross-repo compare
│   │   ├── SettingsPage.tsx
│   │   ├── CommitDetailPage.tsx
│   │   ├── ContributorDetailPage.tsx
│   │   ├── HeatmapPage.tsx           # Activity → Heatmap
│   │   ├── TimelinePage.tsx          # Activity → Timeline
│   │   ├── PatternsPage.tsx          # Activity → Patterns (matrix + bars)
│   │   ├── HealthPage.tsx            # Insights → Health (gauge + breakdown)
│   │   ├── HotspotsPage.tsx          # Insights → Hotspots (4 sub-tabs)
│   │   ├── OwnershipPage.tsx         # Insights → Ownership (alerts + tables)
│   │   ├── ContributorsPage.tsx      # Insights → Authors (cohort + list)
│   │   ├── MessagesPage.tsx          # Insights → Messages
│   │   ├── GraphPage.tsx             # Graph → DAG
│   │   ├── BranchesPage.tsx          # Graph → Branches (with risk badges)
│   │   ├── TagsPage.tsx              # Graph → Releases
│   │   └── sections/
│   │       ├── ActivitySection.tsx
│   │       ├── InsightsSection.tsx
│   │       └── GraphSection.tsx
│   ├── state/                 # AppStateProvider (Context + localStorage)
│   └── lib/                   # graphLayout, format, useChartTooltip, cn
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs             # #[tauri::command] handlers
│   │   ├── analysis.rs        # All git analytics + diff walks + heuristic layers
│   │   ├── repo.rs            # add / scan / list / remove repository
│   │   ├── db.rs              # SQLite wrapper
│   │   └── error.rs           # AppError + Serialize
│   ├── capabilities/
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

---

## Backend command catalogue

Grouped by pillar; every command is a `#[tauri::command] async fn` wrapping `spawn_blocking`.

**Repo CRUD** — `add_repository`, `list_repositories`, `remove_repository`, `scan_folder`, `get_repos_sparklines`, `list_known_authors`

**Activity** — `get_repo_summary`, `get_commit_heatmap`, `get_commit_timeline`, `get_code_churn`, `get_activity_patterns`, `get_recent_commits`, `get_top_contributors`, `get_language_breakdown`

**Insights** — `get_repo_health` (composite score with structured `HealthDetail` enum), `get_file_hotspots`, `get_directory_hotspots`, `get_file_couplings`, `get_churn_risk`, `get_ownership_report` (with `OwnershipAlert[]`), `get_commit_message_stats`, `get_contributor_detail`, `get_contributor_heatmap`, `get_contributor_top_files`, `get_contributor_recent_commits`, `get_contributor_cohort`

**Graph** — `get_commit_graph`, `list_branches` (with `unique_commits` + `risk` per branch), `list_tags`

**Cross-repo / search / commit** — `get_global_summary`, `get_global_heatmap`, `get_global_recent_commits`, `search_commits`, `get_commit_detail`

---

## Architecture notes

- **Local-only.** No GitHub API, no telemetry, no network. Every read goes to local `.git` via libgit2.
- **Self-contained binary.** `vendored-libgit2` and bundled SQLite — no system dependencies.
- **Concurrency.** Every Tauri command uses `tauri::async_runtime::spawn_blocking`. Cross-repo aggregations (global summary/heatmap, sparklines, known authors) use `rayon` to walk repositories in parallel.
- **Diff walks shared.** `walk_diffs(&repo, |commit, diff| { ... })` is the core iteration primitive — file hotspots, directory hotspots, couplings, churn risk, code churn, ownership, repo health all use it.
- **Backend-language-neutral hints.** Heuristic explanations (e.g. health sub-score hints, ownership alerts) return **structured tagged enums** carrying numeric/boolean data; the frontend formats text via i18n templates. No English strings hardcoded in Rust.
- **Caching.**
  - Server data: TanStack Query (60s staleTime, no refetch-on-focus). Top-bar refresh button calls `invalidateQueries()`.
  - App state: React Context → `localStorage` (selected repo, theme, my-email filter, sidebar pane height)
  - Disk: SQLite at `dirs::data_local_dir()/codesight/codesight.sqlite` — currently only repository list. Incremental analysis cache is on the roadmap.
- **Performance-tuned tooltips.** `useChartTooltip<T>()` hook + `<ChartTooltip>` component: state changes only when the active cell changes; mouse-position updates write directly to `tooltipRef.current.style.transform` (translate3d → GPU compositing), never trigger React re-renders. Used in Heatmap and Patterns charts.
- **Three-pillar IA.** Routes are nested: `/activity/{heatmap,timeline,patterns}`, `/insights/{health,hotspots,ownership,authors,messages}`, `/graph/{dag,branches,releases}`. Every new metric must clearly belong to one pillar; backward-compat redirects keep old flat URLs working.

---

## Adding a new metric

1. **Pick the pillar.** Deterministic count → **Activity**. Heuristic / opinion → **Insights**. DAG / ref-aware → **Graph**.
2. **Backend (`src-tauri/src/analysis.rs`)**
   - Define a `Serialize`/`Deserialize` struct. For heuristic explanations, prefer a tagged enum with numeric data over a hardcoded string — let the frontend localize.
   - Implement `your_metric_impl(db: &Db, ...) -> AppResult<T>` — reuse `walk_diffs` if you need per-commit diffs.
3. **Tauri command (`src-tauri/src/lib.rs`)**
   - `#[tauri::command] async fn` wrapping `spawn_blocking`
   - Add to `invoke_handler![…]`
4. **Frontend**
   - Mirror the type in `src/types.ts`
   - Add an API method in `src/api.ts`
   - Build the page in `src/pages/` and add as a sub-tab in the relevant `Section.tsx`
   - Add i18n keys in `src/i18n/locales/{en,tr}.json` — both languages, no English-only strings
   - If you find yourself adding a new top-level sidebar item, ask whether it really belongs in Activity / Insights / Graph first
   - Add a `command.SUB_PAGES` entry in `CommandPalette.tsx` so it's reachable via ⌘K

---

## Roadmap

Done in recent iterations: Repo Health Score, Stale Branch Risk, Churn Risk Index, Ownership Concentration Alerts, Contributor Volatility, code-split bundle, Cmd+K palette, custom chart tooltips, three-pillar IA refactor.

Next:

- [ ] Incremental SQLite analysis cache + per-section refresh that uses cache age
- [ ] Global date-range filter (sticky across pages, scoped to the active pillar)
- [ ] Diff syntax highlighting (Shiki, lazy-loaded)
- [ ] Side-by-side diff toggle
- [ ] Repo grouping / tagging
- [ ] Markdown / PNG export of charts
- [ ] Windows MSI + macOS DMG + auto-updates

---

## License

TBD.
