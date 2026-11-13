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

## 4. Honest boundaries (as of the sixth TL session; partially superseded by §5)

- ~~Desktop E2E~~ → the **container demo** (replay-safe default-preset specs) landed in CI with the seventh TL session, §5 below; the **release-track matrix** (Windows shards, coverage runs) and the credential-gated upstream-provider validation remain maintainer duties.
- **Login-gated in-shell earner journey** — needs a real Z.AI account; maintainer duty.
- **fmt drift remediation** — maintainer decision; an unrelated repo-wide reformat is out of scope by HOP3_RULES §8, so the gate stays advisory until then.

## 5. Desktop E2E container job — seventh TL session (PR #8, merged `004982ee`)

**What landed:** a second job `desktop-e2e-container` in the same workflow — the upstream-documented Docker demo path (`pnpm test:e2e:container` → `bash scripts/test-desktop-e2e-container.sh`) on `ubuntu-latest`: `Dockerfile.desktop-e2e` build (node:24.14.0-bookworm + Electron/Xvfb/dbus deps + frozen-lockfile install), Chromedriver prefetch (driver matching the locked Electron version), then the specs inside the container with `--network none` (`E2E_PROVIDER_HTTP_MODE=replay`). This is the first CI exercising of the **desktop Electron shell** end to end — previously only the web shell had been browser-verified (fifth TL session).

**First run (43329632366) — 4 of 5 default-preset specs green, one diagnosed:**

- Docker image build ~4.5 min; spec run 2m41s; `gates-and-build` fully green on the same run.
- Green: container-boot (main window boots + default workspace created in the container virtual display, 6.1s) · smoke (v4 session pane + composer displayed, 7.4s) · e2ecase-regression (3 passing, 3 conditionally skipped, 8.9s) · task-list-archive-confirmation (20.3s).
- **Failed by design incompatibility:** `infrastructure/smoke/upstream-provider.test.ts` is hardcoded to capture mode by `resolveUpstreamE2EHttpModeForWorker` ("Upstream provider smoke 与缺 fixture 的 manual-review 验证真实上游") — it validates the **real** upstream provider and requires `E2E_PROVIDER_API_KEY` plus live network; under replay isolation it logs `Manual review defaults to capture` and fails with 没有捕获到 上游 请求. Fix (commit `0a9519c2`): `E2E_SPEC` — the script's own documented spec-selection knob — selects `DEFAULT_E2E_SPEC` verbatim minus that entry. It stays a credential-gated maintainer check.
- **Artifact upload bug diagnosed from the action's own debug output:** `.e2e-artifacts` is a dot-directory and `actions/upload-artifact@v4` defaults to `include-hidden-files: false` — the bind mount had produced the files but the glob matched nothing. Fix: `include-hidden-files: true` (commit `0a9519c2`).

**Green run (43332419634, PR head `0a9519c2`):** `Spec Files: 4 passed, 4 total (100% completed) in 00:00:51`; artifact `desktop-e2e-artifacts.zip` uploaded successfully (235,771 bytes, ID 13996536108); `gates-and-build` green on the same run. Post-merge main run (43334615409 @ `004982ee`): **both jobs green on main** — the desktop shell gate is live for every push to `main` and every PR.

**Not covered (honest, recorded in the workflow comments and the PR body):** upstream-provider real-provider validation (credential-gated); the Windows-sharded release matrix and coverage runs; the `conversation-session-verified` (25 specs) / `plugins-verified` (1 spec) replay-admitted container presets — natural follow-ups for deeper container coverage; the login-gated in-shell earner journey.
