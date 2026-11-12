# Stage 1 CI gates — delivery and verification record

- **Date:** 2026-11-12 (sixth TL session — post-merge CI follow-up)
- **Branch:** `stage1/ci-gates` (PR **#6**, merged into `main` as `65478f6f`) + this record on `stage1/ci-gates-docs`
- **Normative references:** `docs/handoffs/STAGE-1.md` §13 (remaining obligations), root `README.md` "Upstream engineering gates", `HOP3_RULES.md` §8 (pinned toolchain, no invented commands, honest reporting)

## 1. What landed

`.github/workflows/ci.yml` — the repository's first CI workflow (the imported upstream tree and `origin/main` carry no `.github` at all, verified via `git ls-tree` on both). It executes the repository's own gate set plus the full-workspace build on a GitHub-hosted `ubuntu-latest` runner:

- **Triggers:** `push` to `main`, `pull_request` against `main`; `concurrency` cancels superseded runs per ref; `permissions: contents: read`; no secrets.
- **Toolchain:** Node from `.nvmrc` (resolved 24.22.2; `engines >=24.0.0`, mise pin 24.14.0), pnpm from the `packageManager` field (`pnpm@10.33.2`), lockfile-frozen install, pnpm store cache.
- **Steps (exact repo commands, in order):** `pnpm bootstrap` → `ci:assert-node` → `lint` → `docs:stale-phrases:check` → `test:architecture` → `db:schema:check` → `architecture:check -- --changed` → `typecheck` → `test:engineering` → `fmt:check` (advisory) → `build`.
- **`ARCHITECTURE_BASE` wiring:** PR events diff against `origin/main` (merge-base, `fetch-depth: 0`); push events diff against `github.event.before` (the previous tip) — matching the `scripts/architecture/git-base.mjs` resolver order.
- **`NODE_OPTIONS=--max-old-space-size=4096`** for the root `tsc -b` chain (the default V8 heap aborts on this tree — recorded in `earn-port-verification.md` §5).
- **Bootstrap retry:** three bounded attempts with `::warning` annotations per failed attempt — see §2 run 1 for the motivating flake. A deterministic failure still fails the job (three identical failures exit non-zero).

## 2. Run record (GitHub-hosted runner; Node 24.22.2; pnpm 10.33.2)

| Run | Event / SHA | Result | Notes |
|---|---|---|---|
| [43316781097](https://github.com/payswapdotorg/Hop3/actions/runs/43316781097) | pull_request @ `1cf878b4` | **failure** | `pnpm install` inside bootstrap aborted with `ERR_PNPM_ENOENT` renaming tsup's nested `esbuild` from a `_tmp_` directory while concurrent native postinstalls (node-pty, esbuild, cpu-features, electron) ran — the transient hoisted-linker race class. Fixed by the bounded retry (commit `8a116564`). |
| [43317079051](https://github.com/payswapdotorg/Hop3/actions/runs/43317079051) | pull_request @ `8a116564` | **success** — 12m49s | All 15 steps green; details in §3. |
| [43320227978](https://github.com/payswapdotorg/Hop3/actions/runs/43320227978) | push @ `65478f6f` (post-merge of #6) | **success** — 12m13s | All 13 steps green; validates the push-event wiring (`ARCHITECTURE_BASE=github.event.before` — the scoped architecture gate diffs exactly the merged change). One bootstrap retry (the ENOENT flake again), attempt 2 succeeded. |
| [43320740434](https://github.com/payswapdotorg/Hop3/actions/runs/43320740434) | pull_request @ `514e0280` (PR #7 docs) | **success** | Validates the docs + workflow-comment-correction tree before merge. |

**Flake statistics:** the hoisted-linker ENOENT reproduced on the first attempt of every fresh-scope install (2/2 runs) and the bounded retry succeeded every time (2/2), with a visible `::warning` annotation per failed attempt — consistent with the transient race class, and the job still fails loudly if all three attempts fail.

## 3. Green run details (43317079051)

- **Bootstrap:** attempt 1 hit the same ENOENT (visible annotation `pnpm bootstrap attempt 1 failed — retrying`); attempt 2 succeeded.
- **Lint:** 0 errors; 525 baseline warnings (visible as annotations) — matches the sandbox record exactly.
- **docs:stale-phrases:check:** clean. **test:architecture:** pass. **db:schema:check:** PASS (both baselines compatible).
- **architecture:check --changed** (base = merge-base `origin/main`): violations 0 / baseline 0 / new 0.
- **Full-workspace typecheck:** PASS, single root `tsc -b` chain, ~3.5 min (sandbox needed 8 sequential chunks at `--max-old-space-size=2560`; the runner completes the identical project list in one process with the 4096 MB heap).
- **test:engineering:** `Test Files 171 passed | 2 skipped (173)` · `Tests 1120 passed | 8 skipped (1128)` · **0 failed**. The sandbox's single baseline failure (`miseToolchainEnv`) was diagnosed before the run as environment-specific — it only fails when Node's `execPath` directory is `/usr/bin` (system node; the runner provisions Node from a tool-cache path) — and the sandbox's 4 import-error-only files did not reproduce on the runner either.
- **fmt:check:** exit 1 — "Format issues found in above 1605 files", the identical count reproduced by the fifth TL session in the sandbox (deterministic drift under the lockfile's oxfmt). Advisory by design: the step is marked failed-but-allowed in the run UI and the file list is in the step log.
- **Full workspace build: PASS** — including `packages/web` (vite, `✓ built in 16.53s`) and the `packages/desktop` renderer production bundle (vite 8.0.8 / rolldown, `✓ built in 16.87s`): the two production bundles whose peak memory SIGKILLs under the 4G dev-sandbox cgroup (STAGE-1.md §13, earn-port evidence §5). The build obligation recorded as "CI duties" is closed with runner evidence.

## 4. Honest boundaries (unchanged obligations, maintainer duties)

- **Desktop E2E** (`pnpm test:e2e`, release-track matrix in `README.en.md`) — deliberately not in this workflow; maintainer duty.
- **Login-gated in-shell earner journey** — needs a real Z.AI account; maintainer duty.
- **fmt drift remediation** — maintainer decision; an unrelated repo-wide reformat is out of scope by HOP3_RULES §8, so the gate stays advisory until then.
