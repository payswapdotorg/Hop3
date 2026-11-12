/**
 * Hop3 Earn — opportunity detail sections (Stage 1 UI port).
 *
 * The evidence panel is always visible, never collapsed; structured spec
 * sections render only what the source actually exposed — unstated fields
 * say "not stated" (an explicit label, never a guess).
 */

import * as React from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion.js";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { NO_AUTO_SUBMIT_NOTICE } from "@zcode/shared";
import type {
  DimensionResult,
  OpportunityDetail,
  ProfileDTO,
} from "@zcode/shared";

import { useFormat } from "./useFormat.js";
import { DataRow, QueryError } from "./common.js";
import { EconomicsBreakdown, PayoutUnknownNotice } from "./economics.js";
import {
  DimensionValueBadge,
  FreshnessBadge,
  ProvenanceBadge,
  SUCCESS_OUTLINE,
  WARNING_OUTLINE,
} from "./badges.js";

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

export function NotStated() {
  const { intl } = useZCodeIntl();
  return <span className="text-ui-xs text-foreground-subtle">{intl.formatMessage({ id: "earn.detail.notStated" })}</span>;
}

/** Wraps spec sections: skeleton while loading, honest error with retry. */
export function SpecSection({
  loading,
  error,
  retry,
  children,
  label,
}: {
  loading: boolean;
  error: boolean;
  retry: () => void;
  children: React.ReactNode;
  label: string;
}) {
  const { intl } = useZCodeIntl();
  if (loading) {
    return (
      <div role="status" className="space-y-2">
        <span className="sr-only">{label}</span>
        <div aria-hidden="true" className="motion-safe:animate-pulse h-4 w-2/3 rounded-md bg-surface" />
        <div aria-hidden="true" className="motion-safe:animate-pulse h-4 w-1/2 rounded-md bg-surface" />
        <div aria-hidden="true" className="motion-safe:animate-pulse h-4 w-3/4 rounded-md bg-surface" />
      </div>
    );
  }
  if (error) {
    return (
      <QueryError
        title={intl.formatMessage({ id: "earn.detail.specUnavailable" })}
        message={intl.formatMessage({ id: "earn.detail.specUnavailableMessage" })}
        onRetry={retry}
      />
    );
  }
  return <div className="space-y-3 text-ui-sm">{children}</div>;
}

function skillCoverage(
  skill: string,
  profile: ProfileDTO | null | undefined,
): "covered" | "missing" | "unknown" {
  if (!profile) return "unknown";
  const target = skill.trim().toLowerCase();
  if (!target) return "unknown";
  const names = profile.skills
    .map((s) => s.name.trim().toLowerCase())
    .filter((n) => n.length > 0);
  return names.some((n) => n === target || n.includes(target) || target.includes(n))
    ? "covered"
    : "missing";
}

function SkillChip({ skill, profile }: { skill: string; profile: ProfileDTO | null | undefined }) {
  const { intl } = useZCodeIntl();
  const coverage = skillCoverage(skill, profile);
  if (coverage === "covered") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" tabIndex={0} className={SUCCESS_OUTLINE}>{skill}</Badge>
        </TooltipTrigger>
        <TooltipContent>{intl.formatMessage({ id: "earn.detail.skillCovered" })}</TooltipContent>
      </Tooltip>
    );
  }
  if (coverage === "missing") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" tabIndex={0} className={WARNING_OUTLINE}>{skill}</Badge>
        </TooltipTrigger>
        <TooltipContent>{intl.formatMessage({ id: "earn.detail.skillMissing" })}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0}>{skill}</Badge>
      </TooltipTrigger>
      <TooltipContent>{intl.formatMessage({ id: "earn.detail.skillCoverageUnknown" })}</TooltipContent>
    </Tooltip>
  );
}

export function CopyUrlButton({ text }: { text: string }) {
  const { intl } = useZCodeIntl();
  const [copied, setCopied] = React.useState(false);

  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // clipboard unavailable — ignore
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      aria-label={intl.formatMessage({ id: "earn.detail.copyUrl" })}
      onClick={onCopy}
    >
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
    </Button>
  );
}

