/**
 * Hop3 — earn_profile 存储面 — 参考实现 profile-service.ts 的持久化半边。
 *
 * DOMAIN-MODEL.md 1.1：用户自持、默认私有的唯一 worker profile，Stage 1 固定
 * id 'primary'。JSON 列以 TEXT 存储，读取时 zod 校验（服务层做 DTO 映射），
 * 坏值降级为空结构，绝不捏造成主张。
 */

import type { DatabaseSync } from "node:sqlite";

/** 固定单行 id（Stage 1 只有一个本地用户）。 */
export const PROFILE_ID = "primary";

/** earn_profile 行（snake_case 原样列；时间戳为 epoch 毫秒）。 */
export interface EarnProfileRow {
  id: string;
  schema_version: number;
  display_name: string | null;
  country_code: string | null;
  region_note: string | null;
  work_mode: string;
  languages_json: string | null;
  skills_json: string | null;
  qualifications_json: string | null;
  preferences_json: string | null;
  weekly_hours: number;
  timezone: string | null;
  equipment_json: string | null;
  income_goal_amount: number | null;
  income_goal_currency: string;
  payout_capabilities_json: string | null;
  consent_json: string | null;
  created_at: number;
  updated_at: number;
}

/** 校验后的整份 profile 写入值（JSON 列已序列化；upsert 全量替换语义）。 */
export interface EarnProfileWrite {
  schemaVersion: number;
  displayName: string | null;
  countryCode: string | null;
  regionNote: string | null;
  workMode: string;
  languagesJson: string | null;
  skillsJson: string | null;
  qualificationsJson: string | null;
  preferencesJson: string | null;
  weeklyHours: number;
  timezone: string | null;
  equipmentJson: string | null;
  incomeGoalAmount: number | null;
  incomeGoalCurrency: string;
  payoutCapabilitiesJson: string | null;
}

const SELECT_PROFILE = `
  SELECT id, schema_version, display_name, country_code, region_note, work_mode,
         languages_json, skills_json, qualifications_json, preferences_json,
         weekly_hours, timezone, equipment_json, income_goal_amount,
         income_goal_currency, payout_capabilities_json, consent_json,
         created_at, updated_at
  FROM earn_profile WHERE id = ?
`;

/** profile 行读写（幂等 upsert：全量替换，consent 列不受影响 —— 参考语义）。 */
export class EarnProfileStore {
  constructor(private readonly db: () => DatabaseSync) {}

  getProfileRow(): EarnProfileRow | null {
    const row = this.db().prepare(SELECT_PROFILE).get(PROFILE_ID) as
      | EarnProfileRow
      | undefined;
    return row ?? null;
  }

  upsertProfileRow(write: EarnProfileWrite): EarnProfileRow {
    const now = Date.now();
    const db = this.db();
    db.prepare(
      `INSERT INTO earn_profile (
         id, schema_version, display_name, country_code, region_note, work_mode,
         languages_json, skills_json, qualifications_json, preferences_json,
         weekly_hours, timezone, equipment_json, income_goal_amount,
         income_goal_currency, payout_capabilities_json, consent_json,
         created_at, updated_at
       ) VALUES (
         @id, @schema_version, @display_name, @country_code, @region_note, @work_mode,
         @languages_json, @skills_json, @qualifications_json, @preferences_json,
         @weekly_hours, @timezone, @equipment_json, @income_goal_amount,
         @income_goal_currency, @payout_capabilities_json, NULL,
         @now, @now
       )
       ON CONFLICT(id) DO UPDATE SET
         schema_version = @schema_version,
         display_name = @display_name,
         country_code = @country_code,
         region_note = @region_note,
         work_mode = @work_mode,
         languages_json = @languages_json,
         skills_json = @skills_json,
         qualifications_json = @qualifications_json,
         preferences_json = @preferences_json,
         weekly_hours = @weekly_hours,
         timezone = @timezone,
         equipment_json = @equipment_json,
         income_goal_amount = @income_goal_amount,
         income_goal_currency = @income_goal_currency,
         payout_capabilities_json = @payout_capabilities_json,
         updated_at = @now`,
    ).run({
      id: PROFILE_ID,
      schema_version: write.schemaVersion,
      display_name: write.displayName,
      country_code: write.countryCode,
      region_note: write.regionNote,
      work_mode: write.workMode,
      languages_json: write.languagesJson,
      skills_json: write.skillsJson,
      qualifications_json: write.qualificationsJson,
      preferences_json: write.preferencesJson,
      weekly_hours: write.weeklyHours,
      timezone: write.timezone,
      equipment_json: write.equipmentJson,
      income_goal_amount: write.incomeGoalAmount,
      income_goal_currency: write.incomeGoalCurrency,
      payout_capabilities_json: write.payoutCapabilitiesJson,
      now,
    });
    return this.getProfileRow() as EarnProfileRow;
  }
}
