# TL handoff: Stage 1 — Verified earning-opportunity discovery

- **Status:** Ready for implementation
- **Created:** 2026-11-12
- **Owning repository:** payswapdotorg/Hop3
- **Normative references:** [PRODUCT](../PRODUCT.md), [ARCHITECTURE](../ARCHITECTURE.md), [DOMAIN-MODEL](../DOMAIN-MODEL.md), [CONNECTORS](../CONNECTORS.md), [ROADMAP](../ROADMAP.md), [ADR-0001](../adr/0001-source-of-truth-and-zcode-foundation.md), [ADR-0002](../adr/0002-earn-first-mvp-and-policy-aware-connectors.md)

## 1. Mission

Deliver the first working Hop3 experience on top of the actual ZCode application: an individual configures a private worker profile, searches a small set of real permitted sources, sees genuine opportunities with evidence and eligibility/payout details, saves a suitable item, prepares an application and tracks what happened.

**Primary user:** someone seeking a few extra payments, not necessarily a full-time freelance career.

**Primary acceptance journey:**

> "I live in [country/region], speak [languages], can do [skills], have [hours] available, and would like to earn about [target] extra. Find legitimate opportunities I can actually apply for."

Hop3 returns only evidence-backed opportunities from connected sources, explains eligibility and unknowns, separates gross from estimated net value, and offers an approved next step. If no suitable opportunity exists, it says so and identifies the source/eligibility gaps.

This is a discovery-and-assistance MVP, not a guarantee of income.

## 2. Current repository posture

At handoff creation:
- payswapdotorg/Hop3 was empty (size 0, no code, no prior commits) before the initial README bootstrap.
- The initial README commit is b94fd82c4bc3373783fbf7df7e881e8834020a43.
- The product specs and handoff are being established on hop3/charter-stage1; this docs bootstrap must be merged to main before implementation starts.
- The pinned upstream ZCode source is b95ebaffeab641907b38652f45c1502bd762972d, identified as v3.18.0, source sync 2026-11-11.
- There is not yet a Hop3 codebase to test. Do not claim runtime verification until the upstream import has happened.

## 3. First task: import and establish the reproducible ZCode baseline

Before product implementation:

1. Clone https://github.com/payswapdotorg/Hop3.git.
2. Retain origin as payswapdotorg/Hop3.
3. Add upstream as https://github.com/zai-org/ZCode.git.
4. Fetch the exact pinned commit b95ebaffeab641907b38652f45c1502bd762972d.
5. Import that commit and its history into Hop3. Preserve the original commit graph and upstream LICENSE, NOTICE, third-party notices and attribution. A reviewed merge of unrelated histories is acceptable; do not replace Hop3's specs or silently discard either repository's content.
6. Resolve root README deliberately: retain Hop3's product README and link to upstream ZCode usage/development docs. Preserve upstream AGENTS.md and all other contributor guidance; add Hop3 rules through HOP3_RULES.md.
7. Record exact upstream/main and imported commit SHAs. Keep upstream remote configured.
8. Create docs/architecture/UPSTREAM-MAP.md with source-backed files/symbols/test paths for app navigation, composer, sessions, plugin manifests/lifecycle, remote MCP/OAuth, scheduler, permissions/approvals, persistence and E2E.
9. Run the upstream workspace freshness check, install/bootstrap, typecheck, lint, format, build or documented equivalent, and critical baseline smoke tests. Use the exact scripts and tool versions in the imported checkout. Record all results and pre-existing failures.
10. Establish a regression baseline before Hop3 behavior changes.

Do not begin feature work against a guessed copy of ZCode or a moving unpinned upstream branch.

## 4. Stage 1 deliverables

### D1 — Preserved ZCode baseline

- Existing ZCode desktop, web and CLI/TUI build and launch according to upstream instructions.
- Existing composer controls, model/provider settings, sessions, workspaces, attachments, terminal, browser, files, tools, plugins and permissions remain available.
- No new shell, replacement framework, duplicated Agent runtime or hidden feature removal.
- An upstream source map links every modified extension point to its current owner/callers/tests.

### D2 — WorkerCapabilityProfile

A user can create/edit a private profile with:
- country and broad working region;
- languages and proficiency;
- skills and experience;
- qualifications/certificates where relevant;
- remote/local/hybrid preference;
- availability and time zone;
- equipment/access the user declares;
- target extra income and currency;
- payout provider/rail capability status (no account credentials);
- preferred/excluded opportunity types and work constraints.

Profile sharing is least-privilege and connector-specific. The user reviews fields shared to each connected source.

### D3 — Source registry and four Stage 1 source paths

Implement policy-aware source adapters or registered connections for:

