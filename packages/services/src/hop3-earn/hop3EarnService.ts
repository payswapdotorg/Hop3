/**
 * Hop3 — `createEarnService()` 工厂：IEarnService（15 方法）的完整实现。
 *
 * 四个参考 service 文件（profile / source / opportunity / application）的
 * 逻辑在此及 earnSourceOps / earnApplications / earnDto 中对
 * `EarnRepo` + domain 引擎 + source 适配器重表达；诚实纪律全部保留：
 *  - 列表永不按 Hop3 排名重排（firstSeenAt asc / 供应方顺序）；
 *  - 变更方法的失败以 { ok:false, error } 返回诚实原因，不跨通道抛 raw error
 *    （upsertProfile 与 recordIntake 的受控 rejection 例外见方法注释）；
 *  - prepareDraft 只产出预填材料 —— 模块内不存在任何发送路径。
 *
 * 冻结契约：packages/shared/src/hop3-earn（修改走 TL）。
 */

import {
  type EarnProfileInput,
  type IntakeResult,
  type IngestResult,
  type OpportunityDetail,
  type OpportunityFilters,
  type ProfileDTO,
  type RecordEventInput,
  type SourceKey,
} from "@zcode/shared";
import type { IEarnService } from "./hop3Earn.js";
import { EarnRepo } from "./earnRepo.js";
import type { EarnProfileWrite } from "./earnProfileStore.js";
import { buildDtoContext, mapProfileRow, rowFacts, toCardDto } from "./earnDto.js";
import {
  listSources,
  recordIntake,
  syncSource,
} from "./earnSourceOps.js";
import {
  createApplication,
  listApplications,
  markPrepared,
  prepareDraft,
  recordEvent,
  saveDraft,
} from "./earnApplications.js";
import {
  earnProfileInputSchema,
  formatZodError,
  parseApplicationSpec,
  parseCompensationSpec,
  parseEligibilitySpec,
  parsePayoutSpec,
  parseRawPayload,
  parseRequirementsSpec,
  parseRiskFlags,
  parseTimeSpec,
} from "./earnValidation.js";

export interface CreateEarnServiceOptions {
  /** 持久化仓库；缺省时自建（生产注册建议显式传入以便统一 close）。 */
  repo?: EarnRepo;
}

// ---------------------------------------------------------------------------
// profile
// ---------------------------------------------------------------------------

async function getProfile(repo: EarnRepo): Promise<ProfileDTO | null> {
  await repo.ensureReady();
  const row = repo.profile.getProfileRow();
  return row ? mapProfileRow(row) : null;
}

/**
 * 校验并整份替换唯一 worker profile（全量替换语义；consent 列不受影响）。
 * 非法输入以受控 rejection 携带诚实校验消息（冻结契约允许的唯一例外），
 * 不跨通道抛 raw error。
 */
