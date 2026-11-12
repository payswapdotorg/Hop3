/**
 * Hop3 — earn_opportunities / earn_saved 存储面 — 参考实现 source-service.ts
 * 的 dedupe-aware ingest + opportunity-service.ts 的持久化半边。
 *
 * (source_key, external_id) 唯一：同源去重的唯一事实（DOMAIN-MODEL §3）。
 * 已存在行刷新（last_seen_at / observed_at / expires_at / specs），签名比对
 * 诚实区分 "updated" 与 "duplicates"；跨源绝不合并任何记录。
 */

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { RawListing, SourceKey } from "@zcode/shared";

/** earn_opportunities 行（JSON 列为 TEXT 原样；时间戳为 epoch 毫秒）。 */
export interface EarnOpportunityRow {
  id: string;
  schema_version: number;
  source_key: string;
  source_record_id: string;
  external_id: string;
  title: string;
  summary: string | null;
  opportunity_type: string | null;
  work_mode: string | null;
  canonical_url: string;
  platform: string;
  provenance: string;
  eligibility_json: string | null;
  requirements_json: string | null;
  compensation_json: string | null;
  payout_json: string | null;
  application_json: string | null;
  time_json: string | null;
  risk_flags_json: string | null;
  source_status: string | null;
  first_seen_at: number;
  last_seen_at: number;
  observed_at: number;
  expires_at: number | null;
  status: string;
  raw_json: string | null;
}

/** earn_saved 行（私人保存夹 + 备注；opportunity_id 唯一）。 */
export interface EarnSavedRow {
  id: string;
  opportunity_id: string;
  saved_at: number;
  notes: string | null;
}

export interface IngestCounts {
  inserted: number;
  updated: number;
  duplicates: number;
}

const OPPORTUNITY_COLUMNS = `
  schema_version, source_key, source_record_id, external_id, title, summary,
  opportunity_type, work_mode, canonical_url, platform, provenance,
  eligibility_json, requirements_json, compensation_json, payout_json,
  application_json, time_json, risk_flags_json, source_status,
  first_seen_at, last_seen_at, observed_at, expires_at, status, raw_json
`;

