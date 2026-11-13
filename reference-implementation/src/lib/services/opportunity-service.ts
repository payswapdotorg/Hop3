/**
 * Hop3 — Stage 1 opportunity read/DTO service (Worker B).
 *
 * Implements DOMAIN-MODEL sections 1.2–1.5 on the read path against the
 * frozen contracts:
 *  - Eligibility and economics are computed LIVE on every request (never
 *    cached, never persisted as claims) from listing facts + the profile.
 *  - Freshness: expired (expiresAt passed) > stale (lastSeenAt older than the
 *    source's own freshnessMaxHours) > active.
 *  - Duplicate grouping is display-only (crossSourceGroupKey); rows are never
 *    merged or hidden.
 *  - Provider order is preserved: cards are returned in arrival order
 *    (firstSeenAt asc) and no Hop3 ranking/sorting is applied.
 *
 * Node runtime only (route handlers). No 'use client'.
 */

import { db } from '@/lib/db';
import type { Opportunity as OpportunityRow } from '@prisma/client';
import {
  type ApplicationSpec,
  type CompensationSpec,
  type EconomicsEstimate,
  type EligibilityAssessment,
  type EligibilitySpec,
  type OpportunityCardDTO,
  type PayoutSpec,
  type ProfileDTO,
  type RequirementsSpec,
  type SourceKey,
  type TimeSpec,
} from '@/lib/contracts';
import { TERMINAL_APPLICATION_STATUSES } from '@/lib/domain/lifecycle';
import { evaluateEligibility, type OpportunityFacts } from '@/lib/domain/eligibility';
import { computeEconomics } from '@/lib/domain/economics';
import { crossSourceGroupKey } from '@/lib/domain/dedupe';
import { getProfile } from '@/lib/services/profile-service';
import { registryMeta } from '@/lib/services/source-service';

// ---------------------------------------------------------------------------
// Defensive JSON parsing (SQLite stores structured payloads as Strings)
// ---------------------------------------------------------------------------

function parseSpec<T>(value: string | null | undefined): T | undefined {
  if (value == null || value.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === 'object') return parsed as T;
    return undefined;
  } catch {
    return undefined;
  }
}

