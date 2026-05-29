# Contributing to codesight

Thanks for your interest in improving codesight. This document explains how to
set up the project, the conventions we follow, and the legal terms that apply to
contributions.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating you are expected to uphold it.

## Contributor License Agreement (please read)

codesight is released under the **AGPL-3.0-or-later** license, but the project is
maintained under a **dual-licensing** model: the maintainer also offers
commercial licenses to organizations that cannot or do not want to comply with
the AGPL.

For this model to work, the project must hold the rights to relicense the entire
codebase. Therefore, **by submitting a pull request you agree that:**

1. You are the original author of the contribution, or you have the right to
   submit it.
2. You grant Yusuf Özdemir (the project maintainer) a perpetual, worldwide,
   non-exclusive, royalty-free license to use, modify, and **relicense** your
   contribution, including under commercial/proprietary terms, in addition to
   the AGPL.
3. Your contribution remains available to everyone under the AGPL-3.0-or-later.

If you do not agree to these terms, please do not submit a pull request. For
larger contributions we may ask you to confirm this explicitly in the PR.

## Development setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+ and [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- Platform-specific Tauri prerequisites — see the
  [Tauri v2 guide](https://v2.tauri.app/start/prerequisites/)

### Install & run

```bash
pnpm install
pnpm tauri dev      # run the desktop app in dev mode
```

### Useful commands

```bash
pnpm build                      # type-check + build the frontend
pnpm tauri build                # build a production desktop bundle
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml
```

## Conventions

- **Commits** follow the [Conventional Commits](https://www.conventionalcommits.org/)
  style (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:` …) — match the existing
  git history.
- **Frontend:** TypeScript + React 19 + Tailwind v4. Run `pnpm build` before
  pushing so the type-check passes.
- **Backend:** Rust + Tauri 2 + git2. Keep `cargo fmt` and `cargo clippy` clean.
- Every user-facing feature should fit one of the three pillars described in the
  README: **Activity** (deterministic), **Insights** (heuristics), or **Graph**
  (graph-aware).

## Pull request checklist

- [ ] The branch builds (`pnpm build`) and Rust checks pass (`cargo clippy`).
- [ ] Commits use Conventional Commits.
- [ ] You agree to the Contributor License Agreement above.
- [ ] The change is described clearly in the PR body (the *why*, not just the *what*).

## Reporting bugs & requesting features

Use the GitHub issue templates. For security issues, **do not** open a public
issue — see [SECURITY.md](SECURITY.md).
