# Stage 1 earn-port verification — Earn service + UI ported into the imported tree

- **Date:** 2026-11-12 (fourth TL session — a second sandbox recycle destroyed the prior local branch; the port was rebuilt from the pushed branches + the live reference implementation and re-verified from scratch)
- **Branch:** `stage1/earn-port` (2 code commits on top of `stage1/zcode-baseline-import` @ 4dbd367e)
- **Normative references:** `docs/handoffs/STAGE-1.md` §4 D2–D6, `HOP3_RULES.md` §3/§8/§9, `docs/architecture/UPSTREAM-MAP.md`

## 1. What landed (per UPSTREAM-MAP extension points)

| Extension point | Delivered |
|---|---|
| RPC service (§10 lever 1) | `ServiceChannels.Hop3Earn` + `IEarnService` descriptor; `createEarnService` registered in `createLocalServices` (node.ts) → auto-exposed to desktop renderer + web via `RemoteServiceAccess.earnService` proxy |
| Persistence (§8) | migration `0008_earn_tables` (7 `earn_*` tables, additive-only) in `tasksDatabase/migrations.ts`; `EarnRepo` on `node:sqlite` DatabaseSync (automationRepo skeleton with stores split by the 800-line budget), pushed to `sqliteReposToClose`; baseline regenerated via `pnpm db:schema:update` |
| Tab shell (§1) | `EarnTabState` kind in `tabStore` (settings-tab pattern, not persisted); Root.tsx standalone + workspace-overlay render branches with `getTabs` workspace-only union extension; `WorkspaceSidebarFooter` entry button |
| Composer handoff (§2 / D6) | `useEarnComposerHandoff` mirroring `startDraftInWorkspace` over the same store path: `startDraft` + `requestComposerTextInsert` with the generated draft — never any send path |
| MCP/OAuth (§5 / D3) | Upwork connector reports the honest `blocked` state on 401 (OAuth 2.1 handoff message) and rides the existing MCP OAuth path — no parallel implementation; Fiverr anonymous official MCP buyer-side (provider order preserved, no Hop3 ranking); OneForma public board with runtime robots.txt check (country table split into `oneformaCountries.ts` for the file-budget rule); URL intake with SSRF guards |

## 2. Gate results (this session, branch tip — all re-run by the TL)

| Gate | Result |
|---|---|
| `pnpm lint` | PASS — 0 errors; 525 warnings = pre-existing import baseline findings; zero new errors in hop3-earn modules (two TS1016 errors in `format.ts` were found and fixed during the gate) |
| `pnpm architecture:check check -- --changed --base origin/stage1/zcode-baseline-import` | PASS — violations 0, new 0 (explicit base = the PR base; note: a shallow `upstream` fetch in this sandbox corrupts the default merge-base resolution, so the base is passed explicitly) |
| `pnpm test:engineering` | 1109 pass / 1 fail — the failing file/test (`miseToolchainEnv` PATH ordering) plus 4 import-error-only files are the same pre-existing baseline failures; **all 101 new hop3-earn tests pass** |
| `pnpm db:schema:check` | PASS — both baselines compatible |
| `pnpm exec tsc -b packages/shared` | PASS (exit 0) |
| `pnpm exec tsc -b packages/services` | PASS (exit 0, 0 errors) — 28 strictness errors found by the typechecker were fixed during the gate (regex-capture `string \| undefined` guards, ESM `.js` suffixes, an unexported split module, a non-contract `schedule` field removed from `mapTime`) |
| `pnpm exec tsc -b packages/client` | PASS (exit 0) |
| `pnpm exec tsc -b packages/ui` | PASS (exit 0, 0 errors) |
| Full workspace `tsc -b` / `pnpm build` | Services/client/ui/shared individually PASS this session (the sandbox that produced the first earn-port was OOM-blocked at this step); the full workspace build remains a CI obligation |
| Desktop / web / CLI runtime of the ported shell | NOT RUN — Electron/wdio and vite web e2e unavailable in this sandbox; CI obligation before merge |
| Live connector smoke (OneForma/Fiverr/Upwork MCP) in the ZCode shell | NOT RE-RUN for the ported connectors (behavior ported verbatim from the reference implementation where all four were smoke-tested live; re-run against the ZCode shell is a CI/pre-merge obligation) |

