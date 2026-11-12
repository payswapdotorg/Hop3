/**
 * Hop3 — Stage 1 source registry + sync orchestration (Worker A/B glue).
 *
 * Responsibilities (CONNECTORS.md "Source registry"):
 *   - Seed and keep fresh the SourceConnection rows from the frozen adapter
 *     policies (oneforma, upwork_mcp, fiverr_mcp, url_intake) without ever
 *     resetting runtime state (mode, lastSyncAt, statusMessage).
 *   - Run one adapter sync, record a SourceRun row with honest counters
 *     (fetched/inserted/updated/duplicates), and persist listings through the
 *     dedupe-aware ingest.
 *   - Enforce each source's own min-refresh interval for live runs (policy
 *     rate limits are read from the registry, never invented).
 *
 * Honesty rules: blocked/error runs insert nothing; counters count what
 * actually happened; sandbox runs are labelled by the listing provenance
 * itself ('sandbox-fixture'), never presented as live.
 *
 * Node runtime only (route handlers). No 'use client'.
 */

import { db } from '@/lib/db';
import type { SourceConnection, SourceRun } from '@prisma/client';
import {
  SOURCE_KEYS,
  type IngestResult,
  type RawListing,
  type SourceConnectionDTO,
  type SourceKey,
  type SourcePolicy,
} from '@/lib/contracts';
import { oneformaAdapter } from '@/lib/sources/oneforma';
import { upworkAdapter, UPWORK_BLOCKED_MESSAGE } from '@/lib/sources/upwork';
import { fiverrAdapter } from '@/lib/sources/fiverr';
import { urlIntakePolicy } from '@/lib/sources/url-intake';

const ADAPTERS = {
  oneforma: oneformaAdapter,
  upwork_mcp: upworkAdapter,
  fiverr_mcp: fiverrAdapter,
} as const;

const POLICIES: Record<SourceKey, SourcePolicy> = {
  oneforma: oneformaAdapter.policy,
  upwork_mcp: upworkAdapter.policy,
  fiverr_mcp: fiverrAdapter.policy,
  url_intake: urlIntakePolicy,
};

/** Initial runtime mode for a source before any sync has been attempted. */
const INITIAL_MODE: Record<SourceKey, SourceConnectionDTO['mode']> = {
  oneforma: 'live', // anonymous public board
  fiverr_mcp: 'live', // anonymous MCP search (verified probe)
  upwork_mcp: 'blocked', // OAuth 2.1 required, honestly unavailable
  url_intake: 'live', // always user-driven
};

const INITIAL_STATUS_MESSAGE: Partial<Record<SourceKey, string>> = {
  upwork_mcp: UPWORK_BLOCKED_MESSAGE,
};

// ---------------------------------------------------------------------------
// Defensive JSON helpers (SQLite stores structured payloads as Strings)
// ---------------------------------------------------------------------------

