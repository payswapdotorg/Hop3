/**
 * Hop3 — Stage 1 source connector: Fiverr official MCP (buyer side only).
 *
 * Server-side module (Node runtime, global fetch via the shared MCP client).
 * No 'use client', no database access, no credentials.
 *
 * Verified facts (CONNECTORS.md 2.2, probed 2026-11-12):
 *   - Official endpoint https://mcp.fiverr.com/mcp: initialize returns
 *     HTTP 200 application/json ANONYMOUSLY (server "Fiverr-MCP" 1.0.0,
 *     protocol 2025-03-26, stateless — no Mcp-Session-Id header is returned).
 *   - tools/list exposed: find_freelancers (readOnlyHint, requires "brief"),
 *     get_freelancer_overview, get_seller_profile, get_seller_reviews_summary,
 *     list_seller_gigs, list_seller_reviews, submit_feedback (a write tool —
 *     Hop3 never calls it).
 *   - find_freelancers("logo design for a small coffee brand") returned 5
 *     sellers in structuredContent.sellers with url, username, displayName,
 *     oneLinerTitle, rating.score, countryName, languageCodes, skills,
 *     completedOrdersCount, responseTimeHours. No price is returned by this
 *     tool, so compensation stays missing unless a tool explicitly returns one.
 *
 * BUYER-SIDE ONLY: this is talent discovery for buyers, NOT a seller-side
 * job feed. Ordering and payment stay on Fiverr; Hop3 records no checkout,
 * credentials or payment rails. rankingPolicy 'provider-order-only'.
 */

import type {
  CompensationSpec,
  RawListing,
  RequirementsSpec,
  SourceAdapter,
  SourcePolicy,
  SourceQuery,
  SourceRunResult,
} from '../contracts';
import {
  createSession,
  describeMcpError,
  listTools,
  callTool,
  type McpSession,
  type McpTool,
  type McpToolResult,
} from './mcp-client';
import { fiverrFixtures } from './sandbox-fixtures';

const FIVERR_MCP_ENDPOINT = 'https://mcp.fiverr.com/mcp';
const CLIENT_INFO = { name: 'hop3-source-connector', version: '1.0.0' };
const DEFAULT_QUERY = 'logo design';

