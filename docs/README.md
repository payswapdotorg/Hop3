# Documentation map and change control

This directory contains the normative Hop3 product and engineering documentation.

## Current documents

| Document | Authority / purpose |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Product purpose, personas, scope, principles and success measures |
| [ARCHITECTURE.md](ARCHITECTURE.md) | ZCode reuse strategy, product layers, boundaries and execution authority |
| [DOMAIN-MODEL.md](DOMAIN-MODEL.md) | Opportunity, worker profile, evidence, eligibility, economics and lifecycle contracts |
| [CONNECTORS.md](CONNECTORS.md) | External-source register, provider capabilities and compliance constraints |
| [ROADMAP.md](ROADMAP.md) | Staged product delivery and explicit non-goals |
| [handoffs/STAGE-1.md](handoffs/STAGE-1.md) | Implementation-ready TL work package for the first product stage |
| [adr/](adr/) | Accepted, proposed and superseded architectural decisions |

## Change process

1. A behavior change starts with the product/domain spec that owns it.
2. A structural decision that changes ownership, persistence, trust, platform access or runtime boundaries requires an ADR.
3. Implementation and tests must implement the current contract; do not use code comments or agent prompts to create a second specification.
4. A PR that changes a contract updates its spec, tests, migration and relevant connector policy together.
5. After implementation, update status and evidence in the stage handoff/roadmap. Do not leave stale plans labeled as current.

## Status labels

- **Accepted:** approved direction; implementation may proceed.
- **Proposed:** under review; do not implement without TL/product approval.
- **Implemented:** code exists and required verification evidence is recorded.
- **Verified:** implementation has passed its stated acceptance checks in the stated environment.
- **Blocked:** a named dependency or external permission prevents completion.
- **Superseded:** replaced by a newer decision; retain the history and link the replacement.

A green CI badge is not equivalent to product acceptance. A spec is not evidence that code exists.

## External references

External provider documentation is informative evidence, not a substitute for the local connector contract. Record URLs and the date they were last checked in CONNECTORS.md. Provider terms and capabilities can change; reverify them before a production release.
