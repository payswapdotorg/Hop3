/**
 * Hop3 — 四个领域引擎的规则测试（stage1/earn-port §2）。
 *
 * 移植参考实现 lib/domain/*.ts 的断言精神：引擎是纯函数，无 DB、无 fetch。
 * 核心纪律逐条守护：
 *  - 未知（unknown）永远不会被判成 eligible；
 *  - 毛收入/净收入永不合并，估计永不保证（guaranteed 恒 false）；
 *  - 技能缺口是 needs_user_input，绝不是 ineligible；
 *  - 生命周期迁移证据门控：点击或生成文本永不足以推进状态；
 *  - Upwork 供应方顺序保留（rankingPolicy 由适配器策略测试覆盖）。
 */

import { describe, expect, it } from "vitest";
import {
  PAYOUT_UNKNOWN_DISCLAIMER,
  type EligibilitySpec,
  type ProfileDTO,
  type RequirementsSpec,
} from "@zcode/shared";
import { evaluateEligibility } from "./domain/eligibility.js";
import { computeEconomics, type EconomicsFacts } from "./domain/economics.js";
import {
  applyTransitionFields,
  canTransition,
  isTerminalApplicationStatus,
  type TransitionEvidence,
} from "./domain/lifecycle.js";
import { crossSourceGroupKey, normalizeUrl, externalIdForUrl } from "./domain/dedupe.js";

