/**
 * Hop3 — Stage 1 申请/结果追踪 — 参考实现 application-service.ts 的重表达
 * （IEarnService 冻结契约的 applications 六方法）。
 *
 * DOMAIN-MODEL 1.6 + §2 的非协商纪律（全部沿用）：
 *  - 创建 tracker 永不提交任何东西；材料只由真实 profile 事实生成
 *    （缺的保持缺失，不捏造经历/评分/收入）；
 *  - 草稿生成是确定性规则模板（draftModel 'hop3-stage1-rules-v1'）——
 *    透明、无模型猜测；
 *  - 生命周期迁移走 domain/lifecycle.canTransition（顺序 + 证据门控），
 *    每次迁移追加 ApplicationEvent 行，结果历史可审计；
 *  - 'paid' 只能来自用户提供的金额 + 证据。
 */

import { randomUUID } from "node:crypto";
import {
  APPLICATION_STATUS_ORDER,
  NO_AUTO_SUBMIT_NOTICE,
  type ApplicationDraftContent,
  type ApplicationDTO,
  type ApplicationMutationResult,
  type ProfileDTO,
  type RecordEventInput,
} from "@zcode/shared";
import {
  applyTransitionFields,
  canTransition,
  type TransitionEvidence,
} from "./domain/lifecycle.js";
import { toApplicationDto, mapProfileRow } from "./earnDto.js";
import {
  draftContentSchema,
  parseApplicationSpec,
  parseCompensationSpec,
  parseRequirementsSpec,
  recordEventSchema,
  formatZodError,
} from "./earnValidation.js";
import type { EarnRepo } from "./earnRepo.js";
import type { ApplicationFieldWrite } from "./earnApplicationStore.js";
import type { EarnOpportunityRow } from "./earnOpportunityStore.js";

const KNOWN_STATUS_EVENTS = new Set<string>([
  ...APPLICATION_STATUS_ORDER,
  "rejected",
  "withdrawn",
  "expired",
  "blocked",
]);

// ---------------------------------------------------------------------------
// 行读取
// ---------------------------------------------------------------------------

async function getApplicationDto(repo: EarnRepo, id: string): Promise<ApplicationDTO | null> {
  await repo.ensureReady();
  const row = repo.applications.getApplicationRow(id);
  if (!row) return null;
  const events = repo.applications.listApplicationEventRows(id);
  const opportunity = repo.opportunities.getOpportunityRow(row.opportunity_id);
  if (!opportunity) return null;
  return toApplicationDto(row, events, opportunity);
}

