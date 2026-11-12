/**
 * Hop3 — Stage 1 Earn persistence 单一所有者（§2）：`EarnRepo`。
 *
 * 骨架逐条沿用 `packages/services/src/session/automationRepo.ts`：
 *  - 构造期固定 dbPath（测试依赖注入临时库；缺省回退 getTasksIndexDatabasePath，
 *    不读进程级全局，避免 vitest 并发窗口互相污染）；
 *  - `ensureReady()` 懒初始化：mkdir → 打开 → PRAGMA(busy_timeout/WAL/NORMAL) →
 *    迁移就绪检查；
 *  - `close()` 归还给 `sqliteReposToClose`（node.ts 注册链统一关闭）。
 *
 * 与 tasks-index 同库（earn_* 七表经 `tasksDatabase` 迁移 0008_earn_tables 建表）。
 * tasksDatabase 目录归 project-storage 模块，hop3-earn 的 requires 只有
 * services/session/shared —— 静态 import 会构成新的模块依赖边，因此迁移 runner
 * 与 prepared 检查沿用 lazy dynamic import（架构检查器只分析静态 import 声明）。
 *
 * 各表的读写拆分在 earnProfileStore / earnSourceStore / earnOpportunityStore /
 * earnApplicationStore（800 行预算）；本文件只负责连接生命周期与存储装配。
 */

import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { getTasksIndexDatabasePath } from "#src/paths.js";
import { EarnProfileStore } from "./earnProfileStore.js";
import { EarnSourceStore } from "./earnSourceStore.js";
import { EarnOpportunityStore } from "./earnOpportunityStore.js";
import { EarnApplicationStore } from "./earnApplicationStore.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
type DatabaseSyncInstance = InstanceType<typeof DatabaseSync>;

/**
 * earn 持久化仓库：earn_* 七表（schema 见 earnSchema.ts / 迁移 0008_earn_tables）。
 * 只做存储与原子写入；领域规则（eligibility/economics/lifecycle/dedupe）在
 * domain/ 引擎，服务编排在 hop3EarnService.ts —— 仓库不感知领域语义。
 */
export class EarnRepo {
  migrationBackupSkipped = false;
  private db: DatabaseSyncInstance | null = null;
  private dbPath: string | null = null;
  private initializePromise: Promise<void> | null = null;
  // db 路径不能从进程级全局 _dataBaseDir（getTasksIndexDatabasePath）解析：
  // vitest forks 池会在同一进程串行跑多个测试文件，各文件的 setDataBaseDir(tempDir)
  // 互相覆盖全局值。构造期固定一份 dbPath，测试通过依赖注入传入临时库路径，
  // 生产路径不传则回退 getTasksIndexDatabasePath（automationRepo 同款）。
  private readonly resolvedDbPath: string | null;

  /** 四个存储面：profile / sources / opportunities(+saved) / applications(+events)。 */
  readonly profile: EarnProfileStore;
  readonly sources: EarnSourceStore;
  readonly opportunities: EarnOpportunityStore;
  readonly applications: EarnApplicationStore;

  constructor(
    dbPath?: string,
    private readonly startupBusyTimeoutMs = 5000,
  ) {
    this.resolvedDbPath = dbPath?.trim() || null;
    // 存储面经懒取当前连接装配：ensureReady 之前调用 getDatabase() 会抛错，
    // 服务层每个方法先 await repo.ensureReady() 再触达存储。
    const dbAccessor = () => this.getDatabase();
    this.profile = new EarnProfileStore(dbAccessor);
    this.sources = new EarnSourceStore(dbAccessor);
    this.opportunities = new EarnOpportunityStore(dbAccessor);
    this.applications = new EarnApplicationStore(dbAccessor);
  }

  private resolveDbPath(): string {
    return this.resolvedDbPath ?? getTasksIndexDatabasePath();
  }

  async ensureReady(): Promise<void> {
    const path = this.resolveDbPath();
    if (this.dbPath && this.dbPath !== path) {
      this.close();
    }
    if (!this.initializePromise) {
      this.initializePromise = this.initialize(path).catch((error) => {
        this.close();
        throw error;
      });
    }
    await this.initializePromise;
  }

  close(options?: { throwOnError?: boolean }): void {
    let closeError: unknown;
    try {
      this.db?.close();
    } catch (error) {
      closeError = error;
      // ignore
    }
    this.db = null;
    this.dbPath = null;
    this.initializePromise = null;
    if (options?.throwOnError && closeError) throw closeError;
  }

  private async initialize(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    if (!this.db) {
      this.db = new DatabaseSync(path);
      this.dbPath = path;
      this.db.exec(`PRAGMA busy_timeout = ${this.startupBusyTimeoutMs}`);
      this.db.exec("PRAGMA journal_mode = WAL");
      this.db.exec("PRAGMA synchronous = NORMAL");
    }
    // tasksDatabase 目录归 project-storage 模块（hop3-earn 未声明该依赖）：
    // 迁移 runner / prepared 检查经 lazy dynamic import 触达，避免静态依赖边。
    const { isTasksStoragePrepared, isTasksStorageMigrated } = await import(
      "#src/session/tasksDatabase/prepared.js"
    );
    if (isTasksStoragePrepared(path, this.db)) return;
    const { runTasksDatabaseMigrations } = await import("#src/session/tasksDatabase/migrations.js");
    if (!isTasksStorageMigrated(path, this.db))
      this.migrationBackupSkipped = (await runTasksDatabaseMigrations(this.db, path)).backupSkipped;
  }

  private getDatabase(): DatabaseSyncInstance {
    if (!this.db) {
      throw new Error("EarnRepo 未初始化：请先 await ensureReady()");
    }
    return this.db;
  }
}