function listingExpiresAtMs(listing: RawListing): number | null {
  if (typeof listing.expiresAt !== "string" || listing.expiresAt.trim() === "") return null;
  const date = new Date(listing.expiresAt);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function listingObservedAtMs(listing: RawListing): number {
  const date = new Date(listing.observedAt);
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
}

/** 内容签名：仅用于区分 "updated" 与 "duplicate"（参考 listingSignature）。 */
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

function rowSignature(row: EarnOpportunityRow): string {
  const part = (value: string | null | undefined): unknown => {
    if (value == null || value.trim() === "") return null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  };
  return JSON.stringify([
    row.title,
    row.summary ?? null,
    part(row.eligibility_json),
    part(row.requirements_json),
    part(row.compensation_json),
    part(row.payout_json),
    part(row.application_json),
    part(row.time_json),
    part(row.risk_flags_json),
    row.work_mode ?? null,
    row.opportunity_type ?? null,
  ]);
}

/** 机会 + 保存夹存储（ingest 与读取共用）。 */
export class EarnOpportunityStore {
  constructor(private readonly db: () => DatabaseSync) {}

  /**
   * 持久化归一化 listing：(source_key, external_id) 唯一。已存在行被刷新；
   * 签名比对把 "updated" 与 "duplicates" 诚实分开；跨源永不合并。
   */
  ingestListings(listings: RawListing[]): IngestCounts {
    let inserted = 0;
    let updated = 0;
    let duplicates = 0;

    for (const listing of listings) {
      const externalId = listing.externalId.trim();
      if (externalId === "") continue;

      const existing = this.getOpportunityRowByExternalId(listing.sourceKey, externalId);

      if (existing) {
        const changed = rowSignature(existing) !== listingSignature(listing);
        // 刷新分支与参考一致：不动 source_record_id / provenance /
        // schema_version / first_seen_at（首次观测事实保持首次写入值）。
        this.refreshOpportunity(existing.id, listing);
        if (changed) updated += 1;
        else duplicates += 1;
        continue;
      }

      const observedAt = listingObservedAtMs(listing);
      // firstSeenAt 取观测时间（无法解析则取当下），与参考一致。
      const firstSeenAt = observedAt;
      const id = `opp-${randomUUID()}`;
      this.insertOpportunity(id, listing, externalId, firstSeenAt);
      inserted += 1;
    }

    return { inserted, updated, duplicates };
  }

  /** 新行插入：字段与参考 create 分支逐项对应。 */
  private insertOpportunity(
    id: string,
    listing: RawListing,
    externalId: string,
    firstSeenAt: number,
  ): void {
    const db = this.db();
    const now = Date.now();
    const observedAt = listingObservedAtMs(listing);
    db.prepare(
      `INSERT INTO earn_opportunities (
         id, ${OPPORTUNITY_COLUMNS}
       ) VALUES (
         @id, @schema_version, @source_key, @source_record_id, @external_id, @title, @summary,
         @opportunity_type, @work_mode, @canonical_url, @platform, @provenance,
         @eligibility_json, @requirements_json, @compensation_json, @payout_json,
         @application_json, @time_json, @risk_flags_json, @source_status,
         @first_seen_at, @last_seen_at, @observed_at, @expires_at, @status, @raw_json
       )`,
    ).run({
      id,
      schema_version: 1,
      source_key: listing.sourceKey,
      source_record_id: listing.sourceRecordId || externalId,
      external_id: externalId,
      title: listing.title,
      summary: listing.summary ?? null,
      opportunity_type: listing.opportunityType ?? null,
      work_mode: listing.workMode ?? "unknown",
      canonical_url: listing.canonicalUrl,
      platform: listing.platform,
      provenance: listing.provenance,
      eligibility_json: listing.eligibility ? JSON.stringify(listing.eligibility) : null,
      requirements_json: listing.requirements ? JSON.stringify(listing.requirements) : null,
      compensation_json: listing.compensation ? JSON.stringify(listing.compensation) : null,
      payout_json: listing.payout ? JSON.stringify(listing.payout) : null,
      application_json: listing.application ? JSON.stringify(listing.application) : null,
      time_json: listing.time ? JSON.stringify(listing.time) : null,
      risk_flags_json: listing.riskFlags ? JSON.stringify(listing.riskFlags) : null,
      source_status: listing.sourceStatus ?? null,
      first_seen_at: firstSeenAt,
      last_seen_at: now,
      observed_at: observedAt,
      expires_at: listingExpiresAtMs(listing),
      status: "active",
      raw_json: listing.raw === undefined ? null : JSON.stringify(listing.raw),
    });
  }

  /** 已存在行刷新（lastSeenAt/observedAt/expiresAt/specs；参考 update 分支）。 */
  private refreshOpportunity(id: string, listing: RawListing): void {
    this.db()
      .prepare(
        `UPDATE earn_opportunities SET
           title = @title,
           summary = @summary,
           canonical_url = @canonical_url,
           platform = @platform,
           opportunity_type = @opportunity_type,
           work_mode = @work_mode,
           eligibility_json = @eligibility_json,
           requirements_json = @requirements_json,
           compensation_json = @compensation_json,
           payout_json = @payout_json,
           application_json = @application_json,
           time_json = @time_json,
           risk_flags_json = @risk_flags_json,
           source_status = @source_status,
           raw_json = @raw_json,
           observed_at = @observed_at,
           last_seen_at = @last_seen_at,
           expires_at = @expires_at,
           status = 'active'
         WHERE id = @id`,
      )
      .run({
        id,
        title: listing.title,
        summary: listing.summary ?? null,
        canonical_url: listing.canonicalUrl,
        platform: listing.platform,
        opportunity_type: listing.opportunityType ?? null,
        work_mode: listing.workMode ?? "unknown",
        eligibility_json: listing.eligibility ? JSON.stringify(listing.eligibility) : null,
        requirements_json: listing.requirements ? JSON.stringify(listing.requirements) : null,
        compensation_json: listing.compensation ? JSON.stringify(listing.compensation) : null,
        payout_json: listing.payout ? JSON.stringify(listing.payout) : null,
        application_json: listing.application ? JSON.stringify(listing.application) : null,
        time_json: listing.time ? JSON.stringify(listing.time) : null,
        risk_flags_json: listing.riskFlags ? JSON.stringify(listing.riskFlags) : null,
        source_status: listing.sourceStatus ?? null,
        raw_json: listing.raw === undefined ? null : JSON.stringify(listing.raw),
        observed_at: listingObservedAtMs(listing),
        last_seen_at: Date.now(),
        expires_at: listingExpiresAtMs(listing),
      });
  }

  /** 到达序（firstSeenAt asc, id asc）—— 收件箱永不排名的唯一顺序。 */
  listOpportunityRows(): EarnOpportunityRow[] {
    return this.db()
      .prepare(`SELECT id, ${OPPORTUNITY_COLUMNS} FROM earn_opportunities ORDER BY first_seen_at ASC, id ASC`)
      .all() as unknown as EarnOpportunityRow[];
  }

  getOpportunityRow(id: string): EarnOpportunityRow | null {
    const row = this.db()
      .prepare(`SELECT id, ${OPPORTUNITY_COLUMNS} FROM earn_opportunities WHERE id = ?`)
      .get(id) as EarnOpportunityRow | undefined;
    return row ?? null;
  }

  getOpportunityRowByExternalId(sourceKey: SourceKey, externalId: string): EarnOpportunityRow | null {
    const row = this.db()
      .prepare(
        `SELECT id, ${OPPORTUNITY_COLUMNS} FROM earn_opportunities
         WHERE source_key = ? AND external_id = ?`,
      )
      .get(sourceKey, externalId) as EarnOpportunityRow | undefined;
    return row ?? null;
  }

  /** 用户提交链接的重复路径：只刷新观测/汇总/raw（参考 recordIntake 既有分支）。 */
  updateOpportunityForIntake(
    id: string,
    listing: RawListing,
  ): void {
    this.db()
      .prepare(
        `UPDATE earn_opportunities SET
           last_seen_at = ?, observed_at = ?, summary = ?, raw_json = ?
         WHERE id = ?`,
      )
      .run(
        Date.now(),
        listingObservedAtMs(listing),
        listing.summary ?? null,
        listing.raw === undefined ? null : JSON.stringify(listing.raw),
        id,
      );
  }

  // ---- 保存夹（earn_saved） --------------------------------------------------

  listSavedRows(): EarnSavedRow[] {
    return this.db()
      .prepare(`SELECT id, opportunity_id, saved_at, notes FROM earn_saved`)
      .all() as unknown as EarnSavedRow[];
  }

  getSavedRowByOpportunityId(opportunityId: string): EarnSavedRow | null {
    const row = this.db()
      .prepare(`SELECT id, opportunity_id, saved_at, notes FROM earn_saved WHERE opportunity_id = ?`)
      .get(opportunityId) as EarnSavedRow | undefined;
    return row ?? null;
  }

  insertSavedRow(opportunityId: string, notes: string | null = null): EarnSavedRow {
    const id = `saved-${randomUUID()}`;
    this.db()
      .prepare(
        `INSERT INTO earn_saved (id, opportunity_id, saved_at, notes) VALUES (?, ?, ?, ?)`,
      )
      .run(id, opportunityId, Date.now(), notes);
    return { id, opportunity_id: opportunityId, saved_at: Date.now(), notes };
  }

  /** 重复保存：仅刷新 saved_at（参考 toggleSaved 的 saved 分支）。 */
  touchSavedRow(id: string): void {
    this.db().prepare(`UPDATE earn_saved SET saved_at = ? WHERE id = ?`).run(Date.now(), id);
  }

  updateSavedNotes(id: string, notes: string | null): void {
    this.db().prepare(`UPDATE earn_saved SET notes = ? WHERE id = ?`).run(notes, id);
  }

  deleteSavedRow(id: string): void {
    this.db().prepare(`DELETE FROM earn_saved WHERE id = ?`).run(id);
  }
}
