import type { EligibilityAssessment, OpportunityCardDTO, RawListing } from "./hop3EarnTypes.js";
import {
  NO_AUTO_SUBMIT_NOTICE,
  PAYOUT_UNKNOWN_DISCLAIMER,
  SANDBOX_FIXTURE_LABEL,
} from "./hop3EarnTypes.js";

/** 例 1：Worker A 归一化输出一条带缺失字段诚实保留的 RawListing。 */
export function rawListingExample(): RawListing {
  return {
    sourceKey: "oneforma",
    sourceRecordId: "job-123",
    externalId: "https://www.oneforma.com/job/123",
    canonicalUrl: "https://www.oneforma.com/job/123",
    title: "Podcast Transcription Annotator",
    platform: "OneForma",
    observedAt: "2026-11-12T10:00:00.000Z",
    provenance: "live",
    // payout 方法未知保持 methodKnown:false —— 不猜测。
    payout: { methodKnown: false },
  };
}

/** 例 2：Worker C 组装一张卡片 DTO（eligibility/economics 由域引擎产出）。 */
export function cardExample(): OpportunityCardDTO {
  const eligibility: EligibilityAssessment = {
    overall: "unknown",
    country: { value: "unknown", reason: "listing exposes no country list", sourceBacked: false },
    language: { value: "unknown", reason: "no language requirement stated", sourceBacked: false },
    payout: { value: "unknown", reason: "payout method unknown for country", sourceBacked: false },
    blockingReasons: [],
    unknowns: ["country", "payout"],
    nextSteps: ["check listing country list", "verify payout method"],
    assessedAt: "2026-11-12T10:00:00.000Z",
    modelAssisted: false,
  };
  return {
    id: "opp_1",
    title: "Podcast Transcription Annotator",
    platform: "OneForma",
    sourceKey: "oneforma",
    provenance: "live",
    canonicalUrl: "https://www.oneforma.com/job/123",
    status: "active",
    firstSeenAt: "2026-11-12T10:00:00.000Z",
    lastSeenAt: "2026-11-12T10:00:00.000Z",
    observedAt: "2026-11-12T10:00:00.000Z",
    eligibility,
    economics: {
      fees: [],
      costs: [],
      assumptions: [],
      unknownCostItems: ["platform fees"],
      confidence: "low",
      guaranteed: false,
      calculatedAt: "2026-11-12T10:00:00.000Z",
    },
    saved: false,
    duplicateCount: 0,
    rankingPolicy: "hop3-allowed",
  };
}

/** 例 3：诚实常量按契约原样渲染（locale 无关，不重写）。 */
export const honestyNoticesExample = {
  noAutoSubmit: NO_AUTO_SUBMIT_NOTICE,
  payoutUnknown: PAYOUT_UNKNOWN_DISCLAIMER,
  sandboxFixture: SANDBOX_FIXTURE_LABEL,
} as const;