## 3. Contract freeze provenance

`packages/shared/src/hop3-earn/hop3EarnTypes.ts` is a verbatim port of the Stage 1 reference `contracts.ts` (DTOs, evidence-gating shapes, the five honesty constants) plus the service-layer types (`OpportunityFilters` / `OpportunityDetail` / `IntakeResult` / `EarnProfileInput` / `RecordEventInput` / `ApplicationMutationResult` — the mutation-result shape is the reconstruction decision of this rebuild, recorded here). `IEarnService` (15 methods) is the frozen surface; the implementation follows `CONTRACT.md` in all three modules. Managed modules: `hop3-earn-shared` (contract layer), `hop3-earn` (adapters, requires shared/services/session), `hop3-earn-ui` (contract: contract.ts + ui: . dual layer, requires ui/shared/services).

## 4. Known limitations / follow-ups

1. `earnRepo` reaches the migration runner via lazy dynamic import (the checker maps `tasksDatabase` into the `project-storage` module; a static import needs a policy decision — TL decision recorded). The byte-identical EARN_SCHEMA copy in migrations.ts is the checksum-frozen source with `hop3EarnSchema.test.ts` as the anti-drift guard.
2. Earn-over-workspace overlay covers the workspace (opacity + pointer-events) without `inert` — a11y follow-up.
3. Touch targets follow upstream compact sizes.
4. i18n: en-US + zh-CN complete (402 keys each, parity verified against every `earn.*` id used in code); ja/ru/ko fall back to en-US.
5. Push of this branch could not be performed from this sandbox (credential loss after two recycles); delivery is a git bundle + patches + PR texts (see download/ artifacts). The untracked `.port-tools/` scratch directory used during the port is excluded via `.git/info/exclude` and ships nothing.

## 5. Fifth-session addendum — 2026-11-12 (delivery completed; full-workspace gates; live backend smoke)

**Delivery:** the branch was pushed (tip at push = `9a16c88b`, byte-identical to the verified bundle — no commits added or rewritten), PR #5 opened stacked on #3, and the Issue #2 progress comment posted; all read back and verified via API + browser web UI. §4 item 5 above is superseded by this addendum.

**Correction to §2:** the fourth-session claim "`tsc -b packages/ui` PASS (exit 0, 0 errors)" does not reproduce in the standard full-workspace build order — the fifth session's full typecheck surfaced 10 strictness errors (6 distinct findings) in `hop3-earn-ui` that the per-package run had missed. All were fixed in the fifth session's first commit (behavior-preserving corrections only):

| Finding | Fix |
|---|---|
| `EarnPage.tsx`: `tabs.filter((tab) => isWorkspaceTab(tab) && …)` used a plain boolean callback, so the filtered array stayed `WindowTabState[]` and `t.workspaceIdentity` missed on `SettingsTabState` | filter callback annotated `tab is WorkspaceTabState` |
| `OpportunityDetail.tsx` / `OpportunityDetailSections.tsx` imported reference-implementation badge names (`EMERALD_BUTTON`, `EMERALD_OUTLINE`, `AMBER_OUTLINE`) that the port had renamed to ZCode semantic tokens | imports/usages switched to `SUCCESS_BUTTON` / `SUCCESS_OUTLINE` / `WARNING_OUTLINE` |
| `OpportunityDetailSections.tsx` read `detail?.sourceStatus` / `detail?.sourceRecordId` — the fields live on `evidence`, not on the frozen `OpportunityDetail` (reference drift) | read from `evidence` only — identical runtime values |
| `format.ts` passed `{ addSuffix: true }` to `Intl.RelativeTimeFormat` — not a standard option (inherited verbatim from the reference, whose dev mode never typechecked it) | option removed (`format()` already yields "in X"/"X ago") |
| `useEarnData.ts` declared `useEarnOpportunityDetail` as `EarnQueryResult<OpportunityDetail>` while the service returns `OpportunityDetail \| null` | return type widened to nullable |

