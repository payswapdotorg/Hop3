/**
 * Hop3 — Stage 1 Earn DTO 装配 — 参考实现 opportunity-service.ts /
 * profile-service.ts / application-service.ts 的行→DTO 映射半边。
 *
 * 诚实纪律（全部沿用参考语义）：
 *  - eligibility / economics 每次请求实时计算（从不缓存、从不落盘为主张）；
 *  - 新鲜度：expired（expiresAt 已过）> stale（lastSeenAt 超出来源自身
 *    freshnessMaxHours）> active；
 *  - duplicateCount 仅用于展示（crossSourceGroupKey），行永不合并或隐藏；
 *  - 供应方顺序保留：卡片按到达序（firstSeenAt asc），无任何 Hop3 排名。
 */

import type {
  ApplicationDTO,
  ApplicationStatus,
  EconomicsEstimate,
  EligibilityAssessment,
  OpportunityCardDTO,
  ProfileDTO,
  SourceKey,
} from "@zcode/shared";
import { TERMINAL_APPLICATION_STATUSES } from "./domain/lifecycle.js";
import { evaluateEligibility } from "./domain/eligibility.js";
import { computeEconomics, type EconomicsFacts } from "./domain/economics.js";
import { crossSourceGroupKey } from "./domain/dedupe.js";
import {
  asTrimmedString,
  parseApplicationSpec,
  parseCompensationSpec,
  parseEligibilitySpec,
  parsePayoutSpec,
  parseProfilePreferences,
  parseProfileEntries,
  parseRequirementsSpec,
  parseTimeSpec,
  profileEquipmentSchema,
  profileLanguageSchema,
  profilePayoutCapabilitySchema,
  profileQualificationSchema,
  profileSkillSchema,
} from "./earnValidation.js";
import type { EarnApplicationEventRow, EarnApplicationRow } from "./earnApplicationStore.js";
import type { EarnOpportunityRow } from "./earnOpportunityStore.js";
import type { EarnProfileRow } from "./earnProfileStore.js";
import type { EarnRepo } from "./earnRepo.js";

// ---------------------------------------------------------------------------
// Profile row -> DTO（防御式：坏条目丢弃，绝不猜测 —— 参考 mapProfileRow）
// ---------------------------------------------------------------------------

