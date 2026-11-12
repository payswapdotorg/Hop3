/**
 * Hop3 — 来源适配器测试（stage1/earn-port §2）。
 *
 * 只测确定性行为，不做真实网络请求：
 *  - sandbox 模式返回确定性 fixture（provenance 恒 'sandbox-fixture'，绝不冒充 live）；
 *  - upwork live 诚实 blocked（OAuth 2.1 消息，无抓取回退、无凭据存储）；
 *  - upwork 策略保持 provider-order-only（供应方顺序保留，Hop3 永不排名）；
 *  - url-intake SSRF 守卫：loopback / 私网 / 链路本地 / 云元数据端点 / 非 http(s) 一律拒绝。
 */

import { describe, expect, it } from "vitest";
import { SANDBOX_FIXTURE_LABEL } from "@zcode/shared";
import { oneformaAdapter } from "./sources/oneforma.js";
import { upworkAdapter, UPWORK_BLOCKED_MESSAGE } from "./sources/upwork.js";
import { fiverrAdapter } from "./sources/fiverr.js";
import { assertPublicHttpUrl } from "./sources/url-intake.js";
import { oneformaFixtures, upworkFixtures, fiverrFixtures } from "./sources/sandbox-fixtures.js";

describe("hop3-earn 来源适配器（sandbox / blocked / SSRF）", () => {
  it("oneforma sandbox：确定性 fixture，provenance 恒 sandbox-fixture", async () => {
    const result = await oneformaAdapter.run({ mode: "sandbox" });
    expect(result.status).toBe("ok");
    expect(result.mode).toBe("sandbox");
    expect(result.listings.length).toBeGreaterThan(0);
    expect(result.listings.every((listing) => listing.provenance === "sandbox-fixture")).toBe(true);
    expect(result.listings.every((listing) => listing.sourceKey === "oneforma")).toBe(true);

    // 内容确定性：同一进程两次取 fixture，稳定字段（id/标题/国家）完全一致。
    const [a, b] = [oneformaFixtures(), oneformaFixtures()];
    expect(a.map((l) => [l.externalId, l.title, l.eligibility?.countries?.join(",")])).toEqual(
      b.map((l) => [l.externalId, l.title, l.eligibility?.countries?.join(",")]),
    );
  });

  it("upwork sandbox：provider order 保留的只读模仿，绝不标 live", async () => {
    const result = await upworkAdapter.run({ mode: "sandbox" });
    expect(result.status).toBe("ok");
    expect(result.message).toContain("no Hop3 ranking");
    expect(result.listings.every((listing) => listing.provenance === "sandbox-fixture")).toBe(true);

    const [a, b] = [upworkFixtures(), upworkFixtures()];
    expect(a.map((l) => l.externalId)).toEqual(b.map((l) => l.externalId));
    expect(result.listings.map((l) => l.externalId)).toEqual(a.map((l) => l.externalId));
  });

  it("upwork live：诚实 blocked + OAuth 2.1 交接消息；无抓取回退、无凭据", async () => {
    const result = await upworkAdapter.run({ mode: "live" });
    expect(result.status).toBe("blocked");
    expect(result.mode).toBe("live");
    expect(result.listings).toEqual([]);
    expect(result.message).toBe(UPWORK_BLOCKED_MESSAGE);
    expect(UPWORK_BLOCKED_MESSAGE).toContain("OAuth 2.1");
    expect(UPWORK_BLOCKED_MESSAGE).toContain("does not store credentials");
  });

  it("upwork 策略：rankingPolicy provider-order-only（供应方顺序保留）", () => {
    expect(upworkAdapter.key).toBe("upwork_mcp");
    expect(upworkAdapter.policy.rankingPolicy).toBe("provider-order-only");
    expect(upworkAdapter.policy.operations.submit.allowed).toBe(false);
    expect(upworkAdapter.policy.operations.pay.allowed).toBe(false);
    expect(upworkAdapter.policy.auth).toBe("oauth");
  });

  it("fiverr sandbox：匿名 buyer-side 研究模仿，标记 sandbox-fixture", async () => {
    const result = await fiverrAdapter.run({ mode: "sandbox" });
    expect(result.status).toBe("ok");
    expect(result.listings.length).toBeGreaterThan(0);
    expect(result.listings.every((listing) => listing.provenance === "sandbox-fixture")).toBe(true);
    expect(fiverrAdapter.key).toBe("fiverr_mcp");
    // Fiverr 供买家研究：排在消息里明说 provider order，无 Hop3 排名。
    expect(result.message).toContain("provider order");
  });

  it("sandbox 文案与共享诚实常量一致（绝不伪装 live）", () => {
    expect(SANDBOX_FIXTURE_LABEL).toContain("Sandbox fixture");
  });

  it("oneforma 策略：public-board 匿名读板，robots 运行时复核", () => {
    expect(oneformaAdapter.key).toBe("oneforma");
    expect(oneformaAdapter.policy.sourceKind).toBe("public-board");
    expect(oneformaAdapter.policy.auth).toBe("anonymous");
    expect(oneformaAdapter.policy.operations.search.allowed).toBe(true);
    expect(oneformaAdapter.policy.operations.submit.allowed).toBe(false);
  });
});

describe("hop3-earn url-intake SSRF 守卫", () => {
  const rejected = [
    "http://localhost:3000/jobs",
    "http://127.0.0.1/jobs",
    "http://0.0.0.0/",
    "http://10.0.0.5/jobs",
    "http://172.16.0.1/jobs",
    "http://192.168.1.10/jobs",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://[::1]/jobs",
    "http://[fe80::1]/jobs",
    "http://[fc00::1]/jobs",
    "http://[fd12::1]/jobs",
    "http://host.internal/jobs",
    "http://printer.local/",
    "http://service.internal/jobs",
    "ftp://example.com/file",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "not a url",
  ];

  it.each(rejected)("拒绝不可公开访问的 URL：%s", (url) => {
    const guard = assertPublicHttpUrl(url);
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.reason.length).toBeGreaterThan(0);
      expect(guard.reason).not.toContain("undefined");
    }
  });

  it("公网 http(s) URL 放行", () => {
    expect(assertPublicHttpUrl("https://www.oneforma.com/projects/").ok).toBe(true);
    expect(assertPublicHttpUrl("http://example.com/jobs/1").ok).toBe(true);
  });
});