function CompensationBasisBadge({ basis }: { basis?: "fixed" | "estimated" | "unknown" }) {
  const { intl } = useZCodeIntl();
  switch (basis) {
    case "fixed":
      return <Badge variant="outline" className={SUCCESS_OUTLINE}>{intl.formatMessage({ id: "earn.detail.basis.fixed" })}</Badge>;
    case "estimated":
      return <Badge variant="outline" className={WARNING_OUTLINE}>{intl.formatMessage({ id: "earn.detail.basis.estimated" })}</Badge>;
    default:
      return <Badge variant="outline">{intl.formatMessage({ id: "earn.detail.basis.unknown" })}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Evidence panel — always visible, never collapsed
// ---------------------------------------------------------------------------

export function EvidencePanel({
  detail,
  platform,
  sourceKey,
  canonicalUrl,
  provenance,
  observedAt,
  firstSeenAt,
  lastSeenAt,
}: {
  detail: OpportunityDetail | null;
  platform: string;
  sourceKey: string;
  canonicalUrl: string;
  provenance: "live" | "sandbox-fixture" | "user-submitted";
  observedAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
}) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const evidence = detail?.evidence;
  const sourceStatus = evidence?.sourceStatus ?? null;
  const sourceRecordId = evidence?.sourceRecordId ?? null;
  const riskFlags = detail?.riskFlags ?? [];

  const openListingLabel = intl.formatMessage({ id: "earn.common.openSourceListing" });

  return (
    <section className="rounded-lg border border-border" aria-label={intl.formatMessage({ id: "earn.detail.evidence" })}>
      <header className="border-b border-border px-3 py-2 text-ui-xs font-medium">
        {intl.formatMessage({ id: "earn.detail.evidence" })}
      </header>
      <dl className="px-3 py-1">
        <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.platform" })}>
          {platform}
        </DataRow>
        <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.source" })}>
          {format.sourceLabel(sourceKey)}
        </DataRow>
        <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.listingLink" })}>
          <a
            href={canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-success underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            aria-label={openListingLabel}
          >
            {openListingLabel}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </DataRow>
        <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.canonicalUrl" })}>
          <div className="flex min-w-0 items-center gap-1">
            <code className="block truncate font-mono text-ui-xs">{canonicalUrl}</code>
            <CopyUrlButton text={canonicalUrl} />
          </div>
        </DataRow>
        {sourceRecordId ? (
          <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.sourceRecordId" })}>
            <code className="font-mono text-ui-xs">{sourceRecordId}</code>
          </DataRow>
        ) : null}
        <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.observedAt" })}>
          {format.absoluteTime(observedAt)}{" "}
          <span className="text-ui-xs text-foreground-subtle">({format.relativeTime(observedAt)})</span>
        </DataRow>
        <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.firstSeen" })}>
          {format.absoluteTime(firstSeenAt)}
        </DataRow>
        <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.lastSeen" })}>
          {format.absoluteTime(lastSeenAt)}
        </DataRow>
        <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.sourceStatus" })}>
          {sourceStatus ?? intl.formatMessage({ id: "earn.detail.sourceStatus.notReported" })}
        </DataRow>
        <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.provenance" })}>
          <ProvenanceBadge provenance={provenance} />
        </DataRow>
        {riskFlags.length > 0 ? (
          <DataRow label={intl.formatMessage({ id: "earn.detail.evidenceRow.riskFlags" })}>
            <div className="flex flex-wrap gap-1.5">
              {riskFlags.map((flag, i) => (
                <Badge key={i} variant="outline" className="border-destructive/40 text-destructive">
                  {flag}
                </Badge>
              ))}
            </div>
          </DataRow>
        ) : null}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Eligibility table
// ---------------------------------------------------------------------------

export function EligibilityTable({
  dimensions,
}: {
  dimensions: Array<{ label: string; dim: DimensionResult }>;
}) {
  const { intl } = useZCodeIntl();
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full table-fixed text-ui-xs">
        <thead className="bg-surface text-foreground-subtle">
          <tr>
            <th scope="col" className="h-8 px-2 text-left font-medium">
              {intl.formatMessage({ id: "earn.detail.eligibilityTable.dimension" })}
            </th>
            <th scope="col" className="h-8 px-2 text-left font-medium">
              {intl.formatMessage({ id: "earn.detail.eligibilityTable.value" })}
            </th>
            <th scope="col" className="h-8 px-2 text-left font-medium">
              {intl.formatMessage({ id: "earn.detail.eligibilityTable.reason" })}
            </th>
          </tr>
        </thead>
        <tbody>
          {dimensions.map(({ label, dim }) => (
            <tr key={label} className="border-t border-border">
              <td className="px-2 py-2 align-top font-medium">{label}</td>
              <td className="px-2 py-2 align-top">
                <DimensionValueBadge value={dim.value} />
              </td>
              <td className="px-2 py-2 align-top text-foreground-subtle">{dim.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Structured spec sections (accordion content)
// ---------------------------------------------------------------------------

export interface DetailSectionProps {
  detail: OpportunityDetail | null;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  loadingLabel: string;
}

/** Requirements section. */
export function RequirementsSection({
  detail,
  loading,
  failed,
  retry,
  loadingLabel,
  profile,
}: DetailSectionProps & { profile: ProfileDTO | null }) {
  const { intl } = useZCodeIntl();
  const requirements = detail?.requirementsSpec;
  return (
    <SpecSection loading={loading} error={failed} retry={retry} label={loadingLabel}>
      <div className="space-y-2">
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "earn.detail.requirements.skills" })}
        </p>
        {requirements?.skills && requirements.skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {requirements.skills.map((skill, i) => (
              <SkillChip key={`${skill}-${i}`} skill={skill} profile={profile} />
            ))}
          </div>
        ) : (
          <NotStated />
        )}
      </div>
      <div className="space-y-1">
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "earn.detail.requirements.experience" })}
        </p>
        <p>{requirements?.experience ?? intl.formatMessage({ id: "earn.detail.notStated" })}</p>
      </div>
      <div className="space-y-1">
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "earn.detail.requirements.equipment" })}
        </p>
        {requirements?.equipment && requirements.equipment.length > 0 ? (
          <ul className="list-disc pl-4 text-ui-xs">
            {requirements.equipment.map((eq, i) => (
              <li key={i}>{eq}</li>
            ))}
          </ul>
        ) : (
          <NotStated />
        )}
      </div>
      <div className="space-y-1">
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "earn.detail.requirements.schedule" })}
        </p>
        <p>{requirements?.schedule ?? intl.formatMessage({ id: "earn.detail.notStated" })}</p>
      </div>
      <div className="space-y-1">
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "earn.detail.requirements.languages" })}
        </p>
        {requirements?.languages && requirements.languages.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {requirements.languages.map((lang, i) => (
              <Badge key={i} variant="outline">{lang}</Badge>
            ))}
          </div>
        ) : (
          <NotStated />
        )}
      </div>
    </SpecSection>
  );
}

