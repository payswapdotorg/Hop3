# Stage 1 delivery evidence — Earn reference implementation (sandbox)

- **Branch:** `stage1/reference-implementation` (additive only; `main` untouched)
- **Date:** 2026-11-12
- **Produced by:** TL session in a Z.ai Code sandbox (single Next.js 16 app exposed on port 3000)
- **Normative references:** `docs/handoffs/STAGE-1.md`, `HOP3_RULES.md`, `docs/DOMAIN-MODEL.md`, `docs/CONNECTORS.md`

## 1. Scope boundary — read first

**The pinned ZCode upstream import (STAGE-1.md section 3) has NOT been performed, and this branch does not modify the ZCode application.** The sandbox that produced this work can only host a single Next.js application, so "Earn inside the existing ZCode UI" (deliverable D5) and the ZCode regression baseline (D1) could not be attempted there.

What this branch delivers instead — explicitly as **porting material and delivery evidence**, not as the shipped product:

1. `reference-implementation/` — a standalone Next.js 16 + Prisma (SQLite) app implementing the Stage 1 Earn surface against the frozen contracts (profile, four source paths, opportunity domain, application/outcome tracking).
2. `docs/handoffs/evidence/` — browser screenshots of the verified flows.
3. This document — honest verification results (passed / blocked / not run per HOP3_RULES section 8).

Per HOP3_RULES section 3 ("do not replace the existing ZCode app with a new Next.js shell"), none of this code should be merged as the product shell; the contracts, adapters and flows are intended to be ported into the imported upstream tree after section 3 of the handoff is executed.

## 2. Earner-journey acceptance checks (STAGE-1.md section 7)

Verified by direct API calls (curl) and by browser automation over the running app (agent-browser; zero console errors, zero page errors on every step below). Environment: `bun run dev` (Next.js 16.1.3, Turbopack, port 3000), Prisma 6 + SQLite, `bun run lint` clean (ESLint, zero findings).

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Configure, save and edit a profile without connecting any provider | PASS | `PUT /api/profile` accepted a full GH worker profile before any source sync; Profile tab edits and re-saves; profile is user-owned and local. |
| 2 | Country, language, skill, time, payout, work-mode requirements represented | PASS | Profile schema + UI cover country, languages+proficiency, skills+bands, qualifications+verification state, weekly hours, timezone, work mode, equipment, income goal+currency, payout rails, include/exclude families. |
| 3 | At least one source returns live public data; fixtures clearly labelled | PASS | OneForma **live** run fetched **12 real project cards** (HTTP 200, ~173 KB HTML) after a runtime robots.txt check (allowed). Sandbox fixtures carry provenance `sandbox-fixture` + amber "Sandbox fixture — test data" badge + summary label; never presented as live. |
| 4 | Unsupported country not marked eligible | PASS | Live OneForma listings whose country list excludes GH are assessed `ineligible` (e.g. "Multilingual Podcast Transcription…": whitelist AU/AT/CA/HK/CH vs user GH). |
| 5 | Unknown payout compatibility shown as unknown, never guaranteed | PASS | Every live listing shows "Payout/fees unknown — not a guaranteed payable amount" + the global-method-list-is-not-proof disclaimer. `eligibility=eligible` filter correctly returns 0 while payout is unknown (unknown is never eligible). |
| 6 | Every opportunity shows source name/link, observed time, freshness, evidence | PASS | Detail overlay renders Source evidence panel (source name, canonical URL, source record ID, observed at, first/last seen, source status) + raw payload retained per row. Freshness badges: active/stale/expired computed from the source's own freshness window + expiry. |
| 7 | Duplicates grouped, not duplicated cards; separate offers traceable | PASS | Same-provider dedupe via `(sourceKey, externalId)` unique key (re-sync counts duplicates honestly, e.g. 12 fetched / 0 inserted on re-run). Cross-source grouping is display-only ("+N similar listings grouped (not merged)"). |
| 8 | Fees, unpaid qualification time, Connects, thresholds affect net; unknowns disclosed | PASS | Economics engine: listing-stated percent/amount fees parsed (basis `known`); Upwork 10% service fee carried as `assumed` with re-verify note; unpaid qualification time and Connects appear as cost lines with "not quantified by source"; unknown costs listed separately; confidence high/medium/low; `guaranteed: false` always. |
| 9 | Save an item, prepare materials, open the official application page | PASS | Save toggle + private notes persist; draft generated from truthful profile facts (real name/country/languages/skills quoted, bracketed placeholders for anything unstated); external link opens the provider page. |
| 10 | No application sent without explicit confirmation | PASS | No write operations exist toward any provider; drafts are local; footer + toasts restate "Hop3 never submits applications automatically." |
| 11 | Not marked accepted/paid on clicks or generated text alone | PASS | Domain guard verified by direct negative tests: `applied` without URL/note → HTTP 400; `paid` without amount → 400; skip `draft→accepted` → 400 with exact reason. Full happy path required 12 sequential evidence-carrying events. |
| 12 | Empty/blocked/stale/rate-limited source reported accurately; nothing fabricated | PASS | Upwork live = `blocked` with the exact OAuth handoff message (initialize 401 without token); second OneForma live run inside 60 min = `blocked` by the rate-limit guard with wait time; honest empty outcomes return "0 listings, nothing fabricated". |