1. **OneForma public opportunity board:** read-only public discovery of project listings. Parse each project's country/language/skill/payment fields only where the official listing actually exposes them. Use only an access method allowed by current terms/robots policy. No authenticated endpoint reverse engineering.
2. **Upwork official MCP:** local/desktop-first OAuth connection to https://mcp.upwork.com/mcp; read-only freelancer job search in Stage 1. Use user-provided search criteria. Do not add independent Hop3 scores/rankings/selection for Upwork opportunities. Preserve provider order/filters as permitted. Respect the current shared account rate limits.
3. **Fiverr official MCP:** register the official server https://mcp.fiverr.com/mcp for buyer-side talent discovery and brief scoping only. Make the UI explicit that this helps buyers find workers; it is not a Fiverr seller job feed. No ordering/payment inside Hop3.
4. **User-submitted URL intake:** allow a user to add a link from a browser or composer and process only permitted public content or content the user is authorized to provide.

If a provider connection is blocked by callback restrictions or an unavailable UI surface, mark it blocked with evidence and provide a user-facing supported handoff. Do not silently substitute scraping.

### D4 — Opportunity domain

Implement the smallest versioned domain slice described in DOMAIN-MODEL.md:
- WorkerCapabilityProfile.
- Opportunity and SourceEvidence.
- Source and source-run metadata.
- EligibilityAssessment (eligible, ineligible, unknown, needs_user_input).
- EconomicsEstimate with gross/net ranges, assumptions and unknown costs.
- Saved item and Application/Assignment/Outcome tracking sufficient for Stage 1.
- Freshness, expiry and conservative deduplication.

The source platform remains authoritative for its job, project, account and contract. Hop3 records a normalized snapshot and source link; it does not create a marketplace mirror.

Use the existing ZCode storage, service and migration conventions after the source audit. There must be one durable owner for each state type.

### D5 — Earn experience inside current ZCode UI

Add an additive Earn entry/journey in existing navigation. Minimum views:
- profile setup/edit;
- source connections/status;
- opportunity inbox with filters;
- opportunity detail with source/evidence, observed time, eligibility, unknowns, fees/payout, economics assumptions and next step;
- saved opportunities;
- application/outcome tracker.

Retain existing New Task and normal chat workflows. A user can launch an opportunity-related task through the existing composer/session path, prefilled with source evidence and context, without auto-sending a message or application.

Build with the existing UI framework, shared components, routing, theme, i18n and platform adapters. Do not implement a separate app or replace the main shell.

### D6 — Application assistance and outcome truth

- Generate a draft checklist and application materials from truthful user-provided facts.
- The user must review all claims and approve the action.
- In Stage 1, opening the official provider flow may be the completion boundary if a permitted submit operation is unavailable.
- Track draft prepared, applied, accepted, in progress, submitted, approved and paid only with appropriate evidence.
- User-reported outcomes must be labelled as such; provider-confirmed or payment-confirmed evidence is distinct.
- No credential storage outside ZCode's existing approved OAuth/secret mechanism.

## 5. Explicit non-goals for Stage 1

- No autonomous proposal or application submission.
- No Fiverr seller-side job feed claim.
- No Upwork independent job/freelancer scoring, ranking or selection.
- No unauthorized scraping, CAPTCHA bypass, anti-bot evasion or hidden browser automation.
- No automatic messages, hiring, offers, contracts, milestone acceptance or payment.
- No custody, escrow, payout initiation or money movement.
- No multi-hop subcontracting, worker team marketplace, public worker directory or reputation marketplace.
- No generalized Opportunity Graph optimizer, full strategy marketplace or user-to-user node network.
- No demographic inference or sensitive-profile enrichment.
- No guaranteed earnings or claims that a listing is payable to a user without country-specific evidence.

## 6. Suggested parallel work plan (TL + three workers)

The TL first defines the source-backed integration map and freezes the shared interfaces. Workers do not invent parallel contracts.

| Owner | Exclusive workstream | Outputs |
|---|---|---|
| TL | Upstream import, baseline verification, architecture map, shared contracts, branch coordination, integration and final acceptance | Imported ZCode baseline; source map; reviewed interfaces; integration PR; evidence report |
| Worker A | Source registry and connectors | OneForma read-only adapter; Upwork remote MCP registration/connection and read-only job-search adapter; Fiverr buyer-side MCP registration/adapter; URL intake; connector policy tests |
| Worker B | Opportunity domain and persistence | Profile, opportunity/evidence, eligibility, economics, lifecycle, dedupe/freshness; migrations/repository/service and contract tests |
| Worker C | Existing-shell Earn UX and E2E | Profile and source views, opportunity inbox/detail, saved/application tracker, composer handoff, desktop/web regression and E2E |

