/**
 * Hop3 — Stage 1 source connector: user-submitted opportunity links (Worker A).
 *
 * Server-side module (Node runtime, global fetch). No database access.
 *
 * Policy (CONNECTORS.md 2.4 — user-submitted links):
 *   - The user supplies a link they are authorized to access; Hop3 records it
 *     as provenance 'user-submitted' — the employer, source and requirements
 *     stay unverified until checked.
 *   - A polite, single, public fetch is attempted to extract the public page
 *     title/description. A private or blocked page is still recorded honestly
 *     as an unfetched, unverified link — it is never bypassed, proxied or
 *     reverse-engineered.
 *   - Server-side request forgery guards: only public http(s) hosts are
 *     fetched; loopback, private, link-local and reserved addresses are
 *     refused before any request leaves the machine.
 *
 * Honesty rules: extracted fields come only from the page's own <title> /
 * meta description / Open Graph tags; nothing else is inferred. A page that
 * cannot be fetched contributes no fields at all.
 */

import type { RawListing, SourcePolicy } from '../contracts';
import { PAYOUT_UNKNOWN_DISCLAIMER, USER_SUBMITTED_LABEL } from '../contracts';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_500_000; // 1.5 MB — enough for a listing page's head
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Policy descriptor (CONNECTORS.md register entry)
// ---------------------------------------------------------------------------

export const urlIntakePolicy: SourcePolicy = {
  sourceId: 'url_intake',
  displayName: 'Submitted links',
  adapterVersion: '1.0.0',
  sourceKind: 'user-link',
  accessMode: 'user-submitted-link',
  actorModes: ['earner'],
  operations: {
    search: {
      allowed: false,
      note: 'Not a searchable source — the user submits specific links',
    },
    read: {
      allowed: true,
      note: 'One polite public fetch per submitted link to extract the page title/description; private or blocked pages are recorded unfetched, never bypassed',
    },
    draft: { allowed: false, note: 'Application materials are prepared locally only' },
    submit: { allowed: false, note: 'Hop3 never submits applications for any source' },
    message: { allowed: false, note: 'Not applicable' },
    hire: { allowed: false, note: 'Not applicable' },
    pay: { allowed: false, note: 'Not applicable' },
  },
  auth: 'account-required',
  authNote:
    'The user is responsible for having legitimate access to any link they submit; Hop3 performs only a single anonymous public fetch.',
  coverage: { countries: 'unknown', languages: 'unknown', currencies: 'unknown' },
  payout: {
    methodKnown: false,
    threshold: 'Unknown — check the linked page',
    fees: 'Unknown — check the linked page',
  },
  termsUrl: undefined,
  termsNotes:
    'User-submitted links: employer, source and requirements are unverified until checked. ' +
    `${USER_SUBMITTED_LABEL} ${PAYOUT_UNKNOWN_DISCLAIMER}`,
  rateLimit: {
    note: 'One fetch per submitted link; no retries within a submission',
    backoff: 'No retry — a failed fetch is recorded honestly as an unfetched link',
  },
  freshness: { maxAgeHours: 24, minRefreshIntervalMinutes: 0 },
  approvalsRequired: ['The user reviews and submits anything on the linked platform themselves'],
  rankingPolicy: 'hop3-allowed',
  verifiedAt: '2026-11-12',
  verificationNote: 'Stage 1 design per CONNECTORS.md 2.4: user-submitted link intake with a polite public fetch.',
};

// ---------------------------------------------------------------------------
// SSRF guards
// ---------------------------------------------------------------------------

const PRIVATE_V4_CIDRS: Array<{ prefix: number; bits: number }> = [
  { prefix: 0x00000000, bits: 8 }, // 0.0.0.0/8 "this network"
  { prefix: 0x0A000000, bits: 8 }, // 10.0.0.0/8
  { prefix: 0x7F000000, bits: 8 }, // 127.0.0.0/8 loopback
  { prefix: 0xA9FE0000, bits: 16 }, // 169.254.0.0/16 link-local
  { prefix: 0xAC100000, bits: 12 }, // 172.16.0.0/12
  { prefix: 0xC0A80000, bits: 16 }, // 192.168.0.0/16
  { prefix: 0xC0000000, bits: 2 }, // 224.0.0.0/4 multicast+reserved
];

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function isPrivateV4(ip: string): boolean {
  const value = ipv4ToNumber(ip);
  if (value === null) return false;
  return PRIVATE_V4_CIDRS.some(({ prefix, bits }) => {
    const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
    return ((value & mask) >>> 0) === ((prefix & mask) >>> 0);
  });
}