## 3. Provider-specific checks (STAGE-1.md section 7)

- **OneForma:** live public board fetch; robots.txt fetched and evaluated on every live run; per-card country/language parsed only where the card exposes them; the payment guide (PayPal/Payoneer/bank, USD 25 threshold, twice-monthly) is recorded as **notes only** and is never treated as country-specific proof.
- **Upwork:** official `https://mcp.upwork.com/mcp` probed live — `initialize` returns HTTP 401 without a token, so live runs return `status: blocked` with the documented OAuth 2.1 handoff (connect through an OAuth-capable local MCP client). No scraping fallback, no credentials stored, `rankingPolicy: provider-order-only` enforced end-to-end (inbox shows "Provider order preserved — Hop3 does not rank these results").
- **Fiverr:** official `https://mcp.fiverr.com/mcp` live — anonymous `initialize` (200), `tools/list` (7 tools; the write tool is never called), `find_freelancers` returned 5 sellers in provider order; UI labels results buyer-side talent research, "not a seller job feed"; no checkout/credentials handled.
- **URL intake:** `https://www.oneforma.com/projects/` submitted → single polite public fetch (HTTP 200, 173,010 bytes), page title/description extracted, provenance `user-submitted` + "unverified until checked" label; `http://192.168.1.1/…` refused with HTTP 400 ("private address… will not be fetched") — SSRF guards (loopback/private/link-local/reserved ranges, non-http schemes, redirect-following disabled) verified.

## 4. Application lifecycle evidence

One tracker walked end-to-end through the frozen order with an audit event per step
(`GET /api/applications`):

`note (tracker created) → note (draft generated, rule template hop3-stage1-rules-v1) → draft_edited → prepared → applied (note + channel) → qualification_pending → accepted (user-reported) → in_progress → submitted → approved → payment_pending → paid (payment-confirmed, amount 52.50 USD, evidence note)`

Negative tests (all HTTP 400 with the exact domain-guard reason):
- `applied` with no evidence URL/note.
- `paid` with no amount.
- `draft → accepted` skip attempt.
- Terminal-status reuse and backward moves are refused by the same guard.

Payments summary in the UI reads "amounts you recorded with evidence" — Hop3 never fabricates income.

## 5. Not run / not possible in this environment (per HOP3_RULES section 8)

- **Upstream ZCode import (D1, STAGE-1 section 3):** NOT RUN. The pinned commit `b95ebaffeab641907b38652f45c1502bd762972d` (v3.18.0) is still unimported; upstream smoke tests, `docs/architecture/UPSTREAM-MAP.md` and the regression baseline are outstanding.
- **ZCode shell integration (D5):** NOT RUN — Earn here runs in a standalone Next.js shell, not inside ZCode navigation/composer/sessions.
- **Desktop/web/CLI regression of ZCode:** NOT RUN (no ZCode tree present).
- **Upwork authenticated job search:** BLOCKED (OAuth 2.1 requires a user-connected local MCP client; honestly reported, not bypassed).
- **Production build:** not applicable in the sandbox (dev-server-only environment by policy).

## 6. Engineering verification actually performed

- `bun run lint` — pass (zero findings) after the full implementation.
- `bunx prisma db push` — schema applied cleanly; Prisma Client generated.
- Dev server: Next.js 16.1.3 (Turbopack) on port 3000; `GET /` 200; all 15 API endpoints smoke-tested (200s, plus intentional 400 guard responses).
- Browser automation (agent-browser/Playwright): shell render, tab navigation, detail dialog, save toggle, saved-notes editing, draft generation from profile, sync buttons, mobile viewport (390×844) layout, sticky-footer verification on short content (footer at viewport bottom, zero gap) and long content (pushed down, no overlap). Zero console errors and zero page errors across the session.
- Screenshots: `docs/handoffs/evidence/hop3-inbox.png`, `hop3-applications.png`, `hop3-sources-mobile.png`.
- No credentials or personal data in committed files: the dev SQLite database and `.env` are excluded from the branch; token scan performed.

## 7. Next smallest implementation slice

1. Execute STAGE-1.md section 3 (import pinned ZCode commit, preserve history/licences, record SHAs) on a machine that can run the upstream toolchain.
2. Port the frozen contracts (`src/lib/contracts.ts`), domain engines (`src/lib/domain/`), and source adapters (`src/lib/sources/`) into the imported tree following `docs/architecture/UPSTREAM-MAP.md`, reusing ZCode's storage/permissions/MCP-OAuth surfaces instead of this sandbox's Prisma/SQLite.
3. Wire the Earn views into existing ZCode navigation (additive only) and re-run the section 7 acceptance checks inside desktop, web and CLI.
4. Connect Upwork through the OAuth-capable local MCP client and re-run the read-only job-search smoke with a real authorized session.