function profile(overrides: Partial<ProfileDTO> = {}): ProfileDTO {
  return {
    id: "primary",
    schemaVersion: 1,
    displayName: "Tester",
    countryCode: "GH",
    regionNote: null,
    workMode: "any",
    languages: [{ code: "en", proficiency: "fluent" }],
    skills: [{ name: "python", experienceBand: "advanced" }],
    qualifications: [],
    preferences: { includedFamilies: [], excludedFamilies: [] },
    weeklyHours: 20,
    timezone: null,
    equipment: [],
    incomeGoalAmount: null,
    incomeGoalCurrency: "USD",
    payoutCapabilities: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function facts(overrides: Partial<EconomicsFacts> = {}): EconomicsFacts {
  return {
    sourceKey: "oneforma",
    platform: "OneForma",
    ...overrides,
  };
}

const evidence = (overrides: Partial<TransitionEvidence> = {}): TransitionEvidence => ({
  hasDraft: true,
  ...overrides,
});

// ---------------------------------------------------------------------------
// eligibility — “未知永不判 eligible”
// ---------------------------------------------------------------------------

describe("domain/eligibility", () => {
  it("无 profile：所有用户相关维度 needs_user_input，overall 不被捏造成 eligible", () => {
    const assessment = evaluateEligibility(null, facts());
    expect(assessment.country.value).toBe("needs_user_input");
    expect(assessment.language.value).toBe("needs_user_input");
    expect(assessment.skills?.value).toBe("needs_user_input");
    expect(assessment.overall).toBe("needs_user_input");
    expect(assessment.modelAssisted).toBe(false);
  });

  it("eligibility 缺失或 unknown：country 判 unknown，绝判 eligible", () => {
    expect(evaluateEligibility(profile(), facts({ eligibility: undefined })).country.value).toBe(
      "unknown",
    );
    expect(
      evaluateEligibility(profile(), facts({ eligibility: { mode: "unknown" } })).country.value,
    ).toBe("unknown");
    expect(
      evaluateEligibility(profile(), facts({ eligibility: { mode: "unknown" } })).overall,
    ).toBe("unknown");
  });

  it("whitelist 空国家清单：仍 unknown（空清单不能捏造限制）", () => {
    const spec: EligibilitySpec = { mode: "whitelist", countries: [] };
    expect(evaluateEligibility(profile(), facts({ eligibility: spec })).country.value).toBe(
      "unknown",
    );
    expect(evaluateEligibility(profile(), facts({ eligibility: spec })).country.sourceBacked).toBe(
      false,
    );
  });

  it("whitelist 含 GH → eligible；不含 → ineligible 且进 blockingReasons", () => {
    const included: EligibilitySpec = { mode: "whitelist", countries: ["gh", "NG"] };
    const ok = evaluateEligibility(profile(), facts({ eligibility: included }));
    expect(ok.country.value).toBe("eligible");
    expect(ok.country.sourceBacked).toBe(true);

    const excluded: EligibilitySpec = { mode: "whitelist", countries: ["US", "GB"] };
    const blocked = evaluateEligibility(profile(), facts({ eligibility: excluded }));
    expect(blocked.country.value).toBe("ineligible");
    expect(blocked.overall).toBe("ineligible");
    expect(blocked.blockingReasons.join(" ")).toContain("Country:");
  });

  it("blacklist 不含本国 → eligible；含本国 → ineligible", () => {
    const clean: EligibilitySpec = { mode: "blacklist", excludedCountries: ["US"] };
    expect(evaluateEligibility(profile(), facts({ eligibility: clean })).country.value).toBe(
      "eligible",
    );
    const bad: EligibilitySpec = { mode: "blacklist", excludedCountries: ["gh"] };
    expect(evaluateEligibility(profile(), facts({ eligibility: bad })).country.value).toBe(
      "ineligible",
    );
  });

  it("open → eligible（listing 明示无国家限制）", () => {
    expect(evaluateEligibility(profile(), facts({ eligibility: { mode: "open" } })).country.value).toBe(
      "eligible",
    );
  });

  it("技能缺口是 needs_user_input，永不 ineligible", () => {
    const requirements: RequirementsSpec = { skills: ["python", "kotlin"] };
    const assessment = evaluateEligibility(profile(), facts({ requirements }));
    expect(assessment.skills?.value).toBe("needs_user_input");
    expect(assessment.blockingReasons).toHaveLength(0);
    expect(assessment.nextSteps.join(" ")).toContain("Add skills");
  });

  it("语言缺失也是 needs_user_input（用户可能还没填，不判死）", () => {
    const spec: EligibilitySpec = { mode: "open", languages: ["en", "fr"] };
    const assessment = evaluateEligibility(profile(), facts({ eligibility: spec }));
    expect(assessment.language.value).toBe("needs_user_input");
  });

  it("payout：仅有全球方法清单（methodKnown）仍 unknown", () => {
    const assessment = evaluateEligibility(
      profile(),
      facts({ payout: { methodKnown: true, methods: ["PayPal"] } }),
    );
    expect(assessment.payout.value).toBe("unknown");
    expect(assessment.payout.reason).toContain(PAYOUT_UNKNOWN_DISCLAIMER);
  });

  it("payout：countryNotes 覆盖本国 → eligible；否定句 → ineligible", () => {
    const covered = facts({ payout: { methodKnown: false, countryNotes: "Payments to GH arrive monthly." } });
    expect(evaluateEligibility(profile(), covered).payout.value).toBe("eligible");

    const negated = facts({
      payout: { methodKnown: false, countryNotes: "Payouts are not available in GH." },
    });
    expect(evaluateEligibility(profile(), negated).payout.value).toBe("ineligible");
  });

  it("payout：evidenceUrl 含国家码 → eligible（提示用户自行打开确认）", () => {
    const linked = facts({ payout: { methodKnown: false, evidenceUrl: "https://pay.example.com/help/GH" } });
    const assessment = evaluateEligibility(profile(), linked);
    expect(assessment.payout.value).toBe("eligible");
    expect(assessment.payout.reason).toContain("open it to confirm");
  });

  it("无国家码的 profile：country needs_user_input，payout 仍按 listing 事实评估", () => {
    const noCountry = profile({ countryCode: null });
    const assessment = evaluateEligibility(
      noCountry,
      facts({ payout: { methodKnown: true, methods: ["PayPal"] } }),
    );
    expect(assessment.country.value).toBe("needs_user_input");
    expect(assessment.payout.value).toBe("unknown");
  });

  it("评估永不缓存为主张：assessedAt 是当下时刻，modelAssisted 恒 false", () => {
    const before = Date.now();
    const assessment = evaluateEligibility(profile(), facts());
    expect(new Date(assessment.assessedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(assessment.modelAssisted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// economics — “毛/净不合并；估计不保证”
// ---------------------------------------------------------------------------

describe("domain/economics", () => {
  it("gross/net 永不合并：无手续费时 net 等于 gross（仍标为估计）", () => {
    const estimate = computeEconomics(
      facts({ compensation: { grossMin: 100, grossMax: 200, fixedOrEstimated: "fixed" } }),
      profile(),
    );
    expect(estimate.grossMin).toBe(100);
    expect(estimate.grossMax).toBe(200);
    expect(estimate.estimatedNetMin).toBe(100);
    expect(estimate.estimatedNetMax).toBe(200);
    expect(estimate.guaranteed).toBe(false);
  });

  it("Upwork：10% 假定服务费单列，basis assumed，net = gross × 0.9", () => {
    const estimate = computeEconomics(
      facts({
        sourceKey: "upwork_mcp",
        compensation: { grossMin: 1000, grossMax: 1000, fixedOrEstimated: "fixed" },
        payout: { methodKnown: false, fees: "10% service fee mentioned in text" },
      }),
      profile(),
    );
    expect(estimate.fees).toHaveLength(1);
    expect(estimate.fees[0]?.kind).toBe("percent");
    expect(estimate.fees[0]?.value).toBe(10);
    expect(estimate.fees[0]?.basis).toBe("assumed");
    expect(estimate.estimatedNetMin).toBe(900);
    expect(estimate.assumptions.join(" ")).toContain("Re-verify the current Upwork fee schedule");
  });

  it("非 Upwork：listing 文本中的 NN% 被解析为 known 百分比手续费", () => {
    const estimate = computeEconomics(
      facts({
        compensation: { grossMin: 200, fixedOrEstimated: "fixed" },
        payout: { methodKnown: false, fees: "Platform charges 5% and a 2.5% payout fee" },
      }),
      profile(),
    );
    expect(estimate.fees.length).toBeGreaterThanOrEqual(2);
    expect(estimate.fees.every((fee) => fee.basis === "known")).toBe(true);
    expect(estimate.fees.map((fee) => fee.value)).toContain(5);
    expect(estimate.fees.map((fee) => fee.value)).toContain(2.5);
    expect(estimate.estimatedNetMin).toBe(185);
  });

  it("“USD 25” 金额手续费被解析并从 net 中扣除；货币符号 $ 不映射货币", () => {
    const estimate = computeEconomics(
      facts({
        compensation: { grossMin: 100, fixedOrEstimated: "fixed" },
        payout: { methodKnown: false, fees: "USD 25 payout processing fee and $30 example" },
      }),
      profile(),
    );
    const amountFees = estimate.fees.filter((fee) => fee.kind === "amount");
    expect(amountFees.map((fee) => [fee.value, fee.currency])).toEqual([[25, "USD"]]);
    expect(estimate.estimatedNetMin).toBe(75);
  });

  it("费用文本不可机读：保留原话，绝不发明数字", () => {
    const text = "variable fee depending on region";
    const estimate = computeEconomics(
      facts({ payout: { methodKnown: false, fees: text } }),
      profile(),
    );
    expect(estimate.fees).toHaveLength(0);
    expect(estimate.unknownCostItems.join(" ")).toContain("not machine-readable");
    expect(estimate.unknownCostItems.join(" ")).toContain(text);
  });

  it("未披露费用/无毛收入 → unknownCostItems 记账，confidence low", () => {
    const estimate = computeEconomics(facts(), profile());
    expect(estimate.unknownCostItems).toContain("Platform/payout fees unknown");
    expect(estimate.unknownCostItems).toContain(
      "Compensation is not stated by the listing (gross and net unknown)",
    );
    expect(estimate.estimatedNetMin).toBeUndefined();
    expect(estimate.confidence).toBe("low");
  });

  it("Connects 与 qualification test 计入 cost（不并入 net 扣减）", () => {
    const estimate = computeEconomics(
      facts({
        compensation: { grossMin: 500, grossMax: 500, fixedOrEstimated: "fixed" },
        application: { connects: 16, qualificationTest: true },
        time: { hoursMin: 10, hoursMax: 10 },
        payout: { methodKnown: false, fees: "0%" },
      }),
      profile(),
    );
    expect(estimate.costs.map((cost) => cost.label)).toContain(
      "Connects required to apply (amount varies)",
    );
    expect(estimate.costs.map((cost) => cost.label)).toContain(
      "Unpaid qualification/test time (not quantified by source)",
    );
    // Connects / 测试时间不从毛收入扣减。
    expect(estimate.estimatedNetMin).toBe(500);
  });

  it("有效时薪取保守交叉相除：min 净 ÷ max 时长，max 净 ÷ min 时长", () => {
    const estimate = computeEconomics(
      facts({
        compensation: { grossMin: 100, grossMax: 200, fixedOrEstimated: "fixed" },
        time: { hoursMin: 5, hoursMax: 10 },
      }),
      profile(),
    );
    expect(estimate.effectiveHourlyMin).toBe(10);
    expect(estimate.effectiveHourlyMax).toBe(40);
  });

  it("本地工作 → travel/local 成本未知；local workMode 单独入账", () => {
    const estimate = computeEconomics(
      facts({ workMode: "local", compensation: { grossMin: 10, fixedOrEstimated: "fixed" } }),
      profile(),
    );
    expect(estimate.unknownCostItems).toContain("Travel/local costs unknown");
  });

  it("全部已知且无假定 → confidence high；有假定费用 → medium", () => {
    const complete = computeEconomics(
      facts({
        compensation: { grossMin: 10, grossMax: 20, fixedOrEstimated: "fixed" },
        payout: { methodKnown: false, fees: "5%" },
        time: { hoursMin: 1, hoursMax: 2 },
      }),
      profile(),
    );
    expect(complete.confidence).toBe("high");

    const upwork = computeEconomics(
      facts({
        sourceKey: "upwork_mcp",
        compensation: { grossMin: 10, grossMax: 20, fixedOrEstimated: "fixed" },
        time: { hoursMin: 1, hoursMax: 2 },
      }),
      profile(),
    );
    expect(upwork.confidence).toBe("medium");
  });

  it("profile 只占用冻结签名，绝不注入任何货币主张", () => {
    const base = facts({ compensation: { grossMin: 100, fixedOrEstimated: "fixed" } });
    const withProfile = computeEconomics(base, profile({ incomeGoalAmount: 99999, incomeGoalCurrency: "EUR" }));
    const withoutProfile = computeEconomics(base, null);
    // calculatedAt 是计算时刻；除它以外整份估计必须与 profile 无关。
    const { calculatedAt: _a, ...withRest } = withProfile;
    const { calculatedAt: _b, ...withoutRest } = withoutProfile;
    void _a;
    void _b;
    expect(withRest).toEqual(withoutRest);
  });
});

// ---------------------------------------------------------------------------
// lifecycle — 证据门控 + 顺序
// ---------------------------------------------------------------------------

describe("domain/lifecycle", () => {
  it("正向迁移必须逐级：跳级被拒", () => {
    const jump = canTransition("draft", "applied", evidence({ note: "submitted" }));
    expect(jump.ok).toBe(false);
    expect(jump.reason).toContain("Cannot skip");

    const step = canTransition("draft", "prepared", evidence());
    expect(step.ok).toBe(true);
  });

  it("applied -> qualification_pending 是唯一获准的显式例外", () => {
    expect(canTransition("applied", "qualification_pending", evidence()).ok).toBe(true);
    expect(canTransition("draft", "qualification_pending", evidence()).ok).toBe(false);
  });

  it("回退被拒：记录 note 事件而不是倒退", () => {
    const back = canTransition("applied", "draft", evidence());
    expect(back.ok).toBe(false);
    expect(back.reason).toContain("record a note event instead");
  });

  it("同状态重复与终态现状都被拒", () => {
    const same = canTransition("draft", "draft", evidence());
    expect(same.ok).toBe(false);
    expect(same.reason).toContain("already in status");

    const terminal = canTransition("rejected", "applied", evidence({ note: "reopen" }));
    expect(terminal.ok).toBe(false);
    expect(terminal.reason).toContain("terminal status");
  });

  it("prepared 需要已存草稿（hasDraft）", () => {
    const noDraft = canTransition("draft", "prepared", evidence({ hasDraft: false }));
    expect(noDraft.ok).toBe(false);
    expect(noDraft.reason).toContain("requires a stored draft");
    expect(canTransition("draft", "prepared", evidence({ hasDraft: true })).ok).toBe(true);
  });

  it("applied 需要 URL 或 note 描述真实提交 —— 点击/生成文本不算证据", () => {
    const clickOnly = canTransition("prepared", "applied", evidence());
    expect(clickOnly.ok).toBe(false);
    expect(clickOnly.reason).toContain("never sufficient");
    expect(
      canTransition("prepared", "applied", evidence({ evidenceUrl: "https://provider/jobs/1" })).ok,
    ).toBe(true);
    expect(canTransition("prepared", "applied", evidence({ note: "submitted via dashboard" })).ok).toBe(
      true,
    );
  });

  it("accepted / approved 至少需要 evidenceType", () => {
    const bare = canTransition("qualification_pending", "accepted", evidence({ note: "got offer" }));
    expect(bare.ok).toBe(false);
    expect(bare.reason).toContain("evidence type");
    expect(
      canTransition("qualification_pending", "accepted", evidence({ evidenceType: "user-reported" })).ok,
    ).toBe(true);
  });

  it("paid 三重门：金额>0 + user-reported/payment-confirmed + URL 或 note", () => {
    const zeroAmount = canTransition("payment_pending", "paid", evidence({ amountPaid: 0 }));
    expect(zeroAmount.ok).toBe(false);
    expect(zeroAmount.reason).toContain("amountPaid must be greater than 0");

    const wrongType = canTransition(
      "payment_pending",
      "paid",
      evidence({ amountPaid: 100, evidenceType: "provider-confirmed", note: "paid" }),
    );
    // provider-confirmed 不被 paid 接受（只认 user-reported / payment-confirmed）。
    expect(wrongType.ok).toBe(false);
    expect(wrongType.reason).toContain("user-reported");

    const noText = canTransition(
      "payment_pending",
      "paid",
      evidence({ amountPaid: 100, evidenceType: "payment-confirmed" }),
    );
    expect(noText.ok).toBe(false);
    expect(noText.reason).toContain("evidence URL or a note");

    const full = canTransition(
      "payment_pending",
      "paid",
      evidence({ amountPaid: 100, evidenceType: "payment-confirmed", note: "payout ref 42" }),
    );
    expect(full.ok).toBe(true);
  });

  it("终态目标可从任意非终态记录，但必须有 note", () => {
    expect(canTransition("draft", "withdrawn", evidence()).ok).toBe(false);
    expect(
      canTransition("draft", "withdrawn", evidence({ note: "user withdrew" })).ok,
    ).toBe(true);
    expect(
      canTransition("in_progress", "blocked", evidence({ note: "client unresponsive" })).ok,
    ).toBe(true);
  });

  it("isTerminalApplicationStatus 区分四个终态", () => {
    for (const status of ["rejected", "withdrawn", "expired", "blocked"] as const) {
      expect(isTerminalApplicationStatus(status)).toBe(true);
    }
    expect(isTerminalApplicationStatus("paid")).toBe(false);
  });

  it("applyTransitionFields 的列映射：applied/submitted/approved/paid/终态", () => {
    const now = Date.now();
    const applied = applyTransitionFields(
      "applied",
      evidence({ evidenceUrl: "https://provider/jobs/1", note: "sent" }),
      { channel: "upwork-web" },
    );
    expect(applied.submittedAt?.getTime()).toBeGreaterThanOrEqual(now);
    expect(applied.submittedEvidence).toBe("https://provider/jobs/1");
    expect(applied.submittedChannel).toBe("upwork-web");

    const submitted = applyTransitionFields("submitted", evidence());
    expect(submitted.completedAt).toBeInstanceOf(Date);

    const approved = applyTransitionFields("approved", evidence());
    expect(approved.approvedAt).toBeInstanceOf(Date);

    const paid = applyTransitionFields(
      "paid",
      evidence({ amountPaid: 120, note: "payout ref" }),
      { paidCurrency: "USD" },
    );
    expect(paid.paidAt).toBeInstanceOf(Date);
    expect(paid.amountPaid).toBe(120);
    expect(paid.paidCurrency).toBe("USD");
    expect(paid.paymentEvidence).toBe("payout ref");

    const rejected = applyTransitionFields("rejected", evidence({ note: "no reply" }), {});
    expect(rejected.outcomeNotes).toBe("no reply");

    // 状态型迁移（prepared 等）不写任何列；payment_pending 绝不碰 paidAt。
    expect(applyTransitionFields("prepared", evidence(), {})).toEqual({});
    expect(applyTransitionFields("payment_pending", evidence(), {})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// dedupe — 同源唯一键 + 展示用跨源分组
// ---------------------------------------------------------------------------

describe("domain/dedupe", () => {
  it("normalizeUrl：小写 host、去 hash、去尾斜杠、去跟踪参数、保留其余参数顺序", () => {
    expect(normalizeUrl("https://www.Example.COM/jobs/42/?utm_source=x&id=7&id=3#top")).toBe(
      "https://www.example.com/jobs/42?id=7&id=3",
    );
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
    expect(normalizeUrl("https://example.com/a/?fbclid=1&gclid=2&ref=r&source=s")).toBe(
      "https://example.com/a",
    );
  });

  it("参数顺序不归一：结构不同的查询串不折叠成一个键", () => {
    expect(normalizeUrl("https://example.com/a?x=1&y=2")).not.toBe(
      normalizeUrl("https://example.com/a?y=2&x=1"),
    );
  });

  it("无协议输入按 https 补全（只防假拆分，不合并不同绝对 URL）", () => {
    expect(normalizeUrl("example.com/jobs/1")).toBe("https://example.com/jobs/1");
  });

  it("无法解析的 URL 原样返回（trim 后不猜测）", () => {
    expect(normalizeUrl("  not a url :://  ")).toBe("not a url :://");
    expect(normalizeUrl("")).toBe("");
  });

  it("externalIdForUrl 即归一化 URL（同源去重键）", () => {
    expect(externalIdForUrl("https://Example.com/a/?utm_term=q")).toBe(
      "https://example.com/a",
    );
  });

  it("crossSourceGroupKey：标题归一 + 国家大写/any + grossMax/unknown", () => {
    expect(
      crossSourceGroupKey({ title: "Search  Evaluation!! Tasks", platform: "OneForma", country: "gh,us", grossMax: 60 }),
    ).toBe(crossSourceGroupKey({ title: "search evaluation tasks", platform: "Upwork", opportunityType: "gig", country: "GH,US", grossMax: 60 }));

    expect(
      crossSourceGroupKey({ title: "Same", platform: "p1", grossMax: Number.NaN }),
    ).toBe("same|any|unknown");
    expect(crossSourceGroupKey({ title: "Same", platform: "p1" })).toBe("same|any|unknown");
  });
});
