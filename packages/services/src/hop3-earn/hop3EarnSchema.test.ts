/**
 * Hop3 — Earn 表结构防漂移测试（stage1/earn-port §2 gate）。
 *
 * EARN_SCHEMA（earnSchema.ts）是 0008_earn_tables 迁移的 checksum 冻结事实源；
 * migrations.ts 内嵌一份必须字节一致的副本。两处任何一处被单独修改都会改变
 * 迁移 checksum 或造成账本漂移 —— 本文件以严格相等守护两份文本，并顺带校验：
 *  - earnSchema.ts 自身导出的 EARN_SCHEMA 与其源文件内联模板字面量一致；
 *  - 七张 earn_* 表全部出现在 DDL 中，且没有 CREATE TABLE 漏写进 EARN_TABLES；
 *  - 机会表带 UNIQUE(source_key, external_id)（同源去重的唯一事实）。
 */

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { EARN_SCHEMA, EARN_TABLES } from "./earnSchema.js";

function readSource(relative: string): Promise<string> {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

/** 从 TypeScript 源文件里截取 `const NAME = \`` 模板字面量的原文（反引号之间）。 */
function extractTemplateLiteral(source: string, name: string): string {
  const declaration = source.indexOf(`const ${name} = \``);
  expect(declaration, `源文件应包含 “const ${name} = \``).toBeGreaterThanOrEqual(0);
  const start = declaration + `const ${name} = \``.length;
  const end = source.indexOf("`;", start);
  expect(end, `模板字面量 “${name}” 应以反引号收束`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("hop3-earn earnSchema（0008_earn_tables 防漂移）", () => {
  it("EARN_SCHEMA 与 earnSchema.ts 源文件内联模板字面量字节一致", async () => {
    const source = await readSource("./earnSchema.ts");
    expect(extractTemplateLiteral(source, "EARN_SCHEMA")).toBe(EARN_SCHEMA);
  });

  it("migrations.ts 内嵌的 EARN_SCHEMA_SQL 与 EARN_SCHEMA 字节一致（迁移 checksum 事实源）", async () => {
    const migrationsSource = await readSource(
      "../session/tasksDatabase/migrations.ts",
    );
    const inline = extractTemplateLiteral(migrationsSource, "EARN_SCHEMA_SQL");
    expect(inline).toBe(EARN_SCHEMA);
  });

  it("migrations.ts 以 EARN_SCHEMA_SQL 为 0008_earn_tables 的 checksumInput 并执行同一段 SQL", async () => {
    const migrationsSource = await readSource(
      "../session/tasksDatabase/migrations.ts",
    );
    expect(migrationsSource).toContain('id: "0008_earn_tables"');
    expect(migrationsSource).toContain("checksumInput: [EARN_SCHEMA_SQL]");
    expect(migrationsSource).toContain("apply: (db: DatabaseSync) => db.exec(EARN_SCHEMA_SQL)");
  });

  it("七张 earn_* 表逐张出现在 DDL 中，EARN_TABLES 无缺漏、无多余", () => {
    expect(EARN_TABLES).toHaveLength(7);
    for (const table of EARN_TABLES) {
      expect(EARN_SCHEMA).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    }
    const declared = new Set<string>(EARN_TABLES);
    for (const match of EARN_SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(/g)) {
      const table = match[1] ?? "";
      expect(declared.has(table), `DDL 中出现未登记的表 ${table}`).toBe(true);
    }
  });

  it("机会表保持 (source_key, external_id) 唯一约束（同源去重事实）", () => {
    expect(EARN_SCHEMA).toContain("UNIQUE (source_key, external_id)");
  });

  it("结构化载荷一律 JSON TEXT 列（SQLite 约束沿用 tasksDatabase 风格）", () => {
    expect(EARN_SCHEMA).toMatch(/eligibility_json TEXT/);
    expect(EARN_SCHEMA).toMatch(/raw_json TEXT/);
    expect(EARN_SCHEMA).toMatch(/languages_json TEXT/);
    // 时间戳为 INTEGER epoch 毫秒；布尔为 INTEGER 0/1；金额为 REAL。
    expect(EARN_SCHEMA).toMatch(/first_seen_at INTEGER NOT NULL/);
    expect(EARN_SCHEMA).toMatch(/draft_edited_by_user INTEGER NOT NULL DEFAULT 0/);
    expect(EARN_SCHEMA).toMatch(/amount_paid REAL/);
  });
});
