/**
 * Hop3 — Stage 1 来源注册表 / 同步编排 / 用户链接收录 — 参考实现
 * source-service.ts 的重表达（经 IEarnService 冻结契约的 syncSource /
 * recordIntake / listSources 三方法）。
 *
 * 诚实纪律（沿用参考语义）：
 *  - blocked/error 的运行不插入任何 listing；计数器只数实际发生的事；
 *  - sandbox 运行由 listing 自身 provenance 'sandbox-fixture' 标注，绝不冒充 live；
 *  - live 运行尊重来源自己的最小刷新间隔（策略 rate limit 从注册表读出，从不虚构）；
 *  - url_intake 不做批量同步（一次一链接，经 recordIntake），参考实现在此抛错，
 *    冻结契约要求 IngestResult —— 以 status 'error' + 诚实 message 返回，不落任何行。
 */

import { randomUUID } from "node:crypto";
import {
  SOURCE_KEYS,
  type IngestResult,
  type IntakeResult,
  type OperationCapability,
  type SourceAdapter,
  type SourceConnectionDTO,
  type SourceKey,
  type SourcePolicy,
} from "@zcode/shared";
import { oneformaAdapter } from "./sources/oneforma.js";
import { upworkAdapter, UPWORK_BLOCKED_MESSAGE } from "./sources/upwork.js";
import { fiverrAdapter } from "./sources/fiverr.js";
import { urlIntakePolicy, ingestUserLink, assertPublicHttpUrl } from "./sources/url-intake.js";
import type { EarnRepo } from "./earnRepo.js";
import type { SourceConnectionSeed } from "./earnSourceStore.js";

const ADAPTERS: Partial<Record<SourceKey, SourceAdapter>> = {
  oneforma: oneformaAdapter,
  upwork_mcp: upworkAdapter,
  fiverr_mcp: fiverrAdapter,
};

const POLICIES: Record<SourceKey, SourcePolicy> = {
  oneforma: oneformaAdapter.policy,
  upwork_mcp: upworkAdapter.policy,
  fiverr_mcp: fiverrAdapter.policy,
  url_intake: urlIntakePolicy,
};

/** 首次播种时的初始运行模式（此后 mode 是运行时状态）。 */
const INITIAL_MODE: Record<SourceKey, SourceConnectionDTO["mode"]> = {
  oneforma: "live", // 匿名公共看板
  fiverr_mcp: "live", // 匿名 MCP 搜索（已验证探测）
  upwork_mcp: "blocked", // OAuth 2.1 必需，诚实不可用
  url_intake: "live", // 永远由用户驱动
};

const INITIAL_STATUS_MESSAGE: Partial<Record<SourceKey, string>> = {
  upwork_mcp: UPWORK_BLOCKED_MESSAGE,
};

// ---------------------------------------------------------------------------
// 注册表播种 + 读取
// ---------------------------------------------------------------------------

function seedsForRegistry(): SourceConnectionSeed[] {
  return SOURCE_KEYS.map((key) => {
    const policy = POLICIES[key];
    return {
      key,
      displayName: policy.displayName,
      sourceKind: policy.sourceKind,
      accessMode: policy.accessMode,
      actorModesJson: JSON.stringify(policy.actorModes),
      operationsJson: JSON.stringify(policy.operations),
      policyJson: JSON.stringify(policy),
      rankingPolicy: policy.rankingPolicy,
      rateLimitJson: JSON.stringify(policy.rateLimit),
      freshnessMaxHours: policy.freshness.maxAgeHours,
      mode: INITIAL_MODE[key],
      statusMessage: INITIAL_STATUS_MESSAGE[key] ?? null,
      evidenceUrl: policy.termsUrl ?? null,
    };
  });
}

async function ensureSourcesSeeded(repo: EarnRepo): Promise<void> {
  await repo.ensureReady();
  repo.sources.ensureSourcesSeeded(seedsForRegistry());
}

