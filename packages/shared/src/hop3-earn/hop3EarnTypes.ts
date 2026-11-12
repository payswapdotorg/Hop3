/**
 * Hop3 — Stage 1 frozen Earn shared contracts (TL-owned).
 *
 * Verbatim port of the Stage 1 reference implementation `contracts.ts`
 * (source of truth: payswapdotorg/Hop3 docs/DOMAIN-MODEL.md + docs/CONNECTORS.md),
 * plus the service-layer request/result shapes consumed through `IEarnService`.
 *
 * Rules encoded here (HOP3_RULES / STAGE-1 non-negotiables):
 *  - Missing values stay missing; never fill with model guesses.
 *  - Unknown eligibility/payout is "unknown", never "eligible".
 *  - Gross and net are never collapsed; estimates are never guarantees.
 *  - Provider order is preserved for sources with ranking restrictions (Upwork).
 *  - No automatic submission; lifecycle transitions are evidence-gated.
 *
 * Changes go through the TL only. The five honesty constants are
 * locale-invariant contract data — the UI renders them verbatim.
 */

export const DOMAIN_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Source keys
// ---------------------------------------------------------------------------

export type SourceKey = "oneforma" | "upwork_mcp" | "fiverr_mcp" | "url_intake";

export const SOURCE_KEYS: SourceKey[] = ["oneforma", "upwork_mcp", "fiverr_mcp", "url_intake"];

// ---------------------------------------------------------------------------
// Worker A output contract — RawListing (normalized source observation)
// ---------------------------------------------------------------------------

export interface EligibilitySpec {
  mode: "whitelist" | "blacklist" | "open" | "unknown";
  /** ISO-3166-1 alpha-2 codes when the listing actually exposes them */
  countries?: string[];
  excludedCountries?: string[];
  /** ISO 639-1 language codes when the listing actually exposes them */
  languages?: string[];
  qualifications?: string[];
  notes?: string;
}

export interface RequirementsSpec {
  skills?: string[];
  experience?: string;
  equipment?: string[];
  schedule?: string;
  languages?: string[];
}

export interface CompensationSpec {
  currency?: string;
  grossMin?: number;
  grossMax?: number;
  payUnit?: "fixed" | "hourly" | "task" | "word" | "month" | "unknown";
  fixedOrEstimated: "fixed" | "estimated" | "unknown";
  conditions?: string;
}

export interface PayoutSpec {
  /** false unless the individual listing/official doc proves method availability */
  methodKnown: boolean;
  methods?: string[];
  threshold?: { amount: number; currency: string };
  fees?: string;
  cadence?: string;
  evidenceUrl?: string;
  countryNotes?: string;
}

export interface ApplicationSpec {
  steps?: string[];
  /** ISO date when actually stated */
  closingDate?: string;
  qualificationTest?: boolean;
  applicationCost?: { amount?: number; currency?: string; note?: string };
  /** Upwork Connects or similar platform credits, when applicable */
  connects?: number;
  requiredData?: string[];
}

export interface TimeSpec {
  hoursMin?: number;
  hoursMax?: number;
  deadline?: string;
  duration?: string;
  shifts?: string;
  timezone?: string;
}

