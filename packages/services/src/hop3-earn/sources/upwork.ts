/**
 * Hop3 — Stage 1 source connector: Upwork official MCP (earner side).
 *
 * Server-side module (Node runtime). No 'use client', no database access,
 * no credentials stored.
 *
 * Verified facts (CONNECTORS.md 2.1, probed 2026-11-12):
 *   - Official endpoint https://mcp.upwork.com/mcp answers initialize with
 *     HTTP 401 without a token: OAuth 2.1 with dynamic client registration
 *     is required. Hop3 does not store credentials and does not bypass auth.
 *   - Upwork's AI restriction: an AI agent must not independently rank, score
 *     or select the best jobs for a freelancer. Hop3 therefore applies
 *     rankingPolicy 'provider-order-only' — provider order is preserved and
 *     no Hop3 scoring/"best match" labels are added.
 *   - Read-only searches share account rate limits with other connected
 *     agents; back off on 429.
 *   - Freelancer Connects apply as a user cost when submitting proposals.
 *
 * Stage 1 live behaviour: honest 'blocked' result telling the user to connect
 * through an OAuth-capable local MCP client (e.g. the ZCode desktop app).
 * Stage 1 sandbox behaviour: read-only job-search imitations in provider
 * order, provenance 'sandbox-fixture'.
 */

import type { RawListing, SourceAdapter, SourcePolicy, SourceQuery, SourceRunResult } from "@zcode/shared";
import { upworkFixtures } from "./sandbox-fixtures.js";

const UPWORK_MCP_ENDPOINT = "https://mcp.upwork.com/mcp";

export const UPWORK_BLOCKED_MESSAGE =
  "Upwork MCP requires OAuth 2.1 (initialize returns 401 without a token). Connect through an OAuth-capable local MCP client (e.g. the ZCode desktop app) and retry; Hop3 does not store credentials or bypass auth.";

const upworkPolicy: SourcePolicy = {
  sourceId: "upwork_mcp",
  displayName: "Upwork (official MCP)",
  adapterVersion: "1.0.0",
  sourceKind: "official-mcp",
  accessMode: "official-mcp",
  actorModes: ["earner"],
  operations: {
    search: {
      allowed: true,
      note: "Read-only freelancer-side job search through the official MCP; provider order preserved; no Hop3 ranking, scoring or job selection (Upwork AI restriction)",
    },
    read: {
      allowed: true,
      note: "Read-only job detail retrieval when the connected MCP client exposes such tools",
    },
    draft: {
      allowed: false,
      note: "Drafts/proposals require human confirmation on Upwork; this Stage 1 adapter performs no write operations",
    },
    submit: { allowed: false, note: "Hop3 never submits proposals automatically; the user submits on Upwork" },
    message: { allowed: false, note: "Messaging happens on Upwork" },
    hire: { allowed: false, note: "Contracting happens on Upwork" },
    pay: { allowed: false, note: "All financial actions complete on Upwork" },
  },
  auth: "oauth",
  authNote:
    "OAuth 2.1 with dynamic client registration, driven by an OAuth-capable local MCP client (e.g. the ZCode desktop app). " +
    "Hop3 stores no credentials and performs no token handling. Hosted/web callback allowlisting is currently unavailable per Upwork docs.",
  coverage: { countries: "unknown", languages: "unknown", currencies: "unknown" },
  payout: {
    methodKnown: false,
    threshold: "Not verified in Stage 1",
    fees: "Not verified in Stage 1 (normal Upwork freelancer service fees apply per Upwork MCP docs)",
  },
  termsUrl: "https://www.upwork.com/ai/mcp",
  termsNotes:
    "Upwork AI restriction: an AI agent must not independently rank, score or select the best jobs for a freelancer or the best " +
    "freelancers for a client; it may filter, sort and summarize using user-provided criteria; the human makes the decision. " +
    "Rate limits: https://support.upwork.com/hc/en-us/articles/56577997707923-Rate-limits-for-Upwork-MCP (all connected agents " +
    "share the account limits; read-only searches may be scheduled). Free to connect; normal Upwork fees still apply. Application " +
    "costs: freelancer Connects apply when submitting proposals and are recorded as a user cost. Stage 1 uses official remote MCP " +
    "only — no browser scraping and no unofficial API-key workarounds.",
  rateLimit: {
    note: "All connected agents share the account-level rate limits; batch narrowly, cache within permitted terms, avoid frequent polling",
    backoff: "Back off on HTTP 429 rate-limit responses; no retry within the same run",
  },
  freshness: { maxAgeHours: 4, minRefreshIntervalMinutes: 60 },
  approvalsRequired: [
    "Human confirmation on Upwork for any draft or binding action (provider requirement)",
    "User submits proposals themselves; Hop3 only prepares review materials and records outcomes",
  ],
  rankingPolicy: "provider-order-only",
  verifiedAt: "2026-11-12",
  verificationNote:
    `Live probe 2026-11-12: POST ${UPWORK_MCP_ENDPOINT} (initialize) returned HTTP 401 without a token, confirming the OAuth 2.1 ` +
    "requirement documented at https://www.upwork.com/ai/mcp. Freshness values are Stage 1 internal defaults pending provider-specific guidance.",
};

export const upworkAdapter: SourceAdapter = {
  key: "upwork_mcp",
  policy: upworkPolicy,
  async run(params: { mode: "live" | "sandbox"; query?: SourceQuery }): Promise<SourceRunResult> {
    if (params.mode === "live") {
      // Honest blocked state: OAuth is required, credentials are never stored
      // or bypassed, and no live listings are fabricated.
      return {
        status: "blocked",
        mode: "live",
        message: UPWORK_BLOCKED_MESSAGE,
        listings: [],
      };
    }
    const listings: RawListing[] = upworkFixtures();
    return {
      status: "ok",
      mode: "sandbox",
      message:
        'Sandbox fixtures loaded — read-only job-search imitations in provider order (no Hop3 ranking, scoring or "best match" labels); clearly labelled, never live.',
      listings,
    };
  },
};