Coordination rules:
- TL creates/approves the contract interfaces before parallel implementation begins.
- Workers own non-overlapping directories; shared schema changes go through the TL.
- Worker A does not own normalized domain models; Worker B does not implement provider-specific policy; Worker C consumes the service contract and does not own persistence.
- Integrate in this order: baseline → domain/schema → source adapters → UI → end-to-end verification.
- If actual upstream architecture contradicts an assumed path, stop and update this handoff/ADR before coding. Do not force the design onto an unsuitable upstream boundary.

## 7. Required acceptance tests

### Earner journey

1. A new user can configure, save and edit a profile without connecting any provider.
2. Country, language, skill, time, payout and work-mode requirements are represented explicitly.
3. At least one source returns live public data or a real authenticated result when that source is available. A fixture must be clearly labelled and never presented as live.
4. An opportunity with an unsupported country is not marked eligible.
5. An opportunity with unknown payout compatibility is shown as unknown, not guaranteed payable.
6. Every displayed opportunity includes source name/link, observed time, freshness/status and the evidence for important claims.
7. Duplicate source records do not create duplicate inbox cards; separate source offers remain traceable.
8. Fees, unpaid qualification time, Connects, travel and known payout thresholds affect net estimates; unknown costs are disclosed.
9. A user can save an item, prepare application materials and open the official application page.
10. No application is sent without explicit confirmation.
11. An application is not marked accepted or paid based solely on a click or generated text.
12. An empty, blocked, stale or rate-limited source is reported accurately; no fabricated opportunities appear.

### Provider-specific

- **OneForma:** project-level countries/languages/requirements are parsed or left unknown; payout guide is not misrepresented as country-specific proof.
- **Upwork:** OAuth connection and read-only search are tested in a supported local surface; rate-limit errors back off; no Hop3 independent rank/score/select function is applied to Upwork results; write action remains gated.
- **Fiverr:** buyer-side talent discovery works through the official endpoint; UI does not imply a seller job feed; no checkout or credentials are handled in Hop3.
- **URL intake:** inaccessible/private/blocked page yields a user handoff, not a bypass attempt.

### Regression and engineering

- ZCode baseline smoke tests pass after import.
- Existing composer controls and primary sessions/workspaces still work.
- Existing MCP/plugin install, OAuth and approval flows remain functional.
- Desktop and web surfaces load; unsupported connector capability is communicated.
- CLI/TUI still builds/runs and can invoke ordinary existing Agent tasks.
- Required upstream lint/typecheck/format/build and applicable E2E checks run with exact outputs recorded.
- No credentials or personal data appear in logs, fixtures or committed files.

## 8. Source-verification and quality gates

For every opportunity displayed:
- source provider, canonical URL and observation time;
- original source ID if available;
- current/expired status;
- geographic, language and qualification requirements;
- compensation amount/unit and whether it is fixed or estimated;
- payout method/threshold/region proof or explicit unknown;
- application cost and qualification/test cost where known;
- material risks and next step.

Do not use generic AI confidence as a substitute for evidence. Keep fetched source facts separate from generated explanation.

## 9. Engineering verification procedure

After importing the source tree:
1. Run upstream freshness check before changing files.
2. Record Node/pnpm/runtime versions from upstream manifests.
3. Install and bootstrap exactly as the upstream README directs.
4. Run baseline lint/typecheck/format/build and relevant smoke/E2E tests.
5. Map the exact packages and tests for each change.
6. Add Hop3 domain contracts and migration with schema/contract verification.
7. Test connector behavior with fixtures and live provider smoke tests separately.
8. Run required project gates and desktop/web/CLI regression.
9. Compare against the imported baseline and inspect changed files and removed lines.
10. Update this handoff with actual status, commit SHAs, test logs/evidence and known limitations.

Do not state test commands in the PR by analogy; read the imported package manifests and contributor docs first.

## 10. Completion report required from TL

The final Stage 1 report must include:
- Base and head SHAs; upstream pinned SHA and remote configuration.
- Exact changed files and why.
- Architecture map: every new module's owner, callers, storage and execution path.
- Source adapters, OAuth scopes, tool operations, geographic/payout limits and policy constraints.
- Data schemas/migrations and backfill/rollback.
- Test commands, environment, actual results and CI links.
- Live connector smoke-test evidence (or exact reason blocked).
- Desktop/web/CLI screenshots or browser/E2E artifacts as relevant.
- Existing ZCode features checked for regression.
- Remaining known issues and the next smallest implementation slice.

A handoff is complete only when the product can be exercised end to end and evidence is in the repository. A scaffold or green report alone is not acceptance.