function isLocalV6(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === '::1' ||
    h === '0:0:0:0:0:0:0:1' ||
    h.startsWith('fe80:') || // link-local
    h.startsWith('fc') || // unique local
    h.startsWith('fd') || // unique local
    h.startsWith('::ffff:') || // IPv4-mapped (checked as v4 below too)
    h === '::'
  );
}

/**
 * Resolve which hosts we never fetch: loopback, private, link-local, reserved,
 * and non-http(s) schemes. DNS is not pre-resolved (a hostname that resolves
 * privately at runtime is still possible); as defence-in-depth the fetch also
 * refuses redirects (follow is off) so a public host cannot bounce us into a
 * private network.
 */
export function assertPublicHttpUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'The value is not a valid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `Only http and https links can be submitted (got "${url.protocol}")` };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '' ) return { ok: false, reason: 'The URL has no host' };

  const blockedHostPatterns = [
    /^localhost$/,
    /\.local$/,
    /\.internal$/,
    /\.localhost$/,
    /^0\./,
    /^metadata\./, // cloud metadata services
  ];
  if (blockedHostPatterns.some((pattern) => pattern.test(host))) {
    return { ok: false, reason: `The host "${host}" is not a public web host` };
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && isPrivateV4(host)) {
    return { ok: false, reason: `The address ${host} is private and will not be fetched` };
  }
  if (host.includes(':') && isLocalV6(host)) {
    return { ok: false, reason: `The address ${host} is local and will not be fetched` };
  }

  return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Minimal, dependency-free HTML head extraction
// ---------------------------------------------------------------------------

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => safeCodePoint(Number(dec)));
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/** First <title>…</title> text within the first 1.5 MB of the document. */
function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]{0,600}?)<\/title>/i.exec(html);
  const text = match ? collapseWhitespace(decodeEntities(match[1])) : '';
  return text !== '' ? text.slice(0, 300) : undefined;
}