export interface RawListing {
  sourceKey: SourceKey;
  /** source-native id when the source exposes one, else canonical URL */
  sourceRecordId: string;
  /** dedupe key within this source (normalized URL or native id) */
  externalId: string;
  canonicalUrl: string;
  title: string;
  summary?: string;
  platform: string;
  opportunityType?: string;
  workMode?: "remote" | "local" | "hybrid" | "unknown";
  eligibility?: EligibilitySpec;
  requirements?: RequirementsSpec;
  compensation?: CompensationSpec;
  payout?: PayoutSpec;
  application?: ApplicationSpec;
  time?: TimeSpec;
  riskFlags?: string[];
  /** observation time of the source payload (ISO string) */
  observedAt: string;
  expiresAt?: string;
  sourceStatus?: string;
  provenance: "live" | "sandbox-fixture" | "user-submitted";
  /** last raw payload kept for audit; never the only copy of normalized data */
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Source policy descriptor (CONNECTORS.md register)
// ---------------------------------------------------------------------------

export interface OperationCapability {
  allowed: boolean;
  note?: string;
}

export interface SourcePolicy {
  sourceId: SourceKey;
  displayName: string;
  adapterVersion: string;
  sourceKind: "public-board" | "official-mcp" | "user-link";
  accessMode: "official-mcp" | "official-api" | "permitted-feed" | "user-submitted-link";
  actorModes: Array<"earner" | "buyer" | "operator">;
  operations: {
    search: OperationCapability;
    read: OperationCapability;
    draft: OperationCapability;
    submit: OperationCapability;
    message: OperationCapability;
    hire: OperationCapability;
    pay: OperationCapability;
  };
  auth: "anonymous" | "oauth" | "account-required";
  authNote?: string;
  coverage: {
    countries: "unknown" | string[];
    languages: "unknown" | string[];
    currencies: "unknown" | string[];
  };
  payout: {
    methodKnown: boolean;
    methods?: string[];
    threshold?: string;
    fees?: string;
    cadence?: string;
    evidenceUrl?: string;
  };
  termsUrl?: string;
  termsNotes?: string;
  rateLimit: { note: string; backoff: string };
  freshness: { maxAgeHours: number; minRefreshIntervalMinutes: number };
  approvalsRequired: string[];
  /** provider-order-only: Hop3 must not rank/score/select for this source (Upwork) */
  rankingPolicy: "provider-order-only" | "hop3-allowed" | "none";
  verifiedAt?: string;
  verificationNote?: string;
}

export interface SourceQuery {
  /** user-provided search criteria only (no Hop3-invented ranking) */
  keywords?: string[];
  languages?: string[];
}

export interface SourceRunResult {
  status: "ok" | "error" | "blocked";
  mode: "live" | "sandbox";
  message?: string;
  listings: RawListing[];
}

export interface SourceAdapter {
  key: SourceKey;
  policy: SourcePolicy;
  run(params: { mode: "live" | "sandbox"; query?: SourceQuery }): Promise<SourceRunResult>;
}

// ---------------------------------------------------------------------------
// Worker B contract — eligibility, economics, lifecycle, persistence
// ---------------------------------------------------------------------------

export type EligibilityValue = "eligible" | "ineligible" | "unknown" | "needs_user_input";

export interface DimensionResult {
  value: EligibilityValue;
  reason: string;
  /** true when the source payload itself provides the basis */
  sourceBacked: boolean;
}

export interface EligibilityAssessment {
  overall: EligibilityValue;
  country: DimensionResult;
  language: DimensionResult;
  skills?: DimensionResult;
  payout: DimensionResult;
  blockingReasons: string[];
  unknowns: string[];
  nextSteps: string[];
  assessedAt: string;
  modelAssisted: false;
}

export interface FeeLine {
  label: string;
  kind: "percent" | "amount";
  value?: number;
  currency?: string;
  basis: "known" | "assumed";
  note?: string;
}

export interface CostLine {
  label: string;
  amount?: number;
  currency?: string;
  hours?: number;
  note?: string;
}

export interface EconomicsEstimate {
  currency?: string;
  grossMin?: number;
  grossMax?: number;
  payUnit?: string;
  fees: FeeLine[];
  costs: CostLine[];
  estimatedHours?: { min?: number; max?: number };
  estimatedNetMin?: number;
  estimatedNetMax?: number;
  effectiveHourlyMin?: number;
  effectiveHourlyMax?: number;
  assumptions: string[];
  unknownCostItems: string[];
  confidence: "low" | "medium" | "high";
  /** estimates are never guarantees — always false */
  guaranteed: false;
  calculatedAt: string;
}

export type ApplicationStatus =
  | "draft"
  | "prepared"
  | "applied"
  | "qualification_pending"
  | "accepted"
  | "in_progress"
  | "submitted"
  | "approved"
  | "payment_pending"
  | "paid"
  | "rejected"
  | "withdrawn"
  | "expired"
  | "blocked";

export const APPLICATION_STATUS_ORDER: ApplicationStatus[] = [
  "draft",
  "prepared",
  "applied",
  "qualification_pending",
  "accepted",
  "in_progress",
  "submitted",
  "approved",
  "payment_pending",
  "paid",
];

export interface LifecycleEventInput {
  eventType: string;
  evidenceType?: "user-reported" | "provider-confirmed" | "payment-confirmed";
  evidenceUrl?: string;
  note?: string;
}

export interface IngestResult {
  sourceKey: SourceKey;
  runId: string;
  status: "ok" | "error" | "blocked";
  fetched: number;
  inserted: number;
  updated: number;
  duplicates: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Worker C contract — service DTOs (Earn UI consumes these shapes)
// ---------------------------------------------------------------------------

export interface ProfileDTO {
  id: string;
  schemaVersion: number;
  displayName?: string | null;
  countryCode?: string | null;
  regionNote?: string | null;
  workMode: string;
  languages: Array<{ code: string; proficiency: string; note?: string }>;
  skills: Array<{ name: string; experienceBand: string; evidenceNote?: string }>;
  qualifications: Array<{
    type: string;
    issuer?: string;
    year?: string;
    verificationState: string;
  }>;
  preferences: {
    includedFamilies: string[];
    excludedFamilies: string[];
  };
  weeklyHours: number;
  timezone?: string | null;
  equipment: Array<{ kind: string; note?: string }>;
  incomeGoalAmount?: number | null;
  incomeGoalCurrency: string;
  payoutCapabilities: Array<{
    rail: string;
    status: "available" | "unavailable" | "unknown";
    note?: string;
  }>;
  updatedAt: string;
}

export interface OpportunityCardDTO {
  id: string;
  title: string;
  summary?: string | null;
  platform: string;
  sourceKey: SourceKey;
  provenance: "live" | "sandbox-fixture" | "user-submitted";
  canonicalUrl: string;
  opportunityType?: string | null;
  workMode?: string | null;
  status: "active" | "stale" | "expired";
  firstSeenAt: string;
  lastSeenAt: string;
  observedAt: string;
  expiresAt?: string | null;
  eligibility: EligibilityAssessment;
  economics: EconomicsEstimate;
  saved: boolean;
  applicationStatus?: ApplicationStatus | null;
  /** count of other records grouped as likely duplicates (non-destructive) */
  duplicateCount: number;
  rankingPolicy: "provider-order-only" | "hop3-allowed" | "none";
}

export interface SourceConnectionDTO {
  key: SourceKey;
  displayName: string;
  sourceKind: string;
  accessMode: string;
  actorModes: string[];
  operations: Record<string, OperationCapability>;
  rankingPolicy: "provider-order-only" | "hop3-allowed" | "none";
  mode: "live" | "sandbox" | "blocked" | "not-configured";
  statusMessage?: string | null;
  termsUrl?: string | null;
  termsNotes?: string | null;
  lastSyncAt?: string | null;
  lastRun?: {
    status: string;
    mode: string;
    startedAt: string;
    fetched: number;
    inserted: number;
    updated: number;
    duplicates: number;
    message?: string | null;
  } | null;
  payout: {
    methodKnown: boolean;
    methods?: string[];
    threshold?: string;
    fees?: string;
    cadence?: string;
    evidenceUrl?: string;
  };
}

export interface ApplicationDTO {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  platform: string;
  canonicalUrl: string;
  status: ApplicationStatus;
  draft?: string | null;
  draftGeneratedAt?: string | null;
  draftModel?: string | null;
  draftEditedByUser: boolean;
  submittedAt?: string | null;
  submittedChannel?: string | null;
  submittedEvidence?: string | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  amountPaid?: number | null;
  paidCurrency?: string | null;
  paymentEvidence?: string | null;
  outcomeNotes?: string | null;
  events: Array<{
    id: string;
    eventType: string;
    evidenceType?: string | null;
    evidenceUrl?: string | null;
    note?: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationDraftContent {
  checklist: string[];
  messageDraft: string;
  notice: string;
}

// ---------------------------------------------------------------------------
// Service-layer request/result shapes (consumed through IEarnService)
// ---------------------------------------------------------------------------

/** User-chosen inbox filters only — arrival order (firstSeenAt asc) is always preserved. */
export interface OpportunityFilters {
  source?: string;
  eligibility?: string;
  status?: string;
  q?: string;
}

/** Full detail: card fields + normalized specs + evidence + raw payload. */
export type OpportunityDetail = OpportunityCardDTO & {
  savedNotes?: string | null;
  eligibilitySpec?: EligibilitySpec;
  requirementsSpec?: RequirementsSpec;
  compensationSpec?: CompensationSpec;
  payoutSpec?: PayoutSpec;
  applicationSpec?: ApplicationSpec;
  timeSpec?: TimeSpec;
  riskFlags?: string[];
  raw?: unknown;
  evidence?: {
    platform?: string | null;
    canonicalUrl?: string | null;
    sourceName?: string | null;
    sourceRecordId?: string | null;
    sourceStatus?: string | null;
    observedAt?: string | null;
    firstSeenAt?: string | null;
    lastSeenAt?: string | null;
  };
};

/** Result of recording one user-submitted link. */
export interface IntakeResult {
  opportunityId: string;
  /** false when the same link was already recorded */
  created: boolean;
  fetchNote: string;
}

/** Profile write input; the service validates bounds and rejects invalid input. */
export interface EarnProfileInput {
  displayName?: string;
  countryCode?: string;
  regionNote?: string;
  workMode: string;
  languages: Array<{ code: string; proficiency: string; note?: string }>;
  skills: Array<{ name: string; experienceBand: string; evidenceNote?: string }>;
  qualifications: Array<{
    type: string;
    issuer?: string;
    year?: string;
    verificationState: string;
  }>;
  equipment: Array<{ kind: string; note?: string }>;
  payoutCapabilities: Array<{
    rail: string;
    status: "available" | "unavailable" | "unknown";
    note?: string;
  }>;
  preferences: {
    includedFamilies: string[];
    excludedFamilies: string[];
  };
  weeklyHours: number;
  timezone?: string | null;
  incomeGoalAmount?: number | null;
  incomeGoalCurrency: string;
}

/** Event record input — the only path by which application states change. */
export interface RecordEventInput {
  eventType: string;
  evidenceType?: "user-reported" | "provider-confirmed" | "payment-confirmed";
  evidenceUrl?: string;
  note?: string;
  channel?: string;
  amountPaid?: number;
  paidCurrency?: string;
}

/**
 * Mutation result across the RPC boundary: raw errors never cross the
 * channel; failures return their honest reason instead.
 */
export type ApplicationMutationResult =
  | { ok: true; application: ApplicationDTO }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Shared honesty constants (locale-invariant contract data)
// ---------------------------------------------------------------------------

export const ECONOMICS_DISCLAIMER =
  "Estimate only — not a guarantee. Unknown costs remain unknown; taxes are not calculated and this is not tax or income advice.";

export const PAYOUT_UNKNOWN_DISCLAIMER =
  "Payout compatibility for your country is unknown unless a country-specific source proves it. A global payment-method list is not proof.";

export const NO_AUTO_SUBMIT_NOTICE =
  "Hop3 never submits applications automatically. You review every material, submit on the provider platform yourself, and record what happened.";

export const USER_SUBMITTED_LABEL =
  "User-submitted link — employer, source and requirements are unverified until checked.";

export const SANDBOX_FIXTURE_LABEL =
  "Sandbox fixture — deterministic test data, clearly not a live listing. Never presented as live.";