const fiverrPolicy: SourcePolicy = {
  sourceId: 'fiverr_mcp',
  displayName: 'Fiverr (official MCP)',
  adapterVersion: '1.0.0',
  sourceKind: 'official-mcp',
  accessMode: 'official-mcp',
  actorModes: ['buyer'],
  operations: {
    search: {
      allowed: true,
      note: 'Buyer-side talent discovery (find freelancers) through the official MCP; anonymous search; provider order preserved',
    },
    read: {
      allowed: true,
      note: 'Read-only seller/gig/review detail tools when exposed; never treated as verified delivery evidence without source context',
    },
    draft: { allowed: false, note: 'No drafting against Fiverr in Stage 1' },
    submit: { allowed: false, note: 'Ordering and checkout stay on Fiverr with the user action' },
    message: { allowed: false, note: 'Messaging happens on Fiverr' },
    hire: { allowed: false, note: 'Hiring is performed on Fiverr' },
    pay: { allowed: false, note: 'Payment stays on Fiverr; Hop3 records no payment credentials' },
  },
  auth: 'anonymous',
  authNote:
    'Search works without signing in to Fiverr (verified by anonymous initialize + tools/call probes). Sign-in and order flows ' +
    'redirect the user to Fiverr and are never proxied or captured by Hop3.',
  coverage: { countries: 'unknown', languages: 'unknown', currencies: 'unknown' },
  payout: {
    methodKnown: false,
    threshold: 'Not applicable in Stage 1: buyer-side research only',
    fees: 'Not applicable in Stage 1: any order and its payment happen on Fiverr',
  },
  termsUrl: 'https://www.fiverr.com/legal-portal/legal-terms/terms-of-service',
  termsNotes:
    'Help page: https://help.fiverr.com/hc/en-us/articles/52715474121361-Using-Fiverr-MCP-in-your-AI-agent. BUYER-SIDE ONLY: ' +
    'talent discovery for buyers, not a seller-side job feed — results must never be presented as gigs for workers to apply for. ' +
    'The documented workflow redirects the user to Fiverr to sign up/sign in or place an order; hiring and payment are performed ' +
    'on Fiverr. Reviews are never treated as verified delivery evidence without source context.',
  rateLimit: {
    note: 'Official MCP endpoint (https://mcp.fiverr.com/mcp); anonymous search returns at most 5 sellers per call; single search call per run in Stage 1',
    backoff: 'Back off on HTTP 429/5xx responses; no retry within the same run',
  },
  freshness: { maxAgeHours: 24, minRefreshIntervalMinutes: 60 },
  approvalsRequired: [
    'User performs any order, checkout or payment action directly on Fiverr; Hop3 only presents research results',
  ],
  rankingPolicy: 'provider-order-only',
  verifiedAt: '2026-11-12',
  verificationNote:
    'Live probe 2026-11-12: initialize returned HTTP 200 application/json anonymously (stateless — no Mcp-Session-Id header); ' +
    'tools/list returned 7 tools (find_freelancers, get_freelancer_overview, get_seller_profile, get_seller_reviews_summary, ' +
    'list_seller_gigs, list_seller_reviews, submit_feedback — the last is a write tool Hop3 never calls); tools/call ' +
    'find_freelancers returned 5 sellers in structuredContent.sellers.',
};

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Canonical dedupe form: lowercase host, no www prefix, no fragment, tracking params dropped. */
function normalizeUrl(input: string): string {
  try {
    const url = new URL(input.trim());
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.hostname.startsWith('www.')) url.hostname = url.hostname.slice(4);
    const drop: string[] = [];
    url.searchParams.forEach((_value, key) => {
      if (/^(utm_[a-z_]+|fbclid|gclid|igshid|mc_cid|mc_eid|si)$/i.test(key)) drop.push(key);
    });
    for (const key of drop) url.searchParams.delete(key);
    let out = url.toString();
    if (url.pathname !== '/' && out.endsWith('/') && url.search === '') out = out.slice(0, -1);
    return out;
  } catch {
    return input.trim();
  }
}

/** Free-text search parameter the tool's own input schema asks for. */
function findQueryParam(tool: McpTool): string | null {
  const schema = tool.inputSchema;
  if (!isRecord(schema) || !isRecord(schema.properties)) return null;
  for (const [key, value] of Object.entries(schema.properties)) {
    if (!/^(brief|query|keywords|keyword|term|search|search_text|description)$/i.test(key)) continue;
    if (key.toLowerCase() === 'username' || key.toLowerCase() === 'client_id') continue;
    const type = isRecord(value) ? value.type : undefined;
    if (type === undefined || type === 'string') return key;
  }
  return null;
}

/**
 * Pick a permitted search-capable tool: name/summary matched against
 * /search|gig|find/i, read-only preferred, and it must accept a free-text
 * query parameter (so username-only lookups are not misused as search).
 */
function pickSearchTool(tools: McpTool[]): McpTool | null {
  const candidates = tools.filter((tool) => {
    const haystack = `${tool.name} ${tool.title ?? ''} ${tool.description ?? ''}`;
    return /search|gig|find/i.test(haystack);
  });
  const readOnlyFirst = [...candidates].sort((a, b) => {
    const score = (tool: McpTool): number =>
      isRecord(tool.annotations) && tool.annotations.readOnlyHint === true ? 1 : 0;
    return score(b) - score(a);
  });
  for (const tool of readOnlyFirst) {
    if (findQueryParam(tool) !== null) return tool;
  }
  return null;
}

