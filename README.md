# codesight

> Local-first git analytics desktop app — a free, offline alternative to GitHub Insights.

codesight reads your local `.git` directories and turns them into a comprehensive analytics dashboard. No GitHub account, no API tokens, no network calls — just point it at your repositories and explore.

Built with **React + Rust + Tauri**. Single binary, no system git or sqlite required.

---

## Features

### Cross-repo home

- Combined contribution heatmap across all repositories
- Aggregated stats: total commits, last-30-day activity, active repos, distinct authors
- Cross-repo activity feed (latest commits with repo badges, links to commit detail)
- Per-author filter (auto-populated from commits across all your repos), persisted

### Per-repo analytics

- **Overview** — total commits / contributors / branches / last commit + top contributors + language pie + commit message stats + file hotspots + recent activity
- **Heatmap** — GitHub-style year-by-year contribution heatmap, custom SVG
- **Timeline** — commits or churn (additions/deletions) by day / week / month
- **Activity** — hour × day-of-week heatmap to see when your team works
- **Branches** — local & remote branches, HEAD pin, ahead/behind vs. default
- **Releases / Tags** — chronological tag list with tagger, message, commits since previous
- **Contributors** — full list with relative-share bars; click into per-author detail page (personal heatmap, top files, recent commits, additions/deletions, active days)
- **Ownership** — bus factor, top author shares, per-file primary author + share %
- **Search** — multi-filter commit search (message text, author email, date range, file path)
- **Graph** — gitk-style commit DAG across all branches, lane layout, ref labels (HEAD / branches / tags), 50–500 commits

### Commit detail / diff viewer

- Full commit message, parents (linkable), author/committer, file count + insertions/deletions
- Per-file unified diff with red/green line highlighting
- Collapsible files (per-file toggle + expand-all / collapse-all)
- Binary file detection
- "No file changes" state for merge / empty commits

### Cross-repo

- **Comparison** — multi-select repos, side-by-side stats and merged monthly commit chart
- Sidebar repo list with per-repo 30-day sparklines (rayon-parallel computation)

### UX

- English / Turkish via `react-i18next` (default English, easy to extend)
- Light / dark / system theme with custom OKLCH palette and chart colors
- Resizable, scrollable sidebar (drag the divider, double-click to reset)
- Auto-filter input when 6+ repos
- Empty states, skeleton loaders, page fade transitions, custom-styled scrollbars

---

## Tech stack

**Frontend**
- Vite + React 19 + TypeScript
- Tailwind CSS v4 (manual UI primitives, no shadcn CLI)
- react-router-dom v7 for routing
- @tanstack/react-query for server-state caching
- recharts for line/area/bar/pie; custom SVG for heatmaps and DAG layout
- lucide-react icons
- react-i18next + i18next-browser-languagedetector

**Backend**
- Tauri 2
- git2 with `vendored-libgit2` (no system libgit2 needed)
- rusqlite with bundled SQLite
- rayon for cross-repo parallelism
- chrono, walkdir, parking_lot, anyhow, thiserror

**Plugins**
- `tauri-plugin-dialog` (file/folder picker)
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
  - **Linux:** webkit2gtk + librsvg + build-essential (see Tauri docs)

### Install

```bash
pnpm install
```

### Run in dev mode

```bash
pnpm tauri dev
```

Opens the desktop window with frontend hot-reload and Rust auto-rebuild on changes.

### Production build

```bash
pnpm tauri build
```

Bundle output lands in `src-tauri/target/release/bundle/` (platform-native installer / app).

### Type-check / build (frontend only)

```bash
pnpm build         # tsc + vite build
```

---

## Project structure