function parseJson(value: string | null | undefined): unknown {
  if (value == null || value.trim() === "") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 连接视图（含 live/sandbox/blocked 诚实状态 + 最新一次运行的诚实计数）。 */
export async function listSources(repo: EarnRepo): Promise<SourceConnectionDTO[]> {
  await ensureSourcesSeeded(repo);
  const rows = repo.sources.listSourceConnectionRows();
  const runs = repo.sources.listIngestRunRows();

  const latest = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    const current = latest.get(run.source_key);
    if (!current || run.started_at > current.started_at) latest.set(run.source_key, run);
  }

  const order = new Map(SOURCE_KEYS.map((key, index) => [key, index]));
  return rows
    .filter((row): row is (typeof rows)[number] & { key: SourceKey } =>
      SOURCE_KEYS.includes(row.key as SourceKey),
    )
    .sort((a, b) => (order.get(a.key as SourceKey) ?? 99) - (order.get(b.key as SourceKey) ?? 99))
    .map((row) => {
      const policy: SourcePolicy | undefined = POLICIES[row.key as SourceKey] ?? undefined;
      const actorModes = parseJson(row.actor_modes_json);
      const parsedOperations = parseJson(row.operations_json);
      const lastRun = latest.get(row.key);
      return {
        key: row.key as SourceKey,
        displayName: row.display_name,
        sourceKind: row.source_kind,
        accessMode: row.access_mode,
        actorModes: Array.isArray(actorModes)
          ? actorModes.filter((x): x is string => typeof x === "string")
          : [],
        // operations 列存的是注册时写入的 policy.operations JSON；坏值降级为空对象。
        operations: isRecord(parsedOperations)
          ? (parsedOperations as Record<string, OperationCapability>)
          : {},
        rankingPolicy: row.ranking_policy as SourceConnectionDTO["rankingPolicy"],
        mode: row.mode as SourceConnectionDTO["mode"],
        statusMessage: row.status_message,
        termsUrl: policy?.termsUrl ?? null,
        termsNotes: policy?.termsNotes ?? null,
        lastSyncAt: row.last_sync_at !== null ? new Date(row.last_sync_at).toISOString() : null,
        lastRun: lastRun
          ? {
              status: lastRun.status,
              mode: lastRun.mode,
              startedAt: new Date(lastRun.started_at).toISOString(),
              fetched: lastRun.fetched,
              inserted: lastRun.inserted,
              updated: lastRun.updated,
              duplicates: lastRun.duplicates,
              message: lastRun.message,
            }
          : null,
        payout: {
          methodKnown: policy?.payout.methodKnown ?? false,
          methods: policy?.payout.methods,
          threshold: policy?.payout.threshold,
          fees: policy?.payout.fees,
          cadence: policy?.payout.cadence,
          evidenceUrl: policy?.payout.evidenceUrl,
        },
      } satisfies SourceConnectionDTO;
    });
}

// ---------------------------------------------------------------------------
// 同步编排
// ---------------------------------------------------------------------------

function zeroCountResult(sourceKey: SourceKey, status: IngestResult["status"], message: string): IngestResult {
  return {
    sourceKey,
    runId: "",
    status,
    fetched: 0,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    message,
  };
}

