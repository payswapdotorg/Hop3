# Hop3 repository working rules

These rules apply to maintainers, human contributors, coding agents, TLs and delegated workers.

## 1. One source of truth

This repository is the only normative source for Hop3.

Authority order:

1. **Current source code, schemas, migrations and tests** establish implemented behavior.
2. **Accepted ADRs** establish approved architectural/product decisions not yet fully reflected in code.
3. **Current product, architecture and domain specifications** establish requirements and contracts awaiting implementation.
4. **Stage handoffs and roadmap** organize work and acceptance; they do not override a newer accepted contract.
5. **GitHub Issues/PRs** track ownership, review and delivery state. A discussion comment is not a new product requirement unless the requirement is incorporated into a spec or accepted ADR.

Chat transcripts, personal notes, agent memory, generated summaries, external documents and local working trees are not authoritative. When a decision changes, update the relevant spec/ADR in the same PR as the implementation or before implementation begins.

## 2. Evidence before claims

- Inspect the checked-out source, package manifests, tests, architecture rules and runtime behavior. Do not rely on summaries, badges, screenshots or old agent reports as proof.
- Clearly label verified facts, assumptions and open questions.
- Do not claim a connector works until a real connection and permitted operation have been exercised. Fixtures are test data, not live evidence.
- Do not claim an opportunity is active, eligible, payable, accepted or paid without evidence for that specific state.
- Record the source URL, observation time, source identity and relevant terms/eligibility evidence for each external opportunity.
- Recheck changing provider documentation before altering connector behavior.

## 3. ZCode preservation

Hop3 is an additive product built on ZCode.

- Do not replace the existing ZCode app with a new Next.js shell or another application shell.
- Do not delete or hide existing composer controls, model/provider selection, reasoning controls, sessions, project/workspace selection, attachments, terminal, browser, files, permissions, tools, plugin marketplace, automation, memory, model configuration or existing navigation journeys.
- Do not fork or duplicate the Agent runtime, MCP client, OAuth implementation, scheduler, approval broker or tool-execution authority without an ADR demonstrating a necessary gap.
- New product surfaces must fit into the existing application architecture and preserve desktop, web and CLI behavior.
- Before modifying any upstream capability, identify its owner, callers, compatibility contract, tests and existing product behavior.

## 4. Specification-first changes

Before changing product behavior:

1. Update the relevant specification or add one.
2. Define the owning service/state, typed inputs and outputs, lifecycle, authorization and failure semantics.
3. Define acceptance scenarios, including negative and failure cases.
4. Identify impacted upstream capabilities and platform targets.
5. Implement only after the contract is reviewed.

Avoid shadow state, duplicate persistence and parallel write paths. Every durable domain concept must have one owner and an explicit lifecycle.

## 5. External source and connector policy

Every connector must declare and enforce:

- Official endpoint/API/MCP or explicitly authorized access mode.
- Platform account and OAuth/credential requirements.
- Read, write, submission, hiring and financial capabilities separately.
- Geographic and user eligibility rules.
- Rate limits, retry/backoff rules and source freshness.
- Terms/robots/retention constraints and evidence URL.
- Actions that require explicit user approval.
- Data fields sent to the provider and data retained by Hop3.

Official MCP/API integrations take precedence over scraping. Browser access is a fallback only where permitted by the provider and user authorization. Never automate CAPTCHA, evade access controls, impersonate a person, bypass regional restrictions or reuse credentials outside their intended scope.

Use the least privilege required. Do not log access tokens, passwords, private application content or unnecessary personal data. Community extensions must not be trusted with broad native host privileges by default.

## 6. Opportunity integrity and user safety

- Distinguish gross reward, fees, expenses, payout thresholds, time, expected net amount and realized payment.
- Unknown eligibility or payout compatibility is unknown, not eligible.
- Never fabricate work, listings, employer identity, rates, deadlines, reviews, acceptance or earnings.
- Disclose application fees, platform credits/Connects, travel costs, unpaid tests, deposits and minimum payout thresholds where known.
- Flag suspicious upfront fees, fake recruitment fees, requests to rent accounts, suspicious money transfers, unrealistic guaranteed earnings and unverified employers.
- Do not generate fake survey responses, fake reviews, fabricated work samples or misleading applications.
- No application, proposal, offer, booking, contract, milestone, payment or subcontract commitment is submitted without the required user confirmation.
- A worker may not delegate or subcontract a gig unless the original platform/client contract permits it and the poster and affected workers have explicitly agreed.

## 7. Data protection

Worker profiles, location, identity, language, work history, availability, payout details and application data are sensitive. Collect only what a feature needs; explain why; keep user-owned data private by default; provide deletion/export paths; and do not share private profiles across users or marketplaces without consent.

Source opportunity data must retain provenance and be refreshed or expired according to source policy. Do not create an unrestricted mirror of third-party marketplaces.

## 8. Engineering and verification

- Use the pinned upstream toolchain and scripts after the upstream tree is imported; do not guess versions or invent test commands.
- Run the relevant package checks plus the repository's required lint, typecheck, format, build and architecture gates.
- Exercise desktop and web surfaces affected by the change. Test CLI/runtime separately where affected.
- Use deterministic fixtures for lifecycle tests and at least one real, policy-compliant connector smoke test when credentials/environment permit.
- Report every check as passed, failed, blocked or not run. Do not convert an existing failure into a pass by omission.
- Do not merge unrelated refactors or silently remove upstream functionality.
- Keep PRs reviewable; include changed paths, source/caller audit, design rationale, risks, exact commands and evidence.

## 9. Required PR content

Every PR must state:

- Product requirement/spec and ADR references.
- User journey and behavior before/after.
- Upstream surfaces/packages affected.
- Data owner, persistence and migration implications.
- Permissions, privacy, platform terms and approval boundaries.
- Tests and runtime verification actually performed.
- Known limitations, feature flags and rollback procedure.
- Whether the change alters upstream behavior or a user-visible control.

## 10. Delegated work

The TL owns shared contracts, branch coordination, merge order, integration and final evidence. Workers receive non-overlapping file/domain ownership. No worker independently changes shared schemas or decisions without TL approval. Do not parallelize writes to the same files. Reconcile all work against the repo before accepting it.