/** Eligibility section (assessment + spec notes). */
export function EligibilitySection({
  detail,
  loading,
  failed,
  retry,
  loadingLabel,
  eligibilityDims,
  unknowns,
  nextSteps,
}: DetailSectionProps & {
  eligibilityDims: Array<{ label: string; dim: DimensionResult }>;
  unknowns: string[];
  nextSteps: string[];
}) {
  const { intl } = useZCodeIntl();
  const eligibilitySpec = detail?.eligibilitySpec;
  return (
    <SpecSection loading={loading} error={failed} retry={retry} label={loadingLabel}>
      {eligibilityDims.length > 0 ? (
        <EligibilityTable dimensions={eligibilityDims} />
      ) : (
        <NotStated />
      )}
      {unknowns.length > 0 ? (
        <div className="space-y-1">
          <p className="text-ui-xs font-medium text-warning">
            {intl.formatMessage({ id: "earn.badge.unknowns" })}
          </p>
          <ul className="list-disc pl-4 text-ui-xs text-foreground-subtle">
            {unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {nextSteps.length > 0 ? (
        <div className="space-y-1">
          <p className="text-ui-xs font-medium">
            {intl.formatMessage({ id: "earn.badge.nextSteps" })}
          </p>
          <ul className="space-y-1">
            {nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-1.5 text-ui-xs text-foreground-subtle">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {eligibilitySpec?.notes ? (
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage(
            { id: "earn.detail.eligibility.sourceNotes" },
            { notes: eligibilitySpec.notes },
          )}
        </p>
      ) : null}
    </SpecSection>
  );
}

/** Application section. */
export function ApplicationSection({
  detail,
  loading,
  failed,
  retry,
  loadingLabel,
}: DetailSectionProps) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const applicationSpec = detail?.applicationSpec;
  return (
    <SpecSection loading={loading} error={failed} retry={retry} label={loadingLabel}>
      <div className="space-y-1">
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "earn.detail.application.steps" })}
        </p>
        {applicationSpec?.steps && applicationSpec.steps.length > 0 ? (
          <ol className="list-decimal space-y-0.5 pl-4 text-ui-xs">
            {applicationSpec.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        ) : (
          <NotStated />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui-xs">
        <span>
          <span className="text-foreground-subtle">
            {intl.formatMessage({ id: "earn.detail.application.closingDate" })}
          </span>{" "}
          {applicationSpec?.closingDate
            ? format.absoluteTime(applicationSpec.closingDate)
            : intl.formatMessage({ id: "earn.detail.notStated" })}
        </span>
        {applicationSpec?.qualificationTest ? (
          <Badge variant="outline" className={WARNING_OUTLINE}>
            {intl.formatMessage({ id: "earn.detail.application.qualificationTest" })}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui-xs">
        <span>
          <span className="text-foreground-subtle">
            {intl.formatMessage({ id: "earn.detail.application.cost" })}
          </span>{" "}
          {applicationSpec?.applicationCost?.amount != null
            ? format.formatMoney(
                applicationSpec.applicationCost.amount,
                applicationSpec.applicationCost.currency,
              )
            : intl.formatMessage({ id: "earn.detail.notStated" })}
          {applicationSpec?.applicationCost?.note
            ? ` — ${applicationSpec.applicationCost.note}`
            : ""}
        </span>
        {applicationSpec?.connects != null ? (
          <span>
            <span className="text-foreground-subtle">
              {intl.formatMessage({ id: "earn.detail.application.connects" })}
            </span>{" "}
            {applicationSpec.connects}
          </span>
        ) : null}
      </div>
      <div className="space-y-1">
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "earn.detail.application.requiredData" })}
        </p>
        {applicationSpec?.requiredData && applicationSpec.requiredData.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {applicationSpec.requiredData.map((d, i) => (
              <Badge key={i} variant="outline">{d}</Badge>
            ))}
          </div>
        ) : (
          <NotStated />
        )}
      </div>
    </SpecSection>
  );
}