```
codesight/
├── src/                       # React app
│   ├── api.ts                 # Tauri command wrappers
│   ├── types.ts               # TS types mirroring Rust structs
│   ├── i18n/                  # English + Turkish locales
│   ├── components/            # UI primitives + feature components
│   │   ├── ui/                # Button, Card, Select, Tabs, Input, Skeleton
│   │   ├── AppShell.tsx       # Sidebar + outlet + page transition
│   │   ├── Sidebar.tsx        # Nav + resizable repo list
│   │   ├── Heatmap.tsx        # Custom SVG contribution heatmap
│   │   ├── DiffView.tsx       # Per-file collapsible diff renderer
│   │   ├── Sparkline.tsx      # currentColor-aware mini bar chart
│   │   └── …
│   ├── pages/                 # Route components
│   │   ├── HomePage.tsx       # Cross-repo dashboard
│   │   ├── Overview.tsx       # Per-repo overview
│   │   ├── HeatmapPage.tsx, TimelinePage.tsx, ActivityPage.tsx
│   │   ├── BranchesPage.tsx, TagsPage.tsx, ContributorsPage.tsx
│   │   ├── ContributorDetailPage.tsx, OwnershipPage.tsx
│   │   ├── SearchPage.tsx, GraphPage.tsx, ComparisonPage.tsx
│   │   ├── CommitDetailPage.tsx, SettingsPage.tsx
│   ├── state/                 # AppStateProvider (Context + localStorage)
│   └── lib/                   # graphLayout, format, cn
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   ├── lib.rs             # #[tauri::command] handlers + invoke_handler![]
│   │   ├── analysis.rs        # All git analytics & diff walks
│   │   ├── repo.rs            # add / scan / list / remove repository
│   │   ├── db.rs              # SQLite wrapper (parking_lot::Mutex<Connection>)
│   │   └── error.rs           # AppError with Serialize for JS-side errors
│   ├── capabilities/          # Tauri permissions
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

---

## Architecture notes

- **Local-only.** Every read comes from `.git` on disk via libgit2. No GitHub API, no telemetry, no network.
- **Self-contained binary.** `vendored-libgit2` and bundled SQLite remove system dependencies.
- **Concurrency.** Every Tauri command uses `tauri::async_runtime::spawn_blocking` so the UI stays responsive while libgit2 walks. Cross-repo aggregations (global summary, global heatmap, sparklines, known authors) use `rayon` to walk repositories in parallel.
- **Caching.**
  - Server data: TanStack Query (60s staleTime, no refetch-on-focus)
  - App state: React Context → `localStorage` (selected repo, theme, my-email filter, sidebar pane height)
  - Disk: SQLite at `dirs::data_local_dir()/codesight/codesight.sqlite`. Currently stores only the repository list — analysis runs fresh every call. (Incremental cache is on the roadmap.)
- **Errors** flow as serialized strings to the frontend via `AppError`'s manual `Serialize` impl.

---

## Adding a new metric

1. **Backend (`src-tauri/src/analysis.rs`)**
   - Define a `Serialize`/`Deserialize` struct
   - Implement `your_metric_impl(db: &Db, ...) -> AppResult<T>`
2. **Tauri command (`src-tauri/src/lib.rs`)**
   - `#[tauri::command] async fn` wrapping `spawn_blocking`
   - Add to `invoke_handler![…]`
3. **Frontend**
   - Mirror the type in `src/types.ts`
   - Add an API method in `src/api.ts`
   - Build a page/component in `src/pages/` or `src/components/`
   - Add a route in `src/App.tsx` and a nav item in `src/components/Sidebar.tsx`
   - Add i18n keys in `src/i18n/locales/{en,tr}.json`

---

## Roadmap

- [ ] Incremental SQLite analysis cache + refresh button
- [ ] `Cmd+K` command palette
- [ ] Global date-range filter (sticky across pages)
- [ ] Co-changed files (file coupling)
- [ ] Stale branches detector
- [ ] Diff syntax highlighting (Shiki/Prism)
- [ ] Side-by-side diff toggle
- [ ] Repo grouping / tagging
- [ ] Per-directory hotspots
- [ ] Markdown / PNG export of charts
- [ ] Code-split bundle (currently ~890 KB JS)
- [ ] Windows MSI + macOS DMG + auto-updates

---

## License

TBD.
