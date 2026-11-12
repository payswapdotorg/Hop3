/**
 * Hop3 — earn_source_connections / earn_ingest_runs 存储面 — 参考实现
 * source-service.ts 的持久化半边（registry seeding + SourceRun 台账）。
 *
 * 注册行幂等 upsert：策略字段每次刷新，运行时状态（mode / last_sync_at /
 * status_message）从不被种子覆盖 —— 参考实现 ensureSourcesSeeded 的语义。
 */

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { SourceKey } from "@zcode/shared";

/** earn_source_connections 行（时间戳为 epoch 毫秒）。 */
export interface EarnSourceConnectionRow {
  key: string;
  display_name: string;
  source_kind: string;
  access_mode: string;
  actor_modes_json: string;
  operations_json: string;
  policy_json: string;
  ranking_policy: string;
  rate_limit_json: string;
  freshness_max_hours: number;
  mode: string;
  status_message: string | null;
  evidence_url: string | null;
  last_sync_at: number | null;
  updated_at: number;
}

/** 注册行种子值（由适配器 policy 派生，服务层组装后传入）。 */
export interface SourceConnectionSeed {
  key: SourceKey;
  displayName: string;
  sourceKind: string;
  accessMode: string;
  actorModesJson: string;
  operationsJson: string;
  policyJson: string;
  rankingPolicy: string;
  rateLimitJson: string;
  freshnessMaxHours: number;
  /** 初始运行模式，仅在首次建行时生效（之后为运行时状态）。 */
  mode: string;
  /** 初始状态消息，仅在首次建行时生效。 */
  statusMessage: string | null;
  evidenceUrl: string | null;
}

/** earn_ingest_runs 行（一次同步的诚实计数台账）。 */
export interface EarnIngestRunRow {
  id: string;
  source_key: string;
  mode: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  fetched: number;
  inserted: number;
  updated: number;
  duplicates: number;
  message: string | null;
  errors_json: string | null;
}

/** 收尾一次运行时的写入值。 */
export interface IngestRunFinish {
  status: string;
  fetched: number;
  inserted: number;
  updated: number;
  duplicates: number;
  message: string | null;
}

/** 连接行运行时状态更新（mode/statusMessage/lastSyncAt 均可选）。 */
export interface SourceConnectionRuntimePatch {
  mode?: string;
  statusMessage?: string | null;
  lastSyncAt?: number;
}

const CONNECTION_COLUMNS = `
  key, display_name, source_kind, access_mode, actor_modes_json, operations_json,
  policy_json, ranking_policy, rate_limit_json, freshness_max_hours, mode,
  status_message, evidence_url, last_sync_at, updated_at
`;

/** 来源注册表 + 运行台账存储。 */
export class EarnSourceStore {
  constructor(private readonly db: () => DatabaseSync) {}

  /**
   * 幂等播种注册行：策略字段每次刷新；mode / status_message / last_sync_at
   * 只在首次插入时写初始值，已存在的行不被重置（参考语义）。
   */
  ensureSourcesSeeded(seeds: SourceConnectionSeed[]): void {
    const now = Date.now();
    const insert = this.db().prepare(
      `INSERT INTO earn_source_connections (
         ${CONNECTION_COLUMNS}
       ) VALUES (
         @key, @display_name, @source_kind, @access_mode, @actor_modes_json, @operations_json,
         @policy_json, @ranking_policy, @rate_limit_json, @freshness_max_hours, @mode,
         @status_message, @evidence_url, NULL, @now
       )
       ON CONFLICT(key) DO UPDATE SET
         display_name = @display_name,
         source_kind = @source_kind,
         access_mode = @access_mode,
         actor_modes_json = @actor_modes_json,
         operations_json = @operations_json,
         policy_json = @policy_json,
         ranking_policy = @ranking_policy,
         rate_limit_json = @rate_limit_json,
         freshness_max_hours = @freshness_max_hours,
         evidence_url = @evidence_url,
         updated_at = @now`,
    );
    for (const seed of seeds) {
      insert.run({
        key: seed.key,
        display_name: seed.displayName,
        source_kind: seed.sourceKind,
        access_mode: seed.accessMode,
        actor_modes_json: seed.actorModesJson,
        operations_json: seed.operationsJson,
        policy_json: seed.policyJson,
        ranking_policy: seed.rankingPolicy,
        rate_limit_json: seed.rateLimitJson,
        freshness_max_hours: seed.freshnessMaxHours,
        mode: seed.mode,
        status_message: seed.statusMessage,
        evidence_url: seed.evidenceUrl,
        now,
      });
    }
  }

