/**
 * Hop3 — Stage 1 deduplication helpers (Worker B).
 *
 * Implements DOMAIN-MODEL.md section 3 (deduplication) in its Stage 1 form:
 *  - Same-provider duplicates: (sourceKey, externalId) uniqueness, where the
 *    externalId is the normalized URL when the source exposes no native id.
 *  - Cross-source grouping: a CONSERVATIVE, display-only fingerprint used
 *    solely to show a "similar listings grouped" count. It is NEVER used to
 *    destructively merge or hide records — DOMAIN-MODEL section 3: "Never
 *    merge two postings solely because titles look similar."
 *
 * Pure functions, Node runtime. No 'use client'.
 */

/** Tracking parameters stripped during URL normalization. */
const TRACKING_PARAM_EXACT = new Set(["fbclid", "gclid", "ref", "source"]);

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAM_EXACT.has(lower);
}

/**
 * Canonicalize a listing URL for dedupe keying:
 *  - lowercase scheme and host,
 *  - strip the hash fragment,
 *  - strip tracking parameters (utm_*, fbclid, gclid, ref, source),
 *  - strip a trailing slash from the path,
 *  - drop default ports (80 for http, 443 for https — the WHATWG URL parser
 *    already removes them; kept explicit here for clarity).
 *
 * Remaining query parameters keep their original order: param order is NOT
 * normalized on purpose, so two structurally different query strings never
 * collapse into one key (conservative — false splits are acceptable, false
 * merges are not).
 *
 * A URL that cannot be parsed at all is returned trimmed and otherwise
 * unchanged rather than guessed at.
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return trimmed;

  // Tolerate protocol-less input by assuming https (avoids false splits only;
  // it never merges two distinct absolute URLs).
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return trimmed;
  }

  const host = parsed.hostname.toLowerCase();
  const port = parsed.port === "80" || parsed.port === "443" ? "" : parsed.port;

  let path = parsed.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  const kept = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    if (!isTrackingParam(key)) {
      kept.append(key, value);
    }
  }
  const search = kept.toString() === "" ? "" : `?${kept.toString()}`;

  return `${parsed.protocol}//${host}${port ? `:${port}` : ''}${path}${search}`;
}

/** Dedupe key within a source: the normalized URL (or source-native id upstream). */
export function externalIdForUrl(url: string): string {
  return normalizeUrl(url);
}

const NON_ALPHANUMERIC_RUNS = new RegExp('[^\\p{L}\\p{N}]+', "gu");

/** Lowercase a title and collapse all punctuation/whitespace runs to one space. */
function normalizeTitleForGrouping(title: string): string {
  return title
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RUNS, " ")
    .trim();
}

/**
 * Conservative cross-source grouping fingerprint:
 *   normalizedTitle + '|' + (eligibility country list joined, or 'any') + '|' + (grossMax ?? 'unknown')
 *
 * IMPORTANT: this key backs a DISPLAY-ONLY "similar listings grouped" count.
 * It is never used to destructively merge, hide or overwrite records —
 * DOMAIN-MODEL section 3 forbids merging postings solely because their titles
 * look similar, and each source record keeps its own row and link.
 *
 * `platform` and `opportunityType` are accepted in the input for future
 * refinement but deliberately excluded from the key, so grouping can actually
 * correlate the same opportunity observed across different sources.
 * Callers should pass a canonical, sorted country string (for example
 * 'GH,US') so that identical country sets produce identical keys.
 */
export function crossSourceGroupKey(input: {
  title: string;
  platform: string;
  opportunityType?: string;
  country?: string;
  grossMax?: number;
}): string {
  const title = normalizeTitleForGrouping(input.title ?? "");
  const country =
    input.country !== undefined && input.country.trim() !== ""
      ? input.country.trim().toUpperCase()
      : "any";
  const grossMax =
    input.grossMax !== undefined && Number.isFinite(input.grossMax)
      ? String(input.grossMax)
      : "unknown";
  return `${title}|${country}|${grossMax}`;
}
