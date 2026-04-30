# codesight

> **Local Git Intelligence Layer.** A free, offline desktop app that turns your `.git` directories into deterministic metrics, heuristic insights, and graph-aware structural views — no GitHub account, no API tokens, no network calls.

Built with **React + Rust + Tauri**. Single binary; no system git or sqlite required.

---

## The three pillars

codesight is organized around three coherent axes. Every metric, every page, every backend command belongs to exactly one of them.

### 1. Activity — *deterministic*

Counts and rates that are exact, reproducible, and judgment-free.

- **Heatmap** — year-by-year contribution heatmap, custom SVG
- **Timeline** — commits or churn (additions/deletions) by day / week / month
- **Patterns** — hour × day-of-week distribution, "when does this team work"

### 2. Insights — *heuristics*

Opinions baked from the same git data — lossy compression with judgment.

- **Hotspots** — most-changed files / directories / co-changing pairs (couplings)
- **Ownership** — bus factor + per-file primary author
- **Authors** — full contributor list with personal drill-down (per-author heatmap, top files, recent commits)
- **Messages** — conventional commit type distribution + avg subject length

### 3. Graph — *git graph intelligence*

DAG-aware analysis: structure, refs, ancestry.

- **DAG** — gitk-style commit graph across all branches, ref labels (HEAD / branches / tags), lane layout
- **Branches** — local & remote, HEAD pin, ahead/behind vs. default, stale-branch filter
- **Releases** — chronological tags with tagger, message, commits-since-previous

---

## Cross-repo

- **Home** — combined contribution heatmap across all repos, aggregated stats, cross-repo activity feed, per-author filter
- **Search** — multi-filter commit search (message, author, date range, file path)
- **Compare** — multi-select repos, side-by-side stats and merged monthly chart

---

## UX

- English / Turkish (react-i18next; default English, easy to extend)
- Light / dark / system theme with custom OKLCH palette
- `⌘K` / `Ctrl K` command palette (jump to any page or repo)
- Resizable, scrollable sidebar; double-click handle to reset
- Repo filter input when 6+ repos
- Refresh button (top bar) invalidates all cached queries
- Per-file collapsible diff in commit detail; click any commit hash anywhere to drill in
- Skeleton loaders, page fade transitions, custom-styled scrollbars

---

## Tech stack

**Frontend**
- Vite + React 19 + TypeScript
- Tailwind CSS v4 (manual UI primitives)
- react-router-dom v7 (nested routes for sections)
- @tanstack/react-query
- recharts + custom SVG (heatmaps, DAG)
- lucide-react
- react-i18next + i18next-browser-languagedetector

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
│   │   ├── Heatmap.tsx        # Custom SVG contribution heatmap
│   │   ├── DiffView.tsx       # Per-file collapsible diff
│   │   ├── Sparkline.tsx      # currentColor-aware bar chart
│   │   └── …
│   ├── pages/
│   │   ├── HomePage.tsx           # Cross-repo dashboard
│   │   ├── SearchPage.tsx         # Universal commit search
│   │   ├── ComparisonPage.tsx     # Cross-repo compare
│   │   ├── SettingsPage.tsx
│   │   ├── CommitDetailPage.tsx
│   │   ├── ContributorDetailPage.tsx
│   │   ├── HeatmapPage.tsx        # Activity → Heatmap
│   │   ├── TimelinePage.tsx       # Activity → Timeline
│   │   ├── PatternsPage.tsx       # Activity → Patterns
│   │   ├── HotspotsPage.tsx       # Insights → Hotspots
│   │   ├── OwnershipPage.tsx      # Insights → Ownership
│   │   ├── ContributorsPage.tsx   # Insights → Authors
│   │   ├── MessagesPage.tsx       # Insights → Messages
│   │   ├── GraphPage.tsx          # Graph → DAG
│   │   ├── BranchesPage.tsx       # Graph → Branches
│   │   ├── TagsPage.tsx           # Graph → Releases
│   │   └── sections/
│   │       ├── ActivitySection.tsx
│   │       ├── InsightsSection.tsx
│   │       └── GraphSection.tsx
│   ├── state/                 # AppStateProvider (Context + localStorage)
│   └── lib/                   # graphLayout, format, cn
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs             # #[tauri::command] handlers
│   │   ├── analysis.rs        # All git analytics + diff walks
│   │   ├── repo.rs            # add / scan / list / remove repository
│   │   ├── db.rs              # SQLite wrapper
│   │   └── error.rs           # AppError + Serialize
│   ├── capabilities/
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

---

## Architecture notes

- **Local-only.** No GitHub API, no telemetry, no network. Every read goes to local `.git` via libgit2.
- **Self-contained binary.** `vendored-libgit2` and bundled SQLite — no system dependencies.
- **Concurrency.** Every Tauri command uses `tauri::async_runtime::spawn_blocking`. Cross-repo aggregations use `rayon`.
- **Caching.**
  - Server data: TanStack Query (60s staleTime, no refetch-on-focus)
  - App state: React Context → `localStorage` (selected repo, theme, my-email filter, sidebar pane height)
  - Disk: SQLite at `dirs::data_local_dir()/codesight/codesight.sqlite` — currently only repository list. Incremental analysis cache is on the roadmap.
- **Three-pillar IA.** Routes are nested: `/activity/{heatmap,timeline,patterns}`, `/insights/{hotspots,ownership,authors,messages}`, `/graph/{dag,branches,releases}`. Every new metric must clearly belong to one pillar.

---

## Adding a new metric

1. **Pick the pillar.** Is it deterministic count → Activity. Heuristic / opinion → Insights. DAG / ref-aware → Graph.
2. **Backend (`src-tauri/src/analysis.rs`)**
   - Define a `Serialize`/`Deserialize` struct
   - Implement `your_metric_impl(db: &Db, ...) -> AppResult<T>`
3. **Tauri command (`src-tauri/src/lib.rs`)**
   - `#[tauri::command] async fn` wrapping `spawn_blocking`
   - Add to `invoke_handler![…]`
4. **Frontend**
   - Mirror the type in `src/types.ts`
   - Add an API method in `src/api.ts`
   - Build the page in `src/pages/` and add as a tab to the relevant `Section.tsx`
   - Add i18n keys in `src/i18n/locales/{en,tr}.json`
   - If you find yourself adding a new top-level sidebar item, ask whether it really belongs in Activity / Insights / Graph first

---

## Roadmap

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