  listSourceConnectionRows(): EarnSourceConnectionRow[] {
    return this.db()
      .prepare(`SELECT ${CONNECTION_COLUMNS} FROM earn_source_connections`)
      .all() as unknown as EarnSourceConnectionRow[];
  }

  getSourceConnectionRow(key: string): EarnSourceConnectionRow | null {
    const row = this.db()
      .prepare(`SELECT ${CONNECTION_COLUMNS} FROM earn_source_connections WHERE key = ?`)
      .get(key) as EarnSourceConnectionRow | undefined;
    return row ?? null;
  }

  /** 更新运行时状态：mode / statusMessage / lastSyncAt（只更新给出者）。 */
  updateSourceConnectionRuntime(key: string, patch: SourceConnectionRuntimePatch): void {
    const sets: string[] = ["updated_at = ?"];
    const values: SQLInputValue[] = [Date.now()];
    if (patch.mode !== undefined) {
      sets.push("mode = ?");
      values.push(patch.mode);
    }
    if (patch.statusMessage !== undefined) {
      sets.push("status_message = ?");
      values.push(patch.statusMessage);
    }
    if (patch.lastSyncAt !== undefined) {
      sets.push("last_sync_at = ?");
      values.push(patch.lastSyncAt);
    }
    this.db()
      .prepare(`UPDATE earn_source_connections SET ${sets.join(", ")} WHERE key = ?`)
      .run(...values, key);
  }

  /** 开始一次同步（status 'running'），返回运行行。 */
  startIngestRun(runId: string, sourceKey: string, mode: string): EarnIngestRunRow {
    const now = Date.now();
    this.db()
      .prepare(
        `INSERT INTO earn_ingest_runs (
           id, source_key, mode, status, started_at, finished_at,
           fetched, inserted, updated, duplicates, message, errors_json
         ) VALUES (?, ?, ?, 'running', ?, NULL, 0, 0, 0, 0, NULL, NULL)`,
      )
      .run(runId, sourceKey, mode, now);
    return {
      id: runId,
      source_key: sourceKey,
      mode,
      status: "running",
      started_at: now,
      finished_at: null,
      fetched: 0,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      message: null,
      errors_json: null,
    };
  }

  /** 收尾一次运行（诚实计数 + 消息；finished_at = now）。 */
  finishIngestRun(runId: string, finish: IngestRunFinish): void {
    this.db()
      .prepare(
        `UPDATE earn_ingest_runs SET
           status = ?, finished_at = ?, fetched = ?, inserted = ?, updated = ?,
           duplicates = ?, message = ?
         WHERE id = ?`,
      )
      .run(
        finish.status,
        Date.now(),
        finish.fetched,
        finish.inserted,
        finish.updated,
        finish.duplicates,
        finish.message,
        runId,
      );
  }

  /** 全部运行行，startedAt 降序（服务层取每源最新一条）。 */
  listIngestRunRows(): EarnIngestRunRow[] {
    return this.db()
      .prepare(
        `SELECT id, source_key, mode, status, started_at, finished_at,
                fetched, inserted, updated, duplicates, message, errors_json
         FROM earn_ingest_runs ORDER BY started_at DESC, id DESC`,
      )
      .all() as unknown as EarnIngestRunRow[];
  }
}