/** Row facts for the domain engines (eligibility + economics). */
function rowFacts(row: OpportunityRow): OpportunityFacts & {
  compensation?: CompensationSpec;
  application?: ApplicationSpec;
  time?: TimeSpec;
} {
  return {
    sourceKey: row.sourceKey as SourceKey,
    platform: row.platform,
    eligibility: parseSpec<EligibilitySpec>(row.eligibilityJson),
    requirements: parseSpec<RequirementsSpec>(row.requirementsJson),
    compensation: parseSpec<CompensationSpec>(row.compensationJson),
    payout: parseSpec<PayoutSpec>(row.payoutJson),
    application: parseSpec<ApplicationSpec>(row.applicationJson),
    time: parseSpec<TimeSpec>(row.timeJson),
    workMode: row.workMode ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Freshness (DOMAIN-MODEL section 4: freshness/lifecycle of listings)
// ---------------------------------------------------------------------------

function computedStatus(row: OpportunityRow, freshnessMaxHours: number): 'active' | 'stale' | 'expired' {
  const now = Date.now();
  if (row.expiresAt && row.expiresAt.getTime() < now) return 'expired';
  const maxAgeMs = Math.max(1, freshnessMaxHours) * 3_600_000;
  if (row.lastSeenAt.getTime() < now - maxAgeMs) return 'stale';
  return row.status === 'expired' || row.status === 'stale' ? row.status : 'active';
}

// ---------------------------------------------------------------------------
// Duplicate grouping (display-only)
// ---------------------------------------------------------------------------

function groupKeyFor(row: OpportunityRow): string {
  const facts = rowFacts(row);
  const countries = [...(facts.eligibility?.countries ?? [])]
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c !== '')
    .sort()
    .join(',');
  const grossMax =
    facts.compensation?.grossMax !== undefined && Number.isFinite(facts.compensation?.grossMax)
      ? facts.compensation.grossMax
      : undefined;
  return crossSourceGroupKey({
    title: row.title,
    platform: row.platform,
    opportunityType: row.opportunityType ?? undefined,
    country: countries,
    grossMax,
  });
}

// ---------------------------------------------------------------------------
// Application status per opportunity (latest non-terminal preferred)
// ---------------------------------------------------------------------------

interface AppLite {
  status: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// DTO assembly
// ---------------------------------------------------------------------------

interface DtoContext {
  profile: ProfileDTO | null;
  meta: Map<SourceKey, { displayName: string; rankingPolicy: 'provider-order-only' | 'hop3-allowed' | 'none'; freshnessMaxHours: number }>;
  savedIds: Set<string>;
  savedNotes: Map<string, string | null>;
  applicationStatus: Map<string, string>;
  duplicateCounts: Map<string, number>;
}

function statusFromApps(apps: AppLite[] | undefined): string | undefined {
  if (!apps || apps.length === 0) return undefined;
  const terminal = (status: string): boolean => TERMINAL_APPLICATION_STATUSES.includes(status as never);
  const sorted = [...apps].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const nonTerminal = sorted.find((app) => !terminal(app.status));
  const chosen = nonTerminal ?? sorted[0];
  return chosen.status;
}

function toCardDto(row: OpportunityRow, ctx: DtoContext): OpportunityCardDTO & { savedNotes?: string | null } {
  const facts = rowFacts(row);
  const eligibility: EligibilityAssessment = evaluateEligibility(ctx.profile, facts);
  const economics: EconomicsEstimate = computeEconomics(facts, ctx.profile);
  const meta = ctx.meta.get(row.sourceKey as SourceKey);
  const saved = ctx.savedIds.has(row.id);

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    platform: row.platform,
    sourceKey: row.sourceKey as SourceKey,
    provenance: row.provenance as OpportunityCardDTO['provenance'],
    canonicalUrl: row.canonicalUrl,
    opportunityType: row.opportunityType,
    workMode: row.workMode,
    status: computedStatus(row, meta?.freshnessMaxHours ?? 24),
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    observedAt: row.observedAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    eligibility,
    economics,
    saved,
    applicationStatus:
      (ctx.applicationStatus.get(row.id) as OpportunityCardDTO['applicationStatus']) ?? null,
    duplicateCount: ctx.duplicateCounts.get(row.id) ?? 0,
    rankingPolicy: meta?.rankingPolicy ?? 'hop3-allowed',
    savedNotes: ctx.savedNotes.get(row.id) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public service API
// ---------------------------------------------------------------------------

export interface OpportunityFilters {
  source?: string;
  eligibility?: string;
  status?: string;
  q?: string;
}

async function buildDtoContext(): Promise<DtoContext> {
  const [profile, meta, savedRows, appRows] = await Promise.all([
    getProfile(),
    registryMeta(),
    db.savedOpportunity.findMany(),
    db.application.findMany({
      select: { opportunityId: true, status: true, createdAt: true },
    }),
  ]);

  const savedIds = new Set<string>();
  const savedNotes = new Map<string, string | null>();
  for (const saved of savedRows) {
    savedIds.add(saved.opportunityId);
    savedNotes.set(saved.opportunityId, saved.notes ?? null);
  }

  const appsByOpp = new Map<string, AppLite[]>();
  for (const app of appRows) {
    const list = appsByOpp.get(app.opportunityId) ?? [];
    list.push({ status: app.status, createdAt: app.createdAt });
    appsByOpp.set(app.opportunityId, list);
  }
  const applicationStatus = new Map<string, string>();
  for (const [opportunityId, apps] of appsByOpp) {
    const status = statusFromApps(apps);
    if (status) applicationStatus.set(opportunityId, status);
  }

  const duplicateCounts = new Map<string, number>();
  const rows = await db.opportunity.findMany();
  const groups = new Map<string, number>();
  for (const row of rows) {
    const key = groupKeyFor(row);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  for (const row of rows) {
    const groupSize = groups.get(groupKeyFor(row)) ?? 1;
    if (groupSize > 1) duplicateCounts.set(row.id, groupSize - 1);
  }

  return { profile, meta, savedIds, savedNotes, applicationStatus, duplicateCounts };
}

/**
 * List opportunities with user-chosen filters only. Arrival order
 * (firstSeenAt asc) is preserved — no Hop3 ranking is ever applied.
 */
export async function listOpportunities(filters: OpportunityFilters = {}): Promise<(OpportunityCardDTO & { savedNotes?: string | null })[]> {
  const ctx = await buildDtoContext();
  const rows = await db.opportunity.findMany({ orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }] });

  const q = filters.q?.trim().toLowerCase() ?? '';
  let dtos = rows.map((row) => toCardDto(row, ctx));

  if (filters.source && filters.source !== 'all') {
    dtos = dtos.filter((dto) => dto.sourceKey === filters.source);
  }
  if (filters.eligibility && filters.eligibility !== 'all') {
    dtos = dtos.filter((dto) => dto.eligibility.overall === filters.eligibility);
  }
  if (filters.status && filters.status !== 'all') {
    dtos = dtos.filter((dto) => dto.status === filters.status);
  }
  if (q !== '') {
    dtos = dtos.filter((dto) =>
      `${dto.title} ${dto.summary ?? ''} ${dto.platform}`.toLowerCase().includes(q),
    );
  }

  return dtos;
}

export interface OpportunityDetailResult {
  dto: OpportunityCardDTO & {
    savedNotes?: string | null;
    eligibilitySpec?: EligibilitySpec;
    requirementsSpec?: RequirementsSpec;
    compensationSpec?: CompensationSpec;
    payoutSpec?: PayoutSpec;
    applicationSpec?: ApplicationSpec;
    timeSpec?: TimeSpec;
    riskFlags?: string[];
    raw?: unknown;
    evidence?: {
      platform?: string | null;
      canonicalUrl?: string | null;
      sourceName?: string | null;
      sourceRecordId?: string | null;
      sourceStatus?: string | null;
      observedAt?: string | null;
      firstSeenAt?: string | null;
      lastSeenAt?: string | null;
    };
  };
}

/** Full detail: card fields + normalized specs + evidence + raw payload. */
export async function getOpportunityDetail(id: string): Promise<OpportunityDetailResult | null> {
  const row = await db.opportunity.findUnique({
    where: { id },
    include: { savedRecord: true },
  });
  if (!row) return null;

  const ctx = await buildDtoContext();
  const facts = rowFacts(row);
  const meta = ctx.meta.get(row.sourceKey as SourceKey);

  const dto = toCardDto(row, ctx);
  const detail = {
    ...dto,
    saved: row.savedRecord !== null,
    savedNotes: row.savedRecord?.notes ?? null,
    eligibilitySpec: facts.eligibility,
    requirementsSpec: facts.requirements,
    compensationSpec: facts.compensation,
    payoutSpec: facts.payout,
    applicationSpec: facts.application,
    timeSpec: facts.time,
    riskFlags: parseSpec<string[]>(row.riskFlagsJson) ?? [],
    raw: row.rawJson ? parseSpec<unknown>(row.rawJson) : undefined,
    evidence: {
      platform: row.platform,
      canonicalUrl: row.canonicalUrl,
      sourceName: meta?.displayName ?? row.sourceKey,
      sourceRecordId: row.sourceRecordId,
      sourceStatus: row.sourceStatus,
      observedAt: row.observedAt.toISOString(),
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
    },
  };

  return { dto: detail };
}

/** Save or unsave an opportunity (DOMAIN-MODEL 1.6 saved items). */
export async function toggleSaved(id: string, saved: boolean): Promise<boolean> {
  const row = await db.opportunity.findUnique({ where: { id }, include: { savedRecord: true } });
  if (!row) return false;

  if (saved && !row.savedRecord) {
    await db.savedOpportunity.create({ data: { opportunityId: id } });
  } else if (!saved && row.savedRecord) {
    await db.savedOpportunity.delete({ where: { id: row.savedRecord.id } });
  } else if (saved && row.savedRecord) {
    await db.savedOpportunity.update({ where: { id: row.savedRecord.id }, data: { savedAt: new Date() } });
  }
  return true;
}

/** Update private notes on a saved item (creates the saved record if missing). */
export async function setSavedNotes(id: string, notes: string): Promise<boolean> {
  const row = await db.opportunity.findUnique({ where: { id }, include: { savedRecord: true } });
  if (!row) return false;

  const trimmed = notes.trim() === '' ? null : notes.trim().slice(0, 5000);
  if (row.savedRecord) {
    await db.savedOpportunity.update({ where: { id: row.savedRecord.id }, data: { notes: trimmed } });
  } else {
    await db.savedOpportunity.create({ data: { opportunityId: id, notes: trimmed } });
  }
  return true;
}