/** Compensation & payout section (gross never collapsed into net). */
export function CompensationSection({
  detail,
  loading,
  failed,
  retry,
  loadingLabel,
  economics,
}: DetailSectionProps & { economics: OpportunityDetail["economics"] }) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const compensation = detail?.compensationSpec;
  const payout = detail?.payoutSpec;
  return (
    <SpecSection loading={loading} error={failed} retry={retry} label={loadingLabel}>
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {intl.formatMessage({ id: "earn.detail.compensation.gross" })}{" "}
          {format.formatMoneyRange(
            compensation?.grossMin ?? economics.grossMin,
            compensation?.grossMax ?? economics.grossMax,
            compensation?.currency ?? economics.currency,
          )}{" "}
          {format.payUnitLabel(compensation?.payUnit ?? economics.payUnit)}
        </span>
        <CompensationBasisBadge basis={compensation?.fixedOrEstimated} />
      </div>
      {compensation?.conditions ? (
        <p className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage(
            { id: "earn.detail.compensation.conditions" },
            { conditions: compensation.conditions },
          )}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <p className="text-ui-xs font-medium">
          {intl.formatMessage({ id: "earn.detail.compensation.payout" })}
        </p>
        {payout?.methodKnown ? (
          <div className="space-y-1 text-ui-xs">
            <p>
              <span className="text-foreground-subtle">
                {intl.formatMessage({ id: "earn.sources.payout.methods" })}
              </span>{" "}
              {payout.methods && payout.methods.length > 0
                ? payout.methods.join(", ")
                : intl.formatMessage({ id: "earn.detail.notStated" })}
            </p>
            {payout.threshold ? (
              <p>
                <span className="text-foreground-subtle">
                  {intl.formatMessage({ id: "earn.sources.payout.threshold" })}
                </span>{" "}
                {format.formatMoney(payout.threshold.amount, payout.threshold.currency)}
              </p>
            ) : null}
            {payout.fees ? (
              <p>
                <span className="text-foreground-subtle">
                  {intl.formatMessage({ id: "earn.sources.payout.fees" })}
                </span>{" "}
                {payout.fees}
              </p>
            ) : null}
            {payout.cadence ? (
              <p>
                <span className="text-foreground-subtle">
                  {intl.formatMessage({ id: "earn.sources.payout.cadence" })}
                </span>{" "}
                {payout.cadence}
              </p>
            ) : null}
            {payout.evidenceUrl ? (
              <a
                href={payout.evidenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-success underline underline-offset-2"
              >
                {intl.formatMessage({ id: "earn.sources.payout.evidence" })}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ) : (
          <PayoutUnknownNotice />
        )}
      </div>

      <EconomicsBreakdown economics={economics} />
    </SpecSection>
  );
}

/** Time section. */
export function TimeSection({ detail, loading, failed, retry, loadingLabel }: DetailSectionProps) {
  const { intl } = useZCodeIntl();
  const format = useFormat();
  const timeSpec = detail?.timeSpec;
  const notStated = intl.formatMessage({ id: "earn.detail.notStated" });
  const hoursText =
    timeSpec?.hoursMin != null || timeSpec?.hoursMax != null
      ? timeSpec.hoursMin != null && timeSpec.hoursMax != null
        ? `${timeSpec.hoursMin}–${timeSpec.hoursMax}`
        : timeSpec.hoursMin != null
          ? format.fromValue(String(timeSpec.hoursMin))
          : format.upToValue(String(timeSpec.hoursMax))
      : notStated;
  return (
    <SpecSection loading={loading} error={failed} retry={retry} label={loadingLabel}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-ui-xs sm:grid-cols-2">
        <p>
          <span className="text-foreground-subtle">
            {intl.formatMessage({ id: "earn.detail.time.hours" })}
          </span>{" "}
          {hoursText}
        </p>
        <p>
          <span className="text-foreground-subtle">
            {intl.formatMessage({ id: "earn.detail.time.deadline" })}
          </span>{" "}
          {timeSpec?.deadline ? format.absoluteTime(timeSpec.deadline) : notStated}
        </p>
        <p>
          <span className="text-foreground-subtle">
            {intl.formatMessage({ id: "earn.detail.time.duration" })}
          </span>{" "}
          {timeSpec?.duration ?? notStated}
        </p>
        <p>
          <span className="text-foreground-subtle">
            {intl.formatMessage({ id: "earn.detail.time.shifts" })}
          </span>{" "}
          {timeSpec?.shifts ?? notStated}
        </p>
        <p>
          <span className="text-foreground-subtle">
            {intl.formatMessage({ id: "earn.detail.time.timezone" })}
          </span>{" "}
          {timeSpec?.timezone ?? notStated}
        </p>
      </div>
    </SpecSection>
  );
}

/** The always-visible no-auto-submit alert closing the detail body. */
export function NoAutoSubmitAlert() {
  const { intl } = useZCodeIntl();
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-surface px-3 py-2 text-ui-sm text-warning-surface-foreground"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium">
          {intl.formatMessage({ id: "earn.detail.noAutoSubmitTitle" })}
        </p>
        <p className="text-ui-xs">{NO_AUTO_SUBMIT_NOTICE}</p>
      </div>
    </div>
  );
}

export const DETAIL_SECTION_KEYS = ["requirements", "eligibility", "application", "compensation", "time"] as const;
export type DetailSectionKey = (typeof DETAIL_SECTION_KEYS)[number];

export function sectionTitleKey(key: DetailSectionKey): string {
  switch (key) {
    case "requirements":
      return "earn.detail.sections.requirements";
    case "eligibility":
      return "earn.detail.sections.eligibility";
    case "application":
      return "earn.detail.sections.application";
    case "compensation":
      return "earn.detail.sections.compensation";
    default:
      return "earn.detail.sections.time";
  }
}
