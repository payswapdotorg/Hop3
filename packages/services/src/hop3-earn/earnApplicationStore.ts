/**
 * Hop3 — earn_applications / earn_application_events 存储面 — 参考实现
 * application-service.ts 的持久化半边（事件台账 + 申请行）。
 *
 * 创建 tracker 永不提交任何东西；状态变更只经事件（证据门控在
 * domain/lifecycle，由服务层把关）；每个迁移追加 ApplicationEvent 行，
 * 结果历史可审计。draft 列存 JSON 文本（{ checklist, messageDraft, notice }）。
 */

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { TERMINAL_APPLICATION_STATUSES } from "./domain/lifecycle.js";

/** earn_applications 行（时间戳为 epoch 毫秒；布尔列 0/1）。 */
export interface EarnApplicationRow {
  id: string;
  opportunity_id: string;
  status: string;
  draft: string | null;
  draft_generated_at: number | null;
  draft_model: string | null;
  draft_edited_by_user: number;
  submitted_at: number | null;
  submitted_channel: string | null;
  submitted_evidence: string | null;
  accepted_at: number | null;
  completed_at: number | null;
  approved_at: number | null;
  paid_at: number | null;
  amount_paid: number | null;
  paid_currency: string | null;
  payment_evidence: string | null;
  outcome_notes: string | null;
  created_at: number;
  updated_at: number;
}

/** earn_application_events 行。 */
export interface EarnApplicationEventRow {
  id: string;
  application_id: string;
  event_type: string;
  evidence_type: string | null;
  evidence_url: string | null;
  note: string | null;
  created_at: number;
}

/** 申请行部分更新（仅更新给出的列；updated_at 恒刷新）。 */
export interface ApplicationFieldWrite {
  status?: string;
  draft?: string | null;
  draftGeneratedAt?: number | null;
  draftModel?: string | null;
  draftEditedByUser?: boolean;
  submittedAt?: number | null;
  submittedChannel?: string | null;
  submittedEvidence?: string | null;
  acceptedAt?: number | null;
  completedAt?: number | null;
  approvedAt?: number | null;
  paidAt?: number | null;
  amountPaid?: number | null;
  paidCurrency?: string | null;
  paymentEvidence?: string | null;
  outcomeNotes?: string | null;
}

/** 事件插入值。 */
export interface ApplicationEventWrite {
  eventType: string;
  evidenceType?: string | null;
  evidenceUrl?: string | null;
  note?: string | null;
}

const APPLICATION_COLUMNS = `
  id, opportunity_id, status, draft, draft_generated_at, draft_model,
  draft_edited_by_user, submitted_at, submitted_channel, submitted_evidence,
  accepted_at, completed_at, approved_at, paid_at, amount_paid, paid_currency,
  payment_evidence, outcome_notes, created_at, updated_at
`;

const EVENT_COLUMNS = `id, application_id, event_type, evidence_type, evidence_url, note, created_at`;

/** 申请 + 事件存储。 */
export class EarnApplicationStore {
  constructor(private readonly db: () => DatabaseSync) {}

  /** createdAt 降序（参考 listApplications 的排序）。 */
  listApplicationRows(): EarnApplicationRow[] {
    return this.db()
      .prepare(`SELECT ${APPLICATION_COLUMNS} FROM earn_applications ORDER BY created_at DESC, id DESC`)
      .all() as unknown as EarnApplicationRow[];
  }

  getApplicationRow(id: string): EarnApplicationRow | null {
    const row = this.db()
      .prepare(`SELECT ${APPLICATION_COLUMNS} FROM earn_applications WHERE id = ?`)
      .get(id) as EarnApplicationRow | undefined;
    return row ?? null;
  }

