/**
 * Hop3 — Stage 1 sandbox fixtures (Worker A).
 *
 * Deterministic, clearly-labelled test data for 'sandbox' sync mode. Every
 * fixture carries provenance 'sandbox-fixture' and says so in its summary:
 * SANDBOX_FIXTURE_LABEL — "deterministic test data, clearly not a live listing.
 * Never presented as live."
 *
 * Design intent (maps to the Stage 1 acceptance suite):
 *   - exercise every eligibility outcome: eligible, ineligible, unknown,
 *     needs_user_input (missing profile languages/skills);
 *   - exercise payout honesty: a global method list alone stays unknown;
 *     country-notes that name a country are the only source-backed proof;
 *   - exercise freshness: one already-expired fixture, one closing soon;
 *   - exercise economics: stated gross ranges, listing-stated percent fees,
 *     unpaid qualification time, Upwork Connects;
 *   - exercise duplicate grouping: two fixtures share the conservative
 *     cross-source group key (display-only count, never merged).
 *
 * No fixture claims to be a real listing, and canonical URLs point only to the
 * provider's real public board/home pages — never to an invented deep link.
 */

import type { RawListing } from "@zcode/shared";

const SANDBOX_NOTE = "Sandbox fixture — deterministic test data, not a live listing.";

function nowIso(): string {
  return new Date().toISOString();
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** A date safely in the past so the fixture demonstrates the expired status. */
const EXPIRED_PAST_ISO = "2020-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// OneForma sandbox fixtures (public-board imitation)
// ---------------------------------------------------------------------------

export function oneformaFixtures(): RawListing[] {
  const observedAt = nowIso();

  const listings: RawListing[] = [
    {
      sourceKey: "oneforma",
      sourceRecordId: "sandbox-oneforma-001",
      externalId: "sandbox-oneforma-001",
      canonicalUrl: "https://www.oneforma.com/projects/",
      title: "Search Engine Evaluation Tasks (Sandbox Example A)",
      summary:
        "Rate search results against guidelines. 10 hr per week, fully remote. " +
        "Sandbox fixture — deterministic test data, not a live listing.",
      platform: "OneForma",
      opportunityType: "annotation",
      workMode: "remote",
      eligibility: {
        mode: "whitelist",
        countries: ["GH", "NG", "KE", "ZA"],
        languages: ["en"],
        notes: "Sandbox whitelist example: availability stated for GH/NG/KE/ZA.",
      },
      requirements: { skills: [], languages: ["en"] },
      compensation: {
        currency: "USD",
        grossMin: 5,
        grossMax: 5,
        payUnit: "hourly",
        fixedOrEstimated: "fixed",
        conditions: "Sandbox example rate; paid per completed hour of approved work.",
      },
      payout: {
        methodKnown: true,
        methods: ["PayPal", "Payoneer", "Bank transfer"],
        threshold: { amount: 25, currency: "USD" },
        fees: "Not stated by the listing (sandbox example)",
        cadence: "Twice monthly (sandbox example)",
      },
      time: { hoursMin: 10, hoursMax: 10, duration: "Ongoing (sandbox example)" },
      riskFlags: ["sandbox-fixture"],
      observedAt,
      expiresAt: daysFromNow(21),
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "oneforma",
      sourceRecordId: "sandbox-oneforma-002",
      externalId: "sandbox-oneforma-002",
      canonicalUrl: "https://www.oneforma.com/projects/",
      title: "Audio Recording Collection — English (Sandbox Example B)",
      summary:
        "Record short English audio prompts for speech datasets. Sandbox fixture — deterministic test data, not a live listing.",
      platform: "OneForma",
      opportunityType: "data-collection",
      workMode: "remote",
      eligibility: {
        mode: "whitelist",
        countries: ["US", "GB", "CA", "AU"],
        languages: ["en"],
        notes: "Sandbox whitelist example: this one excludes GH to demonstrate the ineligible country path.",
      },
      requirements: { skills: [], languages: ["en"] },
      compensation: {
        currency: "USD",
        grossMin: 40,
        grossMax: 60,
        payUnit: "fixed",
        fixedOrEstimated: "fixed",
        conditions: "Sandbox example: fixed payment per completed recording batch.",
      },
      payout: {
        methodKnown: true,
        methods: ["PayPal", "Payoneer", "Bank transfer"],
        fees: "Not stated by the listing (sandbox example)",
      },
      time: { hoursMin: 4, hoursMax: 8 },
      riskFlags: ["sandbox-fixture"],
      observedAt,
      expiresAt: daysFromNow(5),
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "oneforma",
      sourceRecordId: "sandbox-oneforma-003",
      externalId: "sandbox-oneforma-003",
      canonicalUrl: "https://www.oneforma.com/projects/",
      title: "Translation EN → FR, Legal Domain (Sandbox Example C)",
      summary:
        "Translate legal documents from English to French; paid per source word. Requires a qualification test (unpaid). " +
        "Sandbox fixture — deterministic test data, not a live listing.",
      platform: "OneForma",
      opportunityType: "translation",
      workMode: "remote",
      eligibility: {
        mode: "whitelist",
        countries: ["GH", "FR", "BE", "CA"],
        languages: ["en", "fr"],
        notes: "Sandbox whitelist example including GH.",
      },
      requirements: { skills: ["Legal translation"], languages: ["en", "fr"] },
      compensation: {
        currency: "EUR",
        grossMin: 0.04,
        grossMax: 0.06,
        payUnit: "word",
        fixedOrEstimated: "fixed",
        conditions: "Sandbox example: paid per approved source word.",
      },
      payout: {
        methodKnown: true,
        methods: ["PayPal", "Payoneer", "Bank transfer"],
        threshold: { amount: 25, currency: "USD" },
        fees: "Sandbox example: 5% platform fee stated in listing text",
        countryNotes:
          "Sandbox example proof path: payouts are supported for GH via PayPal per this listing. Other countries should check the payment guide.",
      },
      application: {
        qualificationTest: true,
        steps: [
          "Create a OneForma account",
          "Pass the unpaid qualification test",
          "Apply to the project in your OneForma dashboard",
        ],
        closingDate: daysFromNow(14).slice(0, 10),
      },
      time: { hoursMin: 5, hoursMax: 10 },
      riskFlags: ["sandbox-fixture", "unpaid-qualification-time"],
      observedAt,
      expiresAt: daysFromNow(14),
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "oneforma",
      sourceRecordId: "sandbox-oneforma-004",
      externalId: "sandbox-oneforma-004",
      canonicalUrl: "https://www.oneforma.com/projects/",
      title: "Social Media Ads Review (Sandbox Example D)",
      summary:
        "Review social media advertisements for policy compliance. No country list disclosed. " +
        "Sandbox fixture — deterministic test data, not a live listing.",
      platform: "OneForma",
      opportunityType: "annotation",
      workMode: "remote",
      // No eligibility spec at all: country availability stays unknown.
      compensation: {
        currency: "USD",
        grossMin: 3,
        grossMax: 4,
        payUnit: "hourly",
        fixedOrEstimated: "fixed",
      },
      payout: { methodKnown: false },
      time: { hoursMin: 8, hoursMax: 15 },
      riskFlags: ["sandbox-fixture"],
      observedAt,
      expiresAt: daysFromNow(30),
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "oneforma",
      sourceRecordId: "sandbox-oneforma-005",
      externalId: "sandbox-oneforma-005",
      canonicalUrl: "https://www.oneforma.com/projects/",
      title: "Map Data Collection — Field Survey (Sandbox Example E)",
      summary:
        "Collect map data on foot in listed districts. Local work mode. " +
        "Sandbox fixture — deterministic test data, not a live listing.",
      platform: "OneForma",
      opportunityType: "data-collection",
      workMode: "local",
      eligibility: {
        mode: "blacklist",
        excludedCountries: [],
        notes: "Sandbox blacklist example: no excluded countries stated.",
      },
      compensation: {
        currency: "USD",
        grossMin: 120,
        grossMax: 120,
        payUnit: "fixed",
        fixedOrEstimated: "fixed",
      },
      payout: { methodKnown: false },
      riskFlags: ["sandbox-fixture", "local-travel-costs-unknown"],
      observedAt,
      // Deliberately in the past: exercises the expired-listing path.
      expiresAt: EXPIRED_PAST_ISO,
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "oneforma",
      sourceRecordId: "sandbox-oneforma-006",
      externalId: "sandbox-oneforma-006",
      canonicalUrl: "https://www.oneforma.com/projects/",
      title: "Search Engine Evaluation Tasks (Sandbox Example A2)",
      summary:
        "Second observation of the same sandbox example A posted on a second board page — demonstrates the display-only " +
        "“similar listings grouped” count. Never merged. Sandbox fixture — deterministic test data, not a live listing.",
      platform: "OneForma",
      opportunityType: "annotation",
      workMode: "remote",
      eligibility: {
        mode: "whitelist",
        countries: ["GH", "NG", "KE", "ZA"],
        languages: ["en"],
      },
      requirements: { languages: ["en"] },
      compensation: {
        currency: "USD",
        grossMin: 5,
        grossMax: 5,
        payUnit: "hourly",
        fixedOrEstimated: "fixed",
      },
      payout: { methodKnown: true, methods: ["PayPal", "Payoneer", "Bank transfer"] },
      time: { hoursMin: 10, hoursMax: 10 },
      riskFlags: ["sandbox-fixture"],
      observedAt,
      expiresAt: daysFromNow(21),
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "oneforma",
      sourceRecordId: "sandbox-oneforma-007",
      externalId: "sandbox-oneforma-007",
      canonicalUrl: "https://www.oneforma.com/projects/",
      title: "Customer Service Simulation Study (Sandbox Example F)",
      summary:
        "Payout notes explicitly mark a country as unsupported — exercises the source-backed payout “ineligible” path. " +
        "Sandbox fixture — deterministic test data, not a live listing.",
      platform: "OneForma",
      opportunityType: "study",
      workMode: "remote",
      eligibility: { mode: "open", notes: "Sandbox open example: no country restriction stated." },
      compensation: {
        currency: "USD",
        grossMin: 25,
        grossMax: 25,
        payUnit: "task",
        fixedOrEstimated: "fixed",
      },
      payout: {
        methodKnown: true,
        methods: ["PayPal", "Payoneer", "Bank transfer"],
        countryNotes:
          "Sandbox example: payouts are not supported for GH on this study. US and EU participants are paid via PayPal.",
      },
      time: { hoursMin: 2, hoursMax: 2 },
      riskFlags: ["sandbox-fixture"],
      observedAt,
      expiresAt: daysFromNow(7),
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
  ];

  return listings;
}

// ---------------------------------------------------------------------------
// Upwork sandbox fixtures (read-only job-search imitation, provider order)
// ---------------------------------------------------------------------------

export function upworkFixtures(): RawListing[] {
  const observedAt = nowIso();

  const listings: RawListing[] = [
    {
      sourceKey: "upwork_mcp",
      sourceRecordId: "sandbox-upwork-001",
      externalId: "sandbox-upwork-001",
      canonicalUrl: "https://www.upwork.com/",
      title: "Data Entry Spreadsheet Cleanup (Sandbox Upwork Example 1)",
      summary:
        "Clean and de-duplicate a 2,000-row spreadsheet. Sandbox fixture — deterministic test data, not a live job; " +
        "provider order preserved, no Hop3 ranking.",
      platform: "Upwork",
      opportunityType: "gig",
      workMode: "remote",
      eligibility: { mode: "unknown" },
      requirements: { skills: ["Excel", "Data entry"] },
      compensation: {
        currency: "USD",
        grossMin: 100,
        grossMax: 250,
        payUnit: "fixed",
        fixedOrEstimated: "fixed",
      },
      payout: { methodKnown: false },
      application: {
        connects: 4,
        steps: ["Submit a proposal on Upwork with your cover letter"],
      },
      time: { hoursMin: 5, hoursMax: 15 },
      riskFlags: ["sandbox-fixture"],
      observedAt,
      expiresAt: daysFromNow(10),
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "upwork_mcp",
      sourceRecordId: "sandbox-upwork-002",
      externalId: "sandbox-upwork-002",
      canonicalUrl: "https://www.upwork.com/",
      title: "Virtual Assistant — Scheduling & Email (Sandbox Upwork Example 2)",
      summary:
        "Ongoing VA support 10 hr/week. Sandbox fixture — deterministic test data, not a live job; provider order preserved.",
      platform: "Upwork",
      opportunityType: "gig",
      workMode: "remote",
      eligibility: { mode: "unknown" },
      requirements: { skills: [], languages: ["en"] },
      compensation: {
        currency: "USD",
        grossMin: 6,
        grossMax: 10,
        payUnit: "hourly",
        fixedOrEstimated: "fixed",
      },
      payout: { methodKnown: false },
      application: { connects: 8 },
      time: { hoursMin: 10, hoursMax: 10 },
      riskFlags: ["sandbox-fixture"],
      observedAt,
      expiresAt: daysFromNow(14),
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "upwork_mcp",
      sourceRecordId: "sandbox-upwork-003",
      externalId: "sandbox-upwork-003",
      canonicalUrl: "https://www.upwork.com/",
      title: "Proofread Product Descriptions (Sandbox Upwork Example 3)",
      summary:
        "Proofread 120 short product descriptions. No compensation stated by the listing — gross stays unknown. " +
        "Sandbox fixture — deterministic test data, not a live job.",
      platform: "Upwork",
      opportunityType: "gig",
      workMode: "remote",
      eligibility: { mode: "unknown" },
      requirements: { skills: ["Proofreading"] },
      payout: { methodKnown: false },
      application: { connects: 2 },
      time: { hoursMin: 6, hoursMax: 12 },
      riskFlags: ["sandbox-fixture", "compensation-not-stated"],
      observedAt,
      expiresAt: daysFromNow(6),
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "upwork_mcp",
      sourceRecordId: "sandbox-upwork-004",
      externalId: "sandbox-upwork-004",
      canonicalUrl: "https://www.upwork.com/",
      title: "WordPress Speed Optimization (Sandbox Upwork Example 4)",
      summary:
        "Improve Core Web Vitals for a small business site. Sandbox fixture — deterministic test data, not a live job.",
      platform: "Upwork",
      opportunityType: "gig",
      workMode: "remote",
      eligibility: { mode: "unknown" },
      requirements: { skills: ["WordPress", "Web performance"], languages: ["en"] },
      compensation: {
        currency: "USD",
        grossMin: 150,
        grossMax: 400,
        payUnit: "fixed",
        fixedOrEstimated: "fixed",
      },
      payout: { methodKnown: false },
      application: { connects: 6 },
      time: { hoursMin: 8, hoursMax: 20 },
      riskFlags: ["sandbox-fixture"],
      observedAt,
      expiresAt: daysFromNow(12),
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
  ];

  return listings;
}

// ---------------------------------------------------------------------------
// Fiverr sandbox fixtures (buyer-side talent research imitation)
// ---------------------------------------------------------------------------

export function fiverrFixtures(): RawListing[] {
  const observedAt = nowIso();

  const listings: RawListing[] = [
    {
      sourceKey: "fiverr_mcp",
      sourceRecordId: "sandbox-fiverr-001",
      externalId: "sandbox-fiverr-001",
      canonicalUrl: "https://www.fiverr.com/",
      title: "Logo design seller — 5.0 rating (Sandbox Fiverr Example 1)",
      summary:
        "Buyer-side talent research result imitation. Seller location: Ghana. Rating 5.0. Ordering and payment stay on Fiverr. " +
        "Sandbox fixture — deterministic test data, not a live result.",
      platform: "Fiverr",
      opportunityType: "buyer-side-research",
      workMode: "remote",
      eligibility: {
        mode: "unknown",
        notes: "Seller location describes the seller, not buyer eligibility.",
      },
      requirements: { skills: ["Logo design", "Brand identity"] },
      payout: { methodKnown: false },
      observedAt,
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "fiverr_mcp",
      sourceRecordId: "sandbox-fiverr-002",
      externalId: "sandbox-fiverr-002",
      canonicalUrl: "https://www.fiverr.com/",
      title: "Video editing seller — fast response (Sandbox Fiverr Example 2)",
      summary:
        "Buyer-side talent research result imitation. No price returned by the tool, so compensation stays missing. " +
        "Ordering and payment stay on Fiverr. Sandbox fixture — deterministic test data, not a live result.",
      platform: "Fiverr",
      opportunityType: "buyer-side-research",
      workMode: "remote",
      eligibility: { mode: "unknown" },
      requirements: { skills: ["Video editing"], languages: ["en"] },
      payout: { methodKnown: false },
      observedAt,
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
    {
      sourceKey: "fiverr_mcp",
      sourceRecordId: "sandbox-fiverr-003",
      externalId: "sandbox-fiverr-003",
      canonicalUrl: "https://www.fiverr.com/",
      title: "Voice-over seller, English (Sandbox Fiverr Example 3)",
      summary:
        "Buyer-side talent research result imitation with an explicit basic price returned by a tool. " +
        "Ordering and payment stay on Fiverr. Sandbox fixture — deterministic test data, not a live result.",
      platform: "Fiverr",
      opportunityType: "buyer-side-research",
      workMode: "remote",
      eligibility: { mode: "unknown" },
      requirements: { skills: ["Voice-over"], languages: ["en"] },
      compensation: {
        currency: "USD",
        grossMin: 50,
        grossMax: 50,
        payUnit: "fixed",
        fixedOrEstimated: "fixed",
        conditions: "Price as explicitly returned by the tool; final pricing and payment stay on Fiverr.",
      },
      payout: { methodKnown: false },
      observedAt,
      provenance: "sandbox-fixture",
      raw: { sandbox: true, note: SANDBOX_NOTE },
    },
  ];

  return listings;
}
