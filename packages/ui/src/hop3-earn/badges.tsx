/**
 * Hop3 Earn — badge family for provenance, eligibility, freshness, evidence
 * levels and source modes (Stage 1 UI port).
 *
 * Color semantics (mandatory, token-based): success = positive/eligible/live,
 * warning = unknown/sandbox/caution, destructive = ineligible/expired/error,
 * neutral elsewhere. No indigo, blue or violet anywhere. The frozen honesty
 * constants (SANDBOX_FIXTURE_LABEL / USER_SUBMITTED_LABEL) render verbatim.
 */

import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SANDBOX_FIXTURE_LABEL, USER_SUBMITTED_LABEL } from "@zcode/shared";
import type {
  DimensionResult,
  EligibilityAssessment,
  EligibilityValue,
} from "@zcode/shared";

import { useFormat } from "./useFormat.js";

/** Positive outline (emerald in the reference; success token here). */
export const SUCCESS_OUTLINE = "border-success/50 text-success";
/** Positive solid. */
export const SUCCESS_SOLID = "border-transparent bg-success text-success-foreground";
/** Unknown/caution outline (amber in the reference; warning token here). */
export const WARNING_OUTLINE = "border-warning/50 text-warning";
/** Unknown/caution solid. */
export const WARNING_SOLID = "border-transparent bg-warning text-warning-foreground";
/** Positive-tinted outline button (positive action, not primary-filled). */
export const SUCCESS_BUTTON =
  "border-success/50 text-success hover:bg-success/10 hover:text-success";

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export function ProvenanceBadge({
  provenance,
}: {
  provenance: "live" | "sandbox-fixture" | "user-submitted";
}) {
  const { intl } = useZCodeIntl();
  if (provenance === "live") {
    return <Badge variant="outline" className={SUCCESS_OUTLINE}>{intl.formatMessage({ id: "earn.badge.live" })}</Badge>;
  }
  if (provenance === "sandbox-fixture") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge tabIndex={0} className={WARNING_SOLID}>
            {intl.formatMessage({ id: "earn.badge.sandbox" })}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{SANDBOX_FIXTURE_LABEL}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0}>
          {intl.formatMessage({ id: "earn.badge.submitted" })}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{USER_SUBMITTED_LABEL}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export function eligibilityLabelKey(value: EligibilityValue): string {
  switch (value) {
    case "eligible":
      return "earn.badge.eligible";
    case "ineligible":
      return "earn.badge.ineligible";
    case "needs_user_input":
      return "earn.badge.needsInput";
    default:
      return "earn.badge.unknownEligibility";
  }
}

function eligibilityClassName(value: EligibilityValue): string {
  switch (value) {
    case "eligible":
      return SUCCESS_OUTLINE;
    case "ineligible":
      return "";
    case "needs_user_input":
      return "";
    default:
      return WARNING_OUTLINE;
  }
}

export function DimensionValueBadge({ value }: { value: EligibilityValue }) {
  const { intl } = useZCodeIntl();
  switch (value) {
    case "eligible":
      return (
        <Badge variant="outline" className={SUCCESS_OUTLINE}>
          {intl.formatMessage({ id: "earn.badge.dimension.eligible" })}
        </Badge>
      );
    case "ineligible":
      return (
        <Badge variant="destructive">
          {intl.formatMessage({ id: "earn.badge.dimension.ineligible" })}
        </Badge>
      );
    case "needs_user_input":
      return (
        <Badge variant="outline">
          {intl.formatMessage({ id: "earn.badge.dimension.needsInput" })}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={WARNING_OUTLINE}>
          {intl.formatMessage({ id: "earn.badge.dimension.unknown" })}
        </Badge>
      );
  }
}

