# ADR-0001: Hop3 repository authority and ZCode foundation

- **Status:** Accepted
- **Date:** 2026-11-12
- **Decision owners:** Product owner and TL
- **Supersedes:** None

## Context

Hop3 is a new product direction based on ZCode. The GitHub repository payswapdotorg/Hop3 was confirmed empty before this bootstrap. The team needs one durable source for product intent, architecture, contracts, engineering state and implementation handoffs. Upstream ZCode evolves independently and must remain traceable.

## Decision

1. payswapdotorg/Hop3 is the sole normative source of truth for Hop3.
2. The full Hop3 product code, specifications, contracts, tests, extensions authored by the project, architecture decisions and delivery evidence belong in this repository.
3. Chat conversations, agent memory, personal notes and unaccepted issue comments are non-authoritative.
4. ZCode is the upstream application/runtime foundation. The current baseline is pinned to commit b95ebaffeab641907b38652f45c1502bd762972d (ZCode v3.18.0, source sync dated 2026-11-11).
5. Stage 1 must import the pinned upstream commit, retain it as a Git remote and preserve its history/license/notices. The imported current source is the implementation truth for ZCode capabilities.
6. Hop3 changes are additive. Keep the existing UI, Agent runtime, tools, provider/model controls, composer, sessions and all other current user capabilities.
7. Upstream adoption is explicit: inspect source changes, record the adopted commit and conflicts, update this ADR or add a new ADR, and rerun compatibility checks.

## Consequences

- Specs are changed before dependent behavior.
- Every PR references a local requirement/ADR.
- No second specification is maintained in chat or another repository.
- The upstream remote is retained, but upstream product direction does not override Hop3 product decisions.
- The project may update the pinned upstream baseline only through a reviewed source-sync change.

## Verification

- Repository checked via GitHub on 2026-11-12; confirmed empty before first README commit.
- Upstream main commit checked via GitHub on 2026-11-12: b95ebaffeab641907b38652f45c1502bd762972d.
- Import and post-import source audit are pending Stage 1.
