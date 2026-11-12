import type { IEarnService } from "./hop3Earn.js";

/** 例 1：renderer/UI 经服务访问收件箱（用户筛选、无排名）。 */
export async function listInboxExample(service: IEarnService) {
  return service.listOpportunities({ source: "oneforma", status: "active" });
}

/** 例 2：草稿编辑 —— 用户审阅后保存，仍无任何发送路径。 */
export async function reviewAndSaveDraftExample(service: IEarnService, id: string) {
  const prepared = await service.prepareDraft(id);
  if (!prepared.ok) return prepared;
  return service.saveDraft(id, `${prepared.application.draft ?? ""}\n(edited by me)`);
}

/** 例 3：状态只经证据事件迁移（例如用户报告已自行提交）。 */
export async function recordSubmissionExample(service: IEarnService, id: string) {
  return service.recordEvent(id, {
    eventType: "submitted",
    evidenceType: "user-reported",
    note: "submitted on the provider platform myself",
  });
}