async function upsertProfile(repo: EarnRepo, input: EarnProfileInput): Promise<ProfileDTO> {
  const parsed = earnProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid worker profile: ${formatZodError(parsed.error)}`);
  }
  const profile = parsed.data;

  await repo.ensureReady();
  const write: EarnProfileWrite = {
    schemaVersion: 1,
    displayName: profile.displayName ?? null,
    countryCode: profile.countryCode ?? null,
    regionNote: profile.regionNote ?? null,
    workMode: profile.workMode,
    languagesJson: JSON.stringify(profile.languages),
    skillsJson: JSON.stringify(profile.skills),
    qualificationsJson: JSON.stringify(profile.qualifications),
    preferencesJson: JSON.stringify(profile.preferences),
    weeklyHours: profile.weeklyHours,
    timezone: profile.timezone ?? null,
    equipmentJson: JSON.stringify(profile.equipment),
    incomeGoalAmount: profile.incomeGoalAmount ?? null,
    incomeGoalCurrency: profile.incomeGoalCurrency,
    payoutCapabilitiesJson: JSON.stringify(profile.payoutCapabilities),
  };
  const row = repo.profile.upsertProfileRow(write);
  return mapProfileRow(row);
}

// ---------------------------------------------------------------------------
// opportunities
// ---------------------------------------------------------------------------

/**
 * 收件箱列表：只接受用户筛选条件，永不做 Hop3 排名
 * （到达序 firstSeenAt asc 已由存储保证）。
 */
async function listOpportunities(
  repo: EarnRepo,
  filters: OpportunityFilters = {},
): Promise<Array<Awaited<ReturnType<IEarnService["listOpportunities"]>>[number]>> {
  const ctx = await buildDtoContext(repo);
  const rows = repo.opportunities.listOpportunityRows();

  const q = filters.q?.trim().toLowerCase() ?? "";
  let dtos = rows.map((row) => toCardDto(row, ctx));

  if (filters.source && filters.source !== "all") {
    dtos = dtos.filter((dto) => dto.sourceKey === filters.source);
  }
  if (filters.eligibility && filters.eligibility !== "all") {
    dtos = dtos.filter((dto) => dto.eligibility.overall === filters.eligibility);
  }
  if (filters.status && filters.status !== "all") {
    dtos = dtos.filter((dto) => dto.status === filters.status);
  }
  if (q !== "") {
    dtos = dtos.filter((dto) =>
      `${dto.title} ${dto.summary ?? ""} ${dto.platform}`.toLowerCase().includes(q),
    );
  }

  return dtos;
}

/** 全量详情：卡片字段 + 归一化 specs + 证据 + raw payload。 */
async function getOpportunityDetail(repo: EarnRepo, id: string): Promise<OpportunityDetail | null> {
  await repo.ensureReady();
  const row = repo.opportunities.getOpportunityRow(id);
  if (!row) return null;

  const ctx = await buildDtoContext(repo);
  const facts = rowFacts(row);
  const meta = ctx.meta.get(row.source_key as SourceKey);

  const dto = toCardDto(row, ctx);
  const savedRecord = repo.opportunities.getSavedRowByOpportunityId(row.id);

  return {
    ...dto,
    saved: savedRecord !== null,
    savedNotes: savedRecord?.notes ?? null,
    eligibilitySpec: facts.eligibility,
    requirementsSpec: facts.requirements,
    compensationSpec: facts.compensation,
    payoutSpec: facts.payout,
    applicationSpec: facts.application,
    timeSpec: facts.time,
    riskFlags: parseRiskFlags(row.risk_flags_json) ?? [],
    raw: row.raw_json !== null ? parseRawPayload(row.raw_json) : undefined,
    evidence: {
      platform: row.platform,
      canonicalUrl: row.canonical_url,
      sourceName: meta?.displayName ?? row.source_key,
      sourceRecordId: row.source_record_id,
      sourceStatus: row.source_status,
      observedAt: new Date(row.observed_at).toISOString(),
      firstSeenAt: new Date(row.first_seen_at).toISOString(),
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
    },
  };
}

/** 加入/移出保存夹（DOMAIN-MODEL 1.6 saved items）。 */
async function toggleSaved(repo: EarnRepo, id: string, saved: boolean): Promise<boolean> {
  await repo.ensureReady();
  const row = repo.opportunities.getOpportunityRow(id);
  if (!row) return false;

  const savedRecord = repo.opportunities.getSavedRowByOpportunityId(id);
  if (saved && !savedRecord) {
    repo.opportunities.insertSavedRow(id);
  } else if (!saved && savedRecord) {
    repo.opportunities.deleteSavedRow(savedRecord.id);
  } else if (saved && savedRecord) {
    repo.opportunities.touchSavedRow(savedRecord.id);
  }
  return true;
}

/** 更新保存夹私人备注（不存在时顺带建保存记录）。 */
async function setSavedNotes(repo: EarnRepo, id: string, notes: string): Promise<boolean> {
  await repo.ensureReady();
  const row = repo.opportunities.getOpportunityRow(id);
  if (!row) return false;

  const trimmed = notes.trim() === "" ? null : notes.trim().slice(0, 5000);
  const savedRecord = repo.opportunities.getSavedRowByOpportunityId(id);
  if (savedRecord) {
    repo.opportunities.updateSavedNotes(savedRecord.id, trimmed);
  } else {
    repo.opportunities.insertSavedRow(id, trimmed);
  }
  return true;
}

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

/**
 * 构造 IEarnService 实例。Node-only（node.ts 注册）；renderer 经
 * ProxyChannel 直连（offPeakTask 同款范式）。
 */
export function createEarnService(options: CreateEarnServiceOptions = {}): IEarnService {
  const repo = options.repo ?? new EarnRepo();
  return {
    // -- profile ---------------------------------------------------------------
    getProfile: () => getProfile(repo),
    upsertProfile: (input: EarnProfileInput) => upsertProfile(repo, input),

    // -- sources ---------------------------------------------------------------
    listSources: () => listSources(repo),
    syncSource: (key: SourceKey, mode: "live" | "sandbox"): Promise<IngestResult> =>
      syncSource(repo, key, mode),
    recordIntake: (url: string, context?: string): Promise<IntakeResult> =>
      recordIntake(repo, url, context),

    // -- opportunities -----------------------------------------------------------
    listOpportunities: (filters?: OpportunityFilters) => listOpportunities(repo, filters ?? {}),
    getOpportunityDetail: (id: string) => getOpportunityDetail(repo, id),
    toggleSaved: (id: string, saved: boolean) => toggleSaved(repo, id, saved),
    setSavedNotes: (id: string, notes: string) => setSavedNotes(repo, id, notes),

    // -- applications -------------------------------------------------------------
    listApplications: () => listApplications(repo),
    createApplication: (opportunityId: string) => createApplication(repo, opportunityId),
    prepareDraft: (id: string) => prepareDraft(repo, id),
    saveDraft: (id: string, draft: string) => saveDraft(repo, id, draft),
    recordEvent: (id: string, input: RecordEventInput) => recordEvent(repo, id, input),
    markPrepared: (id: string) => markPrepared(repo, id),
  };
}