/** Extract an array of result records from a tool result, without guessing. */
function extractResultRecords(result: McpToolResult): Record<string, unknown>[] | null {
  if (isRecord(result.structuredContent)) {
    for (const key of ['sellers', 'gigs', 'results', 'items']) {
      const value = result.structuredContent[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
  }
  for (const block of result.content ?? []) {
    if (block.type !== undefined && block.type !== 'text') continue;
    const text = (block.text ?? '').trim();
    if (text === '') continue;
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.filter(isRecord);
      if (isRecord(parsed)) {
        for (const key of ['sellers', 'gigs', 'results', 'items']) {
          const value = parsed[key];
          if (Array.isArray(value)) return value.filter(isRecord);
        }
      }
    } catch {
      // Text content that is not JSON carries no structured records for us.
    }
  }
  return null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Compensation ONLY when the tool result explicitly exposes a price. */
function mapCompensation(record: Record<string, unknown>): CompensationSpec | undefined {
  const priceRaw =
    record.price ?? record.startingPrice ?? record.basicPrice ?? record.priceFrom ?? record.priceTo ?? record.price_amount;
  const currencyRaw = record.currency ?? record.priceCurrency ?? record.price_currency;
  const price = asNumber(priceRaw);
  const currency = asString(currencyRaw)?.toUpperCase();
  if (price === undefined || currency === undefined) return undefined;
  const priceTo = asNumber(record.priceTo ?? record.priceMax);
  const fixed = asString(record.priceType)?.toLowerCase() === 'hourly' ? 'hourly' : 'fixed';
  return {
    currency,
    grossMin: price,
    grossMax: priceTo ?? price,
    payUnit: fixed,
    fixedOrEstimated: 'fixed',
    conditions: 'Price as explicitly returned by the Fiverr MCP tool; final pricing and payment stay on Fiverr.',
  };
}

function mapSellerToBuyerResearchListing(
  record: Record<string, unknown>,
  observedAt: string,
  toolName: string,
  brief: string,
): RawListing | null {
  const url = asString(record.url);
  if (url === undefined) return null; // without a URL there is no honest pointer to keep
  const username = asString(record.username);
  const displayName = asString(record.displayName);
  const oneLiner = asString(record.oneLinerTitle);
  const externalId = normalizeUrl(url);

  const summaryBits: string[] = [`Buyer-side talent research result from the official Fiverr MCP (tool: ${toolName}).`];
  if (displayName !== undefined) summaryBits.push(`Seller: ${displayName}${username !== undefined ? ` (${username})` : ''}.`);
  const countryName = asString(record.countryName);
  if (countryName !== undefined) summaryBits.push(`Seller location: ${countryName}.`);
  const rating = isRecord(record.rating) ? asNumber(record.rating.score) : undefined;
  if (rating !== undefined) summaryBits.push(`Rating: ${rating}.`);
  const completed = asNumber(record.completedOrdersCount);
  if (completed !== undefined) summaryBits.push(`Completed orders: ${completed}.`);
  const responseHours = asNumber(record.responseTimeHours);
  if (responseHours !== undefined) summaryBits.push(`Typical response time: about ${responseHours} h.`);
  if (Array.isArray(record.skills)) {
    const skills = record.skills.filter((skill): skill is string => typeof skill === 'string').slice(0, 10);
    if (skills.length > 0) summaryBits.push(`Skills: ${skills.join(', ')}.`);
  }
  summaryBits.push('Ordering and payment stay on Fiverr.');

  const listing: RawListing = {
    sourceKey: 'fiverr_mcp',
    sourceRecordId: username ?? externalId,
    externalId,
    canonicalUrl: url,
    title: oneLiner ?? displayName ?? (username !== undefined ? `Fiverr seller ${username}` : 'Fiverr talent research result'),
    summary: summaryBits.join(' '),
    platform: 'Fiverr',
    opportunityType: 'buyer-side-research',
    workMode: 'remote',
    eligibility: {
      mode: 'unknown',
      notes:
        'Seller location and languages describe the seller, not buyer eligibility; Fiverr availability for the buyer was not assessed.',
    },
    payout: { methodKnown: false },
    observedAt,
    provenance: 'live',
    raw: { tool: toolName, brief, seller: record },
  };

  const compensation = mapCompensation(record);
  if (compensation !== undefined) listing.compensation = compensation;

  const requirements: RequirementsSpec = {};
  if (Array.isArray(record.skills)) {
    const skills = record.skills.filter((skill): skill is string => typeof skill === 'string').slice(0, 12);
    if (skills.length > 0) requirements.skills = skills;
  }
  if (Array.isArray(record.languageCodes)) {
    const languages = record.languageCodes
      .filter((code): code is string => typeof code === 'string')
      .map((code) => code.toLowerCase())
      .filter((code) => /^[a-z]{2}$/.test(code));
    if (languages.length > 0) requirements.languages = [...new Set(languages)];
  }
  if (requirements.skills !== undefined || requirements.languages !== undefined) listing.requirements = requirements;

  return listing;
}

function mcpFailure(stage: string, err: unknown): SourceRunResult {
  return {
    status: 'error',
    mode: 'live',
    message: `Fiverr MCP ${stage} failed: ${describeMcpError(err)}`,
    listings: [],
  };
}

// ---------------------------------------------------------------------------
// Live run: initialize -> listTools -> find search tool -> call it
// ---------------------------------------------------------------------------

async function runLive(query: SourceQuery | undefined): Promise<SourceRunResult> {
  const observedAt = new Date().toISOString();

  let session: McpSession;
  try {
    session = await createSession(FIVERR_MCP_ENDPOINT, CLIENT_INFO);
  } catch (err) {
    return mcpFailure('initialize', err);
  }

  let tools: McpTool[];
  try {
    tools = await listTools(session);
  } catch (err) {
    return mcpFailure('tools/list', err);
  }

  const searchTool = pickSearchTool(tools);
  if (searchTool === null) {
    return {
      status: 'blocked',
      mode: 'live',
      message: `No permitted search-capable tool is currently exposed by the Fiverr MCP (tools: ${
        tools.map((tool) => tool.name).join(', ') || 'none'
      }). Buyer-side search unavailable; nothing bypassed and nothing fabricated.`,
      listings: [],
    };
  }

  const queryParam = findQueryParam(searchTool);
  if (queryParam === null) {
    return {
      status: 'blocked',
      mode: 'live',
      message: `Search tool "${searchTool.name}" was found but exposes no free-text query parameter, so the user's keywords cannot be passed honestly.`,
      listings: [],
    };
  }

  const brief =
    query?.keywords !== undefined && query.keywords.length > 0
      ? query.keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword !== '').join(' ')
      : DEFAULT_QUERY;

  let result: McpToolResult;
  try {
    result = await callTool(session, searchTool.name, { [queryParam]: brief });
  } catch (err) {
    return mcpFailure(`tools/call ${searchTool.name}`, err);
  }

  const records = extractResultRecords(result);
  if (records === null) {
    return {
      status: 'error',
      mode: 'live',
      message:
        `Fiverr MCP tool "${searchTool.name}" succeeded but returned an unrecognized result shape; no listings were mapped and ` +
        'nothing was fabricated. Content types seen: ' +
        `${(result.content ?? []).map((block) => block.type ?? 'unknown').join(', ') || 'none'}; structuredContent: ${result.structuredContent === undefined ? 'absent' : 'present'}.`,
      listings: [],
    };
  }

  const listings: RawListing[] = [];
  let dropped = 0;
  for (const record of records) {
    const listing = mapSellerToBuyerResearchListing(record, observedAt, searchTool.name, brief);
    if (listing === null) {
      dropped += 1;
      continue;
    }
    listings.push(listing);
  }

  if (records.length === 0) {
    return {
      status: 'ok',
      mode: 'live',
      message: `Fiverr MCP search returned no results for the query "${brief}" (honest empty outcome; tool: ${searchTool.name}).`,
      listings,
    };
  }

  const dropNote = dropped > 0 ? ` ${dropped} result(s) lacked a URL and were not mapped.` : '';
  return {
    status: 'ok',
    mode: 'live',
    message:
      `Fiverr MCP search (tool: ${searchTool.name}, query: "${brief}") returned ${listings.length} buyer-side talent-research ` +
      `results in provider order; Hop3 applies no ranking or scoring.${dropNote} Ordering and payment stay on Fiverr.`,
    listings,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const fiverrAdapter: SourceAdapter = {
  key: 'fiverr_mcp',
  policy: fiverrPolicy,
  async run(params: { mode: 'live' | 'sandbox'; query?: SourceQuery }): Promise<SourceRunResult> {
    if (params.mode === 'live') return runLive(params.query);
    return {
      status: 'ok',
      mode: 'sandbox',
      message:
        'Sandbox fixtures loaded — buyer-side talent-research imitations in provider order; clearly labelled, never live.',
      listings: fiverrFixtures(),
    };
  },
};
