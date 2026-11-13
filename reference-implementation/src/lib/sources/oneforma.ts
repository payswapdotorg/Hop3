/**
 * Hop3 — Stage 1 source connector: OneForma public project board.
 *
 * Server-side module (Node runtime, global fetch). No external dependencies,
 * no 'use client', no database access.
 *
 * Access policy (CONNECTORS.md 2.3):
 *   - Public listing discovery ONLY, through access the site's current terms
 *     and robots policy permit. robots.txt is fetched and evaluated on every
 *     live run; if it disallows the projects path, the run returns
 *     status 'blocked' and never bypasses.
 *   - Single public page fetch per run; no authenticated endpoints are
 *     touched or reverse-engineered.
 *   - Application and identity verification remain on OneForma; this adapter
 *     only reads the public board page (page 1).
 *
 * Parser facts verified against the live page on 2026-11-12
 * (GET https://www.oneforma.com/projects/ -> 200 text/html, ~173 KB):
 *   - Each project is an `<article class="job-card ...">` with
 *     id="job-<nativeId>" and classes carrying job_type-*, job_tag-*,
 *     country-* and language-* tokens (e.g. status-publish).
 *   - `.jc-pill` spans are the visible category pills (first = category).
 *   - `<h3 class="jc-title"><a href="...">Title</a></h3>` is the detail link.
 *   - `<p class="jc-desc">` is a description excerpt that sometimes ends with
 *     "Available in (Country, ...)." and "Apply now on OneForma."
 *   - The location block is `<span class="jc-location">` containing either
 *     `<span class="job-location-remote">Remote</span>` or a
 *     `.job-location-preview` ("A - B") plus a `.job-location-list` popover
 *     with the full `<span>Country</span>` list.
 *   - A bare (class-less) `<span>` after an SVG inside `.jc-meta` carries the
 *     time commitment ("10 hr per week", "Flexible hours", ...).
 *   - `.jc-rate` carries payment text: "$5 per hour", "$130 to $150 per hour",
 *     "$0.036", "$125 per session", "Paid per hour", "Paid per approved asset",
 *     "Paid per source word".
 *
 * Honesty rules: only fields the page actually exposes are mapped; missing
 * data stays missing; zero parsed entries is a valid 'ok' empty outcome and
 * never fabricated into listings; fetch failures are honest 'error' results.
 */

import type {
  CompensationSpec,
  EligibilitySpec,
  RawListing,
  SourceAdapter,
  SourcePolicy,
  SourceQuery,
  SourceRunResult,
  TimeSpec,
} from '../contracts';
import { PAYOUT_UNKNOWN_DISCLAIMER } from '../contracts';
import { oneformaFixtures } from './sandbox-fixtures';

// ---------------------------------------------------------------------------
// Verified endpoints (CONNECTORS.md 2.3, checked 2026-11-12)
// ---------------------------------------------------------------------------

const ONEFORMA_BOARD_URL = 'https://www.oneforma.com/projects/';
const ONEFORMA_ROBOTS_URL = 'https://www.oneforma.com/robots.txt';
const ONEFORMA_APPLY_GUIDE_URL =
  'https://www.oneforma.com/help-center/project-help/how-to-apply-to-projects-in-your-dashboard/';
const ONEFORMA_PAYMENT_GUIDE_URL =
  'https://www.oneforma.com/brand/prototyping/website/helpcenter-article.html';

const BOARD_PATH = '/projects/';
const PAGE_TIMEOUT_MS = 20_000;
const ROBOTS_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Policy descriptor (CONNECTORS.md 2.3 register entry)
// ---------------------------------------------------------------------------