function mapProfileRow(row: EarnProfileRow): ProfileDTO {
  const languages = parseProfileEntries(row.languages_json, profileLanguageSchema)
    .map((item) => ({
      code: asTrimmedString(item.code) ?? "",
      proficiency: asTrimmedString(item.proficiency) ?? "",
      note: asTrimmedString(item.note),
    }))
    .filter((item) => item.code !== "");

  const skills = parseProfileEntries(row.skills_json, profileSkillSchema)
    .map((item) => ({
      name: asTrimmedString(item.name) ?? "",
      experienceBand: asTrimmedString(item.experienceBand) ?? "",
      evidenceNote: asTrimmedString(item.evidenceNote),
    }))
    .filter((item) => item.name !== "");

  const qualifications = parseProfileEntries(row.qualifications_json, profileQualificationSchema)
    .map((item) => ({
      type: asTrimmedString(item.type) ?? "",
      issuer: asTrimmedString(item.issuer),
      year: asTrimmedString(item.year),
      // "unverified" 是诚实缺省：没有任何东西被核实过。
      verificationState: asTrimmedString(item.verificationState) ?? "unverified",
    }))
    .filter((item) => item.type !== "");

  const preferencesRaw = parseProfilePreferences(row.preferences_json);
  const preferences = {
    includedFamilies: preferencesRaw.includedFamilies,
    excludedFamilies: preferencesRaw.excludedFamilies,
  };

  const equipment = parseProfileEntries(row.equipment_json, profileEquipmentSchema)
    .map((item) => ({
      kind: asTrimmedString(item.kind) ?? "",
      note: asTrimmedString(item.note),
    }))
    .filter((item) => item.kind !== "");

  const payoutCapabilities = parseProfileEntries(row.payout_capabilities_json, profilePayoutCapabilitySchema)
    .map((item) => ({
      rail: asTrimmedString(item.rail) ?? "",
      status: item.status,
      note: asTrimmedString(item.note),
    }))
    .filter((item) => item.rail !== "");

  return {
    id: row.id,
    schemaVersion: row.schema_version,
    displayName: row.display_name,
    countryCode: row.country_code,
    regionNote: row.region_note,
    workMode: row.work_mode || "any",
    languages,
    skills,
    qualifications,
    preferences,
    weeklyHours: row.weekly_hours,
    timezone: row.timezone,
    equipment,
    incomeGoalAmount: row.income_goal_amount ?? null,
    incomeGoalCurrency: row.income_goal_currency || "USD",
    payoutCapabilities,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Opportunity row facts（领域引擎输入；zod 校验后的 spec 读取）
// ---------------------------------------------------------------------------

/** 行事实（领域引擎输入）：JSON 列经 zod 校验，坏值降级为缺失。 */
export function rowFacts(row: EarnOpportunityRow): EconomicsFacts {
  return {
    sourceKey: row.source_key as SourceKey,
    platform: row.platform,
    eligibility: parseEligibilitySpec(row.eligibility_json),
    requirements: parseRequirementsSpec(row.requirements_json),
    compensation: parseCompensationSpec(row.compensation_json),
    payout: parsePayoutSpec(row.payout_json),
    application: parseApplicationSpec(row.application_json),
    time: parseTimeSpec(row.time_json),
    workMode: row.work_mode ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// 新鲜度（DOMAIN-MODEL §4）
// ---------------------------------------------------------------------------

function computedStatus(
  row: EarnOpportunityRow,
  freshnessMaxHours: number,
): "active" | "stale" | "expired" {
  const now = Date.now();
  if (row.expires_at !== null && row.expires_at < now) return "expired";
  const maxAgeMs = Math.max(1, freshnessMaxHours) * 3_600_000;
  if (row.last_seen_at < now - maxAgeMs) return "stale";
  return row.status === "expired" || row.status === "stale" ? (row.status as "expired" | "stale") : "active";
}

// ---------------------------------------------------------------------------
// 跨源分组（仅展示计数，绝不合并）
// ---------------------------------------------------------------------------

function groupKeyFor(row: EarnOpportunityRow): string {
  const facts = rowFacts(row);
  const countries = [...(facts.eligibility?.countries ?? [])]
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c !== "")
    .sort()
    .join(",");
  const grossMax =
    facts.compensation?.grossMax !== undefined && Number.isFinite(facts.compensation?.grossMax)
      ? facts.compensation.grossMax
      : undefined;
  return crossSourceGroupKey({
    title: row.title,
    platform: row.platform,
    opportunityType: row.opportunity_type ?? undefined,
    country: countries,
    grossMax,
  });
}

// ---------------------------------------------------------------------------
// DTO 上下文 + 卡片装配
// ---------------------------------------------------------------------------

export interface RegistryMeta {
  displayName: string;
  rankingPolicy: "provider-order-only" | "hop3-allowed" | "none";
  freshnessMaxHours: number;
}

export interface DtoContext {
  profile: ProfileDTO | null;
  meta: Map<SourceKey, RegistryMeta>;
  savedIds: Set<string>;
  savedNotes: Map<string, string | null>;
  applicationStatus: Map<string, string>;
  duplicateCounts: Map<string, number>;
}

/** 每机会的展示状态：优先最新非终态申请（参考 statusFromApps）。 */
function statusFromApps(apps: Array<{ status: string; created_at: number }> | undefined): string | undefined {
  if (!apps || apps.length === 0) return undefined;
  const terminal = (status: string): boolean =>
    TERMINAL_APPLICATION_STATUSES.includes(status as never);
  const sorted = [...apps].sort((a, b) => b.created_at - a.created_at);
  const nonTerminal = sorted.find((app) => !terminal(app.status));
  const chosen = nonTerminal ?? sorted[0];
  return chosen?.status;
}

function toCardDto(
  row: EarnOpportunityRow,
  ctx: DtoContext,
): OpportunityCardDTO & { savedNotes?: string | null } {
  const facts = rowFacts(row);
  const eligibility: EligibilityAssessment = evaluateEligibility(ctx.profile, facts);
  const economics: EconomicsEstimate = computeEconomics(facts, ctx.profile);
  const meta = ctx.meta.get(row.source_key as SourceKey);

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    platform: row.platform,
    sourceKey: row.source_key as SourceKey,
    provenance: row.provenance as OpportunityCardDTO["provenance"],
    canonicalUrl: row.canonical_url,
    opportunityType: row.opportunity_type,
    workMode: row.work_mode,
    status: computedStatus(row, meta?.freshnessMaxHours ?? 24),
    firstSeenAt: new Date(row.first_seen_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    observedAt: new Date(row.observed_at).toISOString(),
    expiresAt: row.expires_at !== null ? new Date(row.expires_at).toISOString() : null,
    eligibility,
    economics,
    saved: ctx.savedIds.has(row.id),
    applicationStatus:
      (ctx.applicationStatus.get(row.id) as OpportunityCardDTO["applicationStatus"]) ?? null,
    duplicateCount: ctx.duplicateCounts.get(row.id) ?? 0,
    rankingPolicy: meta?.rankingPolicy ?? "hop3-allowed",
    savedNotes: ctx.savedNotes.get(row.id) ?? null,
  };
}

/** 一次性装配列表/详情共用的 DTO 上下文（参考 buildDtoContext）。 */
export async function buildDtoContext(repo: EarnRepo): Promise<DtoContext> {
  await repo.ensureReady();
  const [profileRow, connectionRows, savedRows, appRows, opportunityRows] = [
    repo.profile.getProfileRow(),
    repo.sources.listSourceConnectionRows(),
    repo.opportunities.listSavedRows(),
    repo.applications.listApplicationStatusLite(),
    repo.opportunities.listOpportunityRows(),
  ];

  const profile = profileRow ? mapProfileRow(profileRow) : null;

  const meta = new Map<SourceKey, RegistryMeta>();
  for (const row of connectionRows) {
    meta.set(row.key as SourceKey, {
      displayName: row.display_name,
      rankingPolicy:
        row.ranking_policy === "provider-order-only" || row.ranking_policy === "none"
          ? row.ranking_policy
          : "hop3-allowed",
      freshnessMaxHours: row.freshness_max_hours || 24,
    });
  }

  const savedIds = new Set<string>();
  const savedNotes = new Map<string, string | null>();
  for (const saved of savedRows) {
    savedIds.add(saved.opportunity_id);
    savedNotes.set(saved.opportunity_id, saved.notes ?? null);
  }

  const appsByOpp = new Map<string, Array<{ status: string; created_at: number }>>();
  for (const app of appRows) {
    const list = appsByOpp.get(app.opportunity_id) ?? [];
    list.push({ status: app.status, created_at: app.created_at });
    appsByOpp.set(app.opportunity_id, list);
  }
  const applicationStatus = new Map<string, string>();
  for (const [opportunityId, apps] of appsByOpp) {
    const status = statusFromApps(apps);
    if (status) applicationStatus.set(opportunityId, status);
  }

  // 展示用重复分组计数：组大小 > 1 时计组大小 - 1（其余记录数，绝不合并）。
  const duplicateCounts = new Map<string, number>();
  const groups = new Map<string, number>();
  for (const row of opportunityRows) {
    const key = groupKeyFor(row);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  for (const row of opportunityRows) {
    const groupSize = groups.get(groupKeyFor(row)) ?? 1;
    if (groupSize > 1) duplicateCounts.set(row.id, groupSize - 1);
  }

  return { profile, meta, savedIds, savedNotes, applicationStatus, duplicateCounts };
}

export { mapProfileRow, toCardDto, computedStatus, groupKeyFor, statusFromApps };

// ---------------------------------------------------------------------------
// Application row -> DTO（事件按 createdAt 升序）
// ---------------------------------------------------------------------------

export function toApplicationDto(
  row: EarnApplicationRow,
  events: EarnApplicationEventRow[],
  opportunity: { title: string; platform: string; canonical_url: string },
): ApplicationDTO {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    opportunityTitle: opportunity.title,
    platform: opportunity.platform,
    canonicalUrl: opportunity.canonical_url,
    status: row.status as ApplicationStatus,
    draft: row.draft,
    draftGeneratedAt: row.draft_generated_at !== null ? new Date(row.draft_generated_at).toISOString() : null,
    draftModel: row.draft_model,
    draftEditedByUser: row.draft_edited_by_user === 1,
    submittedAt: row.submitted_at !== null ? new Date(row.submitted_at).toISOString() : null,
    submittedChannel: row.submitted_channel,
    submittedEvidence: row.submitted_evidence,
    acceptedAt: row.accepted_at !== null ? new Date(row.accepted_at).toISOString() : null,
    completedAt: row.completed_at !== null ? new Date(row.completed_at).toISOString() : null,
    approvedAt: row.approved_at !== null ? new Date(row.approved_at).toISOString() : null,
    paidAt: row.paid_at !== null ? new Date(row.paid_at).toISOString() : null,
    amountPaid: row.amount_paid,
    paidCurrency: row.paid_currency,
    paymentEvidence: row.payment_evidence,
    outcomeNotes: row.outcome_notes,
    events: events.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      evidenceType: event.evidence_type,
      evidenceUrl: event.evidence_url,
      note: event.note,
      createdAt: new Date(event.created_at).toISOString(),
    })),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
