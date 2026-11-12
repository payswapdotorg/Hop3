import { ServiceChannels } from "@zcode/shared";
import type {
  ApplicationDTO,
  ApplicationDraftContent,
  ApplicationMutationResult,
  EarnProfileInput,
  IngestResult,
  IntakeResult,
  OpportunityCardDTO,
  OpportunityDetail,
  OpportunityFilters,
  ProfileDTO,
  RecordEventInput,
  SourceConnectionDTO,
  SourceKey,
} from "@zcode/shared";
import { createServiceDescriptor } from "#src/descriptors.js";

// Hop3 Earn 域服务（STAGE-1 §4 D2/D4）。
// renderer 经 ProxyChannel 直连（offPeakTask 同款范式）；
// 15 个方法覆盖 profile / sources / opportunities / applications 四面。
// 冻结契约：packages/shared/src/hop3-earn（修改走 TL）。

/**
 * `IEarnService` — Hop3 Stage 1 Earn 域的 RPC 服务面。
 *
 * 诚实纪律（实现方必须遵守，见 hop3-earn-shared CONTRACT.md）：
 *  - 列表永不按 Hop3 排名重排（firstSeenAt asc / 供应方顺序）；
 *  - 变更方法的失败以 `ApplicationMutationResult.ok:false` 返回诚实原因，不跨通道抛 raw error；
 *  - `prepareDraft` 产出预填材料，**没有任何发送路径** —— 提交永远由用户在供应方平台完成。
 */
export interface IEarnService {
  // -- profile ---------------------------------------------------------------
  /** 读取唯一的 worker profile；不存在时返回 null —— 绝不捏造默认值。 */
  getProfile(): Promise<ProfileDTO | null>;
  /** 校验并落盘 profile 输入；非法输入以 rejected promise 的诚实消息拒绝。 */
  upsertProfile(input: EarnProfileInput): Promise<ProfileDTO>;

  // -- sources ---------------------------------------------------------------
  /** 四条来源路径的连接视图（含 live/sandbox/blocked 诚实状态）。 */
  listSources(): Promise<SourceConnectionDTO[]>;
  /** 同步一条来源；结果含 fetched/inserted/updated/duplicates 计数。 */
  syncSource(key: SourceKey, mode: "live" | "sandbox"): Promise<IngestResult>;
  /** 记录一条用户提交链接（provenance = user-submitted）。 */
  recordIntake(url: string, context?: string): Promise<IntakeResult>;

  // -- opportunities -----------------------------------------------------------
  /** 收件箱列表：只接受用户筛选条件，永不做 Hop3 排名。 */
  listOpportunities(filters?: OpportunityFilters): Promise<Array<OpportunityCardDTO & { savedNotes?: string | null }>>;
  /** 全量详情：卡片字段 + 归一化 specs + 证据 + raw payload。 */
  getOpportunityDetail(id: string): Promise<OpportunityDetail | null>;
  /** 加入/移出保存夹。 */
  toggleSaved(id: string, saved: boolean): Promise<boolean>;
  /** 设置私人备注（仅本地）。 */
  setSavedNotes(id: string, notes: string): Promise<boolean>;

  // -- applications -------------------------------------------------------------
  /** 申请追踪列表（证据门控的状态步进）。 */
  listApplications(): Promise<ApplicationDTO[]>;
  /** 从机会创建申请记录（草稿态；不提交任何东西）。 */
  createApplication(opportunityId: string): Promise<ApplicationMutationResult>;
  /** 生成/刷新预填草稿材料（checklist + messageDraft + notice）。 */
  prepareDraft(id: string): Promise<ApplicationMutationResult>;
  /** 保存用户编辑后的草稿（编辑即 draftEditedByUser）。 */
  saveDraft(id: string, draft: string): Promise<ApplicationMutationResult>;
  /** 记录证据事件 —— 申请状态唯一的变更入口。 */
  recordEvent(id: string, input: RecordEventInput): Promise<ApplicationMutationResult>;
  /** 将草稿标记为已审阅（prepared）—— 用户提交前的最后一道门。 */
  markPrepared(id: string): Promise<ApplicationMutationResult>;
}

export const IEarnService = createServiceDescriptor<IEarnService>(ServiceChannels.Hop3Earn);