**Full-workspace typecheck — PASS (the long-blocked obligation).** The root `tsc -b` chain aborts at the default ~2G V8 heap in this 4G cgroup; it was run as 8 sequential process invocations with `--max-old-space-size=2560` covering exactly the repo's own `typecheck` script project list (nothing skipped): session-control ✓ · shared(+testing)/rpc/provider/provider-node ✓ · design-runtime/services/client ✓ · server/zcode-server-cli ✓ · ui ✓ (after the fixes) · web/dev-docs/e2e-report ✓ · desktop main/host/renderer-services/e2e + plugin-api ✓ · remote-main `--noEmit` ✓ · zcode-cua `--noEmit` ✓. Logs: `download/hop3-earn-port/logs/tc-c*.log`.

**Builds:** every package builds except the two production bundles whose rolldown/vite peak exceeds the 4G cgroup (kernel SIGKILL in four configurations each — with/without minify, heap caps 1536/2048/2560, `RAYON_NUM_THREADS=1`): `@zcode/web` `vite build`, and the `@zcode/desktop` renderer bundle (`build:no-runtime-assets` reaches the same wall after its `prepare:build-meta` and tsc stages pass). All other packages (shared, rpc, provider, provider-node, design-runtime, services, client, server, zcode-server-cli, ui, web-share, e2e-report, plugin-api, zcode-cua, formal-proof, model-option-map, stream-animate, session-control) build clean. Upstream CI runners with ≥8G are expected to complete the two bundles.

**Web shell runtime (in-browser):** `pnpm dev:web` (server :3030 + vite :5173) boots the ported web shell — title `ZCode - Web + Server`, rendered welcome/login surface, **zero browser console errors**; screenshots `evidence-zcode-web-shell.png` / `evidence-zcode-web-shell-2.png` in the delivery package. Exercise beyond the login wall requires a Z.AI account (this sandbox holds no valid user credential — the platform config's apiKey slot is a 4-char placeholder and account-provider loading is network-gated), so the in-shell earner-journey click-through remains a maintainer/CI step; the earner journey itself was verified end-to-end in the reference implementation (PR #4), and the port's service boundary is exercised live below.

**Live backend smoke (STAGE-1 §9 step 7 — live provider smoke, separate from fixtures):** a one-off script drove the ported `createEarnService` against a throwaway `tasks-index.sqlite` (migration `0008_earn_tables` ran on first touch) through the real 15-method surface: profile null → upsert (countryCode GH) → reread ✓; four-source registry with honest states (`upwork_mcp` **blocked** with the 401 OAuth-2.1 message, oneforma / fiverr_mcp / url_intake live-ready) ✓; **live OneForma sync — 12 real public project cards fetched from `https://www.oneforma.com/projects/` with the runtime robots.txt check passing** (fetched 12 / inserted 12 / updated 0 / duplicates 0) ✓; inbox listing (12 live, provenance `live`, provider order) ✓; full detail with evidence (`sourceRecordId` job-2886, observedAt) ✓; saved toggle + private notes ✓; the complete evidence-gated tracker (create → `prepareDraft` honest notice → `saveDraft` with `draftEditedByUser` → `markPrepared` status `prepared` → `recordEvent`, 5 events) ✓; **live URL intake** of the OneForma board ✓; applications list = 1 ✓. Full JSON: `download/hop3-earn-port/logs/earn-live-smoke.json`. Nothing was submitted anywhere; no credentials were involved.

**Gates re-run on the fixed tree:** lint 0 errors (525 = baseline) · `architecture:check --changed` (explicit base) 0/0 · `test:engineering` **1118 pass / 1 fail** — the same `miseToolchainEnv` baseline failure; 3 of the 4 import-error-only files pass once no dev servers compete for sandbox resources (the remaining one is the network-gated `remoteOfficialPluginAssets`) · `db:schema:check` PASS · `fmt:check` unchanged (pre-existing whole-tree oxfmt version drift; the hop3-earn ui files were already in the failing set at the previous tip — deliberate non-remediation stands, and the fixes above add no new failures).

**Still environment-blocked (CI/maintainer obligations):** web + desktop production bundles (>4G RAM), desktop Electron e2e, the login-gated in-shell journey click-through, full `pnpm build`.
