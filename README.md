# Hop3

**Hop3 is an opportunity-discovery and work-orchestration harness built on the ZCode foundation.**

Its first product outcome is to help people discover and pursue legitimate ways to earn extra income: local shifts, paid research, surveys, review and evaluation programmes, translation, transcription, AI/data tasks, testing, fieldwork and conventional freelance gigs. It will also grow to help gig posters find, compare and coordinate suitable individuals and teams.

> **Repository status (2026-11-12):** the pinned upstream ZCode baseline has been imported (see *Upstream foundation* below). The product charter, Stage 1 handoff and an Earn reference implementation (porting material, not the product shell) exist on `stage1/reference-implementation`. Hop3 product features are built additively on the ZCode application per [HOP3_RULES.md](HOP3_RULES.md) §3.

## Repository authority

This repository is the sole authoritative record for Hop3 product scope, requirements, architecture, domain contracts, decisions, implementation, tests, release status and operational runbooks. Conversations, agent notes, external documents and issue comments may provide context, but they do not override the current accepted repository state.

Start here:

- [Product definition](docs/PRODUCT.md)
- [Architecture and boundaries](docs/ARCHITECTURE.md)
- [Opportunity domain contract](docs/DOMAIN-MODEL.md)
- [Connector registry and external-platform rules](docs/CONNECTORS.md)
- [Roadmap](docs/ROADMAP.md)
- [Stage 1 TL handoff](docs/handoffs/STAGE-1.md)
- [Repository working rules](HOP3_RULES.md)
- [Architecture decisions](docs/adr/)

## Install the Hop3 desktop app

Hop3 ships as versioned desktop installers (Linux, Windows, macOS) built from this
repository's ZCode base. No development environment is needed:
[download a release installer](https://github.com/payswapdotorg/Hop3/releases), verify its
SHA256 checksum, and follow [INSTALL.md](INSTALL.md). The release pipeline and acceptance
gates are specified in [docs/desktop-release/RELEASE.md](docs/desktop-release/RELEASE.md).

## Product promise

- **Earn:** tell Hop3 what you can do, where you can work, when you are available and what extra income you are targeting. Hop3 searches permitted sources, checks fit and payout constraints, and helps you take the next legitimate step.
- **Hire:** describe work that needs doing. Hop3 helps scope it and find appropriate workers or teams, subject to each platform's rules and decision boundaries.
- **Coordinate:** when a task is too large for one person, Hop3 can plan a permitted team or multi-hop route. This is a later capability; Stage 1 does not broker subcontracting or move money.

## Non-negotiables

1. Keep the ZCode application, Agent runtime, composer, model/provider selection, sessions, tools, permissions, terminal, browser, files and existing workflows. Hop3 is an additive specialization, not a replacement shell or a stripped-down harness.
2. Reuse ZCode's existing MCP/plugin, OAuth, Agent, approval and application mechanisms where source inspection proves they fit. Do not create a parallel execution authority.
3. Treat each external source's terms, official API/MCP contract, geographic eligibility, rate limits and permissions as executable constraints. No unauthorized scraping or hidden browser automation.
4. Never present an unverified listing, application, acceptance or payment as fact. Separate estimated income from verified earnings.
5. Require the user to approve consequential actions, platform submissions, financial commitments and sharing of personal data.
6. Keep the opportunity domain and its contracts in this repository. Do not allow chat history or plugin-specific private stores to become the only record of opportunity state.

## Stage 1

Stage 1 is an earn-side vertical slice: import and verify the upstream ZCode baseline; add a private worker profile; connect a small, policy-compliant set of real opportunity sources; normalize, deduplicate and validate opportunities; show evidence, location eligibility, payout constraints, estimated net economics and next steps; and track application outcomes. See the [Stage 1 handoff](docs/handoffs/STAGE-1.md) for tasks and acceptance criteria.

Stage 1 is not a promise of earnings, a global gig marketplace, an escrow product, autonomous job applications, a social network or a complete two-sided team marketplace.

## Upstream foundation

- Upstream repository (remote `upstream`): [zai-org/ZCode](https://github.com/zai-org/ZCode)
- Imported pinned baseline: [ZCode v3.18.0 source-sync commit](https://github.com/zai-org/ZCode/commit/b95ebaffeab641907b38652f45c1502bd762972d) `b95ebaffeab641907b38652f45c1502bd762972d`, imported into this repository as a reviewed merge of unrelated histories that preserves the upstream commit graph, [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), [AGENTS.md](AGENTS.md) and all contributor guidance, together with this repository's product specs and [HOP3_RULES.md](HOP3_RULES.md).
- Upstream usage/development docs: [README (English)](README.en.md) · [Upstream README (简体中文)](https://github.com/zai-org/ZCode/blob/main/README.md) · [mise.toml](mise.toml) (tool versions: Node 24.14.0, pnpm 10.33.2) · [apps/zcode-cli usage guide](apps/zcode-cli/docs/usage/README.md) · developer docs app (`pnpm dev:docs`, `apps/dev-docs`).
- Upstream engineering gates (run from the repository root): `pnpm bootstrap` (install + bootstrap), `pnpm typecheck`, `pnpm lint` (oxlint + session-control boundary), `pnpm fmt:check` (oxfmt), `pnpm test:architecture`, `pnpm db:schema:check`, desktop/web E2E via `pnpm test:e2e` (see [README (English)](README.en.md) for the full matrix).

Do not treat an unpinned moving branch as a reproducible baseline. Record every subsequent upstream adoption in an ADR and update the baseline manifest.

## How to work

Read [HOP3_RULES.md](HOP3_RULES.md) and [docs/README.md](docs/README.md) before implementation. Requirements and contracts are changed before dependent code. Every implementation PR names the relevant spec/ADR and includes evidence from the actual source, tests and runtime. The repository's current code and accepted decisions take precedence over stale plans.