/** First matching meta description / og:description / og:title content. */
function extractMetaContent(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const pattern = new RegExp(
      `<meta[^>]+(?:name|property)\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']{0,600})["']`,
      'i',
    );
    const alt = new RegExp(
      `<meta[^>]+content\\s*=\\s*["']([^"']{0,600})["'][^>]*(?:name|property)\\s*=\\s*["']${key}["']`,
      'i',
    );
    const match = pattern.exec(html) ?? alt.exec(html);
    if (match) {
      const text = collapseWhitespace(decodeEntities(match[1]));
      if (text !== '') return text.slice(0, 500);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Ingest one user-submitted link
// ---------------------------------------------------------------------------

export interface IntakeOutcome {
  listing: RawListing;
  fetched: boolean;
  httpStatus?: number;
  fetchNote: string;
}

/** Normalize the submitted URL into the dedupe external id (see domain/dedupe.ts). */
function normalizeForDedupe(url: URL): string {
  const host = url.hostname.toLowerCase();
  let path = url.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const kept = new URLSearchParams();
  const tracking = /^(utm_[a-z_]+|fbclid|gclid|ref|source)$/i;
  url.searchParams.forEach((value, key) => {
    if (!tracking.test(key)) kept.append(key, value);
  });
  const search = kept.toString() === '' ? '' : `?${kept.toString()}`;
  return `${url.protocol}//${host}${path}${search}`;
}

function hostLabel(url: URL): string {
  return url.hostname.replace(/^www\./, '');
}

/**
 * Record one user-submitted link. The polite public fetch is best-effort: any
 * failure still produces an honest, clearly-labelled record (provenance
 * 'user-submitted', summary explains exactly what happened).
 */
export async function ingestUserLink(rawUrl: string, context?: string): Promise<IntakeOutcome> {
  const guard = assertPublicHttpUrl(rawUrl);
  if (!guard.ok) {
    // Not even recorded as a fetch attempt with a URL we can key on: build the
    // listing around the trimmed input so the user sees what was rejected.
    const trimmed = rawUrl.trim();
    const listing: RawListing = {
      sourceKey: 'url_intake',
      sourceRecordId: trimmed,
      externalId: trimmed,
      canonicalUrl: trimmed,
      title: 'Rejected link — not a public http(s) URL',
      summary:
        `${USER_SUBMITTED_LABEL} The link was refused before any fetch: ${guard.reason}. ` +
        (context ? `User context: ${context}` : ''),
      platform: 'User-submitted',
      opportunityType: 'user-link',
      workMode: 'unknown',
      eligibility: { mode: 'unknown', notes: 'User-submitted link: availability unchecked.' },
      payout: { methodKnown: false },
      observedAt: new Date().toISOString(),
      provenance: 'user-submitted',
      raw: { intake: 'rejected', reason: guard.reason, context: context ?? null },
    };
    return { listing, fetched: false, fetchNote: guard.reason };
  }

  const url = guard.url;
  const observedAt = new Date().toISOString();
  const externalId = normalizeForDedupe(url);

  let fetched = false;
  let httpStatus: number | undefined;
  let fetchNote = 'The page was not fetched';
  let title: string | undefined;
  let description: string | undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'manual', // no redirect following: private-network bounce protection
      signal: controller.signal,
      cache: 'no-store',
    });
    httpStatus = response.status;

    if (response.status >= 300 && response.status < 400) {
      fetchNote = `The server redirected (HTTP ${response.status}); redirects are not followed, so the page was not read`;
    } else if (!response.ok) {
      fetchNote = `The page fetch returned HTTP ${response.status} — the link is recorded unfetched and unverified`;
    } else {
      const contentType = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
        fetchNote = `The page content type "${contentType || 'unknown'}" is not readable HTML — only the link is recorded`;
      } else {
        const body = await response.text();
        fetched = true;
        fetchNote = `The public page was fetched (HTTP ${response.status}, ${body.length} bytes) and its own title/description were read`;
        title = extractTitle(body) ?? extractMetaContent(body, ['og:title']);
        description =
          extractMetaContent(body, ['description', 'og:description']) ??
          extractMetaContent(body, ['og:title']);
      }
    }
  } catch (err) {
    fetchNote = `The page could not be fetched (${err instanceof Error && err.name === 'AbortError' ? 'timed out after 15s' : err instanceof Error ? err.message : String(err)}) — recorded unfetched and unverified`;
  } finally {
    clearTimeout(timer);
  }

  const summaryBits: string[] = [USER_SUBMITTED_LABEL, fetchNote + '.'];
  if (description) summaryBits.push(`Page description: ${description}`);
  if (context) summaryBits.push(`User context: ${context}`);
  summaryBits.push('Employer, source and requirements are unverified until you check them yourself.');

  const listing: RawListing = {
    sourceKey: 'url_intake',
    sourceRecordId: externalId,
    externalId,
    canonicalUrl: url.toString(),
    title: title ?? `Unverified link — ${hostLabel(url)}`,
    summary: summaryBits.join(' '),
    platform: 'User-submitted',
    opportunityType: 'user-link',
    workMode: 'unknown',
    eligibility: {
      mode: 'unknown',
      notes: 'User-submitted link: country availability, requirements and payout are unchecked.',
    },
    payout: { methodKnown: false, countryNotes: undefined },
    observedAt,
    provenance: 'user-submitted',
    raw: {
      intake: 'fetched-public-page',
      fetched,
      httpStatus: httpStatus ?? null,
      extracted: fetched ? { title: title ?? null, description: description ?? null } : null,
      context: context ?? null,
    },
  };

  return { listing, fetched, httpStatus, fetchNote };
}
