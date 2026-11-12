# ADR-0002: Earn-first MVP and policy-aware connectors

- **Status:** Accepted
- **Date:** 2026-11-12
- **Decision owners:** Product owner and TL
- **Supersedes:** None

## Context

The product should help users find small, additional income they may otherwise miss: reviewer/evaluator programmes, surveys and paid research, local shifts, translation and language work, data annotation, AI evaluation, testing and ordinary freelance gigs. It should later help buyers find quality workers and enable permitted multi-hop teams.

External platforms expose different operations and restrictions. A generic scraper or a uniform "rank every gig" approach would be unsafe and, for some providers, prohibited.

## Decision

1. Stage 1 prioritizes the earner's first few real opportunities and verified payment outcomes.
2. Stage 1 uses a narrow set of policy-compliant sources: OneForma public project discovery, Upwork official MCP for read-only earner job discovery, Fiverr official MCP for buyer-side talent discovery only, and user-submitted URL intake.
3. Connector capabilities are source-specific and explicit. Read/search, rank/score, draft, submit, message, hire, contract and financial actions are separate permissions.
4. Upwork's current MCP terms prohibit AI agents from independently ranking/scoring/selecting the best jobs or freelancers. Hop3 will not perform those actions on Upwork results. Users decide.
5. Fiverr's current official MCP is a buyer-side talent discovery/project scoping integration; it is not a seller-side job feed. Ordering/payment remain on Fiverr.
6. Opportunity eligibility and payout compatibility are assessed from specific evidence. Unknown remains unknown.
7. All platform submissions, messages, offers, hires and financial commitments require the relevant user confirmation.
8. No unauthorized scraping, access-control bypass, fake work, fabricated application facts or automatic subcontracting.
9. Buyer-side multi-hop teams, user-to-user marketplace, escrow and payment custody are later stages, not Stage 1.

## Consequences

- The first release may show fewer results than a scraper-based aggregator, but each result must be traceable and policy-compliant.
- A provider's MCP/API restrictions can narrow or eliminate Hop3 matching functions even when the general product supports them elsewhere.
- The source registry must encode actor mode, operations, policy, rate limits, country support, payout and freshness.
- Every recommendation explains the decision boundary and evidence, not just a model-generated score.

## Verification references (checked 2026-11-12)

- Upwork official MCP: https://www.upwork.com/ai/mcp
- Upwork MCP rate limits: https://support.upwork.com/hc/en-us/articles/56577997707923-Rate-limits-for-Upwork-MCP
- Fiverr official MCP: https://help.fiverr.com/hc/en-us/articles/52715474121361-Using-Fiverr-MCP-in-your-AI-agent
- Fiverr terms: https://www.fiverr.com/legal-portal/legal-terms/terms-of-service
- OneForma projects: https://www.oneforma.com/projects/
- OneForma payment guide: https://www.oneforma.com/brand/prototyping/website/helpcenter-article.html