/** 运行一次来源同步并诚实持久化一切（参考 syncSource 全流程）。 */
export async function syncSource(
  repo: EarnRepo,
  key: SourceKey,
  mode: "live" | "sandbox",
): Promise<IngestResult> {
  if (key === "url_intake") {
    // 参考实现在此抛错；冻结契约要求 IngestResult —— 返回诚实 error 结果，
    // 不落任何运行行（和参考一样，没有发生任何同步）。
    return zeroCountResult(
      "url_intake",
      "error",
      "Submitted links are added one at a time from the Sources tab; they are not batch-synced.",
    );
  }
  const adapter = ADAPTERS[key];
  if (!adapter) {
    return zeroCountResult(key, "error", `Unknown source "${String(key)}"`);
  }

  await ensureSourcesSeeded(repo);

  const connection = repo.sources.getSourceConnectionRow(key);
  const minRefreshMinutes =
    adapter.policy.freshness.minRefreshIntervalMinutes > 0
      ? adapter.policy.freshness.minRefreshIntervalMinutes
      : 0;

  // 尊重来源自身的 rate-limit 策略：live 运行在最小刷新间隔内的成功同步被礼貌拒绝。
  if (mode === "live" && connection?.last_sync_at) {
    const elapsedMinutes = (Date.now() - connection.last_sync_at) / 60_000;
    if (elapsedMinutes < minRefreshMinutes) {
      const wait = Math.max(1, Math.ceil(minRefreshMinutes - elapsedMinutes));
      const runId = `run-${randomUUID()}`;
      repo.sources.startIngestRun(runId, key, "live");
      repo.sources.finishIngestRun(runId, {
        status: "blocked",
        fetched: 0,
        inserted: 0,
        updated: 0,
        duplicates: 0,
        message: `Rate limit honored: this source asks for at least ${minRefreshMinutes} min between refreshes; try again in about ${wait} min (sandbox mode is always available).`,
      });
      repo.sources.updateSourceConnectionRuntime(key, {
        statusMessage: `Live sync refused by the rate-limit guard — retry in about ${wait} min. Sandbox sync is always available.`,
      });
      return {
        sourceKey: key,
        runId,
        status: "blocked",
        fetched: 0,
        inserted: 0,
        updated: 0,
        duplicates: 0,
        message: `Rate limit honored: this source asks for at least ${minRefreshMinutes} min between refreshes; try again in about ${wait} min (sandbox mode is always available).`,
      };
    }
  }

  const runId = `run-${randomUUID()}`;
  repo.sources.startIngestRun(runId, key, mode);

  let result;
  try {
    result = await adapter.run({ mode });
  } catch (err) {
    // 适配器应自行兜底；这是最后一道的诚实失败记录。
    const message = `Adapter crashed: ${err instanceof Error ? err.message : String(err)}`;
    repo.sources.finishIngestRun(runId, {
      status: "error",
      fetched: 0,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      message,
    });
    repo.sources.updateSourceConnectionRuntime(key, { statusMessage: message });
    return {
      sourceKey: key,
      runId,
      status: "error",
      fetched: 0,
      inserted: 0,
      updated: 0,
      duplicates: 0,
      message,
    };
  }

  const counts = repo.opportunities.ingestListings(result.listings);

  repo.sources.finishIngestRun(runId, {
    status: result.status,
    fetched: result.listings.length,
    inserted: counts.inserted,
    updated: counts.updated,
    duplicates: counts.duplicates,
    message: result.message ?? null,
  });

  repo.sources.updateSourceConnectionRuntime(key, {
    lastSyncAt: Date.now(),
    mode: result.status === "blocked" ? "blocked" : mode,
    statusMessage: result.message ?? null,
  });

  return {
    sourceKey: key,
    runId,
    status: result.status,
    fetched: result.listings.length,
    inserted: counts.inserted,
    updated: counts.updated,
    duplicates: counts.duplicates,
    message: result.message,
  };
}

// ---------------------------------------------------------------------------
// 用户提交链接收录（单条）
// ---------------------------------------------------------------------------

/**
 * 收录一条用户提交链接（provenance 'user-submitted'）：先做 SSRF 守卫校验
 * —— 参考实现在守卫失败时抛诚实错误（HTTP 400）；跨 RPC 通道同样以受控
 * rejection 携带诚实消息（与 upsertProfile 的纪律一致，不是 raw error）。
 */
export async function recordIntake(
  repo: EarnRepo,
  url: string,
  context?: string,
): Promise<IntakeResult> {
  await ensureSourcesSeeded(repo);

  const guard = assertPublicHttpUrl(url);
  if (!guard.ok) {
    throw new Error(`The link was not recorded: ${guard.reason}`);
  }

  const outcome = await ingestUserLink(url, context);
  const listing = outcome.listing;

  const existing = repo.opportunities.getOpportunityRowByExternalId("url_intake", listing.externalId);

  if (existing) {
    repo.opportunities.updateOpportunityForIntake(existing.id, listing);
    const runId = `run-${randomUUID()}`;
    repo.sources.startIngestRun(runId, "url_intake", "live");
    repo.sources.finishIngestRun(runId, {
      status: "ok",
      fetched: 1,
      inserted: 0,
      updated: 1,
      duplicates: 0,
      message: `Link already recorded — re-submitted and refreshed. ${outcome.fetchNote}`,
    });
    repo.sources.updateSourceConnectionRuntime("url_intake", {
      lastSyncAt: Date.now(),
      statusMessage: outcome.fetchNote,
    });
    return { opportunityId: existing.id, created: false, fetchNote: outcome.fetchNote };
  }

  const counts = repo.opportunities.ingestListings([listing]);
  const row = repo.opportunities.getOpportunityRowByExternalId("url_intake", listing.externalId);
  if (!row) {
    throw new Error("The link could not be recorded — ingest failed");
  }

  const runId = `run-${randomUUID()}`;
  repo.sources.startIngestRun(runId, "url_intake", "live");
  repo.sources.finishIngestRun(runId, {
    status: "ok",
    fetched: 1,
    inserted: counts.inserted,
    updated: counts.updated,
    duplicates: counts.duplicates,
    message: outcome.fetchNote,
  });
  repo.sources.updateSourceConnectionRuntime("url_intake", {
    lastSyncAt: Date.now(),
    statusMessage: outcome.fetchNote,
  });

  return { opportunityId: row.id, created: true, fetchNote: outcome.fetchNote };
}
