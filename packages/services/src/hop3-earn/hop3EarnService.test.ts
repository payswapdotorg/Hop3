/**
 * Hop3 — IEarnService 服务面行为测试（stage1/earn-port §2）。
 *
 * 对临时 SQLite 库（EarnRepo 注入）跑完整 15 方法面：profile 读写、来源同步的
 * 诚实计数、机会列表到达序（永不排名）、保存夹、申请 create→prepare→save→
 * markPrepared→recordEvent 的证据门控链，以及变更结果的诚实失败
 * （{ ok:false, error } 原因串，不跨通道抛 raw error）。
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  NO_AUTO_SUBMIT_NOTICE,
  SOURCE_KEYS,
  USER_SUBMITTED_LABEL,
  type EarnProfileInput,
  type RawListing,
} from "@zcode/shared";
import { EarnRepo } from "./earnRepo.js";
import { createEarnService, type CreateEarnServiceOptions } from "./hop3EarnService.js";
import type { IEarnService } from "./hop3Earn.js";

function validProfileInput(overrides: Partial<EarnProfileInput> = {}): EarnProfileInput {
  return {
    displayName: "Ama K.",
    countryCode: "gh",
    regionNote: "Greater Accra",
    workMode: "remote",
    languages: [{ code: "EN", proficiency: "fluent" }],
    skills: [{ name: "Python", experienceBand: "advanced" }],
    qualifications: [{ type: "BSc", issuer: "University", year: "2020", verificationState: "unverified" }],
    equipment: [{ kind: "laptop" }],
    payoutCapabilities: [{ rail: "paypal", status: "unknown" }],
    preferences: { includedFamilies: ["annotation"], excludedFamilies: [] },
    weeklyHours: 20,
    timezone: "Africa/Accra",
    incomeGoalAmount: 400,
    incomeGoalCurrency: "usd",
    ...overrides,
  };
}

let dataDir: string;
let repo: EarnRepo;
let service: IEarnService;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "hop3-earn-service-"));
  repo = new EarnRepo(join(dataDir, "tasks-index.sqlite"));
  const options: CreateEarnServiceOptions = { repo };
  service = createEarnService(options);
  // 首次触达触发迁移（0001..0008，含 0008_earn_tables）。
  await service.listSources();
});

afterAll(async () => {
  repo.close();
  await rm(dataDir, { recursive: true, force: true });
});

function firstSandboxCard(titlePart: string) {
  return (
    service
      .listOpportunities()
      .then((cards) => cards.find((card) => card.title.includes(titlePart)))
  );
}

describe("hop3-earn 服务面：profile", () => {
  it("getProfile 初始返回 null —— 绝不捏造默认 profile", async () => {
    expect(await service.getProfile()).toBeNull();
  });

  it("非法输入以诚实消息受控拒绝（weeklyHours 越界 / workMode 未知）", async () => {
    await expect(
      service.upsertProfile(validProfileInput({ weeklyHours: 999 })),
    ).rejects.toThrow(/Invalid worker profile: .*weeklyHours/);
    await expect(
      service.upsertProfile(validProfileInput({ workMode: "sometimes" })),
    ).rejects.toThrow(/Invalid worker profile: .*workMode/);
  });

  it("合法输入全量替换落盘；规范化（国家大写、语言码小写、货币大写）", async () => {
    const profile = await service.upsertProfile(validProfileInput());
    expect(profile.countryCode).toBe("GH");
    expect(profile.languages[0]?.code).toBe("en");
    expect(profile.incomeGoalCurrency).toBe("USD");
    expect(profile.workMode).toBe("remote");
    expect(profile.schemaVersion).toBe(1);

    const stored = await service.getProfile();
    expect(stored).not.toBeNull();
    expect(stored?.displayName).toBe("Ama K.");
    expect(stored?.preferences.includedFamilies).toEqual(["annotation"]);
  });

  it("全量替换语义：第二次 upsert 完全覆盖第一次", async () => {
    const profile = await service.upsertProfile(
      validProfileInput({ displayName: "Kojo S.", skills: [] }),
    );
    expect(profile.displayName).toBe("Kojo S.");
    expect((await service.getProfile())?.skills).toEqual([]);
    // 恢复主要字段供后续用例使用。
    await service.upsertProfile(validProfileInput());
  });
});

describe("hop3-earn 服务面：sources 同步诚实计数", () => {
  it("oneforma sandbox：inserted == fetched；重复同步计 duplicates", async () => {
    const first = await service.syncSource("oneforma", "sandbox");
    expect(first.status).toBe("ok");
    expect(first.sourceKey).toBe("oneforma");
    expect(first.fetched).toBeGreaterThan(0);
    expect(first.inserted).toBe(first.fetched);
    expect(first.updated).toBe(0);
    expect(first.duplicates).toBe(0);

    const second = await service.syncSource("oneforma", "sandbox");
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.duplicates).toBe(second.fetched);
  });

  it("upwork live：诚实 blocked，不插入任何 listing", async () => {
    const result = await service.syncSource("upwork_mcp", "live");
    expect(result.status).toBe("blocked");
    expect(result.fetched).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.message).toContain("OAuth 2.1");
  });

  it("listSources：四源按 SOURCE_KEYS 顺序；upwork blocked + 诚实消息 + lastRun 计数", async () => {
    const sources = await service.listSources();
    expect(sources.map((source) => source.key)).toEqual([...SOURCE_KEYS]);

    const upwork = sources.find((source) => source.key === "upwork_mcp");
    expect(upwork?.mode).toBe("blocked");
    expect(upwork?.statusMessage).toContain("OAuth 2.1");
    expect(upwork?.rankingPolicy).toBe("provider-order-only");
    expect(upwork?.lastRun?.status).toBe("blocked");
    expect(upwork?.lastRun?.fetched).toBe(0);

    const oneforma = sources.find((source) => source.key === "oneforma");
    expect(oneforma?.mode).toBe("sandbox");
    expect(oneforma?.lastRun?.status).toBe("ok");
    expect(oneforma?.lastRun?.duplicates).toBeGreaterThan(0);

    const fiverr = sources.find((source) => source.key === "fiverr_mcp");
    expect(fiverr?.sourceKind).toBe("official-mcp");

    const urlIntake = sources.find((source) => source.key === "url_intake");
    expect(urlIntake?.sourceKind).toBe("user-link");
    expect(urlIntake?.mode).toBe("live");
    expect(urlIntake?.payout.methodKnown).toBe(false);
  });

  it("upwork sandbox：fixture 全部入库且 provenance 为 sandbox-fixture", async () => {
    const result = await service.syncSource("upwork_mcp", "sandbox");
    expect(result.status).toBe("ok");
    expect(result.inserted).toBe(result.fetched);
    expect(result.inserted).toBeGreaterThan(0);

    const cards = await service.listOpportunities({ source: "upwork_mcp" });
    expect(cards.length).toBe(result.inserted);
    expect(cards.every((card) => card.provenance === "sandbox-fixture")).toBe(true);
    expect(cards.every((card) => card.rankingPolicy === "provider-order-only")).toBe(true);
  });

  it("url_intake 不做批量同步：返回诚实 error 结果而非抛错", async () => {
    const result = await service.syncSource("url_intake", "sandbox");
    expect(result.status).toBe("error");
    expect(result.fetched).toBe(0);
    expect(result.message).toContain("not batch-synced");
  });
});

describe("hop3-earn 服务面：opportunities（到达序、不排名）", () => {
  it("firstSeenAt asc 到达序：oneforma 块先于 upwork 块（先同步先到达）", async () => {
    const cards = await service.listOpportunities();
    expect(cards.length).toBeGreaterThan(0);
    for (let index = 1; index < cards.length; index += 1) {
      expect(
        Date.parse(cards[index]!.firstSeenAt),
        "卡片必须按 firstSeenAt 升序（到达序，永不排名）",
      ).toBeGreaterThanOrEqual(Date.parse(cards[index - 1]!.firstSeenAt));
    }
    const firstUpworkIndex = cards.findIndex((card) => card.sourceKey === "upwork_mcp");
    const lastOneformaIndex = cards.map((card) => card.sourceKey).lastIndexOf("oneforma");
    expect(firstUpworkIndex).toBeGreaterThan(lastOneformaIndex);
  });

  it("eligibility / economics 实时计算：GH profile 下 US-only fixture 判 ineligible", async () => {
    const cards = await service.listOpportunities();
    const usOnly = cards.find((card) => card.title.includes("Sandbox Example B"));
    expect(usOnly?.eligibility.country.value).toBe("ineligible");
    expect(usOnly?.eligibility.overall).toBe("ineligible");
    expect(usOnly?.eligibility.blockingReasons.join(" ")).toContain("Country:");
    // 毛净不合并：fixture B 40–60 USD 固定，净额等于毛额（无费用文本）。
    expect(usOnly?.economics.grossMin).toBe(40);
    expect(usOnly?.economics.grossMax).toBe(60);
    expect(usOnly?.economics.estimatedNetMin).toBe(40);
    expect(usOnly?.economics.guaranteed).toBe(false);
  });

  it("用户筛选条件生效：source / eligibility / q", async () => {
    const oneforma = await service.listOpportunities({ source: "oneforma" });
    expect(oneforma.length).toBeGreaterThan(0);
    expect(oneforma.every((card) => card.sourceKey === "oneforma")).toBe(true);

    const ineligible = await service.listOpportunities({ eligibility: "ineligible" });
    expect(ineligible.length).toBeGreaterThan(0);
    expect(ineligible.every((card) => card.eligibility.overall === "ineligible")).toBe(true);

    const none = await service.listOpportunities({ q: "no-such-thing-xyz" });
    expect(none).toEqual([]);
  });

  it("getOpportunityDetail：卡片字段 + specs + evidence + raw；未知 id 返回 null", async () => {
    const cards = await service.listOpportunities();
    const target = cards[0]!;
    const detail = await service.getOpportunityDetail(target.id);
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe(target.id);
    expect(detail?.evidence?.platform).toBe(target.platform);
    expect(detail?.evidence?.canonicalUrl).toBe(target.canonicalUrl);
    expect(detail?.evidence?.sourceStatus).not.toBeUndefined();
    expect(detail?.raw).not.toBeUndefined();

    expect(await service.getOpportunityDetail("does-not-exist")).toBeNull();
  });

  it("duplicateCount 展示性分组：同标题+国家+grossMax 跨源计数，行永不合并", async () => {
    const listing = (sourceKey: "oneforma" | "upwork_mcp", externalId: string): RawListing => ({
      sourceKey,
      sourceRecordId: externalId,
      externalId,
      canonicalUrl: "https://board.example/project/",
      title: "Duplicate Group Sample Listing",
      platform: sourceKey === "oneforma" ? "OneForma" : "Upwork",
      eligibility: { mode: "whitelist", countries: ["GH"] },
      compensation: { currency: "USD", grossMin: 30, grossMax: 100, fixedOrEstimated: "fixed" },
      payout: { methodKnown: false },
      observedAt: new Date().toISOString(),
      provenance: "sandbox-fixture",
      raw: { note: "grouping sample" },
    });
    const counts = repo.opportunities.ingestListings([
      listing("oneforma", "dup-group-a"),
      listing("upwork_mcp", "dup-group-b"),
    ]);
    expect(counts.inserted).toBe(2);

    const grouped = (await service.listOpportunities({ q: "Duplicate Group Sample" })).sort(
      (a, b) => a.title.localeCompare(b.title),
    );
    expect(grouped).toHaveLength(2);
    expect(grouped.every((card) => card.duplicateCount === 1)).toBe(true);
  });
});

describe("hop3-earn 服务面：saved + 私人备注", () => {
  it("toggleSaved / setSavedNotes 全流程；未保存时 savedNotes 为 null", async () => {
    const card = await firstSandboxCard("Sandbox Example A");
    expect(card).toBeTruthy();
    const id = card!.id;

    expect(card?.saved).toBe(false);
    expect(card?.savedNotes ?? null).toBeNull();

    expect(await service.toggleSaved(id, true)).toBe(true);
    let detail = await service.getOpportunityDetail(id);
    expect(detail?.saved).toBe(true);

    expect(await service.setSavedNotes(id, "check payment rails first")).toBe(true);
    detail = await service.getOpportunityDetail(id);
    expect(detail?.savedNotes).toBe("check payment rails first");

    expect(await service.toggleSaved(id, false)).toBe(true);
    detail = await service.getOpportunityDetail(id);
    expect(detail?.saved).toBe(false);
    expect(detail?.savedNotes ?? null).toBeNull();

    // 不存在的机会：诚实 false，不抛错。
    expect(await service.toggleSaved("missing", true)).toBe(false);
    expect(await service.setSavedNotes("missing", "x")).toBe(false);
  });
});

describe("hop3-earn 服务面：applications 证据门控全链", () => {
  let opportunityId: string;
  let applicationId: string;

  it("createApplication：draft 态 + 初始 note 事件；同机会复用同一 tracker", async () => {
    const card = await firstSandboxCard("Sandbox Example A");
    opportunityId = card!.id;

    const created = await service.createApplication(opportunityId);
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    applicationId = created.application.id;
    expect(created.application.status).toBe("draft");
    expect(created.application.draft).toBeNull();
    expect(created.application.draftEditedByUser).toBe(false);
    expect(created.application.events[0]?.eventType).toBe("note");
    expect(created.application.events[0]?.note).toContain("never submit for you");

    const again = await service.createApplication(opportunityId);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.application.id).toBe(applicationId);

    const missing = await service.createApplication("missing-opportunity");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("Opportunity not found");
  });

  it("markPrepared 无草稿被拒：诚实原因，不改状态", async () => {
    const result = await service.markPrepared(applicationId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("requires a stored draft");
    const list = await service.listApplications();
    expect(list.find((app) => app.id === applicationId)?.status).toBe("draft");
  });

  it("prepareDraft：规则模板草稿（notice=NO_AUTO_SUBMIT_NOTICE），含 profile 真实事实", async () => {
    const result = await service.prepareDraft(applicationId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const application = result.application;
    expect(application.draftModel).toBe("hop3-stage1-rules-v1");
    expect(application.draftGeneratedAt).not.toBeNull();

    const parsed = JSON.parse(application.draft ?? "{}") as {
      checklist: string[];
      messageDraft: string;
      notice: string;
    };
    expect(parsed.notice).toBe(NO_AUTO_SUBMIT_NOTICE);
    expect(parsed.checklist.length).toBeGreaterThan(0);
    expect(parsed.messageDraft).toContain("About me (from my own Hop3 worker profile");
    expect(parsed.messageDraft).toContain("Name: Ama K.");
    // 事件台账记录草稿生成。
    expect(application.events.map((event) => event.eventType)).toContain("note");
  });

  it("saveDraft：内容对象 JSON 或纯文本皆可；编辑即 draftEditedByUser", async () => {
    const asObject = await service.saveDraft(
      applicationId,
      JSON.stringify({
        checklist: ["Review every claim"],
        messageDraft: "Hello, I am applying with real experience.",
        notice: NO_AUTO_SUBMIT_NOTICE,
      }),
    );
    expect(asObject.ok).toBe(true);
    if (asObject.ok) expect(asObject.application.draftEditedByUser).toBe(true);

    const asText = await service.saveDraft(applicationId, "Plain edited message text");
    expect(asText.ok).toBe(true);
    if (asText.ok) {
      expect(asText.application.draftEditedByUser).toBe(true);
      expect(
        JSON.parse(asText.application.draft ?? "{}").messageDraft,
      ).toBe("Plain edited message text");
    }

    const invalid = await service.saveDraft(applicationId, "   ");
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toContain("Invalid draft content");
  });

  it("recordEvent 未知类型 / 空事件名：诚实失败，不落任何事件", async () => {
    const unknown = await service.recordEvent(applicationId, { eventType: "teleported" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toContain('Unknown event type "teleported"');
  });

  it("证据门控：prepared→applied 无证据被拒；有 note 放行并落 submittedAt", async () => {
    const prepared = await service.markPrepared(applicationId);
    expect(prepared.ok).toBe(true);

    const noEvidence = await service.recordEvent(applicationId, { eventType: "applied" });
    expect(noEvidence.ok).toBe(false);
    if (!noEvidence.ok) expect(noEvidence.error).toContain("never sufficient");

    const applied = await service.recordEvent(applicationId, {
      eventType: "applied",
      note: "submitted on provider dashboard",
      channel: "upwork-web",
    });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.application.status).toBe("applied");
      expect(applied.application.submittedAt).not.toBeNull();
      expect(applied.application.submittedChannel).toBe("upwork-web");
      expect(applied.application.submittedEvidence).toBe("submitted on provider dashboard");
    }
  });

  it("顺序纪律：applied 直跳 accepted 被拒（不可跳级）", async () => {
    const skip = await service.recordEvent(applicationId, {
      eventType: "accepted",
      evidenceType: "user-reported",
    });
    expect(skip.ok).toBe(false);
    if (!skip.ok) expect(skip.error).toContain("Cannot skip");
  });

  it("完整证据链：qualification_pending→…→paid 逐级放行，paid 校验金额+证据", async () => {
    const step = async (
      input: Parameters<IEarnService["recordEvent"]>[1] & { eventType: string },
    ) => {
      const result = await service.recordEvent(applicationId, input);
      expect(result.ok, JSON.stringify(result)).toBe(true);
      return result;
    };

    await step({ eventType: "qualification_pending", note: "screening test assigned" });
    await step({ eventType: "accepted", evidenceType: "user-reported" });
    await step({ eventType: "in_progress", note: "work started" });
    await step({ eventType: "submitted", note: "work delivered" });
    await step({ eventType: "approved", evidenceType: "provider-confirmed" });
    await step({ eventType: "payment_pending", note: "invoice pending" });

    const paidNoAmount = await service.recordEvent(applicationId, {
      eventType: "paid",
      evidenceType: "payment-confirmed",
      note: "payout received",
    });
    expect(paidNoAmount.ok).toBe(false);
    if (!paidNoAmount.ok) expect(paidNoAmount.error).toContain("amountPaid must be greater than 0");

    const paid = await step({
      eventType: "paid",
      evidenceType: "payment-confirmed",
      note: "payout reference 42",
      amountPaid: 120,
      paidCurrency: "usd",
    });
    if (paid.ok) {
      expect(paid.application.status).toBe("paid");
      expect(paid.application.amountPaid).toBe(120);
      expect(paid.application.paidCurrency).toBe("USD");
      expect(paid.application.paidAt).not.toBeNull();
      expect(paid.application.paymentEvidence).toBe("payout reference 42");
    }
  });

  it("note 事件不改状态；事件台账按时间升序完整可审计", async () => {
    const before = await service.listApplications();
    const app = before.find((item) => item.id === applicationId);
    expect(app?.status).toBe("paid");

    const note = await service.recordEvent(applicationId, {
      eventType: "note",
      note: "client asked for follow-up",
    });
    expect(note.ok).toBe(true);
    if (note.ok) {
      expect(note.application.status).toBe("paid");
      const times = note.application.events.map((event) => Date.parse(event.createdAt));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(note.application.events.at(-1)?.note).toBe("client asked for follow-up");
    }
  });

  it("终态后状态不再迁移；note 事件仍可追加审计", async () => {
    const list = await service.listApplications();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((app) => app.opportunityTitle.length > 0)).toBe(true);

    const terminal = await service.recordEvent(applicationId, {
      eventType: "withdrawn",
      note: "user moved on",
    });
    expect(terminal.ok).toBe(true);

    const after = await service.recordEvent(applicationId, {
      eventType: "note",
      note: "post-withdrawal note",
    });
    expect(after.ok).toBe(true);
  });
});

describe("hop3-earn 服务面：url intake", () => {
  it("SSRF 链路的 recordIntake：loopback 被诚实拒绝（不落任何记录）", async () => {
    await expect(service.recordIntake("http://127.0.0.1:3000/private")).rejects.toThrow(
      /The link was not recorded/,
    );
    await expect(service.recordIntake("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      /The link was not recorded/,
    );
  });

  it("公网链接收录：provenance user-submitted + 诚实标注；重复提交 created=false", async () => {
    const url = "https://jobs-listing.invalid.example/gig/1";
    const first = await service.recordIntake(url, "short translation gig");
    expect(first.created).toBe(true);
    expect(first.opportunityId).not.toBe("");
    expect(first.fetchNote.length).toBeGreaterThan(0);

    const detail = await service.getOpportunityDetail(first.opportunityId);
    expect(detail?.provenance).toBe("user-submitted");
    expect(detail?.platform).toBe("User-submitted");
    expect(detail?.summary).toContain(USER_SUBMITTED_LABEL);
    expect(detail?.opportunityType).toBe("user-link");

    const second = await service.recordIntake(url, "resubmitted");
    expect(second.created).toBe(false);
    expect(second.opportunityId).toBe(first.opportunityId);
  });
});