  /** 每机会一个进行中 tracker：非终态最新一条（参考 findFirst 语义）。 */
  findActiveApplicationForOpportunity(opportunityId: string): EarnApplicationRow | null {
    const terminal = TERMINAL_APPLICATION_STATUSES.map((status) => `'${status}'`).join(", ");
    const row = this.db()
      .prepare(
        `SELECT ${APPLICATION_COLUMNS} FROM earn_applications
         WHERE opportunity_id = ? AND status NOT IN (${terminal})
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(opportunityId) as EarnApplicationRow | undefined;
    return row ?? null;
  }

  /** 卡片 applicationStatus 用的轻量投影（参考 select { opportunityId, status, createdAt }）。 */
  listApplicationStatusLite(): Array<{ opportunity_id: string; status: string; created_at: number }> {
    return this.db()
      .prepare(`SELECT opportunity_id, status, created_at FROM earn_applications`)
      .all() as Array<{ opportunity_id: string; status: string; created_at: number }>;
  }

  /** 创建 draft 态 tracker + 初始 note 事件（参考 createApplication）。 */
  insertApplicationRow(
    id: string,
    opportunityId: string,
    initialNote: string,
  ): EarnApplicationRow {
    const now = Date.now();
    this.db()
      .prepare(
        `INSERT INTO earn_applications (
           id, opportunity_id, status, draft, draft_generated_at, draft_model,
           draft_edited_by_user, submitted_at, submitted_channel, submitted_evidence,
           accepted_at, completed_at, approved_at, paid_at, amount_paid, paid_currency,
           payment_evidence, outcome_notes, created_at, updated_at
         ) VALUES (?, ?, 'draft', NULL, NULL, NULL, 0, NULL, NULL, NULL,
                   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .run(id, opportunityId, now, now);
    this.insertApplicationEventRow(id, { eventType: "note", note: initialNote });
    return this.getApplicationRow(id) as EarnApplicationRow;
  }

  /** 部分更新申请行；updated_at 恒为当前时刻。 */
  updateApplicationRow(id: string, fields: ApplicationFieldWrite): void {
    const sets: string[] = [];
    const values: Record<string, SQLInputValue> = {};
    const add = (column: string, value: SQLInputValue): void => {
      sets.push(`${column} = @${column}`);
      values[column] = value;
    };
    if (fields.status !== undefined) add("status", fields.status);
    if (fields.draft !== undefined) add("draft", fields.draft);
    if (fields.draftGeneratedAt !== undefined) add("draft_generated_at", fields.draftGeneratedAt);
    if (fields.draftModel !== undefined) add("draft_model", fields.draftModel);
    if (fields.draftEditedByUser !== undefined) add("draft_edited_by_user", fields.draftEditedByUser ? 1 : 0);
    if (fields.submittedAt !== undefined) add("submitted_at", fields.submittedAt);
    if (fields.submittedChannel !== undefined) add("submitted_channel", fields.submittedChannel);
    if (fields.submittedEvidence !== undefined) add("submitted_evidence", fields.submittedEvidence);
    if (fields.acceptedAt !== undefined) add("accepted_at", fields.acceptedAt);
    if (fields.completedAt !== undefined) add("completed_at", fields.completedAt);
    if (fields.approvedAt !== undefined) add("approved_at", fields.approvedAt);
    if (fields.paidAt !== undefined) add("paid_at", fields.paidAt);
    if (fields.amountPaid !== undefined) add("amount_paid", fields.amountPaid);
    if (fields.paidCurrency !== undefined) add("paid_currency", fields.paidCurrency);
    if (fields.paymentEvidence !== undefined) add("payment_evidence", fields.paymentEvidence);
    if (fields.outcomeNotes !== undefined) add("outcome_notes", fields.outcomeNotes);
    if (sets.length === 0) return;
    sets.push("updated_at = @updated_at");
    values.id = id;
    values.updated_at = Date.now();
    this.db()
      .prepare(`UPDATE earn_applications SET ${sets.join(", ")} WHERE id = @id`)
      .run(values);
  }

  /** 追加事件行（时间恒为当前时刻；id 随机，同毫秒排序靠 rowid 插入序）。 */
  insertApplicationEventRow(applicationId: string, event: ApplicationEventWrite): void {
    this.db()
      .prepare(
        `INSERT INTO earn_application_events (
           id, application_id, event_type, evidence_type, evidence_url, note, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `evt-${randomUUID()}`,
        applicationId,
        event.eventType,
        event.evidenceType ?? null,
        event.evidenceUrl ?? null,
        event.note ?? null,
        Date.now(),
      );
  }

  /** 单申请事件行（createdAt 升序，同毫秒按 rowid 插入序）；applicationId 省略时返回全部。 */
  listApplicationEventRows(applicationId?: string): EarnApplicationEventRow[] {
    const db = this.db();
    if (applicationId === undefined) {
      return db
        .prepare(`SELECT ${EVENT_COLUMNS} FROM earn_application_events ORDER BY created_at ASC, rowid ASC`)
        .all() as unknown as EarnApplicationEventRow[];
    }
    return db
      .prepare(
        `SELECT ${EVENT_COLUMNS} FROM earn_application_events
         WHERE application_id = ? ORDER BY created_at ASC, rowid ASC`,
      )
      .all(applicationId) as unknown as EarnApplicationEventRow[];
  }
}
