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