const oneformaPolicy: SourcePolicy = {
  sourceId: 'oneforma',
  displayName: 'OneForma',
  adapterVersion: '1.0.0',
  sourceKind: 'public-board',
  accessMode: 'permitted-feed',
  actorModes: ['earner'],
  operations: {
    search: {
      allowed: true,
      note: 'Public project board discovery (public listing page 1 only per run)',
    },
    read: {
      allowed: true,
      note: 'Public listing page fetch; detail pages are opened by the user in their own browser',
    },
    draft: { allowed: false, note: 'Application and identity verification remain on OneForma (CONNECTORS.md 2.3)' },
    submit: { allowed: false, note: 'Applications are submitted on OneForma only; Hop3 never submits' },
    message: { allowed: false, note: 'No messaging endpoints; not attempted' },
    hire: { allowed: false, note: 'Not applicable to this source' },
    pay: { allowed: false, note: 'All payouts are handled by OneForma outside Hop3' },
  },
  auth: 'anonymous',
  authNote: 'Public board; Hop3 uses no account and no credentials.',
  coverage: { countries: 'unknown', languages: 'unknown', currencies: 'unknown' },
  payout: {
    methodKnown: false,
    methods: ['PayPal', 'Payoneer', 'Bank transfer'],
    threshold: 'USD 25 minimum per current global guidance (not country-specific proof)',
    fees: 'Not stated in the verified guidance',
    cadence: 'Twice-monthly processing per current global guidance',
    evidenceUrl: ONEFORMA_PAYMENT_GUIDE_URL,
  },
  termsUrl: ONEFORMA_APPLY_GUIDE_URL,
  termsNotes:
    'Public project board: https://www.oneforma.com/projects/ fetched as a permitted feed; ' +
    'robots.txt is checked at runtime on every live run and respected (currently "User-agent: * Allow: /" with ' +
    'specific-bot blocks for /wp-admin/ and /checkout/ only). Application guide: ' +
    `${ONEFORMA_APPLY_GUIDE_URL} . Payment guidance: ${ONEFORMA_PAYMENT_GUIDE_URL} — PayPal, Payoneer and direct ` +
    'bank transfer in USD/EUR/GBP, a USD 25 minimum payout threshold and twice-monthly processing are recorded ' +
    'as NOTES ONLY: a global payment-method list is not proof of availability in any specific country (including ' +
    `Ghana). ${PAYOUT_UNKNOWN_DISCLAIMER}`,
  rateLimit: {
    note: 'single public page fetch per run; robots.txt checked at runtime; no authenticated endpoints',
    backoff:
      'No retry within a run; on HTTP 429/5xx or an unreadable robots.txt the run reports error and waits at least the 60-minute min refresh interval before trying again',
  },
  freshness: { maxAgeHours: 24, minRefreshIntervalMinutes: 60 },
  approvalsRequired: [
    'User performs every application action themselves on OneForma; Hop3 performs no write operations',
  ],
  rankingPolicy: 'hop3-allowed',
  verifiedAt: '2026-11-12',
  verificationNote:
    'Live probe 2026-11-12: robots.txt allows all paths for generic user agents (only /wp-admin/ and /checkout/ are ' +
    'blocked for named bots); GET /projects/ returned HTTP 200 text/html (~173 KB) with 12 job-card articles that ' +
    'this parser maps. Freshness values follow the Stage 1 connector brief.',
};

// ---------------------------------------------------------------------------
// Small local helpers (this layer owns no shared util file in Stage 1)
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs: number, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  middot: '\u00B7',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201C',
  rdquo: '\u201D',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_match, digits: string) => safeCodePoint(Number(digits)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match);
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

// ---------------------------------------------------------------------------
// robots.txt evaluation (minimal RFC 9309-style subset)
// ---------------------------------------------------------------------------

interface RobotsRule {
  allow: boolean;
  path: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let openAgents: string[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (current !== null) {
        // A new agent record begins after a completed group.
        current = null;
        openAgents = [];
      }
      openAgents.push(value.toLowerCase());
    } else if (field === 'allow' || field === 'disallow') {
      if (current === null) {
        current = { agents: openAgents, rules: [] };
        groups.push(current);
      }
      current.rules.push({ allow: field === 'allow', path: value });
    }
    // crawl-delay, sitemap, comments etc. are not needed for the allow decision.
  }
  return groups;
}

