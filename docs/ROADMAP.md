# Product roadmap

**Status:** Stage 1 implementation complete; acceptance closeout in progress (see [STAGE-1-EXIT-REPORT.md](STAGE-1-EXIT-REPORT.md)).  
**Last reviewed:** 2026-11-13

The roadmap is outcome-based. Each stage must be accepted against evidence before the next stage expands scope.

## Stage 0 — Repository authority and product definition

**Status:** Complete — upstream import landed 2026-11-12 (PR #3, pinned `zai-org/ZCode` @ `b95ebaffeab641907b38652f45c1502bd762972d`, upstream history and notices preserved; `docs/architecture/UPSTREAM-MAP.md` records the source map).

- Establish Hop3 as the authoritative repository.
- Define product, architecture, domain contracts, connector policy and Stage 1 handoff.
- Pin ZCode v3.18.0 upstream commit.
- Preserve the ZCode application and general-purpose harness as a non-negotiable constraint.

## Stage 1 — Earn-side verified opportunity discovery

**Active handoff:** [STAGE-1.md](handoffs/STAGE-1.md) · **Closeout:** [STAGE-1-EXIT-REPORT.md](STAGE-1-EXIT-REPORT.md)

Status: engineering delivered and green (earn domain + shell integration, connector smoke tests, CI gates, desktop releases `v3.18.0-hop3.1`/`v3.18.0-hop3.2` with Linux/Windows/macOS installers, local-agent install client). Remaining acceptance work is validation with real accounts and real users — tracked item-by-item in the exit report: Upwork OAuth authorized search (blocked on network egress at the account-login step), authenticated in-app earner journey (blocked on a Z.AI test account), and a measured earner pilot (blocked on a human participant).

Goal: a person can configure a private profile, connect permitted sources, discover genuine opportunities, understand country/skill/payout eligibility and estimated net economics, save an opportunity, prepare an application and track what happened.

Deliver:

- Import pinned ZCode baseline with upstream history and remote.
- Verify existing ZCode desktop/web/CLI and critical controls before Hop3 changes.
- Add the minimum Opportunity Domain and durable persistence using existing data conventions.
- Add a private WorkerCapabilityProfile.
- Add a source registry and capability/policy metadata.
- Integrate a narrow first cohort: OneForma public opportunity listings, Upwork official MCP read-only job discovery, Fiverr official MCP buyer-side talent discovery, and user-submitted URL intake. The Fiverr source is not an earner feed.
- Normalize, deduplicate, verify freshness and assess eligibility.
- Display source evidence, observed time, requirements, country support, payout unknowns, gross/net estimates and a safe next action.
- Add saved/application-prepared/application tracking without automatic submission.
- Add deterministic tests plus real source smoke tests where access is available.
- Add an Earn journey inside the current ZCode UI without replacing its shell or controls.

Not included:

- Fully autonomous proposal/application submission.
- Unauthorized scraping, CAPTCHA circumvention or hidden browser automation.
- Escrow, payments, payout collection or holding user funds.
- Multi-hop subcontracting and group coordination.
- Global marketplace launch or public user-to-user profile directory.
- Generalized plugin marketplace redesign.
- Replacement agent runtime or second tool-execution authority.

## Stage 2 — Opportunity coverage and recurring discovery

- Expand to more survey/research panels, reviewer/evaluator programmes, user testing, local shifts, language work and field tasks after source vetting.
- Add scheduled discovery with provider-aware cadence, quota budgets, source health and stale-listing controls.
- Add email/newsletter intake only with explicit account permissions and source-specific retention.
- Improve eligibility explanations, qualification guidance, reminders and user outcome learning.
- Expand supported countries/payout rails based on verified provider evidence.

## Stage 3 — Buyer-side quality-price matching

- Turn natural-language demand into a structured brief.
- Discover and compare workers using only source-permitted capabilities.
- Implement evidence-backed quality, reliability, cost, capacity and deadline comparison for Hop3-owned or suitably licensed sources.
- For platforms with restrictions (including the current Upwork MCP restrictions), preserve source-native ordering and user-driven filters; do not apply prohibited independent ranking/scoring.
- Add buyer approval and delivery acceptance journeys.

## Stage 4 — Multi-hop work planning and teams

- Decompose permitted work into typed packages and acceptance criteria.
- Match complementary workers and teams.
- Model dependencies, handoffs, capacity, deadlines, full cost, quality risk and coordination overhead.
- Require buyer consent and explicit agreement from every worker before delegation.
- Verify original contract and platform permissions before a subcontract route is proposed.
- Learn from evidenced completion and payment outcomes.

## Stage 5 — Opportunity and capability network

- Allow verified people, businesses, teams, agents and asset owners to publish capability offers.
- Add consented matching, reputation, availability, offers and capacity.
- Add dispute, fraud, compliance and payment partnerships only after jurisdictional/legal design.
- Treat escrow, custody, payouts and regulated financial activity as separate high-risk product decisions requiring appropriate licenses and controls.

## Stage exit discipline

A stage is complete only when:

- its acceptance criteria pass in the actual integrated app;
- required tests and CI are green or known failures are explicitly documented;
- external connectors work under real permissions and respect their current terms;
- no existing ZCode capability was unintentionally removed or regressed;
- source-of-truth docs and ADRs match actual code;
- measured user outcomes support the claimed value.

Do not mark a stage complete because a scaffold, mock, screenshot or agent report exists.
