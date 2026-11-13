# Hop3 Stage 1 — Earn reference implementation (sandbox)

This directory contains a **standalone reference implementation** of the Stage 1
Earn surface, produced inside a sandbox that can only host a single Next.js
application. It is **not** the ZCode-hosted product: the pinned upstream import
(STAGE-1.md section 3) has not been performed, and nothing here modifies the
ZCode application. Per HOP3_RULES section 3, the shipped product remains an
additive Earn journey inside ZCode; this code exists so the frozen domain
contracts, connector adapters and verified behaviours can be ported into the
imported upstream tree instead of being reinvented.

See `docs/handoffs/STAGE-1-EVIDENCE.md` (repository root) for the delivery
evidence, verified behaviours and live connector smoke results.

## What is implemented

- **Frozen shared contracts** (`src/lib/contracts.ts`) — DOMAIN-MODEL /
  CONNECTORS rules encoded in types: missing stays missing, unknown is never
  eligible, gross/net are never collapsed, provider order is preserved for
  restricted sources, no automatic submission.
- **Domain engines** (`src/lib/domain/`) — eligibility assessment
  (country/language/skills/payout dimensions with reasons and source-backed
  flags), economics estimates (fees, costs, unknowns, confidence, never
  guarantees), evidence-gated application lifecycle, conservative
  deduplication and URL normalization.
- **Source connectors** (`src/lib/sources/`) — policy-first adapters:
  OneForma public board (robots.txt checked at runtime on every live run),
  Upwork official MCP (honest blocked state — OAuth 2.1 required, never
  bypassed), Fiverr official MCP (anonymous initialize + read-only
  `find_freelancers`, buyer-side only, provider order preserved), and
  user-submitted URL intake (polite public fetch with SSRF guards). Sandbox
  fixtures are clearly labelled `sandbox-fixture` and never presented as live.
- **Persistence** (`prisma/schema.prisma`, SQLite via Prisma) — WorkerProfile,
  SourceConnection registry + SourceRun audit rows, Opportunity (+saved items),
  Application + ApplicationEvent audit trail. Structured payloads stored as
  JSON-encoded strings per the frozen schema.
- **API surface** (`src/app/api/`) — profile, source registry/sync, URL
  intake, opportunity list/detail/save/notes, application create/prepare/
  draft/prepared/events. All transitions validated by the domain guard.
- **Earn UI** (`src/app/page.tsx`, `src/components/earn/`) — single-page shell
  with Inbox / Saved / Applications / Profile / Sources tabs, evidence-first
  detail overlays, sticky footer carrying the no-auto-submit,
  estimates-never-guarantees and unknown-payout notices.

## Run locally

Requirements: Node.js 20+, Bun (or npm/pnpm equivalents).

```bash
bun install
cp .env.example .env          # DATABASE_URL=file:/<abs path>/db/custom.db
bun run db:push               # create the SQLite schema
bun run dev                   # http://localhost:3000
```

Then: create a worker profile (Profile tab), run a source sync (Sources tab —
OneForma live is public and robots-permitted; Upwork live reports its honest
blocked state; Fiverr live is anonymous), and walk an opportunity through
`Prepare application → review draft → record events` in the Applications tab.

## Boundaries kept (Stage 1 non-negotiables)

- No scraping, CAPTCHA bypass or anti-bot evasion; robots.txt respected at
  runtime for the OneForma live fetch.
- No credentials stored; Upwork OAuth is expected through an OAuth-capable
  local MCP client, and the connector reports blocked rather than faking.
- No automatic submission of any application, proposal or message.
- No fabricated acceptance, completion or payment: `paid` requires a positive
  amount and user-supplied evidence, and every transition appends an audit
  event.
- Fiverr results are labelled buyer-side talent research, never a seller job
  feed; Upwork results keep provider order with no Hop3 ranking.