export async function listApplications(repo: EarnRepo): Promise<ApplicationDTO[]> {
  await repo.ensureReady();
  const rows = repo.applications.listApplicationRows();
  const events = repo.applications.listApplicationEventRows();
  const eventsByApp = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByApp.get(event.application_id) ?? [];
    list.push(event);
    eventsByApp.set(event.application_id, list);
  }
  const out: ApplicationDTO[] = [];
  for (const row of rows) {
    const opportunity = repo.opportunities.getOpportunityRow(row.opportunity_id);
    // 孤儿行无法诚实呈现（本库不存在删除机会的路径）；跳过而非捏造标题。
    if (!opportunity) continue;
    out.push(toApplicationDto(row, eventsByApp.get(row.id) ?? [], opportunity));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 创建 tracker（永不提交任何东西）
// ---------------------------------------------------------------------------

export async function createApplication(
  repo: EarnRepo,
  opportunityId: string,
): Promise<ApplicationMutationResult> {
  await repo.ensureReady();
  const opportunity = repo.opportunities.getOpportunityRow(opportunityId);
  if (!opportunity) return { ok: false, error: "Opportunity not found" };

  const existing = repo.applications.findActiveApplicationForOpportunity(opportunityId);
  if (existing) {
    // 每机会一个进行中 tracker：诚实返回已存在的那条。
    const application = await getApplicationDto(repo, existing.id);
    if (!application) return { ok: false, error: "Application not found" };
    return { ok: true, application };
  }

  const id = `app-${randomUUID()}`;
  repo.applications.insertApplicationRow(
    id,
    opportunityId,
    "Application tracker created. Hop3 will never submit for you: prepare materials here, review them, submit on the provider platform yourself, then record what happened.",
  );

  const application = await getApplicationDto(repo, id);
  if (!application) return { ok: false, error: "Application not found" };
  return { ok: true, application };
}

// ---------------------------------------------------------------------------
// 真实草稿生成（规则模板，无模型）
// ---------------------------------------------------------------------------

interface ListingForDraft {
  title: string;
  platform: string;
  requirements?: { skills?: string[]; languages?: string[]; experience?: string };
  application?: { steps?: string[]; qualificationTest?: boolean; requiredData?: string[] };
  compensation?: { currency?: string; grossMin?: number; grossMax?: number; payUnit?: string };
}

function listingForDraft(row: EarnOpportunityRow): ListingForDraft {
  return {
    title: row.title,
    platform: row.platform,
    requirements: parseRequirementsSpec(row.requirements_json),
    application: parseApplicationSpec(row.application_json),
    compensation: parseCompensationSpec(row.compensation_json),
  };
}

function buildChecklist(listing: ListingForDraft, profile: ProfileDTO | null): string[] {
  const items: string[] = [];
  if (!profile) {
    items.push("Create your worker profile in the Profile tab so drafts can use your real details");
  }
  for (const step of listing.application?.steps ?? []) {
    if (step.trim() !== "") items.push(`Listing application step: ${step}`);
  }
  for (const required of listing.application?.requiredData ?? []) {
    if (required.trim() !== "") items.push(`Listing asks for: ${required}`);
  }
  if (listing.application?.qualificationTest === true) {
    items.push("Unpaid qualification test — decide whether the time cost is worth it before applying");
  }
  if ((listing.requirements?.skills ?? []).length > 0) {
    items.push(`Check you truly have every listed skill: ${(listing.requirements?.skills ?? []).join(", ")}`);
  }
  if ((listing.requirements?.languages ?? []).length > 0) {
    items.push(`Confirm your language level for: ${(listing.requirements?.languages ?? []).join(", ")}`);
  }
  items.push("Review every claim in this draft yourself — edit anything that is not exactly true");
  items.push("Submit on the provider platform yourself (Hop3 never submits for you)");
  items.push("Record what happened afterwards in the Applications tab (accepted, completed, paid)");
  return [...new Set(items)].slice(0, 30);
}

function buildMessageDraft(listing: ListingForDraft, profile: ProfileDTO | null): string {
  const lines: string[] = [];
  lines.push(`Hello,`);
  lines.push("");
  lines.push(`I would like to apply for "${listing.title}" on ${listing.platform}.`);
  lines.push("");
  lines.push("About me (from my own Hop3 worker profile — edit anything that is not exactly true):");
  if (profile) {
    if (profile.displayName) lines.push(`- Name: ${profile.displayName}`);
    if (profile.countryCode) {
      lines.push(`- Country: ${profile.countryCode}${profile.regionNote ? ` (${profile.regionNote})` : ""}`);
    }
    if (profile.languages.length > 0) {
      lines.push(
        `- Languages: ${profile.languages.map((l) => `${l.code} (${l.proficiency})`).join(", ")}`,
      );
    }
    if (profile.skills.length > 0) {
      lines.push(
        `- Skills I list: ${profile.skills.map((s) => `${s.name} (${s.experienceBand})`).join(", ")}`,
      );
    }
    if (profile.qualifications.length > 0) {
      lines.push(
        `- Qualifications (self-declared unless marked): ${profile.qualifications
          .map((q) => `${q.type}${q.issuer ? ` — ${q.issuer}` : ""}${q.year ? `, ${q.year}` : ""} [${q.verificationState}]`)
          .join("; ")}`,
      );
    }
    if (profile.weeklyHours > 0) {
      lines.push(`- Availability: about ${profile.weeklyHours} hours per week`);
    }
    if (profile.equipment.length > 0) {
      lines.push(`- Equipment: ${profile.equipment.map((e) => e.kind).join(", ")}`);
    }
    lines.push(`- Preferred work mode: ${profile.workMode}`);
  } else {
    lines.push(
      "- [Your profile is not created yet — fill the Profile tab and regenerate this draft so your real details appear here]",
    );
  }
  lines.push("");
  const listingSkills = listing.requirements?.skills ?? [];
  if (listingSkills.length > 0) {
    lines.push(
      "Regarding the listed requirements, please consider (only keep what is actually true for you):",
    );
    for (const skill of listingSkills) {
      lines.push(`- ${skill}: [describe your real experience with ${skill} — no invented projects or years]`);
    }
  } else {
    lines.push(
      "The listing does not state required skills, so describe only the experience that is genuinely relevant:",
    );
    lines.push("- [your relevant experience — only what is true]");
  }
  lines.push("");
  const comp = listing.compensation;
  if (comp && (comp.grossMin !== undefined || comp.grossMax !== undefined)) {
    const range =
      comp.grossMin !== undefined && comp.grossMax !== undefined && comp.grossMin !== comp.grossMax
        ? `${comp.grossMin}–${comp.grossMax}`
        : (comp.grossMin ?? comp.grossMax);
    lines.push(
      `My proposed terms: the listing states ${range}${comp.currency ? ` ${comp.currency}` : ""}${
        comp.payUnit ? ` per ${comp.payUnit}` : ""
      }; please confirm final terms on the platform.`,
    );
  } else {
    lines.push("My proposed terms: [state your rate or ask for the stated terms — never invent a rate]");
  }
  lines.push("");
  lines.push(
    "This draft was generated by Hop3 from my own profile and the public listing. I reviewed it and I will submit it myself.",
  );
  lines.push("");
  lines.push("Best regards,");
  lines.push(profile?.displayName ? profile.displayName : "[your name]");
  return lines.join("\n");
}

/**
 * 由真实 profile 事实 + listing 生成草稿（规则模板，draftModel
 * 'hop3-stage1-rules-v1'）。永不捏造经历或收入。
 */
export async function prepareDraft(
  repo: EarnRepo,
  id: string,
): Promise<ApplicationMutationResult> {
  await repo.ensureReady();
  const row = repo.applications.getApplicationRow(id);
  if (!row) return { ok: false, error: "Application not found" };
  const opportunity = repo.opportunities.getOpportunityRow(row.opportunity_id);
  if (!opportunity) return { ok: false, error: "Opportunity not found" };

  const profileRow = repo.profile.getProfileRow();
  const profile = profileRow ? mapProfileRow(profileRow) : null;
  const listing = listingForDraft(opportunity);

  const draft: ApplicationDraftContent = {
    checklist: buildChecklist(listing, profile),
    messageDraft: buildMessageDraft(listing, profile),
    notice: NO_AUTO_SUBMIT_NOTICE,
  };

  repo.applications.updateApplicationRow(id, {
    draft: JSON.stringify(draft),
    draftGeneratedAt: Date.now(),
    draftModel: "hop3-stage1-rules-v1",
  });
  repo.applications.insertApplicationEventRow(id, {
    eventType: "note",
    note: "Draft generated (rule template hop3-stage1-rules-v1 — profile facts + listing facts only; review every claim before use).",
  });

  const application = await getApplicationDto(repo, id);
  if (!application) return { ok: false, error: "Application not found" };
  return { ok: true, application };
}

// ---------------------------------------------------------------------------
// 保存用户编辑后的草稿
// ---------------------------------------------------------------------------

function parseStoredDraft(draft: string | null): ApplicationDraftContent | null {
  if (draft === null || draft.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(draft);
    const checked = draftContentSchema.safeParse(parsed);
    return checked.success ? checked.data : null;
  } catch {
    return null;
  }
}

/**
 * 保存用户编辑后的草稿。冻结契约为 `draft: string`，而参考实现校验的是
 * { checklist, messageDraft, notice } 内容对象 —— 兼容两种输入：
 *  1. 内容对象的 JSON 序列化（UI 序列化整份内容）→ 按参考 zod 校验后整份替换；
 *  2. 其它任意字符串 → 视为 messageDraft 文本编辑，保留既有 checklist 与
 *     notice（缺省 NO_AUTO_SUBMIT_NOTICE），再走同一套诚实边界校验。
 * 两条路径产物都是合法存储格式（draft 列 = ApplicationDraftContent JSON）。
 */
export async function saveDraft(
  repo: EarnRepo,
  id: string,
  draft: string,
): Promise<ApplicationMutationResult> {
  await repo.ensureReady();
  const row = repo.applications.getApplicationRow(id);
  if (!row) return { ok: false, error: "Application not found" };

  let content: ApplicationDraftContent | null = null;
  const asObject = draftContentSchema.safeParse(safeJsonParse(draft));
  if (asObject.success) {
    content = asObject.data;
  } else {
    const existing = parseStoredDraft(row.draft);
    const asText = draftContentSchema.safeParse({
      checklist: existing?.checklist ?? [],
      messageDraft: draft,
      notice: existing?.notice ?? NO_AUTO_SUBMIT_NOTICE,
    });
    if (asText.success) content = asText.data;
  }
  if (content === null) {
    return {
      ok: false,
      error:
        "Invalid draft content: messageDraft must be non-empty text of at most 8000 characters (and a checklist of at most 30 short items)",
    };
  }

  repo.applications.updateApplicationRow(id, {
    draft: JSON.stringify({
      checklist: content.checklist,
      messageDraft: content.messageDraft,
      notice: content.notice,
    }),
    draftEditedByUser: true,
  });
  repo.applications.insertApplicationEventRow(id, {
    eventType: "draft_edited",
    note: "Draft edited and saved by the user.",
  });

  const application = await getApplicationDto(repo, id);
  if (!application) return { ok: false, error: "Application not found" };
  return { ok: true, application };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// 记录事件 / 生命周期迁移（状态唯一变更入口）
// ---------------------------------------------------------------------------

export async function recordEvent(
  repo: EarnRepo,
  id: string,
  input: RecordEventInput,
): Promise<ApplicationMutationResult> {
  const parsed = recordEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid event input: ${formatZodError(parsed.error)}`,
    };
  }
  const event = parsed.data;

  await repo.ensureReady();
  const row = repo.applications.getApplicationRow(id);
  if (!row) return { ok: false, error: "Application not found" };

  // --- 纯 note 事件：追加，不改状态 ------------------------------------------
  if (event.eventType === "note") {
    repo.applications.insertApplicationEventRow(id, {
      eventType: "note",
      evidenceType: event.evidenceType ?? null,
      evidenceUrl: event.evidenceUrl ?? null,
      note: event.note ?? null,
    });
    const application = await getApplicationDto(repo, id);
    if (!application) return { ok: false, error: "Application not found" };
    return { ok: true, application };
  }

  if (!KNOWN_STATUS_EVENTS.has(event.eventType)) {
    return {
      ok: false,
      error: `Unknown event type "${event.eventType}". Use a lifecycle status (${[...KNOWN_STATUS_EVENTS].join(", ")}) or "note".`,
    };
  }

  const target = event.eventType as Parameters<typeof canTransition>[1];
  const evidence: TransitionEvidence = {
    evidenceType: event.evidenceType,
    evidenceUrl: event.evidenceUrl,
    note: event.note,
    amountPaid: event.amountPaid,
    hasDraft: Boolean(row.draft && row.draft.trim() !== ""),
  };

  const guard = canTransition(row.status as Parameters<typeof canTransition>[0], target, evidence);
  if (!guard.ok) {
    return { ok: false, error: guard.reason ?? "Transition not allowed" };
  }

  const fields = applyTransitionFields(target, evidence, {
    paidCurrency: event.paidCurrency,
    channel: event.channel,
  });

  const write: ApplicationFieldWrite = { status: target };
  if (fields.submittedAt !== undefined) write.submittedAt = fields.submittedAt.getTime();
  if (fields.submittedChannel !== undefined) write.submittedChannel = fields.submittedChannel;
  if (fields.submittedEvidence !== undefined) write.submittedEvidence = fields.submittedEvidence;
  if (fields.acceptedAt !== undefined) write.acceptedAt = fields.acceptedAt.getTime();
  if (fields.completedAt !== undefined) write.completedAt = fields.completedAt.getTime();
  if (fields.approvedAt !== undefined) write.approvedAt = fields.approvedAt.getTime();
  if (fields.paidAt !== undefined) write.paidAt = fields.paidAt.getTime();
  if (fields.amountPaid !== undefined) write.amountPaid = fields.amountPaid;
  if (fields.paidCurrency !== undefined) write.paidCurrency = fields.paidCurrency;
  if (fields.paymentEvidence !== undefined) write.paymentEvidence = fields.paymentEvidence;
  if (fields.outcomeNotes !== undefined) write.outcomeNotes = fields.outcomeNotes;

  repo.applications.updateApplicationRow(id, write);
  repo.applications.insertApplicationEventRow(id, {
    eventType: event.eventType,
    evidenceType: event.evidenceType ?? null,
    evidenceUrl: event.evidenceUrl ?? null,
    note: event.note ?? null,
  });

  const application = await getApplicationDto(repo, id);
  if (!application) return { ok: false, error: "Application not found" };
  return { ok: true, application };
}

/** 将 tracker 标记为已审阅（prepared）—— 需要已存草稿（见 canTransition）。 */
export async function markPrepared(
  repo: EarnRepo,
  id: string,
): Promise<ApplicationMutationResult> {
  return recordEvent(repo, id, { eventType: "prepared" });
}