/** Per-dimension reasons, blocking reasons, unknowns and next steps. */
export function EligibilityDetails({ assessment }: { assessment: EligibilityAssessment }) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const dims: Array<{ key: "country" | "language" | "skills" | "payout"; label: string }> = [
    { key: "country", label: intl.formatMessage({ id: "earn.badge.dimension.country" }) },
    { key: "language", label: intl.formatMessage({ id: "earn.badge.dimension.language" }) },
    { key: "skills", label: intl.formatMessage({ id: "earn.badge.dimension.skills" }) },
    { key: "payout", label: intl.formatMessage({ id: "earn.badge.dimension.payout" }) },
  ];
  const rows: Array<{ label: string; dim: DimensionResult }> = [];
  for (const { key, label } of dims) {
    const dim = assessment[key];
    if (dim) rows.push({ label, dim });
  }

  return (
    <div className="space-y-3 text-ui-sm">
      <p className="font-medium">{intl.formatMessage({ id: "earn.badge.assessment" })}</p>
      <ul className="space-y-2">
        {rows.map(({ label, dim }) => (
          <li key={label} className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-ui-xs text-foreground-subtle">{label}</span>
              <DimensionValueBadge value={dim.value} />
              <span
                className={
                  dim.sourceBacked
                    ? "text-ui-xs text-success"
                    : "text-ui-xs text-foreground-subtle"
                }
              >
                {intl.formatMessage({
                  id: dim.sourceBacked ? "earn.badge.sourceBacked" : "earn.badge.notSourceBacked",
                })}
              </span>
            </div>
            <p className="text-ui-xs text-foreground-subtle">{dim.reason}</p>
          </li>
        ))}
      </ul>

      {assessment.blockingReasons && assessment.blockingReasons.length > 0 ? (
        <div className="space-y-1">
          <p className="text-ui-xs font-medium text-destructive">
            {intl.formatMessage({ id: "earn.badge.blockingReasons" })}
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-ui-xs text-destructive/90">
            {assessment.blockingReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {assessment.unknowns && assessment.unknowns.length > 0 ? (
        <div className="space-y-1">
          <p className="text-ui-xs font-medium text-warning">
            {intl.formatMessage({ id: "earn.badge.unknowns" })}
          </p>
          <ul className="list-disc space-y-0.5 pl-4 text-ui-xs text-foreground-subtle">
            {assessment.unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {assessment.nextSteps && assessment.nextSteps.length > 0 ? (
        <div className="space-y-1">
          <p className="text-ui-xs font-medium">
            {intl.formatMessage({ id: "earn.badge.nextSteps" })}
          </p>
          <ul className="space-y-1">
            {assessment.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-1.5 text-ui-xs text-foreground-subtle">
                <CheckCircle2
                  className="mt-0.5 size-3.5 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-ui-xs text-foreground-subtle">
        {intl.formatMessage(
          { id: "earn.badge.assessedAt" },
          { when: format.relativeTime(assessment.assessedAt) },
        )}
        {" · "}
        {intl.formatMessage({ id: "earn.badge.unknownNeverEligible" })}
      </p>
    </div>
  );
}

/** Eligibility badge; clicking shows per-dimension reasons in a popover. */
export function EligibilityBadge({ assessment }: { assessment: EligibilityAssessment }) {
  const { intl } = useZCodeIntl();
  const label = intl.formatMessage({ id: eligibilityLabelKey(assessment.overall) });
  const variant = assessment.overall === "ineligible" ? "destructive" : "outline";
  const ariaLabel = intl.formatMessage(
    { id: "earn.badge.eligibilityAria" },
    { value: label },
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label={ariaLabel}
        >
          <Badge variant={variant} className={eligibilityClassName(assessment.overall)}>
            {label}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <EligibilityDetails assessment={assessment} />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

export function FreshnessBadge({
  status,
  expiresAt,
}: {
  status: "active" | "stale" | "expired";
  expiresAt?: string | null;
}) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  if (status === "expired") {
    return <Badge variant="destructive">{intl.formatMessage({ id: "earn.badge.expired" })}</Badge>;
  }
  const days = format.daysUntil(expiresAt);
  if (days != null && days < 0) {
    return <Badge variant="destructive">{intl.formatMessage({ id: "earn.badge.expired" })}</Badge>;
  }
  if (days != null && days <= 3) {
    return days === 0 ? (
      <Badge variant="destructive">
        {intl.formatMessage({ id: "earn.badge.closesToday" })}
      </Badge>
    ) : (
      <Badge variant="destructive">
        {intl.formatMessage({ id: "earn.badge.closesInDays" }, { days })}
      </Badge>
    );
  }
  if (status === "stale") {
    return (
      <Badge variant="outline" className={WARNING_OUTLINE}>
        {intl.formatMessage({ id: "earn.badge.stale" })}
      </Badge>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Evidence levels
// ---------------------------------------------------------------------------

export function EvidenceLevelBadge({ level }: { level?: string | null }) {
  const { intl } = useZCodeIntl();
  if (level === "provider-confirmed") {
    return (
      <Badge variant="outline" className={SUCCESS_OUTLINE}>
        {intl.formatMessage({ id: "earn.badge.evidence.providerConfirmed" })}
      </Badge>
    );
  }
  if (level === "payment-confirmed") {
    return (
      <Badge className={SUCCESS_SOLID}>
        {intl.formatMessage({ id: "earn.badge.evidence.paymentConfirmed" })}
      </Badge>
    );
  }
  if (level === "user-reported") {
    return (
      <Badge variant="outline">
        {intl.formatMessage({ id: "earn.badge.evidence.userReported" })}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      {intl.formatMessage({ id: "earn.badge.evidence.notRecorded" })}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Source connection mode
// ---------------------------------------------------------------------------

export function SourceModeBadge({
  mode,
}: {
  mode: "live" | "sandbox" | "blocked" | "not-configured";
}) {
  const { intl } = useZCodeIntl();
  switch (mode) {
    case "live":
      return (
        <Badge variant="outline" className={SUCCESS_OUTLINE}>
          {intl.formatMessage({ id: "earn.badge.mode.live" })}
        </Badge>
      );
    case "sandbox":
      return (
        <Badge className={WARNING_SOLID}>
          {intl.formatMessage({ id: "earn.badge.mode.sandbox" })}
        </Badge>
      );
    case "blocked":
      return (
        <Badge variant="destructive">
          {intl.formatMessage({ id: "earn.badge.mode.blocked" })}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          {intl.formatMessage({ id: "earn.badge.mode.notConfigured" })}
        </Badge>
      );
  }
}