function robotsPatternToRegExp(pattern: string): RegExp {
  let source = '';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '$') source += '$';
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}`);
}

interface RobotsDecision {
  allowed: boolean;
  evidence: string;
}

/**
 * Decide whether our (generic browser) user agent may fetch the board path.
 * Longest matching rule wins; Allow wins ties; unmatched paths default to
 * allowed; empty Disallow values are no-ops. Specific bot groups override
 * the '*' group only when they actually match our user agent (they do not,
 * because we identify as a plain browser).
 */
function robotsDecision(groups: RobotsGroup[], path: string, userAgent: string): RobotsDecision {
  const ua = userAgent.toLowerCase();
  const applicable = groups.filter((group) => group.agents.some((agent) => agent === '*' || ua.includes(agent)));
  const specific = applicable.filter((group) => !group.agents.includes('*'));
  const chosen = specific.length > 0 ? specific : applicable.filter((group) => group.agents.includes('*'));

  let best: { rule: RobotsRule; group: string } | null = null;
  for (const group of chosen) {
    for (const rule of group.rules) {
      if (rule.path === '') continue; // empty rule = no restriction
      if (!robotsPatternToRegExp(rule.path).test(path)) continue;
      const better =
        best === null ||
        rule.path.length > best.rule.path.length ||
        (rule.path.length === best.rule.path.length && rule.allow && !best.rule.allow);
      if (better) best = { rule, group: group.agents.join(', ') };
    }
  }
  if (best === null) {
    return { allowed: true, evidence: 'no matching robots rule for the path (default allow)' };
  }
  return {
    allowed: best.rule.allow,
    evidence: `${best.rule.allow ? 'Allow' : 'Disallow'}: ${best.rule.path === '' ? '/' : best.rule.path} (user-agent group "${best.group}")`,
  };
}

// ---------------------------------------------------------------------------
// HTML parsing (focused string/regex parsing, no external dependencies)
// ---------------------------------------------------------------------------

/** Content and extent of the first balanced element starting at `start`. */
function findBalancedElement(html: string, start: number): { inner: string; end: number } | null {
  const open = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(start, start + 60));
  if (!open) return null;
  const name = open[1];
  const tokenRe = new RegExp(`<(/?)${name}(?=[\\s>])[^>]*>`, 'g');
  tokenRe.lastIndex = start;
  let depth = 0;
  let closeEnd = -1;
  let closeStart = -1;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(html)) !== null) {
    if (match[1] === '/') {
      depth -= 1;
      if (depth === 0) {
        closeEnd = tokenRe.lastIndex;
        closeStart = match.index;
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (closeEnd < 0) return null;
  const openEnd = html.indexOf('>', start);
  if (openEnd < 0 || openEnd >= closeStart) return null;
  return { inner: html.slice(openEnd + 1, closeStart), end: closeEnd };
}

interface ParsedCard {
  articleHtml: string;
  nativeId?: string;
  sourceStatus?: string;
  url: string;
  title: string;
  pills: string[];
  description?: string;
  availableInDesc: string[];
  rateText?: string;
  remote: boolean;
  onsite: boolean;
  locationCountries: string[];
  timeTexts: string[];
  tags: string[];
  jobTypes: string[];
  languageTags: string[];
}

function parseArticle(articleHtml: string): ParsedCard | null {
  const openTag = /<article\b([^>]*)>/.exec(articleHtml);
  if (!openTag) return null;
  const attrs = openTag[1];
  if (!/class="[^"]*job-card[^"]*"/.test(attrs)) return null;

  const nativeId = /id="job-(\d+)"/.exec(attrs)?.[1];
  const sourceStatus = /status-([a-z]+)/.exec(attrs)?.[1];
  const classTokens = /class="([^"]*)"/.exec(attrs)?.[1]?.split(/\s+/) ?? [];
  const tags = classTokens.filter((token) => token.startsWith('job_tag-')).map((token) => token.slice('job_tag-'.length));
  const jobTypes = classTokens.filter((token) => token.startsWith('job_type-')).map((token) => token.slice('job_type-'.length));
  const languageTags = classTokens
    .filter((token) => token.startsWith('language-'))
    .map((token) => token.slice('language-'.length));

  const titleMatch = /<h3 class="jc-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(articleHtml);
  if (!titleMatch) return null;
  const url = titleMatch[1];
  const title = collapseWhitespace(decodeEntities(titleMatch[2].replace(/<[^>]+>/g, '')));
  if (!/^https?:\/\//i.test(url) || title === '') return null;

  const pills = [...articleHtml.matchAll(/<span class="jc-pill">([\s\S]*?)<\/span>/g)]
    .map((match) => collapseWhitespace(decodeEntities(match[1].replace(/<[^>]+>/g, ''))))
    .filter((pill) => pill !== '');

  const descRaw = /<p class="jc-desc">([\s\S]*?)<\/p>/.exec(articleHtml)?.[1];
  const availableInDesc = [...(descRaw ?? '').matchAll(/Available in \(([^)]*)\)/g)]
    .flatMap((match) => match[1].split(/[,·]/))
    .map((part) => collapseWhitespace(decodeEntities(part)))
    .filter((part) => part !== '');

  const rateText = collapseWhitespace(
    decodeEntities(/<span class="jc-rate">([\s\S]*?)<\/span>/.exec(articleHtml)?.[1]?.replace(/<[^>]+>/g, '') ?? ''),
  );

  // Location + time commitment from the .jc-meta block (nested-span safe).
  let remote = false;
  let locationCountries: string[] = [];
  let timeTexts: string[] = [];
  const metaIndex = articleHtml.indexOf('<div class="jc-meta"');
  if (metaIndex >= 0) {
    const meta = findBalancedElement(articleHtml, metaIndex);
    if (meta) {
      const locIndex = meta.inner.indexOf('<span class="jc-location"');
      let rest = meta.inner;
      if (locIndex >= 0) {
        const location = findBalancedElement(meta.inner, locIndex);
        if (location) {
          rest = meta.inner.slice(0, locIndex) + meta.inner.slice(location.end);
          if (/class="job-location-remote"/.test(location.inner)) remote = true;
          const listIndex = location.inner.indexOf('<span class="job-location-list"');
          if (listIndex >= 0) {
            const list = findBalancedElement(location.inner, listIndex);
            if (list) {
              locationCountries = [...list.inner.matchAll(/<span>\s*([^<>]+?)\s*<\/span>/g)]
                .map((match) => collapseWhitespace(decodeEntities(match[1])))
                .filter(isPlausibleCountryName);
            }
          }
          if (locationCountries.length === 0) {
            const preview = /<span class="job-location-preview">([^<]*)<\/span>/.exec(location.inner)?.[1];
            if (preview) {
              locationCountries = preview
                .split('·')
                .map((part) => collapseWhitespace(decodeEntities(part)))
                .filter((part) => part !== '');
            }
          }
        }
      }
      const withoutSvgs = rest.replace(/<svg[\s\S]*?<\/svg>/g, '');
      timeTexts = [...withoutSvgs.matchAll(/<span>\s*([^<>]+?)\s*<\/span>/g)]
        .map((match) => collapseWhitespace(decodeEntities(match[1])))
        .filter((text) => text !== '' && text.toLowerCase() !== 'remote');
    }
  }

  const onsite = tags.includes('onsite');

  return {
    articleHtml,
    nativeId,
    sourceStatus,
    url,
    title,
    pills,
    description: descRaw === undefined ? undefined : collapseWhitespace(decodeEntities(descRaw.replace(/<[^>]+>/g, ''))),
    availableInDesc,
    rateText: rateText === '' ? undefined : rateText,
    remote,
    onsite,
    locationCountries,
    timeTexts,
    tags,
    jobTypes,
    languageTags,
  };
}

function isPlausibleCountryName(value: string): boolean {
  // Country names are letters/spaces/apostrophes/hyphens/periods, never digits.
  return value.length >= 4 && /[A-Za-z\u00C0-\u024F]/.test(value) && !/\d/.test(value);
}

// ---------------------------------------------------------------------------
// Field mapping — only what the page actually exposes
// ---------------------------------------------------------------------------

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  afghanistan: 'AF', albania: 'AL', algeria: 'DZ', angola: 'AO', argentina: 'AR', armenia: 'AM',
  australia: 'AU', austria: 'AT', azerbaijan: 'AZ', bahrain: 'BH', bangladesh: 'BD', belarus: 'BY',
  belgium: 'BE', belize: 'BZ', benin: 'BJ', bhutan: 'BT', bolivia: 'BO', 'bosnia and herzegovina': 'BA',
  botswana: 'BW', brazil: 'BR', brunei: 'BN', bulgaria: 'BG', 'burkina faso': 'BF', burundi: 'BI',
  cambodia: 'KH', cameroon: 'CM', canada: 'CA', 'central african republic': 'CF', chad: 'TD',
  chile: 'CL', china: 'CN', colombia: 'CO', 'costa rica': 'CR', 'cote d\u2019ivoire': 'CI',
  "cote d'ivoire": 'CI', croatia: 'HR', cuba: 'CU', cyprus: 'CY', 'czech republic': 'CZ', czechia: 'CZ',
  denmark: 'DK', 'dominican republic': 'DO', ecuador: 'EC', egypt: 'EG', 'el salvador': 'SV',
  eritrea: 'ER', estonia: 'EE', eswatini: 'SZ', ethiopia: 'ET', fiji: 'FJ', finland: 'FI',
  france: 'FR', gabon: 'GA', gambia: 'GM', georgia: 'GE', germany: 'DE', ghana: 'GH', greece: 'GR',
  guatemala: 'GT', guinea: 'GN', 'guinea-bissau': 'GW', guyana: 'GY', haiti: 'HT', honduras: 'HN',
  'hong kong': 'HK', hungary: 'HU', iceland: 'IS', india: 'IN', indonesia: 'ID', iran: 'IR',
  iraq: 'IQ', ireland: 'IE', israel: 'IL', italy: 'IT', jamaica: 'JM', japan: 'JP', jordan: 'JO',
  kazakhstan: 'KZ', kenya: 'KE', kuwait: 'KW', kyrgyzstan: 'KG', laos: 'LA', latvia: 'LV',
  lebanon: 'LB', lesotho: 'LS', liberia: 'LR', libya: 'LY', lithuania: 'LT', luxembourg: 'LU',
  macau: 'MO', madagascar: 'MG', malawi: 'MW', malaysia: 'MY', mali: 'ML', malta: 'MT',
  mauritania: 'MR', mauritius: 'MU', mexico: 'MX', moldova: 'MD', monaco: 'MC', mongolia: 'MN',
  montenegro: 'ME', morocco: 'MA', mozambique: 'MZ', myanmar: 'MM', namibia: 'NA', nepal: 'NP',
  netherlands: 'NL', 'new zealand': 'NZ', nicaragua: 'NI', niger: 'NE', nigeria: 'NG',
  'north macedonia': 'MK', norway: 'NO', oman: 'OM', pakistan: 'PK', palestine: 'PS', panama: 'PA',
  'papua new guinea': 'PG', paraguay: 'PY', peru: 'PE', philippines: 'PH', poland: 'PL',
  portugal: 'PT', qatar: 'QA', romania: 'RO', russia: 'RU', rwanda: 'RW', 'saudi arabia': 'SA',
  senegal: 'SN', serbia: 'RS', 'sierra leone': 'SL', singapore: 'SG', slovakia: 'SK', slovenia: 'SI',
  somalia: 'SO', 'south africa': 'ZA', 'south korea': 'KR', 'south sudan': 'SS', spain: 'ES',
  'sri lanka': 'LK', sudan: 'SD', suriname: 'SR', sweden: 'SE', switzerland: 'CH', syria: 'SY',
  taiwan: 'TW', tajikistan: 'TJ', tanzania: 'TZ', thailand: 'TH', 'togo': 'TG',
  'trinidad and tobago': 'TT', tunisia: 'TN', turkey: 'TR', turkmenistan: 'TM', uganda: 'UG',
  ukraine: 'UA', 'united arab emirates': 'AE', 'united kingdom': 'GB', 'united states': 'US',
  uruguay: 'UY', usa: 'US', uzbekistan: 'UZ', venezuela: 'VE', vietnam: 'VN', yemen: 'YE',
  zambia: 'ZM', zimbabwe: 'ZW',
};

const LANGUAGE_TAG_TO_ISO6391: Record<string, string> = {
  amharic: 'am', arabic: 'ar', bengali: 'bn', bulgarian: 'bg', cantonese: 'zh', chinese: 'zh',
  'chinese-simplified': 'zh', 'chinese-traditional': 'zh', croatian: 'hr', czech: 'cs', danish: 'da',
  dutch: 'nl', english: 'en', estonian: 'et', filipino: 'tl', finnish: 'fi', french: 'fr', georgian: 'ka',
  german: 'de', greek: 'el', hausa: 'ha', hebrew: 'he', hindi: 'hi', hungarian: 'hu', igbo: 'ig',
  indonesian: 'id', italian: 'it', japanese: 'ja', kannada: 'kn', kazakh: 'kk', korean: 'ko',
  latvian: 'lv', lithuanian: 'lt', malay: 'ms', malayalam: 'ml', marathi: 'mr', norwegian: 'no',
  pashto: 'ps', persian: 'fa', polish: 'pl', portuguese: 'pt', punjabi: 'pa', romanian: 'ro',
  russian: 'ru', serbian: 'sr', slovak: 'sk', slovenian: 'sl', somali: 'so', spanish: 'es',
  swahili: 'sw', swedish: 'sv', tamil: 'ta', telugu: 'te', thai: 'th', turkish: 'tr', ukrainian: 'uk',
  urdu: 'ur', uzbek: 'uz', vietnamese: 'vi', yoruba: 'yo',
};

function countryNamesToIso2(names: string[]): { codes: string[]; unmapped: string[] } {
  const codes: string[] = [];
  const unmapped: string[] = [];
  for (const name of names) {
    const code = COUNTRY_NAME_TO_ISO2[name.trim().toLowerCase()];
    if (code && !codes.includes(code)) codes.push(code);
    else if (!code) unmapped.push(name.trim());
  }
  return { codes, unmapped };
}

function mapEligibility(card: ParsedCard): EligibilitySpec {
  // Country evidence precedence: full location list > preview > description text.
  let countryNames = card.locationCountries;
  let source = '';
  if (countryNames.length > 0 && card.articleHtml.includes('job-location-list')) {
    source = 'full country list on the project card';
  } else if (countryNames.length > 0) {
    source = 'country preview on the project card';
  } else if (card.availableInDesc.length > 0) {
    countryNames = card.availableInDesc;
    source = '"Available in (...)" text in the project card description';
  }

  const notes: string[] = [];
  const { codes, unmapped } = countryNamesToIso2(countryNames);

  if (codes.length > 0 || unmapped.length > 0) {
    notes.push(`Country availability parsed from ${source}: ${countryNames.join(', ')}.`);
    if (unmapped.length > 0) {
      notes.push(`Card country names not mapped to ISO codes (left as text, not guessed): ${unmapped.join(', ')}.`);
    }
  } else if (card.remote && (card.tags.includes('all-countries') || card.tags.includes('global'))) {
    notes.push('Card shows "Remote" and is tagged all-countries/global on the board; no country restriction stated.');
  } else if (card.remote) {
    notes.push('Card shows "Remote"; country availability is not stated on the card.');
  } else {
    notes.push('Card does not state country availability.');
  }

  const languageCodes: string[] = [];
  const unmappedLanguages: string[] = [];
  for (const tag of card.languageTags) {
    const code = LANGUAGE_TAG_TO_ISO6391[tag.toLowerCase()];
    if (code && !languageCodes.includes(code)) languageCodes.push(code);
    else if (!code) unmappedLanguages.push(tag);
  }
  if (languageCodes.length > 0 || unmappedLanguages.length > 0) {
    notes.push(`Language tags parsed from card markup: ${card.languageTags.join(', ')}.`);
    if (unmappedLanguages.length > 0) {
      notes.push(`Language tags not mapped to ISO 639-1 (not guessed): ${unmappedLanguages.join(', ')}.`);
    }
  }

  const mode: EligibilitySpec['mode'] =
    codes.length > 0 || unmapped.length > 0
      ? 'whitelist'
      : card.remote && (card.tags.includes('all-countries') || card.tags.includes('global'))
        ? 'open'
        : 'unknown';

  const eligibility: EligibilitySpec = { mode, notes: notes.join(' ') };
  if (codes.length > 0) eligibility.countries = codes;
  if (languageCodes.length > 0) eligibility.languages = languageCodes;
  return eligibility;
}

function mapCompensation(rateText: string | undefined): CompensationSpec | undefined {
  if (rateText === undefined || rateText === '') return undefined;

  const currency = /USD/i.test(rateText) ? 'USD' : /EUR/i.test(rateText) ? 'EUR' : /GBP/i.test(rateText) ? 'GBP' : undefined;
  const symbolCurrency = rateText.includes('€') ? 'EUR' : rateText.includes('£') ? 'GBP' : rateText.includes('$') ? 'USD' : undefined;

  const amountPattern = /(\d+(?:[.,]\d+)?)/;
  const range = /(\d+(?:[.,]\d+)?)\s*(?:to|-|–|—)\s*(\d+(?:[.,]\d+)?)/.exec(rateText);
  const single = amountPattern.exec(rateText);
  const hasAmount = range !== null || single !== null;

  let payUnit: CompensationSpec['payUnit'] = 'unknown';
  if (/per hour|hourly/i.test(rateText)) payUnit = 'hourly';
  else if (/per (?:source |approved |audio )?word/i.test(rateText)) payUnit = 'word';
  else if (/per month|monthly/i.test(rateText)) payUnit = 'month';
  else if (/per (?:approved )?(?:asset|task|session|project|batch)/i.test(rateText)) payUnit = 'task';

  const conditionsParts = [`Rate as shown on the project card: "${rateText}".`];
  if (symbolCurrency !== undefined) {
    conditionsParts.push(`Currency inferred from the "${symbolCurrency === 'USD' ? '$' : symbolCurrency === 'EUR' ? '€' : '£'}" symbol on oneforma.com (OneForma payment guidance lists USD/EUR/GBP).`);
  }
  if (payUnit === 'task') {
    conditionsParts.push('Per-item unit normalized to "task"; the card names its own unit in the quoted text.');
  }

  const compensation: CompensationSpec = {
    payUnit,
    fixedOrEstimated: hasAmount ? 'fixed' : 'unknown',
    conditions: conditionsParts.join(' '),
  };
  if (currency ?? symbolCurrency) compensation.currency = (currency ?? symbolCurrency) as string;
  if (range !== null) {
    compensation.grossMin = parseAmount(range[1]);
    compensation.grossMax = parseAmount(range[2]);
  } else if (single !== null) {
    compensation.grossMin = parseAmount(single[1]);
    compensation.grossMax = parseAmount(single[1]);
  }
  return compensation;
}

function parseAmount(raw: string): number {
  const normalized = raw.replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

function mapTime(timeTexts: string[]): TimeSpec | undefined {
  if (timeTexts.length === 0) return undefined;
  const joined = timeTexts.join('; ');
  const time: TimeSpec = { schedule: joined };
  const weekly = /(\d+)\s*(?:to\s*(\d+))?\s*hrs?\s+per\s+week/i.exec(joined);
  if (weekly) {
    time.hoursMin = Number.parseInt(weekly[1], 10);
    time.hoursMax = weekly[2] !== undefined ? Number.parseInt(weekly[2], 10) : time.hoursMin;
  } else {
    const duration = /(about\s+\d+\s+(?:months?|weeks?|days?)|\d+\s+(?:months?|weeks?|days?)\s+(?:commitment|duration))/i.exec(joined);
    if (duration) time.duration = duration[0];
  }
  return time;
}

function mapSummary(card: ParsedCard): string | undefined {
  if (card.description === undefined) return undefined;
  let summary = card.description;
  // The "Available in (...)" sentence is mapped into eligibility; drop it there
  // only when it was actually consumed, so no visible text is silently lost.
  if (card.availableInDesc.length > 0) {
    summary = summary.replace(/Available in \([^)]*\)\.?\s*/g, '');
  }
  summary = summary.replace(/Apply now on OneForma\.?\s*/gi, '');
  return collapseWhitespace(summary);
}

function mapCardToRawListing(card: ParsedCard, observedAt: string): RawListing {
  const externalId = normalizeUrl(card.url);
  const summary = mapSummary(card);
  const listing: RawListing = {
    sourceKey: 'oneforma',
    sourceRecordId: card.nativeId !== undefined ? `job-${card.nativeId}` : externalId,
    externalId,
    canonicalUrl: card.url,
    title: card.title,
    platform: 'OneForma',
    observedAt,
    provenance: 'live',
    eligibility: mapEligibility(card),
    payout: { methodKnown: false },
    raw: { articleHtml: card.articleHtml },
  };
  if (summary !== undefined && summary !== '') listing.summary = summary;
  if (card.pills.length > 0) listing.opportunityType = card.pills[0];
  listing.workMode = card.onsite ? 'local' : card.remote || card.tags.includes('remote') ? 'remote' : 'unknown';
  const compensation = mapCompensation(card.rateText);
  if (compensation !== undefined) listing.compensation = compensation;
  const time = mapTime(card.timeTexts);
  if (time !== undefined) listing.time = time;
  if (card.sourceStatus !== undefined) listing.sourceStatus = card.sourceStatus;
  return listing;
}

function parseProjectsPage(html: string, observedAt: string): RawListing[] {
  const listings: RawListing[] = [];
  const seenExternalIds = new Set<string>();
  for (const chunk of html.split(/(?=<article\b)/)) {
    if (!chunk.startsWith('<article')) continue;
    const card = parseArticle(chunk);
    if (!card) continue;
    const listing = mapCardToRawListing(card, observedAt);
    if (seenExternalIds.has(listing.externalId)) continue; // same card link twice on the page
    seenExternalIds.add(listing.externalId);
    listings.push(listing);
  }
  return listings;
}

// ---------------------------------------------------------------------------
// Live run
// ---------------------------------------------------------------------------

async function runLive(): Promise<SourceRunResult> {
  // 1. robots.txt first — never crawl without permission evidence.
  let robotsText = '';
  try {
    const robotsResponse = await fetchWithTimeout(ONEFORMA_ROBOTS_URL, ROBOTS_TIMEOUT_MS, {
      'user-agent': USER_AGENT,
      accept: 'text/plain,*/*',
    });
    if (robotsResponse.status >= 400 && robotsResponse.status < 500) {
      // No robots file (4xx): unrestricted by robots; proceed.
      robotsText = '';
    } else if (!robotsResponse.ok) {
      return {
        status: 'error',
        mode: 'live',
        message: `robots.txt returned HTTP ${robotsResponse.status}; refusing to fetch the board without robots evidence (not bypassing)`,
        listings: [],
      };
    } else {
      robotsText = await robotsResponse.text();
    }
  } catch (err) {
    return {
      status: 'error',
      mode: 'live',
      message: `Could not read robots.txt (${isAbortError(err) ? 'timed out' : errorMessage(err)}); refusing to fetch the board without robots evidence (not bypassing)`,
      listings: [],
    };
  }

  const decision = robotsDecision(parseRobots(robotsText), BOARD_PATH, USER_AGENT);
  if (!decision.allowed) {
    return {
      status: 'blocked',
      mode: 'live',
      message: `robots.txt disallows ${BOARD_PATH} for this user agent (${decision.evidence}); OneForma live fetch blocked — never bypassing`,
      listings: [],
    };
  }

  // 2. Single public page fetch.
  let html: string;
  try {
    const response = await fetchWithTimeout(ONEFORMA_BOARD_URL, PAGE_TIMEOUT_MS, {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
    });
    if (!response.ok) {
      return {
        status: 'error',
        mode: 'live',
        message: `OneForma projects page returned HTTP ${response.status} ${response.statusText}`,
        listings: [],
      };
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      return {
        status: 'error',
        mode: 'live',
        message: `OneForma projects page returned unexpected content type "${contentType || 'unknown'}" (expected HTML)`,
        listings: [],
      };
    }
    html = await response.text();
  } catch (err) {
    return {
      status: 'error',
      mode: 'live',
      message: `OneForma projects page fetch failed (${isAbortError(err) ? 'timed out after 20s' : errorMessage(err)})`,
      listings: [],
    };
  }

  // 3. Parse and map (an empty parse is a valid, honest empty outcome).
  const observedAt = new Date().toISOString();
  const listings = parseProjectsPage(html, observedAt);
  if (listings.length === 0) {
    return {
      status: 'ok',
      mode: 'live',
      message: `Page fetched (${html.length} bytes, robots allowed: ${decision.evidence}) but no project cards were recognized — the page structure may have changed. Zero listings reported; nothing fabricated.`,
      listings: [],
    };
  }
  return {
    status: 'ok',
    mode: 'live',
    message: `Fetched ${listings.length} public project cards from ${ONEFORMA_BOARD_URL} (robots.txt allows ${BOARD_PATH}: ${decision.evidence}). Page 1 only; detail pages are opened by the user.`,
    listings,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const oneformaAdapter: SourceAdapter = {
  key: 'oneforma',
  policy: oneformaPolicy,
  async run(params: { mode: 'live' | 'sandbox'; query?: SourceQuery }): Promise<SourceRunResult> {
    if (params.mode === 'live') return runLive();
    return {
      status: 'ok',
      mode: 'sandbox',
      message: 'Sandbox fixtures loaded — clearly labelled, never live',
      listings: oneformaFixtures(),
    };
  },
};