function parseJson(value: string | null | undefined): unknown {
  if (value == null || value.trim() === '') return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Registry seeding
// ---------------------------------------------------------------------------

/**
 * Idempotently upsert the registry rows from the adapter policies. Policy
 * fields are refreshed every call; runtime state (mode, lastSyncAt,
 * statusMessage) is never clobbered for rows that already exist.
 */
export async function ensureSourcesSeeded(): Promise<void> {
  for (const key of SOURCE_KEYS) {
    const policy = POLICIES[key];
    await db.sourceConnection.upsert({
      where: { key },
      create: {
        key,
        displayName: policy.displayName,
        sourceKind: policy.sourceKind,
        accessMode: policy.accessMode,
        actorModesJson: JSON.stringify(policy.actorModes),
        operationsJson: JSON.stringify(policy.operations),
        policyJson: JSON.stringify(policy),
        rankingPolicy: policy.rankingPolicy,
        rateLimitJson: JSON.stringify(policy.rateLimit),
        freshnessMaxHours: policy.freshness.maxAgeHours,
        mode: INITIAL_MODE[key],
        statusMessage: INITIAL_STATUS_MESSAGE[key] ?? null,
        evidenceUrl: policy.termsUrl ?? null,
      },
      update: {
        displayName: policy.displayName,
        sourceKind: policy.sourceKind,
        accessMode: policy.accessMode,
        actorModesJson: JSON.stringify(policy.actorModes),
        operationsJson: JSON.stringify(policy.operations),
        policyJson: JSON.stringify(policy),
        rankingPolicy: policy.rankingPolicy,
        rateLimitJson: JSON.stringify(policy.rateLimit),
        freshnessMaxHours: policy.freshness.maxAgeHours,
        evidenceUrl: policy.termsUrl ?? null,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Registry reads
// ---------------------------------------------------------------------------

function latestRunPerKey(runs: SourceRun[]): Map<string, SourceRun> {
  const latest = new Map<string, SourceRun>();
  for (const run of runs) {
    const current = latest.get(run.sourceKey);
    if (!current || run.startedAt > current.startedAt) latest.set(run.sourceKey, run);
  }
  return latest;
}

function toSourceDTO(row: SourceConnection, lastRun: SourceRun | undefined): SourceConnectionDTO {
  const policy: SourcePolicy | undefined = POLICIES[row.key as SourceKey] ?? undefined;
  const actorModes = parseJson(row.actorModesJson);
  const operations = parseJson(row.operationsJson);

  return {
    key: row.key,
    displayName: row.displayName,
    sourceKind: row.sourceKind,
    accessMode: row.accessMode,
    actorModes: Array.isArray(actorModes)
      ? actorModes.filter((x): x is string => typeof x === 'string')
      : [],
    operations: isRecord(operations) ? operations : {},
    rankingPolicy: row.rankingPolicy as SourceConnectionDTO['rankingPolicy'],
    mode: row.mode as SourceConnectionDTO['mode'],
    statusMessage: row.statusMessage,
    termsUrl: policy?.termsUrl ?? null,
    termsNotes: policy?.termsNotes ?? null,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastRun: lastRun
      ? {
          status: lastRun.status,
          mode: lastRun.mode,
          startedAt: lastRun.startedAt.toISOString(),
          fetched: lastRun.fetched,
          inserted: lastRun.inserted,
          updated: lastRun.updated,
          duplicates: lastRun.duplicates,
          message: lastRun.message,
        }
      : null,
    payout: {
      methodKnown: policy?.payout.methodKnown ?? false,
      methods: policy?.payout.methods,
      threshold: policy?.payout.threshold,
      fees: policy?.payout.fees,
      cadence: policy?.payout.cadence,
      evidenceUrl: policy?.payout.evidenceUrl,
    },
  };
}

export async function listSources(): Promise<SourceConnectionDTO[]> {
  await ensureSourcesSeeded();
  const [rows, runs] = await Promise.all([
    db.sourceConnection.findMany(),
    db.sourceRun.findMany({ orderBy: { startedAt: 'desc' } }),
  ]);
  const latest = latestRunPerKey(runs);
  const order = new Map(SOURCE_KEYS.map((key, index) => [key, index]));
  return rows
    .filter((row): row is SourceConnection & { key: SourceKey } =>
      SOURCE_KEYS.includes(row.key as SourceKey),
    )
    .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
    .map((row) => toSourceDTO(row, latest.get(row.key)));
}

/** Freshness metadata for opportunity status computation. */
export async function freshnessBySource(): Promise<Map<SourceKey, number>> {
  await ensureSourcesSeeded();
  const rows = await db.sourceConnection.findMany();
  const map = new Map<SourceKey, number>();
  for (const row of rows) {
    if (SOURCE_KEYS.includes(row.key as SourceKey)) {
      map.set(row.key as SourceKey, row.freshnessMaxHours || 24);
    }
  }
  return map;
}

export interface RegistryMeta {
  displayName: string;
  rankingPolicy: 'provider-order-only' | 'hop3-allowed' | 'none';
  freshnessMaxHours: number;
}

/** Registry metadata (display name, ranking policy, freshness) per source. */
export async function registryMeta(): Promise<Map<SourceKey, RegistryMeta>> {
  await ensureSourcesSeeded();
  const rows = await db.sourceConnection.findMany();
  const map = new Map<SourceKey, RegistryMeta>();
  for (const row of rows) {
    if (SOURCE_KEYS.includes(row.key as SourceKey)) {
      map.set(row.key as SourceKey, {
        displayName: row.displayName,
        rankingPolicy:
          row.rankingPolicy === 'provider-order-only' || row.rankingPolicy === 'none'
            ? row.rankingPolicy
            : 'hop3-allowed',
        freshnessMaxHours: row.freshnessMaxHours || 24,
      });
    }
  }
  return map;
}

/** Registry display name for a source key (evidence panel). */
export async function sourceDisplayName(key: SourceKey): Promise<string> {
  await ensureSourcesSeeded();
  const row = await db.sourceConnection.findUnique({ where: { key } });
  return row?.displayName ?? key;
}

// ---------------------------------------------------------------------------
// Dedupe-aware ingest (shared by sync + intake)
// ---------------------------------------------------------------------------

function listingExpiresAt(listing: RawListing): Date | null {
  if (typeof listing.expiresAt !== 'string' || listing.expiresAt.trim() === '') return null;
  const date = new Date(listing.expiresAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Content signature used only to distinguish "updated" from "duplicate". */
function listingSignature(listing: RawListing): string {
  return JSON.stringify([
    listing.title,
    listing.summary ?? null,
    listing.eligibility ?? null,
    listing.requirements ?? null,
    listing.compensation ?? null,
    listing.payout ?? null,
    listing.application ?? null,
    listing.time ?? null,
    listing.riskFlags ?? null,
    listing.workMode ?? null,
    listing.opportunityType ?? null,
  ]);
}

function rowSignature(row: {
  title: string;
  summary: string | null;
  eligibilityJson: string | null;
  requirementsJson: string | null;
  compensationJson: string | null;
  payoutJson: string | null;
  applicationJson: string | null;
  timeJson: string | null;
  riskFlagsJson: string | null;
  workMode: string | null;
  opportunityType: string | null;
}): string {
  const part = (value: string | null | undefined): unknown => {
    if (value == null || value.trim() === '') return null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  };
  return JSON.stringify([
    row.title,
    row.summary ?? null,
    part(row.eligibilityJson),
    part(row.requirementsJson),
    part(row.compensationJson),
    part(row.payoutJson),
    part(row.applicationJson),
    part(row.timeJson),
    part(row.riskFlagsJson),
    row.workMode ?? null,
    row.opportunityType ?? null,
  ]);
}

export interface IngestCounts {
  inserted: number;
  updated: number;
  duplicates: number;
}

/**
 * Persist normalized listings with (sourceKey, externalId) uniqueness.
 * Existing rows are refreshed (lastSeenAt/observedAt/expiresAt/specs); the
 * signature comparison separates "updated" from "duplicates" honestly.
 * Nothing is ever merged across sources.
 */
export async function ingestListings(listings: RawListing[]): Promise<IngestCounts> {
  let inserted = 0;
  let updated = 0;
  let duplicates = 0;

  for (const listing of listings) {
    const externalId = listing.externalId.trim();
    if (externalId === '') continue;

    const existing = await db.opportunity.findUnique({
      where: { sourceKey_externalId: { sourceKey: listing.sourceKey, externalId } },
    });

    if (existing) {
      const changed = rowSignature(existing) !== listingSignature(listing);
      await db.opportunity.update({
        where: { id: existing.id },
        data: {
          title: listing.title,
          summary: listing.summary ?? null,
          canonicalUrl: listing.canonicalUrl,
          platform: listing.platform,
          opportunityType: listing.opportunityType ?? null,
          workMode: listing.workMode ?? 'unknown',
          eligibilityJson: listing.eligibility ? JSON.stringify(listing.eligibility) : null,
          requirementsJson: listing.requirements ? JSON.stringify(listing.requirements) : null,
          compensationJson: listing.compensation ? JSON.stringify(listing.compensation) : null,
          payoutJson: listing.payout ? JSON.stringify(listing.payout) : null,
          applicationJson: listing.application ? JSON.stringify(listing.application) : null,
          timeJson: listing.time ? JSON.stringify(listing.time) : null,
          riskFlagsJson: listing.riskFlags ? JSON.stringify(listing.riskFlags) : null,
          sourceStatus: listing.sourceStatus ?? null,
          rawJson: listing.raw === undefined ? null : JSON.stringify(listing.raw),
          observedAt: new Date(listing.observedAt),
          lastSeenAt: new Date(),
          expiresAt: listingExpiresAt(listing),
          status: 'active', // re-observed now
        },
      });
      if (changed) updated += 1;
      else duplicates += 1;
      continue;
    }

    const observed = new Date(listing.observedAt);
    const firstSeen = Number.isNaN(observed.getTime()) ? new Date() : observed;
    await db.opportunity.create({
      data: {
        sourceKey: listing.sourceKey,
        sourceRecordId: listing.sourceRecordId || externalId,
        externalId,
        title: listing.title,
        summary: listing.summary ?? null,
        canonicalUrl: listing.canonicalUrl,
        platform: listing.platform,
        opportunityType: listing.opportunityType ?? null,
        workMode: listing.workMode ?? 'unknown',
        provenance: listing.provenance,
        eligibilityJson: listing.eligibility ? JSON.stringify(listing.eligibility) : null,
        requirementsJson: listing.requirements ? JSON.stringify(listing.requirements) : null,
        compensationJson: listing.compensation ? JSON.stringify(listing.compensation) : null,
        payoutJson: listing.payout ? JSON.stringify(listing.payout) : null,
        applicationJson: listing.application ? JSON.stringify(listing.application) : null,
        timeJson: listing.time ? JSON.stringify(listing.time) : null,
        riskFlagsJson: listing.riskFlags ? JSON.stringify(listing.riskFlags) : null,
        sourceStatus: listing.sourceStatus ?? null,
        rawJson: listing.raw === undefined ? null : JSON.stringify(listing.raw),
        firstSeenAt: firstSeen,
        lastSeenAt: new Date(),
        observedAt: Number.isNaN(observed.getTime()) ? new Date() : observed,
        expiresAt: listingExpiresAt(listing),
        status: 'active',
      },
    });
    inserted += 1;
  }

  return { inserted, updated, duplicates };
}

// ---------------------------------------------------------------------------
// Sync orchestration
// ---------------------------------------------------------------------------

/**
 * Run one source sync in the requested mode and persist everything honestly.
 * Throws Error with a human-readable message for invalid input (routes map
 * that to HTTP 400).
 */
export async function syncSource(key: SourceKey, mode: 'live' | 'sandbox'): Promise<IngestResult> {
  if (key === 'url_intake') {
    throw new Error(
      'Submitted links are added one at a time from the Sources tab (or POST /api/intake); they are not batch-synced.',
    );
  }
  const adapter = ADAPTERS[key];
  if (!adapter) {
    throw new Error(`Unknown source "${String(key)}"`);
  }

  const connection = await db.sourceConnection.findUnique({ where: { key } });
  const minRefreshMinutes =
    adapter.policy.freshness.minRefreshIntervalMinutes > 0
      ? adapter.policy.freshness.minRefreshIntervalMinutes
      : 0;

  // Respect the source's own rate-limit policy for live runs: a fresh
  // successful sync within the min refresh interval is politely refused.
  if (mode === 'live' && connection?.lastSyncAt) {
    const elapsedMinutes = (Date.now() - connection.lastSyncAt.getTime()) / 60_000;
    if (elapsedMinutes < minRefreshMinutes) {
      const wait = Math.max(1, Math.ceil(minRefreshMinutes - elapsedMinutes));
      const run = await db.sourceRun.create({
        data: {
          sourceKey: key,
          mode: 'live',
          status: 'blocked',
          startedAt: new Date(),
          finishedAt: new Date(),
          fetched: 0,
          inserted: 0,
          updated: 0,
          duplicates: 0,
          message: `Rate limit honored: this source asks for at least ${minRefreshMinutes} min between refreshes; try again in about ${wait} min (sandbox mode is always available).`,
        },
      });
      await db.sourceConnection.update({
        where: { key },
        data: {
          statusMessage: `Live sync refused by the rate-limit guard — retry in about ${wait} min. Sandbox sync is always available.`,
        },
      });
      return {
        sourceKey: key,
        runId: run.id,
        status: 'blocked',
        fetched: 0,
        inserted: 0,
        updated: 0,
        duplicates: 0,
        message: run.message ?? undefined,
      };
    }
  }

  const run = await db.sourceRun.create({
    data: { sourceKey: key, mode, status: 'running', startedAt: new Date() },
  });

  let result;
  try {
    result = await adapter.run({ mode });
  } catch (err) {
    // Adapters are expected to catch their own errors; this is a last-resort
    // honest failure record.
    const message = `Adapter crashed: ${err instanceof Error ? err.message : String(err)}`;
    await db.sourceRun.update({
      where: { id: run.id },
      data: {
        status: 'error',
        finishedAt: new Date(),
        fetched: 0,
        inserted: 0,
        updated: 0,
        duplicates: 0,
        message,
      },
    });
    await db.sourceConnection.update({
      where: { key },
      data: { statusMessage: message },
    });
    return {
      sourceKey: key,
      runId: run.id,
      status: 'error',
      fetched: 0,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      message,
    };
  }

  const counts = await ingestListings(result.listings);

  const status = result.status;
  await db.sourceRun.update({
    where: { id: run.id },
    data: {
      status,
      finishedAt: new Date(),
      fetched: result.listings.length,
      inserted: counts.inserted,
      updated: counts.updated,
      duplicates: counts.duplicates,
      message: result.message ?? null,
    },
  });

  await db.sourceConnection.update({
    where: { key },
    data: {
      lastSyncAt: new Date(),
      mode: status === 'blocked' ? 'blocked' : mode,
      statusMessage: result.message ?? null,
    },
  });

  return {
    sourceKey: key,
    runId: run.id,
    status,
    fetched: result.listings.length,
    inserted: counts.inserted,
    updated: counts.updated,
    duplicates: counts.duplicates,
    message: result.message,
  };
}

// ---------------------------------------------------------------------------
// URL intake (single user-submitted link)
// ---------------------------------------------------------------------------

export interface IntakeResult {
  opportunityId: string;
  created: boolean; // false when the same link was already recorded
  fetchNote: string;
}

/**
 * Ingest one user-submitted link: record it with provenance 'user-submitted',
 * attempt the polite public fetch for title/description, and log a SourceRun
 * for the url_intake source.
 */
export async function recordIntake(url: string, context?: string): Promise<IntakeResult> {
  await ensureSourcesSeeded();

  // Validate first: rejected links produce an honest 400 — they are NOT
  // recorded as opportunities (recording something we refused to fetch would
  // misrepresent it).
  const { ingestUserLink, assertPublicHttpUrl } = await import('@/lib/sources/url-intake');
  const guard = assertPublicHttpUrl(url);
  if (!guard.ok) {
    throw new Error(`The link was not recorded: ${guard.reason}`);
  }

  const outcome = await ingestUserLink(url, context);
  const listing = outcome.listing;

  const existing = await db.opportunity.findUnique({
    where: { sourceKey_externalId: { sourceKey: 'url_intake', externalId: listing.externalId } },
  });

  if (existing) {
    await db.opportunity.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        observedAt: new Date(listing.observedAt),
        summary: listing.summary,
        rawJson: listing.raw === undefined ? null : JSON.stringify(listing.raw),
      },
    });
    await db.sourceRun.create({
      data: {
        sourceKey: 'url_intake',
        mode: 'live',
        status: 'ok',
        startedAt: new Date(),
        finishedAt: new Date(),
        fetched: 1,
        inserted: 0,
        updated: 1,
        duplicates: 0,
        message: `Link already recorded — re-submitted and refreshed. ${outcome.fetchNote}`,
      },
    });
    await db.sourceConnection.update({
      where: { key: 'url_intake' },
      data: { lastSyncAt: new Date(), statusMessage: outcome.fetchNote },
    });
    return { opportunityId: existing.id, created: false, fetchNote: outcome.fetchNote };
  }

  const counts = await ingestListings([listing]);
  const row = await db.opportunity.findUnique({
    where: { sourceKey_externalId: { sourceKey: 'url_intake', externalId: listing.externalId } },
  });
  if (!row) {
    throw new Error('The link could not be recorded — ingest failed');
  }

  await db.sourceRun.create({
    data: {
      sourceKey: 'url_intake',
      mode: 'live',
      status: 'ok',
      startedAt: new Date(),
      finishedAt: new Date(),
      fetched: 1,
      inserted: counts.inserted,
      updated: counts.updated,
      duplicates: counts.duplicates,
      message: outcome.fetchNote,
    },
  });
  await db.sourceConnection.update({
    where: { key: 'url_intake' },
    data: { lastSyncAt: new Date(), statusMessage: outcome.fetchNote },
  });

  return { opportunityId: row.id, created: true, fetchNote: outcome.fetchNote };
}
